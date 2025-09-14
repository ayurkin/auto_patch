import { FileChange } from './types';

/**
 * Cleans up common indentation issues and normalizes line endings from content
 * extracted from markdown. It finds the common minimum indentation across all
 * non-empty lines and removes it. All line endings are normalized to LF ('\n').
 * @param text The raw extracted text content.
 * @returns Text with common leading whitespace removed, line endings normalized, and trimmed.
 */
function cleanupContent(text: string): string {
    const lines = text.split(/\r?\n/);

    // Find minimum indentation of non-empty lines
    const nonEmptyLines = lines.filter(line => line.trim() !== '');
    if (nonEmptyLines.length === 0) {
        return ''; // Content is empty or only whitespace
    }

    const minIndent = nonEmptyLines
        .map(line => line.match(/^\s*/)![0].length)
        .reduce((min, len) => Math.min(min, len), Infinity);

    let dedentedLines = lines;
    // Only dedent if there is a common indentation greater than 0
    if (minIndent > 0 && minIndent !== Infinity) {
        dedentedLines = lines.map(line => line.substring(minIndent));
    }
    
    // Re-join with LF ('\n') to normalize line endings, then trim the whole block.
    return dedentedLines.join('\n').trim();
}

export function parseLLMResponse(text: string): FileChange[] {
  const results: FileChange[] = [];

  // This regex is designed for the FILE_START and FILE_END block format.
  // Key changes from previous versions:
  // - `([\s\S]*?)`: Non-greedily captures the content.
  // - The `\r?\n` before the closing ``` is removed and handled by `\s*` to
  //   correctly parse blocks with empty content.
  const pattern = /<!-- FILE_START: (.*?) -->\s*```[^\r\n]*\r?\n([\s\S]*?)\s*```\s*<!-- FILE_END: \1 -->/g;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    // match[2] contains the raw content from between the code fences.
    // This is passed to cleanupContent which handles normalization, dedenting, and trimming.
    const rawContent = match[2];
    const cleanedContent = cleanupContent(rawContent);

    results.push({
      filePath: match[1].trim(),
      newContent: cleanedContent,
    });
  }

  return results;
}