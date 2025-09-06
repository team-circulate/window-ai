import { run } from "@jxa/run";
import { screen } from "electron";
import * as os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import { WindowState, WindowInfo, Display, WindowAction, CpuInfo, ProcessInfo, AppResourceUsage } from "./types";

const execAsync = promisify(exec);

export class WindowManager {
  private claudeService?: any; // ClaudeServiceのインスタンス
  private lastActiveApp?: string; // 前回のアクティブアプリを記憶
  
  constructor(claudeService?: any) {
    this.claudeService = claudeService;
  }
  async getWindowState(): Promise<WindowState> {
    const windows = await this.getAllWindows();
    const displays = await this.getAllDisplays();
    const activeApp = await this.getActiveApp();
    const cpuInfo = await this.getCpuInfo();

    // ウィンドウとプロセスのCPU/メモリ使用率を関連付け
    const windowsWithResourceUsage = await this.enrichWindowsWithResourceUsage(windows, cpuInfo.processes);

    return {
      windows: windowsWithResourceUsage,
      displays,
      activeApp,
      cpuInfo,
      timestamp: Date.now(),
    };
  }

  private async getAllWindows(): Promise<WindowInfo[]> {
    try {
      const windowsData = await run<any[]>(() => {
        ObjC.import("AppKit");
        ObjC.import("Foundation");

        const se = Application("System Events");
        const workspace = $.NSWorkspace.sharedWorkspace;
        const windows: any[] = [];
        const iconCache: { [key: string]: string } = {};

        const processes = se.processes.whose({ visible: true })();

        for (const process of processes) {
          const appName = process.name();

          // アイコンを取得
          let appIcon: string | null = null;

          if (!iconCache[appName]) {
            try {
              // NSWorkspaceから実行中のアプリを取得
              const runningApps = workspace.runningApplications;
              const apps = ObjC.unwrap(runningApps);

              for (let j = 0; j < apps.length; j++) {
                const app = apps[j];
                const processName = ObjC.unwrap(app.localizedName);

                if (processName === appName) {
                  const bundleURL = app.bundleURL;
                  if (bundleURL) {
                    const bundlePath = ObjC.unwrap(bundleURL.path);
                    const icon = workspace.iconForFile(bundlePath);

                    if (icon) {
                      // アイコンをリサイズ
                      icon.setSize($.NSMakeSize(32, 32));

                      // PNGに変換
                      const tiffData = icon.TIFFRepresentation;
                      const imageRep =
                        $.NSBitmapImageRep.imageRepWithData(tiffData);
                      const pngData =
                        imageRep.representationUsingTypeProperties(
                          $.NSBitmapImageFileTypePNG,
                          $.NSDictionary.dictionary
                        );
                      const base64String =
                        pngData.base64EncodedStringWithOptions(0);
                      appIcon = `data:image/png;base64,${ObjC.unwrap(
                        base64String
                      )}`;
                      iconCache[appName] = appIcon;
                      break;
                    }
                  }
                }
              }
            } catch (iconError) {
              // アイコン取得エラーを無視
            }
          } else {
            appIcon = iconCache[appName];
          }

          try {
            const appWindows = process.windows();

            for (let i = 0; i < appWindows.length; i++) {
              try {
                const window = appWindows[i];
                const windowName = window.name();
                const position = window.position();
                const size = window.size();

                // ウィンドウの状態を取得
                let isMinimized = false;
                let isMaximized = false;
                try {
                  // System Eventsからウィンドウの属性を取得
                  const attributes = window.attributes();
                  for (let attr of attributes) {
                    const attrName = attr.name();
                    if (attrName === "AXMinimized") {
                      isMinimized = attr.value() || false;
                      console.log(`Window ${windowName}: AXMinimized = ${isMinimized}`);
                      break;
                    }
                  }

                  // ウィンドウサイズとディスプレイサイズを比較して最大化を判定
                  const screenWidth = 1920; // 後でディスプレイ情報から取得
                  const screenHeight = 1080;
                  isMaximized =
                    size[0] >= screenWidth * 0.95 &&
                    size[1] >= screenHeight * 0.9;
                } catch (e) {
                  // 属性取得に失敗した場合はプロパティを試す
                  try {
                    if (window.miniaturized) {
                      isMinimized = window.miniaturized() || false;
                    }
                  } catch (minErr) {
                    // プロパティが存在しない場合は無視
                  }
                }

                windows.push({
                  id: `${appName}-${windowName || `window-${i}`}`,
                  appName: appName,
                  appIcon: appIcon,
                  title: windowName || "Untitled",
                  bounds: {
                    x: position[0] || 0,
                    y: position[1] || 0,
                    width: size[0] || 100,
                    height: size[1] || 100,
                  },
                  isMinimized: isMinimized,
                  isFocused: false,
                  isVisible: !isMinimized,
                  isMaximized: isMaximized,
                });
              } catch (windowError) {
                // Skip individual windows that can't be accessed
              }
            }
          } catch (appError) {
            // Skip apps without accessible windows
          }
        }

        return windows;
      });

      return windowsData || [];
    } catch (error) {
      console.error("Error getting windows:", error);
      return [];
    }
  }

  private async getAllDisplays(): Promise<Display[]> {
    try {
      // Electron標準APIを使用してディスプレイ情報を取得
      const electronDisplays = screen.getAllDisplays();
      const primaryDisplay = screen.getPrimaryDisplay();

      return electronDisplays.map((display) => ({
        id: display.id.toString(),
        isPrimary: display.id === primaryDisplay.id,
        bounds: {
          x: display.bounds.x,
          y: display.bounds.y,
          width: display.bounds.width,
          height: display.bounds.height,
        },
      }));
    } catch (error) {
      console.error("Error getting displays:", error);
      // フォールバック: デフォルトディスプレイ情報を返す
      return [
        {
          id: "display-0",
          isPrimary: true,
          bounds: {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
          },
        },
      ];
    }
  }

  private async getActiveApp(): Promise<string> {
    try {
      // osascriptを使って外部プロセスからアクティブアプリを取得
      const { stdout } = await execAsync(`osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'`);
      const appName = stdout.trim();
      
      console.log('Current active app (raw):', appName);
      
      // Electronアプリ自体の場合の処理
      if (appName === 'Electron' || appName === 'Window AI Manager') {
        // Electronがフォーカスされている時は、最新の「前のアクティブアプリ」を探す
        console.log('Electron is focused - checking for actual active app');
        const currentActiveApp = await this.getRealActiveApp();
        
        if (currentActiveApp && currentActiveApp !== 'Electron' && currentActiveApp !== 'Window AI Manager') {
          console.log('Real active app detected:', currentActiveApp);
          this.lastActiveApp = currentActiveApp;
          return currentActiveApp;
        }
        
        // 見つからなければ前回の値を使用
        return this.lastActiveApp || 'Window AI Manager (フォーカス中)';
      }
      
      // 有効なアプリ名なら保存して返す
      this.lastActiveApp = appName;
      return appName;
      
    } catch (error) {
      console.error('Error getting active app:', error);
      return 'Unknown';
    }
  }

  private async getRealActiveApp(): Promise<string | null> {
    try {
      // より詳細な方法で実際にアクティブなアプリを取得
      // 最近アクティブになったプロセスを確認
      const { stdout } = await execAsync(`osascript -e '
        tell application "System Events"
          set allProcs to (every process whose visible is true)
          set activeProc to ""
          
          -- フロントモストではない、最も最近使用されたプロセスを探す
          repeat with proc in allProcs
            set procName to name of proc
            if procName is not "Electron" and procName is not "Window AI Manager" then
              set activeProc to procName
              exit repeat
            end if
          end repeat
          
          return activeProc
        end tell
      '`);
      
      const realApp = stdout.trim();
      console.log('Real active app search result:', realApp);
      return realApp !== '' ? realApp : null;
    } catch (error) {
      console.error('Error getting real active app:', error);
      return null;
    }
  }

  /**
   * 実際に現在フォーカスされているアプリを取得（定期監視用）
   */
  async getCurrentActiveApp(): Promise<string> {
    try {
      // 直接的にフロントモストアプリを取得
      const { stdout } = await execAsync(`osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'`);
      const currentApp = stdout.trim();
      
      // Electronアプリ以外なら、そのまま返す
      if (currentApp !== 'Electron' && currentApp !== 'Window AI Manager') {
        return currentApp;
      }
      
      // ElectronがフォーカスされているならWindow AI Managerと表示
      return 'Window AI Manager';
      
    } catch (error) {
      console.error('Error getting current active app:', error);
      return 'Unknown';
    }
  }

  private async getPreviousActiveApp(): Promise<string | null> {
    try {
      // 過去数秒間のアクティブアプリ履歴を確認（簡易版）
      // 実際には、最近使用したアプリケーションを取得
      const { stdout } = await execAsync(`osascript -e '
        tell application "System Events"
          set recentApps to {}
          repeat with proc in (processes whose background only is false)
            set end of recentApps to name of proc
          end repeat
          return item 2 of recentApps
        end tell
      '`);
      
      const recentApp = stdout.trim();
      console.log('Recent app found:', recentApp);
      return recentApp;
    } catch (error) {
      console.error('Error getting previous active app:', error);
      return null;
    }
  }

  async executeAction(action: WindowAction): Promise<boolean> {
    console.log("Executing action:", action.type, action);

    try {
      let result = false;

      switch (action.type) {
        case "move":
          console.log(
            "Moving window:",
            action.targetWindow,
            "to",
            action.parameters?.position
          );
          result = await this.moveWindow(
            action.targetWindow!,
            action.parameters!.position!
          );
          break;

        case "resize":
          console.log(
            "Resizing window:",
            action.targetWindow,
            "to",
            action.parameters?.size
          );
          result = await this.resizeWindow(
            action.targetWindow!,
            action.parameters!.size!
          );
          break;

        case "minimize":
          result = await this.minimizeWindow(action.targetWindow!);
          break;

        case "maximize":
          result = await this.maximizeWindow(action.targetWindow!);
          break;

        case "restore":
          result = await this.restoreWindow(action.targetWindow!);
          break;

        case "focus":
          result = await this.focusWindow(action.targetWindow!);
          break;

        case "arrange":
          console.log(
            "Arranging windows:",
            action.targetWindows,
            "with arrangement:",
            action.parameters?.arrangement
          );
          result = await this.arrangeWindows(
            action.targetWindows || [],
            action.parameters?.arrangement || "tile-left"
          );
          break;

        case "close":
          result = await this.closeWindow(action.targetWindow!);
          break;

        default:
          console.warn("Unknown action type:", action.type);
          result = false;
      }

      console.log(`Action ${action.type} result:`, result);
      return result;
    } catch (error) {
      console.error("Error executing action:", error);
      return false;
    }
  }

  private async moveWindow(
    windowId: string,
    position: { x: number; y: number }
  ): Promise<boolean> {
    const separatorIndex = windowId.indexOf("-");
    if (separatorIndex === -1) return false;

    const appName = windowId.substring(0, separatorIndex);
    const windowTitle = windowId.substring(separatorIndex + 1);

    return await run(
      (appName, windowTitle, x, y) => {
        try {
          const se = Application("System Events");
          const process = se.processes[appName];
          const window = process.windows.whose({ name: windowTitle })[0];
          window.position = [x, y];
          return true;
        } catch {
          return false;
        }
      },
      appName,
      windowTitle,
      position.x,
      position.y
    );
  }

  private async resizeWindow(
    windowId: string,
    size: { width: number; height: number }
  ): Promise<boolean> {
    const separatorIndex = windowId.indexOf("-");
    if (separatorIndex === -1) return false;

    const appName = windowId.substring(0, separatorIndex);
    const windowTitle = windowId.substring(separatorIndex + 1);

    return await run(
      (appName, windowTitle, width, height) => {
        try {
          const se = Application("System Events");
          const process = se.processes[appName];
          const window = process.windows.whose({ name: windowTitle })[0];
          window.size = [width, height];
          return true;
        } catch {
          return false;
        }
      },
      appName,
      windowTitle,
      size.width,
      size.height
    );
  }

  private async minimizeWindow(windowId: string): Promise<boolean> {
    console.log(`Minimizing window with ID: ${windowId}`);

    // windowIdは "appName-windowTitle" 形式なので、最初の"-"で分割
    const separatorIndex = windowId.indexOf("-");
    if (separatorIndex === -1) {
      console.error(`Invalid window ID format: ${windowId}`);
      return false;
    }

    const appName = windowId.substring(0, separatorIndex);
    const windowTitle = windowId.substring(separatorIndex + 1);

    console.log(`App: ${appName}, Window: ${windowTitle}`);

    try {
      const result = await run<{
        success: boolean;
        debug?: any[];
        message?: string;
        error?: string;
      }>(
        (appName, windowTitle) => {
          try {
            const se = Application("System Events");

            // アプリケーションをアクティブにする
            const app = Application(appName);
            app.activate();

            // System Eventsでウィンドウを操作
            const process = se.processes[appName];
            const windows = process.windows();

            // デバッグ情報を返す
            const debugInfo: any[] = [];

            for (let i = 0; i < windows.length; i++) {
              const win = windows[i];
              const winName = win.name();
              debugInfo.push(`Window ${i}: ${winName}`);

              if (
                winName === windowTitle ||
                (windowTitle.includes("window-") &&
                  i.toString() === windowTitle.split("-").pop())
              ) {
                // ウィンドウを最小化
                se.click(win.buttons.whose({ subrole: "AXMinimizeButton" })[0]);
                return { success: true, debug: debugInfo };
              }
            }

            return {
              success: false,
              debug: debugInfo,
              message: "Window not found",
            };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
        appName,
        windowTitle
      );

      console.log("Minimize result:", result);
      return result.success || false;
    } catch (error) {
      console.error("Error in minimizeWindow:", error);
      return false;
    }
  }

  private async maximizeWindow(windowId: string): Promise<boolean> {
    console.log(`Maximizing window with ID: ${windowId}`);

    const separatorIndex = windowId.indexOf("-");
    if (separatorIndex === -1) return false;

    const appName = windowId.substring(0, separatorIndex);
    const windowTitle = windowId.substring(separatorIndex + 1);

    try {
      const result = await run<{ success: boolean; message?: string }>(
        (appName, windowTitle) => {
          try {
            const se = Application("System Events");

            // アプリケーションをアクティブにする
            const app = Application(appName);
            app.activate();

            // System Eventsでウィンドウを操作
            const process = se.processes[appName];
            const windows = process.windows();

            for (let i = 0; i < windows.length; i++) {
              const win = windows[i];
              const winName = win.name();

              if (
                winName === windowTitle ||
                (windowTitle.includes("window-") &&
                  i.toString() === windowTitle.split("-").pop())
              ) {
                // 最大化ボタンをクリック（緑色のボタン）
                const buttons = win.buttons();
                for (let j = 0; j < buttons.length; j++) {
                  const button = buttons[j];
                  if (button.subrole() === "AXZoomButton") {
                    se.click(button);
                    return { success: true };
                  }
                }

                // フォールバック: サイズを手動で設定
                win.position = [0, 23]; // メニューバーの高さを考慮
                win.size = [1920, 1057]; // デフォルトサイズ
                return { success: true, message: "Manual resize" };
              }
            }

            return { success: false, message: "Window not found" };
          } catch (error) {
            return { success: false, message: String(error) };
          }
        },
        appName,
        windowTitle
      );

      console.log("Maximize result:", result);
      return result.success;
    } catch (error) {
      console.error("Error in maximizeWindow:", error);
      return false;
    }
  }

  private async restoreWindow(windowId: string): Promise<boolean> {
    console.log(`Restoring window with ID: ${windowId}`);

    const separatorIndex = windowId.indexOf("-");
    if (separatorIndex === -1) {
      console.error(`Invalid window ID format: ${windowId}`);
      return false;
    }

    const appName = windowId.substring(0, separatorIndex);
    const windowTitle = windowId.substring(separatorIndex + 1);
    console.log(`Restoring window: app=${appName}, title=${windowTitle}`);

    try {
      const result = await run<{ success: boolean; message?: string }>(
        (appName, windowTitle) => {
          try {
            const se = Application("System Events");
            const app = Application(appName);
            
            // まずアプリをアクティブにする
            app.activate();
            
            // System Eventsでウィンドウを取得
            const process = se.processes[appName];
            const windows = process.windows();
            
            for (let i = 0; i < windows.length; i++) {
              const win = windows[i];
              const winName = win.name();
              
              if (
                winName === windowTitle ||
                (windowTitle.includes("window-") &&
                  i.toString() === windowTitle.split("-").pop())
              ) {
                // AXMinimized属性を直接チェック
                let isMinimized = false;
                try {
                  const attributes = win.attributes();
                  for (let j = 0; j < attributes.length; j++) {
                    const attr = attributes[j];
                    if (attr.name() === "AXMinimized") {
                      isMinimized = attr.value();
                      break;
                    }
                  }
                } catch (attrErr) {
                  // エラー時はサイレントに
                }
                
                if (isMinimized) {
                  // 最小化されたウィンドウを即座に復元
                  try {
                    // AXMinimized属性を直接falseに設定
                    const attributes = win.attributes();
                    for (let j = 0; j < attributes.length; j++) {
                      const attr = attributes[j];
                      if (attr.name() === "AXMinimized") {
                        // 即座に復元
                        attr.value = false;
                        // アプリをアクティブに
                        app.activate();
                        return { success: true, message: "Restored" };
                      }
                    }
                  } catch (restoreErr) {
                    // エラー時はサイレントに処理
                  }
                }
                
                // 最大化されている場合の処理
                const currentSize = win.size();
                if (currentSize[0] >= 1900 && currentSize[1] >= 1000) {
                  win.position = [100, 100];
                  win.size = [1200, 800];
                  return { success: true, message: "Restored from maximize" };
                }
                
                // すでに通常状態
                app.activate();
                return { success: true, message: "Window activated" };
              }
            }
            
            return { success: false, message: "Window not found" };
          } catch (error) {
            console.log(`Error in restore: ${error}`);
            return { success: false, message: String(error) };
          }
        },
        appName,
        windowTitle
      );

      console.log("Restore result:", result);
      return result.success;
    } catch (error) {
      console.error("Error in restoreWindow:", error);
      return false;
    }
  }

  private async focusWindow(windowId: string): Promise<boolean> {
    const separatorIndex = windowId.indexOf("-");
    if (separatorIndex === -1) return false;

    const appName = windowId.substring(0, separatorIndex);
    const windowTitle = windowId.substring(separatorIndex + 1);

    return await run(
      (appName, windowTitle) => {
        try {
          const se = Application("System Events");
          const app = Application(appName);
          
          // まずアプリをアクティブにする
          app.activate();
          
          // System Eventsでウィンドウを取得
          const process = se.processes[appName];
          const windows = process.windows();
          
          for (let i = 0; i < windows.length; i++) {
            const win = windows[i];
            const winName = win.name();
            
            if (
              winName === windowTitle ||
              (windowTitle.includes("window-") &&
                i.toString() === windowTitle.split("-").pop())
            ) {
              // ウィンドウが最小化されているか確認
              let isMinimized = false;
              try {
                const attributes = win.attributes();
                for (let j = 0; j < attributes.length; j++) {
                  const attr = attributes[j];
                  if (attr.name() === "AXMinimized") {
                    isMinimized = attr.value();
                    if (isMinimized) {
                      // 最小化されている場合は復元
                      attr.value = false;
                    }
                    break;
                  }
                }
              } catch (attrErr) {
                // エラー時はサイレントに処理
              }
              
              // アプリを前面に
              process.frontmost = true;
              
              // ウィンドウをアクティブにする（ボタンをクリックせずに）
              try {
                // AXRaise アクションを実行してウィンドウを前面に
                win.actions.whose({ name: "AXRaise" })[0].perform();
              } catch (raiseErr) {
                // AXRaiseが使えない場合は、アプリのアクティブ化のみ
              }
              
              return true;
            }
          }
          
          return false;
        } catch {
          return false;
        }
      },
      appName,
      windowTitle
    );
  }

  private async arrangeWindows(
    windowIds: string[],
    arrangement: string
  ): Promise<boolean> {
    console.log(
      `Arranging ${windowIds.length} windows with arrangement: ${arrangement}`
    );
    console.log("Window IDs:", windowIds);

    if (!windowIds || windowIds.length === 0) {
      console.error("No windows to arrange");
      return false;
    }

    const state = await this.getWindowState();
    const primaryDisplay =
      state.displays.find((d) => d.isPrimary) || state.displays[0];

    if (!primaryDisplay) {
      console.error("No display found");
      return false;
    }

    const { width, height } = primaryDisplay.bounds;
    console.log(`Display size: ${width}x${height}`);

    // メニューバーの高さを考慮
    const menuBarHeight = 23;
    const adjustedHeight = height - menuBarHeight;

    try {
      switch (arrangement) {
        case "tile-left":
        case "tile-right":
          console.log("Tiling windows left/right");
          // Split screen left/right
          for (let i = 0; i < windowIds.length && i < 2; i++) {
            const x = i === 0 ? 0 : width / 2;
            const moveResult = await this.moveWindow(windowIds[i], {
              x,
              y: menuBarHeight,
            });
            const resizeResult = await this.resizeWindow(windowIds[i], {
              width: width / 2,
              height: adjustedHeight,
            });
            console.log(
              `Window ${i}: move=${moveResult}, resize=${resizeResult}`
            );
          }
          break;

        case "tile-grid":
          console.log("Tiling windows in grid");
          // 2x2 grid
          const gridWidth = width / 2;
          const gridHeight = adjustedHeight / 2;

          for (let i = 0; i < windowIds.length && i < 4; i++) {
            const row = Math.floor(i / 2);
            const col = i % 2;
            const x = col * gridWidth;
            const y = row * gridHeight + menuBarHeight;

            const moveResult = await this.moveWindow(windowIds[i], { x, y });
            const resizeResult = await this.resizeWindow(windowIds[i], {
              width: gridWidth,
              height: gridHeight,
            });
            console.log(
              `Window ${i} (row=${row}, col=${col}): move=${moveResult}, resize=${resizeResult}`
            );
          }
          break;

        case "cascade":
          console.log("Cascading windows");
          // Cascade windows
          const offset = 30;
          for (let i = 0; i < windowIds.length; i++) {
            const x = i * offset + 50;
            const y = i * offset + 50;

            const moveResult = await this.moveWindow(windowIds[i], { x, y });
            const resizeResult = await this.resizeWindow(windowIds[i], {
              width: width * 0.6,
              height: adjustedHeight * 0.6,
            });
            console.log(
              `Window ${i}: move=${moveResult}, resize=${resizeResult}`
            );
          }
          break;

        case "center":
          console.log("Centering window");
          // Center window
          if (windowIds.length > 0) {
            const centerWidth = width * 0.8;
            const centerHeight = adjustedHeight * 0.8;
            const x = (width - centerWidth) / 2;
            const y = (adjustedHeight - centerHeight) / 2 + menuBarHeight;

            const moveResult = await this.moveWindow(windowIds[0], { x, y });
            const resizeResult = await this.resizeWindow(windowIds[0], {
              width: centerWidth,
              height: centerHeight,
            });
            console.log(
              `Center window: move=${moveResult}, resize=${resizeResult}`
            );
          }
          break;

        default:
          console.warn(`Unknown arrangement: ${arrangement}`);
          return false;
      }

      console.log("Arrange completed successfully");
      return true;
    } catch (error) {
      console.error("Error in arrangeWindows:", error);
      return false;
    }
  }

  private async closeWindow(windowId: string): Promise<boolean> {
    console.log(`Closing window with ID: ${windowId}`);

    const separatorIndex = windowId.indexOf("-");
    if (separatorIndex === -1) return false;

    const appName = windowId.substring(0, separatorIndex);
    const windowTitle = windowId.substring(separatorIndex + 1);

    try {
      const result = await run<boolean>(
        (appName, windowTitle) => {
          try {
            const se = Application("System Events");
            const process = se.processes[appName];
            const windows = process.windows();

            for (let i = 0; i < windows.length; i++) {
              const win = windows[i];
              const winName = win.name();

              if (
                winName === windowTitle ||
                (windowTitle.includes("window-") &&
                  i.toString() === windowTitle.split("-").pop())
              ) {
                // 閉じるボタンをクリック
                const buttons = win.buttons();
                for (let j = 0; j < buttons.length; j++) {
                  const button = buttons[j];
                  if (button.subrole() === "AXCloseButton") {
                    se.click(button);
                    return true;
                  }
                }

                // フォールバック: Command+W を送信
                se.keystroke("w", { using: "command down" });
                return true;
              }
            }

            return false;
          } catch {
            return false;
          }
        },
        appName,
        windowTitle
      );

      console.log("Close window result:", result);
      return result;
    } catch (error) {
      console.error("Error in closeWindow:", error);
      return false;
    }
  }

  async quitApp(appName: string): Promise<boolean> {
    console.log(`Quitting app: ${appName}`);

    try {
      const result = await run<boolean>((appName) => {
        try {
          const app = Application(appName);
          app.quit();
          return true;
        } catch {
          // フォールバック: System Events を使用
          try {
            const se = Application("System Events");
            const process = se.processes[appName];
            se.keystroke("q", { using: "command down" });
            return true;
          } catch {
            return false;
          }
        }
      }, appName);

      console.log("Quit app result:", result);
      return result;
    } catch (error) {
      console.error("Error in quitApp:", error);
      return false;
    }
  }

  async getCpuInfo(): Promise<CpuInfo> {
    try {
      // Node.jsのosモジュールでCPU情報を取得
      const cpus = os.cpus();
      const model = cpus[0]?.model || "Unknown";
      const cores = cpus.length;

      // CPU使用率を計算（簡易版）
      const usage = await this.calculateCpuUsage();

      // プロセス情報を取得（複数の方法を試す）
      const processes = await this.getTopProcessesWithFallback();
      
      // プロセスの説明をAIで生成
      const processesWithDescriptions = await this.addProcessDescriptions(processes);

      return {
        model,
        cores,
        usage,
        processes: processesWithDescriptions,
      };
    } catch (error) {
      console.error("Error getting CPU info:", error);
      // フォールバック値を返す
      return {
        model: "Unknown",
        cores: os.cpus().length || 4,
        usage: 0,
        processes: [],
      };
    }
  }

  private async calculateCpuUsage(): Promise<number> {
    return new Promise((resolve) => {
      const startMeasure = os.cpus();
      
      setTimeout(() => {
        const endMeasure = os.cpus();
        
        let totalIdle = 0;
        let totalTick = 0;
        
        for (let i = 0; i < startMeasure.length; i++) {
          const startCpu = startMeasure[i];
          const endCpu = endMeasure[i];
          
          const startTotal = Object.values(startCpu.times).reduce((acc, time) => acc + time, 0);
          const endTotal = Object.values(endCpu.times).reduce((acc, time) => acc + time, 0);
          
          const startIdle = startCpu.times.idle;
          const endIdle = endCpu.times.idle;
          
          totalIdle += endIdle - startIdle;
          totalTick += endTotal - startTotal;
        }
        
        const usage = 100 - Math.round((100 * totalIdle) / totalTick);
        resolve(usage);
      }, 100); // 100ms間隔で測定
    });
  }

  private async getTopProcessesWithFallback(): Promise<ProcessInfo[]> {
    const methods = [
      { name: "PS", fn: () => this.getTopProcessesPS() },
      { name: "Node.js", fn: () => this.getTopProcessesNode() },
      { name: "JXA", fn: () => this.getTopProcessesJXA() }
    ];

    for (const method of methods) {
      try {
        const processes = await method.fn();
        if (processes.length > 0) {
          console.log(`Using ${method.name} method for process info`);
          return processes;
        }
      } catch (error) {
        console.log(`${method.name} method failed:`, error);
      }
    }

    console.log("All methods failed, returning empty process list");
    return [];
  }

  private async getTopProcessesNode(): Promise<ProcessInfo[]> {
    try {
      // CPU使用率順でソートし、より多くのプロセスを取得
      const { stdout } = await execAsync("top -l 1 -n 20 -o cpu -stats pid,command,cpu,mem");
      const lines = stdout.split("\n");
      
      const processes: ProcessInfo[] = [];
      let dataStarted = false;
      
      // デバッグ用ログは本番では無効化
      // console.log("Node.js top output first 3 lines:");
      // lines.slice(0, 3).forEach((line, i) => console.log(`${i}: ${line}`));
      
      for (const line of lines) {
        // ヘッダー行を探す
        if (line.includes("PID") && (line.includes("COMMAND") || line.includes("COMM"))) {
          dataStarted = true;
          // console.log("Found header:", line);
          continue;
        }
        
        if (dataStarted && line.trim()) {
          const parts = line.trim().split(/\s+/);
          
            if (parts.length >= 8) { // メモリ情報も含むため最低8要素必要
              const pid = parseInt(parts[0]);
              const command = parts[1]; // 2番目の要素がCOMMAND
              const cpuUsage = parseFloat(parts[2]);
              const memoryStr = parts[7]; // 8番目の要素がMEM
              
              if (!isNaN(pid) && !isNaN(cpuUsage) && command && command !== 'N/A') {
                const processName = this.extractProcessName(command);
                const memoryUsage = this.parseMemoryFromTop(memoryStr);
                
                processes.push({
                  pid,
                  name: processName,
                  cpuUsage,
                  memoryUsage,
                });
              }
            }
        }
      }
      
      // CPU使用率でソート（高い順）
      processes.sort((a, b) => b.cpuUsage - a.cpuUsage);
      
      console.log(`Found ${processes.length} processes via Node.js`);
      
      return processes.slice(0, 5);
    } catch (error) {
      console.error("Node.js top command failed:", error);
      return [];
    }
  }

  private async getTopProcessesPS(): Promise<ProcessInfo[]> {
    try {
      // psコマンドでCPU使用率順にプロセスを取得（より多くのプロセスを対象）
      const { stdout } = await execAsync("ps aux | sort -nr -k 3 | head -50");
      const lines = stdout.split("\n").filter(line => line.trim());
      
      const processes: ProcessInfo[] = [];
      
      // console.log("PS command output:");
      // lines.forEach((line, i) => console.log(`${i}: ${line}`));
      
      for (const line of lines) {
        if (line.trim()) {
          const parts = line.trim().split(/\s+/);
          
          if (parts.length >= 11) {
            const pid = parseInt(parts[1]);
            const cpuUsage = parseFloat(parts[2]);
            const rssMemory = parts[5]; // RSS列（実メモリ使用量）
            const command = parts.slice(10).join(" "); // コマンド部分
            
            if (!isNaN(pid) && !isNaN(cpuUsage)) {
              // プロセス名を短縮（パスから実行ファイル名のみ抽出）
              const processName = this.extractProcessName(command);
              const memoryMB = this.parseMemoryFromPS(rssMemory);
              
              processes.push({
                pid,
                name: processName,
                cpuUsage,
                memoryUsage: memoryMB,
              });
            }
          }
        }
      }
      
      // CPU使用率でソート
      processes.sort((a, b) => b.cpuUsage - a.cpuUsage);
      
      // 特定のアプリのプロセスを追加で検索（CPU使用率が低くても重要なアプリ）
      await this.addMissingAppProcesses(processes);
      
      console.log(`Found ${processes.length} processes via PS`);
      return processes.slice(0, 10);
    } catch (error) {
      console.error("PS command failed:", error);
      return [];
    }
  }

  private async getTopProcessesJXA(): Promise<ProcessInfo[]> {
    try {
      const processData = await run<any>(() => {
        // JXAでtopコマンドの結果を取得
        const app = Application.currentApplication();
        app.includeStandardAdditions = true;
        
        try {
          // topコマンドを実行してプロセス情報を取得
          const result = app.doShellScript("top -l 1 -n 10 -o cpu");
          const lines = result.split("\n");
          
          const processes: any[] = [];
          let dataStarted = false;
          const debugInfo: any = {
            totalLines: lines.length,
            headerFound: false,
            processLines: [],
            rawOutput: result.substring(0, 500) // 最初の500文字のみログ
          };
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // ヘッダー行を探す（複数のパターンを試す）
            if (line.includes("PID") && (line.includes("COMMAND") || line.includes("COMM"))) {
              dataStarted = true;
              debugInfo.headerFound = true;
              debugInfo.headerLine = line;
              continue;
            }
            
            if (dataStarted && line.trim()) {
              const parts = line.trim().split(/\s+/);
              debugInfo.processLines.push({
                line: line,
                parts: parts,
                partsLength: parts.length
              });
              
              if (parts.length >= 8) {
                const pid = parseInt(parts[0]);
                const command = parts[1]; // 2番目の要素がCOMMAND
                const cpuUsage = parseFloat(parts[2]);
                const memoryStr = parts[7]; // 8番目の要素がMEM
                
                if (!isNaN(pid) && !isNaN(cpuUsage) && command && command !== 'N/A') {
                  const processName = this.extractProcessName(command);
                  const memoryUsage = this.parseMemoryFromTop(memoryStr);
                  
                  processes.push({
                    pid,
                    name: processName,
                    cpuUsage,
                    memoryUsage,
                  });
                }
              }
            }
          }
          
          return {
            processes: processes.slice(0, 5),
            debug: debugInfo
          };
        } catch (error) {
          return {
            processes: [],
            error: String(error)
          };
        }
      });
      
      // エラーログのみ出力
      if (processData?.error) {
        console.error("Top command error:", processData.error);
      }
      
      return processData?.processes || [];
    } catch (error) {
      console.error("Error getting top processes:", error);
      return [];
    }
  }

  private async addProcessDescriptions(processes: ProcessInfo[]): Promise<ProcessInfo[]> {
    if (!this.claudeService || processes.length === 0) {
      return processes;
    }

    try {
      console.log("Generating AI descriptions for processes...");
      
      const processNames = processes.map(p => p.name).join(', ');
      const prompt = `以下のmacOSプロセスについて、それぞれ1行で簡潔に説明してください（各プロセス名: 説明の形式で）：

${processNames}

例：
Safari: Appleのウェブブラウザ
WindowServer: macOSの画面描画を管理するシステムプロセス`;

      const response = await this.claudeService.analyzeWindowState(
        { windows: [], displays: [], activeApp: '', timestamp: Date.now() },
        prompt
      );

      const descriptions = this.parseProcessDescriptions(response.explanation || '');
      
      // プロセスに説明を追加
      return processes.map(process => ({
        ...process,
        description: descriptions[process.name] || 'システムプロセス'
      }));
      
    } catch (error) {
      console.error('Error generating process descriptions:', error);
      // エラーの場合はデフォルト説明を追加
      return processes.map(process => ({
        ...process,
        description: this.getDefaultDescription(process.name)
      }));
    }
  }

  private parseProcessDescriptions(text: string): Record<string, string> {
    const descriptions: Record<string, string> = {};
    const lines = text.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^(.+?):\s*(.+)$/);
      if (match) {
        const processName = match[1].trim();
        const description = match[2].trim();
        descriptions[processName] = description;
      }
    }
    
    return descriptions;
  }

  private getDefaultDescription(processName: string): string {
    const defaultDescriptions: Record<string, string> = {
      'kernel_task': 'macOSカーネルタスク（システム核心部）',
      'WindowServer': 'macOS画面描画管理システム',
      'Safari': 'Appleのウェブブラウザ',
      'Chrome': 'Googleのウェブブラウザ',
      'Firefox': 'Mozillaのウェブブラウザ',
      'Arc': 'The Browser Companyのウェブブラウザ',
      'Cursor': 'AI統合型コードエディタ',
      'electron': 'Electronアプリケーションフレームワーク',
      'Discord': 'ゲーマー向けチャットアプリ',
      'Teracy': 'リモートワーカー向けオンラインワークスペース', 
      'Notion': 'ノート・ドキュメント管理アプリ',
      'Slack': 'ビジネスチャットアプリ',
      'ChatGPT': 'OpenAIのAIチャットアプリケーション',
      'Terminal': 'macOS標準ターミナルアプリ',
      'Activity Monitor': 'macOSシステム監視ツール',
      'coreaudiod': 'macOSオーディオシステム',
      'distnoted': 'macOS通知配信システム',
      'mobileassetd': 'macOSアセット管理システム',
      'photolibraryd': '写真ライブラリ管理システム',
      'photoanalysisd': '写真解析・顔認識システム'
    };
    
    return defaultDescriptions[processName] || 'システムプロセス';
  }

  private extractProcessName(fullCommand: string): string {
    // パスから実行ファイル名のみ抽出
    if (fullCommand.includes('/')) {
      // アプリケーション名を抽出（例：/Applications/Cursor.app/... -> Cursor）
      const appMatch = fullCommand.match(/\/Applications\/([^\/]+)\.app\//);
      if (appMatch) {
        return appMatch[1];
      }
      
      // System系のアプリ（例：/System/Library/CoreServices/ControlCenter.app/... -> ControlCenter）
      const systemAppMatch = fullCommand.match(/\/([^\/]+)\.app\/Contents\/MacOS\/([^\/\s]+)/);
      if (systemAppMatch) {
        return systemAppMatch[1];
      }
      
      // Helper系の場合は親アプリ名を抽出
      const helperMatch = fullCommand.match(/\/([^\/]+)\.app\/.*\/([^\/\s]+)/);
      if (helperMatch) {
        const appName = helperMatch[1];
        const executableName = helperMatch[2];
        
        if (executableName.includes('Helper')) {
          return appName;
        }
      }
      
      // 最後の手段：最後のパス要素を取得
      const parts = fullCommand.split('/');
      let executableName = parts[parts.length - 1];
      
      // スペースで区切られている場合は最初の部分のみ
      if (executableName.includes(' ')) {
        executableName = executableName.split(' ')[0];
      }
      
      return executableName;
    }
    
    // パスでない場合はそのまま返す（スペース区切りの最初の部分のみ）
    return fullCommand.split(' ')[0];
  }

  private async enrichWindowsWithResourceUsage(windows: WindowInfo[], processes: ProcessInfo[]): Promise<WindowInfo[]> {
    try {
      // アプリ名ごとにプロセスをグループ化してCPU/メモリ使用量を集計
      const appResourceMap = this.buildAppResourceMap(processes);
      
      // ウィンドウにリソース使用量を追加
      return windows.map(window => {
        const normalizedAppName = this.normalizeAppName(window.appName);
        const resourceUsage = appResourceMap.get(normalizedAppName);

        return {
          ...window,
          cpuUsage: resourceUsage?.totalCpu || 0,
          memoryUsage: resourceUsage?.totalMemory || 0
        };
      });
      
    } catch (error) {
      console.error("Error in enrichWindowsWithResourceUsage:", error);
      return this.addDefaultResourceUsage(windows);
    }
  }

  private buildAppResourceMap(processes: ProcessInfo[]): Map<string, AppResourceUsage> {
    const appResourceMap = new Map<string, AppResourceUsage>();

    for (const process of processes) {
      try {
        const appName = this.mapProcessToAppName(process.name);
        
        if (appResourceMap.has(appName)) {
          const existing = appResourceMap.get(appName)!;
          existing.totalCpu += process.cpuUsage;
          existing.totalMemory += process.memoryUsage;
          existing.processCount += 1;
        } else {
          appResourceMap.set(appName, {
            totalCpu: process.cpuUsage,
            totalMemory: process.memoryUsage,
            processCount: 1
          });
        }
      } catch (error) {
        console.error(`Error processing ${process.name}:`, error);
      }
    }

    return appResourceMap;
  }

  private addDefaultResourceUsage(windows: WindowInfo[]): WindowInfo[] {
    return windows.map(window => ({
      ...window,
      cpuUsage: 0,
      memoryUsage: 0
    }));
  }

  // アプリ名マッピングテーブル（統合）
  private static readonly APP_MAPPINGS: Record<string, string> = {
    // メインアプリ
    'Cursor': 'Cursor',
    'Arc': 'Arc', 
    'Teracy': 'Teracy',
    'Discord': 'Discord',
    'Notion': 'Notion',
    'ChatGPT': 'ChatGPT',
    'Safari': 'Safari',
    'Slack': 'Slack',
    'Terminal': 'Terminal',
    'Activity Monitor': 'Activity Monitor',
    'RescueTime': 'RescueTime',
    
    // Helper プロセス
    'Cursor Helper': 'Cursor',
    'Browser Helper': 'Arc',
    'Arc Helper': 'Arc',
    'Teracy Helper': 'Teracy', 
    'Discord Helper': 'Discord',
    'Notion Helper': 'Notion',
    'Chrome Helper': 'Google Chrome',
    
    // システムアプリ
    'ControlCenter': 'Control Center',
    'Control Center': 'Control Center',
    
    // Electron系
    'app.asar': 'Electron App',
    'app': 'Electron App',
    'Electron': 'Electron App',
    'Electron Helper': 'Electron App'
  };

  private mapProcessToAppName(processName: string): string {
    // 完全一致チェック
    if (WindowManager.APP_MAPPINGS[processName]) {
      return WindowManager.APP_MAPPINGS[processName];
    }

    // 部分一致チェック
    for (const [processKey, appName] of Object.entries(WindowManager.APP_MAPPINGS)) {
      if (processName.includes(processKey)) {
        return appName;
      }
    }

    return processName;
  }

  private normalizeAppName(appName: string): string {
    // 統合されたマッピングテーブルを使用
    return WindowManager.APP_MAPPINGS[appName] || appName;
  }

  private parseMemoryFromPS(rssValue: string): number {
    // PSコマンドのRSS列をMBに変換（単位：KB）
    return this.parseMemoryValue(rssValue, 'KB');
  }

  private parseMemoryFromTop(memoryStr: string): number {
    // topコマンドのMEM列をMBに変換（K/M/G単位）
    if (!memoryStr) return 0;
    
    if (memoryStr.includes('M')) {
      return this.parseMemoryValue(memoryStr.replace('M', ''), 'MB');
    } else if (memoryStr.includes('K')) {
      return this.parseMemoryValue(memoryStr.replace('K', ''), 'KB');
    } else if (memoryStr.includes('G')) {
      return this.parseMemoryValue(memoryStr.replace('G', ''), 'GB');
    }
    
    return 0;
  }

  private parseMemoryValue(value: string, unit: 'KB' | 'MB' | 'GB'): number {
    // 数値以外の文字を除去してパース
    const cleanValue = value.replace(/[^\d.]/g, '');
    const numericValue = parseFloat(cleanValue);
    if (isNaN(numericValue)) return 0;
    
    // MBに統一
    switch (unit) {
      case 'KB': return Math.round((numericValue / 1024) * 10) / 10;
      case 'MB': return Math.round(numericValue * 10) / 10;
      case 'GB': return Math.round((numericValue * 1024) * 10) / 10;
      default: return 0;
    }
  }

  private async addMissingAppProcesses(existingProcesses: ProcessInfo[]): Promise<void> {
    const importantApps = ['Slack', 'Terminal', 'Activity Monitor', 'ChatGPT'];
    const existingAppNames = new Set(existingProcesses.map(p => this.mapProcessToAppName(p.name)));
    
    for (const appName of importantApps) {
      if (!existingAppNames.has(appName)) {
        try {
          // 特定のアプリのプロセスを検索
          const { stdout } = await execAsync(`ps aux | grep -i "${appName}" | grep -v grep | head -5`);
          const lines = stdout.split("\n").filter(line => line.trim());
          
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 11) {
              const pid = parseInt(parts[1]);
              const cpuUsage = parseFloat(parts[2]);
              const command = parts.slice(10).join(" ");
              
              if (!isNaN(pid) && !isNaN(cpuUsage)) {
                const processName = this.extractProcessName(command);
                
                existingProcesses.push({
                  pid,
                  name: processName,
                  cpuUsage,
                  memoryUsage: this.parseMemoryFromPS(parts[5]) || 0,
                });
              }
            }
          }
        } catch (error) {
          // エラーは静かに処理（重要でない）
        }
      }
    }
  }
}

