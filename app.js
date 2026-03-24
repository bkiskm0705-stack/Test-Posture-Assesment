/* ============================================================
   Aequum — Main Application Controller
   SPA routing, page controllers, camera, landmark editor
   ============================================================ */

(() => {
  'use strict';

  // ── State ────────────────────────────────────────────
  const state = {
    currentPage: 'clients',
    navigationStack: [],
    currentClient: null,
    currentSession: null,
    // Camera
    cameraStream: null,
    gyroWatcher: null,
    // Analyze
    analyzeImage: null,
    placedLandmarks: [],
    selectedLandmark: null,
    isDragging: false,
    showPlumbLine: true,
    showGrid: false,
    showInfoPanel: true,
    scaleFactor: null,
    // Zoom & Pan
    viewZoom: 1,
    viewPanX: 0,
    viewPanY: 0,
    // Compare
    compareBeforeSession: null,
    compareAfterSession: null,
  };

  // ── DOM Cache ────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ── Initialize ───────────────────────────────────────
  async function init() {
    await AequumDB.init();
    bindGlobalEvents();
    navigateTo('clients');
  }

  // ── Navigation ───────────────────────────────────────
  function navigateTo(page, data = {}) {
    // Hide all pages
    $$('.page').forEach(p => p.classList.remove('active'));

    // Push to stack (for back navigation)
    if (state.currentPage && state.currentPage !== page) {
      const currentData = {};
      // Preserve current page context for back navigation
      if (state.currentPage === 'client-detail' && state.currentClient) {
        currentData.clientId = state.currentClient.id;
      }
      state.navigationStack.push({ page: state.currentPage, data: currentData });
    }
    state.currentPage = page;

    // Show target page
    const target = $(`page-${page}`);
    if (target) {
      target.classList.add('active');
    }

    // Update header
    updateHeader(page);

    // Cleanup previous page resources
    cleanupResources();

    // Initialize page
    switch (page) {
      case 'clients':
        loadClients();
        break;
      case 'new-client':
        resetClientForm();
        break;
      case 'client-detail':
        loadClientDetail(data.clientId);
        break;
      case 'capture':
        initCamera(data.clientId);
        break;
      case 'analyze':
        initAnalyze(data);
        break;
      case 'compare':
        initCompare(data.clientId);
        break;
      case 'report':
        initReport(data.sessionId);
        break;
    }
  }

  function goBack() {
    if (state.navigationStack.length > 0) {
      const prev = state.navigationStack.pop();
      // Set currentPage to match target to prevent navigateTo from pushing again
      state.currentPage = prev.page;
      // Hide all pages and show target
      $$('.page').forEach(p => p.classList.remove('active'));
      const target = $(`page-${prev.page}`);
      if (target) target.classList.add('active');
      updateHeader(prev.page);
      cleanupResources();
      // Re-initialize the page
      switch (prev.page) {
        case 'clients': loadClients(); break;
        case 'client-detail': loadClientDetail(prev.data.clientId || (state.currentClient && state.currentClient.id)); break;
        default: break;
      }
    } else {
      state.currentPage = 'clients';
      $$('.page').forEach(p => p.classList.remove('active'));
      const target = $('page-clients');
      if (target) target.classList.add('active');
      updateHeader('clients');
      loadClients();
    }
  }

  function updateHeader(page) {
    const back = $('btn-back');
    const title = $('header-title');
    const actions = $('header-actions');
    actions.innerHTML = '';

    switch (page) {
      case 'clients':
        back.style.display = 'none';
        title.textContent = 'Aequum';
        break;
      case 'new-client':
        back.style.display = '';
        title.textContent = '新規クライアント';
        break;
      case 'client-detail':
        back.style.display = '';
        title.textContent = 'クライアント詳細';
        break;
      case 'capture':
        back.style.display = '';
        title.textContent = '撮影';
        break;
      case 'analyze':
        back.style.display = '';
        title.textContent = '解析';
        break;
      case 'compare':
        back.style.display = '';
        title.textContent = '比較';
        break;
      case 'report':
        back.style.display = '';
        title.textContent = 'レポート';
        break;
      default:
        back.style.display = '';
        title.textContent = 'Aequum';
    }
  }

  function cleanupResources() {
    // Stop camera stream
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach(t => t.stop());
      state.cameraStream = null;
    }
    // Stop gyro watcher
    if (state.gyroWatcher !== null) {
      window.removeEventListener('deviceorientation', handleOrientation);
      state.gyroWatcher = null;
    }
  }

  // ── Global Events ───────────────────────────────────
  function bindGlobalEvents() {
    $('btn-back').addEventListener('click', goBack);
    $('fab-add-client').addEventListener('click', () => navigateTo('new-client'));
    $('form-new-client').addEventListener('submit', handleSaveClient);
    $('client-search').addEventListener('input', handleSearch);
    $('btn-new-session').addEventListener('click', () => {
      if (state.currentClient) {
        navigateTo('capture', { clientId: state.currentClient.id });
      }
    });

    // Analyze toolbar
    $('btn-auto-detect').addEventListener('click', runAutoDetection);
    $('btn-toggle-plumb').addEventListener('click', () => {
      state.showPlumbLine = !state.showPlumbLine;
      $('btn-toggle-plumb').classList.toggle('active', state.showPlumbLine);
      renderAnalysis();
    });
    $('btn-toggle-grid').addEventListener('click', () => {
      state.showGrid = !state.showGrid;
      $('btn-toggle-grid').classList.toggle('active', state.showGrid);
      renderAnalysis();
    });
    $('btn-toggle-info').addEventListener('click', () => {
      state.showInfoPanel = !state.showInfoPanel;
      $('btn-toggle-info').classList.toggle('active', state.showInfoPanel);
      const panel = $('landmark-info-panel');
      if (panel) panel.style.display = state.showInfoPanel ? '' : 'none';
    });
    $('btn-add-landmark').addEventListener('click', showLandmarkPicker);
    $('btn-save-analysis').addEventListener('click', handleSaveAnalysis);

    // Compare tabs
    $$('#compare-mode-tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('#compare-mode-tabs .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const mode = tab.dataset.mode;
        $$('.compare-view').forEach(v => v.classList.remove('active'));
        const target = mode === 'side-by-side' ? $('compare-side') :
                       mode === 'onion-skin' ? $('compare-onion') :
                       $('compare-trend');
        if (target) target.classList.add('active');
        if (mode === 'trend') renderTrendChart();
      });
    });

    // Report actions
    $('btn-export-pdf').addEventListener('click', handleExportPDF);
    $('btn-share-report').addEventListener('click', handleShareReport);

    // Modal close
    $$('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.modal').forEach(m => m.style.display = 'none');
      });
    });
    $$('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', () => {
        $$('.modal').forEach(m => m.style.display = 'none');
      });
    });
  }

  // ── Toast ────────────────────────────────────────────
  function showToast(message, type = 'success') {
    const toast = $('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.style.display = '';

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.style.display = 'none', 300);
    }, 2500);
  }

  // ──────────────────────────────────────────────────────
  // PAGE: Client List
  // ──────────────────────────────────────────────────────
  async function loadClients() {
    const clients = await AequumDB.getAllClients();
    renderClientList(clients);
  }

  async function handleSearch(e) {
    const query = e.target.value.trim();
    if (query === '') {
      loadClients();
      return;
    }
    const results = await AequumDB.searchClients(query);
    renderClientList(results);
  }

  function renderClientList(clients) {
    const list = $('client-list');
    const empty = $('empty-state');

    if (clients.length === 0) {
      list.innerHTML = '';
      empty.style.display = '';
      return;
    }

    empty.style.display = 'none';
    list.innerHTML = clients.map(c => {
      const initials = c.name.slice(0, 2);
      const lastSession = ''; // will be enhanced
      const meta = [];
      if (c.gender) {
        const genderLabel = c.gender === 'male' ? '男性' : c.gender === 'female' ? '女性' : 'その他';
        meta.push(genderLabel);
      }
      if (c.heightCm) meta.push(`${c.heightCm}cm`);
      if (c.dateOfBirth) {
        const age = calculateAge(c.dateOfBirth);
        if (age !== null) meta.push(`${age}歳`);
      }

      return `
        <div class="client-card" data-id="${c.id}">
          <div class="client-card-body">
            <div class="avatar">${initials}</div>
            <div class="client-card-info">
              <div class="card-name">${escapeHtml(c.name)}</div>
              <div class="card-meta">${meta.map(m => `<span>${m}</span>`).join('')}</div>
              ${c.chiefComplaint ? `<div class="card-complaint">${escapeHtml(c.chiefComplaint)}</div>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Bind click events
    list.querySelectorAll('.client-card').forEach(card => {
      card.addEventListener('click', () => {
        navigateTo('client-detail', { clientId: card.dataset.id });
      });
    });
  }

  // ──────────────────────────────────────────────────────
  // PAGE: New Client
  // ──────────────────────────────────────────────────────
  function resetClientForm() {
    $('form-new-client').reset();
    $$('.form-group input, .form-group select, .form-group textarea').forEach(el => {
      el.classList.remove('invalid');
    });
  }

  async function handleSaveClient(e) {
    e.preventDefault();
    const name = $('input-name').value.trim();

    if (!name) {
      $('input-name').classList.add('invalid');
      $('input-name').focus();
      return;
    }

    try {
      const client = await AequumDB.createClient({
        name,
        dateOfBirth: $('input-dob').value,
        gender: $('input-gender').value,
        heightCm: $('input-height').value,
        medicalHistory: $('input-history').value,
        chiefComplaint: $('input-complaint').value,
      });

      showToast(`${client.name} を登録しました`);
      navigateTo('client-detail', { clientId: client.id });
    } catch (err) {
      showToast('登録に失敗しました', 'error');
      console.error(err);
    }
  }

  // ──────────────────────────────────────────────────────
  // PAGE: Client Detail
  // ──────────────────────────────────────────────────────
  async function loadClientDetail(clientId) {
    const client = await AequumDB.getClient(clientId);
    if (!client) {
      showToast('クライアントが見つかりません', 'error');
      navigateTo('clients');
      return;
    }
    state.currentClient = client;

    const sessions = await AequumDB.getSessionsByClient(clientId);
    renderClientProfile(client, sessions);
    renderSessionTimeline(sessions);
  }

  function renderClientProfile(client, sessions) {
    const profile = $('client-profile');
    const initials = client.name.slice(0, 2);
    const age = client.dateOfBirth ? calculateAge(client.dateOfBirth) : null;
    const genderLabel = client.gender === 'male' ? '男性' :
                        client.gender === 'female' ? '女性' :
                        client.gender === 'other' ? 'その他' : '—';

    profile.innerHTML = `
      <div class="profile-header">
        <div class="avatar">${initials}</div>
        <div>
          <div class="profile-name">${escapeHtml(client.name)}</div>
          <div class="profile-sub">${age !== null ? `${age}歳` : ''} ${genderLabel} ${client.heightCm ? `・ ${client.heightCm}cm` : ''}</div>
        </div>
      </div>
      ${client.chiefComplaint ? `<div style="font-size:0.85rem; color:var(--text-secondary); margin-top:var(--space-sm);">主訴: ${escapeHtml(client.chiefComplaint)}</div>` : ''}
      <div class="profile-stats">
        <div class="stat-item">
          <div class="stat-value">${sessions.length}</div>
          <div class="stat-label">評価回数</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${sessions.length > 0 ? formatDate(sessions[0].capturedAt) : '—'}</div>
          <div class="stat-label">最終評価</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${client.heightCm || '—'}</div>
          <div class="stat-label">身長(cm)</div>
        </div>
      </div>
    `;
  }

  function renderSessionTimeline(sessions) {
    const timeline = $('session-timeline');
    const empty = $('session-empty');

    if (sessions.length === 0) {
      timeline.innerHTML = '';
      empty.style.display = '';
      return;
    }

    empty.style.display = 'none';
    timeline.innerHTML = sessions.map(s => {
      const date = new Date(s.capturedAt).toLocaleDateString('ja-JP', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      const badges = (s.deviations || []).slice(0, 3).map(d => {
        const cls = d.status === 'ok' ? 'badge-ok' : d.status === 'warn' ? 'badge-warn' : 'badge-alert';
        const sign = d.deviationCm > 0 ? '+' : '';
        return `<span class="session-badge ${cls}">${d.landmarkName} ${sign}${d.deviationCm}cm</span>`;
      }).join('');

      return `
        <div class="session-card" data-session-id="${s.id}">
          <div class="session-date">${date}</div>
          <div class="session-summary">${badges || '<span style="color:var(--text-muted); font-size:0.82rem;">ランドマーク未設定</span>'}</div>
          <div class="session-actions">
            <button class="btn-view-session" data-id="${s.id}">詳細</button>
            <button class="btn-compare-session" data-id="${s.id}">比較</button>
            <button class="btn-report-session" data-id="${s.id}">レポート</button>
          </div>
        </div>
      `;
    }).join('');

    // Bind session action buttons
    timeline.querySelectorAll('.btn-view-session').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateTo('analyze', { sessionId: btn.dataset.id, mode: 'view' });
      });
    });
    timeline.querySelectorAll('.btn-compare-session').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateTo('compare', { clientId: state.currentClient.id });
      });
    });
    timeline.querySelectorAll('.btn-report-session').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateTo('report', { sessionId: btn.dataset.id });
      });
    });
  }

  // ──────────────────────────────────────────────────────
  // PAGE: Camera / Capture
  // ──────────────────────────────────────────────────────
  async function initCamera(clientId) {
    state.currentClient = await AequumDB.getClient(clientId);

    const video = $('camera-preview');
    const captureBtn = $('btn-capture');
    const photoInput = $('photo-upload-input');

    // Always bind photo upload (available alongside camera)
    photoInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const blob = file;
      const imageId = await AequumDB.saveImage(blob);

      cleanupResources();
      showToast('画像を読み込みました');

      navigateTo('analyze', {
        imageBlob: blob,
        imageId: imageId,
        clientId: clientId,
        mode: 'new',
      });
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        }
      });
      state.cameraStream = stream;
      video.srcObject = stream;

      // Draw grid overlay
      drawCameraGrid();

      // Start gyroscope
      initGyroscope();

      // Capture button
      captureBtn.addEventListener('click', handleCapture);
    } catch (err) {
      console.error('Camera access denied', err);
      showToast('カメラが利用できません。写真をアップロードしてください', 'error');

      // Disable shutter but keep upload button active
      captureBtn.disabled = true;
      captureBtn.style.opacity = '0.2';
    }
  }

  function drawCameraGrid() {
    const canvas = $('grid-overlay');
    const container = $('camera-container');
    if (!canvas || !container) return;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      const ctx = canvas.getContext('2d');
      AequumAnalysis.drawGrid(ctx, canvas.width, canvas.height, {
        spacing: Math.min(canvas.width, canvas.height) / 8,
        color: 'rgba(108, 99, 255, 0.15)',
      });
    };
    resize();
    window.addEventListener('resize', resize);
  }

  function initGyroscope() {
    const bubble = $('level-bubble');
    const valueEl = $('level-value');
    const captureBtn = $('btn-capture');

    // Check if DeviceOrientationEvent is available
    if (!window.DeviceOrientationEvent) {
      // Desktop fallback — enable capture button
      captureBtn.disabled = false;
      valueEl.textContent = 'N/A';
      return;
    }

    // Request permission (iOS 13+)
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(response => {
          if (response === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
            state.gyroWatcher = true;
          } else {
            captureBtn.disabled = false;
          }
        })
        .catch(() => {
          captureBtn.disabled = false;
        });
    } else {
      window.addEventListener('deviceorientation', handleOrientation);
      state.gyroWatcher = true;

      // Desktop fallback timeout
      setTimeout(() => {
        if (state.gyroWatcher && !state._gyroReceived) {
          captureBtn.disabled = false;
          valueEl.textContent = 'N/A';
        }
      }, 1000);
    }
  }

  function handleOrientation(event) {
    state._gyroReceived = true;
    const bubble = $('level-bubble');
    const valueEl = $('level-value');
    const captureBtn = $('btn-capture');

    // beta: front-back tilt (-180 to 180)
    // gamma: left-right tilt (-90 to 90)
    const beta = event.beta || 0;
    const gamma = event.gamma || 0;

    // Deviation from vertical (90° = phone is perfectly upright)
    const pitchDev = Math.abs(beta - 90);
    const rollDev = Math.abs(gamma);
    const totalDev = Math.sqrt(pitchDev * pitchDev + rollDev * rollDev);
    const isLevel = totalDev <= 1.0; // ±1° strict mode

    // Update UI
    valueEl.textContent = `${totalDev.toFixed(1)}°`;
    bubble.classList.toggle('level-ok', isLevel);

    // Move bubble indicator
    const maxOffset = 16;
    const offsetX = Math.max(-maxOffset, Math.min(maxOffset, gamma * 1.5));
    const offsetY = Math.max(-maxOffset, Math.min(maxOffset, (beta - 90) * 1.5));
    bubble.style.setProperty('--offset-x', `${offsetX}px`);
    bubble.style.setProperty('--offset-y', `${offsetY}px`);

    const inner = bubble.querySelector('::after') || bubble;
    if (bubble.style) {
      bubble.style.setProperty('transform', `translate(${offsetX}px, ${offsetY}px)`);
    }

    // Enable capture only when level (strict mode)
    captureBtn.disabled = !isLevel;
  }

  async function handleCapture() {
    const video = $('camera-preview');
    if (!video.srcObject) return;

    // Create canvas from video frame
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Convert to blob
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));

    // Save image to IndexedDB
    const imageId = await AequumDB.saveImage(blob);

    // Stop camera
    cleanupResources();

    showToast('撮影完了');

    // Navigate to analyze page
    navigateTo('analyze', {
      imageBlob: blob,
      imageId: imageId,
      clientId: state.currentClient.id,
      mode: 'new',
    });
  }

  function showImageUploadFallback(clientId) {
    const container = $('camera-container');
    container.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; padding:32px; color:var(--text-secondary);">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.4; margin-bottom:24px;">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
        </svg>
        <p style="font-size:1rem; font-weight:500; margin-bottom:8px;">画像をアップロード</p>
        <p style="font-size:0.85rem; margin-bottom:24px;">カメラが利用できないため、画像ファイルを選択してください</p>
        <label class="btn-primary" style="cursor:pointer;">
          <input type="file" accept="image/*" id="image-upload" style="display:none;">
          ファイルを選択
        </label>
      </div>
    `;

    $('image-upload').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const blob = file;
      const imageId = await AequumDB.saveImage(blob);

      navigateTo('analyze', {
        imageBlob: blob,
        imageId: imageId,
        clientId: clientId,
        mode: 'new',
      });
    });
  }

  // ── Auto Detection (MediaPipe Pose) ─────────────────
  let poseDetector = null;

  async function initPoseDetector() {
    if (poseDetector) return poseDetector;

    showToast('AIモデルを読み込み中...', 'info');
    return new Promise((resolve, reject) => {
      try {
        const pose = new window.Pose({locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
        }});
        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: false,
          enableSegmentation: false,
          smoothSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        pose.onResults(onPoseResults);
        poseDetector = pose;
        
        resolve(pose);
      } catch (err) {
        console.error('MediaPipe initialization failed:', err);
        reject(err);
      }
    });
  }

  async function runAutoDetection() {
    const img = state.analyzeImage;
    if (!img) return;

    try {
      showToast('姿勢を解析中...', 'info');
      
      const pose = await initPoseDetector();
      
      // Some browsers require sending an canvas instead of image element for pose if CORS or natural dims are weird.
      // But standard Image works identically in MP.
      await pose.send({image: img});
      
    } catch (err) {
      console.error(err);
      showToast('自動判定に失敗しました', 'error');
    }
  }

  function onPoseResults(results) {
    if (!results.poseLandmarks) {
      showToast('人物が検出できませんでした', 'error');
      return;
    }

    const mps = results.poseLandmarks; 
    const canvas = $('analyze-canvas');
    if (!canvas || !state.analyzeImage) return;

    const img = state.analyzeImage;
    const { width, height } = canvas;
    const scale = Math.min(width / img.width, height / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const drawX = (width - drawW) / 2;
    const drawY = (height - drawH) / 2;

    const toCanvas = (lp) => {
      return {
        x: drawX + lp.x * drawW,
        y: drawY + lp.y * drawH
      };
    };

    const leftVis = mps[11].visibility + mps[23].visibility + mps[25].visibility;
    const rightVis = mps[12].visibility + mps[24].visibility + mps[26].visibility;
    const useLeft = leftVis >= rightVis;

    const mEar = toCanvas(mps[useLeft ? 7 : 8]);
    const mShoulder = toCanvas(mps[useLeft ? 11 : 12]);
    const mHip = toCanvas(mps[useLeft ? 23 : 24]);
    const mKnee = toCanvas(mps[useLeft ? 25 : 26]);
    const mAnkle = toCanvas(mps[useLeft ? 27 : 28]);

    const mC7 = {
      x: mShoulder.x + (mEar.x - mShoulder.x) * 0.1,
      y: mShoulder.y - (mShoulder.y - mEar.y) * 0.2
    };

    const mHeadVertex = {
      x: mEar.x,
      y: mEar.y - (mShoulder.y - mEar.y) * 0.6
    };

    const mIliac = {
      x: mHip.x,
      y: mHip.y - (mHip.y - mShoulder.y) * 0.15
    };

    state.placedLandmarks = [
      { id: 'lateral_malleolus', name: '外果', x: mAnkle.x, y: mAnkle.y },
      { id: 'knee_joint', name: '膝関節中心', x: mKnee.x, y: mKnee.y },
      { id: 'greater_trochanter', name: '大転子', x: mHip.x, y: mHip.y },
      { id: 'iliac_crest', name: '腸骨稜', x: mIliac.x, y: mIliac.y },
      { id: 'acromion', name: '肩峰', x: mShoulder.x, y: mShoulder.y },
      { id: 'c7_spinous', name: 'C7棘突起', x: mC7.x, y: mC7.y },
      { id: 'ear_tragus', name: '耳珠', x: mEar.x, y: mEar.y },
      { id: 'head_vertex', name: '頭頂', x: mHeadVertex.x, y: mHeadVertex.y }
    ].map(lm => ({...lm, isAutoDetected: true, isManuallyAdjusted: false}));

    recalculateDeviations();
    renderAnalysis();
    showToast('自動判定が完了しました');
  }

  // ──────────────────────────────────────────────────────
  // PAGE: Analyze
  // ──────────────────────────────────────────────────────
  async function initAnalyze(data) {
    const canvas = $('analyze-canvas');
    const container = $('analyze-container');

    let imageBlob;

    if (data.mode === 'view' && data.sessionId) {
      // Load existing session
      const session = await AequumDB.getSession(data.sessionId);
      if (!session) { showToast('セッションが見つかりません', 'error'); goBack(); return; }
      state.currentSession = session;
      state.placedLandmarks = session.landmarks || [];
      state.scaleFactor = session.scaleFactor || null;

      if (session.imageId) {
        imageBlob = await AequumDB.getImage(session.imageId);
      }

      // Load associated client
      state.currentClient = await AequumDB.getClient(session.clientId);
    } else {
      // New session from capture
      imageBlob = data.imageBlob;
      state.currentSession = {
        imageId: data.imageId,
        clientId: data.clientId,
      };
      state.placedLandmarks = [];
      state.scaleFactor = null;
      state.viewZoom = 1;
      state.viewPanX = 0;
      state.viewPanY = 0;

      if (!state.currentClient) {
        state.currentClient = await AequumDB.getClient(data.clientId);
      }
    }

    // Load image
    if (imageBlob) {
      const img = new Image();
      const url = URL.createObjectURL(imageBlob);
      img.onload = () => {
        state.analyzeImage = img;

        // Size canvas to container
        const resizeCanvas = () => {
          const rect = container.getBoundingClientRect();
          canvas.width = rect.width;
          canvas.height = rect.height;
          renderAnalysis();
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // If new, calculate scale factor from client height
        if (state.currentClient && state.currentClient.heightCm) {
          // Will be recalculated after landmark placement
        }

        setupCanvasInteraction(canvas);

        if (data.mode === 'new') {
          setTimeout(runAutoDetection, 100);
        }
      };
      img.src = url;
    }
  }

  function setupCanvasInteraction(canvas) {
    let dragTarget = null;
    let isPanning = false;
    let panStartX = 0, panStartY = 0;
    let pinchStartDist = null;
    let pinchStartZoom = 1;

    // Convert screen pos to world (zoomed/panned) pos
    const screenToWorld = (sx, sy) => {
      return {
        x: (sx - state.viewPanX) / state.viewZoom,
        y: (sy - state.viewPanY) / state.viewZoom,
      };
    };

    const getScreenPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    };

    const getTouchDist = (e) => {
      const t = e.touches;
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const getTouchCenter = (e) => {
      const rect = canvas.getBoundingClientRect();
      const t = e.touches;
      return {
        x: (t[0].clientX + t[1].clientX) / 2 - rect.left,
        y: (t[0].clientY + t[1].clientY) / 2 - rect.top,
      };
    };

    const findNearLandmark = (worldPos, threshold = 20) => {
      const t = threshold / state.viewZoom;
      return state.placedLandmarks.find(l => {
        const dx = l.x - worldPos.x;
        const dy = l.y - worldPos.y;
        return Math.sqrt(dx * dx + dy * dy) < t;
      });
    };

    const clampZoom = (z) => Math.max(0.5, Math.min(5, z));

    // ── Mouse wheel zoom ──
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const oldZoom = state.viewZoom;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      state.viewZoom = clampZoom(oldZoom * delta);

      // Zoom toward cursor
      state.viewPanX = mx - (mx - state.viewPanX) * (state.viewZoom / oldZoom);
      state.viewPanY = my - (my - state.viewPanY) * (state.viewZoom / oldZoom);
      renderAnalysis();
    }, { passive: false });

    // ── Mouse events ──
    canvas.addEventListener('mousedown', (e) => {
      const sp = getScreenPos(e);
      const wp = screenToWorld(sp.x, sp.y);
      const target = findNearLandmark(wp);
      if (target) {
        e.preventDefault();
        dragTarget = target;
        state.selectedLandmark = target.id;
        state.isDragging = true;
        renderAnalysis();
      } else {
        // Start panning
        isPanning = true;
        panStartX = sp.x - state.viewPanX;
        panStartY = sp.y - state.viewPanY;
        canvas.style.cursor = 'grabbing';
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (dragTarget && state.isDragging) {
        e.preventDefault();
        const sp = getScreenPos(e);
        const wp = screenToWorld(sp.x, sp.y);
        dragTarget.x = wp.x;
        dragTarget.y = wp.y;
        dragTarget.isManuallyAdjusted = true;
        renderAnalysis();
      } else if (isPanning) {
        const sp = getScreenPos(e);
        state.viewPanX = sp.x - panStartX;
        state.viewPanY = sp.y - panStartY;
        renderAnalysis();
      }
    });

    const mouseUp = () => {
      if (dragTarget) {
        dragTarget = null;
        state.isDragging = false;
        recalculateDeviations();
        renderAnalysis();
      }
      isPanning = false;
      canvas.style.cursor = '';
    };
    canvas.addEventListener('mouseup', mouseUp);
    canvas.addEventListener('mouseleave', mouseUp);

    // ── Touch events ──
    let touchStartPos = null;

    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        // Pinch start
        e.preventDefault();
        pinchStartDist = getTouchDist(e);
        pinchStartZoom = state.viewZoom;
        isPanning = false;
        dragTarget = null;
        state.isDragging = false;
        touchStartPos = null;
      } else if (e.touches.length === 1) {
        const sp = getScreenPos(e);
        const wp = screenToWorld(sp.x, sp.y);
        // Use a larger threshold for touch (fingers are imprecise)
        const target = findNearLandmark(wp, 35);
        if (target) {
          e.preventDefault();
          dragTarget = target;
          state.selectedLandmark = target.id;
          state.isDragging = true;
          touchStartPos = null;
          renderAnalysis();
        } else {
          // Defer panning — record start pos, but don't commit until moved
          touchStartPos = { x: sp.x, y: sp.y };
          isPanning = false;
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && pinchStartDist !== null) {
        e.preventDefault();
        const center = getTouchCenter(e);
        const newDist = getTouchDist(e);
        const oldZoom = state.viewZoom;
        state.viewZoom = clampZoom(pinchStartZoom * (newDist / pinchStartDist));

        state.viewPanX = center.x - (center.x - state.viewPanX) * (state.viewZoom / oldZoom);
        state.viewPanY = center.y - (center.y - state.viewPanY) * (state.viewZoom / oldZoom);
        renderAnalysis();
      } else if (dragTarget && state.isDragging && e.touches.length === 1) {
        e.preventDefault();
        const sp = getScreenPos(e);
        const wp = screenToWorld(sp.x, sp.y);
        dragTarget.x = wp.x;
        dragTarget.y = wp.y;
        dragTarget.isManuallyAdjusted = true;
        renderAnalysis();
      } else if (e.touches.length === 1) {
        e.preventDefault();
        const sp = getScreenPos(e);
        // Activate panning once finger has moved > 5px from initial touch
        if (touchStartPos && !isPanning) {
          const dx = sp.x - touchStartPos.x;
          const dy = sp.y - touchStartPos.y;
          if (Math.sqrt(dx * dx + dy * dy) > 5) {
            isPanning = true;
            panStartX = touchStartPos.x - state.viewPanX;
            panStartY = touchStartPos.y - state.viewPanY;
          }
        }
        if (isPanning) {
          state.viewPanX = sp.x - panStartX;
          state.viewPanY = sp.y - panStartY;
          renderAnalysis();
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        pinchStartDist = null;
      }
      if (e.touches.length === 0) {
        if (dragTarget) {
          dragTarget = null;
          state.isDragging = false;
          recalculateDeviations();
          renderAnalysis();
        }
        isPanning = false;
        touchStartPos = null;
      }
    });
  }

  function renderAnalysis() {
    const canvas = $('analyze-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Apply zoom/pan transform
    ctx.save();
    ctx.translate(state.viewPanX, state.viewPanY);
    ctx.scale(state.viewZoom, state.viewZoom);

    // Draw image
    if (state.analyzeImage) {
      const img = state.analyzeImage;
      // Fit image to canvas maintaining aspect ratio
      const scale = Math.min(width / img.width, height / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const drawX = (width - drawW) / 2;
      const drawY = (height - drawH) / 2;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    }

    // Draw grid
    if (state.showGrid) {
      AequumAnalysis.drawGrid(ctx, width, height);
    }

    // Draw plumb line
    if (state.showPlumbLine) {
      const plumbX = AequumAnalysis.getPlumbLineX(state.placedLandmarks);
      if (plumbX !== null) {
        AequumAnalysis.drawPlumbLine(ctx, plumbX, height);

        // Draw deviation lines for each non-reference landmark
        const deviations = AequumAnalysis.calculateDeviations(state.placedLandmarks, state.scaleFactor);
        deviations.forEach(dev => {
          const lm = state.placedLandmarks.find(l => l.id === dev.landmarkId);
          if (lm) {
            AequumAnalysis.drawDeviationLine(ctx, lm, plumbX, dev);
          }
        });
      }
    }

    // Draw landmarks
    state.placedLandmarks.forEach(lm => {
      AequumAnalysis.drawLandmark(ctx, lm, {
        selected: lm.id === state.selectedLandmark,
        showLabel: true,
      });
    });

    // Restore transform
    ctx.restore();

    // Update info panel
    updateLandmarkInfoPanel();
  }

  function updateLandmarkInfoPanel() {
    const list = $('landmark-list');
    if (!list) return;

    const deviations = AequumAnalysis.calculateDeviations(state.placedLandmarks, state.scaleFactor);

    if (state.placedLandmarks.length === 0) {
      list.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:16px; font-size:0.82rem;">ツールバーの「追加」からランドマークを配置してください</div>';
      return;
    }

    list.innerHTML = deviations.map(d => {
      const color = d.status === 'ok' ? 'var(--deviation-ok)' :
                    d.status === 'warn' ? 'var(--deviation-warn)' :
                    d.status === 'alert' ? 'var(--deviation-alert)' : 'var(--text-muted)';
      const bgColor = d.status === 'ok' ? 'rgba(0,217,166,0.15)' :
                      d.status === 'warn' ? 'rgba(255,217,61,0.15)' :
                      d.status === 'alert' ? 'rgba(255,107,107,0.15)' : 'rgba(255,255,255,0.05)';
      const sign = d.deviationCm && d.deviationCm > 0 ? '+' : '';

      return `
        <div class="landmark-item">
          <span class="landmark-dot" style="background:${color};"></span>
          <span class="landmark-name">${d.landmarkName}</span>
          <span class="landmark-deviation" style="background:${bgColor}; color:${color};">
            ${d.deviationCm !== null ? `${sign}${d.deviationCm}cm` : '—'}
          </span>
        </div>
      `;
    }).join('');

    // Reference landmark (malleolus)
    const refLm = state.placedLandmarks.find(l => l.id === 'lateral_malleolus');
    if (refLm) {
      const refDef = AequumAnalysis.LANDMARKS.find(d => d.id === 'lateral_malleolus');
      list.innerHTML = `
        <div class="landmark-item">
          <span class="landmark-dot" style="background:${refDef.color};"></span>
          <span class="landmark-name">${refDef.name} (基準点)</span>
          <span class="landmark-deviation" style="background:rgba(108,99,255,0.15); color:var(--primary-light);">基準</span>
        </div>
      ` + list.innerHTML;
    }
  }

  function recalculateDeviations() {
    // Recalculate scale factor
    if (state.currentClient && state.currentClient.heightCm) {
      state.scaleFactor = AequumAnalysis.calculateScaleFactor(
        state.currentClient.heightCm,
        state.placedLandmarks
      );
    }
  }

  function showLandmarkPicker() {
    const modal = $('modal-landmark');
    const picker = $('landmark-picker');

    // Show landmarks that haven't been placed yet
    const placedIds = state.placedLandmarks.map(l => l.id);
    const available = AequumAnalysis.LANDMARKS.filter(l => !placedIds.includes(l.id));

    if (available.length === 0) {
      showToast('すべてのランドマークが配置済みです');
      return;
    }

    picker.innerHTML = available.map(l => `
      <div class="landmark-option" data-id="${l.id}">
        <span class="landmark-dot" style="background:${l.color}; width:14px; height:14px;"></span>
        <div>
          <div style="font-weight:500;">${l.name}</div>
          <div style="font-size:0.78rem; color:var(--text-muted);">${l.nameEn}${l.isReference ? ' (基準点)' : ''}</div>
        </div>
      </div>
    `).join('');

    modal.style.display = '';

    picker.querySelectorAll('.landmark-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const id = opt.dataset.id;
        const def = AequumAnalysis.LANDMARKS.find(d => d.id === id);

        // Place in center of canvas
        const canvas = $('analyze-canvas');
        state.placedLandmarks.push({
          id: def.id,
          name: def.name,
          x: canvas.width / 2,
          y: canvas.height / 2 - (def.order - 3) * 40, // spread vertically
          isAutoDetected: false,
          isManuallyAdjusted: false,
        });

        modal.style.display = 'none';
        recalculateDeviations();
        renderAnalysis();
        showToast(`${def.name} を追加しました — ドラッグで位置を調整`);
      });
    });
  }

  async function handleSaveAnalysis() {
    if (state.placedLandmarks.length === 0) {
      showToast('ランドマークを1つ以上配置してください', 'error');
      return;
    }

    recalculateDeviations();
    const deviations = AequumAnalysis.calculateDeviations(state.placedLandmarks, state.scaleFactor);

    try {
      if (state.currentSession && state.currentSession.id) {
        // Update existing session
        await AequumDB.updateSession(state.currentSession.id, {
          landmarks: state.placedLandmarks,
          deviations: deviations,
          scaleFactor: state.scaleFactor,
        });
      } else {
        // Create new session
        const session = await AequumDB.createSession({
          clientId: state.currentSession.clientId,
          imageId: state.currentSession.imageId,
          landmarks: state.placedLandmarks,
          deviations: deviations,
          scaleFactor: state.scaleFactor,
        });
        state.currentSession = session;
      }

      showToast('解析結果を保存しました');

      // Navigate back to client detail
      setTimeout(() => {
        navigateTo('client-detail', { clientId: state.currentSession.clientId });
      }, 500);
    } catch (err) {
      showToast('保存に失敗しました', 'error');
      console.error(err);
    }
  }

  // ──────────────────────────────────────────────────────
  // PAGE: Compare
  // ──────────────────────────────────────────────────────
  async function initCompare(clientId) {
    if (!clientId && state.currentClient) {
      clientId = state.currentClient.id;
    }
    if (!clientId) { goBack(); return; }

    state.currentClient = await AequumDB.getClient(clientId);
    const sessions = await AequumDB.getSessionsByClient(clientId);

    if (sessions.length < 2) {
      showToast('比較には2回以上の評価が必要です', 'error');
      goBack();
      return;
    }

    // Populate session selectors
    const selectBefore = $('select-before');
    const selectAfter = $('select-after');

    const optionsHtml = sessions.map(s => {
      const date = new Date(s.capturedAt).toLocaleDateString('ja-JP', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      return `<option value="${s.id}">${date}</option>`;
    }).join('');

    selectBefore.innerHTML = optionsHtml;
    selectAfter.innerHTML = optionsHtml;

    // Default: oldest vs newest
    selectBefore.value = sessions[sessions.length - 1].id;
    selectAfter.value = sessions[0].id;

    // Populate landmark selector for trend
    const trendSelect = $('trend-landmark-select');
    trendSelect.innerHTML = AequumAnalysis.LANDMARKS
      .filter(l => !l.isReference)
      .map(l => `<option value="${l.id}">${l.name}</option>`)
      .join('');

    // Event listeners
    selectBefore.addEventListener('change', () => renderComparison(sessions));
    selectAfter.addEventListener('change', () => renderComparison(sessions));
    trendSelect.addEventListener('change', () => renderTrendChart(sessions));

    // Initial render
    renderComparison(sessions);
  }

  async function renderComparison(sessions) {
    const beforeId = $('select-before').value;
    const afterId = $('select-after').value;

    const beforeSession = sessions.find(s => s.id === beforeId);
    const afterSession = sessions.find(s => s.id === afterId);

    if (!beforeSession || !afterSession) return;

    state.compareBeforeSession = beforeSession;
    state.compareAfterSession = afterSession;

    // Side-by-side: render images with landmarks
    await renderComparePanel($('compare-before'), beforeSession, 'Before');
    await renderComparePanel($('compare-after'), afterSession, 'After');

    // Onion skin
    renderOnionSkin(beforeSession, afterSession);
  }

  async function renderComparePanel(container, session, label) {
    container.innerHTML = `<span class="label">${label}</span>`;

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    const imageBlob = session.imageId ? await AequumDB.getImage(session.imageId) : null;
    if (!imageBlob) {
      container.innerHTML += '<div style="text-align:center; color:var(--text-muted); padding:24px;">画像なし</div>';
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(imageBlob);
    img.onload = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      const ctx = canvas.getContext('2d');

      // Draw image
      const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const drawX = (canvas.width - drawW) / 2;
      const drawY = (canvas.height - drawH) / 2;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      // Draw plumb line & landmarks
      const landmarks = session.landmarks || [];
      const plumbX = AequumAnalysis.getPlumbLineX(landmarks);
      if (plumbX !== null) {
        AequumAnalysis.drawPlumbLine(ctx, plumbX, canvas.height, { lineWidth: 1.5 });
      }
      landmarks.forEach(lm => {
        AequumAnalysis.drawLandmark(ctx, lm, { radius: 5, showLabel: false });
      });

      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  async function renderOnionSkin(beforeSession, afterSession) {
    const canvas = $('onion-canvas');
    const slider = $('onion-slider');
    if (!canvas) return;

    const beforeBlob = beforeSession.imageId ? await AequumDB.getImage(beforeSession.imageId) : null;
    const afterBlob = afterSession.imageId ? await AequumDB.getImage(afterSession.imageId) : null;

    if (!beforeBlob || !afterBlob) return;

    const beforeImg = new Image();
    const afterImg = new Image();
    const beforeUrl = URL.createObjectURL(beforeBlob);
    const afterUrl = URL.createObjectURL(afterBlob);

    let ready = 0;
    const onReady = () => {
      ready++;
      if (ready < 2) return;

      const render = () => {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        const ctx = canvas.getContext('2d');
        const alpha = parseInt(slider.value) / 100;

        // Draw before image
        ctx.globalAlpha = 1 - alpha;
        const scale1 = Math.min(canvas.width / beforeImg.width, canvas.height / beforeImg.height);
        ctx.drawImage(beforeImg,
          (canvas.width - beforeImg.width * scale1) / 2,
          (canvas.height - beforeImg.height * scale1) / 2,
          beforeImg.width * scale1,
          beforeImg.height * scale1
        );

        // Draw after image
        ctx.globalAlpha = alpha;
        const scale2 = Math.min(canvas.width / afterImg.width, canvas.height / afterImg.height);
        ctx.drawImage(afterImg,
          (canvas.width - afterImg.width * scale2) / 2,
          (canvas.height - afterImg.height * scale2) / 2,
          afterImg.width * scale2,
          afterImg.height * scale2
        );

        ctx.globalAlpha = 1;
      };

      render();
      slider.addEventListener('input', render);

      URL.revokeObjectURL(beforeUrl);
      URL.revokeObjectURL(afterUrl);
    };

    beforeImg.onload = onReady;
    afterImg.onload = onReady;
    beforeImg.src = beforeUrl;
    afterImg.src = afterUrl;
  }

  async function renderTrendChart(sessions) {
    if (!sessions) {
      const clientId = state.currentClient ? state.currentClient.id : null;
      if (!clientId) return;
      sessions = await AequumDB.getSessionsByClient(clientId);
    }

    const canvas = $('trend-chart');
    if (!canvas) return;

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    const ctx = canvas.getContext('2d');

    const landmarkId = $('trend-landmark-select').value;
    const data = AequumAnalysis.getTrendData(sessions, landmarkId);

    AequumAnalysis.drawTrendChart(ctx, canvas.width, canvas.height, data);
  }

  // ──────────────────────────────────────────────────────
  // PAGE: Report
  // ──────────────────────────────────────────────────────
  async function initReport(sessionId) {
    const session = await AequumDB.getSession(sessionId);
    if (!session) { showToast('セッションが見つかりません', 'error'); goBack(); return; }

    state.currentSession = session;
    const client = await AequumDB.getClient(session.clientId);
    if (!client) { showToast('クライアントが見つかりません', 'error'); goBack(); return; }
    state.currentClient = client;

    const deviations = session.deviations || [];
    const container = $('report-content');

    const date = new Date(session.capturedAt).toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    container.innerHTML = `
      <div class="report-header">
        <h2>姿勢評価レポート</h2>
        <div class="report-meta">${client.name} — ${date}</div>
      </div>

      <table class="report-table">
        <thead>
          <tr>
            <th>ランドマーク</th>
            <th style="text-align:center;">ズレ量</th>
            <th style="text-align:center;">判定</th>
          </tr>
        </thead>
        <tbody>
          ${deviations.map(d => {
            const color = d.status === 'ok' ? 'var(--deviation-ok)' :
                          d.status === 'warn' ? 'var(--deviation-warn)' : 'var(--deviation-alert)';
            const sign = d.deviationCm > 0 ? '+' : '';
            const label = d.status === 'ok' ? '○ 許容範囲' : d.status === 'warn' ? '△ 要注意' : '× 逸脱あり';
            return `
              <tr>
                <td>${d.landmarkName}</td>
                <td style="text-align:center; color:${color}; font-weight:600;">
                  ${d.deviationCm !== null ? `${sign}${d.deviationCm}cm` : '—'}
                </td>
                <td style="text-align:center; color:${color};">${label}</td>
              </tr>
            `;
          }).join('')}
          ${deviations.length === 0 ? '<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">データなし</td></tr>' : ''}
        </tbody>
      </table>

      <div class="report-disclaimer">
        <strong>⚠ 注意事項：</strong><br>
        理想的なアライメントからの逸脱が即座に障害の原因であるとは限りません。
        痛みのない非対称性（Asymmetry）は、多くの場合、正常な身体の適応です。
        本レポートの数値は、あくまで介入の効果測定や経過観察のための参考情報としてご活用ください。
      </div>
    `;
  }

  async function handleExportPDF() {
    if (!state.currentSession || !state.currentClient) return;

    const deviations = state.currentSession.deviations || [];
    const html = AequumAnalysis.generateReportHTML(state.currentClient, state.currentSession, deviations);

    // Open in new window for printing
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
      showToast('印刷ダイアログが開きます');
    } else {
      // Fallback: download as HTML
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aequum_report_${state.currentClient.name}_${new Date().toISOString().slice(0, 10)}.html`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('HTMLレポートをダウンロードしました');
    }
  }

  async function handleShareReport() {
    if (!state.currentSession || !state.currentClient) return;

    const deviations = state.currentSession.deviations || [];
    const text = `Aequum 評価レポート\n${state.currentClient.name}\n${new Date(state.currentSession.capturedAt).toLocaleDateString('ja-JP')}\n\n` +
      deviations.map(d => {
        const sign = d.deviationCm > 0 ? '+' : '';
        return `${d.landmarkName}: ${sign}${d.deviationCm}cm (${d.status === 'ok' ? '許容範囲' : d.status === 'warn' ? '要注意' : '逸脱あり'})`;
      }).join('\n');

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Aequum 評価レポート', text });
        showToast('共有しました');
      } catch (e) {
        // User cancelled
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(text);
        showToast('レポートをクリップボードにコピーしました');
      } catch (e) {
        showToast('共有できませんでした', 'error');
      }
    }
  }

  // ── Utility Functions ────────────────────────────────
  function calculateAge(dob) {
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age >= 0 ? age : null;
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Boot ─────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
