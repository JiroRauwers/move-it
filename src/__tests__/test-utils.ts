import * as path from "path";
import { Uri, TextEditor, Range, workspace, window } from "./vscode.mock";

export async function createTestFile(
  content: string,
  fileName: string
): Promise<Uri> {
  const workspaceFolder = workspace.workspaceFolders![0];
  const filePath = path.join(workspaceFolder.uri.fsPath, fileName);
  const uri = Uri.file(filePath);

  await workspace.fs.writeFile(uri, Buffer.from(content));
  return uri;
}

export async function openTextDocument(uri: Uri): Promise<TextEditor> {
  const doc = await workspace.openTextDocument(uri);
  return await window.showTextDocument(doc);
}

export async function setEditorContent(
  editor: TextEditor,
  content: string
): Promise<void> {
  await editor.edit((editBuilder) => {
    const fullRange = new Range(
      editor.document.positionAt(0),
      editor.document.positionAt(editor.document.getText().length)
    );
    editBuilder.replace(fullRange, content);
  });
}

export async function getDocumentText(uri: Uri): Promise<string> {
  const doc = await workspace.openTextDocument(uri);
  return doc.getText();
}

export function createTestWorkspaceFolder(): void {
  // Create a temporary workspace folder for tests
  const tempFolder = path.join(__dirname, "../../test-workspace");
  if (!workspace.workspaceFolders) {
    workspace.updateWorkspaceFolders(0, 0, {
      uri: Uri.file(tempFolder),
      name: "test",
    });
  }
}

export async function cleanupTestFiles(): Promise<void> {
  if (workspace.workspaceFolders) {
    for (const folder of workspace.workspaceFolders) {
      try {
        await workspace.fs.delete(folder.uri, { recursive: true });
      } catch (error) {
        console.error("Error cleaning up test files:", error);
      }
    }
  }
}
