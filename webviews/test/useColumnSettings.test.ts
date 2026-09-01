import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useColumnSettings } from '../src/shared/hooks/useColumnSettings';

describe('useColumnSettings - last preset persistence', () => {
  let messageHandler: ((msg: any) => void) | undefined;
  const postMessage = vi.fn();
  const subscribe = vi.fn((handler: (msg: any) => void) => {
    messageHandler = handler;
    return () => { messageHandler = undefined; };
  });

  const allColumns = [
    { name: 'timestamp', type: 'datetime' },
    { name: 'name', type: 'string' },
    { name: 'status', type: 'int' },
  ];

  beforeEach(() => {
    postMessage.mockClear();
    subscribe.mockClear();
    messageHandler = undefined;
  });

  it('requests presets on mount', () => {
    renderHook(() => useColumnSettings({ allColumns, postMessage, subscribe }));
    expect(postMessage).toHaveBeenCalledWith({ command: 'getColumnPresets' });
  });

  it('auto-applies the last used preset once presets and columns are available', async () => {
    const { result } = renderHook(() => useColumnSettings({ allColumns, postMessage, subscribe }));

    act(() => {
      messageHandler?.({
        command: 'columnPresets',
        presets: [{ id: 'p1', name: 'Compact', columns: ['name', 'status'] }],
        lastPresetId: 'p1',
      });
    });

    await waitFor(() => {
      expect(result.current.visibleColumns.map(c => c.name)).toEqual(['name', 'status']);
    });
  });

  it('does not auto-apply when no last preset id is returned', async () => {
    const { result } = renderHook(() => useColumnSettings({ allColumns, postMessage, subscribe }));

    act(() => {
      messageHandler?.({
        command: 'columnPresets',
        presets: [{ id: 'p1', name: 'Compact', columns: ['name'] }],
      });
    });

    await waitFor(() => {
      expect(result.current.columnConfig.length).toBe(allColumns.length);
    });
    expect(result.current.visibleColumns.map(c => c.name).sort()).toEqual(['name', 'status', 'timestamp']);
  });

  it('persists the active preset id when a preset is loaded', () => {
    const { result } = renderHook(() => useColumnSettings({ allColumns, postMessage, subscribe }));
    const preset = { id: 'p2', name: 'Detailed', columns: ['timestamp', 'name'] };

    act(() => {
      result.current.handleLoadPreset(preset);
    });

    expect(postMessage).toHaveBeenCalledWith({ command: 'setActiveColumnPreset', id: 'p2' });
  });

  it('does not repeatedly re-apply the auto-loaded preset after manual changes', async () => {
    const { result } = renderHook(() => useColumnSettings({ allColumns, postMessage, subscribe }));

    act(() => {
      messageHandler?.({
        command: 'columnPresets',
        presets: [{ id: 'p1', name: 'Compact', columns: ['name'] }],
        lastPresetId: 'p1',
      });
    });

    await waitFor(() => {
      expect(result.current.visibleColumns.map(c => c.name)).toEqual(['name']);
    });

    act(() => {
      result.current.handleColumnsChange([
        { name: 'timestamp', visible: true },
        { name: 'name', visible: true },
        { name: 'status', visible: true },
      ]);
    });

    // Re-delivering the same presets/lastPresetId message must not undo the manual change
    act(() => {
      messageHandler?.({
        command: 'columnPresets',
        presets: [{ id: 'p1', name: 'Compact', columns: ['name'] }],
        lastPresetId: 'p1',
      });
    });

    expect(result.current.visibleColumns.map(c => c.name).sort()).toEqual(['name', 'status', 'timestamp']);
  });
});
