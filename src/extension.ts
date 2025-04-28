import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand('extension.moveSymbolToFile', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor');
      return;
    }
    const document = editor.document;
    let selection = editor.selection;

    // Determine the range to move: selected text or symbol under cursor
    let textRange: vscode.Range | undefined;
    if (!selection.isEmpty) {
      textRange = selection;
    } else {
      // Get document symbols
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', document.uri);
      if (symbols) {
        const findSymbol = (syms: vscode.DocumentSymbol[]): vscode.DocumentSymbol | undefined => {
          for (const sym of syms) {
            if (sym.range.contains(selection.start)) {
              return sym;
            }
            const foundInChildren = findSymbol(sym.children);
            if (foundInChildren) {
              return foundInChildren;
            }
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
      vscode.window.showErrorMessage('No text or symbol selected');
      return;
    }

    const selectedText = document.getText(textRange);
    if (!selectedText.trim()) {
      vscode.window.showErrorMessage('Selected text is empty');
      return;
    }

    const filename = await vscode.window.showInputBox({
      prompt: 'Enter filename to move symbol into (relative to workspace)',
      value: 'types.ts'
    });
    if (!filename) return;

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder found');
      return;
    }
    const targetUri = vscode.Uri.joinPath(workspaceFolder.uri, filename);

    try {
      let targetDoc: vscode.TextDocument;
      let targetContent = "";
      try {
        targetDoc = await vscode.workspace.openTextDocument(targetUri);
        targetContent = targetDoc.getText();
      } catch {
        await vscode.workspace.fs.writeFile(targetUri, new TextEncoder().encode(''));
        targetDoc = await vscode.workspace.openTextDocument(targetUri);
      }

      const symbolNameMatch = selectedText.match(/(interface|type|class)\s+(\w+)/);
      const symbolName = symbolNameMatch ? symbolNameMatch[2] : undefined;

      const conflict = symbolName ? (
        targetContent.includes(`interface ${symbolName}`) ||
        targetContent.includes(`type ${symbolName}`) ||
        targetContent.includes(`class ${symbolName}`)
      ) : false;

      const targetEditor = await vscode.window.showTextDocument(targetDoc, vscode.ViewColumn.Beside);
      await targetEditor.edit(edit => {
        edit.insert(
          new vscode.Position(targetDoc.lineCount, 0),
          '\n' + (conflict ? `// WARNING: Duplicate symbol "${symbolName}" below\n` : '') + selectedText + '\n'
        );
      });

      await editor.edit(edit => {
        edit.delete(textRange!);
      });

      await document.save();
      await targetDoc.save();

      vscode.window.showInformationMessage(`Moved symbol to ${filename}${conflict ? ' (with duplicate warning)' : ''}`);
    } catch (error) {
      console.error(error);
      vscode.window.showErrorMessage('Failed to move symbol');
    }
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}