import { contextBridge, ipcRenderer } from "electron";
import { WindowState, WindowAction, CpuInfo } from "./types";
import { InstalledApp } from "./appScanner";

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

  getAppIconsBatch: (
    appNames: string[]
  ): Promise<Record<string, string | null>> => {
    return ipcRenderer.invoke("get-app-icons-batch", appNames);
  },

  quitApp: (appName: string): Promise<boolean> => {
    return ipcRenderer.invoke("quit-app", appName);
  },

  getCpuInfo: (): Promise<CpuInfo> => {
    return ipcRenderer.invoke("get-cpu-info");
  },

  // App scanner APIs
  getAppInfo: (appName: string): Promise<string[] | null> => {
    return ipcRenderer.invoke("get-app-info", appName);
  },

  getInstalledApps: (): Promise<InstalledApp[]> => {
    return ipcRenderer.invoke("get-installed-apps");
  },

  searchApps: (query: string): Promise<InstalledApp[]> => {
    return ipcRenderer.invoke("search-apps", query);
  },

  launchApp: (appName: string): Promise<boolean> => {
    return ipcRenderer.invoke("launch-app", appName);
  },

  launchAppByPath: (appPath: string): Promise<boolean> => {
    return ipcRenderer.invoke("launch-app-by-path", appPath);
  },

  analyzeApps: (
    appNames: string[]
  ): Promise<Array<{ name: string; observations: string[] }>> => {
    return ipcRenderer.invoke("analyze-apps", appNames);
  },

  completeOnboarding: (analyzedApps: string[]): Promise<boolean> => {
    return ipcRenderer.invoke("complete-onboarding", analyzedApps);
  },

  checkOnboarding: (): Promise<boolean> => {
    return ipcRenderer.invoke("check-onboarding");
  },

  checkNewApps: (): Promise<{ newAppsFound: boolean; apps: string[] }> => {
    return ipcRenderer.invoke("check-new-apps");
  },

  resetLocalData: (): Promise<boolean> => {
    return ipcRenderer.invoke("reset-local-data");
  },

  // Preset management
  savePreset: (name: string, description?: string): Promise<any> => {
    return ipcRenderer.invoke("save-preset", name, description);
  },

  getPresets: (): Promise<any[]> => {
    return ipcRenderer.invoke("get-presets");
  },

  loadPreset: (presetId: string): Promise<boolean> => {
    return ipcRenderer.invoke("load-preset", presetId);
  },

  deletePreset: (presetId: string): Promise<boolean> => {
    return ipcRenderer.invoke("delete-preset", presetId);
  },

  updatePreset: (
    presetId: string,
    name?: string,
    description?: string
  ): Promise<any> => {
    return ipcRenderer.invoke("update-preset", presetId, name, description);
  },

  // Task-based app suggestions
  suggestAppsForTask: (
    userPrompt: string
  ): Promise<{
    highConfidence: string[];
    lowConfidence: string[];
    reasoning: string;
  }> => {
    return ipcRenderer.invoke("suggest-apps-for-task", userPrompt);
  },

  openAppsForTask: (appNames: string[], taskName: string): Promise<any> => {
    return ipcRenderer.invoke("open-apps-for-task", appNames, taskName);
  },

  // Window and app management
  hideWindow: (): Promise<void> => {
    return ipcRenderer.invoke("hide-window");
  },

  focusApp: (appName: string): Promise<boolean> => {
    return ipcRenderer.invoke("focus-app", appName);
  },

  // App mode control
  appModeStart: (): Promise<void> => {
    return ipcRenderer.invoke("app-mode-start");
  },
  appModeEnd: (): Promise<void> => {
    return ipcRenderer.invoke("app-mode-end");
  },

  // Memory information
  getMemoryInfo: (): Promise<import("./types").MemoryInfo> => {
    return ipcRenderer.invoke("get-memory-info");
  },

  // Focus statistics
  getFocusStats: (): Promise<any> => {
    return ipcRenderer.invoke("get-focus-stats");
  },

  getDataInfo: (): Promise<any> => {
    return ipcRenderer.invoke("get-data-info");
  },

  // Notification system
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

  // User analysis APIs
  getUserProfile: (): Promise<any> => {
    return ipcRenderer.invoke("analyze-user-profile");
  },

  getOptimalLayouts: (): Promise<any> => {
    return ipcRenderer.invoke("generate-optimal-layouts");
  },

  getUserAnalysis: (): Promise<any> => {
    return ipcRenderer.invoke("get-user-analysis");
  },

  // Real-time event listeners
  onActiveAppChanged: (callback: (appName: string) => void) => {
    ipcRenderer.on("active-app-changed", (_, appName) => callback(appName));
  },

  onNewAnalysisNotification: (callback: (notification: any) => void) => {
    ipcRenderer.on("new-analysis-notification", (_, notification) =>
      callback(notification)
    );
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
      getAppIconsBatch: (
        appNames: string[]
      ) => Promise<Record<string, string | null>>;
      quitApp: (appName: string) => Promise<boolean>;
      getCpuInfo: () => Promise<CpuInfo>;

      // App scanner APIs
      getAppInfo: (appName: string) => Promise<string[] | null>;
      getInstalledApps: () => Promise<InstalledApp[]>;
      searchApps: (query: string) => Promise<InstalledApp[]>;
      launchApp: (appName: string) => Promise<boolean>;
      launchAppByPath: (appPath: string) => Promise<boolean>;
      analyzeApps: (
        appNames: string[]
      ) => Promise<Array<{ name: string; observations: string[] }>>;
      completeOnboarding: (analyzedApps: string[]) => Promise<boolean>;
      checkOnboarding: () => Promise<boolean>;
      checkNewApps: () => Promise<{ newAppsFound: boolean; apps: string[] }>;
      resetLocalData: () => Promise<boolean>;

      // Preset management
      savePreset: (name: string, description?: string) => Promise<any>;
      getPresets: () => Promise<any[]>;
      loadPreset: (presetId: string) => Promise<boolean>;
      deletePreset: (presetId: string) => Promise<boolean>;
      updatePreset: (
        presetId: string,
        name?: string,
        description?: string
      ) => Promise<any>;

      // Task-based app suggestions
      suggestAppsForTask: (userPrompt: string) => Promise<{
        highConfidence: string[];
        lowConfidence: string[];
        reasoning: string;
      }>;
      openAppsForTask: (appNames: string[], taskName: string) => Promise<any>;

      // Window and app management
      hideWindow: () => Promise<void>;
      focusApp: (appName: string) => Promise<boolean>;

      // App mode control
      appModeStart: () => Promise<void>;
      appModeEnd: () => Promise<void>;

      // Memory information
      getMemoryInfo: () => Promise<import("./types").MemoryInfo>;

      // Focus statistics
      getFocusStats: () => Promise<any>;
      getDataInfo: () => Promise<any>;

      // Notification system
      getNotifications: () => Promise<any[]>;
      markNotificationRead: (notificationId: string) => Promise<boolean>;
      getNotificationSettings: () => Promise<any>;
      saveNotificationSettings: (settings: any) => Promise<boolean>;
      getNotificationStats: () => Promise<any>;
      quitRecommendedApp: (appName: string) => Promise<boolean>;

      // Real-time event listeners
      onActiveAppChanged: (callback: (appName: string) => void) => void;
      onNewAnalysisNotification: (
        callback: (notification: any) => void
      ) => void;
    };
  }
}
