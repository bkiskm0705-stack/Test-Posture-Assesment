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

  // Seated sagittal plane (lateral view) landmarks
  // In seated posture, the plumb line reference is the greater trochanter
  const SEATED_SAGITTAL_LANDMARKS = [
    { id: 'greater_trochanter', name: '大転子', nameEn: 'Greater Trochanter', color: '#EF4444', isReference: true, order: 0 },
    { id: 'acromion',          name: '肩峰', nameEn: 'Acromion', color: '#00C9A7', isReference: false, order: 1 },
    { id: 'earlobe',           name: '耳垂', nameEn: 'Earlobe', color: '#2C7BE5', isReference: false, order: 2 },
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
    if (viewType === 'posterior') return POSTERIOR_LANDMARKS;
    if (viewType === 'seated_sagittal') return SEATED_SAGITTAL_LANDMARKS;
    return SAGITTAL_LANDMARKS;
  }

  // Backward compatibility alias
  const LANDMARKS = SAGITTAL_LANDMARKS;

  // Deviation thresholds (cm)
  const THRESHOLDS = {
    ok:   2.0,   // ≤ 2cm  → Green (normal variation)
    warn: 5.0,   // ≤ 5cm  → Yellow (notable)
    // > 5cm → Red (significant deviation)
  };

  // ── Skeleton Connection Definitions ─────────────────
  // Defines which landmarks to connect with lines for each view type

  // Sagittal (standing lateral): ankle → knee → hip → shoulder → ear
  const SAGITTAL_SKELETON = [
    ['ankle_forward', 'knee_forward'],
    ['knee_forward', 'greater_trochanter'],
    ['greater_trochanter', 'acromion'],
    ['acromion', 'earlobe'],
  ];

  // Seated sagittal: hip → shoulder → ear
  const SEATED_SAGITTAL_SKELETON = [
    ['greater_trochanter', 'acromion'],
    ['acromion', 'earlobe'],
  ];

  // Posterior (frontal plane): symmetrical connections
  const POSTERIOR_SKELETON = [
    // Left leg
    ['heel_left', 'popliteal_left'],
    ['popliteal_left', 'psis_left'],
    // Right leg
    ['heel_right', 'popliteal_right'],
    ['popliteal_right', 'psis_right'],
    // Pelvis bridge
    ['psis_left', 'psis_right'],
    // Trunk (left/right)
    ['psis_left', 'acromion_left'],
    ['psis_right', 'acromion_right'],
    // Shoulder bridge
    ['acromion_left', 'acromion_right'],
    // Head (left/right)
    ['acromion_left', 'earlobe_left'],
    ['acromion_right', 'earlobe_right'],
  ];

  function getSkeletonConnections(viewType) {
    if (viewType === 'posterior') return POSTERIOR_SKELETON;
    if (viewType === 'seated_sagittal') return SEATED_SAGITTAL_SKELETON;
    return SAGITTAL_SKELETON;
  }

  // ── Segment Definitions (for tilt/deviation display) ─
  // Each segment defines a body region with paired landmarks for tilt calculation

  const SAGITTAL_SEGMENTS = [
    { name: '頭部', pair: ['acromion', 'earlobe'] },
    { name: '肩',   pair: ['greater_trochanter', 'acromion'] },
    { name: '腰',   pair: ['knee_forward', 'greater_trochanter'] },
    { name: '膝',   pair: ['ankle_forward', 'knee_forward'] },
  ];

  const SEATED_SAGITTAL_SEGMENTS = [
    { name: '頭部', pair: ['acromion', 'earlobe'] },
    { name: '肩',   pair: ['greater_trochanter', 'acromion'] },
  ];

  const POSTERIOR_SEGMENTS = [
    { name: '頭',   pairL: 'earlobe_left',  pairR: 'earlobe_right' },
    { name: '肩',   pairL: 'acromion_left',  pairR: 'acromion_right' },
    { name: '腰',   pairL: 'psis_left',      pairR: 'psis_right' },
    { name: '膝',   pairL: 'popliteal_left',  pairR: 'popliteal_right' },
  ];

  function getSegments(viewType) {
    if (viewType === 'posterior') return POSTERIOR_SEGMENTS;
    if (viewType === 'seated_sagittal') return SEATED_SAGITTAL_SEGMENTS;
    return SAGITTAL_SEGMENTS;
  }

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
    } else if (viewType === 'seated_sagittal') {
      const ref = landmarks.find(l => l.id === 'greater_trochanter');
      return ref ? ref.x : null;
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
    } else if (viewType === 'seated_sagittal') {
      // Seated: greater_trochanter to earlobe ≈ 42% of standing height
      const hip = landmarks.find(l => l.id === 'greater_trochanter');
      const earlobe = landmarks.find(l => l.id === 'earlobe');
      if (!hip || !earlobe) return null;
      bottomY = hip.y;
      topY = earlobe.y;
      const trunkPx = Math.abs(bottomY - topY) / 0.42;
      if (trunkPx === 0) return null;
      return heightCm / trunkPx;
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

    // Determine which landmark IDs serve as reference points for this view
    const refIds = viewType === 'seated_sagittal'
      ? ['greater_trochanter']
      : ['ankle_forward', 'base_center'];

    return landmarks
      .filter(l => !refIds.includes(l.id)) // Reference points have 0 deviation
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
    const { radius = 8, showLabel = true, selected = false, viewType = 'sagittal', deviation = null } = options;
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
    if (showLabel && def && landmark.id !== 'base_center') {
      ctx.globalAlpha = 1;
      ctx.font = '11px Inter, sans-serif';
      ctx.fillStyle = '#ffffff';

      const text = def.name;
      const metrics = ctx.measureText(text);
      const labelW = metrics.width + 8;

      // Deviation text
      let devText = '';
      let devColor = '#00D9A6';
      if (deviation && deviation.deviationCm !== null) {
        const sign = deviation.deviationCm > 0 ? '+' : '';
        devText = `${sign}${deviation.deviationCm}cm`;
        devColor = deviation.status === 'ok' ? '#00D9A6' : deviation.status === 'warn' ? '#FFD93D' : '#FF6B6B';
      }

      ctx.font = 'bold 10px JetBrains Mono, monospace';
      const devMetrics = devText ? ctx.measureText(devText) : { width: 0 };
      ctx.font = '11px Inter, sans-serif';

      const totalLabelW = Math.max(labelW, devMetrics.width + 8);
      const totalH = devText ? 32 : 16;

      // Determine label side: posterior view uses left/right positioning
      let labelOnLeft = false;
      if (viewType === 'posterior') {
        if (landmark.id.includes('_left')) {
          labelOnLeft = true;
        } else if (landmark.id.includes('_right')) {
          labelOnLeft = false;
        }
      }

      let labelX, labelY;
      labelY = landmark.y + 4;

      if (labelOnLeft) {
        ctx.textAlign = 'right';
        labelX = landmark.x - radius - 6;
        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.roundRect(labelX - Math.max(metrics.width, devMetrics.width) - 4, labelY - 12, totalLabelW, totalH, 3);
        ctx.fill();
        // Name text
        ctx.font = '11px Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, labelX, labelY);
        // Deviation text below
        if (devText) {
          ctx.font = 'bold 10px JetBrains Mono, monospace';
          ctx.fillStyle = devColor;
          ctx.fillText(devText, labelX, labelY + 14);
        }
      } else {
        ctx.textAlign = 'left';
        labelX = landmark.x + radius + 6;
        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.roundRect(labelX - 4, labelY - 12, totalLabelW, totalH, 3);
        ctx.fill();
        // Name text
        ctx.font = '11px Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, labelX, labelY);
        // Deviation text below
        if (devText) {
          ctx.font = 'bold 10px JetBrains Mono, monospace';
          ctx.fillStyle = devColor;
          ctx.fillText(devText, labelX, labelY + 14);
        }
      }
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

    // Deviation value is now drawn by drawLandmark (attached to label)

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

  // ── Skeleton Drawing ─────────────────────────────────

  /**
   * Draw skeleton lines connecting landmarks
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} landmarks - Placed landmarks [{id, x, y}]
   * @param {string} viewType - 'sagittal' | 'posterior' | 'seated_sagittal'
   * @param {object} options - { color, lineWidth }
   */
  function drawSkeleton(ctx, landmarks, viewType, options = {}) {
    const { color = 'rgba(255, 255, 255, 0.85)', lineWidth = 2.5 } = options;
    const connections = getSkeletonConnections(viewType);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);

    connections.forEach(([fromId, toId]) => {
      const from = landmarks.find(l => l.id === fromId);
      const to = landmarks.find(l => l.id === toId);
      if (from && to) {
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    });

    ctx.restore();
  }

  // ── Segment Tilt Calculation ─────────────────────────

  /**
   * Calculate tilt and deviation for each body segment
   * @param {Array} landmarks - Placed landmarks
   * @param {string} viewType
   * @param {number|null} scaleFactor - cm per pixel
   * @param {number} facingDirection - 1 or -1
   * @returns {Array} [{name, tiltDeg, deviationCm, deviationPercent, status, midX, midY}]
   */
  function calculateSegmentTilts(landmarks, viewType, scaleFactor, facingDirection = 1) {
    const segments = getSegments(viewType);
    const results = [];

    if (viewType === 'posterior') {
      // Frontal plane: calculate tilt between left/right paired landmarks
      segments.forEach(seg => {
        const left = landmarks.find(l => l.id === seg.pairL);
        const right = landmarks.find(l => l.id === seg.pairR);
        if (!left || !right) return;

        // Tilt: angle from horizontal (0° = perfectly level)
        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const tiltDeg = Math.round(Math.atan2(dy, Math.abs(dx)) * (180 / Math.PI) * 10) / 10;

        // Deviation: midpoint offset from plumb line
        const midX = (left.x + right.x) / 2;
        const plumbX = getPlumbLineX(landmarks, viewType);
        let deviationCm = null;
        let deviationPercent = null;
        if (plumbX !== null && scaleFactor) {
          deviationCm = Math.round((midX - plumbX) * scaleFactor * 10) / 10;
          // Deviation as % of shoulder width (use acromion pair as reference width)
          const acrL = landmarks.find(l => l.id === 'acromion_left');
          const acrR = landmarks.find(l => l.id === 'acromion_right');
          if (acrL && acrR) {
            const refWidth = Math.abs(acrR.x - acrL.x);
            if (refWidth > 0) {
              deviationPercent = Math.round(Math.abs(midX - plumbX) / refWidth * 100);
            }
          }
        }

        const absTilt = Math.abs(tiltDeg);
        let status = 'ok';
        if (absTilt > 3.0) status = 'alert';
        else if (absTilt > 1.5) status = 'warn';

        results.push({ name: seg.name, tiltDeg, deviationCm, deviationPercent, status, midX, midY: (left.y + right.y) / 2 });
      });
    } else {
      // Sagittal plane: deviation from plumb line for each segment
      const plumbX = getPlumbLineX(landmarks, viewType);

      segments.forEach(seg => {
        const bottom = landmarks.find(l => l.id === seg.pair[0]);
        const top = landmarks.find(l => l.id === seg.pair[1]);
        if (!bottom || !top) return;

        // Tilt: angle of segment from vertical (0° = perfectly vertical)
        const dx = (top.x - bottom.x) * facingDirection;
        const dy = bottom.y - top.y; // Invert Y for screen coords
        const angleFromVertical = Math.round(Math.atan2(Math.abs(dx), dy) * (180 / Math.PI) * 10) / 10;
        const tiltDeg = dx >= 0 ? angleFromVertical : -angleFromVertical;

        // Deviation of the top landmark from plumb line
        let deviationCm = null;
        let deviationPercent = null;
        if (plumbX !== null && scaleFactor) {
          deviationCm = Math.round((top.x - plumbX) * facingDirection * scaleFactor * 10) / 10;
          // As percentage of segment length
          const segLen = Math.sqrt((top.x - bottom.x) ** 2 + (top.y - bottom.y) ** 2);
          if (segLen > 0) {
            deviationPercent = Math.round(Math.abs(top.x - plumbX) / segLen * 100);
          }
        }

        const absDevCm = deviationCm !== null ? Math.abs(deviationCm) : null;
        let status = 'unknown';
        if (absDevCm !== null) {
          if (absDevCm <= THRESHOLDS.ok) status = 'ok';
          else if (absDevCm <= THRESHOLDS.warn) status = 'warn';
          else status = 'alert';
        }

        const midX = (bottom.x + top.x) / 2;
        const midY = (bottom.y + top.y) / 2;
        results.push({ name: seg.name, tiltDeg, deviationCm, deviationPercent, status, midX, midY });
      });
    }

    return results;
  }

  // ── Segment Info Drawing ─────────────────────────────

  /**
   * Draw segment tilt/deviation info on canvas
   * Displays body part name, tilt angle, and deviation for each segment
   */
  function drawSegmentInfo(ctx, landmarks, viewType, scaleFactor, facingDirection = 1, canvasWidth = 0) {
    const tilts = calculateSegmentTilts(landmarks, viewType, scaleFactor, facingDirection);
    if (tilts.length === 0) return;

    ctx.save();

    tilts.forEach((seg, i) => {
      const statusColor = seg.status === 'ok' ? '#00C9A7' :
                          seg.status === 'warn' ? '#FFD93D' : '#FF6B6B';

      // Position the info badge to the side of the segment
      let badgeX, badgeY;

      if (viewType === 'posterior') {
        badgeX = Math.max(8, seg.midX - 140);
        badgeY = seg.midY;
      } else {
        badgeX = seg.midX + 30;
        badgeY = seg.midY;
      }

      // Build info text lines
      const lines = [];
      lines.push(seg.name);

      if (viewType === 'posterior' && seg.tiltDeg !== undefined) {
        lines.push(`傾き ${seg.tiltDeg > 0 ? '+' : ''}${seg.tiltDeg}°`);
      }

      if (seg.deviationCm !== null) {
        const sign = seg.deviationCm > 0 ? '+' : '';
        lines.push(`ズレ ${sign}${seg.deviationCm}cm`);
      }
      if (seg.deviationPercent !== null) {
        lines.push(`(${seg.deviationPercent}%)`);
      }

      // Calculate badge dimensions
      ctx.font = 'bold 11px Inter, Noto Sans JP, sans-serif';
      const nameWidth = ctx.measureText(lines[0]).width;
      ctx.font = '10px Inter, Noto Sans JP, sans-serif';
      const maxDetailWidth = lines.slice(1).reduce((max, l) => Math.max(max, ctx.measureText(l).width), 0);
      const badgeW = Math.max(nameWidth, maxDetailWidth) + 16;
      const lineH = 15;
      const badgeH = lines.length * lineH + 8;

      // Badge background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(badgeX - 4, badgeY - badgeH / 2, badgeW, badgeH, 5);
        ctx.fill();
      } else {
        ctx.fillRect(badgeX - 4, badgeY - badgeH / 2, badgeW, badgeH);
      }

      // Status color bar on left side
      ctx.fillStyle = statusColor;
      ctx.fillRect(badgeX - 4, badgeY - badgeH / 2, 3, badgeH);

      // Text
      let ty = badgeY - badgeH / 2 + lineH;
      ctx.textAlign = 'left';

      // Segment name (bold)
      ctx.font = 'bold 11px Inter, Noto Sans JP, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(lines[0], badgeX + 4, ty);
      ty += lineH;

      // Detail lines
      ctx.font = '10px Inter, Noto Sans JP, sans-serif';
      for (let j = 1; j < lines.length; j++) {
        ctx.fillStyle = j === 1 ? statusColor : 'rgba(255,255,255,0.7)';
        ctx.fillText(lines[j], badgeX + 4, ty);
        ty += lineH;
      }
    });

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
    score = Math.max(50, score);

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
        .rpt-score-band { display: flex; gap: 2px; height: 48px; border-radius: 4px; overflow: hidden; font-size: 11px; color: white; text-align: center; line-height: 1.2; font-weight:bold; }
        .score-box { flex: 1; padding: 4px; display:flex; align-items:center; justify-content:center; }
        .sb-care { background: #E57373; } .sb-almost { background: #F5A623; } .sb-good { background: #00A88D; }
        .rpt-score-large { border-radius: 4px; padding: 8px 16px; text-align: center; }
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
                  <div class="score-box sb-care">~69<br>要改善</div>
                  <div class="score-box sb-almost">70~84<br>やや偏位あり</div>
                  <div class="score-box sb-good">85~100<br>良好</div>
                </div>
              </div>
              <div class="rpt-score-large" style="background:${score >= 85 ? '#f0faf7' : score >= 70 ? '#fef9f0' : '#fdf5f5'}; border:2px solid ${score >= 85 ? '#00A88D' : score >= 70 ? '#F5A623' : '#E57373'}; color:${score >= 85 ? '#00A88D' : score >= 70 ? '#F5A623' : '#E57373'};">
                <div style="font-size:10px; text-align:left;">姿勢スコア</div>
                <div><span class="num">${score}</span><span style="font-size:12px;">/100点</span></div>
                <div style="font-size:11px; font-weight:bold; margin-top:2px;">${score >= 85 ? '良好 ✨' : score >= 70 ? 'やや偏位あり' : '要改善 ⚠️'}</div>
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
            
          </div>
        </div>

        <div class="rpt-bottom-banner">姿勢バランスチャート＆私生活で注意するポイント</div>
        <div class="rpt-bottom">
          <div class="rpt-radar">
            <canvas id="radar-chart-canvas" width="220" height="220"></canvas>
          </div>
          <div class="rpt-advice">
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:32px 16px; color:#aaa; text-align:center; border:2px dashed #e0e0e0; border-radius:12px; min-height:120px;">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5" style="margin-bottom:8px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <div style="font-size:14px; font-weight:bold; color:#999;">Coming Soon...</div>
              <div style="font-size:11px; color:#bbb; margin-top:4px;">あなたの姿勢に合わせたアドバイスを準備中です</div>
            </div>
          </div>
        </div>

        <div class="rpt-footer" style="justify-content:center; text-align:center;">
          <div style="display:flex; flex-direction:column; align-items:center; gap:8px; padding:8px 0; color:#aaa;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <h4 style="color:#999; font-size:13px;">おすすめエクササイズ — Coming Soon...</h4>
            <p style="font-size:11px; color:#bbb; margin:0;">あなたの姿勢タイプに最適なエクササイズ動画を準備中です</p>
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
    SEATED_SAGITTAL_LANDMARKS,
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
    drawRadarChart,
    // Skeleton & Segment display
    drawSkeleton,
    calculateSegmentTilts,
    drawSegmentInfo,
    getSkeletonConnections,
    getSegments,
    SAGITTAL_SKELETON,
    SEATED_SAGITTAL_SKELETON,
    POSTERIOR_SKELETON,
  };
})();
