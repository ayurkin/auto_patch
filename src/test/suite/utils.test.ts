import * as assert from 'assert';
import * as os from 'os';
import { normalizeChanges, sanitizeFilePath, toVirtualDocumentUri } from '../../utils';

suite('utils helpers', () => {
  test('sanitizeFilePath normalizes slashes and trims whitespace', () => {
    assert.strictEqual(sanitizeFilePath(' src\\app.ts '), 'src/app.ts');
  });

  test('sanitizeFilePath collapses duplicate segments', () => {
    assert.strictEqual(sanitizeFilePath('folder//sub///file.ts'), 'folder/sub/file.ts');
  });

  test('sanitizeFilePath preserves parent directory segments', () => {
    assert.strictEqual(sanitizeFilePath('../up/file.ts'), '../up/file.ts');
  });

  test('sanitizeFilePath removes trailing slash', () => {
    assert.strictEqual(sanitizeFilePath('folder/sub/'), 'folder/sub');
  });

  test('toVirtualDocumentUri encodes special characters safely', () => {
    const uri = toVirtualDocumentUri('auto-patch', 'docs/folder name/with#hash.ts');
    assert.strictEqual(uri.scheme, 'auto-patch');

    const encodedPath = uri.path.startsWith('/') ? uri.path.slice(1) : uri.path;
    assert.strictEqual(decodeURIComponent(encodedPath), 'docs/folder name/with#hash.ts');
  });

  test('toVirtualDocumentUri can represent root-level files', () => {
    const uri = toVirtualDocumentUri('auto-patch', 'file.ts');
    assert.strictEqual(uri.path, '/file.ts');
    assert.strictEqual(uri.toString(), 'auto-patch:/file.ts');
  });

  test('normalizeChanges appends a trailing blank line', () => {
    const [normalized] = normalizeChanges([
      { filePath: 'src/file.ts', newContent: "console.log('hi');" },
    ]);

    assert.strictEqual(
      normalized.newContent,
      `console.log('hi');${os.EOL}${os.EOL}`,
      'content should end with a blank line',
    );
  });

  test('normalizeChanges preserves existing trailing blank lines', () => {
    const contentWithBlankLine = `console.log('hi');${os.EOL}${os.EOL}`;
    const [normalized] = normalizeChanges([
      { filePath: 'src/file.ts', newContent: contentWithBlankLine },
    ]);

    assert.strictEqual(normalized.newContent, contentWithBlankLine);
  });
});
