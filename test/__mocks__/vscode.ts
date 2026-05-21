import * as vscode from 'vscode';

const mock = {
  EventEmitter: class {
    private handlers: Function[] = [];
    event = (handler: Function) => {
      this.handlers.push(handler);
      return { dispose: () => {} };
    };
    fire(data?: any) {
      this.handlers.forEach(h => h(data));
    }
    dispose() {}
  },
  TreeItem: class {
    label: string;
    collapsibleState: number;
    contextValue?: string;
    id?: string;
    description?: string;
    tooltip?: any;
    iconPath?: any;
    command?: any;
    constructor(label: string, collapsibleState?: number) {
      this.label = label;
      this.collapsibleState = collapsibleState ?? 0;
    }
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ThemeIcon: class {
    constructor(public id: string, public color?: any) {}
  },
  ThemeColor: class {
    constructor(public id: string) {}
  },
  MarkdownString: class {
    value: string;
    constructor(value?: string) { this.value = value ?? ''; }
  },
  Uri: {
    joinPath: (...args: any[]) => ({ fsPath: args.join('/') }),
    file: (path: string) => ({ fsPath: path }),
  },
  window: {
    createOutputChannel: () => ({
      appendLine: () => {},
      dispose: () => {},
    }),
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    showInputBox: async () => undefined,
    showQuickPick: async () => undefined,
    createTreeView: () => ({ dispose: () => {} }),
    createStatusBarItem: () => ({
      show: () => {},
      hide: () => {},
      dispose: () => {},
      text: '',
      tooltip: '',
      command: '',
    }),
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
    executeCommand: async () => undefined,
  },
  authentication: {
    getSession: async () => ({
      accessToken: 'mock-token',
    }),
  },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ViewColumn: { Active: -1, One: 1, Two: 2 },
};

export = mock;
