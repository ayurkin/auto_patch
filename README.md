# Auto Patch

Apply code changes from a Large Language Model (LLM) response directly from your clipboard into your VS Code workspace.

## Features

*   **Clipboard Integration**: Instantly parse and preview changes by pasting from your clipboard with a single click.
*   **Diff Preview**: Review changes for each file in a familiar side-by-side diff view before applying.
*   **Selective Application**: Apply or discard changes on a file-by-file basis.
*   **Bulk Actions**: Apply or discard all pending changes at once.
*   **New File Creation**: Automatically creates new files and necessary parent directories.
*   **Intuitive UI**: Manage changes from a dedicated view in the Activity Bar.

## How to Use

There are two main workflows to apply changes.

### Workflow 1: Paste from Clipboard (Recommended)

1.  Copy the full response from your LLM, including the special `<!-- FILE_START: ... -->` and `<!-- FILE_END: ... -->` markers and code blocks.
2.  Click the **Auto Patch** icon in the VS Code Activity Bar.
3.  In the **Input** view's title bar (top right), click the **Paste from Clipboard and Preview** (`$(clippy)`) icon.
4.  The LLM response will be parsed, and the proposed file changes will automatically appear in the **Changes** view below.

### Workflow 2: Manual Paste

1.  Copy the LLM response.
2.  Open the **Auto Patch** view.
3.  Paste the response into the text area in the **Input** view.
4.  The changes will be previewed automatically. If you edit the text, you can click the **Preview Changes** button to re-parse the input.

### Reviewing and Applying

Once the files are listed in the **Changes** view:
*   **Single-click** a file to see a diff preview comparing the current file with the proposed changes.
*   **Apply a single file:** Hover over the file name and click the **Apply Change** (`$(check)`) icon.
*   **Discard a single file:** Hover over the file name and click the **Discard Change** (`$(x)`) icon.
*   **Apply all files:** Use the **Apply All Changes** (`$(check-all)`) icon in the title bar of the **Changes** view.
*   **Discard all files:** Use the **Discard All Changes** (`$(trash)`) icon, also in the **Changes** view title bar.

## Example LLM Response Format

The extension parses text that contains special markers to identify file paths and content. Each file block must start with `<!-- FILE_START: path/to/file.ext -->` and end with `<!-- FILE_END: path/to/file.ext -->`. The file path in the start and end markers must match exactly.

Here is an example of a valid response you can copy from an LLM:

> I've identified two files that need changes to implement the feature.
>
> First, we need to update the main application file to register the new service.
>
> <!-- FILE_START: src/app.ts -->
> ```typescript
> import { OldService } from './old-service';
> import { NewService } from './new-service';
>
> function main() {
>   // const service = new OldService();
>   const service = new NewService(); // Use the new service
>   service.run();
> }
>
> main();
> ```
> <!-- FILE_END: src/app.ts -->
>
> Next, here is the implementation of the new service itself. This is a new file.
>
> <!-- FILE_START: src/new-service.ts -->
> ```typescript
> export class NewService {
>   run() {
>     console.log('New service is running!');
>   }
> }
> ```
> <!-- FILE_END: src/new-service.ts -->
>
> These changes should accomplish the task. Let me know if you have any other questions!

The extension will correctly identify `src/app.ts` and the new file `src/new-service.ts` and queue them in the "Changes" view for you to review and apply.