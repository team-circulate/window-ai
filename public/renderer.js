let currentWindows = [];
let iconCache = {}; // アイコンのキャッシュ
let autoRefreshInterval = null;
let selectedWindowIds = new Set();

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
  const refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", refreshWindowList);
  }
  document
    .getElementById("cpuRefreshBtn")
    .addEventListener("click", refreshCpuInfo);
  // Open Save Preset dialog
  const openSaveBtn = document.getElementById("openSavePresetDialogBtn");
  if (openSaveBtn) {
    openSaveBtn.addEventListener("click", () => {
      document.getElementById("savePresetNameInput").value = "";
      document.getElementById("savePresetDialog").style.display = "block";
    });
  }
  const selectAllBtn = document.getElementById("selectAllWindowsBtn");
  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", () => {
      const allIds = currentWindows.map((w) => w.id);
      const allSelected = allIds.every((id) => selectedWindowIds.has(id));
      if (allSelected) {
        selectedWindowIds.clear();
      } else {
        selectedWindowIds = new Set(allIds);
      }
      displayWindows(currentWindows);
      updateBulkActionBar();
    });
  }

  // Bulk action buttons
  const bulkCloseBtn = document.getElementById("bulkCloseBtn");
  const bulkMinimizeBtn = document.getElementById("bulkMinimizeBtn");
  const bulkQuitBtn = document.getElementById("bulkQuitBtn");
  if (bulkCloseBtn)
    bulkCloseBtn.addEventListener("click", () => bulkAction("close"));
  // bulkMinimizeBtn の動作は updateBulkActionBar() 内で切り替える
  if (bulkQuitBtn)
    bulkQuitBtn.addEventListener("click", () => bulkAction("quit"));
  // (hero refresh button removed)
  document.getElementById("windowRefreshBtn").addEventListener("click", () => {
    refreshWindowList();
    refreshCpuInfo();
  });
  // closeAllAppsBtn は削除済み。存在する場合のみバインド（後方互換）
  const closeAllBtn = document.getElementById("closeAllAppsBtn");
  if (closeAllBtn) {
    closeAllBtn.addEventListener("click", showCloseAllAppsDialog);
  }

  // Auto refresh toggle
  document
    .getElementById("autoRefreshCheckbox")
    .addEventListener("change", (e) => {
      if (e.target.checked) {
        startAutoRefresh();
      } else {
        stopAutoRefresh();
      }
    });

  // Preset event listeners (legacy input row may not exist)
  const legacySaveBtn = document.getElementById("savePresetBtn");
  if (legacySaveBtn) {
    legacySaveBtn.addEventListener("click", savePreset);
  }
  const legacyNameInput = document.getElementById("presetNameInput");
  if (legacyNameInput) {
    legacyNameInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        savePreset();
      }
    });
  }

  // Task-based app suggestion event listeners
  document
    .getElementById("suggestAppsBtn")
    .addEventListener("click", suggestAppsForTask);
  document
    .getElementById("taskPromptInput")
    .addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        suggestAppsForTask();
      }
    });

  // Load presets on startup with retry for robustness
  await loadPresetsWithRetry(3, 300);

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
    const windowState = await window.windowAPI.getWindowState();
    currentWindows = windowState.windows;

    displayWindows(windowState.windows);

    // CPU情報も一緒に表示
    if (windowState.cpuInfo) {
      displayCpuInfo(windowState.cpuInfo);
    }

    // 自動更新中は詳細ログを出さない
    if (!autoRefreshInterval) {
      addLog(`${windowState.windows.length}個のウィンドウを検出`, "success");
    }
  } catch (error) {
    addLog(`エラー: ${error.message}`, "error");
  }
}

async function refreshCpuInfo() {
  try {
    const cpuInfo = await window.windowAPI.getCpuInfo();
    displayCpuInfo(cpuInfo);

    // 自動更新中は詳細ログを出さない
    if (!autoRefreshInterval) {
      addLog("CPU情報を更新しました", "success");
    }
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

      const checked = selectedWindowIds.has(window.id) ? "checked" : "";
      return `
    <div class="window-item">
      <input type="checkbox" class="win-select" data-id="${
        window.id
      }" ${checked} style="margin-right: 6px;">
      <div class="window-info" onclick="focusWindow('${
        window.id
      }')" style="cursor: pointer;">
        ${iconHtml}
        <div class="window-details">
          <div class="window-main-info">
            <strong>
              ${window.appName}
              <button class="app-info-btn" onclick="event.stopPropagation(); showAppInfo('${
                window.appName
              }')" title="アプリ情報">
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

  // bind checkbox handlers
  windowList.querySelectorAll(".win-select").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const id = e.target.getAttribute("data-id");
      if (e.target.checked) selectedWindowIds.add(id);
      else selectedWindowIds.delete(id);
      updateBulkActionBar();
    });
  });

  updateBulkActionBar();
}

function updateBulkActionBar() {
  const bar = document.getElementById("bulkActionBar");
  if (!bar) return;
  const count = selectedWindowIds.size;
  if (count > 0) {
    bar.style.display = "flex";
    const text = document.getElementById("bulkCountText");
    if (text) text.textContent = `${count}個のウィンドウ`;

    // Toggle minimize/restore label based on selection state
    const bulkMinBtn = document.getElementById("bulkMinimizeBtn");
    if (bulkMinBtn) {
      const allMinimized = currentWindows
        .filter((w) => selectedWindowIds.has(w.id))
        .every((w) => w.isMinimized);

      // Update label and click handler dynamically
      if (allMinimized) {
        bulkMinBtn.innerHTML =
          '<span class="material-icons">north_east</span> 取り出す';
        bulkMinBtn.onclick = () => bulkAction("restore");
      } else {
        bulkMinBtn.innerHTML =
          '<span class="material-icons">minimize</span> 最小化';
        bulkMinBtn.onclick = () => bulkAction("minimize");
      }
    }
  } else {
    bar.style.display = "none";
  }
}

async function bulkAction(kind) {
  const ids = Array.from(selectedWindowIds);
  if (ids.length === 0) return;
  try {
    if (kind === "quit") {
      // group by appName and quit
      const selected = currentWindows.filter((w) => ids.includes(w.id));
      const appNames = [...new Set(selected.map((w) => w.appName))];
      for (const appName of appNames) {
        await window.windowAPI.quitApp(appName);
      }
    } else if (kind === "minimize" || kind === "close") {
      for (const id of ids) {
        await window.windowAPI.executeAction({
          type: kind,
          targetWindow: id,
          reasoning: "Bulk action",
        });
      }
    }
    addLog(`一括操作(${kind})を実行: ${ids.length}件`, "success");
    selectedWindowIds.clear();
    setTimeout(refreshWindowList, 300);
  } catch (error) {
    addLog(`一括操作エラー: ${error.message}`, "error");
  }
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

    document.getElementById("appInfoTitle").textContent = appName;
    const contentDiv = document.getElementById("appInfoContent");

    if (observations && observations.length > 0) {
      contentDiv.innerHTML = observations
        .map(
          (obs) => `
        <div class="observation-item">
          <span class="material-icons">lens</span>
          <span>${obs}</span>
        </div>
      `
        )
        .join("");
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
          contentDiv.innerHTML = newObservations
            .map(
              (obs) => `
            <div class="observation-item">
              <span class="material-icons">lens</span>
              <span>${obs}</span>
            </div>
          `
            )
            .join("");
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

    document.getElementById("appInfoModal").style.display = "block";
  } catch (error) {
    console.error("Error showing app info:", error);
    addLog(`アプリ情報の取得エラー: ${error.message}`, "error");
  }
}

function closeAppInfoModal() {
  document.getElementById("appInfoModal").style.display = "none";
}

// Check for new apps function
async function checkForNewApps() {
  try {
    const result = await window.windowAPI.checkNewApps();

    if (result.newAppsFound) {
      console.log(
        `新しいアプリが ${result.apps.length} 個見つかりました:`,
        result.apps
      );
      addLog(`新しいアプリを分析しました: ${result.apps.join(", ")}`, "info");

      // ウィンドウリストを更新して新しい情報を反映
      setTimeout(() => {
        refreshWindowList();
      }, 1000);
    }
  } catch (error) {
    console.error("新しいアプリのチェックエラー:", error);
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
    resultsDiv.innerHTML = apps
      .map((app) => {
        // アイコンを取得（キャッシュがあればそれを使用）
        const iconHtml = `
        <div class="app-search-icon-placeholder">
          <span class="material-icons">apps</span>
        </div>
      `;

        return `
        <div class="app-search-item" data-app-name="${
          app.name
        }" data-app-path="${app.path}">
          <div class="app-search-info">
            ${iconHtml}
            <div class="app-search-details">
              <div class="app-search-name">${app.name}</div>
              ${
                app.version
                  ? `<div class="app-search-version">バージョン: ${app.version}</div>`
                  : ""
              }
            </div>
          </div>
          <button class="app-launch-btn" onclick="launchApp('${app.name}', '${
          app.path
        }')">
            <span class="material-icons">launch</span>
            起動
          </button>
        </div>
      `;
      })
      .join("");

    // アイコンを非同期で読み込む
    apps.forEach(async (app) => {
      try {
        const icon = await window.windowAPI.getAppIcon(app.name);
        if (icon) {
          const appItems = document.querySelectorAll(
            `[data-app-name="${app.name}"]`
          );
          appItems.forEach((item) => {
            const iconPlaceholder = item.querySelector(
              ".app-search-icon-placeholder"
            );
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
    console.error("Search error:", error);
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
      addLog(
        "データを削除しました。アプリケーションを再起動しています...",
        "success"
      );
      // アプリが自動的に再起動されるため、ここでは何もしない
    } else {
      addLog("データ削除に失敗しました", "error");
    }
  } catch (error) {
    console.error("Reset data error:", error);
    addLog(`リセットエラー: ${error.message}`, "error");
  }
}

// Preset Management Functions
async function loadPresets() {
  try {
    const presets = await window.windowAPI.getPresets();
    const presetList = document.getElementById("presetList");

    if (presets.length === 0) {
      presetList.innerHTML = `
        <div style="text-align: center; padding: 20px; color: rgba(255,255,255,0.5);">
          <span class="material-icons" style="font-size: 48px;">bookmark_border</span>
          <p>プリセットがありません</p>
          <p style="font-size: 12px;">現在のウィンドウ配置を保存してください</p>
        </div>
      `;
      return;
    }

    presetList.innerHTML = presets
      .map((preset) => {
        const date = new Date(preset.updatedAt);
        const dateStr = `${
          date.getMonth() + 1
        }/${date.getDate()} ${date.getHours()}:${date
          .getMinutes()
          .toString()
          .padStart(2, "0")}`;

        return `
        <div class="preset-item">
          <div class="preset-info">
            <div class="preset-name">${preset.name}</div>
            <div class="preset-details">
              ${preset.windows.length}個のウィンドウ • ${dateStr}
              ${preset.description ? `<br>${preset.description}` : ""}
            </div>
          </div>
          <div class="preset-actions">
            <button class="preset-btn load" onclick="loadPreset('${
              preset.id
            }')">
              <span class="material-icons" style="font-size: 14px;">play_arrow</span>
              復元
            </button>
            <button class="preset-btn delete" onclick="deletePreset('${
              preset.id
            }')">
              <span class="material-icons" style="font-size: 14px;">delete</span>
            </button>
          </div>
        </div>
      `;
      })
      .join("");
  } catch (error) {
    console.error("Error loading presets:", error);
    addLog(`プリセット読み込みエラー: ${error.message}`, "error");
  }
}

// Robust loader with retry
async function loadPresetsWithRetry(retries = 3, delayMs = 300) {
  for (let i = 0; i < retries; i++) {
    try {
      await loadPresets();
      const list = document.getElementById("presetList");
      if (list && list.children.length > 0) return; // success
    } catch (e) {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  // last attempt (ensure UI message even if 0件)
  await loadPresets();
}

async function savePreset() {
  const nameInput = document.getElementById("presetNameInput");
  const name = nameInput.value.trim();

  if (!name) {
    addLog("プリセット名を入力してください", "error");
    return;
  }

  try {
    const preset = await window.windowAPI.savePreset(name);
    addLog(`プリセット "${preset.name}" を保存しました`, "success");
    nameInput.value = "";
    await loadPresets();
  } catch (error) {
    console.error("Error saving preset:", error);
    addLog(`プリセット保存エラー: ${error.message}`, "error");
  }
}

async function loadPreset(presetId) {
  try {
    addLog("プリセットを復元中...", "info");
    const success = await window.windowAPI.loadPreset(presetId);

    if (success) {
      addLog("プリセットを復元しました", "success");
      // ウィンドウリストを更新
      setTimeout(() => {
        refreshWindowList();
      }, 1000);
    } else {
      addLog("プリセットの復元に失敗しました", "error");
    }
  } catch (error) {
    console.error("Error loading preset:", error);
    addLog(`プリセット復元エラー: ${error.message}`, "error");
  }
}

async function deletePreset(presetId) {
  if (!confirm("このプリセットを削除しますか？")) {
    return;
  }

  try {
    const success = await window.windowAPI.deletePreset(presetId);

    if (success) {
      addLog("プリセットを削除しました", "success");
      await loadPresets();
    } else {
      addLog("プリセットの削除に失敗しました", "error");
    }
  } catch (error) {
    console.error("Error deleting preset:", error);
    addLog(`プリセット削除エラー: ${error.message}`, "error");
  }
}

// Task-based App Suggestion Functions
let selectedTaskApps = new Set();
let taskSuggestions = null;

async function suggestAppsForTask() {
  const promptInput = document.getElementById("taskPromptInput");
  const userPrompt = promptInput.value.trim();

  if (!userPrompt) {
    addLog("タスクを入力してください", "error");
    return;
  }

  // ダイアログを開く
  document.getElementById("taskAppDialog").style.display = "block";
  document.getElementById("taskAppLoading").style.display = "block";
  document.getElementById("taskAppContent").style.display = "none";

  // タスク名を自動設定
  document.getElementById("taskNameInput").value = userPrompt;

  try {
    // AIに提案を依頼
    addLog(`タスク「${userPrompt}」に最適なアプリを分析中...`, "info");
    taskSuggestions = await window.windowAPI.suggestAppsForTask(userPrompt);

    // 選択されたアプリをリセット
    selectedTaskApps.clear();

    // 高確度アプリを追加（デフォルトでチェック済み）
    taskSuggestions.highConfidence.forEach((app) => selectedTaskApps.add(app));

    // UIを更新
    displayTaskSuggestions();

    document.getElementById("taskAppLoading").style.display = "none";
    document.getElementById("taskAppContent").style.display = "block";
  } catch (error) {
    console.error("Error suggesting apps:", error);
    addLog(`アプリ提案エラー: ${error.message}`, "error");
    closeTaskAppDialog();
  }
}

function displayTaskSuggestions() {
  if (!taskSuggestions) return;

  // 説明文を表示
  document.getElementById("taskReasoningText").textContent =
    taskSuggestions.reasoning;

  // 高確度アプリを表示
  const highDiv = document.getElementById("highConfidenceApps");
  highDiv.innerHTML =
    taskSuggestions.highConfidence
      .map(
        (app) => `
    <label style="display: flex; align-items: center; padding: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 6px; margin-bottom: 6px; cursor: pointer;">
      <input type="checkbox" 
             value="${app}" 
             ${selectedTaskApps.has(app) ? "checked" : ""} 
             onchange="toggleTaskApp('${app}')"
             style="margin-right: 8px;">
      <span style="color: white;">${app}</span>
    </label>
  `
      )
      .join("") ||
    '<p style="color: rgba(255, 255, 255, 0.5); padding: 8px;">推奨アプリなし</p>';

  // 低確度アプリを表示
  const lowDiv = document.getElementById("lowConfidenceApps");
  lowDiv.innerHTML =
    taskSuggestions.lowConfidence
      .map(
        (app) => `
    <label style="display: flex; align-items: center; padding: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 6px; margin-bottom: 6px; cursor: pointer;">
      <input type="checkbox" 
             value="${app}" 
             ${selectedTaskApps.has(app) ? "checked" : ""} 
             onchange="toggleTaskApp('${app}')"
             style="margin-right: 8px;">
      <span style="color: white;">${app}</span>
    </label>
  `
      )
      .join("") ||
    '<p style="color: rgba(255, 255, 255, 0.5); padding: 8px;">追加候補なし</p>';
}

function toggleTaskApp(appName) {
  if (selectedTaskApps.has(appName)) {
    selectedTaskApps.delete(appName);
  } else {
    selectedTaskApps.add(appName);
  }
}

async function searchAdditionalApps() {
  const searchInput = document.getElementById("additionalAppSearch");
  const query = searchInput.value.trim();
  const resultsDiv = document.getElementById("additionalAppResults");

  if (!query) {
    resultsDiv.innerHTML = "";
    return;
  }

  try {
    const apps = await window.windowAPI.searchApps(query);

    if (apps.length === 0) {
      resultsDiv.innerHTML =
        '<p style="color: rgba(255, 255, 255, 0.5); padding: 8px;">見つかりません</p>';
      return;
    }

    resultsDiv.innerHTML = apps
      .slice(0, 5)
      .map(
        (app) => `
      <label style="display: flex; align-items: center; padding: 6px; background: rgba(255, 255, 255, 0.05); border-radius: 4px; margin-bottom: 4px; cursor: pointer;">
        <input type="checkbox" 
               value="${app.name}" 
               ${selectedTaskApps.has(app.name) ? "checked" : ""} 
               onchange="toggleTaskApp('${app.name}')"
               style="margin-right: 8px;">
        <span style="color: white; font-size: 13px;">${app.name}</span>
      </label>
    `
      )
      .join("");
  } catch (error) {
    console.error("Search error:", error);
    resultsDiv.innerHTML =
      '<p style="color: #ff6b6b; padding: 8px;">検索エラー</p>';
  }
}

function closeTaskAppDialog() {
  document.getElementById("taskAppDialog").style.display = "none";
  document.getElementById("taskPromptInput").value = "";
  document.getElementById("additionalAppSearch").value = "";
  document.getElementById("additionalAppResults").innerHTML = "";
  selectedTaskApps.clear();
  taskSuggestions = null;
}

async function confirmTaskApps() {
  const taskName =
    document.getElementById("taskNameInput").value.trim() ||
    document.getElementById("taskPromptInput").value.trim();

  if (selectedTaskApps.size === 0) {
    addLog("アプリを選択してください", "error");
    return;
  }

  const appNames = Array.from(selectedTaskApps);

  try {
    addLog(`${appNames.length}個のアプリを起動中...`, "info");

    // アプリを開いてプリセットとして保存
    const preset = await window.windowAPI.openAppsForTask(appNames, taskName);

    addLog(
      `タスク「${taskName}」のアプリを起動し、プリセットとして保存しました`,
      "success"
    );

    // プリセット一覧を更新
    await loadPresets();

    // ウィンドウリストを更新
    setTimeout(() => {
      refreshWindowList();
    }, 3000);

    closeTaskAppDialog();
  } catch (error) {
    console.error("Error opening apps:", error);
    addLog(`アプリ起動エラー: ${error.message}`, "error");
  }
}

// Auto refresh functions
function startAutoRefresh() {
  // 即座に一度更新
  refreshWindowList();
  refreshCpuInfo();

  // 5秒ごとに自動更新
  autoRefreshInterval = setInterval(() => {
    refreshWindowList();
    refreshCpuInfo();
  }, 5000);

  addLog("自動更新を開始しました（5秒間隔）", "info");
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
    addLog("自動更新を停止しました", "info");
  }
}

// Make functions available globally for onclick handlers
window.cancelCloseAllApps = cancelCloseAllApps;
window.confirmCloseAllApps = confirmCloseAllApps;
window.showAppInfo = showAppInfo;
window.closeAppInfoModal = closeAppInfoModal;
window.launchApp = launchApp;
window.resetLocalData = resetLocalData;
window.loadPreset = loadPreset;
window.deletePreset = deletePreset;
window.toggleTaskApp = toggleTaskApp;
window.searchAdditionalApps = searchAdditionalApps;
window.closeTaskAppDialog = closeTaskAppDialog;
window.confirmTaskApps = confirmTaskApps;
window.closeSavePresetDialog = function () {
  document.getElementById("savePresetDialog").style.display = "none";
};
window.confirmSavePresetFromDialog = async function () {
  const name = document.getElementById("savePresetNameInput").value.trim();
  if (!name) {
    addLog("プリセット名を入力してください", "error");
    return;
  }
  try {
    const preset = await window.windowAPI.savePreset(name);
    addLog(`プリセット "${preset.name}" を保存しました`, "success");
    document.getElementById("savePresetDialog").style.display = "none";
    await loadPresets();
  } catch (error) {
    console.error("Error saving preset:", error);
    addLog(`プリセット保存エラー: ${error.message}`, "error");
  }
};
