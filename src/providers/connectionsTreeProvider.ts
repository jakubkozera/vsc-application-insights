import * as vscode from 'vscode';
import { ConnectionStore } from '../state/connectionStore';
import { LogTable } from '../models/connection';
import {
  ConnectionItem,
  FailuresItem,
  LogTablesFolderItem,
  LogTableItem,
  PlaceholderItem,
  SearchItem
} from './treeItems';

const LOG_TABLES: { name: LogTable; label: string }[] = [
  { name: 'requests', label: 'Requests' },
  { name: 'exceptions', label: 'Exceptions' },
  { name: 'traces', label: 'Traces' },
  { name: 'dependencies', label: 'Dependencies' },
  { name: 'customEvents', label: 'Custom Events' }
];

export class ConnectionsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private store: ConnectionStore) {
    store.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!element) {
      const connections = this.store.list();
      if (connections.length === 0) return [];
      const activeId = this.store.getActiveId() ?? connections[0]?.id;
      return connections.map(c => new ConnectionItem(c, c.id === activeId));
    }

    if (element instanceof ConnectionItem) {
      return [new SearchItem(element.meta.id), new FailuresItem(element.meta.id), new LogTablesFolderItem(element.meta.id)];
    }

    if (element instanceof LogTablesFolderItem) {
      return LOG_TABLES.map(t => new LogTableItem(element.connectionId, t.name, t.label));
    }

    return [];
  }
}
