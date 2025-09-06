import {
  app,
  BrowserWindow,
  ipcMain,
  systemPreferences,
  dialog,
  nativeImage,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";
import { WindowManager } from "./windowManager";
import { ClaudeService } from "./claudeService";
import { NotificationService, NotificationData, NotificationLog } from "./notificationService";
import { WindowState, WindowAction } from "./types";

let mainWindow: BrowserWindow | null = null;
let windowManager: WindowManager;
let claudeService: ClaudeService;
let notificationService: NotificationService;

async function createWindow() {
  // アプリ名を設定（通知に使用される）
  app.setName("Window AI Manager");
  
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: "Window AI Manager",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    titleBarStyle: "hiddenInset",
    vibrancy: "sidebar",
    backgroundColor: "#00000000",
  });

  mainWindow.loadFile(path.join(__dirname, "../public/index.html"));

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

  windowManager = new WindowManager();
  
  // APIキーを確認
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set in .env file");
    dialog.showErrorBox("API Key Missing", "Please set ANTHROPIC_API_KEY in .env file");
  }
  
  claudeService = new ClaudeService(apiKey || "");
  notificationService = new NotificationService(claudeService);

  // 通知権限を初期化時にチェック
  if (process.platform === 'darwin') {
    try {
      console.log('📱 Initializing notification permissions...');
      const hasPermission = await notificationService.checkNotificationPermission();
      if (hasPermission) {
        console.log('✅ Notification permissions granted');
      } else {
        console.log('❌ Notification permissions denied');
      }
    } catch (error) {
      console.error('❗ Error initializing notification permission:', error);
    }
  }

  createWindow();

  ipcMain.handle("get-window-state", async (): Promise<WindowState> => {
    return await windowManager.getWindowState();
  });

  ipcMain.handle(
    "get-app-icon",
    async (_, appName: string): Promise<string | null> => {
      try {
        // アプリケーションのパスを取得
        const appPath = `/Applications/${appName}.app/Contents/Resources/`;
        const iconFiles = ["app.icns", "AppIcon.icns", `${appName}.icns`];

        for (const iconFile of iconFiles) {
          const iconPath = path.join(appPath, iconFile);
          if (fs.existsSync(iconPath)) {
            // アイコンをBase64エンコード
            const image = nativeImage.createFromPath(iconPath);
            const resized = image.resize({ width: 32, height: 32 });
            return resized.toDataURL();
          }
        }

        // システムデフォルトアイコンを試す
        const systemIconPath = `/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericApplicationIcon.icns`;
        if (fs.existsSync(systemIconPath)) {
          const image = nativeImage.createFromPath(systemIconPath);
          const resized = image.resize({ width: 32, height: 32 });
          return resized.toDataURL();
        }

        return null;
      } catch (error) {
        console.error(`Error getting icon for ${appName}:`, error);
        return null;
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
      return await windowManager.executeAction(action);
    }
  );

  ipcMain.handle(
    "execute-actions",
    async (_, actions: WindowAction[]): Promise<boolean[]> => {
      console.log(`Executing ${actions.length} actions`);
      const results: boolean[] = [];
      
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        console.log(`Executing action ${i + 1}/${actions.length}:`, action.type);
        
        const success = await windowManager.executeAction(action);
        results.push(success);
        
        if (!success) {
          console.error(`Action ${i + 1} failed, stopping execution`);
          break;
        }
      }
      
      console.log(`Execution results: ${results.filter(r => r).length}/${actions.length} succeeded`);
      return results;
    }
  );
  
  ipcMain.handle(
    "quit-app",
    async (_, appName: string): Promise<boolean> => {
      console.log(`Quit app request: ${appName}`);
      return await windowManager.quitApp(appName);
    }
  );

  // 通知関連のIPCハンドラー
  ipcMain.handle(
    "send-notification",
    async (_, notificationData: NotificationData): Promise<boolean> => {
      console.log("Sending notification:", notificationData.title);
      return await notificationService.sendNotification(notificationData);
    }
  );

  ipcMain.handle(
    "send-test-notification",
    async (): Promise<boolean> => {
      console.log("Sending test notification");
      return await notificationService.sendTestNotification();
    }
  );

  ipcMain.handle(
    "get-notification-logs",
    async (_, limit?: number): Promise<NotificationLog[]> => {
      return notificationService.getNotificationLogs(limit);
    }
  );

  ipcMain.handle(
    "check-notification-permission",
    async (): Promise<boolean> => {
      return await notificationService.checkNotificationPermission();
    }
  );
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
