import type { AccessToken, GetTokenOptions, TokenCredential } from '@azure/core-auth';
import * as vscode from 'vscode';

/**
 * Uses the VS Code built-in Microsoft authentication provider to get tokens.
 */
export class VsCodeCredential implements TokenCredential {
  constructor(private readonly tenantId?: string) {}

  async getToken(_scopes: string | string[], _options?: GetTokenOptions): Promise<AccessToken> {
    const scopes = Array.isArray(_scopes) ? _scopes : [_scopes];
    const session = await vscode.authentication.getSession(
      'microsoft',
      scopes,
      { createIfNone: true }
    );

    if (!session) {
      throw new Error('Failed to get Microsoft authentication session');
    }

    return {
      token: session.accessToken,
      expiresOnTimestamp: Date.now() + 3600000 // sessions don't expose expiry
    };
  }
}
