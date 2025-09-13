# LLM Patch Applicator

A VS Code extension for applying code changes from a Large Language Model (LLM) response without manual copy-paste.

## Installation for Daily Use

To use this extension in your main VS Code instance without publishing it, you can package it as a `.vsix` file and install it locally.

**Prerequisites:**
* [Node.js and npm](https://nodejs.org/en/)
* [Git](https://git-scm.com/)

**Steps:**

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-repo/llm-patch-applicator.git
   cd llm-patch-applicator
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Install the VS Code Extension packager (`vsce`):**
   ```bash
   npm install -g @vscode/vsce
   ```

4. **Package the extension:**
   This command will create a `.vsix` file (e.g., `llm-patch-applicator-0.1.0.vsix`).
   ```bash
   vsce package
   ```

5. **Install the extension in VS Code:**
   * Open VS Code.
   * Go to the **Extensions** view (Ctrl+Shift+X).
   * Click the **...** (More Actions) menu in the top-right corner.
   * Select **Install from VSIX...**.
   * Choose the `.vsix` file you just created.
   * Reload VS Code when prompted.

The "LLM Patcher" icon will now appear in your Activity Bar.

## How to Use

There are two main workflows to apply changes.

### Workflow 1: Paste from Clipboard (Recommended)

1.  Copy the full response from your LLM, including the special `<!-- FILE: ... -->` comments and code blocks.
2.  Click the **LLM Patcher** icon in the VS Code Activity Bar.
3.  In the **Input** view's title bar (top right), click the **Paste from Clipboard and Preview** (📋) icon.
4.  The LLM response will be pasted into the input box, and the parsed files will automatically appear in the **Changes** view below.

### Workflow 2: Manual Paste

1.  Copy the LLM response.
2.  Open the **LLM Patcher** view.
3.  Paste the response into the text area.
4.  Click the **Preview Changes** button.

### Reviewing and Applying

Once the files are listed in the **Changes** view:
*   **Single-click** a file to see a diff preview comparing the current file with the proposed changes.
*   **Apply a single file:** Hover over the file name and click the **Apply Change** (✓) icon.
*   **Discard a single file:** Hover over the file name and click the **Discard Change** (x) icon.
*   **Apply all files:** Use the **Apply All Changes** (✓✓) button in the title bar of the **Changes** view.
*   **Discard all files:** Use the **Discard All Changes** (🗑️) button, also in the **Changes** view title bar.

## For Development

If you want to contribute to the extension itself, follow these steps:

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Build the extension:**
   ```bash
   npm run build
   ```
3. **Launch the Extension Development Host:**
   Open this folder in VS Code and press **F5**. This will open a new VS Code window with the extension loaded, where you can test your changes.
   