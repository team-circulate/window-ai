let currentWindows = []
let iconCache = {} // アイコンのキャッシュ

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  refreshWindowList()
  refreshNotificationLogs()
  checkNotificationPermission()
  
  // Event listeners
  document.getElementById('analyzeBtn').addEventListener('click', analyzeAndExecute)
  document.getElementById('refreshBtn').addEventListener('click', refreshWindowList)
  document.getElementById('testNotificationBtn').addEventListener('click', sendTestNotification)
  
  // Quick action buttons
  document.querySelectorAll('.quick-action').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const intent = e.target.getAttribute('data-intent')
      document.getElementById('userIntent').value = intent
      analyzeAndExecute()
    })
  })
  
  // Enter key to submit
  document.getElementById('userIntent').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      analyzeAndExecute()
    }
  })
})

async function refreshWindowList() {
  try {
    addLog('ウィンドウ情報を取得中...', 'info')
    const windowState = await window.windowAPI.getWindowState()
    currentWindows = windowState.windows
    
    displayWindows(windowState.windows)
    addLog(`${windowState.windows.length}個のウィンドウを検出`, 'success')
  } catch (error) {
    addLog(`エラー: ${error.message}`, 'error')
  }
}

function displayWindows(windows) {
  const windowList = document.getElementById('windowList')
  
  if (windows.length === 0) {
    windowList.innerHTML = '<div class="window-item">ウィンドウが見つかりません</div>'
    return
  }
  
  windowList.innerHTML = windows.map(window => {
    const icon = window.appIcon
    const iconHtml = icon 
      ? `<img src="${icon}" class="app-icon" alt="${window.appName}" />`
      : '<div class="app-icon-placeholder"></div>'
    
    // ボタンの状態を決定
    let stateButtons = ''
    if (window.isMinimized) {
      // 最小化されている場合 - 復元のみ表示
      stateButtons = `<button class="mini-btn restore-btn" onclick="restoreWindow('${window.id}')">復元</button>`
    } else if (window.isMaximized) {
      // 最大化されている場合 - 元に戻すボタンのみ表示
      stateButtons = `<button class="mini-btn restore-btn" onclick="restoreWindow('${window.id}')">元に戻す</button>`
    } else {
      // 通常状態 - 最大化と最小化を表示
      stateButtons = `
        <button class="mini-btn" onclick="minimizeWindow('${window.id}')">最小化</button>
        <button class="mini-btn" onclick="maximizeWindow('${window.id}')">最大化</button>
      `
    }
    
    // 閉じるボタンとアプリ終了ボタン
    const closeButtons = `
      <button class="mini-btn close-btn" onclick="closeWindow('${window.id}')" title="ウィンドウを閉じる">✕</button>
      <button class="mini-btn quit-btn" onclick="quitApp('${window.appName}')" title="アプリを終了">終了</button>
    `
    
    return `
    <div class="window-item">
      <div class="window-info">
        ${iconHtml}
        <div>
          <strong>${window.appName}</strong>
          <br>
          <small>${window.title || 'Untitled'}</small>
          ${window.isMinimized ? '<span class="state-badge">最小化</span>' : ''}
          ${window.isMaximized ? '<span class="state-badge">最大化</span>' : ''}
        </div>
      </div>
      <div class="window-actions">
        ${stateButtons}
        <button class="mini-btn" onclick="focusWindow('${window.id}')">フォーカス</button>
        ${closeButtons}
      </div>
    </div>
  `}).join('')
}

async function analyzeAndExecute() {
  const userIntent = document.getElementById('userIntent').value.trim()
  
  if (!userIntent) {
    addLog('意図を入力してください', 'error')
    return
  }
  
  const analyzeBtn = document.getElementById('analyzeBtn')
  analyzeBtn.disabled = true
  analyzeBtn.textContent = '処理中...'
  
  try {
    addLog(`AI分析中: "${userIntent}"`, 'info')
    
    const actions = await window.windowAPI.analyzeWindows(userIntent)
    
    if (actions.length === 0) {
      addLog('実行可能なアクションがありません', 'error')
      return
    }
    
    addLog(`${actions.length}個のアクションを実行`, 'info')
    
    for (const action of actions) {
      addLog(`実行: ${action.type} - ${action.reasoning}`, 'info')
    }
    
    const results = await window.windowAPI.executeActions(actions)
    
    const successCount = results.filter(r => r).length
    if (successCount === results.length) {
      addLog('すべてのアクションが正常に完了しました', 'success')
    } else {
      addLog(`${successCount}/${results.length}個のアクションが完了`, 'error')
    }
    
    // Refresh window list after actions
    setTimeout(refreshWindowList, 500)
    
  } catch (error) {
    addLog(`エラー: ${error.message}`, 'error')
  } finally {
    analyzeBtn.disabled = false
    analyzeBtn.textContent = '分析・実行'
  }
}

async function minimizeWindow(windowId) {
  try {
    const action = {
      type: 'minimize',
      targetWindow: windowId,
      reasoning: 'User requested minimize'
    }
    
    const success = await window.windowAPI.executeAction(action)
    if (success) {
      addLog(`ウィンドウを最小化しました`, 'success')
      refreshWindowList()
    }
  } catch (error) {
    addLog(`最小化エラー: ${error.message}`, 'error')
  }
}

async function maximizeWindow(windowId) {
  try {
    const action = {
      type: 'maximize',
      targetWindow: windowId,
      reasoning: 'User requested maximize'
    }
    
    const success = await window.windowAPI.executeAction(action)
    if (success) {
      addLog(`ウィンドウを最大化しました`, 'success')
      setTimeout(refreshWindowList, 500)
    }
  } catch (error) {
    addLog(`最大化エラー: ${error.message}`, 'error')
  }
}

async function restoreWindow(windowId) {
  try {
    // 現在のウィンドウ状態を確認
    const windowState = await window.windowAPI.getWindowState()
    const window = windowState.windows.find(w => w.id === windowId)
    
    if (!window) {
      addLog(`ウィンドウが見つかりません`, 'error')
      return
    }
    
    // 最小化されている場合はフォーカスで復元
    if (window.isMinimized) {
      const action = {
        type: 'focus',
        targetWindow: windowId,
        reasoning: 'User requested restore from minimize'
      }
      
      const success = await window.windowAPI.executeAction(action)
      if (success) {
        addLog(`ウィンドウを復元しました`, 'success')
        setTimeout(refreshWindowList, 500)
      }
    } 
    // 最大化されている場合は元のサイズに戻す
    else if (window.isMaximized) {
      // サイズを調整して元に戻す
      const action = {
        type: 'resize',
        targetWindow: windowId,
        parameters: {
          size: { width: 1200, height: 800 },
          position: { x: 100, y: 100 }
        },
        reasoning: 'User requested restore from maximize'
      }
      
      const success = await window.windowAPI.executeAction(action)
      if (success) {
        addLog(`ウィンドウを元のサイズに戻しました`, 'success')
        setTimeout(refreshWindowList, 500)
      }
    }
  } catch (error) {
    addLog(`復元エラー: ${error.message}`, 'error')
  }
}

async function focusWindow(windowId) {
  try {
    const action = {
      type: 'focus',
      targetWindow: windowId,
      reasoning: 'User requested focus'
    }
    
    const success = await window.windowAPI.executeAction(action)
    if (success) {
      addLog(`ウィンドウにフォーカスしました`, 'success')
    }
  } catch (error) {
    addLog(`フォーカスエラー: ${error.message}`, 'error')
  }
}

async function closeWindow(windowId) {
  try {
    if (!confirm('このウィンドウを閉じますか？')) {
      return
    }
    
    const action = {
      type: 'close',
      targetWindow: windowId,
      reasoning: 'User requested to close window'
    }
    
    const success = await window.windowAPI.executeAction(action)
    if (success) {
      addLog(`ウィンドウを閉じました`, 'success')
      setTimeout(refreshWindowList, 500)
    }
  } catch (error) {
    addLog(`ウィンドウを閉じるエラー: ${error.message}`, 'error')
  }
}

async function quitApp(appName) {
  try {
    if (!confirm(`${appName} を終了しますか？`)) {
      return
    }
    
    const success = await window.windowAPI.quitApp(appName)
    if (success) {
      addLog(`${appName} を終了しました`, 'success')
      setTimeout(refreshWindowList, 1000)
    }
  } catch (error) {
    addLog(`アプリ終了エラー: ${error.message}`, 'error')
  }
}

function addLog(message, type = 'info') {
  const logContainer = document.getElementById('logContainer')
  const timestamp = new Date().toLocaleTimeString()
  
  const logEntry = document.createElement('div')
  logEntry.className = `log-entry ${type}`
  logEntry.textContent = `[${timestamp}] ${message}`
  
  logContainer.insertBefore(logEntry, logContainer.firstChild)
  
  // Keep only last 10 logs
  while (logContainer.children.length > 10) {
    logContainer.removeChild(logContainer.lastChild)
  }
}

// 通知関連の関数
async function refreshNotificationLogs() {
  try {
    const logs = await window.windowAPI.getNotificationLogs(20) // 最新20件
    displayNotificationLogs(logs)
  } catch (error) {
    console.error('Error refreshing notification logs:', error)
    addLog(`通知ログ取得エラー: ${error.message}`, 'error')
  }
}

function displayNotificationLogs(logs) {
  const container = document.getElementById('notificationLogContainer')
  
  if (logs.length === 0) {
    container.innerHTML = '<div class="log-entry info">通知ログがありません</div>'
    return
  }
  
  container.innerHTML = logs.map(log => {
    const notification = log.notification
    const analysis = log.aiAnalysis
    const timestamp = new Date(log.timestamp).toLocaleTimeString()
    
    // 重要度に基づくクラス
    const importanceClass = analysis ? analysis.importance : notification.importance || 'medium'
    
    // AI分析の表示
    const aiAnalysisHtml = analysis ? `
      <div class="ai-analysis">
        <div class="ai-analysis-label">🤖 AI分析</div>
        <div class="ai-analysis-content">
          カテゴリ: ${analysis.category} | 重要度: ${analysis.importance} | 信頼度: ${Math.round(analysis.confidence * 100)}%
          <br>理由: ${analysis.reasoning}
        </div>
      </div>
    ` : '<div class="ai-analysis"><div class="ai-analysis-label">🤖 AI分析中...</div></div>'
    
    return `
      <div class="notification-log-entry ${importanceClass}">
        <div class="notification-header">
          <span class="notification-title">${notification.title}</span>
          <span class="notification-category">${analysis ? analysis.category : notification.category || 'other'}</span>
        </div>
        <div class="notification-body">${notification.body}</div>
        <div class="notification-meta">
          <span>${notification.appName || 'Unknown App'}</span>
          <span>${timestamp}</span>
        </div>
        ${aiAnalysisHtml}
      </div>
    `
  }).join('')
}

async function sendTestNotification() {
  try {
    addLog('テスト通知を送信中...', 'info')
    const success = await window.windowAPI.sendTestNotification()
    
    if (success) {
      addLog('テスト通知を送信しました', 'success')
      // 通知ログを更新（少し遅延を入れてAI分析が完了するのを待つ）
      setTimeout(refreshNotificationLogs, 2000)
    } else {
      addLog('テスト通知の送信に失敗しました', 'error')
    }
  } catch (error) {
    addLog(`テスト通知エラー: ${error.message}`, 'error')
  }
}

// 通知権限をチェック
async function checkNotificationPermission() {
  try {
    const hasPermission = await window.windowAPI.checkNotificationPermission()
    if (!hasPermission) {
      addLog('通知権限がありません。システム設定 > 通知 > Window AI Manager で通知を許可してください。', 'error')
    } else {
      addLog('通知権限が確認されました', 'success')
    }
  } catch (error) {
    addLog(`通知権限チェックエラー: ${error.message}`, 'error')
  }
}