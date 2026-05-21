import * as vscode from 'vscode';
import { ConnectionStore } from '../state/connectionStore';
import { QueryStore } from '../state/queryStore';
import { QueryService } from '../services/queryService';
import { WebviewHost } from '../webviews/webviewHost';
import { LogTableItem, SavedQueryItem } from '../providers/treeItems';
import { TimeRangeValue } from '../models/connection';
import { Logger } from '../logging/logger';

const openPanels = new Map<string, WebviewHost>();

export function registerQueryCommands(
  context: vscode.ExtensionContext,
  store: ConnectionStore,
  queryStore: QueryStore,
  queryService: QueryService
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('appInsightsExplorer.openTable', async (item: LogTableItem) => {
      const panelKey = `table:${item.connectionId}:${item.tableName}`;
      const existing = openPanels.get(panelKey);
      if (existing) {
        existing.reveal();
        return;
      }

      const connection = store.get(item.connectionId);
      if (!connection) return;

      const host = new WebviewHost(context, {
        viewType: 'appInsightsExplorer.logTable',
        title: `${item.label} - ${connection.displayName}`,
        bundleId: 'logTable',
        initData: {
          connectionId: item.connectionId,
          tableName: item.tableName,
          connectionName: connection.displayName
        }
      });

      openPanels.set(panelKey, host);
      host.onDispose(() => openPanels.delete(panelKey));

      host.onMessage(async (msg: any) => {
        if (msg.command === 'query') {
          try {
            const timeRange: TimeRangeValue = msg.timeRange ?? { range: '1h' };
            const result = await queryService.runTableQuery(
              item.connectionId,
              item.tableName,
              timeRange,
              msg.top ?? 50
            );
            host.post({ command: 'queryResult', data: result });
          } catch (e: any) {
            Logger.error('Table query failed', e.message);
            host.post({ command: 'queryError', error: e.message });
          }
        }
      });
    }),

    vscode.commands.registerCommand('appInsightsExplorer.openQueryEditor', async () => {
      const connection = store.getActive();
      if (!connection) {
        vscode.window.showWarningMessage('No active connection. Add a connection first.');
        return;
      }

      const panelKey = `kql:${connection.id}:${Date.now()}`;
      const host = new WebviewHost(context, {
        viewType: 'appInsightsExplorer.queryEditor',
        title: `KQL - ${connection.displayName}`,
        bundleId: 'queryEditor',
        initData: {
          connectionId: connection.id,
          connectionName: connection.displayName,
          connections: store.list().map(c => ({ id: c.id, name: c.displayName }))
        }
      });

      openPanels.set(panelKey, host);
      host.onDispose(() => openPanels.delete(panelKey));

      host.onMessage(async (msg: any) => {
        if (msg.command === 'runQuery') {
          try {
            const timeRange: TimeRangeValue = msg.timeRange ?? { range: '1h' };
            const result = await queryService.runQuery(
              msg.connectionId ?? connection.id,
              msg.kql,
              timeRange
            );
            host.post({ command: 'queryResult', data: result });
          } catch (e: any) {
            Logger.error('KQL query failed', e.message);
            host.post({ command: 'queryError', error: e.message });
          }
        } else if (msg.command === 'saveQuery') {
          const name = await vscode.window.showInputBox({
            title: 'Save Query',
            prompt: 'Enter a name for this query',
            placeHolder: 'My Query',
            ignoreFocusOut: true
          });
          if (!name) return;
          await queryStore.add(name, msg.kql, msg.connectionId);
          vscode.window.showInformationMessage(`Query "${name}" saved.`);
        }
      });
    }),

    vscode.commands.registerCommand('appInsightsExplorer.runQuery', async () => {
      // Trigger run in active query editor
      const editor = vscode.window.activeTextEditor;
      if (editor?.document.languageId === 'kql') {
        const kql = editor.document.getText();
        const connection = store.getActive();
        if (!connection) {
          vscode.window.showWarningMessage('No active connection.');
          return;
        }
        try {
          const result = await queryService.runQuery(connection.id, kql, { range: '1h' });
          // Open results in a new webview
          const host = new WebviewHost(context, {
            viewType: 'appInsightsExplorer.queryResults',
            title: 'Query Results',
            bundleId: 'queryResults',
            initData: { result }
          });
        } catch (e: any) {
          vscode.window.showErrorMessage(`Query failed: ${e.message}`);
        }
      }
    }),

    vscode.commands.registerCommand('appInsightsExplorer.saveQuery', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const kql = editor.document.getText();
      if (!kql.trim()) return;

      const name = await vscode.window.showInputBox({
        title: 'Save Query',
        prompt: 'Enter a name for this query',
        ignoreFocusOut: true
      });
      if (!name) return;

      const connection = store.getActive();
      await queryStore.add(name, kql, connection?.id);
      vscode.window.showInformationMessage(`Query "${name}" saved.`);
    }),

    vscode.commands.registerCommand('appInsightsExplorer.deleteQuery', async (item: SavedQueryItem) => {
      const query = queryStore.get(item.queryId);
      if (!query) return;
      const confirm = await vscode.window.showWarningMessage(
        `Delete query "${query.name}"?`,
        { modal: true },
        'Delete'
      );
      if (confirm !== 'Delete') return;
      await queryStore.remove(item.queryId);
    }),

    vscode.commands.registerCommand('appInsightsExplorer.runSavedQuery', async (item: SavedQueryItem) => {
      const query = queryStore.get(item.queryId);
      if (!query) return;

      const connectionId = query.connectionId ?? store.getActiveId();
      if (!connectionId) {
        vscode.window.showWarningMessage('No connection available to run this query.');
        return;
      }
      const connection = store.get(connectionId);
      if (!connection) return;

      const host = new WebviewHost(context, {
        viewType: 'appInsightsExplorer.queryEditor',
        title: `${query.name} - ${connection.displayName}`,
        bundleId: 'queryEditor',
        initData: {
          connectionId,
          connectionName: connection.displayName,
          connections: store.list().map(c => ({ id: c.id, name: c.displayName })),
          initialQuery: query.kql
        }
      });

      host.onMessage(async (msg: any) => {
        if (msg.command === 'runQuery') {
          try {
            const timeRange: TimeRangeValue = msg.timeRange ?? { range: '1h' };
            const result = await queryService.runQuery(
              msg.connectionId ?? connectionId,
              msg.kql,
              timeRange
            );
            host.post({ command: 'queryResult', data: result });
          } catch (e: any) {
            host.post({ command: 'queryError', error: e.message });
          }
        } else if (msg.command === 'saveQuery') {
          const name = await vscode.window.showInputBox({
            title: 'Save Query',
            prompt: 'Enter a name for this query',
            value: query.name,
            ignoreFocusOut: true
          });
          if (!name) return;
          await queryStore.add(name, msg.kql, msg.connectionId);
          vscode.window.showInformationMessage(`Query "${name}" saved.`);
        }
      });
    })
  );
}
