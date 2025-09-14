import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { FileChange } from './types';

export function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function normalizeChanges(changes: FileChange[]): FileChange[] {
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

export async function applySingleChange(change: FileChange): Promise<vscode.Uri> {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        throw new Error("No workspace folder is open. Please open a folder to apply changes.");
    }
    const root = vscode.workspace.workspaceFolders[0].uri;
    const fileUri = vscode.Uri.joinPath(root, change.filePath);

    // Security: Ensure the file path is within the workspace folder to prevent path traversal attacks.
    const rootPath = root.fsPath;
    const filePath = fileUri.fsPath;
    const relativePath = path.relative(rootPath, filePath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error(`Path traversal detected. Attempted to write to "${change.filePath}", which is outside the workspace.`);
    }

    const parentUri = vscode.Uri.joinPath(fileUri, '..');
    await vscode.workspace.fs.createDirectory(parentUri);

    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(change.newContent, 'utf8'));
    
    return fileUri;
}