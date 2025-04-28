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
var vscode3 = __toESM(require("vscode"));
var path2 = __toESM(require("path"));

// src/utils/file-utils.ts
var vscode = __toESM(require("vscode"));
var path = __toESM(require("path"));
async function findOrOpenEditor(targetUri) {
  for (const editor of vscode.window.visibleTextEditors) {
    if (editor.document.uri.fsPath === targetUri.fsPath) {
      await vscode.window.showTextDocument(editor.document, {
        viewColumn: editor.viewColumn,
        preserveFocus: false
      });
      return editor;
    }
  }
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.uri.fsPath === targetUri.fsPath) {
      return await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false
      });
    }
  }
  const document = await vscode.workspace.openTextDocument(targetUri);
  return await vscode.window.showTextDocument(
    document,
    vscode.ViewColumn.Beside
  );
}
async function getFileOptions(options) {
  const { currentFilePath, currentRelativePath, searchText } = options;
  const items = [];
  try {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
      vscode.Uri.file(currentFilePath)
    );
    const workspaceRoot = workspaceFolder?.uri.fsPath;
    const fileDir = path.dirname(currentFilePath);
    const absoluteCurrentDir = path.resolve(fileDir, currentRelativePath || "");
    console.log("Path Debug:", {
      currentFilePath,
      currentRelativePath,
      fileDir,
      absoluteCurrentDir,
      workspaceRoot
    });
    const isAtLimit = workspaceRoot ? path.normalize(absoluteCurrentDir).toLowerCase() === path.normalize(workspaceRoot).toLowerCase() : path.normalize(absoluteCurrentDir).toLowerCase() === path.normalize(fileDir).toLowerCase();
    if (!isAtLimit) {
      const parentDir = path.dirname(absoluteCurrentDir);
      const displayName = path.basename(parentDir);
      const relativeToFile = path.relative(fileDir, parentDir);
      console.log("Parent Directory Debug:", {
        parentDir,
        displayName,
        relativeToFile
      });
      items.push({
        label: "$(arrow-up) $(folder-opened) ..",
        description: `Go to ${displayName}`,
        type: "parent",
        relativePath: relativeToFile.replace(/\\/g, "/")
      });
    }
    const dirents = await vscode.workspace.fs.readDirectory(
      vscode.Uri.file(absoluteCurrentDir)
    );
    const searchLower = searchText.toLowerCase();
    const directories = dirents.filter(
      ([name, type]) => type === vscode.FileType.Directory && (!searchText || name.toLowerCase().includes(searchLower))
    ).map(([name]) => {
      const fullPath = path.join(absoluteCurrentDir, name);
      const relativePath = path.relative(fileDir, fullPath).replace(/\\/g, "/");
      return {
        label: `$(folder) ${name}`,
        description: "Directory",
        type: "directory",
        relativePath,
        absolutePath: fullPath
      };
    }).sort((a, b) => a.label.localeCompare(b.label));
    items.push(...directories);
    const files = dirents.filter(
      ([name, type]) => type === vscode.FileType.File && /\.(ts|tsx|js|jsx)$/.test(name) && path.join(absoluteCurrentDir, name) !== currentFilePath && (!searchText || name.toLowerCase().includes(searchLower))
    ).map(([name]) => {
      const extension = path.extname(name);
      const fileIcon = extension === ".tsx" || extension === ".jsx" ? "$(react)" : "$(typescript)";
      const fullPath = path.join(absoluteCurrentDir, name);
      const relativePath = path.relative(fileDir, fullPath).replace(/\\/g, "/");
      return {
        label: `${fileIcon} ${name}`,
        description: relativePath || "Current directory",
        type: "file",
        relativePath
      };
    }).sort((a, b) => a.label.localeCompare(b.label));
    items.push(...files);
    let newFileName = searchText || "types.ts";
    if (!newFileName.includes(".")) {
      newFileName += ".ts";
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(newFileName)) {
      newFileName = newFileName.replace(/\.[^/.]+$/, "") + ".ts";
    }
    const newFilePath = path.join(absoluteCurrentDir, newFileName);
    const newFileRelativePath = path.relative(fileDir, newFilePath).replace(/\\/g, "/");
    items.push({
      label: "$(new-file) New File",
      description: `Create '${newFileName}' in ${currentRelativePath || "current directory"}`,
      type: "new",
      relativePath: newFileRelativePath
    });
  } catch (error) {
    console.error("Error reading directory:", error);
    vscode.window.showErrorMessage(`Error reading directory: ${error}`);
  }
  return items;
}

// src/utils/text-utils.ts
function insertAfterDirectivesAndComments(source, toInsert) {
  const lines = source.split(/\r?\n/);
  let i = 0;
  let inBlockComment = false;
  while (i < lines.length) {
    const line = lines[i];
    if (inBlockComment) {
      if (line.includes("*/")) {
        inBlockComment = false;
      }
      i++;
      continue;
    }
    if (/^\s*\/\*/.test(line)) {
      inBlockComment = true;
      i++;
      continue;
    }
    if (/^\s*\/\//.test(line)) {
      i++;
      continue;
    }
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }
    if (/^\s*['\"]use (client|server|strict)['\"];/.test(line)) {
      i++;
      continue;
    }
    break;
  }
  return [
    ...lines.slice(0, i),
    toInsert.replace(/\n$/, ""),
    // avoid double newline
    ...lines.slice(i)
  ].join("\n");
}

// src/quickpick/file-picker.ts
var vscode2 = __toESM(require("vscode"));
async function showFilePicker(currentFilePath) {
  const quickPick = vscode2.window.createQuickPick();
  quickPick.placeholder = "Type to search or create a new file";
  quickPick.title = "Move To File";
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;
  let currentPath = "";
  try {
    return await new Promise((resolve2) => {
      const updateOptions = async (searchValue = "") => {
        quickPick.busy = true;
        try {
          console.log("Updating options for path:", currentPath);
          quickPick.items = await getFileOptions({
            currentFilePath,
            currentRelativePath: currentPath,
            searchText: searchValue
          });
        } catch (error) {
          console.error("Error updating options:", error);
          vscode2.window.showErrorMessage(`Failed to update options: ${error}`);
        } finally {
          quickPick.busy = false;
        }
      };
      updateOptions();
      let searchDebounce;
      quickPick.onDidChangeValue(async (value) => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => updateOptions(value), 100);
      });
      quickPick.onDidAccept(async () => {
        const selected = quickPick.selectedItems[0];
        if (!selected) {
          resolve2(void 0);
          return;
        }
        switch (selected.type) {
          case "directory":
            currentPath = selected.relativePath;
            console.log("Navigating to directory:", currentPath);
            await updateOptions(quickPick.value);
            break;
          case "parent":
            currentPath = selected.relativePath;
            console.log("Navigating to parent:", currentPath);
            await updateOptions(quickPick.value);
            break;
          case "new":
            if (selected.relativePath) {
              resolve2(selected.relativePath);
              quickPick.hide();
            }
            break;
          case "file":
            resolve2(selected.relativePath);
            quickPick.hide();
            break;
        }
      });
      quickPick.onDidHide(() => resolve2(void 0));
      quickPick.show();
    });
  } finally {
    quickPick.dispose();
  }
}

// src/extension.ts
function activate(context) {
  const disposable = vscode3.commands.registerCommand(
    "extension.move-it",
    async () => {
      const editor = vscode3.window.activeTextEditor;
      if (!editor) {
        vscode3.window.showErrorMessage("No active editor");
        return;
      }
      const document = editor.document;
      const selection = editor.selection;
      let textRange;
      if (!selection.isEmpty) {
        textRange = selection;
      } else {
        const symbols = await vscode3.commands.executeCommand("vscode.executeDocumentSymbolProvider", document.uri);
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
        vscode3.window.showErrorMessage("No text or symbol selected");
        return;
      }
      let selectedText = document.getText(textRange);
      if (!selectedText.trim()) {
        vscode3.window.showErrorMessage("Selected text is empty");
        return;
      }
      const exportRegex = /^\s*export\s+(async\s+)?(interface|type|class|function)\s+/;
      const isExported = exportRegex.test(selectedText);
      if (isExported) {
        selectedText = selectedText.replace(/^\s*export\s+/, "");
      }
      const filename = await showFilePicker(document.uri.fsPath);
      if (!filename)
        return;
      const currentDir = path2.dirname(document.uri.fsPath);
      const targetUri = vscode3.Uri.file(path2.join(currentDir, filename));
      let targetEditor;
      try {
        targetEditor = await findOrOpenEditor(targetUri);
      } catch {
        await vscode3.workspace.fs.writeFile(
          targetUri,
          new TextEncoder().encode("")
        );
        targetEditor = await findOrOpenEditor(targetUri);
      }
      const targetDoc = targetEditor.document;
      const targetContent = targetDoc.getText();
      const nameMatch = selectedText.match(
        /(?:interface|type|class|function)\s+(\w+)/
      );
      const symbolName = nameMatch ? nameMatch[1] : void 0;
      const conflict = symbolName ? new RegExp(
        `(?:interface|type|class|function)\\s+${symbolName}\b`
      ).test(targetContent) : false;
      await targetEditor.edit((edit) => {
        const insertText = "\n" + (conflict ? `// WARNING: Duplicate symbol "${symbolName}" below
` : "") + (isExported ? "export " : "") + selectedText + "\n";
        edit.insert(new vscode3.Position(targetDoc.lineCount, 0), insertText);
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
        if (isUsed) {
          const origDir = path2.dirname(document.uri.fsPath);
          let relPath = path2.relative(origDir, targetUri.fsPath).replace(/\\/g, "/").replace(/\.tsx?$/, "");
          if (!relPath.startsWith("."))
            relPath = "./" + relPath;
          const importLine = `import { ${symbolName} } from '${relPath}';
`;
          if (!/^import \{ ${symbolName} \} from .+;/m.test(docText)) {
            docText = insertAfterDirectivesAndComments(docText, importLine);
          }
          const exportLine = `export { ${symbolName} } from '${relPath}';
`;
          const exportRegex2 = new RegExp(`export\\s*\\{([^}]*)\\}`, "g");
          let match;
          let foundExport = false;
          while ((match = exportRegex2.exec(docText)) !== null) {
            const names = match[1].split(",").map((s) => s.trim());
            if (names.includes(symbolName)) {
              foundExport = true;
              const filtered = names.filter((n) => n !== symbolName);
              const replacement = filtered.length > 0 ? `export { ${filtered.join(", ")} }` : "";
              docText = docText.replace(match[0], replacement);
              docText = docText + exportLine;
            }
          }
          const edit = new vscode3.WorkspaceEdit();
          edit.replace(
            document.uri,
            new vscode3.Range(0, 0, document.lineCount, 0),
            docText
          );
          await vscode3.workspace.applyEdit(edit);
          await document.save();
        }
      }
      vscode3.window.showInformationMessage(
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
