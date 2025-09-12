# LLM Patch Applicator

VS Code extension for applying code changes from an LLM response without manual copy‑paste.

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Build the extension**
   ```bash
   npm run build
   ```
3. **Launch in VS Code**
   Open this folder in VS Code and press <kbd>F5</kbd> to open an Extension Development Host with the LLM Patcher loaded.

## Usage

1. Copy a full LLM response that contains markers of the form `<!-- FILE: path/to/file -->` followed by a Markdown code block.
2. In the Extension Development Host, run **LLM Patcher: Apply Changes from Clipboard** from the Command Palette.
3. Review the parsed files in the **LLM Patcher** view on the Activity Bar.
4. Use the inline actions to preview, apply, or discard individual changes, or the view buttons to apply or discard all.

All file paths are resolved relative to the workspace root; nonexistent files will be created when applied.

