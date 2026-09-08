---
role: "PWA/Infra Agent — Service Worker、オフライン対応、キャッシュ戦略、パフォーマンス最適化"
capabilities: [generate_code, browser]
context_dependencies: [master_plan.md, 01_ui_design.md]
---

# 05: PWA/Infra Agent 仕様書

## 担当ファイル
- [manifest.json](file:///c:/Users/n0k7i/OneDrive/デスクトップ/Axis/manifest.json) — 25行
- `sw.js` — **未実装（新規作成対象）**
- `assets/` ディレクトリ — アイコン等

## 責務範囲

PWAとしてのインフラ層全体を管轄。オフライン対応、キャッシュ戦略、インストール体験、パフォーマンス最適化を担当。

---

## 現状分析

### manifest.json（既存）

```json
{
  "name": "Aequum",
  "short_name": "Aequum",
  "description": "プロフェッショナル向け姿勢評価アプリケーション",
  "start_url": "./index.html",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#0D0D1A",
  "background_color": "#0D0D1A",
  "categories": ["medical", "health", "fitness"],
  "lang": "ja",
  "icons": [
    { "src": "assets/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "assets/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

> [!WARNING]
> ### 問題点
> 1. **`theme_color` / `background_color` が `#0D0D1A`（ダーク）** — 実際のアプリはライトテーマ(`#F0F2F5`)
> 2. **Service Worker 未登録** — `index.html` に `navigator.serviceWorker.register()` の呼び出しなし
> 3. **`sw.js` 未作成** — オフラインキャッシュなし
> 4. **アイコン2サイズのみ** — Apple用, maskable, favicon 等が不足

---

## PWA 改善計画

### Phase 1: 基盤整備

#### 1.1 manifest.json 修正

```json
{
  "name": "Aequum — 姿勢評価アプリ",
  "short_name": "Aequum",
  "description": "プロフェッショナル向け姿勢評価アプリケーション。スマホ1台で姿勢アライメントを定量的に評価・追跡。",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#F0F2F5",
  "background_color": "#F0F2F5",
  "categories": ["medical", "health", "fitness"],
  "lang": "ja",
  "icons": [
    { "src": "assets/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "assets/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "assets/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

#### 1.2 Service Worker 作成 (`sw.js`)

```javascript
// キャッシュ戦略: App Shell モデル
const CACHE_NAME = 'aequum-v1';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './analysis.js',
  './db.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
];

// install: App Shell をプリキャッシュ
// activate: 古いキャッシュを削除
// fetch: Cache First (App Shell), Network First (CDN/API)
```

#### 1.3 index.html への Service Worker 登録

```html
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.error('SW registration failed:', err));
  }
</script>
```

### Phase 2: オフライン体験

#### キャッシュ戦略

| リソース種別 | 戦略 | 理由 |
|-------------|------|------|
| App Shell (HTML/CSS/JS) | Cache First | 静的ファイル、変更時にキャッシュ名バージョンアップ |
| Google Fonts | Stale While Revalidate | フォントは更新頻度低 |
| MediaPipe CDN | Network First + Fallback | 大きいファイル、オフラインではキャッシュ利用 |
| IndexedDB データ | — | Service Worker不関与（直接アクセス） |

#### オフライン表示

```javascript
// fetch イベントで NetworkError をキャッチした場合:
// - App Shell は常にキャッシュから提供可能
// - MediaPipeがオフラインの場合、自動検出は無効化して手動ランドマーク配置を案内
```

### Phase 3: パフォーマンス最適化

#### 計測対象メトリクス
- **FCP (First Contentful Paint)**: 目標 < 1.5s
- **LCP (Largest Contentful Paint)**: 目標 < 2.5s
- **CLS (Cumulative Layout Shift)**: 目標 < 0.1
- **TTI (Time to Interactive)**: 目標 < 3.5s

#### 最適化戦略

1. **MediaPipe の遅延読み込み**
   - 現在: `<head>` で同期読み込み → FCP を阻害
   - 改善: `defer` 属性追加 or 撮影画面遷移時に動的 import

2. **CSS Critical Path**
   - ファーストビュー（患者一覧）に必要なCSSのみインライン化
   - 残りは `<link rel="preload">` + `onload` で非同期読み込み

3. **画像最適化**
   - キャプチャ画像の JPEG 品質調整（現在 0.92 → 場面に応じて可変）
   - WebP 対応検討

---

## アイコン & アセット管理

### 必要なアイコン一覧

| ファイル名 | サイズ | 用途 |
|-----------|--------|------|
| `icon-192.png` | 192×192 | Android ホーム画面 |
| `icon-512.png` | 512×512 | Android スプラッシュ |
| `icon-512-maskable.png` | 512×512 | Android Adaptive Icon |
| `apple-touch-icon.png` | 180×180 | iOS ホーム画面 |
| `favicon.ico` | 32×32 | ブラウザタブ |

### 現在のアセット状況

```
assets/
├── icon-192.png    # ✅ 存在
└── icon-512.png    # ✅ 存在
```

> [!IMPORTANT]
> `icon-512-maskable.png`, `apple-touch-icon.png`, `favicon.ico` は未作成。
> 既存アイコンをベースに各サイズを生成する必要あり。

---

## セキュリティ考慮事項

1. **CSP (Content Security Policy)**: 現在未設定。MediaPipe CDN を許可しつつ、他の外部スクリプトを制限
2. **HTTPS**: PWA は HTTPS 必須（localhost は例外）
3. **患者データ**: IndexedDB 内の医療データ。デバイスレベルの暗号化に依存
4. **カメラ権限**: `getUserMedia` はセキュアオリジン（HTTPS）必須

---

## 開発環境

### ローカルサーバー起動方法
```bash
# Python
python -m http.server 8000

# Node.js
npx serve .

# VS Code Live Server 拡張機能
# → 右クリック → Open with Live Server
```

> [!TIP]
> Service Worker のテストには HTTPS か `localhost` が必要。
> `chrome://flags/#unsafely-treat-insecure-origin-as-secure` で開発サーバーを許可可能。

---

## タスクリスト

- [ ] manifest.json の `theme_color` / `background_color` を `#F0F2F5` に修正
- [ ] `scope` フィールドを `"./"` に追加
- [ ] `sw.js` の新規作成（App Shell キャッシュ戦略）
- [ ] index.html に Service Worker 登録コードを追加
- [ ] MediaPipe の `<script>` タグに `defer` を追加
- [ ] maskable アイコン (512x512) の作成
- [ ] apple-touch-icon (180x180) の作成
- [ ] favicon.ico (32x32) の作成
- [ ] CSP メタタグの追加
- [ ] オフライン時のフォールバックUI実装
- [ ] Lighthouse 監査の実行と結果記録
- [ ] キャッシュバージョン管理の自動化検討
- [ ] `window.onerror` の `alert()` を除去し、適切なエラーログへ変更
- [ ] Web Vitals メトリクスの計測セットアップ
