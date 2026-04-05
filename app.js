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
    showInfoPanel: true,
    moveMode: false,
    scaleFactor: null,
    drawState: null,
    // Zoom & Pan
    viewZoom: 1,
    viewPanX: 0,
    viewPanY: 0,
    // Compare
    compareBeforeSession: null,
    compareAfterSession: null,
    // Orientation
    facingDirection: 1, // 1 for right-facing (forward=+X), -1 for left-facing
    // UI filters
    timelineFilter: 'all', // 'all', 'sagittal', 'posterior'
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
        initCamera(data);
        break;
      case 'analyze':
        initAnalyze(data);
        break;
      case 'compare':
        initCompare(data.clientId);
        break;
      case 'report':
        initReport(data);
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
        title.innerHTML = 'Aequum<span style="font-size:0.45em; font-weight:400; opacity:0.5; margin-left:6px; vertical-align:middle;">ver0.52</span>';
        actions.innerHTML = `
          <button id="btn-settings" class="header-btn" aria-label="設定">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
        `;
        setTimeout(() => {
          const btnSet = $('btn-settings');
          if (btnSet) {
            btnSet.addEventListener('click', async () => {
              const clients = await AequumDB.getAllClients();
              const select = $('select-delete-client');
              select.innerHTML = '<option value="">患者を選択...</option>' +
                clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (No.${c.patientNo || '-'})</option>`).join('');
              $('modal-settings').style.display = '';
            });
          }
        }, 0);
        break;
      case 'new-client':
        back.style.display = '';
        title.textContent = '新規患者';
        break;
      case 'client-detail':
        back.style.display = '';
        title.textContent = '患者詳細';
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
        title.innerHTML = 'Aequum<span style="font-size:0.45em; font-weight:400; opacity:0.5; margin-left:6px; vertical-align:middle;">ver0.2</span>';
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
    $('input-patient-no').addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
    });

    // Settings & Disclaimer
    $('btn-show-disclaimer').addEventListener('click', () => {
      $('modal-settings').style.display = 'none';
      $('modal-disclaimer').style.display = '';
    });

    // Timeline Tabs
    $$('#timeline-tabs .tab').forEach(tab => {
      tab.addEventListener('click', async (e) => {
        $$('#timeline-tabs .tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        state.timelineFilter = e.target.dataset.filter;

        if (state.currentClient) {
          const sessions = await AequumDB.getSessionsByClient(state.currentClient.id);
          renderSessionTimeline(sessions);
        }
      });
    });

    $('btn-delete-client-data').addEventListener('click', async () => {
      const select = $('select-delete-client');
      const clientId = select.value;
      if (!clientId) {
        showToast('削除する患者を選択してください', 'error');
        return;
      }
      const clientName = select.options[select.selectedIndex].text;

      if (confirm(`本当に ${clientName} のデータをすべて削除しますか？\\n※この操作は取り消せません。`)) {
        try {
          const sessions = await AequumDB.getSessionsByClient(clientId);
          for (const s of sessions) {
            await AequumDB.deleteSession(s.id);
          }
          await AequumDB.deleteClient(clientId);

          $('modal-settings').style.display = 'none';
          showToast(`${clientName} を削除しました`);
          if (state.currentPage === 'clients') loadClients();
        } catch (err) {
          showToast('削除に失敗しました', 'error');
          console.error(err);
        }
      }
    });

    $('btn-back').addEventListener('click', goBack);
    $('fab-add-client').addEventListener('click', () => navigateTo('new-client'));
    $('form-new-client').addEventListener('submit', handleSaveClient);
    $('client-search').addEventListener('input', handleSearch);
    $('btn-new-session').addEventListener('click', () => {
      if (state.currentClient) {
        state.viewType = 'sagittal';
        navigateTo('capture', { clientId: state.currentClient.id, capturePhase: 'sagittal' });
      }
    });

    // Daily Report Button
    $('btn-daily-report').addEventListener('click', async () => {
      if (!state.currentClient) return;
      const sessions = await AequumDB.getSessionsByClient(state.currentClient.id);

      // Group sessions by date
      const sessionsByDate = {};
      sessions.forEach(s => {
        const dateObj = new Date(s.capturedAt);
        const dateStr = dateObj.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
        if (!sessionsByDate[dateStr]) {
          sessionsByDate[dateStr] = { sagittal: false, posterior: false, dateStr, timestamp: dateObj.getTime() };
        }
        if (s.viewType === 'posterior') {
          sessionsByDate[dateStr].posterior = true;
        } else {
          sessionsByDate[dateStr].sagittal = true;
        }
      });

      const listEl = $('daily-report-date-list');
      const dates = Object.values(sessionsByDate).sort((a, b) => b.timestamp - a.timestamp);

      if (dates.length === 0) {
        listEl.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">評価データがありません</div>';
      } else {
        listEl.innerHTML = dates.map(d => {
          const bothAvailable = d.sagittal && d.posterior;
          return `
            <div class="client-card" style="display:flex; justify-content:space-between; align-items:center; opacity: ${bothAvailable ? '1' : '0.6'}" 
                 data-date="${d.dateStr}" data-both="${bothAvailable}">
              <div>
                <div style="font-weight: 600; font-size: 1rem;">${d.dateStr}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">
                  側面データ: ${d.sagittal ? '✔️' : '未撮影'} / 後面データ: ${d.posterior ? '✔️' : '未撮影'}
                </div>
              </div>
              <button class="btn-outline btn-select-date" style="padding: 6px 12px; font-size: 0.85rem;">選択</button>
            </div>
          `;
        }).join('');

        listEl.querySelectorAll('.client-card').forEach(card => {
          card.querySelector('.btn-select-date').addEventListener('click', () => {
            const dateStr = card.dataset.date;
            if (card.dataset.both === 'false') {
              // Warn but allow? Or strictly block? The prompt expects both, let's allow but it might look incomplete
              // Just close modal and navigate
            }
            $('modal-daily-report-select').style.display = 'none';
            navigateTo('report', { mode: 'daily', clientId: state.currentClient.id, date: dateStr });
          });
        });
      }

      $('modal-daily-report-select').style.display = '';
    });

    // Analyze toolbar
    $('btn-auto-detect').addEventListener('click', runAutoDetection);
    $('btn-toggle-plumb').addEventListener('click', () => {
      state.showPlumbLine = !state.showPlumbLine;
      $('btn-toggle-plumb').classList.toggle('active', state.showPlumbLine);
      renderAnalysis();
    });
    $('btn-toggle-info').addEventListener('click', () => {
      state.showInfoPanel = !state.showInfoPanel;
      $('btn-toggle-info').classList.toggle('active', state.showInfoPanel);
      const panel = $('landmark-info-panel');
      if (panel) panel.style.display = state.showInfoPanel ? '' : 'none';
    });
    $('btn-move-landmark').addEventListener('click', () => {
      state.moveMode = !state.moveMode;
      $('btn-move-landmark').classList.toggle('active', state.moveMode);
      renderAnalysis();
    });
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
    let query = e.target.value.trim();
    // Convert full-width numbers to half-width for better search matching on patient numbers
    query = query.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));

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
      if (c.patientNo) meta.push(`No.${c.patientNo}`);
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
    const patientNo = $('input-patient-no').value.trim();
    const name = $('input-name').value.trim();

    if (!patientNo) {
      $('input-patient-no').classList.add('invalid');
      $('input-patient-no').focus();
      showToast('患者番号を入力してください', 'error');
      return;
    }

    if (!/^\d+$/.test(patientNo)) {
      $('input-patient-no').classList.add('invalid');
      $('input-patient-no').focus();
      showToast('患者番号は数字のみで入力してください', 'error');
      return;
    }

    if (!name) {
      $('input-name').classList.add('invalid');
      $('input-name').focus();
      return;
    }

    const heightStr = $('input-height').value.trim();
    if (!heightStr) {
      $('input-height').classList.add('invalid');
      $('input-height').focus();
      showToast('身長を入力してください', 'error');
      return;
    }

    // Check for duplicate patient number
    const existing = await AequumDB.findClientByPatientNo(patientNo);
    if (existing) {
      $('input-patient-no').classList.add('invalid');
      $('input-patient-no').focus();
      showToast(`患者番号「${patientNo}」は既に登録されています（${existing.name}）`, 'error');
      return;
    }

    try {
      const client = await AequumDB.createClient({
        patientNo,
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
      showToast('患者が見つかりません', 'error');
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

    // Filter sessions based on timelineFilter
    const filteredSessions = sessions.filter(s => {
      if (state.timelineFilter === 'all') return true;
      const sViewType = s.viewType || 'sagittal';
      return sViewType === state.timelineFilter;
    });

    if (filteredSessions.length === 0) {
      timeline.innerHTML = '';
      empty.style.display = '';
      empty.innerHTML = sessions.length === 0
        ? '<p>まだ評価がありません</p><p class="sub">「新規評価」から初回の撮影を行いましょう</p>'
        : '<p style="color:var(--text-muted); font-size:0.9rem;">該当する評価がありません</p>';
      return;
    }

    empty.style.display = 'none';
    timeline.innerHTML = filteredSessions.map(s => {
      const date = new Date(s.capturedAt).toLocaleDateString('ja-JP', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      const viewTypeStr = (s.viewType || 'sagittal') === 'posterior' ? '前額面' : '矢状面';
      const vtColor = (s.viewType || 'sagittal') === 'posterior' ? '#A78BFA' : '#6C63FF';

      const badges = (s.deviations || []).slice(0, 3).map(d => {
        const cls = d.status === 'ok' ? 'badge-ok' : d.status === 'warn' ? 'badge-warn' : 'badge-alert';
        const sign = d.deviationCm > 0 ? '+' : '';
        return `<span class="session-badge ${cls}">${d.landmarkName} ${sign}${d.deviationCm}cm</span>`;
      }).join('');

      return `
        <div class="session-card" data-session-id="${s.id}">
          <div class="session-date">
            ${date}
            <span style="display:inline-block; margin-left:8px; font-size:0.75rem; padding:2px 6px; border-radius:4px; background:${vtColor}15; color:${vtColor};">${viewTypeStr}</span>
          </div>
          <div class="session-summary">${badges || '<span style="color:var(--text-muted); font-size:0.82rem;">ランドマーク未設定</span>'}</div>
          <div class="session-actions">
            <button class="btn-view-session" data-id="${s.id}">詳細</button>
            <button class="btn-compare-session" data-id="${s.id}">比較</button>
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
  }

  // ──────────────────────────────────────────────────────
  // PAGE: Camera / Capture
  // ──────────────────────────────────────────────────────
  async function initCamera(data) {
    const clientId = data.clientId;
    state.currentClient = await AequumDB.getClient(clientId);
    state.capturePhase = data.capturePhase || 'sagittal';
    state.sagittalImageId = data.sagittalImageId || null;
    state.sagittalImageBlob = data.sagittalImageBlob || null;

    // Update instruction overlay
    const instruction = $('capture-instruction');
    if (instruction) {
      if (state.capturePhase === 'sagittal') {
        instruction.textContent = '1/2: 矢状面（側面）を撮影';
      } else {
        instruction.textContent = '2/2: 前額面（背面）を撮影';
      }
    }

    const video = $('camera-preview');
    const captureBtn = $('btn-capture');
    const photoInput = $('photo-upload-input');

    // Always bind photo upload (available alongside camera)
    photoInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const blob = file;
      const imageId = await AequumDB.saveImage(blob);

      cleanupResources();
      showToast('画像を読み込みました');

      // Reset input value to allow selecting the same file again if needed
      e.target.value = '';

      if (state.capturePhase === 'sagittal') {
        navigateTo('capture', {
          clientId: clientId,
          capturePhase: 'posterior',
          sagittalImageBlob: blob,
          sagittalImageId: imageId
        });
      } else {
        navigateTo('analyze', {
          mode: 'dual_new',
          clientId: clientId,
          sagittalImageBlob: state.sagittalImageBlob,
          sagittalImageId: state.sagittalImageId,
          posteriorImageBlob: blob,
          posteriorImageId: imageId,
        });
      }
    };

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('NotSupportedError');
      }
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

      // Capture button (remove event listener first to prevent duplicates)
      captureBtn.removeEventListener('click', handleCapture);
      captureBtn.addEventListener('click', handleCapture);
    } catch (err) {
      console.error('Camera access denied', err);
      if (err.message === 'NotSupportedError') {
        showToast('スマホ(HTTP接続)ではブラウザのセキュリティによりカメラが直接起動できません。隣の「写真アップロード」ボタンをご利用ください', 'error');
      } else {
        showToast('カメラが利用できません。写真をアップロードしてください', 'error');
      }

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
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // ── Draw crosshair lines ──
      const cx = w * 0.5;
      const cy = h * 0.52; // slightly below center for body alignment

      // Vertical dashed line
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
      ctx.stroke();

      // Horizontal dashed line
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(w, cy);
      ctx.stroke();

      // Small teal circle at intersection
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.strokeStyle = '#00C9A7';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();

      // ── Draw silhouette ──
      const phase = state.capturePhase || 'sagittal';
      const silH = h * 0.7;
      const silW = silH * 0.3;
      const silX = cx - silW / 2;
      const silY = h * 0.1;

      // Make the silhouette and its outline much clearer
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = 'rgba(176, 190, 197, 0.25)'; // slightly brighter fill
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'; // distinct white outline
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2; // thicker line

      if (phase === 'posterior') {
        drawPosteriorSilhouette(ctx, silX, silY, silW, silH);
      } else {
        drawSagittalSilhouette(ctx, silX, silY, silW, silH);
      }

      ctx.globalAlpha = 1.0;
    };
    resize();
    window.addEventListener('resize', resize);
  }

  // ── Posterior (front/back) silhouette ──
  function drawPosteriorSilhouette(ctx, x, y, w, h) {
    const cx = x + w / 2;
    // Head
    const headR = w * 0.22;
    ctx.beginPath();
    ctx.arc(cx, y + headR, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Neck
    const neckTop = y + headR * 2;
    const neckW = w * 0.18;
    ctx.beginPath();
    ctx.rect(cx - neckW / 2, neckTop, neckW, h * 0.04);
    ctx.fill(); ctx.stroke();
    // Torso
    const torsoTop = neckTop + h * 0.04;
    const shoulderW = w * 0.95;
    const waistW = w * 0.6;
    const torsoH = h * 0.38;
    ctx.beginPath();
    ctx.moveTo(cx - shoulderW / 2, torsoTop);
    ctx.lineTo(cx + shoulderW / 2, torsoTop);
    ctx.lineTo(cx + waistW / 2, torsoTop + torsoH);
    ctx.lineTo(cx - waistW / 2, torsoTop + torsoH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Arms
    const armW = w * 0.13;
    const armH = h * 0.35;
    ctx.beginPath();
    ctx.roundRect(cx - shoulderW / 2 - armW, torsoTop + h * 0.01, armW, armH, [armW / 2]);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(cx + shoulderW / 2, torsoTop + h * 0.01, armW, armH, [armW / 2]);
    ctx.fill(); ctx.stroke();
    // Hips
    const hipTop = torsoTop + torsoH;
    const hipW = w * 0.65;
    const hipH = h * 0.08;
    ctx.beginPath();
    ctx.ellipse(cx, hipTop + hipH / 2, hipW / 2, hipH / 2, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Legs
    const legTop = hipTop + hipH * 0.6;
    const legW = w * 0.2;
    const legH = h * 0.38;
    const legGap = w * 0.06;
    ctx.beginPath();
    ctx.roundRect(cx - legGap - legW, legTop, legW, legH, [legW / 3]);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(cx + legGap, legTop, legW, legH, [legW / 3]);
    ctx.fill(); ctx.stroke();
  }

  // ── Sagittal (side) silhouette ──
  function drawSagittalSilhouette(ctx, x, y, w, h) {
    const cx = x + w / 2;
    // Head
    const headR = w * 0.3;
    ctx.beginPath();
    ctx.arc(cx + w * 0.05, y + headR, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Neck
    const neckTop = y + headR * 2;
    const neckW = w * 0.2;
    ctx.beginPath();
    ctx.rect(cx - neckW / 2, neckTop, neckW, h * 0.04);
    ctx.fill(); ctx.stroke();
    // Torso (slightly curved for side view)
    const torsoTop = neckTop + h * 0.04;
    const torsoW = w * 0.55;
    const torsoH = h * 0.35;
    ctx.beginPath();
    ctx.moveTo(cx - torsoW * 0.3, torsoTop);
    ctx.quadraticCurveTo(cx + torsoW * 0.4, torsoTop + torsoH * 0.3, cx + torsoW * 0.3, torsoTop + torsoH * 0.6);
    ctx.quadraticCurveTo(cx + torsoW * 0.2, torsoTop + torsoH, cx - torsoW * 0.1, torsoTop + torsoH);
    ctx.quadraticCurveTo(cx - torsoW * 0.5, torsoTop + torsoH * 0.7, cx - torsoW * 0.4, torsoTop + torsoH * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Arm
    const armW = w * 0.13;
    const armH = h * 0.3;
    ctx.beginPath();
    ctx.roundRect(cx + torsoW * 0.1, torsoTop + h * 0.04, armW, armH, [armW / 2]);
    ctx.fill(); ctx.stroke();
    // Hips/buttocks
    const hipTop = torsoTop + torsoH;
    const hipW = w * 0.5;
    const hipH = h * 0.1;
    ctx.beginPath();
    ctx.ellipse(cx, hipTop + hipH * 0.3, hipW / 2, hipH, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Legs (single leg visible from side)
    const legTop = hipTop + hipH * 0.8;
    const legW = w * 0.22;
    const legH = h * 0.38;
    ctx.beginPath();
    ctx.roundRect(cx - legW / 2, legTop, legW, legH, [legW / 3]);
    ctx.fill(); ctx.stroke();
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

    if (state.capturePhase === 'sagittal') {
      navigateTo('capture', {
        clientId: state.currentClient.id,
        capturePhase: 'posterior',
        sagittalImageBlob: blob,
        sagittalImageId: imageId
      });
    } else {
      navigateTo('analyze', {
        mode: 'dual_new',
        clientId: state.currentClient.id,
        sagittalImageBlob: state.sagittalImageBlob,
        sagittalImageId: state.sagittalImageId,
        posteriorImageBlob: blob,
        posteriorImageId: imageId,
      });
    }
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
        const pose = new window.Pose({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
          }
        });
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
      await pose.send({ image: img });

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

    if (state.viewType === 'posterior') {
      const getPt = (idx) => toCanvas(mps[idx]);
      const earLeft = getPt(7);
      const earRight = getPt(8);
      const shoulderLeft = getPt(11);
      const shoulderRight = getPt(12);
      const hipLeft = getPt(23);
      const hipRight = getPt(24);
      const kneeLeft = getPt(25);
      const kneeRight = getPt(26);
      const ankleLeft = getPt(27);
      const ankleRight = getPt(28);
      const heelLeft = getPt(29);
      const heelRight = getPt(30);

      const baseCenter = {
        x: (heelLeft.x + heelRight.x) / 2,
        y: (heelLeft.y + heelRight.y) / 2
      };

      state.placedLandmarks = [
        { id: 'base_center', name: '足部中心', x: baseCenter.x, y: baseCenter.y },
        { id: 'heel_left', name: '左踵', x: heelLeft.x, y: heelLeft.y },
        { id: 'heel_right', name: '右踵', x: heelRight.x, y: heelRight.y },
        { id: 'popliteal_left', name: '左膝窩', x: kneeLeft.x, y: kneeLeft.y },
        { id: 'popliteal_right', name: '右膝窩', x: kneeRight.x, y: kneeRight.y },
        { id: 'psis_left', name: '左PSIS', x: hipLeft.x, y: hipLeft.y - (hipLeft.y - shoulderLeft.y) * 0.1 },
        { id: 'psis_right', name: '右PSIS', x: hipRight.x, y: hipRight.y - (hipRight.y - shoulderRight.y) * 0.1 },
        { id: 'acromion_left', name: '左肩峰', x: shoulderLeft.x, y: shoulderLeft.y },
        { id: 'acromion_right', name: '右肩峰', x: shoulderRight.x, y: shoulderRight.y },
        { id: 'earlobe_left', name: '左耳垂', x: earLeft.x, y: earLeft.y + (shoulderLeft.y - earLeft.y) * 0.1 },
        { id: 'earlobe_right', name: '右耳垂', x: earRight.x, y: earRight.y + (shoulderRight.y - earRight.y) * 0.1 },
      ].map(lm => ({ ...lm, isAutoDetected: true, isManuallyAdjusted: false }));

    } else {
      const mEar = toCanvas(mps[useLeft ? 7 : 8]);
      const mShoulder = toCanvas(mps[useLeft ? 11 : 12]);
      const mHip = toCanvas(mps[useLeft ? 23 : 24]);
      const mKnee = toCanvas(mps[useLeft ? 25 : 26]);
      const mAnkle = toCanvas(mps[useLeft ? 27 : 28]);
      const mToe = toCanvas(mps[useLeft ? 31 : 32]); // foot index (toe)

      // Estimate forward direction using toe
      const forwardX = Math.sign(mToe.x - mAnkle.x) || 1;
      const mEarlobe = { x: mEar.x, y: mEar.y + (mShoulder.y - mEar.y) * 0.1 };
      const mKneeForward = { x: mKnee.x + forwardX * (Math.abs(mToe.x - mAnkle.x) * 0.15), y: mKnee.y };
      const mAnkleForward = { x: mAnkle.x + forwardX * (Math.abs(mToe.x - mAnkle.x) * 0.35), y: mAnkle.y };

      state.facingDirection = forwardX;

      state.placedLandmarks = [
        { id: 'ankle_forward', name: '外果前方', x: mAnkleForward.x, y: mAnkleForward.y },
        { id: 'knee_forward', name: '膝関節', x: mKneeForward.x, y: mKneeForward.y },
        { id: 'greater_trochanter', name: '大転子', x: mHip.x, y: mHip.y },
        { id: 'acromion', name: '肩峰', x: mShoulder.x, y: mShoulder.y },
        { id: 'earlobe', name: '耳垂', x: mEarlobe.x, y: mEarlobe.y }
      ].map(lm => ({ ...lm, isAutoDetected: true, isManuallyAdjusted: false }));
    }

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

    // Hide info panel by default
    state.showInfoPanel = false;
    $('btn-toggle-info').classList.remove('active');
    const panel = $('landmark-info-panel');
    if (panel) panel.style.display = 'none';

    // Disable interactions and hide tools for past records
    state.isReadOnly = (data.mode === 'view');
    $('btn-auto-detect').style.display = state.isReadOnly ? 'none' : '';
    $('btn-toggle-info').style.display = state.isReadOnly ? 'none' : '';
    $('btn-move-landmark').style.display = state.isReadOnly ? 'none' : '';
    $('btn-save-analysis').style.display = state.isReadOnly ? 'none' : '';

    let imageBlob;

    if (data.mode === 'view' && data.sessionId) {
      // Load existing session
      const session = await AequumDB.getSession(data.sessionId);
      if (!session) { showToast('セッションが見つかりません', 'error'); goBack(); return; }
      state.currentSession = session;
      state.placedLandmarks = session.landmarks || [];
      state.scaleFactor = session.scaleFactor || null;
      state.facingDirection = session.facingDirection || 1;
      state.viewType = session.viewType || 'sagittal';

      if (session.imageId) {
        imageBlob = await AequumDB.getImage(session.imageId);
      }

      // Load associated client
      state.currentClient = await AequumDB.getClient(session.clientId);
    } else {
      // New session from capture
      if (data.mode === 'dual_new') {
        state.dualMode = true;
        state.dualPhase = 'sagittal';
        state.sagittalData = { imageId: data.sagittalImageId, imageBlob: data.sagittalImageBlob };
        state.posteriorData = { imageId: data.posteriorImageId, imageBlob: data.posteriorImageBlob };
        imageBlob = data.sagittalImageBlob;
        state.currentSession = { imageId: data.sagittalImageId, clientId: data.clientId };
        state.viewType = 'sagittal';
        $('btn-save-analysis').innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg> 次へ (前額面)';
      } else {
        imageBlob = data.imageBlob;
        state.dualMode = false;
        state.currentSession = {
          imageId: data.imageId,
          clientId: data.clientId,
        };
        $('btn-save-analysis').innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> 保存';
      }

      state.placedLandmarks = [];
      state.scaleFactor = null;
      state.facingDirection = 1;
      state.viewZoom = 1;
      state.viewPanX = 0;
      state.viewPanY = 0;

      if (!state.currentClient) {
        state.currentClient = await AequumDB.getClient(data.clientId);
      }
      // state.viewType is already preserved if navigated from 'capture' mode selector
    }

    // Load image
    if (imageBlob) {
      const img = new Image();
      const url = URL.createObjectURL(imageBlob);
      img.onload = () => {
        state.analyzeImage = img;

        let prevDrawState = null;

        // Size canvas to container
        const resizeCanvas = () => {
          const rect = container.getBoundingClientRect();
          const newW = rect.width;
          const newH = rect.height;

          // If we have an image, calculate the contained drawing bounds
          if (state.analyzeImage) {
            const scale = Math.min(newW / state.analyzeImage.width, newH / state.analyzeImage.height);
            const drawW = state.analyzeImage.width * scale;
            const drawH = state.analyzeImage.height * scale;
            const drawX = (newW - drawW) / 2;
            const drawY = (newH - drawH) / 2;

            if (state.placedLandmarks && state.placedLandmarks.length > 0) {
              state.placedLandmarks.forEach(l => {
                let nx, ny;
                if (l.nx !== undefined && l.ny !== undefined) {
                  // Loaded from DB with normalized coords
                  nx = l.nx;
                  ny = l.ny;
                } else if (prevDrawState) {
                  // Resizing existing canvas (e.g. tablet rotation)
                  nx = (l.x - prevDrawState.drawX) / prevDrawState.drawW;
                  ny = (l.y - prevDrawState.drawY) / prevDrawState.drawH;
                } else if (!l.isAutoDetected) {
                  // Legacy session from DB (no nx/ny and no prevDrawState)
                  // Try to guess the old canvas size (usually max 520px wide)
                  const oldW = Math.min(document.documentElement.clientWidth, 520);
                  const oldH = newH; // Assume height hasn't changed much
                  const oldScale = Math.min(oldW / state.analyzeImage.width, oldH / state.analyzeImage.height);
                  const oDrawW = state.analyzeImage.width * oldScale;
                  const oDrawH = state.analyzeImage.height * oldScale;
                  const oDrawX = (oldW - oDrawW) / 2;
                  const oDrawY = (oldH - oDrawH) / 2;
                  nx = (l.x - oDrawX) / oDrawW;
                  ny = (l.y - oDrawY) / oDrawH;
                }

                if (nx !== undefined) {
                  l.x = drawX + nx * drawW;
                  l.y = drawY + ny * drawH;
                  l.nx = nx;
                  l.ny = ny;
                }
              });
              // Also trigger recalculation of deviations if needed
              if (typeof recalculateDeviations === 'function') {
                recalculateDeviations();
              }
            }
            state.drawState = { drawX, drawY, drawW, drawH };
            prevDrawState = state.drawState;
          }

          canvas.width = newW;
          canvas.height = newH;
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

  function getHandleOffset(landmarkId, scale, viewType) {
    const offsetScreen = 60;
    let sign = 1;
    if (viewType === 'posterior' && landmarkId.includes('_left')) sign = -1;
    return {
      dx: (offsetScreen * sign) / scale,
      dy: -offsetScreen / scale
    };
  }

  function updateBaseCenter() {
    if (state.viewType === 'posterior') {
      const baseCenter = state.placedLandmarks.find(l => l.id === 'base_center');
      const heelLeft = state.placedLandmarks.find(l => l.id === 'heel_left');
      const heelRight = state.placedLandmarks.find(l => l.id === 'heel_right');
      if (baseCenter && heelLeft && heelRight) {
        baseCenter.x = (heelLeft.x + heelRight.x) / 2;
        baseCenter.y = (heelLeft.y + heelRight.y) / 2;
      }
    }
  }

  function setupCanvasInteraction(canvas) {
    let dragTarget = null;
    let isPanning = false;
    let panStartX = 0, panStartY = 0;
    let pinchStartDist = null;
    let pinchStartZoom = 1;
    let pinchStartCenter = null;
    let pinchStartPanX = 0, pinchStartPanY = 0;

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
      if (!state.moveMode) return undefined;
      const t = threshold / state.viewZoom;
      return state.placedLandmarks.find(l => {
        if (l.id === 'base_center') return false;
        const offsetD = getHandleOffset(l.id, state.viewZoom, state.viewType);
        const hx = l.x + offsetD.dx;
        const hy = l.y + offsetD.dy;
        const dx = hx - worldPos.x;
        const dy = hy - worldPos.y;
        return Math.sqrt(dx * dx + dy * dy) < t;
      });
    };

    const clampZoom = (z) => Math.max(0.5, Math.min(1.5, z));

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
      if (target && !state.isReadOnly) {
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
        const offsetD = getHandleOffset(dragTarget.id, state.viewZoom, state.viewType);
        dragTarget.x = wp.x - offsetD.dx;
        dragTarget.y = wp.y - offsetD.dy;
        dragTarget.isManuallyAdjusted = true;
        updateBaseCenter();
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
        pinchStartCenter = getTouchCenter(e);
        pinchStartPanX = state.viewPanX;
        pinchStartPanY = state.viewPanY;
        isPanning = false;
        dragTarget = null;
        state.isDragging = false;
        touchStartPos = null;
      } else if (e.touches.length === 1) {
        const sp = getScreenPos(e);
        const wp = screenToWorld(sp.x, sp.y);
        // Use a larger threshold for touch (fingers are imprecise)
        const target = findNearLandmark(wp, 35);
        if (target && !state.isReadOnly) {
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
      if (e.touches.length === 2 && pinchStartDist !== null && pinchStartDist > 0) {
        e.preventDefault();
        const center = getTouchCenter(e);
        const newDist = getTouchDist(e);

        // Calculate new zoom directly from initial pinch to avoid compounding float errors
        state.viewZoom = clampZoom(pinchStartZoom * (newDist / pinchStartDist));

        // Pan to keep the starting center point anchored while accounting for finger movement
        const zoomRatio = state.viewZoom / pinchStartZoom;
        const panX_fromZoom = pinchStartCenter.x - (pinchStartCenter.x - pinchStartPanX) * zoomRatio;
        const panY_fromZoom = pinchStartCenter.y - (pinchStartCenter.y - pinchStartPanY) * zoomRatio;

        const moveX = center.x - pinchStartCenter.x;
        const moveY = center.y - pinchStartCenter.y;

        state.viewPanX = panX_fromZoom + moveX;
        state.viewPanY = panY_fromZoom + moveY;

        renderAnalysis();
      } else if (dragTarget && state.isDragging && e.touches.length === 1) {
        e.preventDefault();
        const sp = getScreenPos(e);
        const wp = screenToWorld(sp.x, sp.y);
        const offsetD = getHandleOffset(dragTarget.id, state.viewZoom, state.viewType);
        dragTarget.x = wp.x - offsetD.dx;
        dragTarget.y = wp.y - offsetD.dy;
        dragTarget.isManuallyAdjusted = true;
        updateBaseCenter();
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
      if (e.touches.length === 1) {
        // Just transitioned from 2 to 1 touch (e.g. lifted one finger after a pinch)
        // Reset the touch anchor so that 1-finger panning doesn't jump based on an outdated touchStartPos.
        const sp = getScreenPos(e);
        touchStartPos = { x: sp.x, y: sp.y };
        isPanning = false;

        // Ensure no landmark remains stuck dragging by accident
        if (dragTarget) {
          dragTarget = null;
          state.isDragging = false;
        }
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

    // Draw plumb line
    if (state.showPlumbLine) {
      const plumbX = AequumAnalysis.getPlumbLineX(state.placedLandmarks, state.viewType);
      if (plumbX !== null) {
        AequumAnalysis.drawPlumbLine(ctx, plumbX, height);

        // Draw deviation lines for each non-reference landmark
        const deviations = AequumAnalysis.calculateDeviations(state.placedLandmarks, state.scaleFactor, state.facingDirection, state.viewType);
        deviations.forEach(dev => {
          const lm = state.placedLandmarks.find(l => l.id === dev.landmarkId);
          if (lm) {
            AequumAnalysis.drawDeviationLine(ctx, lm, plumbX, dev);
          }
        });
      }
    }

    // Draw landmarks
    const allDeviations = state.showPlumbLine ?
      AequumAnalysis.calculateDeviations(state.placedLandmarks, state.scaleFactor, state.facingDirection, state.viewType) : [];
    state.placedLandmarks.forEach(lm => {
      const isSelected = lm.id === state.selectedLandmark;
      const scale = state.viewZoom;
      const dev = allDeviations.find(d => d.landmarkId === lm.id) || null;
      AequumAnalysis.drawLandmark(ctx, lm, {
        radius: isSelected ? 8 / scale : 6 / scale,
        showLabel: state.showOverlayInfo && !state.isDragging,
        selected: isSelected,
        viewType: state.viewType,
        deviation: dev
      });

      if (state.moveMode && !state.isReadOnly && lm.id !== 'base_center') {
        const offsetD = getHandleOffset(lm.id, scale, state.viewType);
        const hx = lm.x + offsetD.dx;
        const hy = lm.y + offsetD.dy;

        const defs = AequumAnalysis.getLandmarks(state.viewType);
        const lmDef = defs.find(d => d.id === lm.id);
        const color = lmDef ? lmDef.color : '#6C63FF';

        ctx.beginPath();
        ctx.moveTo(lm.x, lm.y);
        ctx.lineTo(hx, hy);
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = color;
        ctx.setLineDash([4 / scale, 4 / scale]);
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0;

        // Draw 4-way move arrow
        const size = 12 / scale;
        const as = size * 0.4;

        ctx.save();
        ctx.translate(hx, hy);

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const drawArrowPath = () => {
          ctx.beginPath();
          ctx.moveTo(-size, 0); ctx.lineTo(size, 0); // H
          ctx.moveTo(0, -size); ctx.lineTo(0, size); // V
          ctx.moveTo(size - as, -as); ctx.lineTo(size, 0); ctx.lineTo(size - as, as); // Right
          ctx.moveTo(-size + as, -as); ctx.lineTo(-size, 0); ctx.lineTo(-size + as, as); // Left
          ctx.moveTo(-as, size - as); ctx.lineTo(0, size); ctx.lineTo(as, size - as); // Down
          ctx.moveTo(-as, -size + as); ctx.lineTo(0, -size); ctx.lineTo(as, -size + as); // Up
        };

        // Add white outline for visibility
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4 / scale;
        drawArrowPath();
        ctx.stroke();

        // Inner color
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 / scale;
        drawArrowPath();
        ctx.stroke();

        // Center dot
        ctx.beginPath();
        ctx.arc(0, 0, 3 / scale, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.restore();
      }
    });

    // Restore transform
    ctx.restore();

    // Update info panel
    updateLandmarkInfoPanel();
  }

  function updateLandmarkInfoPanel() {
    const list = $('landmark-list');
    if (!list) return;

    const deviations = AequumAnalysis.calculateDeviations(state.placedLandmarks, state.scaleFactor, state.facingDirection, state.viewType);

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

    // Reference landmark
    const refId = state.viewType === 'posterior' ? 'base_center' : 'ankle_forward';
    const refLm = state.placedLandmarks.find(l => l.id === refId);
    if (refLm) {
      const defs = AequumAnalysis.getLandmarks(state.viewType);
      const refDef = defs.find(d => d.id === refId);
      if (refDef) {
        list.innerHTML = `
          <div class="landmark-item">
            <span class="landmark-dot" style="background:${refDef.color};"></span>
            <span class="landmark-name">${refDef.name} (基準点)</span>
            <span class="landmark-deviation" style="background:rgba(108,99,255,0.15); color:var(--primary-light);">基準</span>
          </div>
        ` + list.innerHTML;
      }
    }
  }

  function recalculateDeviations() {
    // Recalculate scale factor
    if (state.currentClient && state.currentClient.heightCm) {
      state.scaleFactor = AequumAnalysis.calculateScaleFactor(
        state.currentClient.heightCm,
        state.placedLandmarks,
        state.viewType
      );
    }
  }

  function showLandmarkPicker() {
    const modal = $('modal-landmark');
    const picker = $('landmark-picker');

    // Show landmarks that haven't been placed yet
    const placedIds = state.placedLandmarks.map(l => l.id);
    const defs = AequumAnalysis.getLandmarks(state.viewType);
    const available = defs.filter(l => !placedIds.includes(l.id));

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
        const def = defs.find(d => d.id === id);

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
    const deviations = AequumAnalysis.calculateDeviations(state.placedLandmarks, state.scaleFactor, state.facingDirection, state.viewType);

    // Save normalized coordinates so they adapt seamlessly to any screen size later
    const landmarksToSave = state.placedLandmarks.map(l => {
      const result = { ...l };
      if (state.drawState) {
        result.nx = (l.x - state.drawState.drawX) / state.drawState.drawW;
        result.ny = (l.y - state.drawState.drawY) / state.drawState.drawH;
      }
      return result;
    });

    if (state.dualMode && state.dualPhase === 'sagittal') {
      // Step 1: Save Sagittal data temporarily
      state.sagittalData.landmarks = landmarksToSave;
      state.sagittalData.deviations = deviations;
      state.sagittalData.scaleFactor = state.scaleFactor;
      state.sagittalData.facingDirection = state.facingDirection;

      showToast('矢状面のランドマークを記録しました');

      // Switch to Phase 2
      state.dualPhase = 'posterior';
      state.viewType = 'posterior';
      state.currentSession = { imageId: state.posteriorData.imageId, clientId: state.currentSession.clientId };
      $('btn-save-analysis').innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> 完了 (保存)';

      // Load posterior image
      const img = new Image();
      const url = URL.createObjectURL(state.posteriorData.imageBlob);
      img.onload = () => {
        state.analyzeImage = img;
        state.placedLandmarks = [];
        state.scaleFactor = null;
        state.facingDirection = 1;
        state.viewZoom = 1;
        state.viewPanX = 0;
        state.viewPanY = 0;

        // Force resize to set draw state
        window.dispatchEvent(new Event('resize'));

        setTimeout(runAutoDetection, 100);
      };
      img.src = url;

      return;
    }

    try {
      if (state.dualMode) {
        // Step 2: Save both Sagittal and Posterior sessions
        await AequumDB.createSession({
          clientId: state.currentSession.clientId,
          imageId: state.sagittalData.imageId,
          landmarks: state.sagittalData.landmarks,
          deviations: state.sagittalData.deviations,
          scaleFactor: state.sagittalData.scaleFactor,
          facingDirection: state.sagittalData.facingDirection,
          viewType: 'sagittal',
        });

        // Posterior
        const sessionPos = await AequumDB.createSession({
          clientId: state.currentSession.clientId,
          imageId: state.posteriorData.imageId,
          landmarks: landmarksToSave,
          deviations: deviations,
          scaleFactor: state.scaleFactor,
          facingDirection: state.facingDirection,
          viewType: 'posterior',
        });
        state.currentSession = sessionPos;

        state.dualMode = false;
      } else {
        if (state.currentSession && state.currentSession.id) {
          // Update existing session
          await AequumDB.updateSession(state.currentSession.id, {
            landmarks: landmarksToSave,
            deviations: deviations,
            scaleFactor: state.scaleFactor,
            facingDirection: state.facingDirection,
            viewType: state.viewType,
          });
        } else {
          // Create new session
          const session = await AequumDB.createSession({
            clientId: state.currentSession.clientId,
            imageId: state.currentSession.imageId,
            landmarks: landmarksToSave,
            deviations: deviations,
            scaleFactor: state.scaleFactor,
            facingDirection: state.facingDirection,
            viewType: state.viewType,
          });
          state.currentSession = session;
        }
      }

      showToast('解析結果を保存しました');

      // Navigate back to client detail
      setTimeout(() => {
        // 保存後は「戻る」ボタンで患者一覧へ戻るよう履歴をリセット
        state.navigationStack = [];
        state.currentPage = 'clients';
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
        AequumAnalysis.drawLandmark(ctx, lm, { radius: 5, showLabel: false, viewType: session.viewType || 'sagittal' });
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
  async function initReport(data) {
    state.reportMode = data && data.mode === 'daily' ? 'daily' : 'single';

    if (state.reportMode === 'daily') {
      const { clientId, date: dateStr } = data;
      const client = await AequumDB.getClient(clientId);
      if (!client) { showToast('患者が見つかりません', 'error'); goBack(); return; }
      state.currentClient = client;

      const sessions = await AequumDB.getSessionsByClient(clientId);
      const targetSessions = sessions.filter(s => {
        const ds = new Date(s.capturedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
        return ds === dateStr;
      });

      const sagittalSession = targetSessions.find(s => s.viewType !== 'posterior') || null;
      const posteriorSession = targetSessions.find(s => s.viewType === 'posterior') || null;
      state.currentSession = sagittalSession || posteriorSession || targetSessions[0];

      const container = $('report-content');
      container.innerHTML = await AequumAnalysis.generateCombinedReportHTML(client, sagittalSession, posteriorSession, dateStr);

      setTimeout(() => {
        AequumAnalysis.drawRadarChart('radar-chart-canvas', sagittalSession, posteriorSession);
      }, 50);
      return;
    }

    const sessionId = typeof data === 'string' ? data : data.sessionId;
    const session = await AequumDB.getSession(sessionId);
    if (!session) { showToast('セッションが見つかりません', 'error'); goBack(); return; }

    state.currentSession = session;
    const client = await AequumDB.getClient(session.clientId);
    if (!client) { showToast('患者が見つかりません', 'error'); goBack(); return; }
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
