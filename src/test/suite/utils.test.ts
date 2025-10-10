import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { normalizeChanges, sanitizeFilePath, toVirtualDocumentUri } from '../../utils';

suite('utils helpers', () => {
  const tempDir = path.join(process.cwd(), 'tmp-test-files');

  suiteSetup(() => {
    fs.mkdirSync(tempDir, { recursive: true });
  });

  suiteTeardown(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

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
      { filePath: 'tmp-test-files/new-file.ts', newContent: "console.log('hi');" },
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
      { filePath: 'tmp-test-files/preserved-file.ts', newContent: contentWithBlankLine },
    ]);

    assert.strictEqual(normalized.newContent, contentWithBlankLine);
  });

  test('normalizeChanges mirrors existing trailing blank line when missing in new content', () => {
    const filePath = path.join(tempDir, 'existing-with-blank.txt');
    fs.writeFileSync(filePath, `console.log('existing');${os.EOL}${os.EOL}`);

    const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
    const [normalized] = normalizeChanges([
      { filePath: relativePath, newContent: "console.log('updated');" },
    ]);

    assert.strictEqual(normalized.newContent, `console.log('updated');${os.EOL}${os.EOL}`);
  });

  test('normalizeChanges does not add blank line when existing file lacks it', () => {
    const filePath = path.join(tempDir, 'existing-without-blank.txt');
    fs.writeFileSync(filePath, `console.log('existing');${os.EOL}`);

    const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
    const [normalized] = normalizeChanges([
      { filePath: relativePath, newContent: "console.log('updated');" },
    ]);

    assert.strictEqual(normalized.newContent, "console.log('updated');");
  });

  test('normalizeChanges keeps single trailing blank line when already present', () => {
    const filePath = path.join(tempDir, 'existing-with-blank-preserved.txt');
    const blankContent = `console.log('existing');${os.EOL}${os.EOL}`;
    fs.writeFileSync(filePath, blankContent);

    const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
    const updatedContent = `console.log('updated');${os.EOL}${os.EOL}`;
    const [normalized] = normalizeChanges([
      { filePath: relativePath, newContent: updatedContent },
    ]);

    assert.strictEqual(normalized.newContent, updatedContent);
  });
});
