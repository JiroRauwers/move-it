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
  const startDir = path.dirname(currentFilePath);
  const targetDir = path.join(startDir, currentRelativePath);
  const items: FilePickItem[] = [];

  try {
    // Get workspace root if it exists
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
      vscode.Uri.file(currentFilePath)
    );
    const workspaceRoot = workspaceFolder?.uri.fsPath;

    // Check if we can go up (we can if we're not at workspace root)
    const canGoUp = workspaceRoot
      ? // If we have a workspace, check if we're still within it
        targetDir.startsWith(workspaceRoot) && targetDir !== workspaceRoot
      : // If no workspace, check if we're still within the starting directory
        targetDir.startsWith(startDir) && targetDir !== startDir;

    if (canGoUp) {
      const parentDir = path.dirname(targetDir);
      let parentPath = "";

      if (currentRelativePath) {
        // If we have a relative path, just go up one level in it
        parentPath = path.dirname(currentRelativePath);
        if (parentPath === ".") parentPath = "";
      } else {
        // Calculate relative path from start directory
        parentPath = path.relative(startDir, parentDir);
      }

      // Normalize path for display
      const normalizedParentPath = parentPath.replace(/\\/g, "/");
      const displayPath = normalizedParentPath || "parent directory";

      items.push({
        label: "$(arrow-up) $(folder-opened) ..",
        description: `Go to ${displayPath}`,
        type: "parent",
        relativePath: normalizedParentPath,
      });
    }

    // Read directory contents
    const dirents = await vscode.workspace.fs.readDirectory(
      vscode.Uri.file(targetDir)
    );

    // Filter and sort items based on search text
    const searchLower = searchText.toLowerCase();

    // Add directories first
    const directories = dirents
      .filter(
        ([name, type]) =>
          type === vscode.FileType.Directory &&
          (!searchText || name.toLowerCase().includes(searchLower))
      )
      .map(([name]) => ({
        label: `$(folder) ${name}`,
        description: "Directory",
        type: "directory" as const,
        relativePath: path.join(currentRelativePath, name).replace(/\\/g, "/"),
        absolutePath: path.join(targetDir, name),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    items.push(...directories);

    // Add matching files
    const files = dirents
      .filter(
        ([name, type]) =>
          type === vscode.FileType.File &&
          /\.(ts|tsx|js|jsx)$/.test(name) &&
          path.join(targetDir, name) !== currentFilePath &&
          (!searchText || name.toLowerCase().includes(searchLower))
      )
      .map(([name]) => {
        const extension = path.extname(name);
        const fileIcon =
          extension === ".tsx" || extension === ".jsx"
            ? "$(react)"
            : "$(typescript)";
        const relativePath = path
          .join(currentRelativePath, name)
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

    // Add "New File" option with suggested name
    const newFileName = createNewFileName(searchText);
    items.push({
      label: "$(new-file) New File",
      description: `Create '${newFileName}' in ${
        currentRelativePath || "current directory"
      }`,
      type: "new",
      relativePath: path
        .join(currentRelativePath, newFileName)
        .replace(/\\/g, "/"),
    });
  } catch (error) {
    console.error("Error reading directory:", error);
    vscode.window.showErrorMessage(`Error reading directory: ${error}`);
  }

  return items;
}

/**
 * Creates a new file name based on search text or default
 */
function createNewFileName(searchText: string): string {
  let newFileName = searchText || "types.ts";
  if (!newFileName.includes(".")) {
    newFileName += ".ts";
  }
  if (!/\.(ts|tsx|js|jsx)$/.test(newFileName)) {
    newFileName = newFileName.replace(/\.[^/.]+$/, "") + ".ts";
  }
  return newFileName;
}
