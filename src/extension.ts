import * as vscode from "vscode";
import * as path from "path";

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "extension.moveIt",
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

      const filename = await vscode.window.showInputBox({
        prompt: "Enter filename to move symbol into (relative to current file)",
        value: "types.ts",
      });
      if (!filename) return;

      // Calculate target URI relative to current file
      const currentDir = path.dirname(document.uri.fsPath);
      const targetUri = vscode.Uri.file(path.join(currentDir, filename));

      // Open or create target document
      let targetDoc: vscode.TextDocument;
      let targetContent = "";
      try {
        targetDoc = await vscode.workspace.openTextDocument(targetUri);
        targetContent = targetDoc.getText();
      } catch {
        await vscode.workspace.fs.writeFile(
          targetUri,
          new TextEncoder().encode("")
        );
        targetDoc = await vscode.workspace.openTextDocument(targetUri);
      }

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

      const targetEditor = await vscode.window.showTextDocument(
        targetDoc,
        vscode.ViewColumn.Beside
      );
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
        if (isExported && symbolName) {
          const origDir = path.dirname(document.uri.fsPath);
          let relPath = path
            .relative(origDir, targetUri.fsPath)
            .replace(/\\/g, "/")
            .replace(/\.tsx?$/, "");
          if (!relPath.startsWith(".")) relPath = "./" + relPath;
          const importLine = `import { ${symbolName} } from '${relPath}';\n`;
          edit.insert(new vscode.Position(0, 0), importLine);
        }
      });

      await document.save();
      await targetDoc.save();
      vscode.window.showInformationMessage(
        `Moved symbol to ${filename}${
          conflict ? " (with duplicate warning)" : ""
        }`
      );
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
