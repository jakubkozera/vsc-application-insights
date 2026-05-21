import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ColumnSettingsStore } from '../src/state/columnSettingsStore';

function createMockContext() {
  const state = new Map<string, any>();
  return {
    globalState: {
      get: vi.fn((key: string, def?: any) => state.get(key) ?? def),
      update: vi.fn(async (key: string, value: any) => { state.set(key, value); }),
    },
    secrets: {
      store: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    },
  } as any;
}

describe('ColumnSettingsStore', () => {
  let store: ColumnSettingsStore;

  beforeEach(() => {
    const ctx = createMockContext();
    store = new ColumnSettingsStore(ctx);
  });

  it('starts with empty presets', () => {
    expect(store.listPresets()).toEqual([]);
  });

  it('saves a new preset', async () => {
    const preset = await store.savePreset('Compact View', ['timestamp', 'name', 'status']);
    expect(preset.id).toBeDefined();
    expect(preset.name).toBe('Compact View');
    expect(preset.columns).toEqual(['timestamp', 'name', 'status']);
    expect(preset.createdAt).toBeDefined();
    expect(store.listPresets()).toHaveLength(1);
  });

  it('updates existing preset if same name', async () => {
    await store.savePreset('Compact', ['timestamp', 'name']);
    await store.savePreset('Compact', ['timestamp', 'name', 'duration']);
    expect(store.listPresets()).toHaveLength(1);
    expect(store.listPresets()[0].columns).toEqual(['timestamp', 'name', 'duration']);
  });

  it('saves multiple presets with different names', async () => {
    await store.savePreset('Compact', ['timestamp', 'name']);
    await store.savePreset('Detailed', ['timestamp', 'name', 'duration', 'url', 'status']);
    expect(store.listPresets()).toHaveLength(2);
  });

  it('gets a preset by id', async () => {
    const preset = await store.savePreset('Find Me', ['col1', 'col2']);
    expect(store.getPreset(preset.id)?.name).toBe('Find Me');
    expect(store.getPreset('nonexistent')).toBeUndefined();
  });

  it('deletes a preset', async () => {
    const preset = await store.savePreset('ToDelete', ['col1']);
    await store.deletePreset(preset.id);
    expect(store.listPresets()).toHaveLength(0);
  });

  it('updates a preset by id', async () => {
    const preset = await store.savePreset('Original', ['col1', 'col2']);
    await store.updatePreset(preset.id, ['col1', 'col2', 'col3']);
    expect(store.getPreset(preset.id)?.columns).toEqual(['col1', 'col2', 'col3']);
  });

  it('throws when updating nonexistent preset', async () => {
    await expect(store.updatePreset('bad-id', ['col1'])).rejects.toThrow('Preset not found');
  });

  it('fires onDidChange events', async () => {
    const handler = vi.fn();
    store.onDidChange(handler);
    await store.savePreset('p1', ['a']);
    expect(handler).toHaveBeenCalledTimes(1);
    await store.deletePreset(store.listPresets()[0].id);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
