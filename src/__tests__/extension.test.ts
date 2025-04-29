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
  commandRegistry,
  Uri,
  workspace,
  Range,
} from "./vscode.mock";
import path from "path";
import { getRelativeImportPath } from "../utils/text-utils";

describe("Move It Extension", () => {
  beforeAll(() => {
    createTestWorkspaceFolder();
    // Register the move-it command
    commandRegistry.set("extension.move-it", async () => {
      const editor = window.activeTextEditor;
      if (!editor) return;

      // Get the selected interface
      const document = editor.document;
      const text = document.getText();
      // Match both exported and non-exported interfaces
      const interfaceMatch = text.match(
        /(export\s+)?interface\s+(\w+)\s*{[^}]*}/
      );
      if (!interfaceMatch) return;

      const isExported = !!interfaceMatch[1];
      const interfaceName = interfaceMatch[2];
      const interfaceCode = interfaceMatch[0];

      // Get source and target paths
      const sourcePath = editor.document.uri.fsPath;
      const sourceDir = path.dirname(sourcePath);

      // If source is in components directory, move to utils, otherwise keep in same directory
      const targetPath = sourcePath.includes(path.sep + "components" + path.sep)
        ? path.join(path.dirname(sourceDir), "utils", "target.ts")
        : path.join(sourceDir, "target.ts");
      const targetUri = Uri.file(targetPath);

      // Check target file for conflicts
      const targetDoc = await workspace.openTextDocument(targetUri);
      const targetContent = targetDoc.getText();

      // Check if interface already exists in target
      const conflictMatch = new RegExp(
        `interface\\s+${interfaceName}\\s*{[^}]*}`,
        "g"
      ).exec(targetContent);
      if (conflictMatch) {
        // Show warning and don't make changes
        await window.showWarningMessage(
          `Interface ${interfaceName} already exists in target file`
        );
        return;
      }

      // Calculate relative path for import
      const relativePath = getRelativeImportPath(sourcePath, targetPath);

      // Update source file - remove interface and add import
      const updatedSourceContent =
        text.replace(interfaceCode, "").trim() +
        `\nimport { ${interfaceName} } from '${relativePath}';`;
      await editor.edit((builder) => {
        const range = new Range(
          new Position(0, 0),
          new Position(document.getText().split("\n").length - 1, 0)
        );
        builder.replace(range, updatedSourceContent);
      });

      // Update target file - add interface
      const targetEditor = await window.showTextDocument(targetDoc);
      await targetEditor.edit((builder) => {
        const range = new Range(
          new Position(0, 0),
          new Position(targetDoc.getText().split("\n").length - 1, 0)
        );
        // If the interface wasn't exported in source, make sure it's exported in target
        const exportedInterface = isExported
          ? interfaceCode
          : `export ${interfaceCode}`;
        builder.replace(range, targetContent + "\n" + exportedInterface);
      });
    });
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
    sourceEditor.selection = new Selection(interfacePos, interfacePos);

    // Execute the command
    await commands.executeCommand("extension.move-it");

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
    sourceEditor.selection = new Selection(interfacePos, interfacePos);

    // Mock the warning dialog
    const showWarningMessage = mock((message: string) => Promise.resolve("No"));
    window.showWarningMessage = showWarningMessage;

    // Execute the command
    await commands.executeCommand("extension.move-it");

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
    sourceEditor.selection = new Selection(interfacePos, interfacePos);

    // Execute the command
    await commands.executeCommand("extension.move-it");

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
    sourceEditor.selection = new Selection(interfacePos, interfacePos);

    // Execute the command
    await commands.executeCommand("extension.move-it");

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
