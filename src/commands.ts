import * as vscode from 'vscode';
import { FileChangeProvider, FileChangeItem, AutoPatchFileSystemProvider } from './providers';
import { InputViewProvider } from './webview';
import { applySingleChange, resolveWorkspaceFileUri, toVirtualDocumentUri } from './utils';
import { FileChange } from './types';

/**
 * Helper to ensure commands are run on valid tree items from the "Changes" view.
 * @param item The item passed to the command.
 * @param commandTitle The user-facing name of the command for error messages.
 * @returns True if the item is a valid FileChangeItem, otherwise false.
 */
const ensureFileChangeItem = (item: any, commandTitle: string): item is FileChangeItem => {
  if (item instanceof FileChangeItem && item.change) {
    return true;
  }
  vscode.window.showWarningMessage(`'${commandTitle}' must be run on an item in the 'Changes' view.`);
  return false;
};

/**
 * Applies a single file change, updates the providers, and shows error messages.
 * @returns The URI of the applied file on success, or undefined on failure.
 */
async function applyAndRefresh(
  change: FileChange,
  fileChangeProvider: FileChangeProvider,
  fileSystemProvider: AutoPatchFileSystemProvider,
  scheme: string
): Promise<vscode.Uri | undefined> {
  try {
    const fileUri = await applySingleChange(change);
    fileChangeProvider.removeChange(change);
    fileSystemProvider.notifyChanges(scheme, [change]);
    return fileUri;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to apply change to ${change.filePath}: ${message}`);
    return undefined;
  }
}

export function registerCommands(
  context: vscode.ExtensionContext,
  fileChangeProvider: FileChangeProvider,
  fileSystemProvider: AutoPatchFileSystemProvider,
  inputViewProvider: InputViewProvider,
  scheme: string
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('auto-patch.applyFromClipboard', async () => {
      await inputViewProvider.pasteAndPreview();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('auto-patch.previewChange', async (item: FileChangeItem) => {
      if (!ensureFileChangeItem(item, 'Preview Changes')) {
        return;
      }

      let fileUri: vscode.Uri;
      try {
        fileUri = resolveWorkspaceFileUri(item.change.filePath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Auto Patch: ${message}`);
        return;
      }

      // Construct a URI with our custom scheme for the preview content.
      const previewUri = toVirtualDocumentUri(scheme, item.change.filePath);

      try {
        await vscode.workspace.fs.stat(fileUri);
        // If the file exists, show a diff view.
        await vscode.commands.executeCommand('vscode.diff', fileUri, previewUri, `${item.change.filePath} (Preview)`);
      } catch {
        // If the file does not exist, show the preview content directly.
        await vscode.window.showTextDocument(previewUri, { preview: true });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('auto-patch.applyChange', async (item: FileChangeItem) => {
      if (!ensureFileChangeItem(item, 'Apply Change')) {
        return;
      }
      const fileUri = await applyAndRefresh(item.change, fileChangeProvider, fileSystemProvider, scheme);
      if (fileUri) {
        await vscode.window.showTextDocument(fileUri);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('auto-patch.discardChange', (item: FileChangeItem) => {
      if (!ensureFileChangeItem(item, 'Discard Change')) {
        return;
      }
      fileChangeProvider.removeChange(item.change);
      fileSystemProvider.notifyChanges(scheme, [item.change]);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('auto-patch.applyAll', async () => {
      const changes = [...fileChangeProvider.getChanges()];
      if (changes.length === 0) {
        vscode.window.showInformationMessage('No changes to apply.');
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Applying LLM Changes...',
          cancellable: false,
        },
        async progress => {
          const total = changes.length;
          let appliedCount = 0;
          let failed = false;

          for (const change of changes) {
            const increment = (1 / total) * 100;
            progress.report({ message: `Applying ${change.filePath}`, increment });

            const fileUri = await applyAndRefresh(change, fileChangeProvider, fileSystemProvider, scheme);
            if (fileUri) {
              appliedCount++;
            } else {
              // Error message is shown by applyAndRefresh
              failed = true;
              break;
            }
          }

          if (appliedCount > 0) {
            const message = failed
              ? `${appliedCount} of ${total} changes applied before an error occurred.`
              : `${appliedCount} changes applied successfully.`;
            vscode.window.showInformationMessage(message);
          }
        }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('auto-patch.discardAll', () => {
      if (fileChangeProvider.getChanges().length === 0) {
        vscode.window.showInformationMessage('No changes to discard.');
        return;
      }
      inputViewProvider.discardChanges();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('auto-patch.applyChangeFromEditor', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.uri.scheme === scheme) {
        const encodedPath = editor.document.uri.path.startsWith('/')
          ? editor.document.uri.path.substring(1)
          : editor.document.uri.path;

        let filePath: string;
        try {
          filePath = decodeURIComponent(encodedPath);
        } catch {
          filePath = encodedPath;
        }

        const change = fileChangeProvider.findChange(filePath);
        if (change) {
          const fileUri = await applyAndRefresh(change, fileChangeProvider, fileSystemProvider, scheme);
          if (fileUri) {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            await vscode.window.showTextDocument(fileUri);
          }
        } else {
          vscode.window.showWarningMessage(`Could not find the change for "${filePath}". It may have already been applied or discarded.`);
        }
      }
    })
  );
}
