/* ============================================================
   Aequum — Analysis Engine
   Plumb line calculation, landmark definitions, deviation logic
   Based on Kendall's postural alignment assessment
   ============================================================ */

const AequumAnalysis = (() => {

  // ── Landmark Definitions ─────────────────────────────
  // Sagittal plane (lateral view) landmarks
  const LANDMARKS = [
    { id: 'ankle_forward',      name: '外果前方', nameEn: 'Ankle Anterior', color: '#EF4444', isReference: true, order: 0 },
    { id: 'knee_forward',       name: '膝関節', nameEn: 'Knee Anterior', color: '#F59E0B', isReference: false, order: 1 },
    { id: 'greater_trochanter', name: '大転子', nameEn: 'Greater Trochanter', color: '#FCD34D', isReference: false, order: 2 },
    { id: 'acromion',          name: '肩峰', nameEn: 'Acromion', color: '#00C9A7', isReference: false, order: 3 },
    { id: 'earlobe',           name: '耳垂', nameEn: 'Earlobe', color: '#2C7BE5', isReference: false, order: 4 },
  ];

  // Deviation thresholds (cm)
  const THRESHOLDS = {
    ok:   2.0,   // ≤ 2cm  → Green (normal variation)
    warn: 5.0,   // ≤ 5cm  → Yellow (notable)
    // > 5cm → Red (significant deviation)
  };

  // ── Plumb Line Calculation ───────────────────────────
  // Kendall's plumb line: vertical line through slightly anterior
  // to the lateral malleolus, extending upward

  /**
   * Calculate plumb line X position from landmarks.
   * Reference point: ankle_forward
   */
  function getPlumbLineX(landmarks) {
    const ref = landmarks.find(l => l.id === 'ankle_forward');
    return ref ? ref.x : null;
  }

  /**
   * Calculate scale factor: how many cm per pixel
   * Uses client height and the distance from lateral malleolus to head vertex
   * @param {number} heightCm - Client's height in cm
   * @param {Array} landmarks - Placed landmarks
   * @returns {number|null} cm per pixel ratio, or null if insufficient data
   */
  function calculateScaleFactor(heightCm, landmarks) {
    if (!heightCm) return null;

    const ankle = landmarks.find(l => l.id === 'ankle_forward');
    const earlobe = landmarks.find(l => l.id === 'earlobe');

    if (!ankle || !earlobe) return null;

    // We no longer have head_vertex, so we estimate full height using earlobe to ankle
    // Earlobe to ankle is roughly 90% of total height
    const heightPx = Math.abs(ankle.y - earlobe.y) / 0.90;
    if (heightPx === 0) return null;

    return heightCm / heightPx;
  }

  /**
   * Calculate deviations of each landmark from the plumb line
   * Positive = anterior (forward), Negative = posterior (backward)
   * @param {Array} landmarks - Placed landmarks [{id, x, y, ...}]
   * @param {number} scaleFactor - cm per pixel
   * @returns {Array} Deviations [{landmarkId, landmarkName, deviationPx, deviationCm, status}]
   */
  function calculateDeviations(landmarks, scaleFactor) {
    const plumbX = getPlumbLineX(landmarks);
    if (plumbX === null) return [];

    return landmarks
      .filter(l => l.id !== 'ankle_forward') // Reference point has 0 deviation
      .map(l => {
        const deviationPx = l.x - plumbX;
        const deviationCm = scaleFactor ? deviationPx * scaleFactor : null;
        const absDevCm = deviationCm !== null ? Math.abs(deviationCm) : null;

        let status = 'unknown';
        if (absDevCm !== null) {
          if (absDevCm <= THRESHOLDS.ok) status = 'ok';
          else if (absDevCm <= THRESHOLDS.warn) status = 'warn';
          else status = 'alert';
        }

        const def = LANDMARKS.find(def => def.id === l.id);

        return {
          landmarkId: l.id,
          landmarkName: def ? def.name : l.id,
          deviationPx: Math.round(deviationPx * 10) / 10,
          deviationCm: deviationCm !== null ? Math.round(deviationCm * 10) / 10 : null,
          status,
        };
      })
      .sort((a, b) => {
        const orderA = LANDMARKS.findIndex(d => d.id === a.landmarkId);
        const orderB = LANDMARKS.findIndex(d => d.id === b.landmarkId);
        return orderA - orderB;
      });
  }

  // ── Angle Calculations (phase 2 preview) ─────────────
  /**
   * Calculate angle between three points (in degrees)
   * @param {{x,y}} p1 - First point
   * @param {{x,y}} vertex - Vertex point (angle measured here)
   * @param {{x,y}} p3 - Third point
   * @returns {number} Angle in degrees
   */
  function calculateAngle(p1, vertex, p3) {
    const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
    const v2 = { x: p3.x - vertex.x, y: p3.y - vertex.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const cross = v1.x * v2.y - v1.y * v2.x;
    const angle = Math.atan2(Math.abs(cross), dot);
    return angle * (180 / Math.PI);
  }

  /**
   * Calculate Craniovertebral Angle (CVA)
   * Angle between C7→Ear Tragus line and horizontal
   * Lower angle = greater forward head posture
   * Normal range: ~50° (ideal ~55°)
   */
  function calculateCVA(landmarks) {
    const c7 = landmarks.find(l => l.id === 'c7_spinous');
    const tragus = landmarks.find(l => l.id === 'ear_tragus');
    if (!c7 || !tragus) return null;

    const dx = tragus.x - c7.x;
    const dy = c7.y - tragus.y; // inverted Y for screen coords
    const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
    return Math.round(angleDeg * 10) / 10;
  }

  // ── Drawing Utilities ────────────────────────────────

  /**
   * Draw plumb line on canvas context
   */
  function drawPlumbLine(ctx, plumbX, canvasHeight, options = {}) {
    const { color = '#6C63FF', lineWidth = 2, dashPattern = [8, 4] } = options;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dashPattern);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(plumbX, 0);
    ctx.lineTo(plumbX, canvasHeight);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draw a single landmark point on canvas
   */
  function drawLandmark(ctx, landmark, options = {}) {
    const { radius = 8, showLabel = true, selected = false } = options;
    const def = LANDMARKS.find(d => d.id === landmark.id);
    const color = def ? def.color : '#ffffff';

    ctx.save();

    // Outer glow
    if (selected) {
      ctx.beginPath();
      ctx.arc(landmark.x, landmark.y, radius + 6, 0, Math.PI * 2);
      ctx.fillStyle = color + '30';
      ctx.fill();
    }

    // Outer ring
    ctx.beginPath();
    ctx.arc(landmark.x, landmark.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner fill
    ctx.beginPath();
    ctx.arc(landmark.x, landmark.y, radius - 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.8;
    ctx.fill();

    // Label
    if (showLabel && def) {
      ctx.globalAlpha = 1;
      ctx.font = '11px Inter, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';

      // Background for label
      const text = def.name;
      const metrics = ctx.measureText(text);
      const labelX = landmark.x + radius + 6;
      const labelY = landmark.y + 4;

      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.roundRect(labelX - 4, labelY - 12, metrics.width + 8, 16, 3);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, labelX, labelY);
    }

    ctx.restore();
  }

  /**
   * Draw deviation line (horizontal distance from landmark to plumb line)
   */
  function drawDeviationLine(ctx, landmark, plumbX, deviation) {
    const color = deviation.status === 'ok' ? '#00D9A6' :
                  deviation.status === 'warn' ? '#FFD93D' : '#FF6B6B';

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.globalAlpha = 0.6;

    ctx.beginPath();
    ctx.moveTo(plumbX, landmark.y);
    ctx.lineTo(landmark.x, landmark.y);
    ctx.stroke();

    // Deviation value label
    if (deviation.deviationCm !== null) {
      const midX = (plumbX + landmark.x) / 2;
      const text = `${deviation.deviationCm > 0 ? '+' : ''}${deviation.deviationCm}cm`;

      ctx.globalAlpha = 1;
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';

      const metrics = ctx.measureText(text);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.roundRect(midX - metrics.width / 2 - 4, landmark.y - 20, metrics.width + 8, 16, 3);
      ctx.fill();

      ctx.fillStyle = color;
      ctx.fillText(text, midX, landmark.y - 8);
    }

    ctx.restore();
  }

  /**
   * Draw grid overlay on canvas
   */
  function drawGrid(ctx, width, height, options = {}) {
    const { spacing = 40, color = 'rgba(108, 99, 255, 0.12)', lineWidth = 0.5 } = options;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;

    // Vertical lines
    for (let x = spacing; x < width; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Horizontal lines
    for (let y = spacing; y < height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ── Trend Data ───────────────────────────────────────

  /**
   * Extract trend data for a specific landmark across sessions
   * @param {Array} sessions - Array of session objects
   * @param {string} landmarkId - Landmark to track
   * @returns {Array} [{date, deviationCm}]
   */
  function getTrendData(sessions, landmarkId) {
    return sessions
      .filter(s => s.deviations && s.deviations.length > 0)
      .map(s => {
        const dev = s.deviations.find(d => d.landmarkId === landmarkId);
        return {
          date: s.capturedAt,
          deviationCm: dev ? dev.deviationCm : null,
          sessionId: s.id,
        };
      })
      .filter(d => d.deviationCm !== null)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Draw trend chart on canvas
   */
  function drawTrendChart(ctx, width, height, data, options = {}) {
    const { padding = 40, lineColor = '#6C63FF', pointColor = '#00D9A6' } = options;

    if (!data || data.length === 0) {
      ctx.fillStyle = '#94A3B8';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('データがありません', width / 2, height / 2);
      return;
    }

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Chart area
    const chartLeft = padding + 20;
    const chartRight = width - padding;
    const chartTop = padding;
    const chartBottom = height - padding - 10;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;

    // Data range
    const values = data.map(d => d.deviationCm);
    const maxVal = Math.max(...values.map(Math.abs), THRESHOLDS.ok);
    const yRange = maxVal * 1.2;

    // Axes
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;

    // Y axis
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartTop);
    ctx.lineTo(chartLeft, chartBottom);
    ctx.stroke();

    // X axis (zero line)
    const zeroY = chartTop + chartHeight / 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.beginPath();
    ctx.moveTo(chartLeft, zeroY);
    ctx.lineTo(chartRight, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Threshold zones
    const okTopY = zeroY - (THRESHOLDS.ok / yRange) * (chartHeight / 2);
    const okBottomY = zeroY + (THRESHOLDS.ok / yRange) * (chartHeight / 2);

    ctx.fillStyle = 'rgba(0, 217, 166, 0.05)';
    ctx.fillRect(chartLeft, okTopY, chartWidth, okBottomY - okTopY);

    // Labels
    ctx.fillStyle = '#6A6A8E';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`+${yRange.toFixed(1)}cm`, chartLeft - 4, chartTop + 4);
    ctx.fillText('0cm', chartLeft - 4, zeroY + 4);
    ctx.fillText(`-${yRange.toFixed(1)}cm`, chartLeft - 4, chartBottom + 4);

    ctx.textAlign = 'center';
    ctx.fillText('前方(+)', chartLeft + chartWidth / 2, chartTop - 8);

    // Date labels
    data.forEach((d, i) => {
      const x = chartLeft + (i / Math.max(data.length - 1, 1)) * chartWidth;
      const dateStr = new Date(d.date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
      ctx.fillStyle = '#94A3B8';
      ctx.font = '9px Inter, sans-serif';
      ctx.fillText(dateStr, x, chartBottom + 16);
    });

    // Line
    ctx.beginPath();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';

    data.forEach((d, i) => {
      const x = chartLeft + (i / Math.max(data.length - 1, 1)) * chartWidth;
      const y = zeroY - (d.deviationCm / yRange) * (chartHeight / 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Gradient fill under line
    const gradient = ctx.createLinearGradient(0, chartTop, 0, chartBottom);
    gradient.addColorStop(0, 'rgba(108, 99, 255, 0.15)');
    gradient.addColorStop(0.5, 'rgba(108, 99, 255, 0.02)');
    gradient.addColorStop(1, 'rgba(108, 99, 255, 0.15)');

    ctx.beginPath();
    data.forEach((d, i) => {
      const x = chartLeft + (i / Math.max(data.length - 1, 1)) * chartWidth;
      const y = zeroY - (d.deviationCm / yRange) * (chartHeight / 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    const lastX = chartLeft + ((data.length - 1) / Math.max(data.length - 1, 1)) * chartWidth;
    ctx.lineTo(lastX, zeroY);
    ctx.lineTo(chartLeft, zeroY);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Points
    data.forEach((d, i) => {
      const x = chartLeft + (i / Math.max(data.length - 1, 1)) * chartWidth;
      const y = zeroY - (d.deviationCm / yRange) * (chartHeight / 2);

      // Determine color by status
      const absVal = Math.abs(d.deviationCm);
      const color = absVal <= THRESHOLDS.ok ? '#00D9A6' :
                    absVal <= THRESHOLDS.warn ? '#FFD93D' : '#FF6B6B';

      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#F0F2F5';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  // ── PDF Report Generation ────────────────────────────

  /**
   * Generate HTML content for PDF report
   */
  function generateReportHTML(client, session, deviations, imageDataUrl = null) {
    const date = new Date(session.capturedAt).toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    const tableRows = deviations.map(d => {
      const bgColor = d.status === 'ok' ? 'rgba(0,217,166,0.1)' :
                      d.status === 'warn' ? 'rgba(255,217,61,0.1)' :
                      'rgba(255,107,107,0.1)';
      const textColor = d.status === 'ok' ? '#00D9A6' :
                        d.status === 'warn' ? '#FFD93D' : '#FF6B6B';
      const sign = d.deviationCm > 0 ? '+' : '';
      return `
        <tr>
          <td>${d.landmarkName}</td>
          <td style="background:${bgColor}; color:${textColor}; font-weight:600; text-align:center;">
            ${d.deviationCm !== null ? `${sign}${d.deviationCm} cm` : '—'}
          </td>
          <td style="text-align:center; color:${textColor};">
            ${d.status === 'ok' ? '○ 許容範囲' : d.status === 'warn' ? '△ 要注意' : '× 逸脱あり'}
          </td>
        </tr>`;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: 'Noto Sans JP', 'Hiragino Sans', sans-serif;
            color: #1a1a2e;
            padding: 32px;
            font-size: 12px;
            line-height: 1.6;
          }
          .header {
            text-align: center;
            border-bottom: 3px solid #6C63FF;
            padding-bottom: 16px;
            margin-bottom: 24px;
          }
          .header h1 {
            font-size: 24px;
            color: #6C63FF;
            margin: 0;
          }
          .header .subtitle {
            color: #666;
            font-size: 11px;
            margin-top: 4px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-bottom: 24px;
            font-size: 11px;
          }
          .info-grid .label { color: #888; }
          .info-grid .value { font-weight: 600; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
          }
          th {
            background: #f0f0f8;
            padding: 8px 12px;
            text-align: left;
            font-size: 11px;
            font-weight: 600;
            border-bottom: 2px solid #ddd;
          }
          td {
            padding: 8px 12px;
            border-bottom: 1px solid #eee;
          }
          .disclaimer {
            background: #fffef0;
            border: 1px solid #ffe0a0;
            border-radius: 8px;
            padding: 12px 16px;
            font-size: 10px;
            color: #8a7000;
            line-height: 1.5;
          }
          .footer {
            text-align: center;
            margin-top: 32px;
            font-size: 10px;
            color: #aaa;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Aequum</h1>
          <div class="subtitle">姿勢アライメント評価レポート</div>
        </div>
        <div class="info-grid">
          <div><span class="label">氏名：</span><span class="value">${client.name}</span></div>
          <div><span class="label">評価日：</span><span class="value">${date}</span></div>
          <div><span class="label">身長：</span><span class="value">${client.heightCm ? client.heightCm + ' cm' : '未登録'}</span></div>
          <div><span class="label">主訴：</span><span class="value">${client.chiefComplaint || '—'}</span></div>
        </div>

        <h3 style="font-size:14px; margin-bottom:12px;">評価結果（矢状面）</h3>
        <table>
          <thead>
            <tr><th>ランドマーク</th><th style="text-align:center;">ズレ量</th><th style="text-align:center;">判定</th></tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>

        <div class="disclaimer">
          <strong>⚠ 注意事項：</strong>
          理想的なアライメントからの逸脱が即座に障害の原因であるとは限りません。
          痛みのない非対称性（Asymmetry）は、多くの場合、正常な身体の適応です。
          本レポートの数値は、あくまで介入の効果測定や経過観察のための参考情報として
          ご活用ください。
        </div>

        <div class="footer">
          Aequum — Professional Posture Assessment &copy; ${new Date().getFullYear()}
        </div>
      </body>
      </html>
    `;
  }

  // ── Public API ───────────────────────────────────────
  return {
    LANDMARKS,
    THRESHOLDS,
    getPlumbLineX,
    calculateScaleFactor,
    calculateDeviations,
    calculateAngle,
    calculateCVA,
    drawPlumbLine,
    drawLandmark,
    drawDeviationLine,
    drawGrid,
    getTrendData,
    drawTrendChart,
    generateReportHTML,
  };
})();
