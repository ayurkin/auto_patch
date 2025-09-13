import * as vscode from 'vscode';
import * as os from 'os';

export interface FileChange {
  filePath: string;
  newContent: string;
}

export function parseLLMResponse(text: string): FileChange[] {
  const results: FileChange[] = [];
  const fileMarkerPattern = /<!-- FILE: (.*?) -->/g;
  const codeBlockPattern = /```(?:[a-z]+)?\s*([\s\S]*?)\s*```/;

  const markers = [];
  let match;
  while ((match = fileMarkerPattern.exec(text)) !== null) {
    markers.push({
      filePath: match[1].trim(),
      startIndex: match.index,
      markerLength: match[0].length,
    });
  }

  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].startIndex + markers[i].markerLength;
    const end = i + 1 < markers.length ? markers[i + 1].startIndex : text.length;
    const contentSlice = text.substring(start, end);

    const codeMatch = contentSlice.match(codeBlockPattern);
    if (codeMatch) {
      results.push({
        filePath: markers[i].filePath,
        newContent: codeMatch[1],
      });
    }
  }

  return results;
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function normalizeChanges(changes: FileChange[]): FileChange[] {
    let eol = vscode.workspace.getConfiguration('files').get('eol', 'auto');
    if (eol === 'auto') {
        eol = os.EOL;
    }

    return changes.map(change => {
        // First, normalize all line endings to LF (\n)
        let newContent = change.newContent.replace(/\r\n/g, '\n');
        // Then, convert to the target EOL
        if (eol === '\r\n') {
            newContent = newContent.replace(/\n/g, '\r\n');
        }
        return { ...change, newContent };
    });
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
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _changeProvider: FileChangeProvider
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._context.extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    const lastState = this._context.workspaceState.get('llm-patcher.lastInput', '');
    webviewView.webview.postMessage({ command: 'restoreState', text: lastState });

    webviewView.webview.onDidReceiveMessage(message => {
      switch (message.command) {
        case 'previewChanges':
          if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('LLM Patcher: Please open a folder in the workspace.');
            return;
          }
          const parsed = parseLLMResponse(message.text);
          const normalized = normalizeChanges(parsed);
          if (normalized.length === 0) {
            vscode.window.showInformationMessage('LLM Patcher: No valid file changes found in input.');
          }
          this._changeProvider.setChanges(normalized);
          return;
        case 'saveState':
          this._context.workspaceState.update('llm-patcher.lastInput', message.text);
          return;
        case 'clear':
          this._changeProvider.clear();
          this._context.workspaceState.update('llm-patcher.lastInput', '');
          this._view?.webview.postMessage({ command: 'restoreState', text: '' });
          return;
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'resources', 'webview.css'));
    const nonce = getNonce();

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${stylesUri}" rel="stylesheet">
        <title>LLM Patcher Input</title>
      </head>
      <body>
        <textarea id="llm-response" placeholder="Paste LLM response here..."></textarea>
        <div class="button-container">
          <button id="preview-button">Preview Changes</button>
          <button id="clear-button">Clear</button>
        </div>
        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
          const textarea = document.getElementById('llm-response');

          textarea.addEventListener('input', () => {
            vscode.postMessage({ command: 'saveState', text: textarea.value });
          });

          document.getElementById('preview-button').addEventListener('click', () => {
            vscode.postMessage({ command: 'previewChanges', text: textarea.value });
          });

          document.getElementById('clear-button').addEventListener('click', () => {
            vscode.postMessage({ command: 'clear' });
          });

          window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'restoreState') {
              textarea.value = message.text;
              textarea.focus();
            }
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

  const inputViewProvider = new InputViewProvider(context, fileChangeProvider);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('llm-patcher-input-view', inputViewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('llm-patcher.applyFromClipboard', async () => {
      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('LLM Patcher: Please open a folder in the workspace.');
        return;
      }
      const text = await vscode.env.clipboard.readText();
      const parsed = parseLLMResponse(text);
      const normalized = normalizeChanges(parsed);
      if (normalized.length === 0) {
        vscode.window.showInformationMessage('LLM Patcher: No valid file changes found in clipboard.');
        return;
      }
      fileChangeProvider.setChanges(normalized);
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
