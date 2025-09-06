import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { FocusSession, AppStats } from "./types";

export class DataStore {
  private dataDir: string;
  private focusLogFile: string;
  private statsFile: string;

  constructor() {
    // アプリのユーザーデータディレクトリを取得
    this.dataDir = path.join(app.getPath("userData"), "focus-data");
    this.focusLogFile = path.join(this.dataDir, "focus-sessions.json");
    this.statsFile = path.join(this.dataDir, "app-stats.json");

    // ディレクトリを作成（存在しない場合）
    this.ensureDataDirectory();
  }

  private ensureDataDirectory(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * フォーカスセッションを保存
   */
  async saveFocusSession(session: FocusSession): Promise<void> {
    try {
      const sessions = await this.loadFocusSessions();
      sessions.push(session);

      // 古いデータをクリーンアップ（30日以上前のデータを削除）
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const filteredSessions = sessions.filter(
        (s) => s.startTime > thirtyDaysAgo
      );

      await fs.promises.writeFile(
        this.focusLogFile,
        JSON.stringify(filteredSessions, null, 2)
      );
    } catch (error) {
      console.error("Error saving focus session:", error);
    }
  }

  /**
   * フォーカスセッションを読み込み
   */
  async loadFocusSessions(): Promise<FocusSession[]> {
    try {
      if (!fs.existsSync(this.focusLogFile)) {
        return [];
      }

      const data = await fs.promises.readFile(this.focusLogFile, "utf8");
      return JSON.parse(data);
    } catch (error) {
      console.error("Error loading focus sessions:", error);
      return [];
    }
  }

  /**
   * アプリ統計を保存
   */
  async saveAppStats(stats: AppStats[]): Promise<void> {
    try {
      await fs.promises.writeFile(
        this.statsFile,
        JSON.stringify(stats, null, 2)
      );
    } catch (error) {
      console.error("Error saving app stats:", error);
    }
  }

  /**
   * アプリ統計を読み込み
   */
  async loadAppStats(): Promise<AppStats[]> {
    try {
      if (!fs.existsSync(this.statsFile)) {
        return [];
      }

      const data = await fs.promises.readFile(this.statsFile, "utf8");
      return JSON.parse(data);
    } catch (error) {
      console.error("Error loading app stats:", error);
      return [];
    }
  }

  /**
   * 特定期間のフォーカスセッションを取得
   */
  async getFocusSessionsByDate(
    startDate: string,
    endDate?: string
  ): Promise<FocusSession[]> {
    const sessions = await this.loadFocusSessions();

    return sessions.filter((session) => {
      if (endDate) {
        return session.date >= startDate && session.date <= endDate;
      } else {
        return session.date === startDate;
      }
    });
  }

  /**
   * アプリ別の統計を取得
   */
  async getAppStatsByName(appName: string): Promise<AppStats | null> {
    const stats = await this.loadAppStats();
    return stats.find((stat) => stat.appName === appName) || null;
  }

  /**
   * データストアの状態を取得
   */
  async getDataStoreInfo(): Promise<{
    totalSessions: number;
    totalApps: number;
    dataSize: string;
    lastUpdated: Date;
  }> {
    const sessions = await this.loadFocusSessions();
    const stats = await this.loadAppStats();

    // ファイルサイズを計算
    let totalSize = 0;
    try {
      const focusLogStats = fs.existsSync(this.focusLogFile)
        ? await fs.promises.stat(this.focusLogFile)
        : { size: 0 };
      const statsFileStats = fs.existsSync(this.statsFile)
        ? await fs.promises.stat(this.statsFile)
        : { size: 0 };
      totalSize = focusLogStats.size + statsFileStats.size;
    } catch (error) {
      console.error("Error calculating data size:", error);
    }

    return {
      totalSessions: sessions.length,
      totalApps: stats.length,
      dataSize: `${Math.round(totalSize / 1024)}KB`,
      lastUpdated: new Date(),
    };
  }
}
