import { run } from "@jxa/run";
import { screen } from "electron";
import { WindowState, WindowInfo, Display, WindowAction } from "./types";

export class WindowManager {
  async getWindowState(): Promise<WindowState> {
    const windows = await this.getAllWindows();
    const displays = await this.getAllDisplays();
    const activeApp = await this.getActiveApp();

    return {
      windows,
      displays,
      activeApp,
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
                  // miniaturizedプロパティで最小化状態を確認
                  isMinimized = window.miniaturized && window.miniaturized() || false;
                  
                  // ウィンドウサイズとディスプレイサイズを比較して最大化を判定
                  const screenWidth = 1920; // 後でディスプレイ情報から取得
                  const screenHeight = 1080;
                  isMaximized = size[0] >= screenWidth * 0.95 && size[1] >= screenHeight * 0.9;
                } catch (e) {
                  // 状態取得エラーは無視
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
                  isMaximized: isMaximized
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
    return await run<string>(() => {
      const se = Application("System Events");
      return se.processes.whose({ frontmost: true })[0].name();
    });
  }

  async executeAction(action: WindowAction): Promise<boolean> {
    console.log("Executing action:", action.type, action);
    
    try {
      let result = false;
      
      switch (action.type) {
        case "move":
          console.log("Moving window:", action.targetWindow, "to", action.parameters?.position);
          result = await this.moveWindow(
            action.targetWindow!,
            action.parameters!.position!
          );
          break;
          
        case "resize":
          console.log("Resizing window:", action.targetWindow, "to", action.parameters?.size);
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
          
        case "focus":
          result = await this.focusWindow(action.targetWindow!);
          break;
          
        case "arrange":
          console.log("Arranging windows:", action.targetWindows, "with arrangement:", action.parameters?.arrangement);
          result = await this.arrangeWindows(
            action.targetWindows || [],
            action.parameters?.arrangement || 'tile-left'
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
      const result = await run<{ success: boolean; debug?: any[]; message?: string; error?: string }>(
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
              
              if (winName === windowTitle || 
                  windowTitle.includes("window-") && i.toString() === windowTitle.split("-").pop()) {
                // ウィンドウを最小化
                se.click(win.buttons.whose({ subrole: "AXMinimizeButton" })[0]);
                return { success: true, debug: debugInfo };
              }
            }
            
            return { success: false, debug: debugInfo, message: "Window not found" };
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
              
              if (winName === windowTitle || 
                  (windowTitle.includes("window-") && i.toString() === windowTitle.split("-").pop())) {
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
              
              if (winName === windowTitle || 
                  (windowTitle.includes("window-") && i.toString() === windowTitle.split("-").pop())) {
                
                // 最小化されている場合は復元
                if (win.miniaturized && win.miniaturized()) {
                  win.miniaturized = false;
                  return { success: true, message: "Restored from minimize" };
                }
                
                // 最大化されている場合は元のサイズに戻す
                const currentSize = win.size();
                if (currentSize[0] >= 1900 && currentSize[1] >= 1000) {
                  // デフォルトのウィンドウサイズに戻す
                  win.position = [100, 100];
                  win.size = [1200, 800];
                  return { success: true, message: "Restored from maximize" };
                }
                
                return { success: true, message: "Already in normal state" };
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
          const process = se.processes[appName];
          process.frontmost = true;

          const window = process.windows.whose({ name: windowTitle })[0];
          se.click(window.buttons[0]); // Click to focus
          return true;
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
    console.log(`Arranging ${windowIds.length} windows with arrangement: ${arrangement}`);
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
            const moveResult = await this.moveWindow(windowIds[i], { x, y: menuBarHeight });
            const resizeResult = await this.resizeWindow(windowIds[i], { 
              width: width / 2, 
              height: adjustedHeight 
            });
            console.log(`Window ${i}: move=${moveResult}, resize=${resizeResult}`);
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
            console.log(`Window ${i} (row=${row}, col=${col}): move=${moveResult}, resize=${resizeResult}`);
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
            console.log(`Window ${i}: move=${moveResult}, resize=${resizeResult}`);
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
            console.log(`Center window: move=${moveResult}, resize=${resizeResult}`);
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
              
              if (winName === windowTitle || 
                  (windowTitle.includes("window-") && i.toString() === windowTitle.split("-").pop())) {
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
      const result = await run<boolean>(
        (appName) => {
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
        },
        appName
      );
      
      console.log("Quit app result:", result);
      return result;
    } catch (error) {
      console.error("Error in quitApp:", error);
      return false;
    }
  }
}
