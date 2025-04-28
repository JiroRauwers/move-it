import * as vscode from "vscode";

export interface FilePickItem extends vscode.QuickPickItem {
  type: "file" | "new" | "directory" | "parent";
  relativePath?: string;
  absolutePath?: string;
}

export interface MoveItOptions {
  currentFilePath: string;
  currentRelativePath: string;
  searchText: string;
}
