import * as vscode from "vscode";
import * as path from "path";

export async function createTestFile(
  content: string,
  fileName: string
): Promise<vscode.Uri> {
  const workspaceFolder = vscode.workspace.workspaceFolders![0];
  const filePath = path.join(workspaceFolder.uri.fsPath, fileName);
  const uri = vscode.Uri.file(filePath);

  await vscode.workspace.fs.writeFile(uri, Buffer.from(content));
  return uri;
}

export async function openTextDocument(
  uri: vscode.Uri
): Promise<vscode.TextEditor> {
  const doc = await vscode.workspace.openTextDocument(uri);
  return await vscode.window.showTextDocument(doc);
}

export async function setEditorContent(
  editor: vscode.TextEditor,
  content: string
): Promise<void> {
  await editor.edit((editBuilder) => {
    const fullRange = new vscode.Range(
      editor.document.positionAt(0),
      editor.document.positionAt(editor.document.getText().length)
    );
    editBuilder.replace(fullRange, content);
  });
}

export async function getDocumentText(uri: vscode.Uri): Promise<string> {
  const doc = await vscode.workspace.openTextDocument(uri);
  return doc.getText();
}

export function createTestWorkspaceFolder(): void {
  // Create a temporary workspace folder for tests
  const tempFolder = path.join(__dirname, "../../test-workspace");
  if (!vscode.workspace.workspaceFolders) {
    vscode.workspace.updateWorkspaceFolders(0, 0, {
      uri: vscode.Uri.file(tempFolder),
      name: "test",
    });
  }
}

export async function cleanupTestFiles(): Promise<void> {
  if (vscode.workspace.workspaceFolders) {
    for (const folder of vscode.workspace.workspaceFolders) {
      try {
        await vscode.workspace.fs.delete(folder.uri, { recursive: true });
      } catch (error) {
        console.error("Error cleaning up test files:", error);
      }
    }
  }
}
