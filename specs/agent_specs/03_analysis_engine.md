---
role: "Analysis Engine Agent — 姿勢解析ロジック、ランドマーク定義、偏差計算、Canvas描画、レポート生成"
capabilities: [generate_code]
context_dependencies: [master_plan.md, 04_data_layer.md]
---

# 03: Analysis Engine Agent 仕様書

## 担当ファイル
- [analysis.js](file:///c:/Users/n0k7i/OneDrive/デスクトップ/Axis/analysis.js) — 1122行

## 責務範囲

### ファイル概要
`AequumAnalysis` は IIFE モジュールとして、姿勢解析に関する全ロジックを提供する。Kendall法に基づくプラムライン評価を中核に、Canvas描画ユーティリティとレポート生成を含む。

### コードセクションマップ

| 行範囲 | セクション | 内容 |
|--------|-----------|------|
| L1-56 | ランドマーク定義 & 閾値 | `SAGITTAL_LANDMARKS`, `SEATED_SAGITTAL_LANDMARKS`, `POSTERIOR_LANDMARKS`, `THRESHOLDS` |
| L58-171 | プラムライン & 偏差計算 | `getPlumbLineX()`, `calculateScaleFactor()`, `calculateDeviations()` |
| L173-247 | 角度計算 | `calculateAngle()`, `calculateCVA()`, `calculateTilt()`, `getKneeAngles()` |
| L249-430 | Canvas描画ユーティリティ | `drawPlumbLine()`, `drawLandmark()`, `drawDeviationLine()`, `drawGrid()` |
| L432-584 | トレンドデータ & グラフ | `getTrendData()`, `drawTrendChart()` |
| L586-721 | 単一セッションレポート | `generateReportHTML()` |
| L723-1094 | 総合レポート & レーダーチャート | `generateCombinedReportHTML()`, `drawRadarChart()` |
| L1096-1121 | Public API エクスポート | `return { ... }` |

---

## ランドマーク定義

### 矢状面（立位側面） `SAGITTAL_LANDMARKS`

| id | 名前 | 色 | 基準点 | order |
|----|------|-----|-------|-------|
| `ankle_forward` | 外果前方 | #EF4444 | ✅ (plumb基準) | 0 |
| `knee_forward` | 膝関節 | #F59E0B | ✗ | 1 |
| `greater_trochanter` | 大転子 | #FCD34D | ✗ | 2 |
| `acromion` | 肩峰 | #00C9A7 | ✗ | 3 |
| `earlobe` | 耳垂 | #2C7BE5 | ✗ | 4 |

### 矢状面（座位） `SEATED_SAGITTAL_LANDMARKS`

| id | 名前 | 色 | 基準点 | order |
|----|------|-----|-------|-------|
| `greater_trochanter` | 大転子 | #EF4444 | ✅ (plumb基準) | 0 |
| `acromion` | 肩峰 | #00C9A7 | ✗ | 1 |
| `earlobe` | 耳垂 | #2C7BE5 | ✗ | 2 |

### 前額面（背面） `POSTERIOR_LANDMARKS`

| id | 名前 | 色 | 基準点 | order |
|----|------|-----|-------|-------|
| `base_center` | 足部中心 | #EF4444 | ✅ (plumb基準) | 0 |
| `heel_left` / `heel_right` | 左/右踵 | #A78BFA | ✗ | 1-2 |
| `popliteal_left` / `popliteal_right` | 左/右膝窩 | #F59E0B | ✗ | 3-4 |
| `psis_left` / `psis_right` | 左/右PSIS | #FCD34D | ✗ | 5-6 |
| `acromion_left` / `acromion_right` | 左/右肩峰 | #00C9A7 | ✗ | 7-8 |
| `earlobe_left` / `earlobe_right` | 左/右耳垂 | #2C7BE5 | ✗ | 9-10 |

### 偏差閾値 `THRESHOLDS`

```javascript
{
  ok:   2.0,   // ≤ 2cm  → Green (正常変動)
  warn: 5.0,   // ≤ 5cm  → Yellow (要注意)
  // > 5cm → Red (有意な逸脱)
}
```

---

## 主要関数のインターフェース

### プラムライン計算

```javascript
getPlumbLineX(landmarks: Array, viewType?: string): number | null
// viewType: 'sagittal' | 'posterior' | 'seated_sagittal'
// 基準ランドマークのX座標を返す
// posterior: base_center (なければ heel_left + heel_right の中点)
// seated_sagittal: greater_trochanter
// sagittal: ankle_forward
```

### スケールファクター計算

```javascript
calculateScaleFactor(heightCm: number, landmarks: Array, viewType?: string): number | null
// 身長(cm) とランドマーク間のピクセル距離から cm/px 比率を算出
// sagittal: ankle→earlobe 間 / 0.90 ≈ 全身高
// seated:   trochanter→earlobe 間 / 0.42 ≈ 全身高
// posterior: heel→earlobe 間 / 0.90 ≈ 全身高
```

### 偏差計算

```javascript
calculateDeviations(
  landmarks: Array,
  scaleFactor: number,
  facingDirection?: number,  // 1 or -1
  viewType?: string
): Array<{landmarkId, landmarkName, deviationPx, deviationCm, status}>
// 各ランドマークのプラムラインからの水平偏差を算出
// 正 = 前方(anterior) / 負 = 後方(posterior)
// status: 'ok' | 'warn' | 'alert' | 'unknown'
```

### 角度計算

```javascript
calculateAngle(p1: {x,y}, vertex: {x,y}, p3: {x,y}): number
// 3点間の角度を度数で返す

calculateCVA(landmarks: Array): number | null
// Craniovertebral Angle (頭位前方角) — C7→耳珠と水平線の角度

calculateTilt(leftPoint: {x,y}, rightPoint: {x,y}): number | null
// 2点間の水平傾斜角度（肩・骨盤の左右差評価用）

getKneeAngles(landmarks: Array, viewType: string): object
// 膝角度の計算（矢状面 or 前額面）
```

### Canvas描画ユーティリティ

```javascript
drawPlumbLine(ctx, plumbX, canvasHeight, options?)
// options: { color='#6C63FF', lineWidth=2, dashPattern=[8,4] }

drawLandmark(ctx, landmark, options?)
// options: { radius=8, showLabel=true, selected=false, viewType, deviation }
// ラベル位置: posterior左右ランドマークは左側/右側に自動配置

drawDeviationLine(ctx, landmark, plumbX, deviation)
// ランドマーク → プラムラインへの水平破線

drawGrid(ctx, width, height, options?)
// options: { spacing=40, color, lineWidth=0.5 }

drawTrendChart(ctx, width, height, data, options?)
// 経時変化の折れ線グラフ。閾値ゾーン表示付き

drawRadarChart(ctx, width, height, data, labels)
// 5軸レーダーチャート（総合レポート用）
```

### レポート生成

```javascript
generateReportHTML(client, session, deviations, viewType?, imageDataUrl?): string
// 単一セッションのHTML形式レポート（PDF出力用）

generateCombinedReportHTML(client, sagittalSession, posteriorSession, dateStr): string
// 矢状面＋前額面の総合レポートHTML
// スコア計算（100点満点、alert: -4, warn: -2, 最低50点）
// 傾向判定（反り腰・猫背・巻き肩など）
// レーダーチャート（5軸: 頭部, 肩, 骨盤, 膝, 足部）
// → AequumDB.getImage() を内部で呼び出す（非同期）
```

---

## Public API（エクスポート一覧）

```javascript
return {
  // 定数
  LANDMARKS,                    // = SAGITTAL_LANDMARKS (後方互換)
  SAGITTAL_LANDMARKS,
  SEATED_SAGITTAL_LANDMARKS,
  POSTERIOR_LANDMARKS,
  THRESHOLDS,

  // ランドマーク取得
  getLandmarks,                 // (viewType) → ランドマーク定義配列

  // 計算
  getPlumbLineX,
  calculateScaleFactor,
  calculateDeviations,
  calculateAngle,
  calculateCVA,
  calculateTilt,
  getKneeAngles,

  // Canvas描画
  drawPlumbLine,
  drawLandmark,
  drawDeviationLine,
  drawGrid,
  drawTrendChart,
  drawRadarChart,

  // トレンド
  getTrendData,

  // レポート
  generateReportHTML,
  generateCombinedReportHTML,
};
```

## 既知の問題

> [!NOTE]
> - `generateCombinedReportHTML` 内で `AequumDB.getImage()` を直接呼び出している箇所があり、解析モジュールからデータ層への直接依存が存在する（将来的に画像データを引数で渡す設計へのリファクタリングを検討）

## タスクリスト

- [ ] 偏差計算ロジックの符号規約の統一確認（前方=正 の一貫性の担保）
- [ ] `generateCombinedReportHTML` の引数設計整理（DB依存の解消）
- [ ] トレンドチャートの表示改善（タップでセッション詳細へ遷移）
- [ ] 主要計算ロジック（`calculateDeviations`, `calculateScaleFactor`, `calculateAngle`）の単体テスト作成
