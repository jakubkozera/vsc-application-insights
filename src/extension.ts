import * as vscode from 'vscode';
import { Logger } from './logging/logger';
import { ConnectionStore } from './state/connectionStore';
import { QueryStore } from './state/queryStore';
import { ColumnSettingsStore } from './state/columnSettingsStore';
import { ClientFactory } from './services/clientFactory';
import { QueryService } from './services/queryService';
import { AvailabilityHealthMonitor } from './services/availabilityHealthMonitor';
import { ConnectionsTreeProvider } from './providers/connectionsTreeProvider';
import { SavedQueriesTreeProvider } from './providers/savedQueriesTreeProvider';
import { setExtensionUri } from './providers/treeItems';
import { registerConnectionCommands } from './commands/connectionCommands';
import { registerQueryCommands } from './commands/queryCommands';

let factoryRef: ClientFactory | undefined;

export function activate(context: vscode.ExtensionContext): void {
  Logger.info('App Insights Explorer activating');

  setExtensionUri(context.extensionUri);

  const connectionStore = new ConnectionStore(context);
  const queryStore = new QueryStore(context);
  const columnSettingsStore = new ColumnSettingsStore(context);
  const factory = new ClientFactory(connectionStore);
  factoryRef = factory;
  const queryService = new QueryService(connectionStore, factory);
  const availabilityMonitor = new AvailabilityHealthMonitor(connectionStore, queryService);

  // Tree views
  const connectionsTree = new ConnectionsTreeProvider(connectionStore, availabilityMonitor);
  const savedQueriesTree = new SavedQueriesTreeProvider(queryStore);

  const connectionsView = vscode.window.createTreeView('appInsightsExplorer.connectionsView', {
    treeDataProvider: connectionsTree,
    showCollapseAll: true
  });
  context.subscriptions.push(connectionsView);

  const updateConnectionsBadge = () => {
    const failingCount = availabilityMonitor.getTotalFailingCount();
    connectionsView.badge = failingCount > 0
      ? {
        value: failingCount,
        tooltip: `${failingCount} failing availability health check${failingCount === 1 ? '' : 's'}`
      }
      : undefined;
  };

  availabilityMonitor.onDidChange(updateConnectionsBadge);

  const updateHealthMonitor = () => {
    const enabled = vscode.workspace.getConfiguration('appInsightsExplorer').get<boolean>('availabilityHealthChecks.enabled', true);
    if (enabled) {
      availabilityMonitor.start();
    } else {
      availabilityMonitor.stop();
    }
    updateConnectionsBadge();
  };

  connectionStore.onDidChange(() => {
    const enabled = vscode.workspace.getConfiguration('appInsightsExplorer').get<boolean>('availabilityHealthChecks.enabled', true);
    if (enabled) {
      void availabilityMonitor.refreshNow();
    }
  });

  context.subscriptions.push(
    availabilityMonitor,
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('appInsightsExplorer.availabilityHealthChecks')) {
        updateHealthMonitor();
      }
    })
  );

  const savedQueriesView = vscode.window.createTreeView('appInsightsExplorer.savedQueriesView', {
    treeDataProvider: savedQueriesTree
  });
  context.subscriptions.push(savedQueriesView);

  // Status bar
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBar.command = 'appInsightsExplorer.focus';
  const updateStatusBar = () => {
    const active = connectionStore.getActive();
    if (active) {
      statusBar.text = `$(plug) ${active.displayName}`;
      statusBar.tooltip = `App Insights: ${active.displayName}`;
      statusBar.show();
    } else {
      statusBar.hide();
    }
  };
  connectionStore.onDidChange(updateStatusBar);
  updateStatusBar();
  context.subscriptions.push(statusBar);

  updateHealthMonitor();

  // Commands
  registerConnectionCommands(context, connectionStore, factory, connectionsTree);
  registerQueryCommands(context, connectionStore, queryStore, queryService, columnSettingsStore);

  context.subscriptions.push(
    vscode.commands.registerCommand('appInsightsExplorer.focus', () => {
      void vscode.commands.executeCommand('appInsightsExplorer.connectionsView.focus');
    })
  );

  Logger.info(`Activated with ${connectionStore.list().length} connection(s)`);
}

export async function deactivate(): Promise<void> {
  Logger.info('App Insights Explorer deactivating');
  if (factoryRef) {
    factoryRef.dispose();
  }
  Logger.dispose();
}
