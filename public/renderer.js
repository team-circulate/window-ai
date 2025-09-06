let currentWindows = [];
let iconCache = {}; // アイコンのキャッシュ

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  refreshWindowList();
  refreshCpuInfo();

  // リアルタイムアクティブアプリ更新のリスナー
  if (window.windowAPI.onActiveAppChanged) {
    window.windowAPI.onActiveAppChanged((appName) => {
      console.log('Real-time active app update:', appName);
      displayActiveApp(appName);
    });
  }

  // Event listeners
  document
    .getElementById("analyzeBtn")
    .addEventListener("click", analyzeAndExecute);
  document
    .getElementById("refreshBtn")
    .addEventListener("click", refreshWindowList);
  document
    .getElementById("cpuRefreshBtn")
    .addEventListener("click", refreshCpuInfo);

  // Auto-refresh CPU info every 5 seconds
  setInterval(() => {
    refreshCpuInfo();
  }, 5000);

  // 統計画面の初期化
  initializeStatistics();
  
  // 通知システムの初期化
  initializeNotifications();
  
  // 統計更新ボタンのイベントリスナー
  document.getElementById('statsRefreshBtn').addEventListener('click', loadFocusStatistics);

  // Quick action buttons
  document.querySelectorAll(".quick-action").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const intent = e.target.getAttribute("data-intent");
      document.getElementById("userIntent").value = intent;
      analyzeAndExecute();
    });
  });

  // Enter key to submit
  document.getElementById("userIntent").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      analyzeAndExecute();
    }
  });
});

async function refreshWindowList() {
  try {
    addLog("ウィンドウ情報を取得中...", "info");
    const windowState = await window.windowAPI.getWindowState();
    currentWindows = windowState.windows;

    displayWindows(windowState.windows);

    // CPU情報も一緒に表示
    if (windowState.cpuInfo) {
      displayCpuInfo(windowState.cpuInfo);
    }

    // アクティブアプリ情報を表示
    if (windowState.activeApp) {
      displayActiveApp(windowState.activeApp);
    }

    addLog(`${windowState.windows.length}個のウィンドウを検出`, "success");
  } catch (error) {
    addLog(`エラー: ${error.message}`, "error");
  }
}

async function refreshCpuInfo() {
  try {
    addLog("CPU情報を取得中...", "info");
    const cpuInfo = await window.windowAPI.getCpuInfo();
    displayCpuInfo(cpuInfo);
    addLog("CPU情報を更新しました", "success");
  } catch (error) {
    addLog(`CPU情報取得エラー: ${error.message}`, "error");
  }
}

function displayWindows(windows) {
  const windowList = document.getElementById("windowList");

  if (windows.length === 0) {
    windowList.innerHTML =
      '<div class="window-item">ウィンドウが見つかりません</div>';
    return;
  }

  windowList.innerHTML = windows
    .map((window) => {
      const icon = window.appIcon;
      const iconHtml = icon
        ? `<img src="${icon}" class="app-icon" alt="${window.appName}" />`
        : '<div class="app-icon-placeholder"><span class="material-icons">web_asset</span></div>';

      // ウィンドウコントロールボタン
      let windowControlButtons = "";

      if (window.isMinimized) {
        windowControlButtons = `
        <button class="window-ctrl-btn close" onclick="closeWindow('${window.id}')" title="閉じる"><span class="material-icons">close</span></button>
        <button class="window-ctrl-btn minimize" onclick="restoreWindow('${window.id}')" title="復元"><span class="material-icons">north_east</span></button>
        <button class="window-ctrl-btn maximize" onclick="maximizeWindow('${window.id}')" title="最大化"><span class="material-symbols-outlined">expand_content</span></button>
        `;
      } else if (window.isMaximized) {
        windowControlButtons = `
        <button class="window-ctrl-btn close" onclick="closeWindow('${window.id}')" title="閉じる"><span class="material-icons">close</span></button>
        <button class="window-ctrl-btn minimize" onclick="minimizeWindow('${window.id}')" title="最小化"><span class="material-icons">minimize</span></button>
        <button class="window-ctrl-btn maximize active" onclick="restoreWindow('${window.id}')" title="元に戻す"><span class="material-icons">close_fullscreen</span></button>
        `;
      } else {
        windowControlButtons = `
        <button class="window-ctrl-btn close" onclick="closeWindow('${window.id}')" title="閉じる"><span class="material-icons">close</span></button>
        <button class="window-ctrl-btn minimize" onclick="minimizeWindow('${window.id}')" title="最小化"><span class="material-icons">minimize</span></button>
        <button class="window-ctrl-btn maximize" onclick="maximizeWindow('${window.id}')" title="最大化"><span class="material-symbols-outlined">expand_content</span></button>
        `;
      }

      // アプリ終了ボタン
      const quitButton = `
      <button class="window-ctrl-btn quit" onclick="quitApp('${window.appName}')" title="アプリを強制終了"><span class="material-icons">power_settings_new</span> 終了</button>
    `;

      // リソース使用量の表示
      const resourceUsage =
        window.cpuUsage !== undefined && window.memoryUsage !== undefined
          ? `
      <div class="window-resource-usage">
        <span class="resource-cpu" style="color: ${
          window.cpuUsage > 10
            ? "#ff6b6b"
            : window.cpuUsage > 5
            ? "#fbbf24"
            : "#4ade80"
        }">
          CPU: ${window.cpuUsage.toFixed(1)}%
        </span>
        <span class="resource-memory" style="color: ${
          window.memoryUsage > 500
            ? "#ff6b6b"
            : window.memoryUsage > 200
            ? "#fbbf24"
            : "#60a5fa"
        }">
          RAM: ${window.memoryUsage.toFixed(0)}MB
        </span>
      </div>
    `
          : "";

      return `
    <div class="window-item">
      <div class="window-info" onclick="focusWindow('${
        window.id
      }')" style="cursor: pointer;">
        ${iconHtml}
        <div class="window-details">
          <div class="window-main-info">
            <strong>${window.appName}</strong>
            <br>
            <small>${window.title || "Untitled"}</small>
            ${
              window.isMinimized
                ? '<span class="state-badge">最小化</span>'
                : ""
            }
            ${
              window.isMaximized
                ? '<span class="state-badge">最大化</span>'
                : ""
            }
          </div>
          ${resourceUsage}
        </div>
      </div>
      <div class="window-actions">
        ${windowControlButtons}
        ${quitButton}
      </div>
    </div>
  `;
    })
    .join("");
}

async function analyzeAndExecute() {
  const userIntent = document.getElementById("userIntent").value.trim();

  if (!userIntent) {
    addLog("意図を入力してください", "error");
    return;
  }

  const analyzeBtn = document.getElementById("analyzeBtn");
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "処理中...";

  try {
    addLog(`AI分析中: "${userIntent}"`, "info");

    const actions = await window.windowAPI.analyzeWindows(userIntent);

    if (actions.length === 0) {
      addLog("実行可能なアクションがありません", "error");
      return;
    }

    addLog(`${actions.length}個のアクションを実行`, "info");

    for (const action of actions) {
      addLog(`実行: ${action.type} - ${action.reasoning}`, "info");
    }

    const results = await window.windowAPI.executeActions(actions);

    const successCount = results.filter((r) => r).length;
    if (successCount === results.length) {
      addLog("すべてのアクションが正常に完了しました", "success");
    } else {
      addLog(`${successCount}/${results.length}個のアクションが完了`, "error");
    }

    // Refresh window list after actions
    setTimeout(refreshWindowList, 500);
  } catch (error) {
    addLog(`エラー: ${error.message}`, "error");
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "分析・実行";
  }
}

async function minimizeWindow(windowId) {
  try {
    // 即座にUIを更新（最小化状態を先に反映）
    const windowItem = currentWindows.find((w) => w.id === windowId);
    if (windowItem) {
      windowItem.isMinimized = true;
      displayWindows(currentWindows);
    }

    const action = {
      type: "minimize",
      targetWindow: windowId,
      reasoning: "User requested minimize",
    };

    const success = await window.windowAPI.executeAction(action);
    if (success) {
      // 実際の状態を確認
      setTimeout(refreshWindowList, 300);
    } else {
      // 失敗した場合は元に戻す
      refreshWindowList();
    }
  } catch (error) {
    addLog(`最小化エラー: ${error.message}`, "error");
    refreshWindowList();
  }
}

async function maximizeWindow(windowId) {
  try {
    // 即座にUIを更新（最大化状態を先に反映）
    const windowItem = currentWindows.find((w) => w.id === windowId);
    if (windowItem) {
      windowItem.isMaximized = true;
      displayWindows(currentWindows);
    }

    const action = {
      type: "maximize",
      targetWindow: windowId,
      reasoning: "User requested maximize",
    };

    const success = await window.windowAPI.executeAction(action);
    if (success) {
      // 実際の状態を確認
      setTimeout(refreshWindowList, 300);
    } else {
      // 失敗した場合は元に戻す
      refreshWindowList();
    }
  } catch (error) {
    addLog(`最大化エラー: ${error.message}`, "error");
    refreshWindowList();
  }
}

async function restoreWindow(windowId) {
  try {
    // 即座にUIを更新（復元状態を先に反映）
    const windowItem = currentWindows.find((w) => w.id === windowId);
    if (windowItem) {
      windowItem.isMinimized = false;
      displayWindows(currentWindows);
    }

    const action = {
      type: "restore",
      targetWindow: windowId,
      reasoning: "User requested restore from minimize",
    };

    const success = await window.windowAPI.executeAction(action);
    if (success) {
      // 実際の状態を確認
      setTimeout(refreshWindowList, 300);
    } else {
      // 失敗した場合は元に戻す
      refreshWindowList();
    }
  } catch (error) {
    addLog(`復元エラー: ${error.message}`, "error");
    refreshWindowList();
  }
}

async function focusWindow(windowId) {
  try {
    const action = {
      type: "focus",
      targetWindow: windowId,
      reasoning: "User clicked on window info",
    };

    await window.windowAPI.executeAction(action);
    // フォーカス後にUIを更新
    setTimeout(refreshWindowList, 200);
  } catch (error) {
    console.error(`Focus error: ${error.message}`);
  }
}

async function closeWindow(windowId) {
  try {
    if (!confirm("このウィンドウを閉じますか？")) {
      return;
    }

    const action = {
      type: "close",
      targetWindow: windowId,
      reasoning: "User requested to close window",
    };

    const success = await window.windowAPI.executeAction(action);
    if (success) {
      addLog(`ウィンドウを閉じました`, "success");
      setTimeout(refreshWindowList, 500);
    }
  } catch (error) {
    addLog(`ウィンドウを閉じるエラー: ${error.message}`, "error");
  }
}

async function quitApp(appName) {
  try {
    if (!confirm(`${appName} を終了しますか？`)) {
      return;
    }

    const success = await window.windowAPI.quitApp(appName);
    if (success) {
      addLog(`${appName} を終了しました`, "success");
      setTimeout(refreshWindowList, 1000);
    }
  } catch (error) {
    addLog(`アプリ終了エラー: ${error.message}`, "error");
  }
}

function displayActiveApp(activeApp) {
  const activeAppContainer = document.getElementById("activeAppInfo");
  
  if (!activeAppContainer) {
    console.warn("Active app container not found");
    return;
  }

  activeAppContainer.innerHTML = `
    <div class="active-app-name">${activeApp}</div>
  `;
}

function displayCpuInfo(cpuInfo) {
  const cpuInfoContainer = document.getElementById("cpuInfo");

  if (!cpuInfoContainer) {
    console.warn("CPU info container not found");
    return;
  }

  const usageColor =
    cpuInfo.usage > 80 ? "#ff4444" : cpuInfo.usage > 50 ? "#ffaa44" : "#44ff44";

  const processesHtml =
    cpuInfo.processes.length > 0
      ? cpuInfo.processes
          .map((proc) => {
            const cpuColor =
              proc.cpuUsage > 10
                ? "#ff6b6b"
                : proc.cpuUsage > 5
                ? "#fbbf24"
                : proc.cpuUsage > 0
                ? "#4ade80"
                : "#9ca3af";
            const memColor =
              proc.memoryUsage > 100
                ? "#ff6b6b"
                : proc.memoryUsage > 50
                ? "#fbbf24"
                : "#60a5fa";

            return `
        <div class="process-item">
          <div class="process-main">
            <span class="process-name">${proc.name}</span>
            <span class="process-stats">
              <span class="process-cpu" style="color: ${cpuColor}">${proc.cpuUsage.toFixed(
              1
            )}%</span>
              <span class="process-memory" style="color: ${memColor}">${proc.memoryUsage.toFixed(
              1
            )}MB</span>
            </span>
          </div>
          ${
            proc.description
              ? `<div class="process-description">${proc.description}</div>`
              : ""
          }
        </div>
      `;
          })
          .join("")
      : '<div class="process-item">プロセス情報なし</div>';

  cpuInfoContainer.innerHTML = `
    <div class="cpu-overview">
      <div class="cpu-stat">
        <div class="cpu-label">CPU使用率</div>
        <div class="cpu-value" style="color: ${usageColor}">${cpuInfo.usage.toFixed(
    1
  )}%</div>
      </div>
      <div class="cpu-stat">
        <div class="cpu-label">コア数</div>
        <div class="cpu-value">${cpuInfo.cores}</div>
      </div>
    </div>
    <div class="cpu-model">
      <small>${cpuInfo.model}</small>
    </div>
    <div class="cpu-processes">
      <div class="processes-header">上位プロセス</div>
      ${processesHtml}
    </div>
  `;
}

function addLog(message, type = "info") {
  const logContainer = document.getElementById("logContainer");
  const timestamp = new Date().toLocaleTimeString();

  const logEntry = document.createElement("div");
  logEntry.className = `log-entry ${type}`;
  logEntry.textContent = `[${timestamp}] ${message}`;

  logContainer.insertBefore(logEntry, logContainer.firstChild);

  // Keep only last 10 logs
  while (logContainer.children.length > 10) {
    logContainer.removeChild(logContainer.lastChild);
  }
}

// 統計関連の関数
let focusChart = null;

async function initializeStatistics() {
  try {
    // 時間範囲セレクターのイベントリスナー
    document.getElementById('timeRange').addEventListener('change', loadFocusStatistics);
    
    // 初期データの読み込み
    await loadFocusStatistics();
    await loadDataInfo();
    
    // 5分ごとに統計を更新
    setInterval(() => {
      loadFocusStatistics();
      loadDataInfo();
    }, 5 * 60 * 1000);
    
    console.log('📊 Statistics initialized');
  } catch (error) {
    console.error('Error initializing statistics:', error);
  }
}

async function loadFocusStatistics() {
  try {
    console.log('🔄 Loading focus statistics...');
    const timeRange = document.getElementById('timeRange').value;
    console.log('Selected time range:', timeRange);
    
    const stats = await window.windowAPI.getFocusStats();
    console.log('Raw stats from API:', stats);
    
    // 統計データを使用時間順にソート
    const sortedStats = stats.sort((a, b) => b.totalFocusTime - a.totalFocusTime);
    
    // 時間範囲によるフィルタリング
    let filteredStats = sortedStats;
    const now = new Date();
    
    if (timeRange === 'today') {
      const today = new Date().toISOString().split('T')[0];
      const todayStart = new Date(today).getTime();
      filteredStats = sortedStats.filter(stat => stat.lastUsed > todayStart);
      console.log('Today filtered stats:', filteredStats);
    } else if (timeRange === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filteredStats = sortedStats.filter(stat => stat.lastUsed > weekAgo.getTime());
    } else if (timeRange === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      filteredStats = sortedStats.filter(stat => stat.lastUsed > monthAgo.getTime());
    }
    
    console.log('Final filtered stats:', filteredStats);
    
    displayStatisticsSummary(filteredStats);
    displayFocusChart(filteredStats);
    displayStatisticsTable(filteredStats);
    
  } catch (error) {
    console.error('Error loading focus statistics:', error);
    document.getElementById('statsSummary').innerHTML = '<p style="color: #ff6b6b;">統計データの読み込みに失敗しました: ' + error.message + '</p>';
  }
}

function displayStatisticsSummary(stats) {
  const summaryContainer = document.getElementById('statsSummary');
  
  if (stats.length === 0) {
    summaryContainer.innerHTML = '<p>まだフォーカスデータがありません</p>';
    return;
  }
  
  const totalTime = stats.reduce((sum, stat) => sum + stat.totalFocusTime, 0);
  const totalSessions = stats.reduce((sum, stat) => sum + stat.totalSessions, 0);
  const avgSessionTime = totalSessions > 0 ? totalTime / totalSessions : 0;
  
  // 最も使用されているアプリ
  const topApp = stats.length > 0 ? stats[0] : null;
  
  summaryContainer.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-value">${formatDuration(totalTime)}</div>
        <div class="summary-label">総フォーカス時間</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${totalSessions}</div>
        <div class="summary-label">総セッション数</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${formatDuration(avgSessionTime)}</div>
        <div class="summary-label">平均セッション時間</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${topApp ? topApp.appName : 'N/A'}</div>
        <div class="summary-label">最も使用されたアプリ</div>
      </div>
    </div>
  `;
}

function displayFocusChart(stats) {
  const ctx = document.getElementById('focusChart').getContext('2d');
  
  // 既存のチャートを破棄
  if (focusChart) {
    focusChart.destroy();
  }
  
  if (stats.length === 0) {
    ctx.fillStyle = '#666';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('データがありません', ctx.canvas.width / 2, ctx.canvas.height / 2);
    return;
  }
  
  // 上位10アプリのみ表示
  const topStats = stats.slice(0, 10);
  
  const labels = topStats.map(stat => stat.appName);
  const data = topStats.map(stat => Math.round(stat.totalFocusTime / 60)); // 分単位
  
  // カラーパレット
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
  ];
  
  focusChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors.slice(0, topStats.length),
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#fff',
            font: {
              size: 12
            },
            generateLabels: function(chart) {
              const data = chart.data;
              return data.labels.map((label, i) => ({
                text: `${label} (${data.datasets[0].data[i]}分)`,
                fillStyle: data.datasets[0].backgroundColor[i],
                index: i
              }));
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed;
              const total = context.dataset.data.reduce((sum, val) => sum + val, 0);
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              return `${label}: ${value}分 (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

function displayStatisticsTable(stats) {
  const tableContainer = document.getElementById('statsTable');
  
  if (stats.length === 0) {
    tableContainer.innerHTML = '<p>データがありません</p>';
    return;
  }
  
  const tableHtml = `
    <table class="stats-table">
      <thead>
        <tr>
          <th>アプリ名</th>
          <th>総フォーカス時間</th>
          <th>セッション数</th>
          <th>平均セッション時間</th>
          <th>最後の使用</th>
        </tr>
      </thead>
      <tbody>
        ${stats.map(stat => `
          <tr>
            <td class="app-name">${stat.appName}</td>
            <td class="focus-time">${formatDuration(stat.totalFocusTime)}</td>
            <td class="session-count">${stat.totalSessions}</td>
            <td class="avg-time">${formatDuration(stat.averageSessionTime)}</td>
            <td class="last-used">${formatDate(stat.lastUsed)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  
  tableContainer.innerHTML = tableHtml;
}

async function loadDataInfo() {
  try {
    const dataInfo = await window.windowAPI.getDataInfo();
    const dataInfoContainer = document.getElementById('dataInfo');
    
    dataInfoContainer.innerHTML = `
      <div class="data-info-grid">
        <div class="data-info-item">
          <span class="data-info-label">総セッション数:</span>
          <span class="data-info-value">${dataInfo.totalSessions}</span>
        </div>
        <div class="data-info-item">
          <span class="data-info-label">追跡アプリ数:</span>
          <span class="data-info-value">${dataInfo.totalApps}</span>
        </div>
        <div class="data-info-item">
          <span class="data-info-label">データサイズ:</span>
          <span class="data-info-value">${dataInfo.dataSize}</span>
        </div>
        <div class="data-info-item">
          <span class="data-info-label">最終更新:</span>
          <span class="data-info-value">${new Date(dataInfo.lastUpdated).toLocaleString()}</span>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error loading data info:', error);
  }
}

function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds}秒`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}分${remainingSeconds}秒` : `${minutes}分`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const remainingMinutes = Math.floor((seconds % 3600) / 60);
    return remainingMinutes > 0 ? `${hours}時間${remainingMinutes}分` : `${hours}時間`;
  }
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'たった今';
  if (diffMins < 60) return `${diffMins}分前`;
  if (diffHours < 24) return `${diffHours}時間前`;
  if (diffDays < 7) return `${diffDays}日前`;
  
  return date.toLocaleDateString('ja-JP');
}

// 通知システム関連の関数
async function initializeNotifications() {
  try {
    // イベントリスナーを設定
    document.getElementById('notificationSettingsBtn').addEventListener('click', openSettingsModal);
    document.getElementById('refreshNotificationsBtn').addEventListener('click', loadNotifications);
    document.getElementById('closeSettingsModal').addEventListener('click', closeSettingsModal);
    document.getElementById('cancelSettingsBtn').addEventListener('click', closeSettingsModal);
    document.getElementById('saveSettingsBtn').addEventListener('click', saveNotificationSettings);
    
    // リアルタイム通知リスナー
    if (window.windowAPI.onNewAnalysisNotification) {
      window.windowAPI.onNewAnalysisNotification((notification) => {
        console.log('New notification received:', notification);
        // 通知履歴を再読み込み
        loadNotifications();
      });
    }
    
    // 初期データを読み込み
    await loadNotifications();
    await loadNotificationsSummary();
    
    console.log('📢 Notifications system initialized');
  } catch (error) {
    console.error('Error initializing notifications:', error);
  }
}

async function loadNotifications() {
  try {
    const notifications = await window.windowAPI.getNotifications();
    displayNotifications(notifications);
  } catch (error) {
    console.error('Error loading notifications:', error);
    document.getElementById('notificationsList').innerHTML = '<p style="color: #ff6b6b;">通知の読み込みに失敗しました</p>';
  }
}

function displayNotifications(notifications) {
  const container = document.getElementById('notificationsList');
  
  if (notifications.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 20px; opacity: 0.7;">まだAI分析結果がありません</div>';
    return;
  }
  
  const notificationsHtml = notifications.map(notification => {
    const priorityClass = notification.appsToClose.length > 0 
      ? notification.appsToClose[0].priority 
      : 'low';
    
    const appsHtml = notification.appsToClose.map(app => `
      <div class="notification-app">
        <div>
          <strong>${app.appName}</strong> (${app.priority})
          <br>
          <small>${app.expectedBenefit}</small>
        </div>
        <button class="app-quit-btn" onclick="quitRecommendedApp('${app.appName}', this)">
          終了
        </button>
      </div>
    `).join('');
    
    return `
      <div class="notification-item ${notification.read ? '' : 'unread'} ${priorityClass}" 
           onclick="markNotificationAsRead('${notification.id}')">
        <div class="notification-header">
          <div class="notification-title">${notification.title}</div>
          <div class="notification-time">${formatDate(notification.timestamp)}</div>
        </div>
        <div class="notification-message">${notification.message}</div>
        <div style="margin-bottom: 10px; font-size: 12px;">
          <strong>システム健康度:</strong> ${notification.systemHealthScore}/100
        </div>
        ${notification.appsToClose.length > 0 ? `
          <div class="notification-apps">
            ${appsHtml}
          </div>
        ` : ''}
        ${notification.overallAssessment ? `
          <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 11px; opacity: 0.8;">
            ${notification.overallAssessment}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
  
  container.innerHTML = notificationsHtml;
}

async function loadNotificationsSummary() {
  try {
    const stats = await window.windowAPI.getNotificationStats();
    const summaryContainer = document.getElementById('notificationsSummary');
    
    summaryContainer.innerHTML = `
      <div class="notification-summary-card">
        <div class="summary-value">${stats.totalNotifications}</div>
        <div class="summary-label">総通知数</div>
      </div>
      <div class="notification-summary-card">
        <div class="summary-value">${stats.unreadCount}</div>
        <div class="summary-label">未読通知</div>
      </div>
      <div class="notification-summary-card">
        <div class="summary-value">${stats.avgSystemHealth}/100</div>
        <div class="summary-label">平均健康度</div>
      </div>
      <div class="notification-summary-card">
        <div class="summary-value">${stats.lastNotification ? formatDate(new Date(stats.lastNotification).getTime()) : '無し'}</div>
        <div class="summary-label">最新通知</div>
      </div>
    `;
  } catch (error) {
    console.error('Error loading notifications summary:', error);
  }
}

async function markNotificationAsRead(notificationId) {
  try {
    await window.windowAPI.markNotificationRead(notificationId);
    // 表示を更新
    loadNotifications();
    loadNotificationsSummary();
  } catch (error) {
    console.error('Error marking notification as read:', error);
  }
}

async function quitRecommendedApp(appName, button) {
  try {
    button.disabled = true;
    button.textContent = '終了中...';
    
    const success = await window.windowAPI.quitRecommendedApp(appName);
    
    if (success) {
      button.textContent = '完了';
      button.style.background = 'rgba(74, 222, 128, 0.2)';
      button.style.borderColor = 'rgba(74, 222, 128, 0.3)';
      setTimeout(() => {
        loadNotifications(); // 画面を更新
      }, 1000);
    } else {
      button.textContent = '失敗';
      button.style.background = 'rgba(239, 68, 68, 0.4)';
      setTimeout(() => {
        button.disabled = false;
        button.textContent = '終了';
        button.style.background = 'rgba(239, 68, 68, 0.2)';
      }, 2000);
    }
  } catch (error) {
    console.error('Error quitting app:', error);
    button.disabled = false;
    button.textContent = '終了';
  }
}

async function openSettingsModal() {
  try {
    const settings = await window.windowAPI.getNotificationSettings();
    
    document.getElementById('analysisIntervalSelect').value = settings.analysisInterval || 300000;
    document.getElementById('enableNotifications').checked = settings.enableNotifications !== false;
    document.getElementById('enableSystemNotifications').checked = settings.enableSystemNotifications !== false;
    
    document.getElementById('notificationSettingsModal').style.display = 'flex';
  } catch (error) {
    console.error('Error opening settings modal:', error);
  }
}

function closeSettingsModal() {
  document.getElementById('notificationSettingsModal').style.display = 'none';
}

async function saveNotificationSettings() {
  try {
    const settings = {
      analysisInterval: parseInt(document.getElementById('analysisIntervalSelect').value),
      enableNotifications: document.getElementById('enableNotifications').checked,
      enableSystemNotifications: document.getElementById('enableSystemNotifications').checked
    };
    
    const success = await window.windowAPI.saveNotificationSettings(settings);
    
    if (success) {
      closeSettingsModal();
      console.log('Settings saved successfully');
    } else {
      alert('設定の保存に失敗しました');
    }
  } catch (error) {
    console.error('Error saving settings:', error);
    alert('設定の保存中にエラーが発生しました');
  }
}
