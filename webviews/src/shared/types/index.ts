export interface VSCodeAPI {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

declare global {
  function acquireVsCodeApi(): VSCodeAPI;
}

export interface BaseMessage {
  command: string;
  [key: string]: any;
}

export type VSCodeThemeKind = 'vscode-light' | 'vscode-dark' | 'vscode-high-contrast';
