import * as vscode from 'vscode';
import { ConnectionStore } from '../state/connectionStore';
import { ConnectionMetadata, LogTable } from '../models/connection';

let _extensionUri: vscode.Uri;

export function setExtensionUri(uri: vscode.Uri): void {
  _extensionUri = uri;
}

function mediaUri(filename: string): vscode.Uri {
  return vscode.Uri.joinPath(_extensionUri, 'media', filename);
}

export class ConnectionItem extends vscode.TreeItem {
  constructor(public readonly meta: ConnectionMetadata, isActive: boolean) {
    super(meta.displayName, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'connection';
    this.id = `conn:${meta.id}`;
    this.description = isActive ? '● Active' : meta.resourceType === 'appInsights' ? 'App Insights' : 'Log Analytics';
    this.tooltip = new vscode.MarkdownString(
      `**${meta.displayName}**\n\n` +
      `- Type: ${meta.resourceType === 'appInsights' ? 'Application Insights' : 'Log Analytics'}\n` +
      `- Auth: ${meta.authMode.toUpperCase()}\n` +
      `- Resource: \`${meta.resourceId}\`\n` +
      (meta.lastUsedAt ? `- Last used: ${meta.lastUsedAt}\n` : '')
    );
    this.iconPath = isActive
      ? new vscode.ThemeIcon('plug', new vscode.ThemeColor('testing.iconPassed'))
      : new vscode.ThemeIcon('plug');
  }
}

export class LogTablesFolderItem extends vscode.TreeItem {
  constructor(public readonly connectionId: string) {
    super('Log Tables', vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'logTablesFolder';
    this.id = `conn:${connectionId}:tables`;
    this.iconPath = new vscode.ThemeIcon('database');
  }
}

export class LogTableItem extends vscode.TreeItem {
  constructor(
    public readonly connectionId: string,
    public readonly tableName: LogTable,
    label: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'logTable';
    this.id = `conn:${connectionId}:table:${tableName}`;
    this.iconPath = this.getTableIcon(tableName);
    this.command = {
      command: 'appInsightsExplorer.openTable',
      title: 'Browse Table',
      arguments: [this]
    };
  }

  private getTableIcon(table: LogTable): vscode.ThemeIcon {
    switch (table) {
      case 'requests': return new vscode.ThemeIcon('globe');
      case 'exceptions': return new vscode.ThemeIcon('bug');
      case 'traces': return new vscode.ThemeIcon('output');
      case 'dependencies': return new vscode.ThemeIcon('references');
      case 'customEvents': return new vscode.ThemeIcon('zap');
    }
  }
}

export class SavedQueryItem extends vscode.TreeItem {
  constructor(public readonly queryId: string, name: string) {
    super(name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'savedQuery';
    this.id = `query:${queryId}`;
    this.iconPath = new vscode.ThemeIcon('bookmark');
    this.command = {
      command: 'appInsightsExplorer.runSavedQuery',
      title: 'Run Query',
      arguments: [this]
    };
  }
}

export class PlaceholderItem extends vscode.TreeItem {
  constructor(label: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'placeholder';
  }
}
