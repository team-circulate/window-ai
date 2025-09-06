let currentWindows = [];
let iconCache = {}; // アイコンのキャッシュ

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  refreshWindowList();

  // Event listeners
  document
    .getElementById("analyzeBtn")
    .addEventListener("click", analyzeAndExecute);
  document
    .getElementById("refreshBtn")
    .addEventListener("click", refreshWindowList);

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
  } catch (error) {
    addLog(`エラー: ${error.message}`, "error");
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
        // 最小化されている場合
        windowControlButtons = `
        <button class="window-ctrl-btn close" onclick="closeWindow('${window.id}')" title="閉じる"><span class="material-icons">close</span></button>
        <button class="window-ctrl-btn minimize" onclick="restoreWindow('${window.id}')" title="復元"><span class="material-icons">north_east</span></button>
        <button class="window-ctrl-btn maximize" onclick="maximizeWindow('${window.id}')" title="最大化"><span class="material-symbols-outlined">expand_content</span></button>
        `;
      } else if (window.isMaximized) {
        // 最大化されている場合
        windowControlButtons = `
        <button class="window-ctrl-btn close" onclick="closeWindow('${window.id}')" title="閉じる"><span class="material-icons">close</span></button>
        <button class="window-ctrl-btn minimize" onclick="minimizeWindow('${window.id}')" title="最小化"><span class="material-icons">minimize</span></button>
        <button class="window-ctrl-btn maximize active" onclick="restoreWindow('${window.id}')" title="元に戻す"><span class="material-icons">close_fullscreen</span></button>
        `;
      } else {
        // 通常状態
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

      return `
    <div class="window-item">
      <div class="window-info" onclick="focusWindow('${
        window.id
      }')" style="cursor: pointer;">
        ${iconHtml}
        <div>
          <strong>${window.appName}</strong>
          <br>
          <small>${window.title || "Untitled"}</small>
          ${window.isMinimized ? '<span class="state-badge">最小化</span>' : ""}
          ${window.isMaximized ? '<span class="state-badge">最大化</span>' : ""}
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
