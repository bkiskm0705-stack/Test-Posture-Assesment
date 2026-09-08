---
role: "UI/Design Agent — HTML構造とCSSデザインシステムの管理"
capabilities: [generate_code, browser, generate_image]
context_dependencies: [master_plan.md]
---

# 01: UI/Design Agent 仕様書

## 担当ファイル
- [index.html](file:///c:/Users/n0k7i/OneDrive/デスクトップ/Axis/index.html)
- [styles.css](file:///c:/Users/n0k7i/OneDrive/デスクトップ/Axis/styles.css)

## 責務範囲

### 1. HTML構造（index.html — 465行）

SPAのシェルを構成する全ページ・モーダル定義。各ページは `<section class="page">` で定義され、`active` クラスの付与で表示制御される。

#### ページ一覧

| セクションID | 行範囲 | 内容 |
|-------------|--------|------|
| `page-clients` | L49-77 | 患者一覧（検索バー、カードリスト、空状態、FAB） |
| `page-new-client` | L80-125 | 新規患者登録フォーム |
| `page-client-detail` | L128-174 | 患者詳細（プロフィール、タイムラインタブ、セッション一覧） |
| `page-capture` | L177-208 | 撮影画面（カメラプレビュー、グリッドオーバーレイ、水平器） |
| `page-analyze` | L211-270 | 解析画面（Canvas、ツールバー、免責事項バナー） |
| `page-compare` | L273-320 | 比較画面（並列/オニオンスキン/トレンドタブ） |
| `page-report` | L323-349 | レポート画面（PDF出力、共有ボタン） |

#### モーダル一覧

| モーダルID | 行範囲 | 内容 |
|-----------|--------|------|
| `modal-landmark` | L352-359 | ランドマーク選択ピッカー |
| `modal-posture-select` | L363-404 | 評価タイプ選択（立位/座位） |
| `modal-settings` | L407-428 | 設定（免責事項リンク、患者削除） |
| `modal-disclaimer` | L431-454 | 免責事項 |

#### 外部依存

```html
<!-- Google Fonts -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap">

<!-- MediaPipe Pose -->
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js"></script>
```

### 2. CSSデザインシステム（styles.css — 1589行）

#### カスタムプロパティ（デザイントークン）

```css
/* Primary palette */
--primary: #2C7BE5;
--accent: #00C9A7;
--gradient-main: linear-gradient(135deg, #2C7BE5, #00C9A7);

/* Surfaces */
--bg-deep: #F0F2F5;
--bg-base: #F5F7FA;
--bg-surface: #FFFFFF;

/* Typography */
--font-main: 'Inter', 'Noto Sans JP', -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', monospace;

/* Spacing */
--space-xs: 4px; --space-sm: 8px; --space-md: 16px;
--space-lg: 24px; --space-xl: 32px;

/* Borders & Shadows */
--border-subtle: rgba(0, 0, 0, 0.06);
--shadow-sm/md/lg/card/glow-primary/glow-accent
```

#### 主要CSSコンポーネント

| コンポーネント | 用途 | クラス名 |
|---------------|------|---------|
| Header | 固定ヘッダー | `#app-header` |
| Card | 患者カード | `.client-card` |
| Form | 入力フォーム | `.form-container`, `.form-group` |
| Button | ボタン群 | `.btn-primary`, `.btn-outline`, `.btn-accent`, `.fab` |
| Tab | タブバー | `.tab-bar`, `.tab` |
| Modal | モーダル | `.modal`, `.modal-overlay`, `.modal-content` |
| Toast | 通知 | `.toast` |
| Timeline | セッション一覧 | `.timeline` |
| Toolbar | 解析ツールバー | `.tool-btn` |
| Capture | カメラUI | `.capture-btn`, `.capture-ring`, `.level-indicator` |
| Compare | 比較ビュー | `.compare-view`, `.onion-section` |

#### デザイン原則
1. **ライトテーマ基調**: 白ベースに青(#2C7BE5) → 緑(#00C9A7) のグラデーションをアクセントに
2. **グラスモーフィズム**: ヘッダー等に `backdrop-filter: blur()` + 半透明背景
3. **マイクロアニメーション**: `transition` による滑らかな状態変化
4. **モバイルファースト**: `max-width`, `vh/vw` ベースのレスポンシブ
5. **医療UI規約**: 偏差ステータス色 (OK=#00C9A7, WARN=#F59E0B, ALERT=#EF4444)

## コーディング規約

- **DOM ID**: kebab-case (`page-clients`, `btn-save-analysis`)
- **CSSクラス**: kebab-case (`form-group`, `client-card`)
- **CSS変数**: `--` プレフィックス付き kebab-case
- **SVGアイコン**: インラインSVG（外部ファイル不使用）
- **セマンティックHTML**: `<section>`, `<header>`, `<form>`, `<label>` 使用
- **アクセシビリティ**: `aria-label` をインタラクティブ要素に付与

## タスクリスト

- [ ] HTML構造の把握とページID → CSSクラスのマッピング完了
- [ ] CSSカスタムプロパティ（デザイントークン）の全量リスト化
- [ ] レスポンシブブレークポイントの検証
- [ ] モーダルのアクセシビリティ改善（focus trap, ESCキー閉じ）
- [ ] CSS分割計画の策定（コンポーネント別ファイル化）
- [ ] 新規モーダル/ページ追加時のテンプレート定義
- [ ] ダークモード対応のCSS変数レイヤー設計
- [ ] SVGアイコンのスプライト化検討
- [ ] CSSアニメーションの一覧化と統一
