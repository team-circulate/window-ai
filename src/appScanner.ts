import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface InstalledApp {
  name: string;
  path: string;
  bundleId?: string;
  version?: string;
}

export class AppScanner {
  /**
   * インストールされているすべてのアプリケーションを取得
   */
  async getAllInstalledApps(): Promise<InstalledApp[]> {
    const apps: InstalledApp[] = [];

    try {
      // /Applications ディレクトリのアプリを取得
      const userApps = await this.scanDirectory("/Applications");
      apps.push(...userApps);

      // システムアプリケーションも取得
      const systemApps = await this.scanDirectory("/System/Applications");
      apps.push(...systemApps);

      // ユーザーのホームディレクトリのApplicationsフォルダも確認
      const homeAppsPath = path.join(process.env.HOME || "", "Applications");
      if (fs.existsSync(homeAppsPath)) {
        const homeApps = await this.scanDirectory(homeAppsPath);
        apps.push(...homeApps);
      }

      // 重複を削除（同じ名前のアプリ）
      const uniqueApps = apps.filter(
        (app, index, self) =>
          index === self.findIndex((a) => a.name === app.name)
      );

      // アプリ名でソート
      uniqueApps.sort((a, b) => a.name.localeCompare(b.name));

      return uniqueApps;
    } catch (error) {
      console.error("Error scanning for installed apps:", error);
      return [];
    }
  }

  /**
   * 指定ディレクトリ内のアプリケーションをスキャン
   */
  private async scanDirectory(directory: string): Promise<InstalledApp[]> {
    const apps: InstalledApp[] = [];

    if (!fs.existsSync(directory)) {
      return apps;
    }

    try {
      const items = fs.readdirSync(directory);

      for (const item of items) {
        if (item.endsWith(".app")) {
          const appPath = path.join(directory, item);
          const appName = item.replace(".app", "");

          // Info.plistから詳細情報を取得
          const appInfo = await this.getAppInfo(appPath);

          apps.push({
            name: appName,
            path: appPath,
            bundleId: appInfo.bundleId,
            version: appInfo.version,
          });
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${directory}:`, error);
    }

    return apps;
  }

  /**
   * Info.plistからアプリ情報を取得
   */
  private async getAppInfo(
    appPath: string
  ): Promise<{ bundleId?: string; version?: string }> {
    const plistPath = path.join(appPath, "Contents", "Info.plist");

    if (!fs.existsSync(plistPath)) {
      return {};
    }

    try {
      // plutil を使ってInfo.plistを読み取る
      const { stdout: bundleIdOutput } = await execAsync(
        `plutil -extract CFBundleIdentifier raw "${plistPath}" 2>/dev/null`
      ).catch(() => ({ stdout: "" }));

      const { stdout: versionOutput } = await execAsync(
        `plutil -extract CFBundleShortVersionString raw "${plistPath}" 2>/dev/null`
      ).catch(() => ({ stdout: "" }));

      return {
        bundleId: bundleIdOutput.trim() || undefined,
        version: versionOutput.trim() || undefined,
      };
    } catch (error) {
      return {};
    }
  }

  /**
   * 特定のアプリが存在するか確認
   */
  async isAppInstalled(appName: string): Promise<boolean> {
    const apps = await this.getAllInstalledApps();
    return apps.some((app) => app.name.toLowerCase() === appName.toLowerCase());
  }

  /**
   * アプリ名で検索
   */
  async searchApps(query: string): Promise<InstalledApp[]> {
    const apps = await this.getAllInstalledApps();
    const lowerQuery = query.toLowerCase();

    return apps.filter(
      (app) =>
        app.name.toLowerCase().includes(lowerQuery) ||
        app.bundleId?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * アプリケーションを起動
   */
  async launchApp(appName: string): Promise<boolean> {
    try {
      // まずインストール済みアプリから探す
      const apps = await this.getAllInstalledApps();
      const app = apps.find(
        (a) => a.name.toLowerCase() === appName.toLowerCase()
      );

      if (app && app.path) {
        // macOSのopenコマンドでアプリを起動
        const { stdout, stderr } = await execAsync(`open "${app.path}"`);
        if (stderr) {
          console.error(`Error launching ${appName}:`, stderr);
          return false;
        }
        return true;
      }

      // 見つからない場合は直接起動を試みる
      const { stdout, stderr } = await execAsync(`open -a "${appName}"`);
      if (stderr) {
        console.error(`Error launching ${appName}:`, stderr);
        return false;
      }
      return true;
    } catch (error) {
      console.error(`Failed to launch ${appName}:`, error);
      return false;
    }
  }

  /**
   * アプリケーションをパスから起動
   */
  async launchAppByPath(appPath: string): Promise<boolean> {
    try {
      const { stdout, stderr } = await execAsync(`open "${appPath}"`);
      if (stderr) {
        console.error(`Error launching app at ${appPath}:`, stderr);
        return false;
      }
      return true;
    } catch (error) {
      console.error(`Failed to launch app at ${appPath}:`, error);
      return false;
    }
  }
}
