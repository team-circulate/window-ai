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

export interface WindowState {
  windows: WindowInfo[]
  displays: Display[]
  activeApp: string
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