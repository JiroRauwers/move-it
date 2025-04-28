import * as vscode from "vscode";
import * as path from "path";
import { findOrOpenEditor } from "./utils/file-utils";
import {
  insertAfterDirectivesAndComments,
  updateImportsForMove,
  findExistingImport,
  mergeImports,
} from "./utils/text-utils";
import { showFilePicker } from "./quickpick/file-picker";

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
            `(?:interface|type|class|function)\\s+${symbolName}\\b`
          ).test(targetContent)
        : false;

      if (conflict) {
        const proceed = await vscode.window.showWarningMessage(
          `Symbol "${symbolName}" already exists in target file. Proceed anyway?`,
          "Yes",
          "No"
        );
        if (proceed !== "Yes") return;
      }

      // Insert the content into target document
      await targetEditor.edit((edit) => {
        const insertText =
          "\n" + (isExported ? "export " : "") + selectedText + "\n";
        edit.insert(new vscode.Position(targetDoc.lineCount, 0), insertText);
      });

      // Edit original document: delete the moved code
      await editor.edit((edit) => {
        edit.delete(textRange!);
      });

      // Handle imports using our new utilities
      if (symbolName) {
        const sourceFilePath = document.uri.fsPath;
        const targetFilePath = targetUri.fsPath;
        const sourceCode = document.getText();
        const targetCode = targetDoc.getText();

        const { updatedSourceCode, updatedTargetCode } = updateImportsForMove(
          sourceFilePath,
          targetFilePath,
          symbolName,
          sourceCode,
          targetCode
        );

        // Apply changes to source file
        const sourceEdit = new vscode.WorkspaceEdit();
        sourceEdit.replace(
          document.uri,
          new vscode.Range(0, 0, document.lineCount, 0),
          updatedSourceCode
        );
        await vscode.workspace.applyEdit(sourceEdit);

        // Apply changes to target file
        const targetEdit = new vscode.WorkspaceEdit();
        targetEdit.replace(
          targetUri,
          new vscode.Range(0, 0, targetDoc.lineCount, 0),
          updatedTargetCode
        );
        await vscode.workspace.applyEdit(targetEdit);

        // Save both files
        await document.save();
        await targetDoc.save();
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
