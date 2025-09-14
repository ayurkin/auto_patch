import { FileChange } from './types';

/**
 * Cleans up common indentation issues from content extracted from markdown,
 * which can be an artifact of how template literals are formatted in tests.
 * It finds the common minimum indentation across all non-empty lines and removes it.
 * @param text The raw extracted text content.
 * @returns Text with common leading whitespace removed from all lines and trimmed.
 */
function cleanupContent(text: string): string {
    const lines = text.split('\n');
    if (lines.length === 0) {
        return text;
    }

    // Find minimum indentation of non-empty lines
    const nonEmptyLines = lines.filter(line => line.trim() !== '');
    if (nonEmptyLines.length === 0) {
        return text.trim();
    }

    const minIndent = nonEmptyLines
        .map(line => line.match(/^\s*/)![0].length)
        .reduce((min, len) => Math.min(min, len), Infinity);

    if (minIndent === Infinity || minIndent === 0) {
        return text.trim();
    }

    // Remove the common indentation from all lines
    const dedentedLines = lines.map(line => line.substring(minIndent));
    
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
    // The non-greedy capture might include a final newline before the closing fence.
    // We remove it to get the clean content.
    const rawContent = match[2].replace(/\r?\n$/, '');
    
    // Clean up indentation artifacts that are common in test strings or LLM outputs.
    const cleanedContent = cleanupContent(rawContent);

    results.push({
      filePath: match[1].trim(),
      newContent: cleanedContent,
    });
  }

  return results;
}

