import * as vscode from 'vscode';

export interface FileChange {
  filePath: string;
  newContent: string;
}

export function parseLLMResponse(text: string): FileChange[] {
  const results: FileChange[] = [];
  const pattern = /<!-- FILE: (.*?) -->\s*```(?:[a-z]+)?\s*([\s\S]*?)\s*```/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const filePath = match[1].trim();
    const newContent = match[2];
    results.push({ filePath, newContent });
  }
  return results;
}

class FileChangeItem extends vscode.TreeItem {
  constructor(public readonly change: FileChange) {
    super(change.filePath, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'fileChange';
    this.command = {
      command: 'llm-patcher.previewChange',
      title: 'Preview Changes',
      arguments: [this],
    };
  }
}

class FileChangeProvider implements vscode.TreeDataProvider<FileChangeItem> {
  private _changes: FileChange[] = [];
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  setChanges(changes: FileChange[]): void {
    this._changes = changes;
    this._onDidChangeTreeData.fire();
  }

  removeChange(change: FileChange): void {
    this._changes = this._changes.filter(c => c !== change);
    this._onDidChangeTreeData.fire();
  }

  clear(): void {
    this._changes = [];
    this._onDidChangeTreeData.fire();
  }

  getChanges(): FileChange[] {
    return this._changes;
  }

  getChildren(): FileChangeItem[] {
    return this._changes.map(c => new FileChangeItem(c));
  }

  async getTreeItem(element: FileChangeItem): Promise<vscode.TreeItem> {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]) {
      const root = vscode.workspace.workspaceFolders[0].uri;
      const fileUri = vscode.Uri.joinPath(root, element.change.filePath);
      try {
        await vscode.workspace.fs.stat(fileUri);
      } catch {
        element.iconPath = new vscode.ThemeIcon('new-file');
        element.tooltip = 'File does not exist and will be created.';
      }
    }
    return element;
  }
}

class FileChangeContentProvider implements vscode.TextDocumentContentProvider {
  constructor(private readonly provider: FileChangeProvider) {}
  onDidChange?: vscode.Event<vscode.Uri> | undefined;
  provideTextDocumentContent(uri: vscode.Uri): string {
    const path = uri.path.startsWith('/') ? uri.path.substring(1) : uri.path;
    const change = this.provider.getChanges().find(c => c.filePath === path);
    return change ? change.newContent : '';
  }
}

class InputViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly _extensionUri: vscode.Uri, private readonly _changeProvider: FileChangeProvider) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(message => {
      switch (message.command) {
        case 'previewChanges':
          if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('LLM Patcher: Please open a folder in the workspace.');
            return;
          }
          const parsed = parseLLMResponse(message.text);
          if (parsed.length === 0) {
            vscode.window.showInformationMessage('LLM Patcher: No valid file changes found in input.');
          }
          this._changeProvider.setChanges(parsed);
          return;
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview.css'));
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${stylesUri}" rel="stylesheet">
        <title>LLM Patcher Input</title>
      </head>
      <body>
        <textarea id="llm-response" placeholder="Paste LLM response here..."></textarea>
        <button id="preview-button">Preview Changes</button>
        <script>
          const vscode = acquireVsCodeApi();
          document.getElementById('preview-button').addEventListener('click', () => {
            const text = document.getElementById('llm-response').value;
            vscode.postMessage({ command: 'previewChanges', text: text });
          });
        </script>
      </body>
      </html>
    `;
  }
}

export function activate(context: vscode.ExtensionContext) {
  const fileChangeProvider = new FileChangeProvider();
  const scheme = 'llm-patcher';
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(scheme, new FileChangeContentProvider(fileChangeProvider)));
  vscode.window.createTreeView('llm-patcher-changes-view', { treeDataProvider: fileChangeProvider });

  const inputViewProvider = new InputViewProvider(context.extensionUri, fileChangeProvider);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('llm-patcher-input-view', inputViewProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('llm-patcher.applyFromClipboard', async () => {
      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('LLM Patcher: Please open a folder in the workspace.');
        return;
      }
      const text = await vscode.env.clipboard.readText();
      const parsed = parseLLMResponse(text);
      if (parsed.length === 0) {
        vscode.window.showInformationMessage('LLM Patcher: No valid file changes found in clipboard.');
        return;
      }
      fileChangeProvider.setChanges(parsed);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('llm-patcher.previewChange', async (item: FileChangeItem) => {
      const root = vscode.workspace.workspaceFolders![0].uri;
      const fileUri = vscode.Uri.joinPath(root, item.change.filePath);
      const previewUri = vscode.Uri.parse(`${scheme}:/${item.change.filePath}`);
      try {
        await vscode.workspace.fs.stat(fileUri);
        await vscode.commands.executeCommand('vscode.diff', fileUri, previewUri, `${item.change.filePath} (Preview)`);
      } catch {
        await vscode.window.showTextDocument(previewUri);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('llm-patcher.applyChange', async (item: FileChangeItem) => {
      const root = vscode.workspace.workspaceFolders![0].uri;
      const fileUri = vscode.Uri.joinPath(root, item.change.filePath);
      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(item.change.newContent, 'utf8'));
      await vscode.window.showTextDocument(fileUri);
      fileChangeProvider.removeChange(item.change);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('llm-patcher.discardChange', (item: FileChangeItem) => {
      fileChangeProvider.removeChange(item.change);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('llm-patcher.applyAll', async () => {
      for (const change of [...fileChangeProvider.getChanges()]) {
        await vscode.commands.executeCommand('llm-patcher.applyChange', new FileChangeItem(change));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('llm-patcher.discardAll', () => {
      fileChangeProvider.clear();
    })
  );
}

export function deactivate() {}

