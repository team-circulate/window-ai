import { contextBridge, ipcRenderer } from "electron";
import { WindowState, WindowAction, CpuInfo } from "./types";

contextBridge.exposeInMainWorld("windowAPI", {
  getWindowState: (): Promise<WindowState> => {
    return ipcRenderer.invoke("get-window-state");
  },

  analyzeWindows: (userIntent: string): Promise<WindowAction[]> => {
    return ipcRenderer.invoke("analyze-windows", userIntent);
  },

  executeAction: (action: WindowAction): Promise<boolean> => {
    return ipcRenderer.invoke("execute-action", action);
  },

  executeActions: (actions: WindowAction[]): Promise<boolean[]> => {
    return ipcRenderer.invoke("execute-actions", actions);
  },

  getAppIcon: (appName: string): Promise<string | null> => {
    return ipcRenderer.invoke("get-app-icon", appName);
  },
  
  quitApp: (appName: string): Promise<boolean> => {
    return ipcRenderer.invoke("quit-app", appName);
  },

  getCpuInfo: (): Promise<CpuInfo> => {
    return ipcRenderer.invoke("get-cpu-info");
  },
  
  hideWindow: (): Promise<void> => {
    return ipcRenderer.invoke("hide-window");
  },
  
  focusApp: (appName: string): Promise<boolean> => {
    return ipcRenderer.invoke("focus-app", appName);
  },

  // Appモード開始/終了をメインプロセスへ通知
  appModeStart: (): Promise<void> => {
    return ipcRenderer.invoke("app-mode-start");
  },
  appModeEnd: (): Promise<void> => {
    return ipcRenderer.invoke("app-mode-end");
  },

  // メモリ情報取得
  getMemoryInfo: (): Promise<import("./types").MemoryInfo> => {
    return ipcRenderer.invoke("get-memory-info");
  },
});

declare global {
  interface Window {
    windowAPI: {
      getWindowState: () => Promise<WindowState>;
      analyzeWindows: (userIntent: string) => Promise<WindowAction[]>;
      executeAction: (action: WindowAction) => Promise<boolean>;
      executeActions: (actions: WindowAction[]) => Promise<boolean[]>;
      getAppIcon: (appName: string) => Promise<string | null>;
      quitApp: (appName: string) => Promise<boolean>;
      getCpuInfo: () => Promise<CpuInfo>;
      hideWindow: () => Promise<void>;
      focusApp: (appName: string) => Promise<boolean>;
    };
  }
}
