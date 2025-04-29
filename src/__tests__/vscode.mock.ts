// Mock implementation of the vscode module for testing
class Position {
  constructor(public line: number, public character: number) {}
}

class Selection {
  public isReversed: boolean = false;
  public start: Position;
  public end: Position;
  public isEmpty: boolean = false;
  public isSingleLine: boolean = true;
  public active: Position;
  public anchor: Position;

  constructor(anchor: Position, active: Position) {
    this.anchor = anchor;
    this.active = active;
    this.start = anchor;
    this.end = active;
  }

  contains(position: Position): boolean {
    return true;
  }

  isEqual(other: Selection): boolean {
    return true;
  }

  with(anchor?: Position, active?: Position): Selection {
    return new Selection(anchor || this.anchor, active || this.active);
  }
}

class Range {
  constructor(public start: Position, public end: Position) {}
}

// Add a mock file system to track file contents
const mockFileSystem = new Map<string, string>();

class Uri {
  static file(path: string): Uri {
    return new Uri(path);
  }

  constructor(public fsPath: string) {}

  toString(): string {
    return this.fsPath;
  }
}

class TextDocument {
  constructor(public uri: Uri, private content: string = "") {
    // Initialize document content from mock file system
    if (!content && mockFileSystem.has(uri.toString())) {
      this.content = mockFileSystem.get(uri.toString()) || "";
    }
  }

  getText(): string {
    return this.content;
  }

  positionAt(offset: number): Position {
    const lines = this.content.slice(0, offset).split("\n");
    return new Position(lines.length - 1, lines[lines.length - 1].length);
  }
}

class TextEditor {
  constructor(public document: TextDocument, public selection: Selection) {}

  async edit(
    callback: (editBuilder: TextEditorEdit) => void
  ): Promise<boolean> {
    const builder = new TextEditorEdit(this.document);
    callback(builder);
    return true;
  }
}

class TextEditorEdit {
  constructor(private document: TextDocument) {}

  replace(range: Range, text: string): void {
    const doc = this.document as any;
    doc.content = text;
    mockFileSystem.set(doc.uri.toString(), text);
  }
}

const window = {
  showWarningMessage: async (message: string) => {
    // Return "No" by default to simulate user cancellation
    return "No";
  },
  activeTextEditor: null as TextEditor | null,
  showTextDocument: async (document: TextDocument) => {
    const editor = new TextEditor(
      document,
      new Selection(new Position(0, 0), new Position(0, 0))
    );
    window.activeTextEditor = editor;
    return editor;
  },
};

const workspace = {
  workspaceFolders: [
    {
      uri: new Uri(process.cwd()),
      name: "test",
      index: 0,
    },
  ],
  updateWorkspaceFolders: (
    start: number,
    deleteCount: number,
    folder: { uri: Uri; name: string }
  ) => {
    workspace.workspaceFolders = [
      {
        ...folder,
        index: 0,
      },
    ];
    return true;
  },
  openTextDocument: async (uri: Uri) => {
    return new TextDocument(uri, mockFileSystem.get(uri.toString()));
  },
  fs: {
    writeFile: async (uri: Uri, content: Buffer) => {
      mockFileSystem.set(uri.toString(), content.toString());
    },
    delete: async (uri: Uri, options?: { recursive: boolean }) => {
      mockFileSystem.delete(uri.toString());
    },
  },
};

// Add command registry to track registered commands
const commandRegistry = new Map<string, (...args: any[]) => Promise<any>>();

const commands = {
  executeCommand: async (command: string, ...args: any[]) => {
    const handler = commandRegistry.get(command);
    if (handler) {
      return await handler(...args);
    }
    console.warn(`Command ${command} not found in registry`);
  },
  registerCommand: (
    command: string,
    handler: (...args: any[]) => Promise<any>
  ) => {
    commandRegistry.set(command, handler);
  },
};

// Export the registry for tests to register commands
export {
  Position,
  Selection,
  Range,
  Uri,
  TextDocument,
  TextEditor,
  TextEditorEdit,
  window,
  workspace,
  commands,
  commandRegistry,
};
