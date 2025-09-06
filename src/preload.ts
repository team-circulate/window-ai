import { contextBridge, ipcRenderer } from "electron";
import { WindowState, WindowAction } from "./types";
import { NotificationData, NotificationLog } from "./notificationService";

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

  // 通知関連のAPI
  sendNotification: (notificationData: NotificationData): Promise<boolean> => {
    return ipcRenderer.invoke("send-notification", notificationData);
  },

  sendTestNotification: (): Promise<boolean> => {
    return ipcRenderer.invoke("send-test-notification");
  },

  getNotificationLogs: (limit?: number): Promise<NotificationLog[]> => {
    return ipcRenderer.invoke("get-notification-logs", limit);
  },

  checkNotificationPermission: (): Promise<boolean> => {
    return ipcRenderer.invoke("check-notification-permission");
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
      sendNotification: (notificationData: NotificationData) => Promise<boolean>;
      sendTestNotification: () => Promise<boolean>;
      getNotificationLogs: (limit?: number) => Promise<NotificationLog[]>;
      checkNotificationPermission: () => Promise<boolean>;
    };
  }
}
