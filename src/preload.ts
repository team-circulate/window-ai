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

  getAppIconsBatch: (appNames: string[]): Promise<Record<string, string | null>> => {
    return ipcRenderer.invoke("get-app-icons-batch", appNames);
  },
  
  quitApp: (appName: string): Promise<boolean> => {
    return ipcRenderer.invoke("quit-app", appName);
  },

  getCpuInfo: (): Promise<CpuInfo> => {
    return ipcRenderer.invoke("get-cpu-info");
  },

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

  analyzeApps: (appNames: string[]): Promise<Array<{name: string, observations: string[]}>> => {
    return ipcRenderer.invoke("analyze-apps", appNames);
  },

  completeOnboarding: (analyzedApps: string[]): Promise<boolean> => {
    return ipcRenderer.invoke("complete-onboarding", analyzedApps);
  },

  checkOnboarding: (): Promise<boolean> => {
    return ipcRenderer.invoke("check-onboarding");
  },

  checkNewApps: (): Promise<{newAppsFound: boolean, apps: string[]}> => {
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

  updatePreset: (presetId: string, name?: string, description?: string): Promise<any> => {
    return ipcRenderer.invoke("update-preset", presetId, name, description);
  },

  // Task-based app suggestions
  suggestAppsForTask: (userPrompt: string): Promise<{
    highConfidence: string[];
    lowConfidence: string[];
    reasoning: string;
  }> => {
    return ipcRenderer.invoke("suggest-apps-for-task", userPrompt);
  },

  openAppsForTask: (appNames: string[], taskName: string): Promise<any> => {
    return ipcRenderer.invoke("open-apps-for-task", appNames, taskName);
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
      getAppIconsBatch: (appNames: string[]) => Promise<Record<string, string | null>>;
      quitApp: (appName: string) => Promise<boolean>;
      getCpuInfo: () => Promise<CpuInfo>;
      getAppInfo: (appName: string) => Promise<string[] | null>;
      getInstalledApps: () => Promise<InstalledApp[]>;
      searchApps: (query: string) => Promise<InstalledApp[]>;
      launchApp: (appName: string) => Promise<boolean>;
      launchAppByPath: (appPath: string) => Promise<boolean>;
      analyzeApps: (appNames: string[]) => Promise<Array<{name: string, observations: string[]}>>;
      completeOnboarding: (analyzedApps: string[]) => Promise<boolean>;
      checkOnboarding: () => Promise<boolean>;
      checkNewApps: () => Promise<{newAppsFound: boolean, apps: string[]}>;
      resetLocalData: () => Promise<boolean>;
      savePreset: (name: string, description?: string) => Promise<any>;
      getPresets: () => Promise<any[]>;
      loadPreset: (presetId: string) => Promise<boolean>;
      deletePreset: (presetId: string) => Promise<boolean>;
      updatePreset: (presetId: string, name?: string, description?: string) => Promise<any>;
      suggestAppsForTask: (userPrompt: string) => Promise<{
        highConfidence: string[];
        lowConfidence: string[];
        reasoning: string;
      }>;
      openAppsForTask: (appNames: string[], taskName: string) => Promise<any>;
    };
  }
}
