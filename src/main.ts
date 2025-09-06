import {
  app,
  BrowserWindow,
  ipcMain,
  systemPreferences,
  dialog,
} from "electron";
import * as path from "path";
import * as dotenv from "dotenv";
import { WindowManager } from "./windowManager";
import { ClaudeService } from "./claudeService";
import { AppScanner } from "./appScanner";
import { GraphManager } from "./graphManager";
import { IconExtractor } from "./iconExtractor";
import { WindowState, WindowAction } from "./types";

let mainWindow: BrowserWindow | null = null;
let windowManager: WindowManager;
let claudeService: ClaudeService;
let appScanner: AppScanner;
let graphManager: GraphManager;
let iconExtractor: IconExtractor;

async function createWindow(loadOnboarding: boolean = false) {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    titleBarStyle: "hiddenInset",
    vibrancy: "sidebar",
    backgroundColor: "#00000000",
    alwaysOnTop: false,
  });

  // オンボーディング状態に応じて適切なページを読み込む
  if (loadOnboarding) {
    mainWindow.loadFile(path.join(__dirname, "../public/onboarding.html"));
  } else {
    mainWindow.loadFile(path.join(__dirname, "../public/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function checkPermissions(): Promise<boolean> {
  // macOSでは、画面録画権限は直接チェックできないため、
  // アクセシビリティ権限をチェックします
  if (process.platform === "darwin") {
    const trusted = systemPreferences.isTrustedAccessibilityClient(true);

    if (!trusted) {
      const result = await dialog.showMessageBox({
        type: "warning",
        title: "Permissions Required",
        message:
          "This app needs Accessibility permission to control windows. Please grant access in System Preferences > Security & Privacy > Privacy > Accessibility.",
        buttons: ["OK", "Cancel"],
      });

      if (result.response === 1) {
        return false;
      }
    }

    return trusted;
  }

  return true;
}

// .envファイルを読み込む
dotenv.config();

app.whenReady().then(async () => {
  const hasPermissions = await checkPermissions();

  if (!hasPermissions) {
    app.quit();
    return;
  }

  // APIキーを確認
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set in .env file");
    dialog.showErrorBox(
      "API Key Missing",
      "Please set ANTHROPIC_API_KEY in .env file"
    );
  }

  claudeService = new ClaudeService(apiKey || "");
  windowManager = new WindowManager(claudeService);
  appScanner = new AppScanner();
  graphManager = new GraphManager();
  iconExtractor = new IconExtractor();

  // アプリ起動時にアイコンをプリロード（バックグラウンド）
  appScanner.getAllInstalledApps().then(apps => {
    iconExtractor.preloadAllIcons(apps).catch(error => {
      console.error('Icon preload failed:', error);
    });
  });

  // オンボーディング状態をチェック
  const needsOnboarding = !graphManager.isOnboardingCompleted();
  createWindow(needsOnboarding);

  ipcMain.handle("get-window-state", async (): Promise<WindowState> => {
    return await windowManager.getWindowState();
  });

  ipcMain.handle(
    "get-app-info",
    async (event, appName: string): Promise<string[] | null> => {
      return windowManager.getApplicationInfo(appName);
    }
  );

  ipcMain.handle("get-installed-apps", async () => {
    return await appScanner.getAllInstalledApps();
  });

  ipcMain.handle("search-apps", async (event, query: string) => {
    return await appScanner.searchApps(query);
  });

  ipcMain.handle("launch-app", async (event, appName: string) => {
    return await appScanner.launchApp(appName);
  });

  ipcMain.handle("launch-app-by-path", async (event, appPath: string) => {
    return await appScanner.launchAppByPath(appPath);
  });

  ipcMain.handle(
    "get-app-icon",
    async (_, appName: string): Promise<string | null> => {
      try {
        // まずアプリスキャナーで実際のパスを取得
        const apps = await appScanner.getAllInstalledApps();
        const app = apps.find(a => a.name === appName);
        
        // IconExtractorを使用してアイコンを取得
        const icon = await iconExtractor.getAppIcon(appName, app?.path);
        return icon;
      } catch (error) {
        console.error(`Error getting icon for ${appName}:`, error);
        return null;
      }
    }
  );

  ipcMain.handle(
    "get-app-icons-batch",
    async (_, appNames: string[]): Promise<Record<string, string | null>> => {
      try {
        // アプリスキャナーで実際のパスを取得
        const allApps = await appScanner.getAllInstalledApps();
        const appsToLoad = appNames.map(name => {
          const app = allApps.find(a => a.name === name);
          return { name, path: app?.path };
        });
        
        // バッチでアイコンを取得
        const icons = await iconExtractor.getAppIconsBatch(appsToLoad);
        
        // MapをObjectに変換
        const result: Record<string, string | null> = {};
        for (const [name, icon] of icons) {
          result[name] = icon;
        }
        
        return result;
      } catch (error) {
        console.error(`Error getting batch icons:`, error);
        return {};
      }
    }
  );

  ipcMain.handle(
    "analyze-windows",
    async (_, userIntent: string): Promise<WindowAction[]> => {
      console.log("Analyzing windows with intent:", userIntent);
      const currentState = await windowManager.getWindowState();
      console.log(`Found ${currentState.windows.length} windows`);

      const response = await claudeService.analyzeWindowState(
        currentState,
        userIntent
      );

      console.log("AI Response:", response);
      console.log("Actions to execute:", response.actions);

      return response.actions;
    }
  );

  ipcMain.handle(
    "execute-action",
    async (_, action: WindowAction): Promise<boolean> => {
      const result = await windowManager.executeAction(action);

      // 最小化・復元後にアプリウィンドウにフォーカスを保つ
      if (result && (action.type === "minimize" || action.type === "restore")) {
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.focus();
          }
        }, 100);
      }

      return result;
    }
  );

  ipcMain.handle(
    "execute-actions",
    async (_, actions: WindowAction[]): Promise<boolean[]> => {
      console.log(`Executing ${actions.length} actions`);
      const results: boolean[] = [];

      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        console.log(
          `Executing action ${i + 1}/${actions.length}:`,
          action.type
        );

        const success = await windowManager.executeAction(action);
        results.push(success);

        // 各アクション後にフォーカスを維持
        if (
          success &&
          (action.type === "minimize" || action.type === "restore")
        ) {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.focus();
          }
        }

        if (!success) {
          console.error(`Action ${i + 1} failed, stopping execution`);
          break;
        }
      }

      console.log(
        `Execution results: ${results.filter((r) => r).length}/${
          actions.length
        } succeeded`
      );
      return results;
    }
  );

  ipcMain.handle("quit-app", async (_, appName: string): Promise<boolean> => {
    console.log(`Quit app request: ${appName}`);
    return await windowManager.quitApp(appName);
  });

  ipcMain.handle(
    "get-cpu-info",
    async (): Promise<import("./types").CpuInfo> => {
      console.log("Getting CPU info");
      return await windowManager.getCpuInfo();
    }
  );

  ipcMain.handle("analyze-apps", async (_, appNames: string[]) => {
    console.log(`Analyzing ${appNames.length} apps`);

    // 未知のアプリのみを分析
    const unknownApps = graphManager.getUnknownApplications(appNames);

    if (unknownApps.length > 0) {
      console.log(`Found ${unknownApps.length} unknown apps to analyze`);

      // Claudeで説明文を生成
      const descriptions = await claudeService.generateApplicationDescriptions(
        unknownApps
      );

      // グラフに追加
      graphManager.addApplications(descriptions);

      return descriptions;
    }

    return [];
  });

  ipcMain.handle("complete-onboarding", async (_, analyzedApps: string[]) => {
    console.log("Completing onboarding with", analyzedApps.length, "apps");
    graphManager.completeOnboarding(analyzedApps);
    return true;
  });

  ipcMain.handle("check-onboarding", async () => {
    return graphManager.isOnboardingCompleted();
  });

  ipcMain.handle("check-new-apps", async () => {
    // 現在のウィンドウ状態から実行中のアプリを取得
    const windowState = await windowManager.getWindowState();
    const runningApps = [...new Set(windowState.windows.map((w) => w.appName))];

    // 未知のアプリをチェック
    const unknownApps = graphManager.getUnknownApplications(runningApps);

    if (unknownApps.length > 0) {
      console.log(
        `Found ${unknownApps.length} new apps to analyze: ${unknownApps.join(
          ", "
        )}`
      );

      // 新しいアプリの説明を生成
      const descriptions = await claudeService.generateApplicationDescriptions(
        unknownApps
      );

      // グラフに追加
      graphManager.addApplications(descriptions);

      return { newAppsFound: true, apps: unknownApps };
    }

    return { newAppsFound: false, apps: [] };
  });

  ipcMain.handle("reset-local-data", async () => {
    try {
      console.log("Resetting local data...");
      
      // GraphManagerのデータをクリア
      graphManager.clearData();
      
      // アイコンキャッシュもクリア
      iconExtractor.clearCache();
      
      console.log("Local data cleared successfully");
      
      // アプリケーションを再起動
      app.relaunch();
      app.exit(0);
      
      return true;
    } catch (error) {
      console.error("Error resetting local data:", error);
      return false;
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
