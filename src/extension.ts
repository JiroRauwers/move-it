import * as vscode from "vscode";
import * as path from "path";

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
      });

      await document.save();
      await targetDoc.save();

      // --- NEW LOGIC: Auto-import and conditional export if needed ---
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
        // Remove intermediate info popups
        // vscode.window.showInformationMessage(
        //   `[MoveIt] Symbol '${symbolName}' usage in original file: ${isUsed}`
        // );

        // Prepare import line
        const origDir = path.dirname(document.uri.fsPath);
        let relPath = path
          .relative(origDir, targetUri.fsPath)
          .replace(/\\/g, "/")
          .replace(/\.tsx?$/, "");
        if (!relPath.startsWith(".")) relPath = "./" + relPath;
        const importLine =
          `import { ${symbolName} } from '${relPath}';\n`.replace(/\\n/g, "\n");

        // Prepare re-export line
        const exportLine =
          `export { ${symbolName} } from '${relPath}';\n`.replace(/\\n/g, "\n");
        let updated = false;

        // Update import if used
        if (isUsed) {
          // Insert import at the top if not present
          if (!/^import \{ ${symbolName} \} from .+;/m.test(docText)) {
            docText = importLine + docText;
            updated = true;
            // vscode.window.showInformationMessage(
            //   `[MoveIt] Added import for '${symbolName}' in original file.`
            // );
          }
        }

        // Update named exports to re-export
        const exportRegex = new RegExp(`export\\s*\\{([^}]*)\\}`, "g");
        let match;
        let newDocText = docText;
        let foundExport = false;
        while ((match = exportRegex.exec(docText)) !== null) {
          const names = match[1].split(",").map((s) => s.trim());
          if (names.includes(symbolName)) {
            foundExport = true;
            // Remove symbol from named export
            const filtered = names.filter((n) => n !== symbolName);
            let replacement =
              filtered.length > 0 ? `export { ${filtered.join(", ")} }` : "";
            // Replace the export statement
            newDocText = newDocText.replace(match[0], replacement);
            // Add re-export line
            newDocText = newDocText + exportLine;
            updated = true;
            // vscode.window.showInformationMessage(
            //   `[MoveIt] Re-exported '${symbolName}' from new file.`
            // );
          }
        }

        if (updated) {
          const edit = new vscode.WorkspaceEdit();
          edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            newDocText
          );
          await vscode.workspace.applyEdit(edit);
          await document.save();
        }

        // --- PATCH: Conditionally add export to moved symbol ---
        if (isUsed) {
          // Read target file content
          let targetText = targetDoc.getText();
          // Improved regex: allow for leading comments/decorators and whitespace (fixed double-escaping)
          const declRegex = new RegExp(
            `^[\\s\\t]*(?:(?:\/\/.*\\n)|(?:\/\\*[\\s\\S]*?\\*\/\\n)|(?:@[\\w\\(\\)\\.,\\s]*\\n))*[\\s\\t]*(interface|type|class|function)\\s+${symbolName}\\b`,
            "m"
          );
          // Debug: Log if regex matches (REMOVED FOR PRODUCTION)
          // const declMatch = targetText.match(declRegex);
          // vscode.window.showInformationMessage(
          //   `[MoveIt][Debug] declRegex match: ${declMatch ? declMatch[0] : 'NO MATCH'}`
          // );
          const exportDeclRegex = new RegExp(
            `^\s*export\s+(interface|type|class|function)\s+${symbolName}\b`,
            "m"
          );
          if (!exportDeclRegex.test(targetText)) {
            // Add export to the declaration
            const beforeReplace = targetText;
            targetText = targetText.replace(
              declRegex,
              (match) => `export ${match.trim()}`
            );
            // Debug: Log if replacement changed anything (REMOVED FOR PRODUCTION)
            // if (beforeReplace === targetText) {
            //   vscode.window.showWarningMessage(
            //     `[MoveIt][Debug] Replacement did NOT change targetText! Regex may not match the declaration.`
            //   );
            // } else {
            //   vscode.window.showInformationMessage(
            //     `[MoveIt][Debug] Replacement succeeded, export added.`
            //   );
            // }
            const edit = new vscode.WorkspaceEdit();
            edit.replace(
              targetDoc.uri,
              new vscode.Range(0, 0, targetDoc.lineCount, 0),
              targetText
            );
            await vscode.workspace.applyEdit(edit);
            await targetDoc.save();
            // vscode.window.showInformationMessage(
            //   `[MoveIt] New target file content:\n${targetText.slice(
            //     0,
            //     200
            //   )}...`
            // );
            // vscode.window.showInformationMessage(
            //   `[MoveIt] Added export to '${symbolName}' in target file.`
            // );
          }
        }
        // --- END PATCH ---
      }
      // --- END NEW LOGIC ---

      vscode.window.showInformationMessage(
        `Moved symbol to ${filename}${
          conflict ? " (with duplicate warning)" : ""
        }`
      );
    }
  );

  context.subscriptions.push(disposable);
}
