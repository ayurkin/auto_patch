import * as assert from 'assert';
import { parseLLMResponse } from '../../extension';

suite('parseLLMResponse Suite with START/END format', () => {
  test('should parse a single file change correctly', () => {
    const input = `
      Some introductory text.
      <!-- FILE_START: src/main.ts -->
      \`\`\`typescript
      console.log("hello world");
      \`\`\`
      <!-- FILE_END: src/main.ts -->
      Some concluding text.
    `;
    const expected = [{ filePath: 'src/main.ts', newContent: 'console.log("hello world");' }];
    assert.deepStrictEqual(parseLLMResponse(input), expected);
  });

  test('should parse multiple file changes correctly', () => {
    const input = `
      <!-- FILE_START: file1.txt -->
      \`\`\`
      content1
      \`\`\`
      <!-- FILE_END: file1.txt -->
      Some text in between.
      <!-- FILE_START: file2.txt -->
      \`\`\`
      content2
      \`\`\`
      <!-- FILE_END: file2.txt -->
    `;
    const expected = [
      { filePath: 'file1.txt', newContent: 'content1' },
      { filePath: 'file2.txt', newContent: 'content2' },
    ];
    assert.deepStrictEqual(parseLLMResponse(input), expected);
  });

  test('should handle file paths with spaces', () => {
    const input = `
      <!-- FILE_START: src/my folder/main.ts -->
      \`\`\`
      content
      \`\`\`
      <!-- FILE_END: src/my folder/main.ts -->
    `;
    const expected = [{ filePath: 'src/my folder/main.ts', newContent: 'content' }];
    assert.deepStrictEqual(parseLLMResponse(input), expected);
  });

  test('should handle empty content block', () => {
    const input = `
      <!-- FILE_START: empty.txt -->
      \`\`\`
      \`\`\`
      <!-- FILE_END: empty.txt -->
    `;
    const expected = [{ filePath: 'empty.txt', newContent: '' }];
    assert.deepStrictEqual(parseLLMResponse(input), expected);
  });

  test('should handle different line endings (CRLF)', () => {
    const input =
      '<!-- FILE_START: crlf.txt -->\r\n' +
      '```\r\n' +
      'line1\r\n' +
      'line2\r\n' +
      '```\r\n' +
      '<!-- FILE_END: crlf.txt -->';
    const expected = [{ filePath: 'crlf.txt', newContent: 'line1\nline2' }];
    assert.deepStrictEqual(parseLLMResponse(input), expected);
  });

  test('should return an empty array for input with no markers', () => {
    const input = 'Just some random text without any file markers.';
    assert.deepStrictEqual(parseLLMResponse(input), []);
  });

  test('should handle extra whitespace around markers and blocks', () => {
    const input = `

        <!-- FILE_START: spaced.txt -->

      \`\`\`

      spaced content

      \`\`\`

        <!-- FILE_END: spaced.txt -->

    `;
    const expected = [{ filePath: 'spaced.txt', newContent: 'spaced content' }];
    assert.deepStrictEqual(parseLLMResponse(input), expected);
  });

  test('should handle code blocks containing ```', () => {
    const input = `
      <!-- FILE_START: doc.md -->
      \`\`\`markdown
      Here is an example of a code block:
      \`\`\`
      console.log("hello");
      \`\`\`
      Isn't that neat?
      \`\`\`
      <!-- FILE_END: doc.md -->
    `;
    const expectedContent =
      'Here is an example of a code block:\n' +
      '```\n' +
      'console.log("hello");\n' +
      '```\n' +
      "Isn't that neat?";
    const expected = [{ filePath: 'doc.md', newContent: expectedContent }];
    assert.deepStrictEqual(parseLLMResponse(input), expected);
  });

  test('should ignore incomplete blocks (missing end tag)', () => {
    const input = `
      <!-- FILE_START: incomplete.txt -->
      \`\`\`
      this won't be parsed
      \`\`\`
    `;
    assert.deepStrictEqual(parseLLMResponse(input), []);
  });

  test('should ignore blocks where start and end tags do not match', () => {
    const input = `
      <!-- FILE_START: file1.txt -->
      \`\`\`
      content
      \`\`\`
      <!-- FILE_END: file2.txt -->
    `;
    assert.deepStrictEqual(parseLLMResponse(input), []);
  });

  test('should handle language identifiers in code blocks', () => {
    const input = `
      <!-- FILE_START: script.js -->
      \`\`\`javascript
      const x = 1;
      \`\`\`
      <!-- FILE_END: script.js -->
    `;
    const expected = [{ filePath: 'script.js', newContent: 'const x = 1;' }];
    assert.deepStrictEqual(parseLLMResponse(input), expected);
  });
});
