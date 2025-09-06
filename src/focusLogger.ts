import { DataStore } from "./dataStore";
import { FocusSession, AppStats, TimingConfig } from "./types";

export class FocusLogger {
  private dataStore: DataStore;
  private currentSession: {
    appName: string;
    startTime: number;
  } | null = null;

  private config: TimingConfig = {
    focusMonitoring: 1000, // 1秒間隔 (既に実装済み)
    dataSaving: 60000, // 1分間隔でデータ保存 (本番)
    analysis: 300000, // 5分間隔でAI分析 (本番)
    testMode: true, // テストモード (30秒間隔)
  };

  private dataSavingInterval?: NodeJS.Timeout;

  constructor() {
    this.dataStore = new DataStore();
    this.startDataSaving();
  }

  /**
   * フォーカスアプリ変更時の処理
   */
  async onFocusChange(newAppName: string): Promise<void> {
    const now = Date.now();

    // 前のセッションを終了
    if (this.currentSession && this.currentSession.appName !== newAppName) {
      await this.endCurrentSession(now);
    }

    // 新しいセッションを開始 (同じアプリでない場合のみ)
    if (!this.currentSession || this.currentSession.appName !== newAppName) {
      this.startNewSession(newAppName, now);
    }
  }

  /**
   * 新しいフォーカスセッションを開始
   */
  private startNewSession(appName: string, startTime: number): void {
    this.currentSession = {
      appName,
      startTime,
    };
  }

  /**
   * 現在のセッションを終了してデータベースに保存
   */
  private async endCurrentSession(endTime: number): Promise<void> {
    if (!this.currentSession) return;

    const duration = Math.round(
      (endTime - this.currentSession.startTime) / 1000
    ); // 秒単位

    // 短すぎるセッション（5秒未満）は無視
    if (duration < 5) {
      this.currentSession = null;
      return;
    }

    const session: FocusSession = {
      appName: this.currentSession.appName,
      startTime: this.currentSession.startTime,
      endTime,
      duration,
      date: this.getDateString(this.currentSession.startTime),
    };

    // データベースに保存
    await this.dataStore.saveFocusSession(session);

    this.currentSession = null;
  }

  /**
   * 定期的なデータ保存処理を開始
   */
  private startDataSaving(): void {
    const interval = this.config.testMode ? 30000 : this.config.dataSaving; // テスト: 30秒, 本番: 1分

    this.dataSavingInterval = setInterval(async () => {
      await this.updateAppStats();
    }, interval);
  }

  /**
   * アプリ統計を更新
   */
  private async updateAppStats(): Promise<void> {
    try {
      const sessions = await this.dataStore.loadFocusSessions();
      const appStatsMap = new Map<string, AppStats>();

      // 各セッションから統計を計算
      sessions.forEach((session) => {
        const appName = session.appName;

        if (!appStatsMap.has(appName)) {
          appStatsMap.set(appName, {
            appName,
            totalSessions: 0,
            totalFocusTime: 0,
            averageSessionTime: 0,
            lastUsed: 0,
            openWindows: 0,
            cpuUsage: 0,
            memoryUsage: 0,
          });
        }

        const stats = appStatsMap.get(appName)!;
        stats.totalSessions++;
        stats.totalFocusTime += session.duration;
        stats.lastUsed = Math.max(stats.lastUsed, session.endTime);
      });

      // 平均セッション時間を計算
      appStatsMap.forEach((stats) => {
        stats.averageSessionTime =
          stats.totalSessions > 0
            ? Math.round(stats.totalFocusTime / stats.totalSessions)
            : 0;
      });

      const appStats = Array.from(appStatsMap.values());
      await this.dataStore.saveAppStats(appStats);
    } catch (error) {
      console.error("Error updating app stats:", error);
    }
  }

  /**
   * 日付文字列を取得 (YYYY-MM-DD形式)
   */
  private getDateString(timestamp: number): string {
    return new Date(timestamp).toISOString().split("T")[0];
  }

  /**
   * 今日の統計を取得
   */
  async getTodayStats(): Promise<AppStats[]> {
    const today = this.getDateString(Date.now());
    const sessions = await this.dataStore.getFocusSessionsByDate(today);

    const statsMap = new Map<string, AppStats>();

    sessions.forEach((session) => {
      if (!statsMap.has(session.appName)) {
        statsMap.set(session.appName, {
          appName: session.appName,
          totalSessions: 0,
          totalFocusTime: 0,
          averageSessionTime: 0,
          lastUsed: 0,
          openWindows: 0,
          cpuUsage: 0,
          memoryUsage: 0,
        });
      }

      const stats = statsMap.get(session.appName)!;
      stats.totalSessions++;
      stats.totalFocusTime += session.duration;
      stats.lastUsed = Math.max(stats.lastUsed, session.endTime);
    });

    return Array.from(statsMap.values()).sort(
      (a, b) => b.totalFocusTime - a.totalFocusTime
    );
  }

  /**
   * 全期間の統計を取得
   */
  async getAllStats(): Promise<AppStats[]> {
    const sessions = await this.dataStore.loadFocusSessions();
    const statsMap = new Map<string, AppStats>();

    sessions.forEach((session) => {
      if (!statsMap.has(session.appName)) {
        statsMap.set(session.appName, {
          appName: session.appName,
          totalSessions: 0,
          totalFocusTime: 0,
          averageSessionTime: 0,
          lastUsed: 0,
          openWindows: 0,
          cpuUsage: 0,
          memoryUsage: 0,
        });
      }

      const stats = statsMap.get(session.appName)!;
      stats.totalSessions++;
      stats.totalFocusTime += session.duration;
      stats.lastUsed = Math.max(stats.lastUsed, session.endTime);
    });

    // 平均セッション時間を計算
    statsMap.forEach((stats) => {
      stats.averageSessionTime =
        stats.totalSessions > 0
          ? Math.round(stats.totalFocusTime / stats.totalSessions)
          : 0;
    });

    return Array.from(statsMap.values()).sort(
      (a, b) => b.totalFocusTime - a.totalFocusTime
    );
  }

  /**
   * データストア情報を取得
   */
  async getDataInfo(): Promise<any> {
    return await this.dataStore.getDataStoreInfo();
  }

  /**
   * 設定を更新
   */
  updateConfig(newConfig: Partial<TimingConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // データ保存間隔を更新
    if (this.dataSavingInterval) {
      clearInterval(this.dataSavingInterval);
      this.startDataSaving();
    }
  }

  /**
   * リソースをクリーンアップ
   */
  destroy(): void {
    if (this.dataSavingInterval) {
      clearInterval(this.dataSavingInterval);
    }

    // 現在のセッションを保存
    if (this.currentSession) {
      this.endCurrentSession(Date.now());
    }
  }
}
