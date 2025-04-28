import * as vscode from "vscode";
import * as path from "path";
import { FilePickItem } from "../types";

/**
 * Finds or opens a text editor for the given file
 * @param targetUri The URI of the file to find or open
 * @returns A promise that resolves to the text editor
 */
export async function findOrOpenEditor(
  targetUri: vscode.Uri
): Promise<vscode.TextEditor> {
  // Check all open text editors
  for (const editor of vscode.window.visibleTextEditors) {
    if (editor.document.uri.fsPath === targetUri.fsPath) {
      // Focus the editor group and reveal the file
      await vscode.window.showTextDocument(editor.document, {
        viewColumn: editor.viewColumn,
        preserveFocus: false,
      });
      return editor;
    }
  }

  // If not found in visible editors, check all opened documents
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.uri.fsPath === targetUri.fsPath) {
      return await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false,
      });
    }
  }

  // If not found at all, open the file
  const document = await vscode.workspace.openTextDocument(targetUri);
  return await vscode.window.showTextDocument(
    document,
    vscode.ViewColumn.Beside
  );
}

/**
 * Gets file options for the QuickPick based on the current directory and search text
 */
export async function getFileOptions(options: {
  currentFilePath: string;
  currentRelativePath: string;
  searchText: string;
}): Promise<FilePickItem[]> {
  const { currentFilePath, currentRelativePath, searchText } = options;
  const items: FilePickItem[] = [];

  try {
    // Get workspace info
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
      vscode.Uri.file(currentFilePath)
    );
    const workspaceRoot = workspaceFolder?.uri.fsPath;

    // Always use the file's directory as the base for navigation
    const fileDir = path.dirname(currentFilePath);

    // Calculate current absolute directory
    const absoluteCurrentDir = path.resolve(fileDir, currentRelativePath || "");

    // Debug logging
    console.log("Path Debug:", {
      currentFilePath,
      currentRelativePath,
      fileDir,
      absoluteCurrentDir,
      workspaceRoot,
    });

    // Check if we can go up (not at workspace root if in workspace, or not at starting directory)
    const isAtLimit = workspaceRoot
      ? path.normalize(absoluteCurrentDir).toLowerCase() ===
        path.normalize(workspaceRoot).toLowerCase()
      : path.normalize(absoluteCurrentDir).toLowerCase() ===
        path.normalize(fileDir).toLowerCase();

    if (!isAtLimit) {
      // Add parent directory option
      const parentDir = path.dirname(absoluteCurrentDir);
      const displayName = path.basename(parentDir);

      // Calculate relative path from file directory
      const relativeToFile = path.relative(fileDir, parentDir);

      // Debug logging
      console.log("Parent Directory Debug:", {
        parentDir,
        displayName,
        relativeToFile,
      });

      items.push({
        label: "$(arrow-up) $(folder-opened) ..",
        description: `Go to ${displayName}`,
        type: "parent",
        relativePath: relativeToFile.replace(/\\/g, "/"),
      });
    }

    // Read current directory contents
    const dirents = await vscode.workspace.fs.readDirectory(
      vscode.Uri.file(absoluteCurrentDir)
    );

    // Filter and sort based on search text
    const searchLower = searchText.toLowerCase();

    // Add directories
    const directories = dirents
      .filter(
        ([name, type]) =>
          type === vscode.FileType.Directory &&
          (!searchText || name.toLowerCase().includes(searchLower))
      )
      .map(([name]) => {
        // Calculate relative path from file directory
        const fullPath = path.join(absoluteCurrentDir, name);
        const relativePath = path
          .relative(fileDir, fullPath)
          .replace(/\\/g, "/");

        return {
          label: `$(folder) ${name}`,
          description: "Directory",
          type: "directory" as const,
          relativePath,
          absolutePath: fullPath,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    items.push(...directories);

    // Add TypeScript/JavaScript files
    const files = dirents
      .filter(
        ([name, type]) =>
          type === vscode.FileType.File &&
          /\.(ts|tsx|js|jsx)$/.test(name) &&
          path.join(absoluteCurrentDir, name) !== currentFilePath &&
          (!searchText || name.toLowerCase().includes(searchLower))
      )
      .map(([name]) => {
        const extension = path.extname(name);
        const fileIcon =
          extension === ".tsx" || extension === ".jsx"
            ? "$(react)"
            : "$(typescript)";

        // Calculate relative path from file directory
        const fullPath = path.join(absoluteCurrentDir, name);
        const relativePath = path
          .relative(fileDir, fullPath)
          .replace(/\\/g, "/");

        return {
          label: `${fileIcon} ${name}`,
          description: relativePath || "Current directory",
          type: "file" as const,
          relativePath,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    items.push(...files);

    // Add "New File" option
    let newFileName = searchText || "types.ts";
    if (!newFileName.includes(".")) {
      newFileName += ".ts";
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(newFileName)) {
      newFileName = newFileName.replace(/\.[^/.]+$/, "") + ".ts";
    }

    // Calculate new file path relative to file directory
    const newFilePath = path.join(absoluteCurrentDir, newFileName);
    const newFileRelativePath = path
      .relative(fileDir, newFilePath)
      .replace(/\\/g, "/");

    items.push({
      label: "$(new-file) New File",
      description: `Create '${newFileName}' in ${
        currentRelativePath || "current directory"
      }`,
      type: "new",
      relativePath: newFileRelativePath,
    });
  } catch (error) {
    console.error("Error reading directory:", error);
    vscode.window.showErrorMessage(`Error reading directory: ${error}`);
  }

  return items;
}
