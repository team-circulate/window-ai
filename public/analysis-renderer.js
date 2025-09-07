let userProfile = null;
let optimalLayouts = null;
let workflows = null;
let appIcons = {};

async function loadAnalysisData() {
  try {
    // 統合分析データを取得
    const analysisData = await window.windowAPI.getUserAnalysis();
    
    userProfile = analysisData.profile;
    optimalLayouts = analysisData.layouts;
    workflows = analysisData.workflows;

    // アプリアイコンを一括取得
    await loadAppIcons();

    displayAnalysisResults();
  } catch (error) {
    console.error('Failed to load analysis data:', error);
    showErrorState();
  }
}

async function loadAppIcons() {
  try {
    // ワークフローで使用されているアプリ名を収集
    const appNamesSet = new Set();
    
    if (workflows && workflows.workflows) {
      workflows.workflows.forEach(workflow => {
        if (workflow.apps) {
          workflow.apps.forEach(app => {
            appNamesSet.add(app.appName);
          });
        }
      });
    }

    if (appNamesSet.size > 0) {
      const appNames = Array.from(appNamesSet);
      appIcons = await window.windowAPI.getAppIconsBatch(appNames);
    }
  } catch (error) {
    console.error('Failed to load app icons:', error);
  }
}

function displayAnalysisResults() {
  hideLoadingState();
  showAnalysisContent();

  if (userProfile) {
    displayUserProfile(userProfile);
  }

  if (workflows && workflows.workflows) {
    displayWorkflows(workflows.workflows);
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

function displayWorkflows(workflowList) {
  const workflowsContainer = document.getElementById('workflowsContainer');
  workflowsContainer.innerHTML = '';

  if (!workflowList || workflowList.length === 0) {
    workflowsContainer.innerHTML = '<p style="opacity: 0.7; text-align: center;">ワークフロー提案を生成できませんでした</p>';
    return;
  }

  const workflowGrid = document.createElement('div');
  workflowGrid.className = 'workflow-grid';

  workflowList.forEach(workflow => {
    const workflowCard = createWorkflowCard(workflow);
    workflowGrid.appendChild(workflowCard);
  });

  workflowsContainer.appendChild(workflowGrid);
}

function createWorkflowCard(workflow) {
  const card = document.createElement('div');
  card.className = 'workflow-card';

  // アプリリスト作成
  let appListHTML = '';
  if (workflow.apps && workflow.apps.length > 0) {
    appListHTML = workflow.apps.map(app => {
      const iconHTML = appIcons[app.appName] 
        ? `<img src="${appIcons[app.appName]}" alt="${app.appName}" class="app-icon-mini">`
        : `<div class="app-icon-mini-placeholder">${app.appName.charAt(0)}</div>`;
      
      return `
        <div class="app-item-workflow" title="${app.reasoning}">
          ${iconHTML}
          <span>${app.appName}</span>
          <span class="app-role">(${app.role})</span>
        </div>
      `;
    }).join('');
  }

  // コツ・ヒント作成
  let tipsHTML = '';
  if (workflow.tips && workflow.tips.length > 0) {
    tipsHTML = workflow.tips.map(tip => 
      `<div class="workflow-tip">${tip}</div>`
    ).join('');
  }

  card.innerHTML = `
    <div class="workflow-name">${workflow.name}</div>
    <div class="workflow-description">${workflow.description}</div>
    
    ${workflow.apps && workflow.apps.length > 0 ? `
    <div class="workflow-apps">
      <div class="workflow-apps-title">使用アプリ</div>
      <div class="app-list">
        ${appListHTML}
      </div>
    </div>
    ` : ''}
    
    ${workflow.tips && workflow.tips.length > 0 ? `
    <div class="workflow-tips">
      <div class="workflow-tips-title">
        <span class="material-icons" style="font-size: 14px;">tips_and_updates</span>
        実践のコツ
      </div>
      ${tipsHTML}
    </div>
    ` : ''}
  `;

  return card;
}

function displayOptimalLayouts(layouts) {
  const layoutsGrid = document.getElementById('layoutsGrid');
  layoutsGrid.innerHTML = '';

  layouts.forEach((layout, index) => {
    const layoutCard = createLayoutCard(layout, index);
    layoutsGrid.appendChild(layoutCard);
  });

  // 自動でプリセットとして保存
  saveLayoutsAsPresets(layouts);
}

async function saveLayoutsAsPresets(layouts) {
  try {
    console.log('🔄 Auto-saving generated layouts as presets...');
    
    for (let i = 0; i < layouts.length && i < 3; i++) {
      const layout = layouts[i];
      const presetName = `${layout.name} (オンボーディング)`;
      const presetDescription = `${layout.description}\n理由: ${layout.reasoning}`;
      
      // AIで生成されたレイアウト情報を直接プリセットとして保存
      await window.windowAPI.saveLayoutAsPreset(
        presetName, 
        presetDescription, 
        layout.preset.windows
      );
      console.log(`✅ Saved layout preset: ${presetName} with ${layout.preset.windows.length} windows`);
    }
    
    console.log('✅ All generated layouts saved as presets');
    
    // 保存完了メッセージを表示
    showPresetSavedNotification();
  } catch (error) {
    console.error('❌ Failed to save layouts as presets:', error);
  }
}

function showPresetSavedNotification() {
  // 一時的な通知を表示
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #4ECDC4 0%, #44A08D 100%);
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    z-index: 9999;
    transform: translateX(100%);
    transition: transform 0.3s ease;
  `;
  notification.innerHTML = '📋 3つの配置をプリセットとして保存しました！';
  
  document.body.appendChild(notification);
  
  // アニメーションで表示
  setTimeout(() => {
    notification.style.transform = 'translateX(0)';
  }, 100);
  
  // 3秒後に非表示
  setTimeout(() => {
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
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