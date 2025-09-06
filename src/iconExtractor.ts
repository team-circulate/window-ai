import { run } from "@jxa/run";
import { nativeImage } from "electron";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class IconExtractor {
  private iconCache: Map<string, string> = new Map();
  private loadingPromises: Map<string, Promise<string | null>> = new Map();
  private preloadComplete = false;

  /**
   * 複数のアプリパスからバッチでアイコンを取得
   */
  async getAppIconsWithJXA(appPaths: string[]): Promise<Map<string, string>> {
    try {
      const iconsData = await run<Record<string, string>>((appPaths: string[]) => {
        ObjC.import("AppKit");
        
        const workspace = $.NSWorkspace.sharedWorkspace;
        const results: Record<string, string> = {};
        
        for (const appPath of appPaths) {
          try {
            const icon = workspace.iconForFile(appPath);
            
            if (icon) {
              // アイコンをリサイズ
              icon.setSize($.NSMakeSize(48, 48));
              
              // PNGに変換
              const tiffData = icon.TIFFRepresentation;
              const imageRep = $.NSBitmapImageRep.imageRepWithData(tiffData);
              const pngData = imageRep.representationUsingTypeProperties(
                $.NSBitmapImageFileTypePNG,
                $.NSDictionary.dictionary
              );
              const base64String = pngData.base64EncodedStringWithOptions(0);
              
              results[appPath] = ObjC.unwrap(base64String);
            }
          } catch (e) {
            // 個別のアイコン取得エラーは無視
          }
        }
        
        return results;
      }, appPaths);

      const resultMap = new Map<string, string>();
      for (const [path, data] of Object.entries(iconsData)) {
        if (data) {
          resultMap.set(path, `data:image/png;base64,${data}`);
        }
      }
      
      return resultMap;
    } catch (error) {
      console.error(`Batch JXA icon extraction failed:`, error);
      return new Map();
    }
  }

  /**
   * JXAを使用してアプリのアイコンを取得（単体）
   */
  async getAppIconWithJXA(appPath: string): Promise<string | null> {
    const result = await this.getAppIconsWithJXA([appPath]);
    return result.get(appPath) || null;
  }

  /**
   * sipsコマンドを使用してicnsファイルをPNGに変換
   */
  async convertIcnsToPng(icnsPath: string): Promise<string | null> {
    try {
      const tempDir = path.join(__dirname, 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempPngPath = path.join(tempDir, `${Date.now()}.png`);
      
      // sipsコマンドでicnsをPNGに変換
      await execAsync(`sips -s format png "${icnsPath}" --out "${tempPngPath}" --resampleHeight 48`);
      
      if (fs.existsSync(tempPngPath)) {
        const image = nativeImage.createFromPath(tempPngPath);
        const dataUrl = image.toDataURL();
        
        // 一時ファイルを削除
        fs.unlinkSync(tempPngPath);
        
        return dataUrl;
      }
      
      return null;
    } catch (error) {
      console.error(`Failed to convert icns to PNG:`, error);
      return null;
    }
  }

  /**
   * アプリのアイコンを取得（キャッシュ付き）
   */
  async getAppIcon(appName: string, appPath?: string): Promise<string | null> {
    // キャッシュをチェック
    const cacheKey = appPath || appName;
    if (this.iconCache.has(cacheKey)) {
      return this.iconCache.get(cacheKey)!;
    }

    // 既に読み込み中の場合は、その Promise を返す
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey)!;
    }

    // 新しい読み込みを開始
    const loadPromise = this._loadAppIcon(appName, appPath);
    this.loadingPromises.set(cacheKey, loadPromise);

    try {
      const result = await loadPromise;
      this.loadingPromises.delete(cacheKey);
      return result;
    } catch (error) {
      this.loadingPromises.delete(cacheKey);
      throw error;
    }
  }

  private async _loadAppIcon(appName: string, appPath?: string): Promise<string | null> {
    const cacheKey = appPath || appName;
    let iconData: string | null = null;

    // アプリパスが提供されている場合
    if (appPath && fs.existsSync(appPath)) {
      // JXAを使用してアイコンを取得（高速）
      iconData = await this.getAppIconWithJXA(appPath);
    }

    // アプリパスが不明な場合、標準的な場所を検索
    if (!iconData) {
      const searchPaths = [
        `/Applications/${appName}.app`,
        `/System/Applications/${appName}.app`,
        `${process.env.HOME}/Applications/${appName}.app`
      ];
      
      for (const searchPath of searchPaths) {
        if (fs.existsSync(searchPath)) {
          iconData = await this.getAppIconWithJXA(searchPath);
          if (iconData) break;
        }
      }
    }

    // デフォルトアイコンを使用
    if (!iconData) {
      const defaultIconPath = '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericApplicationIcon.icns';
      if (fs.existsSync(defaultIconPath)) {
        // デフォルトアイコンは一度だけ変換してキャッシュ
        if (!this.iconCache.has('__default__')) {
          iconData = await this.convertIcnsToPng(defaultIconPath);
          if (iconData) {
            this.iconCache.set('__default__', iconData);
          }
        } else {
          iconData = this.iconCache.get('__default__')!;
        }
      }
    }

    // キャッシュに保存
    if (iconData) {
      this.iconCache.set(cacheKey, iconData);
    }

    return iconData;
  }

  /**
   * 複数のアプリのアイコンを一括で取得
   */
  async getAppIconsBatch(apps: Array<{name: string, path?: string}>): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>();
    const uncachedApps: Array<{name: string, path?: string}> = [];
    
    // キャッシュチェック
    for (const app of apps) {
      const cacheKey = app.path || app.name;
      if (this.iconCache.has(cacheKey)) {
        results.set(app.name, this.iconCache.get(cacheKey)!);
      } else {
        uncachedApps.push(app);
      }
    }
    
    // キャッシュされていないアプリのパスを収集
    const pathsToLoad: string[] = [];
    const appPathMap = new Map<string, string>();
    
    for (const app of uncachedApps) {
      if (app.path && fs.existsSync(app.path)) {
        pathsToLoad.push(app.path);
        appPathMap.set(app.path, app.name);
      } else {
        // 標準的な場所を検索
        const searchPaths = [
          `/Applications/${app.name}.app`,
          `/System/Applications/${app.name}.app`,
          `${process.env.HOME}/Applications/${app.name}.app`
        ];
        
        for (const searchPath of searchPaths) {
          if (fs.existsSync(searchPath)) {
            pathsToLoad.push(searchPath);
            appPathMap.set(searchPath, app.name);
            break;
          }
        }
      }
    }
    
    // バッチでアイコンを取得
    if (pathsToLoad.length > 0) {
      const icons = await this.getAppIconsWithJXA(pathsToLoad);
      
      for (const [path, iconData] of icons) {
        const appName = appPathMap.get(path);
        if (appName) {
          results.set(appName, iconData);
          // キャッシュに保存
          this.iconCache.set(path, iconData);
          this.iconCache.set(appName, iconData);
        }
      }
    }
    
    // アイコンが見つからなかったアプリはnullを設定
    for (const app of apps) {
      if (!results.has(app.name)) {
        results.set(app.name, null);
      }
    }
    
    return results;
  }

  /**
   * 全アプリのアイコンをプリロード
   */
  async preloadAllIcons(apps: Array<{name: string, path: string}>): Promise<void> {
    if (this.preloadComplete) return;
    
    console.log(`Preloading icons for ${apps.length} apps...`);
    const startTime = Date.now();
    
    // バッチサイズを設定（一度に処理するアプリ数）
    const batchSize = 20;
    
    for (let i = 0; i < apps.length; i += batchSize) {
      const batch = apps.slice(i, Math.min(i + batchSize, apps.length));
      await this.getAppIconsBatch(batch);
    }
    
    this.preloadComplete = true;
    const elapsed = Date.now() - startTime;
    console.log(`Icon preload complete in ${elapsed}ms. Cached ${this.iconCache.size} icons.`);
  }

  /**
   * キャッシュの状態を取得
   */
  getCacheStats(): { size: number, preloaded: boolean } {
    return {
      size: this.iconCache.size,
      preloaded: this.preloadComplete
    };
  }

  /**
   * キャッシュをクリア
   */
  clearCache(): void {
    this.iconCache.clear();
    this.preloadComplete = false;
  }
}