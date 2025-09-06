# Window AI Manager

AIでウィンドウを操作するmacOSアプリケーション。Claude APIを使用して、自然言語でウィンドウ配置を最適化します。

## 機能

- 🤖 自然言語でウィンドウ操作を指示
- 🪟 ウィンドウの移動、リサイズ、整列を自動化
- 📐 タイル、グリッド、カスケード配置に対応
- 🎯 特定アプリケーションへのフォーカス切り替え
- 💡 AIによる最適レイアウト提案

## セットアップ

1. 依存関係のインストール
```bash
npm install
```

2. Claude API キーの設定
```bash
cp .env.example .env
# .envファイルを編集してAPIキーを設定
```

3. ビルド
```bash
npm run build
```

4. 起動
```bash
npm start
```

## 開発

```bash
npm run dev
```

## 必要な権限

初回起動時に以下の権限が必要です：
- Screen Recording（画面収録）- ウィンドウ情報の取得に必要
- Accessibility（アクセシビリティ）- ウィンドウ操作に必要

## 使用例

- "Safariを左側、VSCodeを右側に配置して"
- "すべてのウィンドウをグリッド表示"
- "作業用レイアウトにして"
- "メインウィンドウを中央に配置"

## 技術スタック

- Electron
- TypeScript
- Claude API (Anthropic)
- JXA (JavaScript for Automation)

## ライセンス

ISC