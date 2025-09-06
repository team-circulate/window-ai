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

  // フォーカス統計関連
  getFocusStats: (): Promise<any> => {
    return ipcRenderer.invoke("get-focus-stats");
  },

  getDataInfo: (): Promise<any> => {
    return ipcRenderer.invoke("get-data-info");
  },

  // 通知システム関連
  getNotifications: (): Promise<any[]> => {
    return ipcRenderer.invoke("get-notifications");
  },

  markNotificationRead: (notificationId: string): Promise<boolean> => {
    return ipcRenderer.invoke("mark-notification-read", notificationId);
  },

  getNotificationSettings: (): Promise<any> => {
    return ipcRenderer.invoke("get-notification-settings");
  },

  saveNotificationSettings: (settings: any): Promise<boolean> => {
    return ipcRenderer.invoke("save-notification-settings", settings);
  },

  getNotificationStats: (): Promise<any> => {
    return ipcRenderer.invoke("get-notification-stats");
  },

  quitRecommendedApp: (appName: string): Promise<boolean> => {
    return ipcRenderer.invoke("quit-recommended-app", appName);
  },

  // リアルタイム更新のためのイベントリスナー
  onActiveAppChanged: (callback: (appName: string) => void) => {
    ipcRenderer.on('active-app-changed', (_, appName) => callback(appName));
  },

  onNewAnalysisNotification: (callback: (notification: any) => void) => {
    ipcRenderer.on('new-analysis-notification', (_, notification) => callback(notification));
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
      getFocusStats: () => Promise<any>;
      getDataInfo: () => Promise<any>;
      getNotifications: () => Promise<any[]>;
      markNotificationRead: (notificationId: string) => Promise<boolean>;
      getNotificationSettings: () => Promise<any>;
      saveNotificationSettings: (settings: any) => Promise<boolean>;
      getNotificationStats: () => Promise<any>;
      quitRecommendedApp: (appName: string) => Promise<boolean>;
      onActiveAppChanged: (callback: (appName: string) => void) => void;
      onNewAnalysisNotification: (callback: (notification: any) => void) => void;
    };
  }
}
