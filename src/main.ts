import {
  app,
  BrowserWindow,
  ipcMain,
  systemPreferences,
  dialog,
  nativeImage,
  NativeImage,
  Tray,
  Menu,
  nativeTheme,
  globalShortcut,
  screen,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";
import { WindowManager } from "./windowManager";
import { ClaudeService } from "./claudeService";
import { AppScanner } from "./appScanner";
import { GraphManager } from "./graphManager";
import { IconExtractor } from "./iconExtractor";
import { PresetManager } from "./presetManager";
import { AnalysisService } from "./analysisService";
import { NotificationSystem } from "./notificationSystem";
import { FocusLogger } from "./focusLogger";
import { WindowState, WindowAction } from "./types";

let mainWindow: BrowserWindow | null = null;
let spotlightWindow: BrowserWindow | null = null;
let windowManager: WindowManager;
let claudeService: ClaudeService;
let appScanner: AppScanner;
let graphManager: GraphManager;
let iconExtractor: IconExtractor;
let presetManager: PresetManager;
let analysisService: AnalysisService;
let notificationSystem: NotificationSystem;
let focusLogger: FocusLogger;
let tray: Tray | null = null;

// Trayアニメーション用の状態
let trayAnimFrames: NativeImage[] = [];
let trayAnimIndex = 0;
let trayAnimTimer: NodeJS.Timeout | null = null;
let trayAnimFps = 2; // 初期は低速
let memMonitorTimer: NodeJS.Timeout | null = null;
let currentMemoryPressure: 'normal' | 'warning' | 'critical' = 'normal';

function loadTrayAnimFrames(): NativeImage[] {
  try {
    const iconsDir = path.join(__dirname, "../assets/icons");
    const names = ["pen1.png", "pen2.png", "pen3.png", "pen4.png", "pen5.png"];
    const frames: NativeImage[] = [];
    for (const name of names) {
      const p = path.join(iconsDir, name);
      if (fs.existsSync(p)) {
        let img = nativeImage.createFromPath(p);
        if (!img.isEmpty()) {
          img = img.resize({ width: 16, height: 16 });
          frames.push(img);
        }
      }
    }
    return frames;
  } catch (e) {
    console.error('Failed to load tray animation frames:', e);
    return [];
  }
}

function startTrayAnimation() {
  if (!tray) return;
  if (!trayAnimFrames || trayAnimFrames.length === 0) return;
  if (trayAnimTimer) {
    clearInterval(trayAnimTimer);
    trayAnimTimer = null;
  }
  const intervalMs = Math.max(1000 / Math.max(trayAnimFps, 1), 16);
  trayAnimTimer = setInterval(() => {
    if (!tray) return;
    tray.setImage(trayAnimFrames[trayAnimIndex]);
    trayAnimIndex = (trayAnimIndex + 1) % trayAnimFrames.length;
  }, intervalMs);
}

function setTrayAnimFps(fps: number) {
  trayAnimFps = fps;
  startTrayAnimation();
}

function applyPressureToFps(pressure: 'normal' | 'warning' | 'critical') {
  switch (pressure) {
    case 'critical':
      setTrayAnimFps(12);
      break;
    case 'warning':
      setTrayAnimFps(8);
      break;
    default:
      setTrayAnimFps(2);
      break;
  }
}

function startMemoryMonitoring() {
  const check = async () => {
    try {
      const info = await windowManager.getMemoryInfo();
      if (info && info.pressure !== currentMemoryPressure) {
        currentMemoryPressure = info.pressure;
        applyPressureToFps(currentMemoryPressure);
      }
    } catch (e) {
      // 失敗時は何もしない（前回の状態を維持）
    }
  };

  // 初回チェック
  check();

  if (memMonitorTimer) {
    clearInterval(memMonitorTimer);
  }
  memMonitorTimer = setInterval(check, 5000);
}
let analysisInterval: NodeJS.Timeout | null = null;

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
    show: false, // 最初は非表示にして、loadFile後に表示
  });

  // オンボーディング状態に応じて適切なページを読み込む
  if (loadOnboarding) {
    mainWindow.loadFile(path.join(__dirname, "../public/onboarding.html"));
  } else {
    mainWindow.loadFile(path.join(__dirname, "../public/index.html"));
  }

  // ウィンドウは初期状態では非表示（メニューバーから制御）
  // mainWindow.once('ready-to-show', () => {
  //   mainWindow?.show();
  //   mainWindow?.focus();
  // });

  // ウィンドウを閉じる際の処理
  mainWindow.on("close", (event) => {
    // macOSの場合、ウィンドウを非表示にしてアプリは終了しない
    if (process.platform === "darwin") {
      event.preventDefault();
      mainWindow?.hide();
      // Dockアイコンは表示したままにする
      // if (app.dock) {
      //   app.dock.hide();
      // }
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createSpotlightWindow() {
  if (spotlightWindow) {
    spotlightWindow.show();
    spotlightWindow.focus();
    return;
  }

  // スクリーンサイズを取得
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  
  // ウィンドウサイズと位置を計算（画面上部中央）
  const windowWidth = 600;
  const windowHeight = 320; // 入力フィールド + サジェスション分の高さ
  const x = Math.round((screenWidth - windowWidth) / 2);
  const y = Math.round(screenHeight * 0.15); // 画面上部15%の位置

  spotlightWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  spotlightWindow.loadFile(path.join(__dirname, "../public/spotlight.html"));
  
  // 開発時のみDevToolsを開く（必要に応じて）
  // spotlightWindow.webContents.openDevTools({ mode: 'detach' });

  // フォーカスが外れたら非表示にする
  spotlightWindow.on('blur', () => {
    if (spotlightWindow) {
      try {
        // Appモード終了をレンダラー経由で通知（ホットキー再登録のため）
        spotlightWindow.webContents.executeJavaScript('window.windowAPI && window.windowAPI.appModeEnd && window.windowAPI.appModeEnd()');
      } catch (e) {
        console.error('Failed to notify appModeEnd on blur:', e);
      }
      spotlightWindow.hide();
    }
  });

  spotlightWindow.on("closed", () => {
    spotlightWindow = null;
  });
  
  // ウィンドウを表示してフォーカス
  spotlightWindow.show();
  spotlightWindow.focus();
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
      label: "メインウィンドウを表示",
      accelerator: "Command+M",
      click: () => {
        if (mainWindow) {
          if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            mainWindow.show();
            mainWindow.focus();
          }
        } else {
          createWindow();
        }
      },
    },
    {
      label: "Spotlight検索を開く",
      accelerator: "Option+Shift+W",
      click: () => {
        if (spotlightWindow) {
          spotlightWindow.show();
          spotlightWindow.focus();
        } else {
          createSpotlightWindow();
        }
      },
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
      label: "ホットキー",
      submenu: [
        {
          label: "Command+M: メインウィンドウ表示/非表示",
          enabled: false,
        },
        {
          label: "Option+Shift+W: Spotlight検索を開く",
          enabled: false,
        },
        {
          label: "Option+Tab: アプリ切り替え",
          enabled: false,
        },
      ],
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
  
  // クリックイベントの処理（Spotlightウィンドウの表示）
  tray.on("click", () => {
    if (spotlightWindow) {
      if (spotlightWindow.isVisible()) {
        spotlightWindow.hide();
      } else {
        spotlightWindow.show();
        spotlightWindow.focus();
      }
    } else {
      createSpotlightWindow();
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
  appScanner = new AppScanner();
  graphManager = new GraphManager();
  iconExtractor = new IconExtractor();
  presetManager = new PresetManager();
  focusLogger = new FocusLogger();
  notificationSystem = new NotificationSystem(mainWindow || undefined);

  // アプリ起動時にアイコンをプリロード（バックグラウンド）
  appScanner.getAllInstalledApps().then(apps => {
    iconExtractor.preloadAllIcons(apps).catch(error => {
      console.error('Icon preload failed:', error);
    });
  });

  // オンボーディング状態をチェック
  const needsOnboarding = !graphManager.isOnboardingCompleted();

  // メインウィンドウとトレイを作成
  createWindow(needsOnboarding);
  createTray();
  
  // トレイアニメーションのプリロードと開始
  trayAnimFrames = loadTrayAnimFrames();
  if (trayAnimFrames.length > 0) {
    startTrayAnimation();
    startMemoryMonitoring();
  } else {
    console.warn('No tray animation frames found (pen1..pen5).');
  }
  
  // グローバルホットキーの登録
  // Command+M でメインウィンドウの表示/非表示を切り替え
  const mainWindowHotkey = 'Command+M';
  const mainWindowHotkeyRegistered = globalShortcut.register(mainWindowHotkey, () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      createWindow();
    }
  });

  if (!mainWindowHotkeyRegistered) {
    console.error(`Failed to register hotkey: ${mainWindowHotkey}`);
  } else {
    console.log(`Global hotkey registered: ${mainWindowHotkey}`);
  }

  // Option+Shift+W でSpotlightウィンドウの表示/非表示を切り替え
  const toggleWindowHotkey = 'Option+Shift+W';
  const hotkeyRegistered = globalShortcut.register(toggleWindowHotkey, () => {
    if (spotlightWindow) {
      if (spotlightWindow.isVisible()) {
        spotlightWindow.hide();
      } else {
        spotlightWindow.show();
        spotlightWindow.focus();
      }
    } else {
      createSpotlightWindow();
    }
  });

  if (!hotkeyRegistered) {
    console.error(`Failed to register hotkey: ${toggleWindowHotkey}`);
  } else {
    console.log(`Global hotkey registered: ${toggleWindowHotkey}`);
  }

  // Option+Tab でアプリ切り替えモードを起動（次のアプリを自動選択）
  const appSwitchHotkey = 'Option+Tab';
  const triggerAppSwitchInit = () => {
    if (!spotlightWindow) {
      createSpotlightWindow();
    }
    setTimeout(() => {
      if (spotlightWindow) {
        spotlightWindow.show();
        spotlightWindow.focus();
        spotlightWindow.webContents.executeJavaScript('window.initAppModeWithNext && window.initAppModeWithNext()');
      }
    }, 100);
  };

  const registerAppSwitchHotkey = () => {
    if (globalShortcut.isRegistered(appSwitchHotkey)) {
      return true;
    }
    const ok = globalShortcut.register(appSwitchHotkey, () => {
      triggerAppSwitchInit();
    });
    if (!ok) {
      console.error(`Failed to register hotkey: ${appSwitchHotkey}`);
    } else {
      console.log(`Global hotkey registered: ${appSwitchHotkey}`);
    }
    return ok;
  };

  registerAppSwitchHotkey();

  
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
        tray.setToolTip(`Window AI Manager\nCPU: ${cpuInfo.usage.toFixed(1)}%\n\nHotkey: ${toggleWindowHotkey}`);
      } catch (error) {
        // エラーが発生しても継続
      }
    }
  }, 5000); // 5秒ごとに更新

  // Spotlightウィンドウ用のIPCハンドラー
  ipcMain.handle("hide-window", async () => {
    if (spotlightWindow) {
      spotlightWindow.hide();
    }
  });

  // Appモード開始/終了の通知に応じてグローバルショートカットを制御
  ipcMain.handle("app-mode-start", async () => {
    try {
      if (globalShortcut.isRegistered(appSwitchHotkey)) {
        globalShortcut.unregister(appSwitchHotkey);
        console.log(`Global hotkey temporarily unregistered: ${appSwitchHotkey}`);
      }
    } catch (e) {
      console.error('Error unregistering app switch hotkey on app-mode-start:', e);
    }
  });

  ipcMain.handle("app-mode-end", async () => {
    try {
      registerAppSwitchHotkey();
    } catch (e) {
      console.error('Error re-registering app switch hotkey on app-mode-end:', e);
    }
  });

  // アプリにフォーカスを移動
  ipcMain.handle("focus-app", async (_, appName: string): Promise<boolean> => {
    return await windowManager.focusApp(appName);
  });

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

  // プリセット関連のIPCハンドラー
  ipcMain.handle("save-preset", async (_, name: string, description?: string) => {
    const windowState = await windowManager.getWindowState();
    const windows = windowState.windows.map(w => ({
      appName: w.appName,
      position: {
        x: w.bounds.x,
        y: w.bounds.y
      },
      size: {
        width: w.bounds.width,
        height: w.bounds.height
      }
    }));
    
    const preset = presetManager.createPreset(name, description, windows);
    console.log(`Preset saved: ${preset.name} with ${windows.length} windows`);
    return preset;
  });

  ipcMain.handle("get-presets", async () => {
    return presetManager.getAllPresets();
  });

  ipcMain.handle("load-preset", async (_, presetId: string) => {
    const preset = presetManager.getPreset(presetId);
    if (!preset) {
      console.error(`Preset not found: ${presetId}`);
      return false;
    }

    console.log(`Loading preset: ${preset.name} with ${preset.windows.length} windows`);
    
    // 現在開いているウィンドウを全て最小化（並列処理）
    const currentState = await windowManager.getWindowState();
    const minimizePromises = currentState.windows.map(window => 
      windowManager.executeAction({
        type: 'minimize',
        targetWindow: window.appName,
        reasoning: 'Minimizing current windows to load preset'
      })
    );
    await Promise.all(minimizePromises);

    // プリセットのウィンドウを復元（アプリ起動は並列、配置は順次）
    // まず全アプリを並列で起動
    const launchPromises = preset.windows.map(windowPreset => 
      appScanner.launchApp(windowPreset.appName)
    );
    await Promise.all(launchPromises);
    
    // アプリが起動するまで少し待機（1回だけ）
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // ウィンドウの配置とサイズ調整を並列実行
    const restorePromises = preset.windows.map(async windowPreset => {
      // 移動とリサイズを並列実行
      const actions = [
        windowManager.executeAction({
          type: 'move',
          targetWindow: windowPreset.appName,
          parameters: {
            position: windowPreset.position
          },
          reasoning: 'Restoring window position from preset'
        }),
        windowManager.executeAction({
          type: 'resize',
          targetWindow: windowPreset.appName,
          parameters: {
            size: windowPreset.size
          },
          reasoning: 'Restoring window size from preset'
        })
      ];
      
      return Promise.all(actions);
    });
    
    await Promise.all(restorePromises);

    return true;
  });

  ipcMain.handle("delete-preset", async (_, presetId: string) => {
    const deleted = presetManager.deletePreset(presetId);
    console.log(`Preset ${presetId} deletion: ${deleted ? 'success' : 'failed'}`);
    return deleted;
  });

  ipcMain.handle("update-preset", async (_, presetId: string, name?: string, description?: string) => {
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    
    const updated = presetManager.updatePreset(presetId, updates);
    console.log(`Preset ${presetId} update: ${updated ? 'success' : 'failed'}`);
    return updated;
  });

  // アプリ提案機能
  ipcMain.handle("suggest-apps-for-task", async (_, userPrompt: string) => {
    console.log(`Suggesting apps for task: ${userPrompt}`);
    
    // application_graphを取得
    const applicationGraph = graphManager.getAllApplications();
    
    // Claudeでアプリを提案
    const suggestions = await claudeService.suggestAppsForTask(userPrompt, applicationGraph);
    console.log(`Suggested apps - High: ${suggestions.highConfidence.length}, Low: ${suggestions.lowConfidence.length}`);
    
    return suggestions;
  });

  // タスクからアプリを開いてプリセット保存
  ipcMain.handle("open-apps-for-task", async (_, appNames: string[], taskName: string) => {
    console.log(`Opening ${appNames.length} apps for task: ${taskName}`);
    
    // 選択されたアプリを並列で開く
    const launchPromises = appNames.map(appName => appScanner.launchApp(appName));
    await Promise.all(launchPromises);
    
    // アプリが起動するまで待機
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // 現在のウィンドウ状態を取得してプリセットとして保存
    const windowState = await windowManager.getWindowState();
    const windows = windowState.windows
      .filter(w => appNames.includes(w.appName))
      .map(w => ({
        appName: w.appName,
        position: {
          x: w.bounds.x,
          y: w.bounds.y
        },
        size: {
          width: w.bounds.width,
          height: w.bounds.height
        }
      }));
    
    // タスク名でプリセットを保存
    const preset = presetManager.createPreset(
      taskName,
      `自動生成: ${appNames.join(', ')}`,
      windows
    );
    
    console.log(`Auto-saved preset: ${preset.name} with ${windows.length} windows`);
    return preset;
  });

  // メモリ情報を返す
  ipcMain.handle(
    "get-memory-info",
    async (): Promise<import("./types").MemoryInfo> => {
      console.log("Getting Memory info");
      return await windowManager.getMemoryInfo();
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

  // 通知システム関連のIPCハンドラー
  ipcMain.handle(
    "get-notifications",
    async () => {
      try {
        return await notificationSystem.loadNotifications();
      } catch (error) {
        console.error('Error getting notifications:', error);
        return [];
      }
    }
  );

  ipcMain.handle(
    "mark-notification-read",
    async (_, notificationId: string) => {
      try {
        await notificationSystem.markAsRead(notificationId);
        return true;
      } catch (error) {
        console.error('Error marking notification as read:', error);
        return false;
      }
    }
  );

  ipcMain.handle(
    "get-notification-settings",
    async () => {
      try {
        return await notificationSystem.getSettings();
      } catch (error) {
        console.error('Error getting notification settings:', error);
        return {};
      }
    }
  );

  ipcMain.handle(
    "save-notification-settings",
    async (_, settings) => {
      try {
        await notificationSystem.saveSettings(settings);
        // 分析間隔を更新
        await updateAnalysisInterval();
        return true;
      } catch (error) {
        console.error('Error saving notification settings:', error);
        return false;
      }
    }
  );

  ipcMain.handle(
    "get-notification-stats",
    async () => {
      try {
        return await notificationSystem.getNotificationStats();
      } catch (error) {
        console.error('Error getting notification stats:', error);
        return {
          totalNotifications: 0,
          unreadCount: 0,
          lastNotification: null,
          avgSystemHealth: 100
        };
      }
    }
  );

  ipcMain.handle(
    "quit-recommended-app",
    async (_, appName: string) => {
      try {
        const success = await windowManager.quitApp(appName);
        if (success) {
          console.log(`✅ Successfully quit app: ${appName}`);
        } else {
          console.log(`❌ Failed to quit app: ${appName}`);
        }
        return success;
      } catch (error) {
        console.error(`Error quitting app ${appName}:`, error);
        return false;
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

// アプリ終了時にグローバルショートカットを解除
app.on("will-quit", () => {
  // すべてのショートカットを解除
  globalShortcut.unregisterAll();
});

// AI分析機能
async function startAIAnalysis() {
  console.log("🤖 Starting AI analysis system...");
  
  // 初回実行は1分後（起動直後のデータ収集を待つ）
  setTimeout(performAIAnalysis, 60000);
  
  // 設定から分析間隔を取得して定期実行を設定
  await updateAnalysisInterval();
}

async function updateAnalysisInterval() {
  if (analysisInterval) {
    clearInterval(analysisInterval);
    analysisInterval = null;
  }

  if (!notificationSystem) return;
  
  const settings = await notificationSystem.getSettings();
  
  if (settings.analysisInterval > 0) {
    analysisInterval = setInterval(performAIAnalysis, settings.analysisInterval);
    console.log(`⏰ Analysis interval set to ${settings.analysisInterval / 1000}s`);
  } else {
    console.log("🚫 AI analysis disabled by user settings");
  }
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

    // appsToCloseが配列であることを確認
    const appsToClose = Array.isArray(recommendations.appsToClose) ? recommendations.appsToClose : [];
    
    console.log(`✅ Analysis complete: ${appsToClose.length} apps recommended to close`);
    console.log(`📈 System health score: ${recommendations.systemHealthScore}/100`);
    
    // 結果をログに出力（デバッグ用）
    if (appsToClose.length > 0) {
      console.log("🎯 Apps recommended to close:");
      appsToClose.forEach(app => {
        console.log(`  - ${app.appName} (${app.priority}): ${app.expectedBenefit}`);
        console.log(`    Reasons: ${Array.isArray(app.reasons) ? app.reasons.join(', ') : 'No reasons provided'}`);
      });
    }

    console.log("💡 Overall assessment:", recommendations.overallAssessment);

    // 通知システムに結果を送信
    if (notificationSystem) {
      // 安全な形式で通知を送信
      const safeRecommendations = {
        ...recommendations,
        appsToClose: appsToClose
      };
      await notificationSystem.sendAnalysisNotification(safeRecommendations);
    }

  } catch (error) {
    console.error("❌ AI analysis error:", error);
  }
}
