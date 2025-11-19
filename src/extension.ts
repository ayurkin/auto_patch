import * as vscode from 'vscode';
import { FileChangeProvider, AutoPatchFileSystemProvider } from './providers';
import { InputViewProvider } from './webview';
import { registerCommands } from './commands';

export function activate(context: vscode.ExtensionContext) {
  vscode.commands.executeCommand('setContext', 'auto-patch.hasChanges', false);

  const scheme = 'auto-patch';
  const fileChangeProvider = new FileChangeProvider();
  const fileSystemProvider = new AutoPatchFileSystemProvider(fileChangeProvider);

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(scheme, fileSystemProvider, {
      isCaseSensitive: process.platform !== 'win32' && process.platform !== 'darwin',
    })
  );

  const treeView = vscode.window.createTreeView('auto-patch-changes-view', { treeDataProvider: fileChangeProvider });
  context.subscriptions.push(treeView);

  const inputViewProvider = new InputViewProvider(context, fileChangeProvider, fileSystemProvider, scheme);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('auto-patch-input-view', inputViewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Register all commands
  registerCommands(context, fileChangeProvider, fileSystemProvider, inputViewProvider, scheme);
}

export function deactivate() {}
