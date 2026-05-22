import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RowDetailPanel } from '../src/shared/components/RowDetailPanel/RowDetailPanel';

describe('RowDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('keeps Row tab active by default even when call stack is available', () => {
    const row = {
      type: 'System.Net.Http.HttpRequestException',
      message: 'Failed to retrieve Project',
      details: JSON.stringify([
        {
          type: 'System.Net.Http.HttpRequestException',
          message: 'Response status code does not indicate success: 404 (Not Found).',
          parsedStack: [
            {
              assembly: 'Heineken.ATC.SSP.VSTS.Business, Version=1.0.0.0',
              method: 'Heineken.ATC.SSP.VSTS.Business.Helpers.RetryHelper+<DoWork>d__3.MoveNext',
              level: 1,
              line: 28,
              fileName: 'C:\\Agents\\_work\\107\\s\\RetryHelper.cs'
            }
          ]
        }
      ])
    };

    render(<RowDetailPanel row={row} />);

    expect(screen.getByText('Row')).toBeInTheDocument();
    expect(screen.getByText('Call Stack')).toBeInTheDocument();
    expect(screen.getByText('"details"')).toBeInTheDocument();
    expect(screen.queryByText('Just My Code')).not.toBeInTheDocument();
  });
});