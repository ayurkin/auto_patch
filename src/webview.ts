import * as vscode from 'vscode';
import { FileChangeProvider, FileChangeContentProvider } from './providers';
import { parseLLMResponse } from './parser';
import { normalizeChanges, getNonce } from './utils';

export class InputViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _changeProvider: FileChangeProvider,
    private readonly _contentProvider: FileChangeContentProvider,
    private readonly _scheme: string
  ) {}

  /**
   * Discards all pending changes from the tree view and updates any open diff views.
   * This does not clear the input text area.
   */
  public discardChanges() {
    const oldChanges = this._changeProvider.getChanges();
    if (oldChanges.length > 0) {
      this._changeProvider.clear();
      // Notify the content provider that the virtual documents for the old changes are now invalid.
      this._contentProvider.notifyChanges(this._scheme, oldChanges);
    }
  }

  /**
   * Clears the input text area and discards all pending changes.
   */
  public clearInput() {
    this.discardChanges();
    this._context.workspaceState.update('auto-patch.lastInput', '');
    this._view?.webview.postMessage({ command: 'restoreState', text: '' });
  }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._context.extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    const lastState = this._context.workspaceState.get('auto-patch.lastInput', '');
    webviewView.webview.postMessage({ command: 'restoreState', text: lastState });

    webviewView.webview.onDidReceiveMessage(message => {
      switch (message.command) {
        case 'previewChanges':
          this._runPreview(message.text);
          return;
        case 'saveState':
          this._context.workspaceState.update('auto-patch.lastInput', message.text);
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
    this._context.workspaceState.update('auto-patch.lastInput', text);
    this._runPreview(text);
  }

  private _runPreview(text: string) {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('Auto Patch: Please open a folder in the workspace.');
      return;
    }
    const oldChanges = this._changeProvider.getChanges();
    const parsed = parseLLMResponse(text);
    const normalized = normalizeChanges(parsed);
    if (normalized.length === 0 && text.trim().length > 0) {
      vscode.window.showInformationMessage('Auto Patch: No valid file changes found in input.');
    }
    this._changeProvider.setChanges(normalized);

    // Notify VS Code about all files that might have been affected (old ones removed, new ones added)
    // to ensure any open diff views are correctly updated.
    const allAffectedChanges = [...oldChanges, ...normalized];
    const uniquePaths = [...new Set(allAffectedChanges.map(c => c.filePath))];
    const uniqueChanges = uniquePaths.map(p => ({ filePath: p, newContent: '' })); // Content doesn't matter here
    this._contentProvider.notifyChanges(this._scheme, uniqueChanges);

    if (normalized.length > 0) {
      vscode.commands.executeCommand('auto-patch-changes-view.focus');
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
        <title>Auto Patch Input</title>
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
          let debounceTimeout;

          // Function to trigger a preview
          const runPreview = (text) => {
            vscode.postMessage({ command: 'saveState', text: text });
            vscode.postMessage({ command: 'previewChanges', text: text });
          };

          // Listen for typing and trigger a debounced preview
          textarea.addEventListener('input', () => {
            const text = textarea.value;
            vscode.postMessage({ command: 'saveState', text: text }); // Save state immediately on input
            
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
              vscode.postMessage({ command: 'previewChanges', text: text });
            }, 500); // 500ms debounce delay
          });

          // Listen for paste and trigger an immediate preview
          textarea.addEventListener('paste', () => {
            clearTimeout(debounceTimeout); // Cancel any pending debounced preview
            setTimeout(() => {
              runPreview(textarea.value);
            }, 0); // Use setTimeout to allow paste to complete
          });

          document.getElementById('preview-button').addEventListener('click', () => {
            clearTimeout(debounceTimeout);
            runPreview(textarea.value);
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
