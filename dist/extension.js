"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate
});
module.exports = __toCommonJS(extension_exports);
var vscode = __toESM(require("vscode"));
var path = __toESM(require("path"));
function activate(context) {
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
      let textRange;
      if (!selection.isEmpty) {
        textRange = selection;
      } else {
        const symbols = await vscode.commands.executeCommand("vscode.executeDocumentSymbolProvider", document.uri);
        if (symbols) {
          const findSymbol = (syms) => {
            for (const sym2 of syms) {
              if (sym2.range.contains(selection.start)) {
                return sym2;
              }
              const child = findSymbol(sym2.children);
              if (child)
                return child;
            }
            return void 0;
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
      const exportRegex = /^\s*export\s+(async\s+)?(interface|type|class|function)\s+/;
      const isExported = exportRegex.test(selectedText);
      if (isExported) {
        selectedText = selectedText.replace(/^\s*export\s+/, "");
      }
      const filename = await vscode.window.showInputBox({
        prompt: "Enter filename to move symbol into (relative to current file)",
        value: "types.ts"
      });
      if (!filename)
        return;
      const currentDir = path.dirname(document.uri.fsPath);
      const targetUri = vscode.Uri.file(path.join(currentDir, filename));
      let targetDoc;
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
      const nameMatch = selectedText.match(
        /(?:interface|type|class|function)\s+(\w+)/
      );
      const symbolName = nameMatch ? nameMatch[1] : void 0;
      const conflict = symbolName ? new RegExp(
        `(?:interface|type|class|function)\\s+${symbolName}\b`
      ).test(targetContent) : false;
      const targetEditor = await vscode.window.showTextDocument(
        targetDoc,
        vscode.ViewColumn.Beside
      );
      await targetEditor.edit((edit) => {
        const insertText = "\n" + (conflict ? `// WARNING: Duplicate symbol "${symbolName}" below
` : "") + (isExported ? "export " : "") + selectedText + "\n";
        edit.insert(new vscode.Position(targetDoc.lineCount, 0), insertText);
      });
      await editor.edit((edit) => {
        edit.delete(textRange);
      });
      await document.save();
      await targetDoc.save();
      if (symbolName) {
        let docText = document.getText();
        docText = docText.replace(
          new RegExp(`^import { ${symbolName} } from .+;
`, "m"),
          ""
        );
        const symbolUsage = new RegExp(`\\b${symbolName}\\b`, "g");
        const isUsed = symbolUsage.test(docText);
        const origDir = path.dirname(document.uri.fsPath);
        let relPath = path.relative(origDir, targetUri.fsPath).replace(/\\/g, "/").replace(/\.tsx?$/, "");
        if (!relPath.startsWith("."))
          relPath = "./" + relPath;
        const importLine = `import { ${symbolName} } from '${relPath}';
`.replace(/\\n/g, "\n");
        const exportLine = `export { ${symbolName} } from '${relPath}';
`.replace(/\\n/g, "\n");
        let updated = false;
        if (isUsed) {
          if (!/^import \{ ${symbolName} \} from .+;/m.test(docText)) {
            docText = importLine + docText;
            updated = true;
          }
        }
        const exportRegex2 = new RegExp(`export\\s*\\{([^}]*)\\}`, "g");
        let match;
        let newDocText = docText;
        let foundExport = false;
        while ((match = exportRegex2.exec(docText)) !== null) {
          const names = match[1].split(",").map((s) => s.trim());
          if (names.includes(symbolName)) {
            foundExport = true;
            const filtered = names.filter((n) => n !== symbolName);
            let replacement = filtered.length > 0 ? `export { ${filtered.join(", ")} }` : "";
            newDocText = newDocText.replace(match[0], replacement);
            newDocText = newDocText + exportLine;
            updated = true;
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
        if (isUsed) {
          let targetText = targetDoc.getText();
          const declRegex = new RegExp(
            `^[\\s\\t]*(?:(?://.*\\n)|(?:/\\*[\\s\\S]*?\\*/\\n)|(?:@[\\w\\(\\)\\.,\\s]*\\n))*[\\s\\t]*(interface|type|class|function)\\s+${symbolName}\\b`,
            "m"
          );
          const exportDeclRegex = new RegExp(
            `^s*exports+(interface|type|class|function)s+${symbolName}\b`,
            "m"
          );
          if (!exportDeclRegex.test(targetText)) {
            const beforeReplace = targetText;
            targetText = targetText.replace(
              declRegex,
              (match2) => `export ${match2.trim()}`
            );
            const edit = new vscode.WorkspaceEdit();
            edit.replace(
              targetDoc.uri,
              new vscode.Range(0, 0, targetDoc.lineCount, 0),
              targetText
            );
            await vscode.workspace.applyEdit(edit);
            await targetDoc.save();
          }
        }
      }
      vscode.window.showInformationMessage(
        `Moved symbol to ${filename}${conflict ? " (with duplicate warning)" : ""}`
      );
    }
  );
  context.subscriptions.push(disposable);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate
});
