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

  // Insert after the last matched line
  return [
    ...lines.slice(0, i),
    toInsert.replace(/\n$/, ""), // avoid double newline
    ...lines.slice(i),
  ].join("\n");
}
