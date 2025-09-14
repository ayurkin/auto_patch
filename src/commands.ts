import * as vscode from 'vscode';
import { FileChangeProvider, FileChangeItem } from './providers';
import { InputViewProvider } from './webview';
import { applySingleChange } from './utils';

export function registerCommands(
  context: vscode.ExtensionContext,
  fileChangeProvider: FileChangeProvider,
  inputViewProvider: InputViewProvider,
  scheme: string
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('llm-patcher.applyFromClipboard', async () => {
      await inputViewProvider.pasteAndPreview();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('llm-patcher.previewChange', async (item: FileChangeItem) => {
      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) { return; }
      const root = vscode.workspace.workspaceFolders[0].uri;
      const fileUri = vscode.Uri.joinPath(root, item.change.filePath);
      const previewUri = vscode.Uri.parse(`${scheme}:/${item.change.filePath}`);
      try {
        await vscode.workspace.fs.stat(fileUri);
        await vscode.commands.executeCommand('vscode.diff', fileUri, previewUri, `${item.change.filePath} (Preview)`);
      } catch {
        await vscode.window.showTextDocument(previewUri, { preview: true });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('llm-patcher.applyChange', async (item: FileChangeItem) => {
      if (!item || !item.change) {
        vscode.window.showErrorMessage('Invalid item selected for applying change.');
        return;
      }
      try {
        const fileUri = await applySingleChange(item.change);
        fileChangeProvider.removeChange(item.change);
        await vscode.window.showTextDocument(fileUri);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to apply change to ${item.change.filePath}: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('llm-patcher.discardChange', (item: FileChangeItem) => {
      fileChangeProvider.removeChange(item.change);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('llm-patcher.applyAll', async () => {
      const changes = [...fileChangeProvider.getChanges()];
      if (changes.length === 0) {
        vscode.window.showInformationMessage('No changes to apply.');
        return;
      }

      await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "Applying LLM Changes...",
          cancellable: false
      }, async (progress) => {
          const total = changes.length;
          let appliedCount = 0;
          let failed = false;

          for (const change of changes) {
              const increment = (1 / total) * 100;
              progress.report({ message: `Applying ${change.filePath}`, increment });
              
              try {
                  await applySingleChange(change);
                  fileChangeProvider.removeChange(change);
                  appliedCount++;
              } catch (error) {
                  const message = error instanceof Error ? error.message : String(error);
                  vscode.window.showErrorMessage(`Failed to apply change to ${change.filePath}: ${message}. Aborting remaining changes.`);
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
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('llm-patcher.discardAll', () => {
      inputViewProvider.clearInput();
    })
  );
}

