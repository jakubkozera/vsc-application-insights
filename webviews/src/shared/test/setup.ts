/// <reference types="vitest/globals" />
import '@testing-library/jest-dom';

// Mock VS Code webview API
const vscode = {
  postMessage: vi.fn(),
  getState: vi.fn(() => undefined),
  setState: vi.fn(),
};

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

(window as any).acquireVsCodeApi = vi.fn(() => vscode);
(window as any).ResizeObserver = ResizeObserverMock;
