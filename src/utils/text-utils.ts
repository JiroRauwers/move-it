/**
 * Insert text after all top-level comments, blank lines, and directive prologues
 */
export function insertAfterDirectivesAndComments(
  source: string,
  toInsert: string
): string {
  const lines = source.split(/\r?\n/);
  let i = 0;
  let inBlockComment = false;
  let lastDirective = -1;
  let lastComment = -1;
  let firstCodeLine = -1;

  // First pass: find directives, comments, and first code line
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

  // Determine insertion point:
  // 1. After directives if they exist
  // 2. After comments if they exist and come after directives
  // 3. Before first code line
  // 4. At the start of the file
  let insertPosition;
  if (lastDirective >= 0 && lastComment >= 0) {
    // If we have both directives and comments, insert after whichever comes last
    insertPosition = Math.max(lastDirective, lastComment) + 1;
  } else if (lastDirective >= 0) {
    // Only directives
    insertPosition = lastDirective + 1;
  } else if (lastComment >= 0) {
    // Only comments
    insertPosition = lastComment + 1;
  } else {
    // No directives or comments, insert before first code or at start
    insertPosition = firstCodeLine >= 0 ? firstCodeLine : 0;
  }

  // Add blank line only if:
  // 1. We're not at the end of the file
  // 2. Next line isn't empty
  // 3. Previous line isn't a directive or block comment end
  const nextLine = lines[insertPosition]?.trim() || "";
  const prevLine = lines[insertPosition - 1]?.trim() || "";
  const needsBlankLine =
    insertPosition < lines.length &&
    nextLine !== "" &&
    !prevLine.endsWith(";") && // Don't add blank line after directive
    !prevLine.endsWith("*/"); // Don't add blank line after block comment

  return [
    ...lines.slice(0, insertPosition),
    needsBlankLine ? "" : null,
    toInsert,
    ...lines.slice(insertPosition),
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/**
 * Checks if the target file already imports from a specific path and returns import info
 * @returns null if no import found, or object with import details if found
 */
export function findExistingImport(
  sourceCode: string,
  importPath: string
): {
  startLine: number;
  endLine: number;
  importStatement: string;
  namedImports: string[];
} | null {
  const lines = sourceCode.split(/\r?\n/);

  // Match both single and double quoted imports
  const importRegex = new RegExp(
    `^\\s*import\\s*{([^}]*)}\\s*from\\s*['"]${importPath.replace(
      /\./g,
      "\\."
    )}['"]\\s*;?`
  );

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(importRegex);
    if (match) {
      // Extract named imports and clean up whitespace
      const namedImports = match[1]
        .split(",")
        .map((imp) => imp.trim())
        .filter((imp) => imp.length > 0);

      return {
        startLine: i,
        endLine: i,
        importStatement: lines[i],
        namedImports,
      };
    }
  }

  return null;
}

/**
 * Merges a new named import with an existing import statement
 */
export function mergeImports(
  existingImport: string,
  newImportName: string
): string {
  const importMatch = existingImport.match(
    /^(\s*import\s*{)([^}]*)(}\s*from\s*['"].*['"];?\s*)$/
  );
  if (!importMatch) return existingImport;

  const [, start, namedImports, end] = importMatch;
  const imports = namedImports
    .split(",")
    .map((imp) => imp.trim())
    .filter((imp) => imp.length > 0);

  // Don't add if already exists
  if (!imports.includes(newImportName)) {
    imports.push(newImportName);
  }

  // Sort imports alphabetically, case-insensitive
  imports.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  return `${start} ${imports.join(", ")} ${end}`;
}

/**
 * Removes a specific named import from an import statement
 * Returns null if all imports should be removed, otherwise returns the modified import statement
 */
export function removeNamedImport(
  importStatement: string,
  importToRemove: string
): string | null {
  // First capture the entire structure including whitespace
  const importMatch = importStatement.match(
    /^(\s*import\s*{)([^}]*)(}\s*from\s*(['"])(.*?)\4\s*;?\s*)$/
  );
  if (!importMatch) return importStatement;

  const [, prefix, namedImports, suffix, quote, path] = importMatch;
  const imports = namedImports
    .split(",")
    .map((imp) => imp.trim())
    .filter((imp) => imp.length > 0 && imp !== importToRemove);

  // If no imports left, remove the entire statement
  if (imports.length === 0) {
    return null;
  }

  // Return modified import statement with consistent formatting
  return `import { ${imports.join(", ")} } from ${quote}${path}${quote};`;
}

/**
 * Removes a named import from source code, handling both single and multiple import cases
 */
export function removeImportFromSource(
  sourceCode: string,
  importPath: string,
  importToRemove: string
): string {
  const existingImport = findExistingImport(sourceCode, importPath);
  if (!existingImport) return sourceCode;

  const lines = sourceCode.split(/\r?\n/);
  const modifiedImport = removeNamedImport(
    existingImport.importStatement,
    importToRemove
  );

  if (modifiedImport === null) {
    // Remove the entire import line
    return [
      ...lines.slice(0, existingImport.startLine),
      ...lines.slice(existingImport.endLine + 1),
    ].join("\n");
  } else {
    // Replace with modified import
    return [
      ...lines.slice(0, existingImport.startLine),
      modifiedImport,
      ...lines.slice(existingImport.endLine + 1),
    ].join("\n");
  }
}

/**
 * Updates imports when moving code between files
 */
export function updateImportsForMove(
  sourceFilePath: string,
  targetFilePath: string,
  symbolName: string,
  sourceCode: string,
  targetCode: string
): { updatedSourceCode: string; updatedTargetCode: string } {
  // Convert file paths to relative module paths
  const sourceToTarget = getRelativeImportPath(sourceFilePath, targetFilePath);
  const targetToSource = getRelativeImportPath(targetFilePath, sourceFilePath);

  // Handle imports in source file
  let updatedSourceCode = sourceCode;
  const existingImportInSource = findExistingImport(sourceCode, sourceToTarget);

  if (existingImportInSource) {
    // Merge with existing import
    const lines = sourceCode.split(/\r?\n/);
    const modifiedImport = mergeImports(
      existingImportInSource.importStatement,
      symbolName
    );
    updatedSourceCode = [
      ...lines.slice(0, existingImportInSource.startLine),
      modifiedImport,
      ...lines.slice(existingImportInSource.endLine + 1),
    ].join("\n");
  } else {
    // Add new import
    const importStatement = `import { ${symbolName} } from '${sourceToTarget}';`;
    updatedSourceCode = insertAfterDirectivesAndComments(
      sourceCode,
      importStatement
    );
  }

  // Handle imports in target file
  let updatedTargetCode = targetCode;
  const existingImportInTarget = findExistingImport(targetCode, targetToSource);

  if (existingImportInTarget) {
    // Merge with existing import
    const lines = targetCode.split(/\r?\n/);
    const modifiedImport = mergeImports(
      existingImportInTarget.importStatement,
      symbolName
    );
    updatedTargetCode = [
      ...lines.slice(0, existingImportInTarget.startLine),
      modifiedImport,
      ...lines.slice(existingImportInTarget.endLine + 1),
    ].join("\n");
  } else {
    // Add new import
    const newImport = `import { ${symbolName} } from '${targetToSource}';`;
    updatedTargetCode = insertAfterDirectivesAndComments(targetCode, newImport);
  }

  return {
    updatedSourceCode,
    updatedTargetCode,
  };
}

/**
 * Gets the relative import path between two files
 */
export function getRelativeImportPath(
  fromPath: string,
  toPath: string
): string {
  // Normalize paths to use forward slashes and remove file extensions
  const cleanFromPath = fromPath.replace(/\.[^/.]+$/, "").replace(/\\/g, "/");
  const cleanToPath = toPath.replace(/\.[^/.]+$/, "").replace(/\\/g, "/");

  // If paths are in the same directory, use ./
  if (
    cleanFromPath.split("/").slice(0, -1).join("/") ===
    cleanToPath.split("/").slice(0, -1).join("/")
  ) {
    return "./" + cleanToPath.split("/").pop()!;
  }

  // Split paths into segments
  const fromParts = cleanFromPath.split("/");
  const toParts = cleanToPath.split("/");

  // Remove common path segments from the start
  while (
    fromParts.length > 0 &&
    toParts.length > 0 &&
    fromParts[0] === toParts[0]
  ) {
    fromParts.shift();
    toParts.shift();
  }

  // Build the relative path
  const backSteps = fromParts.length - 1; // -1 because we don't count the filename
  const relativePath =
    backSteps > 0 ? Array(backSteps).fill("..").join("/") : ".";

  // Add the remaining path to the target
  const targetPath = toParts.join("/");
  return targetPath ? `${relativePath}/${targetPath}` : relativePath;
}
