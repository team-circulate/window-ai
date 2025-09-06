import * as fs from 'fs';
import * as path from 'path';
import { app, Notification, BrowserWindow } from 'electron';
import { IntegratedAnalysisResult } from './analysisService';

export interface AnalysisNotification {
  id: string;
  timestamp: number;
  title: string;
  message: string;
  systemHealthScore: number;
  appsToClose: Array<{
    appName: string;
    reasons: string[];
    priority: 'urgent' | 'high' | 'medium' | 'low';
    expectedBenefit: string;
    safeToClose: boolean;
  }>;
  overallAssessment: string;
  read: boolean;
}

export interface NotificationSettings {
  analysisInterval: number; // milliseconds
  enableNotifications: boolean;
  enableSystemNotifications: boolean;
}

export class NotificationSystem {
  private dataDir: string;
  private notificationsFile: string;
  private settingsFile: string;
  private mainWindow: BrowserWindow | null = null;

  constructor(mainWindow?: BrowserWindow) {
    this.dataDir = path.join(app.getPath('userData'), 'notifications');
    this.notificationsFile = path.join(this.dataDir, 'analysis-notifications.json');
    this.settingsFile = path.join(this.dataDir, 'notification-settings.json');
    this.mainWindow = mainWindow || null;
    
    this.ensureDataDirectory();
  }

  private ensureDataDirectory(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
      console.log('📁 Notifications data directory created:', this.dataDir);
    }
  }

  /**
   * AI分析結果から通知を作成・送信
   */
  async sendAnalysisNotification(analysisResult: IntegratedAnalysisResult): Promise<void> {
    const notification = await this.createNotification(analysisResult);
    
    // 通知履歴に保存
    await this.saveNotification(notification);
    
    // システム通知を送信
    await this.showSystemNotification(notification);
    
    // フロントエンドに通知
    if (this.mainWindow) {
      this.mainWindow.webContents.send('new-analysis-notification', notification);
    }

    console.log(`📢 Analysis notification sent: ${notification.title}`);
  }

  /**
   * AI分析結果から通知オブジェクトを作成
   */
  private async createNotification(analysisResult: IntegratedAnalysisResult): Promise<AnalysisNotification> {
    const now = Date.now();
    const appsCount = analysisResult.appsToClose.length;
    
    let title = '';
    let message = '';

    if (appsCount === 0) {
      title = `✅ システム健康度: ${analysisResult.systemHealthScore}/100`;
      message = '現在、閉じるべきアプリは見つかりませんでした。システムは順調に動作しています。';
    } else {
      const urgentApps = analysisResult.appsToClose.filter(app => app.priority === 'urgent').length;
      const highApps = analysisResult.appsToClose.filter(app => app.priority === 'high').length;
      
      if (urgentApps > 0) {
        title = `🚨 緊急: ${appsCount}個のアプリを閉じることをお勧めします`;
        message = `システム健康度が${analysisResult.systemHealthScore}/100まで低下しています。`;
      } else if (highApps > 0) {
        title = `⚠️ 重要: ${appsCount}個のアプリを閉じることをお勧めします`;  
        message = `パフォーマンス向上のため、いくつかのアプリを閉じることをお勧めします。`;
      } else {
        title = `💡 提案: ${appsCount}個のアプリを最適化できます`;
        message = `システムをさらに快適にするための提案があります。`;
      }
    }

    return {
      id: `analysis_${now}`,
      timestamp: now,
      title,
      message,
      systemHealthScore: analysisResult.systemHealthScore,
      appsToClose: analysisResult.appsToClose,
      overallAssessment: analysisResult.overallAssessment,
      read: false
    };
  }

  /**
   * システム通知を表示
   */
  private async showSystemNotification(notification: AnalysisNotification): Promise<void> {
    const settings = await this.getSettings();
    
    if (!settings.enableSystemNotifications) {
      return;
    }

    try {
      const systemNotification = new Notification({
        title: notification.title,
        body: notification.message,
        icon: path.join(__dirname, '../assets/icon.png'), // アイコンがあれば
        urgency: notification.appsToClose.some(app => app.priority === 'urgent') ? 'critical' : 'normal'
      });

      systemNotification.on('click', () => {
        // 通知をクリックしたらアプリを表示
        if (this.mainWindow) {
          this.mainWindow.show();
          this.mainWindow.focus();
        }
      });

      systemNotification.show();
    } catch (error) {
      console.error('System notification error:', error);
    }
  }

  /**
   * 通知を履歴に保存
   */
  private async saveNotification(notification: AnalysisNotification): Promise<void> {
    try {
      const notifications = await this.loadNotifications();
      notifications.unshift(notification); // 新しい通知を先頭に追加
      
      // 30日以前の通知を削除
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const filteredNotifications = notifications.filter(n => n.timestamp > thirtyDaysAgo);
      
      await fs.promises.writeFile(
        this.notificationsFile,
        JSON.stringify(filteredNotifications, null, 2)
      );
      
      console.log(`💾 Notification saved: ${notification.id}`);
    } catch (error) {
      console.error('Error saving notification:', error);
    }
  }

  /**
   * 通知履歴を読み込み
   */
  async loadNotifications(): Promise<AnalysisNotification[]> {
    try {
      if (!fs.existsSync(this.notificationsFile)) {
        return [];
      }
      
      const data = await fs.promises.readFile(this.notificationsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading notifications:', error);
      return [];
    }
  }

  /**
   * 通知を既読にする
   */
  async markAsRead(notificationId: string): Promise<void> {
    try {
      const notifications = await this.loadNotifications();
      const notification = notifications.find(n => n.id === notificationId);
      
      if (notification) {
        notification.read = true;
        await fs.promises.writeFile(
          this.notificationsFile,
          JSON.stringify(notifications, null, 2)
        );
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  /**
   * 設定を取得
   */
  async getSettings(): Promise<NotificationSettings> {
    try {
      if (!fs.existsSync(this.settingsFile)) {
        // デフォルト設定
        const defaultSettings: NotificationSettings = {
          analysisInterval: 5 * 60 * 1000, // 5分
          enableNotifications: true,
          enableSystemNotifications: true
        };
        await this.saveSettings(defaultSettings);
        return defaultSettings;
      }
      
      const data = await fs.promises.readFile(this.settingsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading notification settings:', error);
      return {
        analysisInterval: 5 * 60 * 1000,
        enableNotifications: true,
        enableSystemNotifications: true
      };
    }
  }

  /**
   * 設定を保存
   */
  async saveSettings(settings: NotificationSettings): Promise<void> {
    try {
      await fs.promises.writeFile(
        this.settingsFile,
        JSON.stringify(settings, null, 2)
      );
      console.log('⚙️ Notification settings saved');
    } catch (error) {
      console.error('Error saving notification settings:', error);
    }
  }

  /**
   * 通知統計を取得
   */
  async getNotificationStats(): Promise<{
    totalNotifications: number;
    unreadCount: number;
    lastNotification: Date | null;
    avgSystemHealth: number;
  }> {
    const notifications = await this.loadNotifications();
    
    const unreadCount = notifications.filter(n => !n.read).length;
    const lastNotification = notifications.length > 0 ? new Date(notifications[0].timestamp) : null;
    const avgSystemHealth = notifications.length > 0 
      ? Math.round(notifications.reduce((sum, n) => sum + n.systemHealthScore, 0) / notifications.length)
      : 100;

    return {
      totalNotifications: notifications.length,
      unreadCount,
      lastNotification,
      avgSystemHealth
    };
  }
}