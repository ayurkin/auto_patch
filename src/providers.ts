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

  findChange(filePath: string): FileChange | undefined {
    const isCaseInsensitive = process.platform === 'win32' || process.platform === 'darwin';
    const lowerFilePath = filePath.toLowerCase();

    return this._changes.find(c => {
      if (isCaseInsensitive) {
        return c.filePath.toLowerCase() === lowerFilePath;
      }
      return c.filePath === filePath;
    });
  }

  updateChangeContent(filePath: string, newContent: string): void {
    const change = this.findChange(filePath);
    if (change && change.newContent !== newContent) {
      change.newContent = newContent;
    }
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
    let fileUri: vscode.Uri | undefined;
    // First, resolve the workspace URI. If this fails, show a warning with the actual error.
    try {
      fileUri = resolveWorkspaceFileUri(element.change.filePath);
      element.resourceUri = fileUri; // Allow VS Code to render file icons/themes automatically.
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      element.iconPath = new vscode.ThemeIcon('warning');
      element.tooltip = message;
      return element;
    }

    // If the URI resolved, check if the file exists. If not, indicate it will be created.
    try {
      await vscode.workspace.fs.stat(fileUri);
      element.tooltip = undefined;
    } catch {
      element.iconPath = new vscode.ThemeIcon('new-file');
      element.tooltip = 'File does not exist and will be created.';
    }
    return element;
  }
}

export class AutoPatchFileSystemProvider implements vscode.FileSystemProvider {
  private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this._onDidChangeFile.event;

  constructor(private readonly provider: FileChangeProvider) {}

  private _getDecodedPath(uri: vscode.Uri): string {
    const encodedPath = uri.path.startsWith('/') ? uri.path.substring(1) : uri.path;
    try {
      return decodeURIComponent(encodedPath);
    } catch {
      return encodedPath;
    }
  }

  public notifyChanges(scheme: string, changes: FileChange[]) {
    const events: vscode.FileChangeEvent[] = [];
    const seen = new Set<string>();
    for (const change of changes) {
      if (seen.has(change.filePath)) {
        continue;
      }
      seen.add(change.filePath);
      const uri = toVirtualDocumentUri(scheme, change.filePath);
      events.push({ type: vscode.FileChangeType.Changed, uri });
    }
    if (events.length > 0) {
      this._onDidChangeFile.fire(events);
    }
  }

  watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
    // Watching is not needed for this use case.
    return new vscode.Disposable(() => {});
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const filePath = this._getDecodedPath(uri);
    const change = this.provider.findChange(filePath);

    if (change) {
      return {
        type: vscode.FileType.File,
        ctime: Date.now(),
        mtime: Date.now(),
        size: Buffer.from(change.newContent, 'utf8').length,
      };
    }
    throw vscode.FileSystemError.FileNotFound(uri);
  }

  readFile(uri: vscode.Uri): Uint8Array {
    const filePath = this._getDecodedPath(uri);
    const change = this.provider.findChange(filePath);
    if (change) {
      return Buffer.from(change.newContent, 'utf8');
    }
    throw vscode.FileSystemError.FileNotFound(uri);
  }

  writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean }): void {
    const filePath = this._getDecodedPath(uri);
    const newContent = Buffer.from(content).toString('utf8');
    this.provider.updateChangeContent(filePath, newContent);
    this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  // The following methods are not required for this extension's functionality.
  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    throw vscode.FileSystemError.Unavailable('readDirectory is not available');
  }
  createDirectory(uri: vscode.Uri): void {
    throw vscode.FileSystemError.Unavailable('createDirectory is not available');
  }
  delete(uri: vscode.Uri, options: { recursive: boolean }): void {
    throw vscode.FileSystemError.Unavailable('delete is not available');
  }
  rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void {
    throw vscode.FileSystemError.Unavailable('rename is not available');
  }
}
