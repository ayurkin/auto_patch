import * as vscode from 'vscode';
import { FileChange } from './types';

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
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
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

export class FileChangeContentProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly provider: FileChangeProvider) {}

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