import { Notification, systemPreferences, app } from "electron";
import { ClaudeService } from "./claudeService";

let getDoNotDisturb: any;
let getNotificationState: any;
try {
  const macosNotificationState = require('macos-notification-state');
  getDoNotDisturb = macosNotificationState.getDoNotDisturb;
  getNotificationState = macosNotificationState.getNotificationState;
} catch (error) {
  console.warn('macos-notification-state not available:', error);
}

export interface NotificationData {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  category?: string;
  importance?: 'low' | 'medium' | 'high' | 'critical';
  appName?: string;
  icon?: string;
}

export interface NotificationLog {
  id: string;
  notification: NotificationData;
  aiAnalysis?: {
    category: string;
    importance: 'low' | 'medium' | 'high' | 'critical';
    confidence: number;
    reasoning: string;
  };
  timestamp: number;
}

export class NotificationService {
  private claudeService: ClaudeService;
  private notificationLogs: NotificationLog[] = [];
  private maxLogs: number = 100;

  constructor(claudeService: ClaudeService) {
    this.claudeService = claudeService;
  }

  /**
   * macOSで通知権限をチェックし、必要に応じて要求する
   */
  async checkNotificationPermission(): Promise<boolean> {
    if (process.platform !== 'darwin') {
      return true; // macOS以外では常に許可
    }

    try {
      // Electronの基本的な通知サポートチェック
      if (!Notification.isSupported()) {
        console.warn('Notifications are not supported on this system');
        return false;
      }

      // macos-notification-stateを使用して詳細な通知状態をチェック
      if (getNotificationState && getDoNotDisturb) {
        const appName = app.getName() || 'Electron';
        console.log('🔍 Checking notification state for app:', appName);
        
        try {
          const notificationState = getNotificationState(appName);
          const doNotDisturb = getDoNotDisturb();
          
          console.log('📋 Notification state:', notificationState);
          console.log('🌙 Do Not Disturb:', doNotDisturb);
          
          if (doNotDisturb) {
            console.warn('⚠️  Do Not Disturb is enabled - notifications may not appear');
          }
          
          // 通知状態の確認
          switch (notificationState) {
            case 'alerts':
            case 'banners':
              console.log('✅ Notifications are allowed');
              return true;
            case 'none':
              console.log('❌ Notifications are disabled');
              return false;
            case 'unknown':
            default:
              console.log('❓ Notification state is unknown, trying to request permission');
              break;
          }
        } catch (stateError) {
          console.warn('Error checking notification state:', stateError);
        }
      }

      // フォールバック: テスト通知を送信して権限状態を確認
      console.log('📱 Sending test notification to verify permissions...');
      const testNotification = new Notification({
        title: 'Permission Test',
        body: 'Testing notification permissions',
        silent: true
      });

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.log('Notification permission timeout - assuming granted');
          resolve(true);
        }, 2000);

        testNotification.on('show', () => {
          console.log('✅ Test notification shown - permissions confirmed');
          clearTimeout(timeout);
          testNotification.close();
          resolve(true);
        });

        testNotification.on('failed', (error) => {
          console.error('❌ Test notification failed:', error);
          clearTimeout(timeout);
          resolve(false);
        });

        testNotification.show();
      });
    } catch (error) {
      console.error('Error checking notification permission:', error);
      return false;
    }
  }

  /**
   * 通知を送信する
   */
  async sendNotification(data: NotificationData): Promise<boolean> {
    try {
      // まず通知権限をチェック
      const hasPermission = await this.checkNotificationPermission();
      if (!hasPermission) {
        console.error('Notification permission denied');
        return false;
      }

      console.log('Creating notification with data:', {
        title: data.title,
        body: data.body,
        importance: data.importance
      });

      // 通知を作成 (macOSでは最小限のオプションのみ)
      const notificationOptions: any = {
        title: data.title,
        body: data.body,
      };

      // macOS以外では追加オプションを使用
      if (process.platform !== 'darwin') {
        notificationOptions.icon = data.icon;
        notificationOptions.silent = data.importance === 'low';
      }

      console.log('Creating notification with options:', notificationOptions);
      const notification = new Notification(notificationOptions);

      console.log('Notification created for platform:', process.platform);

      // イベントリスナーを追加してデバッグ
      notification.on('show', () => {
        console.log('✅ Notification shown successfully:', data.title);
      });

      notification.on('click', () => {
        console.log('👆 Notification clicked:', data.title);
      });

      notification.on('close', () => {
        console.log('❌ Notification closed:', data.title);
      });

      notification.on('failed', (error) => {
        console.error('❗ Notification failed:', error);
      });

      // macOSの通知設定を確認
      if (process.platform === 'darwin') {
        console.log('🔍 Checking macOS notification settings...');
        
        // システム通知設定をチェック
        try {
          const { exec } = require('child_process');
          exec('defaults read com.apple.ncprefs.plist', (error: any) => {
            if (!error) {
              console.log('📋 macOS notification settings checked');
            }
          });
        } catch (error) {
          console.log('Cannot check notification settings:', error);
        }
      }

      // 通知を表示
      console.log('📱 Showing notification...');
      notification.show();

      // macOSでは少し待ってから成功を判定
      if (process.platform === 'darwin') {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 通知ログに追加
      await this.addToLog(data);

      console.log('✅ Notification sent successfully:', data.title);
      return true;
    } catch (error) {
      console.error('❗ Error sending notification:', error);
      return false;
    }
  }

  /**
   * AIによる通知分析を実行
   */
  async analyzeNotification(notification: NotificationData): Promise<NotificationLog['aiAnalysis']> {
    try {
      // ClaudeServiceの新しい通知分析メソッドを使用
      const analysis = await this.claudeService.analyzeNotification({
        title: notification.title,
        body: notification.body,
        appName: notification.appName,
        timestamp: notification.timestamp
      });

      return analysis;
    } catch (error) {
      console.error('Error analyzing notification:', error);
      return {
        category: 'other',
        importance: 'medium',
        confidence: 0.0,
        reasoning: '分析に失敗しました'
      };
    }
  }

  /**
   * 通知ログに追加
   */
  private async addToLog(notification: NotificationData): Promise<void> {
    const logEntry: NotificationLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      notification,
      timestamp: Date.now(),
    };

    // AI分析を非同期で実行
    this.analyzeNotification(notification).then(analysis => {
      logEntry.aiAnalysis = analysis;
    }).catch(error => {
      console.error('Failed to analyze notification:', error);
    });

    this.notificationLogs.unshift(logEntry);

    // ログ数を制限
    if (this.notificationLogs.length > this.maxLogs) {
      this.notificationLogs = this.notificationLogs.slice(0, this.maxLogs);
    }
  }

  /**
   * 通知ログを取得
   */
  getNotificationLogs(limit?: number): NotificationLog[] {
    const logs = limit ? this.notificationLogs.slice(0, limit) : this.notificationLogs;
    return logs;
  }

  /**
   * 重要度をElectronの緊急度にマッピング
   */
  private mapImportanceToUrgency(importance: string): 'critical' | 'normal' | 'low' {
    switch (importance) {
      case 'critical':
        return 'critical';
      case 'high':
        return 'critical';
      case 'medium':
        return 'normal';
      case 'low':
        return 'low';
      default:
        return 'normal';
    }
  }


  /**
   * テスト通知を送信
   */
  async sendTestNotification(): Promise<boolean> {
    const testNotification: NotificationData = {
      id: `test_${Date.now()}`,
      title: 'Window AI Manager',
      body: '通知機能のテストです。AIによる分析が実行されます。',
      timestamp: Date.now(),
      importance: 'medium',
      appName: 'Window AI Manager'
    };

    console.log('Sending test notification...');
    const result = await this.sendNotification(testNotification);
    
    if (result) {
      console.log('Test notification sent successfully');
    } else {
      console.log('Test notification failed to send');
    }
    
    return result;
  }
}
