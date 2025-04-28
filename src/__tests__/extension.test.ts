import * as vscode from "vscode";
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  mock,
} from "bun:test";
import {
  createTestFile,
  openTextDocument,
  getDocumentText,
  createTestWorkspaceFolder,
  cleanupTestFiles,
} from "./test-utils";
import {
  Position,
  Selection,
  TextDocument,
  TextEditor,
  window,
  commands,
} from "./vscode.mock";

describe("Move It Extension", () => {
  beforeAll(() => {
    createTestWorkspaceFolder();
  });

  afterAll(async () => {
    await cleanupTestFiles();
  });

  beforeEach(async () => {
    await cleanupTestFiles();
    createTestWorkspaceFolder();
  });

  it("should move interface and update imports", async () => {
    // Create source file with interface
    const sourceContent = `
interface TestInterface {
  prop: string;
}

const test: TestInterface = { prop: 'test' };
`;
    const sourceUri = await createTestFile(sourceContent, "source.ts");
    const sourceEditor = await openTextDocument(sourceUri);

    // Create target file
    const targetContent = `export const x = 1;`;
    const targetUri = await createTestFile(targetContent, "target.ts");

    // Select the interface
    const interfacePos = sourceEditor.document.positionAt(
      sourceContent.indexOf("interface TestInterface")
    );
    sourceEditor.selection = new vscode.Selection(interfacePos, interfacePos);

    // Execute the command
    await vscode.commands.executeCommand("extension.move-it");

    // Verify source file
    const updatedSourceContent = await getDocumentText(sourceUri);
    expect(updatedSourceContent).toContain(
      `import { TestInterface } from './target'`
    );
    expect(updatedSourceContent).not.toContain("interface TestInterface");

    // Verify target file
    const updatedTargetContent = await getDocumentText(targetUri);
    expect(updatedTargetContent).toContain("interface TestInterface");
  });

  it("should handle conflicts in target file", async () => {
    // Create source file with interface
    const sourceContent = `
interface TestInterface {
  prop: string;
}`;
    const sourceUri = await createTestFile(sourceContent, "source.ts");
    const sourceEditor = await openTextDocument(sourceUri);

    // Create target file with conflicting interface
    const targetContent = `
interface TestInterface {
  otherProp: number;
}`;
    const targetUri = await createTestFile(targetContent, "target.ts");

    // Select the interface
    const interfacePos = sourceEditor.document.positionAt(
      sourceContent.indexOf("interface TestInterface")
    );
    sourceEditor.selection = new vscode.Selection(interfacePos, interfacePos);

    // Mock the warning dialog
    const showWarningMessage = mock((message: string) => Promise.resolve("No"));
    vscode.window.showWarningMessage = showWarningMessage;

    // Execute the command
    await vscode.commands.executeCommand("extension.move-it");

    // Verify no changes were made
    const updatedSourceContent = await getDocumentText(sourceUri);
    expect(updatedSourceContent).toBe(sourceContent);

    const updatedTargetContent = await getDocumentText(targetUri);
    expect(updatedTargetContent).toBe(targetContent);
  });

  it("should handle exported symbols", async () => {
    // Create source file with exported interface
    const sourceContent = `
export interface TestInterface {
  prop: string;
}

const test: TestInterface = { prop: 'test' };
`;
    const sourceUri = await createTestFile(sourceContent, "source.ts");
    const sourceEditor = await openTextDocument(sourceUri);

    // Create target file
    const targetContent = `export const x = 1;`;
    const targetUri = await createTestFile(targetContent, "target.ts");

    // Select the interface
    const interfacePos = sourceEditor.document.positionAt(
      sourceContent.indexOf("export interface TestInterface")
    );
    sourceEditor.selection = new vscode.Selection(interfacePos, interfacePos);

    // Execute the command
    await vscode.commands.executeCommand("extension.move-it");

    // Verify source file
    const updatedSourceContent = await getDocumentText(sourceUri);
    expect(updatedSourceContent).toContain(
      `import { TestInterface } from './target'`
    );
    expect(updatedSourceContent).not.toContain(
      "export interface TestInterface"
    );

    // Verify target file
    const updatedTargetContent = await getDocumentText(targetUri);
    expect(updatedTargetContent).toContain("export interface TestInterface");
  });

  it("should handle moving between directories", async () => {
    // Create source file in a subdirectory
    const sourceContent = `
interface TestInterface {
  prop: string;
}`;
    const sourceUri = await createTestFile(
      sourceContent,
      "src/components/source.ts"
    );
    const sourceEditor = await openTextDocument(sourceUri);

    // Create target file in another directory
    const targetContent = `export const x = 1;`;
    const targetUri = await createTestFile(
      targetContent,
      "src/utils/target.ts"
    );

    // Select the interface
    const interfacePos = sourceEditor.document.positionAt(
      sourceContent.indexOf("interface TestInterface")
    );
    sourceEditor.selection = new vscode.Selection(interfacePos, interfacePos);

    // Execute the command
    await vscode.commands.executeCommand("extension.move-it");

    // Verify source file
    const updatedSourceContent = await getDocumentText(sourceUri);
    expect(updatedSourceContent).toContain(
      `import { TestInterface } from '../utils/target'`
    );

    // Verify target file
    const updatedTargetContent = await getDocumentText(targetUri);
    expect(updatedTargetContent).toContain("interface TestInterface");
  });
});
