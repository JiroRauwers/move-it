// Mock implementation of the vscode module for testing
class Position {
  constructor(public line: number, public character: number) {}
}

class Selection {
  constructor(public anchor: Position, public active: Position) {}
}

class TextDocument {
  constructor(public uri: any, private content: string) {}

  positionAt(offset: number): Position {
    const lines = this.content.slice(0, offset).split("\n");
    return new Position(lines.length - 1, lines[lines.length - 1].length);
  }
}

class TextEditor {
  constructor(public document: TextDocument, public selection: Selection) {}
}

const window = {
  showWarningMessage: async (message: string) => Promise.resolve("No"),
  activeTextEditor: null as TextEditor | null,
};

const commands = {
  executeCommand: async (command: string, ...args: any[]) => {},
};

export { Position, Selection, TextDocument, TextEditor, window, commands };
