export interface WindowInfo {
  id: string
  appName: string
  appIcon?: string  // Base64エンコードされたアイコンデータ
  title: string
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
  isMinimized: boolean
  isFocused: boolean
  isVisible: boolean
  isMaximized?: boolean
  cpuUsage?: number // このアプリのCPU使用率
  memoryUsage?: number // このアプリのメモリ使用量（MB）
}

export interface Display {
  id: string
  isPrimary: boolean
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
}

export interface CpuInfo {
  model: string
  cores: number
  usage: number // 全体のCPU使用率（%）
  processes: ProcessInfo[] // 上位プロセスの使用率
}

export type MemoryPressureLevel = 'normal' | 'warning' | 'critical'

export interface MemoryInfo {
  totalMB: number
  usedMB: number
  freeMB: number
  usedPercent: number // 0-100
  pressure: MemoryPressureLevel
  swapUsedMB?: number
  source: 'memory_pressure' | 'vm_stat' | 'node'
  timestamp: number
}

export interface ProcessInfo {
  pid: number
  name: string
  cpuUsage: number // このプロセスのCPU使用率（%）
  memoryUsage: number // メモリ使用量（MB）
  description?: string // プロセスの説明（AIが生成）
}

export interface AppResourceUsage {
  totalCpu: number
  totalMemory: number
  processCount: number
}

export interface WindowState {
  windows: WindowInfo[]
  displays: Display[]
  activeApp: string
  cpuInfo?: CpuInfo
  // 将来的に利用するための拡張（現状は未使用）
  // memoryInfo?: MemoryInfo
  timestamp: number
}

export interface WindowAction {
  type: 'move' | 'resize' | 'minimize' | 'maximize' | 'restore' | 'focus' | 'arrange' | 'close'
  targetWindow?: string
  targetWindows?: string[]
  parameters?: {
    position?: { x: number; y: number }
    size?: { width: number; height: number }
    arrangement?: 'tile-left' | 'tile-right' | 'tile-grid' | 'cascade' | 'center'
    display?: string
  }
  reasoning: string
}

export interface AIRequest {
  currentState: WindowState
  userIntent: string
  context?: {
    recentActions: WindowAction[]
    userPreferences?: Record<string, any>
  }
}

export interface AIResponse {
  actions: WindowAction[]
  explanation: string
  confidence: number
}

// フォーカスログ関連の型定義
export interface FocusSession {
  appName: string;            // "Safari", "Chrome" (正式名称)
  startTime: number;          // 開始時間 (UNIX timestamp)
  endTime: number;            // 終了時間 (UNIX timestamp)
  duration: number;           // 実際のフォーカス時間(秒)
  date: string;              // "2025-01-01" 日付別分析用
}

export interface AppStats {
  appName: string;
  totalSessions: number;      // 総セッション数
  totalFocusTime: number;     // 総フォーカス時間(秒)
  averageSessionTime: number; // 平均セッション時間
  lastUsed: number;          // 最後の使用時間
  openWindows: number;       // 現在開いているウィンドウ数
  cpuUsage: number;          // CPU使用率
  memoryUsage: number;       // メモリ使用量
}

export interface TimingConfig {
  focusMonitoring: number;    // フォーカス監視間隔
  dataSaving: number;         // データ保存間隔
  analysis: number;           // AI分析間隔
  testMode: boolean;          // テストモード
}