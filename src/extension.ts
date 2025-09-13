import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';

export interface FileChange {
  filePath: string;
  newContent: string;
}

export function parseLLMResponse(text: string): FileChange[] {
  const results: FileChange[] = [];
  const fileMarkerPattern = /^<!-- FILE: (.*?) -->/gm;

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

    const codeBlockStartIndex = contentSlice.indexOf('```');
    const codeBlockEndIndex = contentSlice.lastIndexOf('```');

    if (codeBlockStartIndex !== -1 && codeBlockEndIndex > codeBlockStartIndex) {
      const rawBlockContent = contentSlice.substring(codeBlockStartIndex + 3, codeBlockEndIndex);
      const firstNewlineIndex = rawBlockContent.indexOf('\n');
      
      if (firstNewlineIndex !== -1) {
        const newContent = rawBlockContent.substring(firstNewlineIndex + 1);
        results.push({
          filePath: markers[i].filePath,
          newContent: newContent,
        });
      }
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
        let newContent = change.newContent.replace(/\r\n/g, '\n');
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

  private _updateContext(): void {
    vscode.commands.executeCommand('setContext', 'llm-patcher.hasChanges', this._changes.length > 0);
  }

  setChanges(changes: FileChange[]): void {
    this._changes = changes;
    this._updateContext();
    this._onDidChangeTreeData.fire();
  }

  removeChange(change: FileChange): void {
    this._changes = this._changes.filter(c => c !== change);
    this._updateContext();
    this._onDidChangeTreeData.fire();
  }

  clear(): void {
    this._changes = [];
    this._updateContext();
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
  // --- FIX: Implement onDidChange event ---
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly provider: FileChangeProvider) {}

  // --- FIX: Add a method to fire the event ---
  public notifyChanges(scheme: string, changes: FileChange[]) {
    for (const change of changes) {
      const uri = vscode.Uri.parse(`${scheme}:/${change.filePath}`);
      this._onDidChange.fire(uri);
    }
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    const path = uri.path.startsWith('/') ? uri.path.substring(1) : uri.path;
    const change = this.provider.getChanges().find(c => c.filePath === path);
    if (change) {
        return change.newContent;
    }
    return `// Change for "${path}" is no longer available.\n// It may have been applied or discarded.`;
  }
}

class InputViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _changeProvider: FileChangeProvider,
    // --- FIX: Pass content provider for notifications ---
    private readonly _contentProvider: FileChangeContentProvider,
    private readonly _scheme: string
  ) {}

  public clearInput() {
    const oldChanges = this._changeProvider.getChanges();
    this._changeProvider.clear();
    this._context.workspaceState.update('llm-patcher.lastInput', '');
    this._view?.webview.postMessage({ command: 'restoreState', text: '' });
    // --- FIX: Notify that old changes are now invalid ---
    this._contentProvider.notifyChanges(this._scheme, oldChanges);
  }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
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
          this._runPreview(message.text);
          return;
        case 'saveState':
          this._context.workspaceState.update('llm-patcher.lastInput', message.text);
          return;
        case 'clear':
          this.clearInput();
          return;
      }
    });
  }

  public async pasteAndPreview() {
    const text = await vscode.env.clipboard.readText();
    this._view?.webview.postMessage({ command: 'restoreState', text });
    this._context.workspaceState.update('llm-patcher.lastInput', text);
    this._runPreview(text);
  }

  private _runPreview(text: string) {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('LLM Patcher: Please open a folder in the workspace.');
      return;
    }
    // --- FIX: Get old changes before updating ---
    const oldChanges = this._changeProvider.getChanges();
    const parsed = parseLLMResponse(text);
    const normalized = normalizeChanges(parsed);
    if (normalized.length === 0 && text.trim().length > 0) {
      vscode.window.showInformationMessage('LLM Patcher: No valid file changes found in input.');
    }
    this._changeProvider.setChanges(normalized);

    // --- FIX: Notify about old and new changes to refresh all relevant diffs ---
    const allAffectedChanges = [...oldChanges, ...normalized];
    const uniquePaths = [...new Set(allAffectedChanges.map(c => c.filePath))];
    const uniqueChanges = uniquePaths.map(p => ({ filePath: p, newContent: '' })); // Content doesn't matter here
    this._contentProvider.notifyChanges(this._scheme, uniqueChanges);

    if (normalized.length > 0) {
      vscode.commands.executeCommand('llm-patcher-changes-view.focus');
    }
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

          textarea.addEventListener('paste', () => {
            setTimeout(() => {
                const text = textarea.value;
                vscode.postMessage({ command: 'saveState', text: text });
                vscode.postMessage({ command: 'previewChanges', text: text });
            }, 0);
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

async function applySingleChange(change: FileChange): Promise<vscode.Uri> {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        throw new Error("No workspace folder is open. Please open a folder to apply changes.");
    }
    const root = vscode.workspace.workspaceFolders[0].uri;
    const fileUri = vscode.Uri.joinPath(root, change.filePath);

    const parentUri = vscode.Uri.joinPath(fileUri, '..');
    await vscode.workspace.fs.createDirectory(parentUri);

    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(change.newContent, 'utf8'));
    
    return fileUri;
}

export function activate(context: vscode.ExtensionContext) {
  vscode.commands.executeCommand('setContext', 'llm-patcher.hasChanges', false);

  const scheme = 'llm-patcher';
  const fileChangeProvider = new FileChangeProvider();
  // --- FIX: Instantiate content provider and pass it to the input view ---
  const fileChangeContentProvider = new FileChangeContentProvider(fileChangeProvider);
  
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(scheme, fileChangeContentProvider));
  vscode.window.createTreeView('llm-patcher-changes-view', { treeDataProvider: fileChangeProvider });

  const inputViewProvider = new InputViewProvider(context, fileChangeProvider, fileChangeContentProvider, scheme);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('llm-patcher-input-view', inputViewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('llm-patcher.applyFromClipboard', async () => {
      await inputViewProvider.pasteAndPreview();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('llm-patcher.previewChange', async (item: FileChangeItem) => {
      if (!vscode.workspace.workspaceFolders) { return; }
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

export function deactivate() {}
