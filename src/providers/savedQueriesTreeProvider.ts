import * as vscode from 'vscode';
import { QueryStore } from '../state/queryStore';
import { SavedQueryItem } from './treeItems';

export class SavedQueriesTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private store: QueryStore) {
    store.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element) return [];
    const queries = this.store.list();
    return queries.map(q => new SavedQueryItem(q.id, q.name));
  }
}
