// src/extension.ts
import * as vscode3 from "vscode";
import * as path2 from "path";

// src/utils/file-utils.ts
import * as vscode from "vscode";
import * as path from "path";
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
    const workspaceRoot = workspaceFolder == null ? void 0 : workspaceFolder.uri.fsPath;
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
  var _a, _b;
  const lines = source.split(/\r?\n/);
  let i = 0;
  let inBlockComment = false;
  let lastDirective = -1;
  let lastComment = -1;
  let firstCodeLine = -1;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (inBlockComment) {
      if (line.includes("*/")) {
        inBlockComment = false;
        lastComment = i;
      }
    } else {
      if (line.startsWith("/*")) {
        inBlockComment = true;
        lastComment = i;
      } else if (line.startsWith("//")) {
        lastComment = i;
      } else if (/^['"](use strict|use client|use server)['"];?$/.test(line)) {
        lastDirective = i;
      } else if (line !== "") {
        if (firstCodeLine === -1) {
          firstCodeLine = i;
        }
      }
    }
    i++;
  }
  let insertPosition;
  if (lastDirective >= 0 && lastComment >= 0) {
    insertPosition = Math.max(lastDirective, lastComment) + 1;
  } else if (lastDirective >= 0) {
    insertPosition = lastDirective + 1;
  } else if (lastComment >= 0) {
    insertPosition = lastComment + 1;
  } else {
    insertPosition = firstCodeLine >= 0 ? firstCodeLine : 0;
  }
  const nextLine = ((_a = lines[insertPosition]) == null ? void 0 : _a.trim()) || "";
  const prevLine = ((_b = lines[insertPosition - 1]) == null ? void 0 : _b.trim()) || "";
  const needsBlankLine = insertPosition < lines.length && nextLine !== "" && !prevLine.endsWith(";") && // Don't add blank line after directive
  !prevLine.endsWith("*/");
  return [
    ...lines.slice(0, insertPosition),
    needsBlankLine ? "" : null,
    toInsert,
    ...lines.slice(insertPosition)
  ].filter((line) => line !== null).join("\n");
}
function findExistingImport(sourceCode, importPath) {
  const lines = sourceCode.split(/\r?\n/);
  const importRegex = new RegExp(
    `^\\s*import\\s*{([^}]*)}\\s*from\\s*['"]${importPath.replace(
      /\./g,
      "\\."
    )}['"]\\s*;?`
  );
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(importRegex);
    if (match) {
      const namedImports = match[1].split(",").map((imp) => imp.trim()).filter((imp) => imp.length > 0);
      return {
        startLine: i,
        endLine: i,
        importStatement: lines[i],
        namedImports
      };
    }
  }
  return null;
}
function mergeImports(existingImport, newImportName) {
  const importMatch = existingImport.match(
    /^(\s*import\s*{)([^}]*)(}\s*from\s*['"].*['"];?\s*)$/
  );
  if (!importMatch)
    return existingImport;
  const [, start, namedImports, end] = importMatch;
  const imports = namedImports.split(",").map((imp) => imp.trim()).filter((imp) => imp.length > 0);
  if (!imports.includes(newImportName)) {
    imports.push(newImportName);
  }
  imports.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  return `${start} ${imports.join(", ")} ${end}`;
}
function updateImportsForMove(sourceFilePath, targetFilePath, symbolName, sourceCode, targetCode) {
  const sourceToTarget = getRelativeImportPath(sourceFilePath, targetFilePath);
  const targetToSource = getRelativeImportPath(targetFilePath, sourceFilePath);
  let updatedSourceCode = sourceCode;
  const existingImportInSource = findExistingImport(sourceCode, sourceToTarget);
  if (existingImportInSource) {
    const lines = sourceCode.split(/\r?\n/);
    const modifiedImport = mergeImports(
      existingImportInSource.importStatement,
      symbolName
    );
    updatedSourceCode = [
      ...lines.slice(0, existingImportInSource.startLine),
      modifiedImport,
      ...lines.slice(existingImportInSource.endLine + 1)
    ].join("\n");
  } else {
    const importStatement = `import { ${symbolName} } from '${sourceToTarget}';`;
    updatedSourceCode = insertAfterDirectivesAndComments(
      sourceCode,
      importStatement
    );
  }
  let updatedTargetCode = targetCode;
  const existingImportInTarget = findExistingImport(targetCode, targetToSource);
  if (existingImportInTarget) {
    const lines = targetCode.split(/\r?\n/);
    const modifiedImport = mergeImports(
      existingImportInTarget.importStatement,
      symbolName
    );
    updatedTargetCode = [
      ...lines.slice(0, existingImportInTarget.startLine),
      modifiedImport,
      ...lines.slice(existingImportInTarget.endLine + 1)
    ].join("\n");
  } else {
    const newImport = `import { ${symbolName} } from '${targetToSource}';`;
    updatedTargetCode = insertAfterDirectivesAndComments(targetCode, newImport);
  }
  return {
    updatedSourceCode,
    updatedTargetCode
  };
}
function getRelativeImportPath(fromPath, toPath) {
  const cleanFromPath = fromPath.replace(/\.[^/.]+$/, "").replace(/\\/g, "/");
  const cleanToPath = toPath.replace(/\.[^/.]+$/, "").replace(/\\/g, "/");
  if (cleanFromPath.split("/").slice(0, -1).join("/") === cleanToPath.split("/").slice(0, -1).join("/")) {
    return "./" + cleanToPath.split("/").pop();
  }
  const fromParts = cleanFromPath.split("/");
  const toParts = cleanToPath.split("/");
  while (fromParts.length > 0 && toParts.length > 0 && fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }
  const backSteps = fromParts.length - 1;
  const relativePath = backSteps > 0 ? Array(backSteps).fill("..").join("/") : ".";
  const targetPath = toParts.join("/");
  return targetPath ? `${relativePath}/${targetPath}` : relativePath;
}

// src/quickpick/file-picker.ts
import * as vscode2 from "vscode";
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
        `(?:interface|type|class|function)\\s+${symbolName}\\b`
      ).test(targetContent) : false;
      if (conflict) {
        const proceed = await vscode3.window.showWarningMessage(
          `Symbol "${symbolName}" already exists in target file. Proceed anyway?`,
          "Yes",
          "No"
        );
        if (proceed !== "Yes")
          return;
      }
      await targetEditor.edit((edit) => {
        const insertText = "\n" + (isExported ? "export " : "") + selectedText + "\n";
        edit.insert(new vscode3.Position(targetDoc.lineCount, 0), insertText);
      });
      await editor.edit((edit) => {
        edit.delete(textRange);
      });
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
        const sourceEdit = new vscode3.WorkspaceEdit();
        sourceEdit.replace(
          document.uri,
          new vscode3.Range(0, 0, document.lineCount, 0),
          updatedSourceCode
        );
        await vscode3.workspace.applyEdit(sourceEdit);
        const targetEdit = new vscode3.WorkspaceEdit();
        targetEdit.replace(
          targetUri,
          new vscode3.Range(0, 0, targetDoc.lineCount, 0),
          updatedTargetCode
        );
        await vscode3.workspace.applyEdit(targetEdit);
        await document.save();
        await targetDoc.save();
      }
      vscode3.window.showInformationMessage(
        `Moved symbol to ${filename}${conflict ? " (with duplicate warning)" : ""}`
      );
    }
  );
  context.subscriptions.push(disposable);
}
export {
  activate
};
