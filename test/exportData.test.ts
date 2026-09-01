import { describe, expect, it } from 'vitest';
import { serializeRowsForExport } from '../src/commands/queryCommands';

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