import type * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { FileChange } from './types';

function tryGetVscode(): typeof import('vscode') | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('vscode');
  } catch {
    return undefined;
  }
}

export function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function sanitizeFilePath(filePath: string): string {
  const trimmed = filePath.trim();
  if (!trimmed) {
    return '';
  }

  let normalized = path.posix.normalize(trimmed.replace(/\\/g, '/'));

  // Remove a trailing slash to avoid treating directories as files.
  normalized = normalized.replace(/\/+$/, '');

  if (normalized === '.' || normalized === '') {
    return '';
  }

  return normalized;
}

export function toVirtualDocumentUri(scheme: string, filePath: string): vscode.Uri {
  const sanitizedPath = sanitizeFilePath(filePath);
  const segments = sanitizedPath
    .split('/')
    .filter(segment => segment.length > 0)
    .map(segment => encodeURIComponent(segment));

  const encodedPath = segments.length > 0 ? `/${segments.join('/')}` : '/';
  const vs = tryGetVscode();
  if (vs) {
    return vs.Uri.parse(`${scheme}:${encodedPath}`);
  }
  const uriStr = `${scheme}:${encodedPath}`;
  const fallback = {
    scheme,
    path: encodedPath,
    toString: () => uriStr,
  } as unknown as vscode.Uri;
  return fallback;
}

export function normalizeChanges(changes: FileChange[]): FileChange[] {
  const vs = tryGetVscode();
  let eol: string | 'auto' = 'auto';
  if (vs) {
    eol = vs.workspace.getConfiguration('files').get('eol', 'auto');
  }
  if (eol === 'auto') {
    eol = os.EOL;
  }

  const normalizedChanges: FileChange[] = [];
  for (const change of changes) {
    const sanitizedPath = sanitizeFilePath(change.filePath);
    if (!sanitizedPath) {
      continue;
    }

    let newContent = change.newContent.replace(/\r\n/g, '\n');
    if (eol === '\r\n') {
      newContent = newContent.replace(/\n/g, '\r\n');
    }

    const blankLine = `${eol}${eol}`;
    if (!newContent.endsWith(blankLine)) {
      if (newContent.endsWith(eol)) {
        newContent += eol;
      } else if (newContent.length === 0) {
        newContent = blankLine;
      } else {
        newContent += blankLine;
      }
    }

    normalizedChanges.push({ ...change, filePath: sanitizedPath, newContent });
  }

  return normalizedChanges;
}

export function resolveWorkspaceFileUri(filePath: string): vscode.Uri {
  const vs = tryGetVscode();
  if (!vs || !vs.workspace.workspaceFolders || vs.workspace.workspaceFolders.length === 0) {
    throw new Error('No workspace folder is open. Please open a folder to apply changes.');
  }

  const sanitizedPath = sanitizeFilePath(filePath);
  if (!sanitizedPath) {
    throw new Error(`Invalid file path "${filePath}".`);
  }

  const root = vs.workspace.workspaceFolders[0].uri;
  const pathSegments = sanitizedPath.split('/').filter(segment => segment.length > 0);
  if (pathSegments.length === 0) {
    throw new Error(`Invalid file path "${filePath}".`);
  }

  const fileUri = vs.Uri.joinPath(root, ...pathSegments);

  // Security: Ensure the file path is within the workspace folder to prevent path traversal attacks.
  const rootPath = root.fsPath;
  const fileSystemPath = fileUri.fsPath;
  const relativePath = path.relative(rootPath, fileSystemPath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Path traversal detected. Attempted to write to "${sanitizedPath}", which is outside the workspace.`);
  }

  return fileUri;
}

export async function applySingleChange(change: FileChange): Promise<vscode.Uri> {
  const vs = tryGetVscode();
  if (!vs) {
    throw new Error('VS Code API is not available.');
  }
  const fileUri = resolveWorkspaceFileUri(change.filePath);

  const parentUri = vs.Uri.joinPath(fileUri, '..');
  await vs.workspace.fs.createDirectory(parentUri);

  await vs.workspace.fs.writeFile(fileUri, Buffer.from(change.newContent, 'utf8'));

  return fileUri;
}

