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
        element.iconPath = new vscode.ThemeIcon('warning');
        element.tooltip = 'File not found. Applying will create a new file.';
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

export function activate(context: vscode.ExtensionContext) {
  const provider = new FileChangeProvider();
  const scheme = 'llm-patcher';
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(scheme, new FileChangeContentProvider(provider)));
  vscode.window.createTreeView('llm-patcher-view', { treeDataProvider: provider });

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
      provider.setChanges(parsed);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('llm-patcher.previewChange', async (item: FileChangeItem) => {
      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        return;
      }
      const root = vscode.workspace.workspaceFolders[0].uri;
      const fileUri = vscode.Uri.joinPath(root, item.change.filePath);
      const previewUri = vscode.Uri.parse(`${scheme}:/${item.change.filePath}`);
      await vscode.commands.executeCommand('vscode.diff', fileUri, previewUri, item.change.filePath);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('llm-patcher.applyChange', async (item: FileChangeItem) => {
      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        return;
      }
      const root = vscode.workspace.workspaceFolders[0].uri;
      const fileUri = vscode.Uri.joinPath(root, item.change.filePath);
      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(item.change.newContent, 'utf8'));
      await vscode.window.showTextDocument(fileUri);
      provider.removeChange(item.change);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('llm-patcher.discardChange', (item: FileChangeItem) => {
      provider.removeChange(item.change);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('llm-patcher.applyAll', async () => {
      for (const change of [...provider.getChanges()]) {
        await vscode.commands.executeCommand('llm-patcher.applyChange', new FileChangeItem(change));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('llm-patcher.discardAll', () => {
      provider.clear();
    })
  );
}

export function deactivate() {}
