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

export interface ProcessInfo {
  pid: number
  name: string
  cpuUsage: number // このプロセスのCPU使用率（%）
  memoryUsage: number // メモリ使用量（MB）
  description?: string // プロセスの説明（AIが生成）
}

export interface WindowState {
  windows: WindowInfo[]
  displays: Display[]
  activeApp: string
  cpuInfo?: CpuInfo
  timestamp: number
}

export interface WindowAction {
  type: 'move' | 'resize' | 'minimize' | 'maximize' | 'focus' | 'arrange' | 'close'
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