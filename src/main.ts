import {
  app,
  BrowserWindow,
  ipcMain,
  systemPreferences,
  dialog,
  nativeImage,
  Tray,
  Menu,
  nativeTheme,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";
import { WindowManager } from "./windowManager";
import { ClaudeService } from "./claudeService";
import { AnalysisService } from "./analysisService";
import { FocusLogger } from "./focusLogger";
import { WindowState, WindowAction } from "./types";

let mainWindow: BrowserWindow | null = null;
let windowManager: WindowManager;
let claudeService: ClaudeService;
let analysisService: AnalysisService;
let focusLogger: FocusLogger;
let tray: Tray | null = null;
let analysisInterval: NodeJS.Timeout | null = null;

async function createWindow() {
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

  mainWindow.loadFile(path.join(__dirname, "../public/index.html"));

  // ウィンドウを閉じる際の処理
  mainWindow.on("close", (event) => {
    // macOSの場合、ウィンドウを非表示にしてアプリは終了しない
    if (process.platform === "darwin") {
      event.preventDefault();
      mainWindow?.hide();
      // Dockアイコンも非表示にする（オプション）
      if (app.dock) {
        app.dock.hide();
      }
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  try {
    console.log("Creating tray icon...");
    
    // アイコンパスの設定（ChatGPTアイコンを使用）
    const iconPath = path.join(__dirname, "../assets/icons/app-icon.png");
    console.log("Icon path:", iconPath);
    console.log("Icon exists:", fs.existsSync(iconPath));
    
    // アイコンを読み込んで適切なサイズにリサイズ
    let trayIcon = nativeImage.createFromPath(iconPath);
    
    // アイコンが空でないことを確認
    if (trayIcon.isEmpty()) {
      console.error("Tray icon is empty, trying trayTemplate.png");
      // フォールバック: trayTemplate.pngを試す
      const fallbackPath = path.join(__dirname, "../assets/icons/trayTemplate.png");
      trayIcon = nativeImage.createFromPath(fallbackPath);
      
      if (trayIcon.isEmpty()) {
        console.error("Fallback icon also empty, creating default icon");
        // 最終フォールバック: 黒い正方形を作成
        const size = 16;
        const buffer = Buffer.alloc(size * size * 4);
        for (let i = 0; i < size * size * 4; i += 4) {
          buffer[i] = 0;     // R
          buffer[i + 1] = 0; // G
          buffer[i + 2] = 0; // B
          buffer[i + 3] = 255; // A (完全不透明)
        }
        trayIcon = nativeImage.createFromBuffer(buffer, {
          width: size,
          height: size
        });
      }
    }
    
    // Tray用に16x16にリサイズ（macOSは自動的に適切なサイズを選択）
    if (!trayIcon.isEmpty()) {
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
      console.log("Icon resized to 16x16 for tray");
    }
    
    // macOSの場合、テンプレートイメージとして設定しない（カラーアイコンを使用）
    // ChatGPTのアイコンはカラーなので、テンプレートにしないほうが良い
    if (process.platform === "darwin") {
      // trayIcon.setTemplateImage(true); // コメントアウト
      console.log("Using color icon for macOS");
    }
    
    // Trayインスタンスの作成
    tray = new Tray(trayIcon);
    console.log("Tray created successfully");
    
    // ツールチップの設定
    tray.setToolTip("Window AI Manager");
  
  // コンテキストメニューの作成
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "ウィンドウを表示",
      click: () => {
        if (!mainWindow) {
          createWindow();
        } else {
          mainWindow.show();
          if (app.dock) {
            app.dock.show();
          }
        }
      },
    },
    {
      label: "ウィンドウを隠す",
      click: () => {
        if (mainWindow) {
          mainWindow.hide();
          if (app.dock) {
            app.dock.hide();
          }
        }
      },
    },
    { type: "separator" },
    {
      label: "クイックアクション",
      submenu: [
        {
          label: "左右に分割",
          click: async () => {
            if (!mainWindow) createWindow();
            // AIに左右分割を依頼
            const actions = await claudeService.analyzeWindowState(
              await windowManager.getWindowState(),
              "アクティブな2つのウィンドウを左右に並べて配置して"
            );
            for (const action of actions.actions) {
              await windowManager.executeAction(action);
            }
          },
        },
        {
          label: "グリッド表示",
          click: async () => {
            if (!mainWindow) createWindow();
            const actions = await claudeService.analyzeWindowState(
              await windowManager.getWindowState(),
              "すべてのウィンドウをグリッド状に配置して"
            );
            for (const action of actions.actions) {
              await windowManager.executeAction(action);
            }
          },
        },
        {
          label: "中央に配置",
          click: async () => {
            if (!mainWindow) createWindow();
            const actions = await claudeService.analyzeWindowState(
              await windowManager.getWindowState(),
              "アクティブなウィンドウを画面中央に配置して"
            );
            for (const action of actions.actions) {
              await windowManager.executeAction(action);
            }
          },
        },
      ],
    },
    { type: "separator" },
    {
      label: "システム情報",
      submenu: [
        {
          label: "CPU使用率を確認",
          click: async () => {
            const cpuInfo = await windowManager.getCpuInfo();
            dialog.showMessageBox({
              type: "info",
              title: "CPU使用率",
              message: `CPU使用率: ${cpuInfo.usage.toFixed(1)}%\nモデル: ${cpuInfo.model}\nコア数: ${cpuInfo.cores}`,
              buttons: ["OK"],
            });
          },
        },
      ],
    },
    { type: "separator" },
    {
      label: "設定",
      accelerator: "Command+,",
      click: () => {
        if (!mainWindow) {
          createWindow();
        } else {
          mainWindow.show();
        }
      },
    },
    { type: "separator" },
    {
      label: "終了",
      accelerator: "Command+Q",
      click: () => {
        app.quit();
      },
    },
  ]);
  
  // コンテキストメニューの設定
  tray.setContextMenu(contextMenu);
  
  // クリックイベントの処理（macOSではコンテキストメニューの表示）
  tray.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
        if (app.dock) {
          app.dock.hide();
        }
      } else {
        mainWindow.show();
        if (app.dock) {
          app.dock.show();
        }
      }
    } else {
      createWindow();
    }
  });
  
  // ダークモード対応
  if (process.platform === "darwin") {
    // macOSの場合、Templateサフィックスが自動的にダークモードに対応
    // nativeTheme.on("updated") イベントは将来の拡張用に残しておく
    nativeTheme.on("updated", () => {
      // 必要に応じてアイコンを更新
      // 現在はTemplateイメージが自動対応するため不要
    });
  }
  } catch (error) {
    console.error("Failed to create tray:", error);
    // Trayの作成に失敗してもアプリは続行
  }
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
  analysisService = new AnalysisService(apiKey || "");
  windowManager = new WindowManager(claudeService);
  focusLogger = new FocusLogger();

  createWindow();
  createTray();
  
  // リアルタイムアクティブアプリ監視 - 実際の入力フォーカスを追跡
  let lastKnownActiveApp: string = '';
  setInterval(async () => {
    if (windowManager && mainWindow) {
      try {
        // 実際にフォーカスされているアプリを直接取得
        const currentActiveApp = await windowManager.getCurrentActiveApp();
        
        // 前回と異なる場合のみ更新（不要な処理を避ける）
        if (currentActiveApp !== lastKnownActiveApp) {
          console.log(`🔄 Active app changed: ${lastKnownActiveApp} → ${currentActiveApp}`);
          
          // フォーカスロガーに変更を通知
          await focusLogger.onFocusChange(currentActiveApp);
          
          lastKnownActiveApp = currentActiveApp;
          
          // フロントエンドにリアルタイム通知
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('active-app-changed', currentActiveApp);
          }
        }
      } catch (error) {
        // エラーが発生しても継続
        console.error('Error in active app monitoring:', error);
      }
    }
  }, 1000); // 1秒間隔でリアルタイム監視
  
  // Trayのツールチップを定期的に更新（CPU使用率を表示）
  setInterval(async () => {
    if (tray && windowManager) {
      try {
        const cpuInfo = await windowManager.getCpuInfo();
        tray.setToolTip(`Window AI Manager\nCPU: ${cpuInfo.usage.toFixed(1)}%`);
      } catch (error) {
        // エラーが発生しても継続
      }
    }
  }, 5000); // 5秒ごとに更新

  // AI分析を定期実行（5分間隔）
  startAIAnalysis();

  // アプリのフォーカス変更を検知してアクティブアプリ情報を更新
  app.on('browser-window-focus', () => {
    // Electronアプリがフォーカスされたとき
    console.log('Electron app focused');
  });

  app.on('browser-window-blur', () => {
    // Electronアプリがフォーカスを失ったとき
    console.log('Electron app lost focus - updating active app info');
    // フォーカスを失った後、少し待ってからアクティブアプリを更新
    setTimeout(async () => {
      if (mainWindow && windowManager) {
        try {
          // 新しいアクティブアプリを強制的に検出
          const windowState = await windowManager.getWindowState();
          console.log('Updated active app on blur:', windowState.activeApp);
          
          // IPCでフロントエンドにも通知（リアルタイム更新）
          if (mainWindow) {
            mainWindow.webContents.send('active-app-changed', windowState.activeApp);
          }
        } catch (error) {
          console.error('Error updating active app on blur:', error);
        }
      }
    }, 300); // 少し長めの待機時間
  });

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

  ipcMain.handle(
    "get-focus-stats",
    async () => {
      console.log("Getting focus stats...");
      try {
        const stats = await focusLogger.getAllStats();
        console.log("Loaded focus stats:", stats);
        return stats;
      } catch (error) {
        console.error('Error getting focus stats:', error);
        return [];
      }
    }
  );

  ipcMain.handle(
    "get-data-info",
    async () => {
      console.log("Getting data store info");
      try {
        return await focusLogger.getDataInfo();
      } catch (error) {
        console.error('Error getting data info:', error);
        return null;
      }
    }
  );
});

app.on("window-all-closed", () => {
  // macOSでは、Trayアイコンがあるため、すべてのウィンドウが閉じてもアプリを終了しない
  // 他のプラットフォームでも同様の動作にする（Trayアイコンで常駐）
  // app.quit()を呼ばないことで、アプリはバックグラウンドで動作し続ける
});

app.on("before-quit", () => {
  // アプリ終了時にクリーンアップ
  if (focusLogger) {
    focusLogger.destroy();
  }
  if (analysisInterval) {
    clearInterval(analysisInterval);
    analysisInterval = null;
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// AI分析機能
async function startAIAnalysis() {
  console.log("🤖 Starting AI analysis system...");
  
  // 初回実行は1分後（起動直後のデータ収集を待つ）
  setTimeout(performAIAnalysis, 60000);
  
  // その後は5分間隔で実行
  analysisInterval = setInterval(performAIAnalysis, 5 * 60 * 1000);
}

async function performAIAnalysis() {
  if (!analysisService || !focusLogger || !windowManager) {
    console.log("⚠️ Analysis services not ready");
    return;
  }

  try {
    console.log("🔍 Performing AI analysis...");
    
    // 1. フォーカス統計データを取得
    const focusStats = await focusLogger.getAllStats();
    if (focusStats.length === 0) {
      console.log("📊 No focus data available for analysis");
      return;
    }

    // 2. CPU・メモリ情報を取得
    const cpuInfo = await windowManager.getCpuInfo();
    const processes = cpuInfo.processes;

    // 3. 現在実行中のアプリ一覧を取得
    const windowState = await windowManager.getWindowState();
    const currentApps = [...new Set(windowState.windows.map(w => w.appName))];

    console.log(`📊 Analyzing ${focusStats.length} apps, ${processes.length} processes`);

    // 4. フォーカス分析を実行
    console.log("🎯 Analyzing focus patterns...");
    const focusAnalysis = await analysisService.analyzeFocusPatterns(focusStats);
    console.log(`Found ${focusAnalysis.distractingApps.length} distracting apps`);

    // 5. リソース分析を実行
    console.log("⚡ Analyzing resource usage...");
    const resourceAnalysis = await analysisService.analyzeResourceUsage(processes);
    console.log(`Found ${resourceAnalysis.heavyResourceApps.length} heavy resource apps`);

    // 6. 統合分析で閉じるべきアプリを特定
    console.log("🔗 Performing integrated analysis...");
    const recommendations = await analysisService.getIntegratedRecommendations(
      focusAnalysis,
      resourceAnalysis,
      currentApps
    );

    console.log(`✅ Analysis complete: ${recommendations.appsToClose.length} apps recommended to close`);
    console.log(`📈 System health score: ${recommendations.systemHealthScore}/100`);
    
    // 結果をログに出力（デバッグ用）
    if (recommendations.appsToClose.length > 0) {
      console.log("🎯 Apps recommended to close:");
      recommendations.appsToClose.forEach(app => {
        console.log(`  - ${app.appName} (${app.priority}): ${app.expectedBenefit}`);
        console.log(`    Reasons: ${app.reasons.join(', ')}`);
      });
    }

    console.log("💡 Overall assessment:", recommendations.overallAssessment);

    // TODO: フェーズ3でここに通知機能を追加

  } catch (error) {
    console.error("❌ AI analysis error:", error);
  }
}

