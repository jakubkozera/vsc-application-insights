import { VSCodeAPI } from '../types';

let vscodeApiInstance: VSCodeAPI | null = null;

function getVSCodeAPI(): VSCodeAPI {
  if (vscodeApiInstance) {
    return vscodeApiInstance;
  }

  if (typeof acquireVsCodeApi === 'undefined') {
    console.warn('VS Code API not available, using mock');
    vscodeApiInstance = {
      postMessage: (message: any) => console.log('Mock postMessage:', message),
      getState: () => ({}),
      setState: (state: any) => console.log('Mock setState:', state),
    };
  } else {
    vscodeApiInstance = acquireVsCodeApi();
  }

  return vscodeApiInstance;
}

export function useVSCodeAPI(): VSCodeAPI {
  return getVSCodeAPI();
}
