import * as vscode from 'vscode';

export class Logger {
  private static channel: vscode.OutputChannel | undefined;

  private static get output(): vscode.OutputChannel {
    if (!Logger.channel) {
      Logger.channel = vscode.window.createOutputChannel('App Insights Explorer');
    }
    return Logger.channel;
  }

  static info(msg: string): void {
    Logger.output.appendLine(`[INFO] ${new Date().toISOString()} ${msg}`);
  }

  static warn(msg: string, detail?: string): void {
    Logger.output.appendLine(`[WARN] ${new Date().toISOString()} ${msg}${detail ? ': ' + detail : ''}`);
  }

  static error(msg: string, detail?: string): void {
    Logger.output.appendLine(`[ERROR] ${new Date().toISOString()} ${msg}${detail ? ': ' + detail : ''}`);
  }

  static debug(msg: string, detail?: string): void {
    Logger.output.appendLine(`[DEBUG] ${new Date().toISOString()} ${msg}${detail ? ': ' + detail : ''}`);
  }

  static dispose(): void {
    Logger.channel?.dispose();
    Logger.channel = undefined;
  }
}
