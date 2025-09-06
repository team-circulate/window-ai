let userProfile = null;
let optimalLayouts = null;

async function loadAnalysisData() {
  try {
    // 統合分析データを取得
    const analysisData = await window.windowAPI.getUserAnalysis();
    
    userProfile = analysisData.profile;
    optimalLayouts = analysisData.layouts;

    displayAnalysisResults();
  } catch (error) {
    console.error('Failed to load analysis data:', error);
    showErrorState();
  }
}

function displayAnalysisResults() {
  hideLoadingState();
  showAnalysisContent();

  if (userProfile) {
    displayUserProfile(userProfile);
  }

  if (optimalLayouts && optimalLayouts.layouts) {
    displayOptimalLayouts(optimalLayouts.layouts);
  }
}

function displayUserProfile(profile) {
  // ユーザータイプを表示
  const userTypeElement = document.getElementById('userType');
  userTypeElement.textContent = profile.userType || '分析中...';

  // 信頼度を表示
  const confidenceElement = document.getElementById('profileConfidence');
  const confidence = Math.round((profile.confidence || 0) * 100);
  confidenceElement.textContent = `信頼度: ${confidence}%`;

  // 特徴を表示
  const characteristicsGrid = document.getElementById('characteristicsGrid');
  characteristicsGrid.innerHTML = '';
  
  if (profile.characteristics && profile.characteristics.length > 0) {
    profile.characteristics.forEach(characteristic => {
      const card = document.createElement('div');
      card.className = 'characteristic-card';
      card.textContent = characteristic;
      characteristicsGrid.appendChild(card);
    });
  }

  // ワークスタイルを表示
  const workStyleElement = document.getElementById('workStyle');
  workStyleElement.textContent = profile.workStyle || 'バランス型のワークスタイル';

  // 推奨事項を表示
  const recommendationsList = document.getElementById('recommendationsList');
  recommendationsList.innerHTML = '';
  
  if (profile.recommendations && profile.recommendations.length > 0) {
    profile.recommendations.forEach(recommendation => {
      const listItem = document.createElement('li');
      listItem.innerHTML = `
        <span class="material-icons">tips_and_updates</span>
        <span>${recommendation}</span>
      `;
      recommendationsList.appendChild(listItem);
    });
  }
}

function displayOptimalLayouts(layouts) {
  const layoutsGrid = document.getElementById('layoutsGrid');
  layoutsGrid.innerHTML = '';

  layouts.forEach((layout, index) => {
    const layoutCard = createLayoutCard(layout, index);
    layoutsGrid.appendChild(layoutCard);
  });
}

function createLayoutCard(layout, index) {
  const card = document.createElement('div');
  card.className = 'layout-card';
  
  // プレビューを生成
  const preview = createLayoutPreview(layout.preset.windows);
  
  card.innerHTML = `
    <div class="layout-name">${layout.name}</div>
    <div class="layout-description">${layout.description}</div>
    <div class="layout-reasoning">"${layout.reasoning}"</div>
    <div class="layout-preview">
      ${preview}
    </div>
    <button class="apply-layout-btn" onclick="applyLayout(${index})">
      <span class="material-icons">play_arrow</span>
      この配置を適用
    </button>
  `;

  return card;
}

function createLayoutPreview(windows) {
  if (!windows || windows.length === 0) {
    return '<div style="display: flex; align-items: center; justify-content: center; height: 100%; opacity: 0.5;">プレビューなし</div>';
  }

  // プレビュー用に座標を正規化（120px高さのコンテナに合わせる）
  const maxWidth = 1440;
  const maxHeight = 900;
  const previewWidth = 280;  // カードの実際の幅
  const previewHeight = 120;
  
  const scaleX = previewWidth / maxWidth;
  const scaleY = previewHeight / maxHeight;

  let previewHTML = '';
  
  windows.forEach(window => {
    const x = Math.round(window.position.x * scaleX);
    const y = Math.round(window.position.y * scaleY);
    const width = Math.round(window.size.width * scaleX);
    const height = Math.round(window.size.height * scaleY);
    
    previewHTML += `
      <div class="window-preview" style="
        left: ${x}px;
        top: ${y}px;
        width: ${width}px;
        height: ${height}px;
      ">
        ${window.appName}
      </div>
    `;
  });

  return previewHTML;
}

async function applyLayout(layoutIndex) {
  if (!optimalLayouts || !optimalLayouts.layouts || !optimalLayouts.layouts[layoutIndex]) {
    console.error('Layout not found:', layoutIndex);
    return;
  }

  const layout = optimalLayouts.layouts[layoutIndex];
  const btn = event.target.closest('.apply-layout-btn');
  const originalText = btn.innerHTML;

  try {
    // ボタンの状態を変更
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons">hourglass_empty</span>適用中...';
    btn.style.background = 'rgba(255, 255, 255, 0.3)';

    // プリセットを保存
    const preset = await window.windowAPI.savePreset(
      layout.preset.name,
      layout.preset.description
    );

    if (preset) {
      // レイアウトを適用
      const success = await window.windowAPI.loadPreset(preset.id);
      
      if (success) {
        btn.innerHTML = '<span class="material-icons">check</span>適用完了！';
        btn.style.background = 'linear-gradient(135deg, #4ECDC4 0%, #44A08D 100%)';
        
        // 2秒後に元に戻す
        setTimeout(() => {
          btn.disabled = false;
          btn.innerHTML = originalText;
          btn.style.background = '';
        }, 2000);
      } else {
        throw new Error('レイアウトの適用に失敗しました');
      }
    } else {
      throw new Error('プリセットの保存に失敗しました');
    }
  } catch (error) {
    console.error('Failed to apply layout:', error);
    
    btn.innerHTML = '<span class="material-icons">error</span>適用に失敗';
    btn.style.background = 'rgba(244, 67, 54, 0.6)';
    
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = originalText;
      btn.style.background = '';
    }, 3000);
  }
}

function hideLoadingState() {
  const loadingState = document.getElementById('loadingState');
  loadingState.classList.remove('show');
}

function showAnalysisContent() {
  const analysisContent = document.getElementById('analysisContent');
  analysisContent.style.display = 'block';
}

function showErrorState() {
  hideLoadingState();
  const errorState = document.getElementById('errorState');
  errorState.classList.add('show');
}

function continueToMainApp() {
  window.location.href = 'index.html';
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  console.log('Analysis page loaded');
  
  // 少し遅延させて分析データを読み込み（UI表示のため）
  setTimeout(() => {
    loadAnalysisData();
  }, 1500);
});

// デバッグ用の関数
window.debugAnalysis = function() {
  // テストデータで表示をテスト
  const testProfile = {
    userType: "フルスタック開発者",
    characteristics: ["創造的思考", "技術志向", "効率重視", "マルチタスク得意"],
    workStyle: "複数のプロジェクトを並行して進める、集中と休憩のメリハリをつけたワークスタイル",
    recommendations: [
      "コード書きながらドキュメントも同時に開いておくと効率アップ",
      "Slackは通知を制限して集中時間を確保しましょう",
      "ターミナルとエディタを左右に配置すると作業しやすくなります"
    ],
    confidence: 0.85
  };

  const testLayouts = {
    layouts: [
      {
        name: "開発集中モード",
        description: "コーディングに最適化されたレイアウト",
        reasoning: "VSCodeを中心に、参考資料とターミナルを効率的に配置",
        preset: {
          name: "開発集中モード",
          description: "コーディング作業用",
          windows: [
            { appName: "VSCode", position: { x: 0, y: 0 }, size: { width: 960, height: 700 } },
            { appName: "Terminal", position: { x: 960, y: 500 }, size: { width: 480, height: 400 } },
            { appName: "Safari", position: { x: 960, y: 0 }, size: { width: 480, height: 500 } }
          ]
        }
      }
    ],
    confidence: 0.9
  };

  userProfile = testProfile;
  optimalLayouts = testLayouts;
  displayAnalysisResults();
};