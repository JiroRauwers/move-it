import * as vscode from "vscode";
import * as path from "path";
import { findOrOpenEditor } from "./utils/file-utils";
import { insertAfterDirectivesAndComments } from "./utils/text-utils";
import { showFilePicker } from "./quickpick/file-picker";

interface FilePickItem extends vscode.QuickPickItem {
  type: "file" | "new" | "directory" | "parent";
  relativePath?: string;
  absolutePath?: string;
}

async function getFileOptions(
  currentFilePath: string,
  currentRelativePath: string = "",
  searchText: string = ""
): Promise<FilePickItem[]> {
  const startDir = path.dirname(currentFilePath);
  const targetDir = path.join(startDir, currentRelativePath);
  const items: FilePickItem[] = [];

  try {
    // Always add parent directory option except when at the workspace root
    if (currentRelativePath !== "") {
      const parentPath = path.dirname(currentRelativePath);
      items.push({
        label: "$(arrow-left) ..",
        description: parentPath || "Back to parent directory",
        type: "parent",
        relativePath: parentPath === "." ? "" : parentPath,
      });
    }

    // Read directory contents
    const dirents = await vscode.workspace.fs.readDirectory(
      vscode.Uri.file(targetDir)
    );

    // Log for debugging
    console.log("Current path:", {
      startDir,
      currentRelativePath,
      targetDir,
      hasParent: currentRelativePath !== "",
      items: items.length,
    });

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

    // Prepare the new file suggestion based on search text
    let newFileName = searchText || "types.ts";
    if (!newFileName.includes(".")) {
      newFileName += ".ts";
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(newFileName)) {
      newFileName = newFileName.replace(/\.[^/.]+$/, "") + ".ts";
    }

    // Add "New File" option at the end
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

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "extension.move-it",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor");
        return;
      }

      const document = editor.document;
      const selection = editor.selection;

      // Determine range: selection or full symbol under cursor
      let textRange: vscode.Range | undefined;
      if (!selection.isEmpty) {
        textRange = selection;
      } else {
        const symbols = await vscode.commands.executeCommand<
          vscode.DocumentSymbol[]
        >("vscode.executeDocumentSymbolProvider", document.uri);
        if (symbols) {
          const findSymbol = (
            syms: vscode.DocumentSymbol[]
          ): vscode.DocumentSymbol | undefined => {
            for (const sym of syms) {
              if (sym.range.contains(selection.start)) {
                return sym;
              }
              const child = findSymbol(sym.children);
              if (child) return child;
            }
            return undefined;
          };
          const sym = findSymbol(symbols);
          if (sym) {
            textRange = sym.range;
          }
        }
      }

      if (!textRange) {
        vscode.window.showErrorMessage("No text or symbol selected");
        return;
      }

      let selectedText = document.getText(textRange);
      if (!selectedText.trim()) {
        vscode.window.showErrorMessage("Selected text is empty");
        return;
      }

      // Detect export and strip it for moving
      const exportRegex =
        /^\s*export\s+(async\s+)?(interface|type|class|function)\s+/;
      const isExported = exportRegex.test(selectedText);
      if (isExported) {
        selectedText = selectedText.replace(/^\s*export\s+/, "");
      }

      // Show file picker and get target file
      const filename = await showFilePicker(document.uri.fsPath);
      if (!filename) return;

      // Calculate target URI relative to current file
      const currentDir = path.dirname(document.uri.fsPath);
      const targetUri = vscode.Uri.file(path.join(currentDir, filename));

      // Open or create target document and get its editor
      let targetEditor: vscode.TextEditor;
      try {
        targetEditor = await findOrOpenEditor(targetUri);
      } catch {
        // If file doesn't exist, create it first
        await vscode.workspace.fs.writeFile(
          targetUri,
          new TextEncoder().encode("")
        );
        targetEditor = await findOrOpenEditor(targetUri);
      }

      const targetDoc = targetEditor.document;
      const targetContent = targetDoc.getText();

      // Determine symbol name for conflicts and imports
      const nameMatch = selectedText.match(
        /(?:interface|type|class|function)\s+(\w+)/
      );
      const symbolName = nameMatch ? nameMatch[1] : undefined;
      const conflict = symbolName
        ? new RegExp(
            `(?:interface|type|class|function)\\s+${symbolName}\b`
          ).test(targetContent)
        : false;

      // Insert the content into target document
      await targetEditor.edit((edit) => {
        const insertText =
          "\n" +
          (conflict
            ? `// WARNING: Duplicate symbol "${symbolName}" below\n`
            : "") +
          (isExported ? "export " : "") +
          selectedText +
          "\n";
        edit.insert(new vscode.Position(targetDoc.lineCount, 0), insertText);
      });

      // Edit original document: delete and add import if needed
      await editor.edit((edit) => {
        edit.delete(textRange!);
      });

      await document.save();
      await targetDoc.save();

      // Handle imports and exports
      if (symbolName) {
        let docText = document.getText();
        // Remove the import we may have added earlier
        docText = docText.replace(
          new RegExp(`^import \{ ${symbolName} \} from .+;\n`, "m"),
          ""
        );

        // Check if symbol is still used in the file
        const symbolUsage = new RegExp(`\\b${symbolName}\\b`, "g");
        const isUsed = symbolUsage.test(docText);

        if (isUsed) {
          // Prepare import path
          const origDir = path.dirname(document.uri.fsPath);
          let relPath = path
            .relative(origDir, targetUri.fsPath)
            .replace(/\\/g, "/")
            .replace(/\.tsx?$/, "");
          if (!relPath.startsWith(".")) relPath = "./" + relPath;

          // Add import if needed
          const importLine = `import { ${symbolName} } from '${relPath}';\n`;
          if (!/^import \{ ${symbolName} \} from .+;/m.test(docText)) {
            docText = insertAfterDirectivesAndComments(docText, importLine);
          }

          // Handle re-exports
          const exportLine = `export { ${symbolName} } from '${relPath}';\n`;
          const exportRegex = new RegExp(`export\\s*\\{([^}]*)\\}`, "g");
          let match;
          let foundExport = false;
          while ((match = exportRegex.exec(docText)) !== null) {
            const names = match[1].split(",").map((s) => s.trim());
            if (names.includes(symbolName)) {
              foundExport = true;
              // Remove symbol from named export
              const filtered = names.filter((n) => n !== symbolName);
              const replacement =
                filtered.length > 0 ? `export { ${filtered.join(", ")} }` : "";
              docText = docText.replace(match[0], replacement);
              // Add re-export line
              docText = docText + exportLine;
            }
          }

          // Apply the changes
          const edit = new vscode.WorkspaceEdit();
          edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            docText
          );
          await vscode.workspace.applyEdit(edit);
          await document.save();
        }
      }

      vscode.window.showInformationMessage(
        `Moved symbol to ${filename}${
          conflict ? " (with duplicate warning)" : ""
        }`
      );
    }
  );

  context.subscriptions.push(disposable);
}
