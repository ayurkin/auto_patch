# Contributing to Auto Patch

If you want to contribute to the extension itself, thank you! Follow these steps to set up your development environment.

## Prerequisites

*   [Node.js and npm](https://nodejs.org/en/)
*   [Git](https://git-scm.com/)
*   [Visual Studio Code](https://code.visualstudio.com/)

## Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/ayurkin/auto_patch.git
    cd auto_patch
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Build the extension:**
    The following command compiles the TypeScript source code.
    ```bash
    npm run build
    ```
    You can also run `npm run watch` to automatically recompile on file changes.

4.  **Launch the Extension Development Host:**
    Open this folder in VS Code and press **F5**. This will open a new VS Code window with the extension loaded, where you can test your changes in a sandboxed environment.

## Packaging

To create a `.vsix` file for local installation or distribution:

1.  **Install `vsce` globally:**
    ```bash
    npm install -g @vscode/vsce
    ```

2.  **Package the extension:**
    This command will create a file like `llm-patch-applicator-0.1.0.vsix`.
    ```bash
    vsce package
    ```

You can then install this `.vsix` file in VS Code via the "Install from VSIX..." command in the Extensions view.