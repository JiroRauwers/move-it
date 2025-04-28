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
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode = __toESM(require("vscode"));
function activate(context) {
  let disposable = vscode.commands.registerCommand("extension.moveSymbolToFile", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No active editor");
      return;
    }
    const document = editor.document;
    let selection = editor.selection;
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
            const foundInChildren = findSymbol(sym2.children);
            if (foundInChildren) {
              return foundInChildren;
            }
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
    const selectedText = document.getText(textRange);
    if (!selectedText.trim()) {
      vscode.window.showErrorMessage("Selected text is empty");
      return;
    }
    const filename = await vscode.window.showInputBox({
      prompt: "Enter filename to move symbol into (relative to workspace)",
      value: "types.ts"
    });
    if (!filename)
      return;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder found");
      return;
    }
    const targetUri = vscode.Uri.joinPath(workspaceFolder.uri, filename);
    try {
      let targetDoc;
      let targetContent = "";
      try {
        targetDoc = await vscode.workspace.openTextDocument(targetUri);
        targetContent = targetDoc.getText();
      } catch {
        await vscode.workspace.fs.writeFile(targetUri, new TextEncoder().encode(""));
        targetDoc = await vscode.workspace.openTextDocument(targetUri);
      }
      const symbolNameMatch = selectedText.match(/(interface|type|class)\s+(\w+)/);
      const symbolName = symbolNameMatch ? symbolNameMatch[2] : void 0;
      const conflict = symbolName ? targetContent.includes(`interface ${symbolName}`) || targetContent.includes(`type ${symbolName}`) || targetContent.includes(`class ${symbolName}`) : false;
      const targetEditor = await vscode.window.showTextDocument(targetDoc, vscode.ViewColumn.Beside);
      await targetEditor.edit((edit) => {
        edit.insert(
          new vscode.Position(targetDoc.lineCount, 0),
          "\n" + (conflict ? `// WARNING: Duplicate symbol "${symbolName}" below
` : "") + selectedText + "\n"
        );
      });
      await editor.edit((edit) => {
        edit.delete(textRange);
      });
      await document.save();
      await targetDoc.save();
      vscode.window.showInformationMessage(`Moved symbol to ${filename}${conflict ? " (with duplicate warning)" : ""}`);
    } catch (error) {
      console.error(error);
      vscode.window.showErrorMessage("Failed to move symbol");
    }
  });
  context.subscriptions.push(disposable);
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
