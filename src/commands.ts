import * as vscode from 'vscode';
import { FileChangeProvider, FileChangeItem, FileChangeContentProvider } from './providers';
import { InputViewProvider } from './webview';
import { applySingleChange, resolveWorkspaceFileUri, toVirtualDocumentUri } from './utils';

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

export function registerCommands(
  context: vscode.ExtensionContext,
  fileChangeProvider: FileChangeProvider,
  fileChangeContentProvider: FileChangeContentProvider,
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
      try {
        const fileUri = await applySingleChange(item.change);
        fileChangeProvider.removeChange(item.change);
        fileChangeContentProvider.notifyChanges(scheme, [item.change]);
        await vscode.window.showTextDocument(fileUri);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to apply change to ${item.change.filePath}: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('auto-patch.discardChange', (item: FileChangeItem) => {
      if (!ensureFileChangeItem(item, 'Discard Change')) {
        return;
      }
      fileChangeProvider.removeChange(item.change);
      fileChangeContentProvider.notifyChanges(scheme, [item.change]);
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
          const applied: typeof changes = [];

          for (const change of changes) {
            const increment = (1 / total) * 100;
            progress.report({ message: `Applying ${change.filePath}`, increment });

            try {
              await applySingleChange(change);
              fileChangeProvider.removeChange(change);
              applied.push(change);
              appliedCount++;
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              vscode.window.showErrorMessage(
                `Failed to apply change to ${change.filePath}: ${message}. Aborting remaining changes.`
              );
              failed = true;
              break;
            }
          }

          if (applied.length > 0) {
            fileChangeContentProvider.notifyChanges(scheme, applied);
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
}