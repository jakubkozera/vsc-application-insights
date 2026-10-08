import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { handleAnalyzeDataMessage, serializeRowsForExport } from '../src/commands/queryCommands';

const columns = [
  { key: 'timestamp', label: 'Timestamp' },
  { key: 'message', label: 'Message' },
];

describe('serializeRowsForExport', () => {
  it('creates CSV with a header and escapes special values', () => {
    const csv = serializeRowsForExport([
      { timestamp: '2024-01-01T00:00:00Z', message: 'Text with, comma and "quotes"' },
    ], columns, 'csv');

    expect(csv).toBe('Timestamp,Message\n2024-01-01T00:00:00Z,"Text with, comma and ""quotes"""');
  });

  it('creates an XML Spreadsheet document for Excel', () => {
    const excel = serializeRowsForExport([
      { timestamp: '2024-01-01T00:00:00Z', message: 'A < B & C' },
    ], columns, 'excel');

    expect(excel).toContain('<?mso-application progid="Excel.Sheet"?>');
    expect(excel).toContain('<Data ss:Type="String">Message</Data>');
    expect(excel).toContain('<Data ss:Type="String">A &lt; B &amp; C</Data>');
  });
});

describe('handleAnalyzeDataMessage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('silently writes chronological CSV with hidden fields and attaches it to agent chat', async () => {
    const executeCommand = vi.spyOn(vscode.commands, 'executeCommand');
    const information = vi.spyOn(vscode.window, 'showInformationMessage');
    const rows = [
      { timestamp: '2026-10-08T12:00:00Z', message: 'Failed, "request"', customDimensions: { operation: 'checkout' } },
      { timestamp: '2026-10-08T10:00:00Z', message: 'Started', customDimensions: { operation: 'checkout' } },
    ];

    await handleAnalyzeDataMessage({ rows, columns, fileName: '../requests' });

    expect(executeCommand).toHaveBeenCalledWith('workbench.action.chat.open', {
      mode: 'agent',
      attachFiles: [expect.objectContaining({ fsPath: expect.any(String) })],
      query: expect.stringContaining('from oldest to newest'),
    });
    const options = executeCommand.mock.calls[0][1] as { attachFiles: vscode.Uri[]; query: string };
    const filePath = options.attachFiles[0].fsPath;
    try {
      expect(path.dirname(filePath).startsWith(path.join(os.tmpdir(), 'app-insights-analysis-'))).toBe(true);
      expect(path.basename(filePath)).toBe('requests.csv');
      expect(options.query).toContain(filePath);
      const csv = await fs.promises.readFile(filePath, 'utf8');
      expect(csv).toContain('Timestamp,Message,customDimensions');
      expect(csv.indexOf('Started')).toBeLessThan(csv.indexOf('Failed'));
      expect(csv).toContain('"{""operation"":""checkout""}"');
      expect(rows[0].message).toBe('Failed, "request"');
      expect(information).not.toHaveBeenCalled();
    } finally {
      await fs.promises.rm(path.dirname(filePath), { recursive: true, force: true });
    }
  });

  it('does nothing for empty rows', async () => {
    const executeCommand = vi.spyOn(vscode.commands, 'executeCommand');
    await handleAnalyzeDataMessage({ rows: [], columns });
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('sorts TimeGenerated and leaves invalid or missing timestamps last in original order', async () => {
    vi.spyOn(fs.promises, 'mkdtemp').mockResolvedValue(path.join(os.tmpdir(), 'analysis-test'));
    const writeFile = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
    await handleAnalyzeDataMessage({
      rows: [
        { TimeGenerated: 'invalid', message: 'Invalid date' },
        { TimeGenerated: '2026-10-08T12:00:00Z', message: 'Last event' },
        { message: 'Missing date' },
        { TimeGenerated: '2026-10-08T10:00:00Z', message: 'First event' },
      ],
    });
    expect(writeFile.mock.calls[0][1]).toBe([
      'TimeGenerated,message',
      '2026-10-08T10:00:00Z,First event',
      '2026-10-08T12:00:00Z,Last event',
      'invalid,Invalid date',
      ',Missing date',
    ].join('\n'));
  });

  it('preserves row order when timestamps are unavailable', async () => {
    vi.spyOn(fs.promises, 'mkdtemp').mockResolvedValue(path.join(os.tmpdir(), 'analysis-test'));
    const writeFile = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
    await handleAnalyzeDataMessage({ rows: [{ message: 'First' }, { message: 'Second' }] });
    expect(writeFile.mock.calls[0][1]).toBe('message\nFirst\nSecond');
  });

  it('reports unavailable Copilot Chat', async () => {
    vi.spyOn(fs.promises, 'mkdtemp').mockResolvedValue(path.join(os.tmpdir(), 'analysis-test'));
    vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(vscode.commands, 'executeCommand').mockRejectedValue(new Error('Command not found'));
    const showError = vi.spyOn(vscode.window, 'showErrorMessage');
    await handleAnalyzeDataMessage({ rows: [{ message: 'First' }] });
    expect(showError).toHaveBeenCalledWith(expect.stringContaining('Make sure GitHub Copilot Chat is available'));
  });

  it('reports failures without opening chat', async () => {
    vi.spyOn(fs.promises, 'mkdtemp').mockRejectedValue(new Error('Access denied'));
    const executeCommand = vi.spyOn(vscode.commands, 'executeCommand');
    const showError = vi.spyOn(vscode.window, 'showErrorMessage');
    await handleAnalyzeDataMessage({ rows: [{ message: 'Failure' }], columns });
    expect(executeCommand).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith(expect.stringContaining('Access denied'));
  });
});