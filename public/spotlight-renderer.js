// Spotlight-style renderer script

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('aiInput');
  const suggestions = document.getElementById('suggestions');
  const suggestionItems = suggestions.querySelectorAll('.suggestion-item');
  const processing = document.getElementById('processing');
  const appSwitcher = document.getElementById('appSwitcher');
  const appsContainer = document.getElementById('appsContainer');
  const modeIndicator = document.getElementById('modeIndicator');
  
  let selectedIndex = -1;
  let isProcessing = false;
  let isAppMode = false;
  let apps = [];
  let selectedAppIndex = -1;
  let isOptionKeyHeld = false;
  let autoSwitchOnRelease = false;

  // フォーカス時にサジェスションを表示
  input.addEventListener('focus', () => {
    if (input.value.trim() === '') {
      suggestions.classList.add('show');
    }
  });

  // 入力時の処理
  input.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    if (value === '') {
      suggestions.classList.add('show');
    } else {
      suggestions.classList.remove('show');
    }
    selectedIndex = -1;
    updateSelection();
  });

  // サジェスションアイテムのクリック処理
  suggestionItems.forEach((item, index) => {
    item.addEventListener('click', () => {
      input.value = item.textContent;
      suggestions.classList.remove('show');
      executeCommand();
    });

    item.addEventListener('mouseenter', () => {
      selectedIndex = index;
      updateSelection();
    });
  });

  // キーボードイベント処理
  input.addEventListener('keydown', async (e) => {
    const suggestionVisible = suggestions.classList.contains('show');
    
    switch(e.key) {
      case 'Enter':
        e.preventDefault();
        if (suggestionVisible && selectedIndex >= 0) {
          input.value = suggestionItems[selectedIndex].textContent;
          suggestions.classList.remove('show');
        }
        executeCommand();
        break;
        
      case 'Escape':
        e.preventDefault();
        if (suggestionVisible) {
          suggestions.classList.remove('show');
          selectedIndex = -1;
        } else {
          // ウィンドウを非表示にする
          window.windowAPI.hideWindow();
        }
        break;
        
      case 'ArrowDown':
        if (suggestionVisible) {
          e.preventDefault();
          selectedIndex = Math.min(selectedIndex + 1, suggestionItems.length - 1);
          updateSelection();
        }
        break;
        
      case 'ArrowUp':
        if (suggestionVisible) {
          e.preventDefault();
          selectedIndex = Math.max(selectedIndex - 1, -1);
          updateSelection();
        }
        break;
        
      case 'Tab':
        if (suggestionVisible && selectedIndex >= 0) {
          e.preventDefault();
          input.value = suggestionItems[selectedIndex].textContent;
          suggestions.classList.remove('show');
        }
        break;
    }
  });

  // サジェスションの選択状態を更新
  function updateSelection() {
    suggestionItems.forEach((item, index) => {
      if (index === selectedIndex) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
    });
  }

  // コマンドを実行
  async function executeCommand() {
    const command = input.value.trim();
    if (!command || isProcessing) return;

    isProcessing = true;
    processing.classList.add('show');
    suggestions.classList.remove('show');

    try {
      // AIに解析を依頼
      const actions = await window.windowAPI.analyzeWindows(command);
      
      if (actions && actions.length > 0) {
        // アクションを実行
        const results = await window.windowAPI.executeActions(actions);
        
        // 成功したら入力をクリアしてウィンドウを非表示
        if (results.some(r => r)) {
          input.value = '';
          setTimeout(() => {
            window.windowAPI.hideWindow();
          }, 100);
        } else {
          showError('アクションの実行に失敗しました');
        }
      } else {
        showError('有効なアクションが見つかりませんでした');
      }
    } catch (error) {
      console.error('Error executing command:', error);
      showError('エラーが発生しました');
    } finally {
      isProcessing = false;
      processing.classList.remove('show');
    }
  }

  // エラーメッセージを表示
  function showError(message) {
    // プレースホルダーを一時的に変更してエラーを表示
    const originalPlaceholder = input.placeholder;
    input.placeholder = `❌ ${message}`;
    input.value = '';
    
    setTimeout(() => {
      input.placeholder = originalPlaceholder;
    }, 3000);
  }

  // ウィンドウが表示されたときに入力にフォーカス
  window.addEventListener('focus', () => {
    input.focus();
    input.select();
  });

  // 初期フォーカス
  input.focus();

  // アプリモードを初期化
  async function initAppMode(selectNext = false) {
    console.log('initAppMode called - selectNext:', selectNext);
    try {
      // Appモード開始をメインプロセスに通知（Option+Tabの再発火で再初期化されないように）
      await window.windowAPI.appModeStart();
    } catch (e) {
      console.error('appModeStart notify failed:', e);
    }
    isAppMode = true;
    isOptionKeyHeld = true;
    autoSwitchOnRelease = true;
    input.placeholder = 'Optionキーを離すと切り替え...';
    modeIndicator.classList.add('show');
    suggestions.classList.remove('show');
    appSwitcher.classList.add('show');
    console.log('App mode initialized - isOptionKeyHeld:', isOptionKeyHeld, 'autoSwitchOnRelease:', autoSwitchOnRelease);
    
    // 開いているアプリを取得
    try {
      const windowState = await window.windowAPI.getWindowState();
      const uniqueApps = new Map();
      
      // 重複を除いてアプリを収集
      windowState.windows.forEach(win => {
        if (!uniqueApps.has(win.appName)) {
          uniqueApps.set(win.appName, {
            name: win.appName,
            icon: win.appIcon,
            windowId: win.id
          });
        }
      });
      
      apps = Array.from(uniqueApps.values());
      displayApps();
      
      if (apps.length > 0) {
        if (selectNext) {
          // 初回のOption+Tabで次のアプリを選択
          selectedAppIndex = apps.length > 1 ? 1 : 0;
        } else {
          selectedAppIndex = 0;
        }
        updateAppSelection();
      }
    } catch (error) {
      console.error('Error getting apps:', error);
    }
  }

  // アプリ一覧を表示
  function displayApps() {
    appsContainer.innerHTML = '';
    
    apps.forEach((app, index) => {
      const appItem = document.createElement('div');
      appItem.className = 'app-item';
      appItem.dataset.index = index;
      
      const appIcon = document.createElement('img');
      appIcon.className = 'app-icon';
      appIcon.src = app.icon || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      appIcon.alt = app.name;
      
      const appName = document.createElement('div');
      appName.className = 'app-name';
      appName.textContent = app.name;
      
      appItem.appendChild(appIcon);
      appItem.appendChild(appName);
      
      appItem.addEventListener('click', () => {
        selectedAppIndex = index;
        updateAppSelection();
        switchToApp();
      });
      
      appsContainer.appendChild(appItem);
    });
  }

  // アプリの選択状態を更新
  function updateAppSelection() {
    const appItems = appsContainer.querySelectorAll('.app-item');
    appItems.forEach((item, index) => {
      if (index === selectedAppIndex) {
        item.classList.add('selected');
        // スクロールして選択されたアプリを表示
        item.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  // 選択したアプリに切り替え
  async function switchToApp() {
    console.log('switchToApp called - selectedAppIndex:', selectedAppIndex, 'apps.length:', apps.length);
    if (selectedAppIndex < 0 || selectedAppIndex >= apps.length) {
      console.log('switchToApp aborted - invalid selectedAppIndex');
      return;
    }
    
    const app = apps[selectedAppIndex];
    console.log('Switching to app:', app.name);
    try {
      const result = await window.windowAPI.focusApp(app.name);
      console.log('focusApp result:', result);
      exitAppMode();
      window.windowAPI.hideWindow();
      console.log('App switch completed');
    } catch (error) {
      console.error('Error switching to app:', error);
    }
  }

  // アプリモードを終了
  function exitAppMode() {
    console.log('exitAppMode called');
    isAppMode = false;
    isOptionKeyHeld = false;
    autoSwitchOnRelease = false;
    input.placeholder = '例: Safariを左側、VSCodeを右側に配置して';
    modeIndicator.classList.remove('show');
    appSwitcher.classList.remove('show');
    apps = [];
    selectedAppIndex = -1;
    input.value = '';
    console.log('App mode exited');
    // Appモード終了をメインプロセスに通知（Option+Tab再登録）
    window.windowAPI.appModeEnd().catch(err => console.error('appModeEnd notify failed:', err));
  }

  // キーボードイベントを修正してアプリモードに対応
  const originalKeyHandler = input.onkeydown;
  input.addEventListener('keydown', async (e) => {
    console.log('Keydown:', e.key, 'altKey:', e.altKey, 'isAppMode:', isAppMode);
    if (isAppMode) {
      // Optionキーが押されているかチェック
      if (e.altKey) {
        isOptionKeyHeld = true;
        console.log('Option key held');
      }
      
      switch(e.key) {
        case 'Enter':
          e.preventDefault();
          autoSwitchOnRelease = false; // Enterで確定したら自動切り替えを無効化
          switchToApp();
          break;
          
        case 'Escape':
          e.preventDefault();
          autoSwitchOnRelease = false; // Escapeでキャンセルしたら自動切り替えを無効化
          exitAppMode();
          window.windowAPI.hideWindow();
          break;
          
        case 'ArrowLeft':
          e.preventDefault();
          if (selectedAppIndex > 0) {
            selectedAppIndex--;
          } else {
            selectedAppIndex = apps.length - 1; // ループ
          }
          updateAppSelection();
          break;
          
        case 'ArrowRight':
          e.preventDefault();
          if (selectedAppIndex < apps.length - 1) {
            selectedAppIndex++;
          } else {
            selectedAppIndex = 0; // ループ
          }
          updateAppSelection();
          break;
          
        case 'Tab':
          // Optionキーが押されている場合のみTabで移動（macOSのCommand+Tabと同じ）
          if (e.altKey) {
            e.preventDefault();
            if (e.shiftKey) {
              // Option+Shift+Tab で前のアプリへ
              selectedAppIndex = selectedAppIndex > 0 ? selectedAppIndex - 1 : apps.length - 1;
            } else {
              // Option+Tab で次のアプリへ
              selectedAppIndex = selectedAppIndex < apps.length - 1 ? selectedAppIndex + 1 : 0;
            }
            updateAppSelection();
          }
          break;
      }
    }
  });

  // keyupイベントでOptionキーのリリースを検知
  input.addEventListener('keyup', async (e) => {
    console.log('Keyup:', e.key, 'altKey:', e.altKey, 'isAppMode:', isAppMode, 'autoSwitchOnRelease:', autoSwitchOnRelease);
    if (isAppMode) {
      // macOSでOptionキーが離されたことを検知（altKeyがfalseになったとき）
      if (!e.altKey && isOptionKeyHeld && autoSwitchOnRelease) {
        console.log('Option key released (altKey became false), switching app...');
        isOptionKeyHeld = false;
        // 少し遅延を入れて、誤動作を防ぐ
        setTimeout(() => {
          if (!isOptionKeyHeld && autoSwitchOnRelease) {
            console.log('Calling switchToApp()');
            switchToApp();
          }
        }, 50);
      }
    }
  });

  // ウィンドウ全体でもkeyupを監視（フォーカスが外れた場合の対策）
  window.addEventListener('keyup', (e) => {
    console.log('Window keyup:', e.key, 'altKey:', e.altKey, 'isAppMode:', isAppMode);
    // Optionキーが離された時（altKeyがfalseになった時）
    if (isAppMode && !e.altKey && isOptionKeyHeld && autoSwitchOnRelease) {
      console.log('Window: Option key released, switching app...');
      isOptionKeyHeld = false;
      setTimeout(() => {
        if (!isOptionKeyHeld && autoSwitchOnRelease) {
          console.log('Window: Calling switchToApp()');
          switchToApp();
        }
      }, 50);
    }
  });

  // ウィンドウのアプリモードメッセージを受信
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'initAppMode') {
      initAppMode();
    }
  });

  // APIに initAppMode を公開
  window.initAppMode = initAppMode;
  window.initAppModeWithNext = () => initAppMode(true);
});