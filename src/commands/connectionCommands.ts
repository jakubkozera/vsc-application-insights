import * as vscode from 'vscode';
import { ConnectionStore } from '../state/connectionStore';
import { ClientFactory } from '../services/clientFactory';
import { ConnectionsTreeProvider } from '../providers/connectionsTreeProvider';
import { ConnectionItem } from '../providers/treeItems';
import { AuthMode } from '../models/connection';
import { Logger } from '../logging/logger';

export function registerConnectionCommands(
  context: vscode.ExtensionContext,
  store: ConnectionStore,
  factory: ClientFactory,
  tree: ConnectionsTreeProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('appInsightsExplorer.addConnection', async () => {
      const name = await vscode.window.showInputBox({
        title: 'Connection Name',
        prompt: 'Enter a friendly name for this connection',
        placeHolder: 'e.g. Production API',
        ignoreFocusOut: true
      });
      if (!name) return;

      const resourceType = await vscode.window.showQuickPick(
        [
          { label: 'Application Insights', value: 'appInsights' as const },
          { label: 'Log Analytics Workspace', value: 'logAnalytics' as const }
        ],
        { title: 'Resource Type', placeHolder: 'Select the resource type', ignoreFocusOut: true }
      );
      if (!resourceType) return;

      const authMode = await vscode.window.showQuickPick(
        [
          { label: 'Microsoft Entra ID (recommended)', value: 'aad' as const },
          { label: 'API Key', value: 'apikey' as const }
        ],
        { title: 'Authentication', placeHolder: 'How to authenticate', ignoreFocusOut: true }
      );
      if (!authMode) return;

      const resourceIdPrompt = resourceType.value === 'appInsights'
        ? 'Enter the Application ID (from API Access blade)'
        : 'Enter the Workspace ID';

      const resourceId = await vscode.window.showInputBox({
        title: resourceType.value === 'appInsights' ? 'Application ID' : 'Workspace ID',
        prompt: resourceIdPrompt,
        placeHolder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        ignoreFocusOut: true
      });
      if (!resourceId) return;

      let secret: string | undefined;
      let tenantId: string | undefined;

      if (authMode.value === 'apikey') {
        secret = await vscode.window.showInputBox({
          title: 'API Key',
          prompt: 'Enter the API key',
          password: true,
          ignoreFocusOut: true
        });
        if (!secret) return;
      } else {
        tenantId = await vscode.window.showInputBox({
          title: 'Tenant ID (optional)',
          prompt: 'Enter Azure AD tenant ID, or leave empty for default',
          placeHolder: 'Leave empty for default tenant',
          ignoreFocusOut: true
        });
      }

      try {
        await store.add({
          displayName: name,
          resourceId,
          resourceType: resourceType.value,
          authMode: authMode.value,
          tenantId: tenantId || undefined
        }, secret);
        vscode.window.showInformationMessage(`Connection "${name}" added.`);
      } catch (e: any) {
        Logger.error('Failed to add connection', e.message);
        vscode.window.showErrorMessage(`Failed to add connection: ${e.message}`);
      }
    }),

    vscode.commands.registerCommand('appInsightsExplorer.removeConnection', async (item: ConnectionItem) => {
      const confirm = await vscode.window.showWarningMessage(
        `Remove connection "${item.meta.displayName}"?`,
        { modal: true },
        'Remove'
      );
      if (confirm !== 'Remove') return;

      factory.invalidate(item.meta.id);
      await store.remove(item.meta.id);
      vscode.window.showInformationMessage(`Connection "${item.meta.displayName}" removed.`);
    }),

    vscode.commands.registerCommand('appInsightsExplorer.editConnection', async (item: ConnectionItem) => {
      const name = await vscode.window.showInputBox({
        title: 'Connection Name',
        prompt: 'Update the friendly name',
        value: item.meta.displayName,
        ignoreFocusOut: true
      });
      if (!name) return;

      const updated = { ...item.meta, displayName: name };
      await store.update(updated);
      factory.invalidate(item.meta.id);
    }),

    vscode.commands.registerCommand('appInsightsExplorer.setActiveConnection', async (item: ConnectionItem) => {
      await store.setActive(item.meta.id);
      vscode.window.showInformationMessage(`Active connection: "${item.meta.displayName}"`);
    }),

    vscode.commands.registerCommand('appInsightsExplorer.refreshTree', () => {
      tree.refresh();
    })
  );
}
