import { describe, expect, it } from "bun:test";
import {
  findExistingImport,
  mergeImports,
  removeNamedImport,
  removeImportFromSource,
  updateImportsForMove,
  insertAfterDirectivesAndComments,
} from "../utils/text-utils";

describe("Import utilities", () => {
  describe("findExistingImport", () => {
    it("should find single line import", () => {
      const source = `import { test } from './file';`;
      const result = findExistingImport(source, "./file");
      expect(result).toEqual({
        startLine: 0,
        endLine: 0,
        importStatement: `import { test } from './file';`,
        namedImports: ["test"],
      });
    });

    it("should find import with multiple names", () => {
      const source = `import { test, test2 } from './file';`;
      const result = findExistingImport(source, "./file");
      expect(result?.namedImports).toEqual(["test", "test2"]);
    });

    it("should handle imports with different quote styles", () => {
      const source = `import { test } from "./file";`;
      const result = findExistingImport(source, "./file");
      expect(result).not.toBeNull();
    });

    it("should handle imports with whitespace", () => {
      const source = `import   {   test   }   from   './file'  ;`;
      const result = findExistingImport(source, "./file");
      expect(result).not.toBeNull();
      expect(result?.namedImports).toEqual(["test"]);
    });

    it("should return null when no import found", () => {
      const source = `import { test } from './other-file';`;
      const result = findExistingImport(source, "./file");
      expect(result).toBeNull();
    });
  });

  describe("mergeImports", () => {
    it("should add new import to existing imports", () => {
      const existing = `import { test } from './file';`;
      const result = mergeImports(existing, "newImport");
      expect(result).toBe(`import { newImport, test } from './file';`);
    });

    it("should not duplicate existing imports", () => {
      const existing = `import { test } from './file';`;
      const result = mergeImports(existing, "test");
      expect(result).toBe(`import { test } from './file';`);
    });

    it("should maintain alphabetical order", () => {
      const existing = `import { zebra } from './file';`;
      const result = mergeImports(existing, "alpha");
      expect(result).toBe(`import { alpha, zebra } from './file';`);
    });

    it("should handle case-insensitive sorting", () => {
      const existing = `import { Zebra } from './file';`;
      const result = mergeImports(existing, "alpha");
      expect(result).toBe(`import { alpha, Zebra } from './file';`);
    });
  });

  describe("removeNamedImport", () => {
    it("should remove single import", () => {
      const statement = `import { test } from './file';`;
      const result = removeNamedImport(statement, "test");
      expect(result).toBeNull();
    });

    it("should remove one import from multiple", () => {
      const statement = `import { test, test2 } from './file';`;
      const result = removeNamedImport(statement, "test");
      expect(result).toBe(`import { test2 } from './file';`);
    });

    it("should handle whitespace", () => {
      const statement = `import  {  test  ,  test2  }  from  './file'  ;`;
      const result = removeNamedImport(statement, "test");
      expect(result).toBe(`import { test2 } from './file';`);
    });
  });

  describe("insertAfterDirectivesAndComments", () => {
    it("should insert after use directives", () => {
      const source = `'use strict';
'use client';
const x = 1;`;
      const result = insertAfterDirectivesAndComments(
        source,
        "import { test } from './file';"
      );
      expect(result).toBe(`'use strict';
'use client';
import { test } from './file';
const x = 1;`);
    });

    it("should insert after comments", () => {
      const source = `// Comment
/* Block comment */
const x = 1;`;
      const result = insertAfterDirectivesAndComments(
        source,
        "import { test } from './file';"
      );
      expect(result).toBe(`// Comment
/* Block comment */
import { test } from './file';
const x = 1;`);
    });

    it("should handle multi-line block comments", () => {
      const source = `/* 
 * Block comment
 */
const x = 1;`;
      const result = insertAfterDirectivesAndComments(
        source,
        "import { test } from './file';"
      );
      expect(result).toBe(`/* 
 * Block comment
 */
import { test } from './file';
const x = 1;`);
    });
  });

  describe("updateImportsForMove", () => {
    it("should handle moving code to a file with no existing imports", () => {
      const sourceCode = `
interface Test {
  prop: string;
}`;
      const targetCode = `export const x = 1;`;

      const result = updateImportsForMove(
        "src/source.ts",
        "src/target.ts",
        "Test",
        sourceCode,
        targetCode
      );

      expect(result.updatedTargetCode).toContain(
        `import { Test } from './source'`
      );
    });

    it("should merge with existing imports in target file", () => {
      const sourceCode = `interface Test {
        prop: string;
      }`;
      const targetCode = `import { existingImport } from './source';
export const x = 1;`;

      const result = updateImportsForMove(
        "src/source.ts",
        "src/target.ts",
        "Test",
        sourceCode,
        targetCode
      );

      expect(result.updatedTargetCode).toContain(
        `import { existingImport, Test } from './source'`
      );
    });

    it("should handle moving code between files in different directories", () => {
      const sourceCode = `interface Test {
        prop: string;
      }`;
      const targetCode = `export const x = 1;`;

      const result = updateImportsForMove(
        "src/components/source.ts",
        "src/utils/target.ts",
        "Test",
        sourceCode,
        targetCode
      );

      expect(result.updatedTargetCode).toContain(
        `import { Test } from '../components/source'`
      );
    });

    it("should handle circular imports", () => {
      const sourceCode = `import { Other } from './target';
interface Test {
  prop: Other;
}`;
      const targetCode = `export interface Other {}`;

      const result = updateImportsForMove(
        "src/source.ts",
        "src/target.ts",
        "Test",
        sourceCode,
        targetCode
      );

      expect(result.updatedSourceCode).toContain(
        `import { Other, Test } from './target'`
      );
    });
  });
});
