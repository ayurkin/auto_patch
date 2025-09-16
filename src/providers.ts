import * as vscode from 'vscode';
import { FileChange } from './types';
import { resolveWorkspaceFileUri, toVirtualDocumentUri } from './utils';

export class FileChangeItem extends vscode.TreeItem {
  constructor(public readonly change: FileChange) {
    super(change.filePath, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'fileChange';
    this.command = {
      command: 'auto-patch.previewChange',
      title: 'Preview Changes',
      arguments: [this],
    };
  }
}

export class FileChangeProvider implements vscode.TreeDataProvider<FileChangeItem> {
  private _changes: FileChange[] = [];
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _updateContext(): void {
    vscode.commands.executeCommand('setContext', 'auto-patch.hasChanges', this._changes.length > 0);
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
    try {
      const fileUri = resolveWorkspaceFileUri(element.change.filePath);
      await vscode.workspace.fs.stat(fileUri);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Path traversal detected')) {
        element.iconPath = new vscode.ThemeIcon('warning');
        element.tooltip = message;
      } else {
        element.iconPath = new vscode.ThemeIcon('new-file');
        element.tooltip = 'File does not exist and will be created.';
      }
    }
    return element;
  }
}

export class FileChangeContentProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly provider: FileChangeProvider) {}

  public notifyChanges(scheme: string, changes: FileChange[]) {
    const seen = new Set<string>();
    for (const change of changes) {
      if (seen.has(change.filePath)) {
        continue;
      }
      seen.add(change.filePath);
      const uri = toVirtualDocumentUri(scheme, change.filePath);
      this._onDidChange.fire(uri);
    }
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    // The path from a URI is URL-encoded (e.g., spaces become %20). We must decode it
    // to correctly match against the file path string.
    const encodedPath = uri.path.startsWith('/') ? uri.path.substring(1) : uri.path;
    let requestedPath: string;
    try {
      requestedPath = decodeURIComponent(encodedPath);
    } catch {
      requestedPath = encodedPath;
    }
    
    const isCaseInsensitive = process.platform === 'win32' || process.platform === 'darwin';

    const change = this.provider.getChanges().find(c => {
      if (isCaseInsensitive) {
        return c.filePath.toLowerCase() === requestedPath.toLowerCase();
      }
      return c.filePath === requestedPath;
    });
    
    if (change) {
      return change.newContent;
    }

    return `// Change for "${requestedPath}" is no longer available.\n// It may have been applied or discarded.`;
  }
}
