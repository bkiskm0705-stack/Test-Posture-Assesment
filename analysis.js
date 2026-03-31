/* ============================================================
   Aequum — Analysis Engine
   Plumb line calculation, landmark definitions, deviation logic
   Based on Kendall's postural alignment assessment
   ============================================================ */

const AequumAnalysis = (() => {

  // ── Landmark Definitions ─────────────────────────────
  // Sagittal plane (lateral view) landmarks
  const SAGITTAL_LANDMARKS = [
    { id: 'ankle_forward',      name: '外果前方', nameEn: 'Ankle Anterior', color: '#EF4444', isReference: true, order: 0 },
    { id: 'knee_forward',       name: '膝関節', nameEn: 'Knee Anterior', color: '#F59E0B', isReference: false, order: 1 },
    { id: 'greater_trochanter', name: '大転子', nameEn: 'Greater Trochanter', color: '#FCD34D', isReference: false, order: 2 },
    { id: 'acromion',          name: '肩峰', nameEn: 'Acromion', color: '#00C9A7', isReference: false, order: 3 },
    { id: 'earlobe',           name: '耳垂', nameEn: 'Earlobe', color: '#2C7BE5', isReference: false, order: 4 },
  ];

  // Frontal plane (posterior view) landmarks
  const POSTERIOR_LANDMARKS = [
    { id: 'base_center',        name: '足部中心', nameEn: 'Base Center', color: '#EF4444', isReference: true, order: 0 },
    { id: 'heel_left',          name: '左踵', nameEn: 'Left Heel', color: '#A78BFA', isReference: false, order: 1 },
    { id: 'heel_right',         name: '右踵', nameEn: 'Right Heel', color: '#A78BFA', isReference: false, order: 2 },
    { id: 'popliteal_left',     name: '左膝窩', nameEn: 'Left Popliteal', color: '#F59E0B', isReference: false, order: 3 },
    { id: 'popliteal_right',    name: '右膝窩', nameEn: 'Right Popliteal', color: '#F59E0B', isReference: false, order: 4 },
    { id: 'psis_left',          name: '左PSIS', nameEn: 'Left PSIS', color: '#FCD34D', isReference: false, order: 5 },
    { id: 'psis_right',         name: '右PSIS', nameEn: 'Right PSIS', color: '#FCD34D', isReference: false, order: 6 },
    { id: 'acromion_left',      name: '左肩峰', nameEn: 'Left Acromion', color: '#00C9A7', isReference: false, order: 7 },
    { id: 'acromion_right',     name: '右肩峰', nameEn: 'Right Acromion', color: '#00C9A7', isReference: false, order: 8 },
    { id: 'earlobe_left',       name: '左耳垂', nameEn: 'Left Earlobe', color: '#2C7BE5', isReference: false, order: 9 },
    { id: 'earlobe_right',      name: '右耳垂', nameEn: 'Right Earlobe', color: '#2C7BE5', isReference: false, order: 10 },
  ];

  function getLandmarks(viewType) {
    return viewType === 'posterior' ? POSTERIOR_LANDMARKS : SAGITTAL_LANDMARKS;
  }

  // Backward compatibility alias
  const LANDMARKS = SAGITTAL_LANDMARKS;

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
  function getPlumbLineX(landmarks, viewType = 'sagittal') {
    if (viewType === 'posterior') {
      const ref = landmarks.find(l => l.id === 'base_center');
      if (ref) return ref.x;
      const left = landmarks.find(l => l.id === 'heel_left');
      const right = landmarks.find(l => l.id === 'heel_right');
      return (left && right) ? (left.x + right.x) / 2 : null;
    } else {
      const ref = landmarks.find(l => l.id === 'ankle_forward');
      return ref ? ref.x : null;
    }
  }

  /**
   * Calculate scale factor: how many cm per pixel
   * Uses client height and the distance from lateral malleolus to head vertex
   * @param {number} heightCm - Client's height in cm
   * @param {Array} landmarks - Placed landmarks
   * @returns {number|null} cm per pixel ratio, or null if insufficient data
   */
  function calculateScaleFactor(heightCm, landmarks, viewType = 'sagittal') {
    if (!heightCm) return null;

    let bottomY, topY;

    if (viewType === 'posterior') {
      const heels = landmarks.filter(l => l.id === 'heel_left' || l.id === 'heel_right');
      const earlobes = landmarks.filter(l => l.id === 'earlobe_left' || l.id === 'earlobe_right');
      if (heels.length === 0 || earlobes.length === 0) return null;
      bottomY = heels.reduce((acc, l) => acc + l.y, 0) / heels.length;
      topY = earlobes.reduce((acc, l) => acc + l.y, 0) / earlobes.length;
    } else {
      const ankle = landmarks.find(l => l.id === 'ankle_forward');
      const earlobe = landmarks.find(l => l.id === 'earlobe');
      if (!ankle || !earlobe) return null;
      bottomY = ankle.y;
      topY = earlobe.y;
    }

    const heightPx = Math.abs(bottomY - topY) / 0.90;
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
  function calculateDeviations(landmarks, scaleFactor, facingDirection = 1, viewType = 'sagittal') {
    const plumbX = getPlumbLineX(landmarks, viewType);
    if (plumbX === null) return [];

    const defs = getLandmarks(viewType);

    return landmarks
      .filter(l => l.id !== 'ankle_forward' && l.id !== 'base_center') // Reference points have 0 deviation
      .map(l => {
        const deviationPx = viewType === 'posterior' ? (l.x - plumbX) : (l.x - plumbX) * facingDirection;
        const deviationCm = scaleFactor ? deviationPx * scaleFactor : null;
        const absDevCm = deviationCm !== null ? Math.abs(deviationCm) : null;

        let status = 'unknown';
        if (absDevCm !== null) {
          if (absDevCm <= THRESHOLDS.ok) status = 'ok';
          else if (absDevCm <= THRESHOLDS.warn) status = 'warn';
          else status = 'alert';
        }

        const def = defs.find(def => def.id === l.id);

        return {
          landmarkId: l.id,
          landmarkName: def ? def.name : l.id,
          deviationPx: Math.round(deviationPx * 10) / 10,
          deviationCm: deviationCm !== null ? Math.round(deviationCm * 10) / 10 : null,
          status,
        };
      })
      .sort((a, b) => {
        const orderA = defs.findIndex(d => d.id === a.landmarkId);
        const orderB = defs.findIndex(d => d.id === b.landmarkId);
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

  /**
   * Calculate horizontal tilt between two symmetric points (e.g. shoulders, hips)
   */
  function calculateTilt(leftPoint, rightPoint) {
    if (!leftPoint || !rightPoint) return null;
    const dx = rightPoint.x - leftPoint.x;
    const dy = rightPoint.y - leftPoint.y; // In canvas, +y is down.
    const angleDeg = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
    return Math.round(angleDeg * 10) / 10;
  }

  /**
   * Get specific knee angles from posterior or sagittal landmarks
   */
  function getKneeAngles(landmarks, viewType) {
    if (viewType === 'sagittal') {
      const hip = landmarks.find(l => l.id === 'greater_trochanter');
      const knee = landmarks.find(l => l.id === 'knee');
      const ankle = landmarks.find(l => l.id === 'lateral_malleolus');
      if (hip && knee && ankle) {
        return { sagittal: Math.round(calculateAngle(hip, knee, ankle)) };
      }
      return {};
    }

    if (viewType === 'posterior') {
      const hipL = landmarks.find(l => l.id === 'psis_left');
      const kneeL = landmarks.find(l => l.id === 'popliteal_left');
      const ankleL = landmarks.find(l => l.id === 'calcaneus_left');
      
      const hipR = landmarks.find(l => l.id === 'psis_right');
      const kneeR = landmarks.find(l => l.id === 'popliteal_right');
      const ankleR = landmarks.find(l => l.id === 'calcaneus_right');

      const angles = {};
      if (hipL && kneeL && ankleL) angles.left = Math.round(calculateAngle(hipL, kneeL, ankleL));
      if (hipR && kneeR && ankleR) angles.right = Math.round(calculateAngle(hipR, kneeR, ankleR));
      return angles;
    }
    return {};
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
    const { radius = 8, showLabel = true, selected = false, viewType = 'sagittal' } = options;
    const defs = getLandmarks(viewType);
    const def = defs.find(d => d.id === landmark.id);
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
  function generateReportHTML(client, session, deviations, viewType = 'sagittal', imageDataUrl = null) {
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

        <h3 style="font-size:14px; margin-bottom:12px;">評価結果（${viewType === 'posterior' ? '前額面・後面' : '矢状面'}）</h3>
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

  // ── Daily Combined Report Generation ────────────────
  async function generateCombinedReportHTML(client, sagittalSession, posteriorSession, dateStr) {
    let score = 100;
    const sDevs = sagittalSession ? (sagittalSession.deviations || []) : [];
    const pDevs = posteriorSession ? (posteriorSession.deviations || []) : [];
    const sLandmarks = sagittalSession ? (sagittalSession.landmarks || []) : [];
    const pLandmarks = posteriorSession ? (posteriorSession.landmarks || []) : [];
    
    // Knee Angles
    const kneeAngles = getKneeAngles(pLandmarks, 'posterior');
    const kneeAngleRight = kneeAngles.right || '-';
    const kneeAngleLeft = kneeAngles.left || '-';

    // Tilt
    const shoulderL = pLandmarks.find(l => l.id === 'acromion_left');
    const shoulderR = pLandmarks.find(l => l.id === 'acromion_right');
    const shoulderTilt = calculateTilt(shoulderL, shoulderR) || 0;

    const pelvisL = pLandmarks.find(l => l.id === 'psis_left');
    const pelvisR = pLandmarks.find(l => l.id === 'psis_right');
    const pelvisTilt = calculateTilt(pelvisL, pelvisR) || 0;

    const devPercent = (val) => Math.min(100, Math.round((val || 0) * 10));

    // Calc overall score
    const totalDevs = [...sDevs, ...pDevs];
    totalDevs.forEach(d => {
      if (d.status === 'alert') score -= 4;
      else if (d.status === 'warn') score -= 2;
    });
    score = Math.max(0, score);

    let tendencyTitle = '良好な姿勢バランスです';
    let tendencyDesc = '全体的に負担の少ない良い姿勢を保てています。';
    if (sDevs.find(d => d.landmarkId === 'greater_trochanter' && d.deviationCm > 2)) {
      tendencyTitle = '反り腰の傾向があります';
      tendencyDesc = '現在の姿勢は反り腰の傾向が見られます。腰が強く弧を描き、お尻が前方に突き出した状態を指します。骨盤が前傾してしまうため、膝や足首への負担が増加します。長期間にわたってこの姿勢が続くと、腰痛や坐骨神経痛などの問題が生じる可能性があります。';
    } else if (sDevs.find(d => d.landmarkId === 'acromion' && d.deviationCm > 2)) {
      tendencyTitle = '猫背・巻き肩の傾向があります';
      tendencyDesc = '肩が前方に巻いて背中が丸くなっています。首・肩の負担が大きく、呼吸が浅くなる可能性があります。';
    } else if (score < 80) {
      tendencyTitle = 'アライメントの乱れが見られます';
      tendencyDesc = '各部位のズレが蓄積しています。身体のバランスを整えるケアをおすすめします。';
    }

    let sagHtml = '<div class="empty-img">側面データなし</div>';
    if (sagittalSession && sagittalSession.imageId) {
      const blob = await AequumDB.getImage(sagittalSession.imageId);
      if (blob) sagHtml = `<img src="${URL.createObjectURL(blob)}" class="report-img" />`;
    }

    let posHtml = '<div class="empty-img">背面データなし</div>';
    if (posteriorSession && posteriorSession.imageId) {
      const blob = await AequumDB.getImage(posteriorSession.imageId);
      if (blob) posHtml = `<img src="${URL.createObjectURL(blob)}" class="report-img" />`;
    }

    return `
      <style>
        .rpt-wrap { font-family: 'Noto Sans JP', sans-serif; color: #333; max-width: 900px; margin: 0 auto; line-height: 1.5; background: #fff; padding: 24px; box-sizing: border-box; }
        .rpt-header { display: flex; justify-content: space-between; align-items: stretch; margin-bottom: 20px; border-top: 4px solid #00A88D; padding-top: 12px; }
        .rpt-logo { font-size: 20px; font-weight: 700; color: #555; display: flex; align-items: center; gap: 8px; }
        .rpt-logo-icon { width: 40px; height: 40px; background: #e0e0e0; border-radius: 8px; display:flex; align-items:center; justify-content:center; color:white; }
        .rpt-title { font-size: 20px; font-weight: bold; color: #00A88D; margin-top: 4px; }
        .rpt-score-band { display: flex; gap: 2px; height: 48px; border-radius: 4px; overflow: hidden; font-size: 10px; color: white; text-align: center; line-height: 1.2; font-weight:bold; }
        .score-box { flex: 1; padding: 4px; display:flex; align-items:center; justify-content:center; }
        .sb-1 { background: #E57373; opacity: 0.6; } .sb-2 { background: #E57373; opacity: 0.8; }
        .sb-3 { background: #E57373; } .sb-4 { background: #81C784; } .sb-5 { background: #00A88D; }
        .rpt-score-large { background: #fdf5f5; border: 2px solid #E57373; border-radius: 4px; padding: 8px 16px; text-align: center; color: #E57373; }
        .rpt-score-large .num { font-size: 36px; font-weight: bold; line-height: 1; margin-right: 4px; }
        
        .rpt-body { display: flex; gap: 24px; margin-bottom: 24px; }
        .rpt-left { flex: 0 0 380px; }
        .rpt-images { display: flex; gap: 8px; height: 320px; margin-bottom: 16px; }
        .rpt-img-wrap { flex: 1; background: #f5f5f5; border-radius: 4px; overflow: hidden; position: relative;}
        .report-img { width: 100%; height: 100%; object-fit: cover; }
        .empty-img { width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:#aaa; font-size:12px; }
        
        .rpt-score-rows { display: flex; flex-direction: column; gap: 8px; }
        .scr-row { display: flex; align-items: center; gap: 12px; font-size: 11px; }
        .scr-label { width: 24px; text-align: center; border: 1px solid #ddd; padding: 4px 0; font-weight:bold; }
        .scr-metrics { font-size: 9px; color: #666; width: 40px; }
        .scr-circle { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px; background: #00A88D; }
        .scr-circle.bad { background: #E57373; }
        .scr-line { flex: 1; height: 1px; background: #ddd; position: relative; }
        
        .rpt-right { flex: 1; }
        .rpt-banner { background: #00A88D; color: white; font-weight: bold; font-size: 22px; text-align: center; padding: 12px; border-radius: 4px; margin-bottom: 16px; }
        .rpt-illus-row { display: flex; gap: 16px; }
        .rpt-illus { width: 120px; background: #f9f9f9; display:flex; justify-content:center; }
        .rpt-symptoms { border: 2px solid #a8dfd5; padding: 16px; border-radius: 4px; margin-top: 16px; font-size: 12px; }
        .rpt-symptoms h4 { color: #00A88D; margin: 0 0 8px 0; font-size: 13px; }
        .rpt-symptoms p { color: #E57373; font-weight: bold; margin: 0; line-height: 1.6; }
        
        .rpt-knee { background: #f5f5f5; padding: 12px; text-align: center; font-weight: bold; margin-top: 16px; border-radius: 4px; }
        .rpt-knee-val { display: flex; justify-content: space-around; align-items: center; margin-top: 12px; }
        .knee-num { font-size: 32px; color: #E57373; }
        .knee-num.good { color: #00A88D; }
        
        .rpt-bottom-banner { background: #00A88D; color: white; font-weight: bold; text-align: center; padding: 8px; border-radius: 20px; margin-bottom: 16px; }
        .rpt-bottom { display: flex; gap: 24px; align-items: center; margin-bottom: 24px; }
        .rpt-radar { width: 240px; height: 240px; flex-shrink: 0; display:flex; justify-content:center; align-items:center; }
        .rpt-advice { flex: 1; display: flex; flex-direction: column; gap: 12px; }
        .advice-card { border: 1px solid #eee; border-radius: 8px; padding: 12px; display: flex; gap: 12px; align-items: flex-start; }
        .advice-icon { width: 60px; height: 60px; background: #f0f8f7; border-radius: 4px; flex-shrink: 0; display:flex; align-items:center; justify-content:center; color: #00A88D; }
        .advice-text h5 { margin: 0 0 4px 0; font-size: 13px; color: #333; }
        .advice-text p { margin: 0; font-size: 11px; color: #666; }
        
        .rpt-footer { border: 2px solid #00A88D; border-radius: 8px; padding: 16px; display: flex; justify-content: space-between; align-items: center; }
        .rpt-footer h4 { margin: 0 0 8px 0; color: #00A88D; font-size: 15px; }
        .tags { display: flex; gap: 8px; flex-wrap: wrap; }
        .tag { background: #00A88D; color: white; padding: 4px 12px; border-radius: 12px; font-size: 10px; font-weight: bold; }
        
        /* Mobile Responsive Styles */
        @media (max-width: 768px) {
          .rpt-wrap { padding: 12px; }
          .rpt-header { flex-direction: column; gap: 12px; }
          .rpt-header > div:last-child { text-align: left !important; }
          .rpt-header > div:last-child > div { flex-wrap: wrap; flex-direction: column; align-items: stretch !important; gap: 8px; }
          .rpt-score-band { width: 100% !important; min-width: 0; height: 40px; font-size: 9px; }
          .rpt-score-large { display: flex; align-items: center; gap: 8px; padding: 8px 12px; }
          .rpt-score-large .num { font-size: 28px; }
          .rpt-body { flex-direction: column; gap: 16px; }
          .rpt-left { flex: none; width: 100%; }
          .rpt-images { height: 220px; }
          .rpt-banner { font-size: 16px; padding: 10px; }
          .scr-row { gap: 4px; font-size: 10px; }
          .scr-label { width: 20px; font-size: 10px; padding: 2px 0; }
          .scr-metrics { font-size: 8px; width: 32px; }
          .scr-circle { width: 20px; height: 20px; font-size: 10px; }
          .scr-line { min-width: 8px; }
          .rpt-illus-row { flex-direction: column; align-items: center; }
          .rpt-illus { width: 80px; }
          .rpt-symptoms { text-align: left; padding: 12px; }
          .knee-num { font-size: 24px; }
          .rpt-bottom-banner { font-size: 13px; padding: 6px; }
          .rpt-bottom { flex-direction: column; gap: 16px; }
          .rpt-radar { width: 100%; height: 200px; }
          .rpt-radar canvas { width: 200px !important; height: 200px !important; }
          .advice-card { padding: 8px; gap: 8px; }
          .advice-icon { width: 44px; height: 44px; }
          .advice-text h5 { font-size: 12px; }
          .advice-text p { font-size: 10px; }
          .rpt-footer { flex-direction: column; text-align: center; gap: 12px; padding: 12px; }
          .rpt-footer h4 { font-size: 13px; }
          .tags { justify-content: center; }
          .tag { font-size: 9px; padding: 3px 8px; }
          .rpt-logo { font-size: 16px; }
          .rpt-title { font-size: 16px; }
        }
      </style>
      
      <div class="rpt-wrap" id="printable-report">
        <!-- Header -->
        <div class="rpt-header">
          <div>
            <div class="rpt-logo">
              <div class="rpt-logo-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg></div>
              <div>サンプル店舗<div class="rpt-title">姿勢分析レポート</div></div>
            </div>
          </div>
          <div style="text-align: right; font-size: 10px; color: #666;">
            ${dateStr}
            <div style="margin-top:4px; display:flex; align-items:flex-end; gap:8px;">
              <div>
                <span style="font-size:10px; color:#999;">姿勢スコア基準表</span>
                <div class="rpt-score-band" style="width:280px;">
                  <div class="score-box sb-1">~59<br>深刻な歪み</div>
                  <div class="score-box sb-2">~69<br>要ケア</div>
                  <div class="score-box sb-3">~79<br>惜しい</div>
                  <div class="score-box sb-4">~89<br>良い姿勢</div>
                  <div class="score-box sb-5">~100<br>美姿勢</div>
                </div>
              </div>
              <div class="rpt-score-large">
                <div style="font-size:10px; text-align:left; color:#E57373;">姿勢スコア</div>
                <div><span class="num">${score}</span><span style="font-size:12px;">/100点</span></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Body -->
        <div class="rpt-body">
          <div class="rpt-left">
            <div class="rpt-images">
              <div class="rpt-img-wrap">${posHtml}</div>
              <div class="rpt-img-wrap">${sagHtml}</div>
            </div>
            <div class="rpt-score-rows">
              <div class="scr-row">
                <div class="scr-label">頭</div>
                <div class="scr-metrics">傾き ${shoulderTilt}°<br>ズレ ${devPercent(sDevs.find(d=>d.landmarkId.includes('tragus'))?.deviationCm)}%</div>
                <div class="scr-circle">10</div>
                <div class="scr-line"></div>
                <div class="scr-label" style="border:none;">頭</div>
                <div class="scr-metrics">ズレ 0%</div>
                <div class="scr-circle bad">8</div>
              </div>
              <div class="scr-row">
                <div class="scr-label">肩</div>
                <div class="scr-metrics">傾き ${shoulderTilt}°<br>ズレ 0%</div>
                <div class="scr-circle">10</div>
                <div class="scr-line"></div>
                <div class="scr-label" style="border:none;">肩</div>
                <div class="scr-metrics">ズレ 0%</div>
                <div class="scr-circle bad">8</div>
              </div>
              <div class="scr-row">
                <div class="scr-label">腰</div>
                <div class="scr-metrics">傾き ${pelvisTilt}°<br>ズレ 0%</div>
                <div class="scr-circle">10</div>
                <div class="scr-line"></div>
                <div class="scr-label" style="border:none;">腰</div>
                <div class="scr-metrics">ズレ 0%</div>
                <div class="scr-circle bad">6</div>
              </div>
            </div>
          </div>

          <div class="rpt-right">
            <div class="rpt-banner">${tendencyTitle}</div>
            <div class="rpt-illus-row">
              <div class="rpt-illus">
                <svg width="60" height="180" viewBox="0 0 60 180">
                  <path d="M30 10 Q40 40 30 70 Q20 100 30 130 Q40 160 30 180" stroke="#00A88D" stroke-width="4" stroke-dasharray="4 4" fill="none"/>
                  <circle cx="30" cy="10" r="8" fill="#E57373" opacity="0.5"/>
                  <circle cx="35" cy="40" r="6" fill="#E57373"/>
                  <circle cx="25" cy="100" r="8" fill="#E57373" opacity="0.8"/>
                  <circle cx="35" cy="150" r="6" fill="#E57373"/>
                </svg>
              </div>
              <div style="flex:1; font-size:12px; color:#555;">
                <p>${tendencyDesc}</p>
                <div class="rpt-symptoms">
                  <h4>起こりやすい症状</h4>
                  <p>腰痛・ポッコリおなか・垂れ尻・足のしびれ・股関節痛・前太ももの張り・膝の痛み</p>
                </div>
              </div>
            </div>
            
            <div class="rpt-knee">膝の分析</div>
            <div class="rpt-knee-val">
              <div><div style="font-size:11px; color:#666;">右</div><div class="knee-num ${kneeAngleRight > 175 ? 'good':''}">${Math.abs(kneeAngleRight)}<span>度</span></div></div>
              <div><div style="font-size:11px; color:#666;">左</div><div class="knee-num ${kneeAngleLeft > 175 ? 'good':''}">${Math.abs(kneeAngleLeft)}<span>度</span></div></div>
            </div>
          </div>
        </div>

        <div class="rpt-bottom-banner">姿勢バランスチャート＆私生活で注意するポイント</div>
        <div class="rpt-bottom">
          <div class="rpt-radar">
            <canvas id="radar-chart-canvas" width="220" height="220"></canvas>
          </div>
          <div class="rpt-advice">
            <div class="advice-card">
              <div class="advice-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 19v-4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4"></path><path d="M4 19h16v2H4z"></path><path d="M6 13V9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"></path></svg>
              </div>
              <div class="advice-text">
                <h5>ソファで足を上げて座る</h5>
                <p>足を上げて座ると、骨盤が歪みやすく腰痛の原因になります。足を下ろすと腰・骨盤への負担を減らせます。</p>
              </div>
            </div>
            <div class="advice-card">
              <div class="advice-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="8" width="16" height="12" rx="2"></rect><path d="M8 8V6a4 4 0 0 1 8 0v2"></path></svg>
              </div>
              <div class="advice-text">
                <h5>荷物を片側の肩だけで持つ</h5>
                <p>片方の肩だけで荷物を持つと体が傾きやすくなり、肩や背中に負担が集中します。両肩でバランス良く持つ習慣をつけることが大切です。</p>
              </div>
            </div>
          </div>
        </div>

        <div class="rpt-footer">
          <div>
            <h4>【魔法の3分】座ったままできる！反り腰改善＆骨盤メンテナンス</h4>
            <div class="tags">
              <span class="tag">反り腰改善</span><span class="tag">腰痛改善</span><span class="tag">姿勢矯正</span>
              <span class="tag">ポッコリおなか解消</span><span class="tag">ヒップアップ</span><span class="tag">血行改善</span>
            </div>
          </div>
          <div style="text-align:center; font-size:10px; font-weight:bold;">
            QRを読んで今すぐ開始！
            <div style="background:#000; width:60px; height:60px; margin: 4px auto 0;"></div>
          </div>
        </div>
      </div>
    `;
  }

  function drawRadarChart(canvasId, sagittalSession, posteriorSession) {
    const canvas = typeof canvasId === 'string' ? document.getElementById(canvasId) : canvasId;
    if (!canvas) return;

    // Estimate values 0-100 based on deviations for specific areas
    const sDevs = sagittalSession ? (sagittalSession.deviations || []) : [];
    const pDevs = posteriorSession ? (posteriorSession.deviations || []) : [];

    // Helper: 100 is perfect, sub for each cm of dev
    const calcScore = (ids, devs) => {
      let deduction = 0;
      ids.forEach(id => {
        const d = devs.find(x => x.landmarkId.includes(id));
        if (d && d.deviationCm !== null) {
          deduction += Math.abs(d.deviationCm) * 3;
        }
      });
      return Math.max(20, 100 - deduction);
    };

    const scores = {
      head: calcScore(['earrobe', 'ear'], [...sDevs, ...pDevs]),
      shoulder: calcScore(['acromion'], [...sDevs, ...pDevs]),
      back: calcScore(['c7', 'psis'], [...sDevs, ...pDevs]),
      pelvis: calcScore(['greater_trochanter', 'psis'], [...sDevs, ...pDevs]),
      knee: calcScore(['knee', 'popliteal'], [...sDevs, ...pDevs])
    };

    canvas.width = 240;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const r = 80;

    const labels = ['頭', '肩', '腰', '脚', '背中'];
    const data = [scores.head, scores.shoulder, scores.pelvis, scores.knee, scores.back];
    
    ctx.clearRect(0, 0, width, height);

    // Grid config
    const levels = 5;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;

    for (let i = 1; i <= levels; i++) {
        const levelR = r * (i / levels);
        ctx.beginPath();
        for (let j = 0; j < 5; j++) {
            const angle = (Math.PI / 2) - 2 * Math.PI * j / 5;
            const x = cx + levelR * Math.cos(angle);
            const y = cy - levelR * Math.sin(angle);
            if (j === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
    }

    // Axes config
    for (let j = 0; j < 5; j++) {
        const angle = (Math.PI / 2) - 2 * Math.PI * j / 5;
        const x = cx + r * Math.cos(angle);
        const y = cy - r * Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
        ctx.stroke();

        // Labels
        ctx.fillStyle = '#64748b';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lx = cx + (r + 16) * Math.cos(angle);
        const ly = cy - (r + 16) * Math.sin(angle);
        ctx.fillText(labels[j], lx, ly);
    }

    // Data polygon
    ctx.beginPath();
    for (let j = 0; j < 5; j++) {
        const angle = (Math.PI / 2) - 2 * Math.PI * j / 5;
        const val = data[j] / 100;
        const x = cx + r * val * Math.cos(angle);
        const y = cy - r * val * Math.sin(angle);
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 201, 167, 0.2)';
    ctx.fill();
    ctx.strokeStyle = '#00C9A7';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Data points
    for (let j = 0; j < 5; j++) {
        const angle = (Math.PI / 2) - 2 * Math.PI * j / 5;
        const val = data[j] / 100;
        const x = cx + r * val * Math.cos(angle);
        const y = cy - r * val * Math.sin(angle);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#00C9A7';
        ctx.fill();
    }
  }

  // ── Public API ───────────────────────────────────────
  return {
    LANDMARKS,
    SAGITTAL_LANDMARKS,
    POSTERIOR_LANDMARKS,
    getLandmarks,
    THRESHOLDS,
    getPlumbLineX,
    calculateScaleFactor,
    calculateDeviations,
    calculateAngle,
    calculateCVA,
    calculateTilt,
    getKneeAngles,
    drawPlumbLine,
    drawLandmark,
    drawDeviationLine,
    drawGrid,
    getTrendData,
    drawTrendChart,
    generateReportHTML,
    generateCombinedReportHTML,
    drawRadarChart
  };
})();
