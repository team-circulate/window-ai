let installedApps = [];
let isAnalyzing = false;

async function loadInstalledApps() {
  try {
    const apps = await window.windowAPI.getInstalledApps();
    installedApps = apps;
    displayApps(apps);
  } catch (error) {
    console.error('Failed to load installed apps:', error);
    document.getElementById('appsGrid').innerHTML = `
      <div class="loading-message">
        <p>アプリケーションの読み込みに失敗しました</p>
      </div>
    `;
  }
}

async function displayApps(apps) {
  const appsGrid = document.getElementById('appsGrid');
  const appCount = document.getElementById('appCount');
  const analyzeBtn = document.getElementById('analyzeBtn');
  
  appCount.textContent = `${apps.length} 個のアプリケーションが見つかりました`;
  
  if (apps.length === 0) {
    appsGrid.innerHTML = `
      <div class="loading-message">
        <p>アプリケーションが見つかりませんでした</p>
      </div>
    `;
    return;
  }

  // アプリアイコンとリストを表示（まずプレースホルダーで表示）
  const appItems = apps.map((app) => {
    return `
      <div class="app-item" data-app="${app.name}">
        <div class="app-icon-placeholder loading">
          <span>${app.name.charAt(0).toUpperCase()}</span>
        </div>
        <div class="app-name" title="${app.name}">${app.name}</div>
      </div>
    `;
  });

  appsGrid.innerHTML = appItems.join('');
  
  // バッチでアイコンを一括取得（高速化）
  const appNames = apps.map(app => app.name);
  
  try {
    const icons = await window.windowAPI.getAppIconsBatch(appNames);
    
    // 取得したアイコンを一括で更新
    for (const [appName, iconData] of Object.entries(icons)) {
      if (iconData) {
        const appItem = document.querySelector(`[data-app="${appName}"]`);
        if (appItem) {
          const iconPlaceholder = appItem.querySelector('.app-icon-placeholder');
          if (iconPlaceholder) {
            iconPlaceholder.outerHTML = `<img src="${iconData}" alt="${appName}" class="app-icon">`;
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to load icons batch:', error);
    
    // フォールバック: 個別に読み込む
    apps.forEach(async (app) => {
      try {
        const iconData = await window.windowAPI.getAppIcon(app.name);
        if (iconData) {
          const appItem = document.querySelector(`[data-app="${app.name}"]`);
          if (appItem) {
            const iconPlaceholder = appItem.querySelector('.app-icon-placeholder');
            if (iconPlaceholder) {
              iconPlaceholder.outerHTML = `<img src="${iconData}" alt="${app.name}" class="app-icon">`;
            }
          }
        }
      } catch (error) {
        console.error(`Failed to load icon for ${app.name}:`, error);
      }
    });
  }
  
  // 分析ボタンを有効化
  analyzeBtn.disabled = false;
}

async function startAnalysis() {
  if (isAnalyzing || installedApps.length === 0) return;
  
  isAnalyzing = true;
  const analyzeBtn = document.getElementById('analyzeBtn');
  const progressContainer = document.getElementById('progressContainer');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = '分析中...';
  progressContainer.style.display = 'block';
  
  try {
    // アプリ名のリストを取得
    const appNames = installedApps.map(app => app.name);
    
    // 分析するアプリをバッチで処理
    const batchSize = 10;
    const totalBatches = Math.ceil(appNames.length / batchSize);
    let analyzedApps = [];
    
    // 時間推定用の変数
    let batchTimes = [];
    const startTime = Date.now();
    
    for (let i = 0; i < totalBatches; i++) {
      const batchStartTime = Date.now();
      const start = i * batchSize;
      const end = Math.min(start + batchSize, appNames.length);
      const batch = appNames.slice(start, end);
      
      // プログレスバー更新
      const progress = ((i + 1) / totalBatches) * 100;
      progressFill.style.width = `${progress}%`;
      
      // プログレステキストを更新
      progressText.textContent = `アプリケーションを分析中...`;
      
      // 詳細情報を更新
      const progressCount = document.getElementById('progressCount');
      const progressTime = document.getElementById('progressTime');
      
      progressCount.textContent = `${end} / ${appNames.length} アプリ`;
      
      // 残り時間を推定
      if (i > 0) {
        const avgBatchTime = batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length;
        const remainingBatches = totalBatches - i - 1;
        const estimatedRemainingTime = Math.ceil((avgBatchTime * remainingBatches) / 1000); // 秒単位
        
        if (estimatedRemainingTime > 0) {
          const minutes = Math.floor(estimatedRemainingTime / 60);
          const seconds = estimatedRemainingTime % 60;
          const timeText = minutes > 0 
            ? `残り約 ${minutes}分${seconds.toString().padStart(2, '0')}秒` 
            : `残り約 ${seconds}秒`;
          progressTime.textContent = timeText;
        } else {
          progressTime.textContent = 'まもなく完了';
        }
      } else {
        progressTime.textContent = '時間を計測中...';
      }
      
      // バッチを分析
      const results = await window.windowAPI.analyzeApps(batch);
      analyzedApps = analyzedApps.concat(results);
      
      // バッチ処理時間を記録
      const batchEndTime = Date.now();
      batchTimes.push(batchEndTime - batchStartTime);
      
      // 最新の5バッチの時間のみ保持（より正確な推定のため）
      if (batchTimes.length > 5) {
        batchTimes.shift();
      }
      
      // 少し待機して負荷を分散
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // 合計処理時間を表示
    const totalTime = Math.ceil((Date.now() - startTime) / 1000);
    const totalMinutes = Math.floor(totalTime / 60);
    const totalSeconds = totalTime % 60;
    const totalTimeText = totalMinutes > 0 
      ? `${totalMinutes}分${totalSeconds}秒` 
      : `${totalSeconds}秒`;
    
    // オンボーディング完了を記録
    await window.windowAPI.completeOnboarding(appNames);
    
    progressText.textContent = `分析完了！（処理時間: ${totalTimeText}）分析結果を表示しています...`;
    
    // 2秒後に分析結果画面に遷移
    setTimeout(() => {
      window.location.href = 'analysis.html';
    }, 2000);
    
  } catch (error) {
    console.error('Analysis failed:', error);
    progressText.textContent = '分析に失敗しました';
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = '分析を開始';
    isAnalyzing = false;
  }
}

// イベントリスナー設定
document.addEventListener('DOMContentLoaded', () => {
  loadInstalledApps();
  
  document.getElementById('analyzeBtn').addEventListener('click', startAnalysis);
});