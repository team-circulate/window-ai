let currentWindows = [];
let iconCache = {}; // アイコンのキャッシュ

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
  refreshWindowList();
  refreshCpuInfo();
  
  // 新しいアプリをチェック
  checkForNewApps();

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
  document
    .getElementById("closeAllAppsBtn")
    .addEventListener("click", showCloseAllAppsDialog);
  
  // App search event listeners
  document
    .getElementById("searchAppsBtn")
    .addEventListener("click", searchApps);
  document
    .getElementById("appSearchInput")
    .addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        searchApps();
      }
    });
  
  // リアルタイム検索
  document
    .getElementById("appSearchInput")
    .addEventListener("input", debounce(searchApps, 300));

  // Auto-refresh CPU info every 5 seconds
  setInterval(() => {
    refreshCpuInfo();
  }, 5000);

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
            <strong>
              ${window.appName}
              <button class="app-info-btn" onclick="event.stopPropagation(); showAppInfo('${window.appName}')" title="アプリ情報">
                i
              </button>
            </strong>
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

// Close All Apps Dialog functions
function showCloseAllAppsDialog() {
  // Get unique app names from current windows
  const uniqueApps = [...new Set(currentWindows.map((w) => w.appName))];

  if (uniqueApps.length === 0) {
    addLog("閉じるアプリケーションがありません", "info");
    return;
  }

  // Build checkbox list
  const appCheckboxList = document.getElementById("appCheckboxList");
  appCheckboxList.innerHTML = uniqueApps
    .map((appName) => {
      const windowCount = currentWindows.filter(
        (w) => w.appName === appName
      ).length;
      const icon = currentWindows.find((w) => w.appName === appName)?.appIcon;
      const iconHtml = icon
        ? `<img src="${icon}" style="width: 24px; height: 24px; border-radius: 4px; margin-right: 8px; vertical-align: middle;">`
        : '<span class="material-icons" style="font-size: 24px; margin-right: 8px; vertical-align: middle; opacity: 0.7;">web_asset</span>';

      return `
      <div style="
        padding: 10px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        transition: background 0.2s;
      " onmouseover="this.style.background='rgba(255, 255, 255, 0.15)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'">
        <input type="checkbox" id="keep-${appName}" value="${appName}" style="
          width: 20px;
          height: 20px;
          margin-right: 12px;
          cursor: pointer;
        ">
        <label for="keep-${appName}" style="
          flex: 1;
          cursor: pointer;
          display: flex;
          align-items: center;
          font-size: 14px;
        ">
          ${iconHtml}
          <span>
            <strong>${appName}</strong>
            <span style="opacity: 0.7; margin-left: 8px; font-size: 12px;">
              (${windowCount} ウィンドウ)
            </span>
          </span>
        </label>
      </div>
    `;
    })
    .join("");

  // Show dialog
  document.getElementById("closeAllAppsDialog").style.display = "block";
}

function cancelCloseAllApps() {
  document.getElementById("closeAllAppsDialog").style.display = "none";
}

async function confirmCloseAllApps() {
  try {
    // Get checked apps (apps to keep open)
    const checkboxes = document.querySelectorAll(
      '#appCheckboxList input[type="checkbox"]'
    );
    const appsToKeep = Array.from(checkboxes)
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);

    // Get apps to close (unchecked ones)
    const appsToClose = [
      ...new Set(currentWindows.map((w) => w.appName)),
    ].filter((appName) => !appsToKeep.includes(appName));

    if (appsToClose.length === 0) {
      addLog("閉じるアプリケーションが選択されていません", "info");
      cancelCloseAllApps();
      return;
    }

    // Close the dialog
    cancelCloseAllApps();

    // Close each app
    addLog(`${appsToClose.length}個のアプリケーションを終了中...`, "info");

    for (const appName of appsToClose) {
      try {
        const success = await window.windowAPI.quitApp(appName);
        if (success) {
          addLog(`${appName} を終了しました`, "success");
        } else {
          addLog(`${appName} の終了に失敗しました`, "error");
        }
        // Small delay between closing apps
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        addLog(`${appName} の終了エラー: ${error.message}`, "error");
      }
    }

    // Refresh window list after closing apps
    setTimeout(refreshWindowList, 1000);
  } catch (error) {
    addLog(`アプリケーション終了エラー: ${error.message}`, "error");
  }
}

// App Info Modal functions
async function showAppInfo(appName) {
  try {
    const observations = await window.windowAPI.getAppInfo(appName);
    
    document.getElementById('appInfoTitle').textContent = appName;
    const contentDiv = document.getElementById('appInfoContent');
    
    if (observations && observations.length > 0) {
      contentDiv.innerHTML = observations.map(obs => `
        <div class="observation-item">
          <span class="material-icons">lens</span>
          <span>${obs}</span>
        </div>
      `).join('');
    } else {
      contentDiv.innerHTML = `
        <div class="observation-item">
          <span class="material-icons">info</span>
          <span>情報を取得中...</span>
        </div>
      `;
      
      // Refresh window list to trigger description generation
      setTimeout(async () => {
        await refreshWindowList();
        // Try again after refresh
        const newObservations = await window.windowAPI.getAppInfo(appName);
        if (newObservations && newObservations.length > 0) {
          contentDiv.innerHTML = newObservations.map(obs => `
            <div class="observation-item">
              <span class="material-icons">lens</span>
              <span>${obs}</span>
            </div>
          `).join('');
        } else {
          contentDiv.innerHTML = `
            <div class="observation-item">
              <span class="material-icons">error_outline</span>
              <span>情報が見つかりませんでした</span>
            </div>
          `;
        }
      }, 100);
    }
    
    document.getElementById('appInfoModal').style.display = 'block';
  } catch (error) {
    console.error('Error showing app info:', error);
    addLog(`アプリ情報の取得エラー: ${error.message}`, 'error');
  }
}

function closeAppInfoModal() {
  document.getElementById('appInfoModal').style.display = 'none';
}

// Check for new apps function
async function checkForNewApps() {
  try {
    const result = await window.windowAPI.checkNewApps();
    
    if (result.newAppsFound) {
      console.log(`新しいアプリが ${result.apps.length} 個見つかりました:`, result.apps);
      addLog(`新しいアプリを分析しました: ${result.apps.join(', ')}`, 'info');
      
      // ウィンドウリストを更新して新しい情報を反映
      setTimeout(() => {
        refreshWindowList();
      }, 1000);
    }
  } catch (error) {
    console.error('新しいアプリのチェックエラー:', error);
  }
}

// App Search and Launch functions
async function searchApps() {
  const searchInput = document.getElementById("appSearchInput");
  const query = searchInput.value.trim();
  const resultsDiv = document.getElementById("appSearchResults");
  
  if (!query) {
    resultsDiv.innerHTML = "";
    return;
  }
  
  try {
    // 検索を実行
    const apps = await window.windowAPI.searchApps(query);
    
    if (apps.length === 0) {
      resultsDiv.innerHTML = `
        <div class="no-results">
          <span class="material-icons">search_off</span>
          <p>"${query}" に一致するアプリケーションが見つかりません</p>
        </div>
      `;
      return;
    }
    
    // 検索結果を表示
    resultsDiv.innerHTML = apps.map(app => {
      // アイコンを取得（キャッシュがあればそれを使用）
      const iconHtml = `
        <div class="app-search-icon-placeholder">
          <span class="material-icons">apps</span>
        </div>
      `;
      
      return `
        <div class="app-search-item" data-app-name="${app.name}" data-app-path="${app.path}">
          <div class="app-search-info">
            ${iconHtml}
            <div class="app-search-details">
              <div class="app-search-name">${app.name}</div>
              ${app.version ? `<div class="app-search-version">バージョン: ${app.version}</div>` : ''}
            </div>
          </div>
          <button class="app-launch-btn" onclick="launchApp('${app.name}', '${app.path}')">
            <span class="material-icons">launch</span>
            起動
          </button>
        </div>
      `;
    }).join('');
    
    // アイコンを非同期で読み込む
    apps.forEach(async app => {
      try {
        const icon = await window.windowAPI.getAppIcon(app.name);
        if (icon) {
          const appItems = document.querySelectorAll(`[data-app-name="${app.name}"]`);
          appItems.forEach(item => {
            const iconPlaceholder = item.querySelector('.app-search-icon-placeholder');
            if (iconPlaceholder) {
              iconPlaceholder.outerHTML = `<img src="${icon}" class="app-search-icon" alt="${app.name}">`;
            }
          });
        }
      } catch (error) {
        console.error(`Failed to load icon for ${app.name}:`, error);
      }
    });
    
  } catch (error) {
    console.error('Search error:', error);
    resultsDiv.innerHTML = `
      <div class="no-results">
        <span class="material-icons">error</span>
        <p>検索エラー: ${error.message}</p>
      </div>
    `;
  }
}

async function launchApp(appName, appPath) {
  try {
    addLog(`${appName} を起動中...`, "info");
    
    const success = await window.windowAPI.launchAppByPath(appPath);
    
    if (success) {
      addLog(`${appName} を起動しました`, "success");
      
      // 検索結果をクリア
      document.getElementById("appSearchInput").value = "";
      document.getElementById("appSearchResults").innerHTML = "";
      
      // 少し待ってからウィンドウリストを更新
      setTimeout(refreshWindowList, 2000);
    } else {
      addLog(`${appName} の起動に失敗しました`, "error");
    }
  } catch (error) {
    addLog(`起動エラー: ${error.message}`, "error");
  }
}

// デバウンス関数
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Reset local data function
async function resetLocalData() {
  const confirmed = confirm(
    "ローカルデータをすべて削除してオンボーディングに戻ります。\n\n" +
    "以下のデータが削除されます:\n" + 
    "• アプリケーション分析データ\n" +
    "• オンボーディング完了状態\n\n" +
    "続行しますか？"
  );
  
  if (!confirmed) return;
  
  try {
    addLog("ローカルデータを削除中...", "info");
    
    // IPCでデータ削除を実行
    const result = await window.windowAPI.resetLocalData();
    
    if (result) {
      addLog("データを削除しました。アプリケーションを再起動しています...", "success");
      // アプリが自動的に再起動されるため、ここでは何もしない
    } else {
      addLog("データ削除に失敗しました", "error");
    }
  } catch (error) {
    console.error('Reset data error:', error);
    addLog(`リセットエラー: ${error.message}`, "error");
  }
}

// Make functions available globally for onclick handlers
window.cancelCloseAllApps = cancelCloseAllApps;
window.confirmCloseAllApps = confirmCloseAllApps;
window.showAppInfo = showAppInfo;
window.closeAppInfoModal = closeAppInfoModal;
window.launchApp = launchApp;
window.resetLocalData = resetLocalData;
