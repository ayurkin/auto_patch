import * as vscode from 'vscode';
import { FileChangeProvider, FileChangeContentProvider } from './providers';
import { InputViewProvider } from './webview';
import { registerCommands } from './commands';

// Re-export parseLLMResponse for backward compatibility with tests
export { parseLLMResponse } from './parser';
export { FileChange } from './types';

export function activate(context: vscode.ExtensionContext) {
  vscode.commands.executeCommand('setContext', 'auto-patch.hasChanges', false);

  const scheme = 'auto-patch';
  const fileChangeProvider = new FileChangeProvider();
  const fileChangeContentProvider = new FileChangeContentProvider(fileChangeProvider);
  
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(scheme, fileChangeContentProvider));
  vscode.window.createTreeView('auto-patch-changes-view', { treeDataProvider: fileChangeProvider });

  const inputViewProvider = new InputViewProvider(context, fileChangeProvider, fileChangeContentProvider, scheme);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('auto-patch-input-view', inputViewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Register all commands
  registerCommands(context, fileChangeProvider, inputViewProvider, scheme);
}

export function deactivate() {}