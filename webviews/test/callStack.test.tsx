import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { CallStack } from '../src/shared/components/CallStack/CallStack';

const { vscodeApi } = vi.hoisted(() => ({ vscodeApi: { postMessage: vi.fn() } }));
const postMessage = vscodeApi.postMessage;
vi.mock('../src/shared/hooks/useVSCodeAPI', () => ({ useVSCodeAPI: () => vscodeApi }));

function resolveSources(fileNames: string[], requestId?: string) {
  const request = postMessage.mock.calls.filter(([message]) => message.command === 'resolveStackSources').at(-1)![0];
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { command: 'stackSourcesResolved', requestId: requestId ?? request.requestId, fileNames }
    }));
  });
}

const SAMPLE_DETAILS = JSON.stringify([{
  outerId: '0',
  message: 'Response status code does not indicate success: 404 (Not Found).',
  type: 'System.Net.Http.HttpRequestException',
  id: '19594466',
  parsedStack: [
    {
      assembly: 'System.Net.Http, Version=8.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a',
      method: 'System.Net.Http.HttpResponseMessage.EnsureSuccessStatusCode',
      level: 0,
      line: 0
    },
    {
      assembly: 'Heineken.ATC.SSP.VSTS.Business, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null',
      method: 'Heineken.ATC.SSP.VSTS.Business.Helpers.RetryHelper+<DoWork>d__3.MoveNext',
      level: 1,
      line: 28,
      fileName: 'C:\\Agents\\_work\\107\\s\\src\\Helpers\\RetryHelper.cs'
    },
    {
      assembly: 'System.Private.CoreLib, Version=8.0.0.0, Culture=neutral, PublicKeyToken=7cec85d7bea7798e',
      method: 'System.Runtime.ExceptionServices.ExceptionDispatchInfo.Throw',
      level: 2,
      line: 0
    },
    {
      assembly: 'System.Private.CoreLib, Version=8.0.0.0, Culture=neutral, PublicKeyToken=7cec85d7bea7798e',
      method: 'System.Runtime.CompilerServices.TaskAwaiter.ThrowForNonSuccess',
      level: 3,
      line: 0
    },
    {
      assembly: 'Heineken.ATC.SSP.VSTS.Business, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null',
      method: 'Heineken.ATC.SSP.VSTS.Business.VstsApi+<GetProject>d__24.MoveNext',
      level: 4,
      line: 278,
      fileName: 'C:\\Agents\\_work\\107\\s\\src\\VSTSApi.cs'
    }
  ],
  severityLevel: 'Error'
}]);

describe('CallStack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('renders exception type and message', () => {
    render(<CallStack details={SAMPLE_DETAILS} />);
    expect(screen.getByText('System.Net.Http.HttpRequestException')).toBeInTheDocument();
    expect(screen.getByText('Response status code does not indicate success: 404 (Not Found).')).toBeInTheDocument();
  });

  it('shows Just My Code by default (hides system frames)', () => {
    render(<CallStack details={SAMPLE_DETAILS} />);
    // User code frames should be visible
    expect(screen.getByText(/RetryHelper.*MoveNext/)).toBeInTheDocument();
    expect(screen.getByText(/VstsApi.*MoveNext/)).toBeInTheDocument();
    // System frames should be collapsed
    expect(screen.queryByText(/ExceptionDispatchInfo.Throw/)).not.toBeInTheDocument();
    expect(screen.queryByText(/TaskAwaiter.ThrowForNonSuccess/)).not.toBeInTheDocument();
  });

  it('shows external frames indicator when Just My Code is active', () => {
    render(<CallStack details={SAMPLE_DETAILS} />);
    // Should show collapsed system frames count
    const indicators = screen.getAllByText(/external frame/);
    expect(indicators.length).toBeGreaterThan(0);
  });

  it('shows all frames when Just My Code is toggled off', () => {
    render(<CallStack details={SAMPLE_DETAILS} />);
    fireEvent.click(screen.getByTitle('Show all code'));
    // System frames should now be visible
    expect(screen.getByText(/ExceptionDispatchInfo.Throw/)).toBeInTheDocument();
    expect(screen.getByText(/TaskAwaiter.ThrowForNonSuccess/)).toBeInTheDocument();
  });

  it('shows file locations for user code frames', () => {
    render(<CallStack details={SAMPLE_DETAILS} />);
    expect(screen.getByText('RetryHelper.cs:28')).toBeInTheDocument();
    expect(screen.getByText('VSTSApi.cs:278')).toBeInTheDocument();
  });

  it('copies stack trace to clipboard', () => {
    render(<CallStack details={SAMPLE_DETAILS} />);
    fireEvent.click(screen.getByTitle('Copy stack trace'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('System.Net.Http.HttpRequestException')
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('at System.Net.Http.HttpResponseMessage.EnsureSuccessStatusCode')
    );
  });

  it('displays empty state for invalid details', () => {
    render(<CallStack details="not valid json" />);
    expect(screen.getByText('No stack trace available')).toBeInTheDocument();
  });

  it('displays empty state for empty details', () => {
    render(<CallStack details="" />);
    expect(screen.getByText('No stack trace available')).toBeInTheDocument();
  });

  it('handles details with no parsedStack', () => {
    const details = JSON.stringify([{ type: 'SomeException', message: 'oops' }]);
    render(<CallStack details={details} />);
    expect(screen.getByText('SomeException')).toBeInTheDocument();
    expect(screen.getByText('oops')).toBeInTheDocument();
  });

  it('requests workspace availability and only shows buttons for resolved files', () => {
    render(<CallStack details={SAMPLE_DETAILS} />);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      command: 'resolveStackSources',
      fileNames: ['C:\\Agents\\_work\\107\\s\\src\\Helpers\\RetryHelper.cs', 'C:\\Agents\\_work\\107\\s\\src\\VSTSApi.cs']
    }));
    expect(screen.queryByTitle('Open source in workspace')).not.toBeInTheDocument();
    resolveSources(['C:\\Agents\\_work\\107\\s\\src\\Helpers\\RetryHelper.cs']);
    expect(screen.getAllByTitle('Open source in workspace')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open RetryHelper.cs:28 in workspace' }));
    expect(postMessage).toHaveBeenCalledWith({
      command: 'openStackSource', fileName: 'C:\\Agents\\_work\\107\\s\\src\\Helpers\\RetryHelper.cs', line: 28
    });
  });

  it('ignores unrelated and stale availability responses when details change', () => {
    const { rerender } = render(<CallStack details={SAMPLE_DETAILS} />);
    const oldRequestId = postMessage.mock.calls[0][0].requestId;
    resolveSources(['C:\\Agents\\_work\\107\\s\\src\\Helpers\\RetryHelper.cs'], 'unrelated');
    expect(screen.queryByTitle('Open source in workspace')).not.toBeInTheDocument();
    resolveSources(['C:\\Agents\\_work\\107\\s\\src\\Helpers\\RetryHelper.cs']);
    expect(screen.getByTitle('Open source in workspace')).toBeInTheDocument();
    rerender(<CallStack details={SAMPLE_DETAILS.replace('404 (Not Found)', '500 (Server Error)')} />);
    expect(screen.queryByTitle('Open source in workspace')).not.toBeInTheDocument();
    resolveSources(['C:\\Agents\\_work\\107\\s\\src\\Helpers\\RetryHelper.cs'], oldRequestId);
    expect(screen.queryByTitle('Open source in workspace')).not.toBeInTheDocument();
  });

  it('supports Unix filenames and cleans up the listener after unmount', () => {
    const details = JSON.stringify([{ type: 'Error', message: 'oops', parsedStack: [
      { assembly: 'App', method: 'App.Run', level: 0, line: 42, fileName: '/build/src/File.cs' }
    ] }]);
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<CallStack details={details} />);
    expect(screen.getByText('File.cs:42')).toBeInTheDocument();
    resolveSources(['/build/src/File.cs']);
    expect(screen.getByRole('button', { name: 'Open File.cs:42 in workspace' })).toBeInTheDocument();
    unmount();
    expect(removeListener).toHaveBeenCalledWith('message', expect.any(Function));
    removeListener.mockRestore();
  });

  it('does not search for frames without source locations', () => {
    render(<CallStack details={JSON.stringify([{ type: 'Error', message: 'oops' }])} />);
    expect(postMessage).not.toHaveBeenCalled();
  });
});
