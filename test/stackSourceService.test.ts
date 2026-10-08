import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFiles: vi.fn(),
  openTextDocument: vi.fn(),
  showTextDocument: vi.fn(),
  showWarningMessage: vi.fn(),
  folders: [{ uri: { fsPath: 'C:/repo' } }]
}));

vi.mock('vscode', () => ({
  workspace: {
    get workspaceFolders() { return mocks.folders; },
    findFiles: mocks.findFiles,
    openTextDocument: mocks.openTextDocument
  },
  window: { showTextDocument: mocks.showTextDocument, showWarningMessage: mocks.showWarningMessage },
  RelativePattern: class { constructor(public base: unknown, public pattern: string) {} },
  Position: class { constructor(public line: number, public character: number) {} },
  Range: class { constructor(public start: unknown, public end: unknown) {} },
  ViewColumn: { One: 1 }
}));

import { openStackSource, resolveStackSources } from '../src/services/stackSourceService';

function uri(fsPath: string) {
  return { fsPath, toString: () => fsPath };
}

describe('stack source navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.folders = [{ uri: { fsPath: 'C:/repo' } }];
    mocks.findFiles.mockResolvedValue([]);
    mocks.openTextDocument.mockResolvedValue({ lineCount: 400 });
  });

  it('maps a Windows CI path to the longest matching workspace suffix', async () => {
    const source = 'C:\\Agents\\_work\\145\\s\\Project\\src\\Business\\API\\CloudRestApi.cs';
    const match = uri('C:/repo/src/Business/API/CloudRestApi.cs');
    mocks.findFiles.mockResolvedValue([uri('C:/repo/tests/CloudRestApi.cs'), match]);
    expect((await resolveStackSources([source])).get(source)).toEqual(match);
  });

  it('supports Linux paths and a unique basename when directories differ', async () => {
    const source = '/build/src/API/CloudRestApi.cs';
    const match = uri('/repo/other/CloudRestApi.cs');
    mocks.findFiles.mockResolvedValue([match]);
    expect((await resolveStackSources([source])).get(source)).toEqual(match);
  });

  it('does not guess when the best matches are ambiguous', async () => {
    mocks.findFiles.mockResolvedValue([uri('C:/one/API/CloudRestApi.cs'), uri('C:/two/API/CloudRestApi.cs')]);
    expect((await resolveStackSources(['C:/build/API/CloudRestApi.cs'])).size).toBe(0);
  });

  it('does not resolve missing files or an empty workspace', async () => {
    expect((await resolveStackSources(['missing.cs'])).size).toBe(0);
    mocks.folders = [];
    mocks.findFiles.mockClear();
    expect((await resolveStackSources(['missing.cs'])).size).toBe(0);
    expect(mocks.findFiles).not.toHaveBeenCalled();
  });

  it('searches every workspace folder and shares searches for repeated filenames', async () => {
    mocks.folders = [{ uri: { fsPath: 'C:/one' } }, { uri: { fsPath: 'C:/two' } }];
    mocks.findFiles.mockResolvedValue([uri('C:/two/API/CloudRestApi.cs')]);
    const result = await resolveStackSources(['C:/build/API/CloudRestApi.cs', 'D:/build/API/CloudRestApi.cs']);
    expect(result.size).toBe(2);
    expect(mocks.findFiles).toHaveBeenCalledTimes(2);
  });

  it('opens the resolved document at the one-based stack line', async () => {
    const match = uri('C:/repo/API/CloudRestApi.cs');
    mocks.findFiles.mockResolvedValue([match]);
    await openStackSource('C:/build/API/CloudRestApi.cs', 268);
    expect(mocks.openTextDocument).toHaveBeenCalledWith(match);
    expect(mocks.showTextDocument).toHaveBeenCalledWith({ lineCount: 400 }, expect.objectContaining({
      selection: { start: { line: 267, character: 0 }, end: { line: 267, character: 0 } }
    }));
  });

  it('clamps lines beyond the local version and warns if the file disappeared', async () => {
    mocks.findFiles.mockResolvedValue([uri('C:/repo/File.cs')]);
    mocks.openTextDocument.mockResolvedValue({ lineCount: 10 });
    await openStackSource('File.cs', 500);
    expect(mocks.showTextDocument).toHaveBeenCalledWith({ lineCount: 10 }, expect.objectContaining({
      selection: { start: { line: 9, character: 0 }, end: { line: 9, character: 0 } }
    }));
    mocks.findFiles.mockResolvedValue([]);
    await openStackSource('File.cs', 2);
    expect(mocks.showWarningMessage).toHaveBeenCalled();
    expect(mocks.showTextDocument).toHaveBeenCalledTimes(1);
  });
});