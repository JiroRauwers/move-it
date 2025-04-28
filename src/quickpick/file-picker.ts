import * as vscode from "vscode";
import * as path from "path";
import { FilePickItem } from "../types";
import { getFileOptions } from "../utils/file-utils";

/**
 * Shows a QuickPick dialog for file selection with directory navigation
 */
export async function showFilePicker(
  currentFilePath: string
): Promise<string | undefined> {
  const quickPick = vscode.window.createQuickPick<FilePickItem>();
  quickPick.placeholder = "Type to search or create a new file";
  quickPick.title = "Move To File";
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;

  let currentPath = "";

  try {
    return await new Promise<string | undefined>((resolve) => {
      const updateOptions = async (searchValue: string = "") => {
        quickPick.busy = true;
        try {
          console.log("Updating options for path:", currentPath);
          quickPick.items = await getFileOptions({
            currentFilePath,
            currentRelativePath: currentPath,
            searchText: searchValue,
          });
        } catch (error) {
          console.error("Error updating options:", error);
          vscode.window.showErrorMessage(`Failed to update options: ${error}`);
        } finally {
          quickPick.busy = false;
        }
      };

      // Initial load
      updateOptions();

      // Handle search with debounce
      let searchDebounce: NodeJS.Timeout;
      quickPick.onDidChangeValue(async (value) => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => updateOptions(value), 100);
      });

      quickPick.onDidAccept(async () => {
        const selected = quickPick.selectedItems[0];
        if (!selected) {
          resolve(undefined);
          return;
        }

        switch (selected.type) {
          case "directory":
            currentPath = selected.relativePath!;
            console.log("Navigating to directory:", currentPath);
            await updateOptions(quickPick.value);
            break;
          case "parent":
            currentPath = selected.relativePath!;
            console.log("Navigating to parent:", currentPath);
            await updateOptions(quickPick.value);
            break;
          case "new":
            if (selected.relativePath) {
              resolve(selected.relativePath);
              quickPick.hide();
            }
            break;
          case "file":
            resolve(selected.relativePath);
            quickPick.hide();
            break;
        }
      });

      quickPick.onDidHide(() => resolve(undefined));
      quickPick.show();
    });
  } finally {
    quickPick.dispose();
  }
}
