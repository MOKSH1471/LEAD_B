/**
 * Galileo & Duke — Mobile Radar Client Engine
 * High-End Dark Luxury + Electric Neon Lime UI Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // Global State
  const state = {
    currentScreen: 'screenHome',
    activeRegion: 'Australia',
    activeFlag: '🇦🇺',
    targetCount: 10,
    isDryRun: true,
    leads: [],
    selectedLead: null,
    campaignRunning: false,
    eventSource: null
  };

  // Dynamic API Base URL resolver (for connecting APK to external backend)
  function getApiBase() {
    const saved = localStorage.getItem('GND_BACKEND_URL');
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, '');
    }
    if (window.location.protocol.startsWith('http')) {
      return '';
    }
    return 'http://10.0.2.2:8000';
  }

  // DOM Elements
  const statusTime = document.getElementById('statusTime');
  const islandStatus = document.getElementById('islandStatus');
  const liveBadgeDot = document.getElementById('liveBadgeDot');

  // Backend Config Elements
  const btnConfigBackendUrl = document.getElementById('btnConfigBackendUrl');
  const settingBackendUrlDesc = document.getElementById('settingBackendUrlDesc');

  // Hero Card Elements
  const heroRegionName = document.getElementById('heroRegionName');
  const heroFlag = document.getElementById('heroFlag');
  const cardStatusBadge = document.getElementById('cardStatusBadge');

  // Metric Elements
  const metricTotalDiscovered = document.getElementById('metricTotalDiscovered');
  const metricTileDiscovered = document.getElementById('metricTileDiscovered');
  const metricTileSent = document.getElementById('metricTileSent');
  const chartTotalEmails = document.getElementById('chartTotalEmails');

  // Nav Buttons
  const navButtons = document.querySelectorAll('.nav-btn[data-screen]');
  const screens = document.querySelectorAll('.screen');
  const navPdfExport = document.getElementById('navPdfExport');
  const btnOpenLaunchDrawer = document.getElementById('btnOpenLaunchDrawer');

  // Quick Action Buttons
  const btnQuickLaunch = document.getElementById('btnQuickLaunch');
  const btnQuickPdf = document.getElementById('btnQuickPdf');
  const btnQuickSettings = document.getElementById('btnQuickSettings');
  const btnViewAllLeads = document.getElementById('btnViewAllLeads');
  const btnExportFullPdf = document.getElementById('btnExportFullPdf');

  // Modals & Drawers
  const launchModal = document.getElementById('launchModal');
  const btnCloseLaunchModal = document.getElementById('btnCloseLaunchModal');
  const progressModal = document.getElementById('progressModal');
  const btnStopCampaign = document.getElementById('btnStopCampaign');
  const leadDetailModal = document.getElementById('leadDetailModal');
  const btnCloseLeadDrawer = document.getElementById('btnCloseLeadDrawer');
  const btnDoneLeadDrawer = document.getElementById('btnDoneLeadDrawer');

  // Launch Drawer Controls
  const regionPills = document.querySelectorAll('.region-pill');
  const inputCustomCity = document.getElementById('inputCustomCity');
  const targetRegionHint = document.getElementById('targetRegionHint');
  const btnClearCity = document.getElementById('btnClearCity');
  const heroChangeRegionBtn = document.getElementById('heroChangeRegionBtn');
  const btnSettingChangeCity = document.getElementById('btnSettingChangeCity');
  const settingTargetCityDesc = document.getElementById('settingTargetCityDesc');

  const chipButtons = document.querySelectorAll('.chip-btn');
  const targetCounterDisplay = document.getElementById('targetCounterDisplay');
  const btnModeDryRun = document.getElementById('btnModeDryRun');
  const btnModeLiveSend = document.getElementById('btnModeLiveSend');
  const inputSubjectTemplate = document.getElementById('inputSubjectTemplate');
  const btnStartCampaignNow = document.getElementById('btnStartCampaignNow');

  // Progress Elements
  const progressCount = document.getElementById('progressCount');
  const progressTotal = document.getElementById('progressTotal');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressStatusText = document.getElementById('progressStatusText');
  const liveLeadName = document.getElementById('liveLeadName');
  const liveLeadCity = document.getElementById('liveLeadCity');
  const liveLeadWebsite = document.getElementById('liveLeadWebsite');
  const liveLogConsole = document.getElementById('liveLogConsole');

  // Lists & Search
  const homeLeadsList = document.getElementById('homeLeadsList');
  const analyticsLeadsList = document.getElementById('analyticsLeadsList');
  const leadsSearchInput = document.getElementById('leadsSearchInput');
  const analyticsTabs = document.querySelectorAll('#analyticsTabs .pill-tab');

  // Toast
  const toastAlert = document.getElementById('toastAlert');
  const toastMessage = document.getElementById('toastMessage');

  // Drawer Elements
  const drawerAgencyName = document.getElementById('drawerAgencyName');
  const drawerWebsiteLink = document.getElementById('drawerWebsiteLink');
  const drawerWebsiteText = document.getElementById('drawerWebsiteText');
  const drawerCity = document.getElementById('drawerCity');
  const drawerStatus = document.getElementById('drawerStatus');
  const drawerMailtoLink = document.getElementById('drawerMailtoLink');
  const drawerEmail = document.getElementById('drawerEmail');
  const drawerSubject = document.getElementById('drawerSubject');
  const drawerCompanyLiLink = document.getElementById('drawerCompanyLiLink');
  const drawerFounderLiLink = document.getElementById('drawerFounderLiLink');
  const drawerLiNote = document.getElementById('drawerLiNote');
  const btnCopyLiNote = document.getElementById('btnCopyLiNote');
  const drawerIgLink = document.getElementById('drawerIgLink');
  const drawerIgHandle = document.getElementById('drawerIgHandle');
  const drawerIgDm = document.getElementById('drawerIgDm');
  const btnCopyIgDm = document.getElementById('btnCopyIgDm');

  // 1. Clock in Status Bar (if present)
  function updateClock() {
    if (!statusTime) return;
    const now = new Date();
    const hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    statusTime.textContent = `${hours}:${minutes}`;
  }
  if (statusTime) {
    updateClock();
    setInterval(updateClock, 10000);
  }

  // 2. Toast Alert Helper
  let toastTimer = null;
  function showToast(text, isError = false) {
    if (toastTimer) clearTimeout(toastTimer);
    toastMessage.textContent = text;
    toastAlert.style.borderColor = isError ? 'rgba(255, 68, 68, 0.4)' : 'rgba(255, 255, 255, 0.5)';
    toastAlert.classList.add('visible');
    toastTimer = setTimeout(() => {
      toastAlert.classList.remove('visible');
    }, 2800);
  }

  // 3. Screen Switching
  function switchScreen(targetScreenId) {
    state.currentScreen = targetScreenId;
    screens.forEach(s => s.classList.remove('active'));
    navButtons.forEach(b => b.classList.remove('active'));

    const activeEl = document.getElementById(targetScreenId);
    if (activeEl) activeEl.classList.add('active');

    const activeNavBtn = document.querySelector(`.nav-btn[data-screen="${targetScreenId}"]`);
    if (activeNavBtn) activeNavBtn.classList.add('active');
  }

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const screenId = btn.getAttribute('data-screen');
      if (screenId) switchScreen(screenId);
    });
  });

  if (btnViewAllLeads) {
    btnViewAllLeads.addEventListener('click', () => switchScreen('screenAnalytics'));
  }
  if (btnQuickSettings) {
    btnQuickSettings.addEventListener('click', () => switchScreen('screenSettings'));
  }

  // 4. Drawer & Modal Controls
  function openModal(modalEl) {
    modalEl.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(modalEl) {
    modalEl.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (btnOpenLaunchDrawer) btnOpenLaunchDrawer.addEventListener('click', () => openModal(launchModal));
  if (btnQuickLaunch) btnQuickLaunch.addEventListener('click', () => openModal(launchModal));
  if (btnCloseLaunchModal) btnCloseLaunchModal.addEventListener('click', () => closeModal(launchModal));

  if (launchModal) {
    launchModal.addEventListener('click', (e) => {
      if (e.target === launchModal) closeModal(launchModal);
    });
  }
  if (leadDetailModal) {
    leadDetailModal.addEventListener('click', (e) => {
      if (e.target === leadDetailModal) closeModal(leadDetailModal);
    });
  }

  if (btnCloseLeadDrawer) btnCloseLeadDrawer.addEventListener('click', () => closeModal(leadDetailModal));
  if (btnDoneLeadDrawer) btnDoneLeadDrawer.addEventListener('click', () => closeModal(leadDetailModal));

  // Helper: Detect appropriate country/tag for any typed city
  function detectRegionTag(cityStr) {
    if (!cityStr) return 'Australia';
    const c = cityStr.toLowerCase().trim();
    if (['sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'gold coast', 'byron bay', 'canberra', 'hobart', 'darwin', 'australia'].some(k => c.includes(k))) {
      return 'Australia';
    }
    if (['new york', 'los angeles', 'chicago', 'austin', 'miami', 'san francisco', 'seattle', 'atlanta', 'dallas', 'boston', 'united states', 'usa'].some(k => c.includes(k))) {
      return 'United States';
    }
    if (['london', 'manchester', 'birmingham', 'leeds', 'bristol', 'edinburgh', 'glasgow', 'united kingdom', 'uk'].some(k => c.includes(k))) {
      return 'United Kingdom';
    }
    return '';
  }

  // Core Function: Update target city across the app
  function updateTargetCity(cityName, updateInputBox = false) {
    const trimmed = cityName ? cityName.trim() : '';
    const activeCity = trimmed || 'Australia';
    const countryTag = detectRegionTag(activeCity);

    state.activeRegion = activeCity;
    state.activeFlag = countryTag ? (countryTag === 'Australia' ? 'AU' : countryTag === 'United States' ? 'US' : 'UK') : '📍';

    // Update Hero Card on Home Screen
    heroRegionName.textContent = activeCity.toUpperCase();
    heroFlag.textContent = state.activeFlag;

    // Update input box ONLY when explicitly requested (e.g. pill click, reset)
    // NEVER overwrite input box while user is typing!
    if (updateInputBox && inputCustomCity) {
      inputCustomCity.value = trimmed;
    }

    // Update Drawer controls
    if (targetRegionHint) {
      targetRegionHint.textContent = trimmed ? trimmed : 'Type any city...';
    }

    // Update Settings display
    if (settingTargetCityDesc) {
      settingTargetCityDesc.textContent = trimmed ? `${trimmed}${countryTag && countryTag !== trimmed ? ' (' + countryTag + ')' : ''}` : 'Australia';
    }

    // Sync active pill state
    regionPills.forEach(p => {
      const pRegion = p.getAttribute('data-region').toLowerCase();
      if (pRegion === activeCity.toLowerCase()) {
        p.classList.add('active');
      } else {
        p.classList.remove('active');
      }
    });
  }

  // Region & City Pill Click Handlers
  regionPills.forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      const region = pill.getAttribute('data-region');
      updateTargetCity(region, true);
      showToast(`Target set to ${region}`);
    });
  });

  // Custom City Input Typing Handler
  if (inputCustomCity) {
    inputCustomCity.addEventListener('input', (e) => {
      const val = e.target.value;
      // Update state without overwriting the input box!
      updateTargetCity(val, false);
    });

    inputCustomCity.addEventListener('focus', () => {
      inputCustomCity.select();
    });
  }

  // Clear City Button Handler (Clears input for immediate typing)
  if (btnClearCity) {
    btnClearCity.addEventListener('click', (e) => {
      e.preventDefault();
      if (inputCustomCity) {
        inputCustomCity.value = '';
        inputCustomCity.focus();
      }
      updateTargetCity('', false);
      if (targetRegionHint) targetRegionHint.textContent = 'Type any city...';
    });
  }

  // Hero Card "Tap to change" Handler
  if (heroChangeRegionBtn) {
    heroChangeRegionBtn.addEventListener('click', () => {
      openModal(launchModal);
      if (inputCustomCity) {
        setTimeout(() => inputCustomCity.focus(), 200);
      }
    });
  }

  // Settings Screen "CHANGE 📍" Button Handler
  if (btnSettingChangeCity) {
    btnSettingChangeCity.addEventListener('click', () => {
      openModal(launchModal);
      if (inputCustomCity) {
        setTimeout(() => inputCustomCity.focus(), 200);
      }
    });
  }

  // Target Goal Chips
  chipButtons.forEach(chip => {
    chip.addEventListener('click', () => {
      chipButtons.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.targetCount = parseInt(chip.getAttribute('data-val'), 10);
      targetCounterDisplay.textContent = state.targetCount;
    });
  });

  // Mode Selector (Dry Run vs Live Send)
  btnModeDryRun.addEventListener('click', () => {
    state.isDryRun = true;
    btnModeDryRun.classList.add('active');
    btnModeLiveSend.classList.remove('active');
    btnStartCampaignNow.querySelector('span').textContent = 'START PREVIEW CAMPAIGN';
  });

  btnModeLiveSend.addEventListener('click', () => {
    state.isDryRun = false;
    btnModeLiveSend.classList.add('active');
    btnModeDryRun.classList.remove('active');
    btnStartCampaignNow.querySelector('span').textContent = 'LAUNCH LIVE OUTREACH';
  });

  // 5. Start Campaign Handler
  btnStartCampaignNow.addEventListener('click', async () => {
    closeModal(launchModal);
    openModal(progressModal);

    // Reset Progress modal state
    progressCount.textContent = '0';
    progressTotal.textContent = `/ ${state.targetCount}`;
    progressBarFill.style.width = '0%';
    progressStatusText.textContent = `Deploying radar across ${state.activeRegion}...`;
    liveLeadName.textContent = 'Scanning Google & local agency directories...';
    liveLeadCity.textContent = state.activeRegion;
    liveLeadWebsite.textContent = 'Active Search Engine Stream';
    liveLogConsole.innerHTML = `<div class="log-entry log-info">[Radar] Starting ${state.isDryRun ? 'DRY RUN' : 'LIVE'} outreach in ${state.activeRegion} (Target: ${state.targetCount})</div>`;

    cardStatusBadge.textContent = 'SCANNING...';
    cardStatusBadge.style.color = '#FFFFFF';
    if (islandStatus) islandStatus.textContent = 'Radar Active';
    if (liveBadgeDot) liveBadgeDot.style.display = 'block';

    try {
      const resp = await fetch(`${getApiBase()}/api/campaign/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: state.activeRegion,
          target: state.targetCount,
          dry_run: state.isDryRun,
          subject_template: inputSubjectTemplate.value.trim() || 'Enquiry for {agency_name}'
        })
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || 'Could not start campaign');
      }

      showToast(`Campaign initiated for ${state.activeRegion}`);
      state.campaignRunning = true;
    } catch (err) {
      showToast(err.message, true);
      cardStatusBadge.textContent = 'ENGINE READY';
      if (islandStatus) islandStatus.textContent = 'Radar Idle';
    }
  });

  // Stop Campaign Handler
  if (btnStopCampaign) {
    btnStopCampaign.addEventListener('click', async () => {
      try {
        await fetch(`${getApiBase()}/api/campaign/stop`, { method: 'POST' });
        progressStatusText.textContent = 'Halting engine gracefully...';
        showToast('Stopping campaign...');
      } catch (err) {
        showToast('Error stopping campaign', true);
      }
    });
  }

  // 6. Real-time SSE Connection
  function setupSSE() {
    if (state.eventSource) {
      state.eventSource.close();
    }

    state.eventSource = new EventSource(`${getApiBase()}/api/campaign/stream`);

    state.eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerEvent(msg);
      } catch (e) {
        // Heartbeat or parsing ignore
      }
    };

    state.eventSource.onerror = () => {
      // Reconnect after brief pause
      setTimeout(() => {
        if (!state.eventSource || state.eventSource.readyState === EventSource.CLOSED) {
          setupSSE();
        }
      }, 3000);
    };
  }

  function handleServerEvent(msg) {
    const { type, data } = msg;

    if (type === 'init') {
      if (data.is_running) {
        state.campaignRunning = true;
        cardStatusBadge.textContent = 'ENGINE ACTIVE';
        if (islandStatus) islandStatus.textContent = 'Scanning Agencies';
        if (liveBadgeDot) liveBadgeDot.style.display = 'block';
      }
    } else if (type === 'campaign_started') {
      state.campaignRunning = true;
      cardStatusBadge.textContent = 'RADAR RUNNING';
      if (islandStatus) islandStatus.textContent = `${data.region} Active`;
      if (liveBadgeDot) liveBadgeDot.style.display = 'block';
    } else if (type === 'lead_inspecting') {
      liveLeadName.textContent = data.name;
      liveLeadCity.textContent = data.city || state.activeRegion;
      liveLeadWebsite.textContent = data.website || '-';
      progressStatusText.textContent = `Inspecting #${data.inspected_count}: ${data.name}...`;

      appendLog(`[Inspect] Checking tech stack of ${data.name} (${data.website})`, 'log-info');
    } else if (type === 'lead_skipped') {
      appendLog(`[Skip] ${data.name} — ${data.reason}`, 'log-skip');
    } else if (type === 'lead_processed') {
      const { lead, current, target, mode } = data;
      progressCount.textContent = current;
      progressTotal.textContent = `/ ${target}`;
      const pct = Math.min(100, Math.round((current / target) * 100));
      progressBarFill.style.width = `${pct}%`;

      progressStatusText.textContent = `${mode === 'sent' ? 'Delivered email to' : 'Qualified lead:'} ${lead.agency_name}`;
      appendLog(`[${mode === 'sent' ? 'SENT' : 'QUALIFIED'}] ${lead.agency_name} <${lead.email}>`, 'log-success');

      // Refresh background leads data and counters
      loadStats();
      loadLeads();
    } else if (type === 'lead_failed') {
      appendLog(`[Error] Failed ${data.name}: ${data.error}`, 'log-error');
    } else if (type === 'campaign_stopped') {
      state.campaignRunning = false;
      progressStatusText.textContent = 'Campaign stopped by user.';
      cardStatusBadge.textContent = 'ENGINE READY';
      if (islandStatus) islandStatus.textContent = 'Radar Idle';
      if (liveBadgeDot) liveBadgeDot.style.display = 'none';
      appendLog('[System] Outreach engine stopped.', 'log-info');
    } else if (type === 'campaign_completed') {
      state.campaignRunning = false;
      progressStatusText.textContent = `Campaign Completed! ${data.sent_count} leads ready.`;
      cardStatusBadge.textContent = 'FINISHED';
      if (islandStatus) islandStatus.textContent = 'Ready';
      if (liveBadgeDot) liveBadgeDot.style.display = 'none';
      progressBarFill.style.width = '100%';
      appendLog(`[Done] Campaign completed! Generated fresh PDF dossier.`, 'log-success');

      showToast(`Campaign Complete! ${data.sent_count} leads processed.`);
      loadStats();
      loadLeads();
    }
  }

  function appendLog(text, className = '') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${className}`;
    entry.textContent = text;
    liveLogConsole.appendChild(entry);
    liveLogConsole.scrollTop = liveLogConsole.scrollHeight;
  }

  // 7. Load Stats & Leads Data
  async function loadStats() {
    try {
      const resp = await fetch(`${getApiBase()}/api/stats`);
      if (!resp.ok) return;
      const data = await resp.json();

      metricTotalDiscovered.textContent = data.total_discovered || 0;
      metricTileDiscovered.textContent = data.total_discovered || 0;
      metricTileSent.textContent = data.total_contacted || 0;
      chartTotalEmails.textContent = data.total_contacted || 0;

      // Update Settings fields
      const senderEl = document.getElementById('settingSenderEmail');
      if (senderEl) senderEl.textContent = data.sender_email;
      const geminiEl = document.getElementById('settingGeminiModel');
      if (geminiEl) geminiEl.textContent = data.gemini_model;
      const limitEl = document.getElementById('settingDailyLimit');
      if (limitEl) limitEl.textContent = `${data.daily_limit} / day`;
    } catch (err) {
      console.warn('Error loading stats:', err);
    }
  }

  async function loadLeads() {
    try {
      const resp = await fetch(`${getApiBase()}/api/leads?limit=60`);
      if (!resp.ok) {
        if (homeLeadsList) {
          homeLeadsList.innerHTML = `
            <div class="empty-state">
              <span>Could not load leads (HTTP ${resp.status}). Tap Settings to verify server.</span>
            </div>`;
        }
        return;
      }
      const data = await resp.json();
      state.leads = data.leads || [];

      renderHomeLeads(state.leads.slice(0, 5));
      renderAnalyticsLeads(state.leads);
    } catch (err) {
      console.warn('Error loading leads:', err);
      if (homeLeadsList) {
        homeLeadsList.innerHTML = `
          <div class="empty-state">
            <span>Unable to connect to backend engine. Tap Settings ⚙️ to configure server.</span>
          </div>`;
      }
    }
  }

  // Render recent leads on Home screen (matches reference "Recent Transfers" list)
  function renderHomeLeads(leads) {
    if (!homeLeadsList) return;
    if (leads.length === 0) {
      homeLeadsList.innerHTML = `
        <div class="empty-state">
          <span>No outreach leads yet. Tap "+" or "Launch" to start!</span>
        </div>`;
      return;
    }

    homeLeadsList.innerHTML = leads.map((lead, idx) => `
      <div class="lead-item" data-index="${idx}" onclick="window.openLeadDetails(${idx})">
        <div class="lead-avatar-col">
          <div class="lead-monogram ${lead.is_sent ? 'avatar-sent' : 'avatar-disc'}">
            ${getInitials(lead.agency_name)}
          </div>
        </div>
        <div class="lead-info-col">
          <div class="lead-name-row">
            <span class="lead-name">${escapeHtml(lead.agency_name)}</span>
          </div>
          <span class="lead-meta">${escapeHtml(lead.city || 'Australia')} • ${escapeHtml(lead.email || 'Email verified')}</span>
        </div>
        <div class="lead-right-col">
          <span class="lead-badge ${lead.is_sent ? 'badge-sent' : 'badge-preview'}">
            ${lead.is_sent ? 'SENT' : 'READY'}
          </span>
          <span class="lead-channel-icons">
            ${lead.linkedin_url ? '<span title="LinkedIn Found">💼</span>' : ''}
            ${lead.instagram_handle && lead.instagram_handle !== 'Not Listed' ? '<span title="Instagram Found">📸</span>' : ''}
          </span>
        </div>
      </div>
    `).join('');
  }

  // Render filtered leads in Analytics / Explorer screen
  function renderAnalyticsLeads(leads) {
    if (!analyticsLeadsList) return;
    if (leads.length === 0) {
      analyticsLeadsList.innerHTML = `<div class="empty-state"><span>No matching agencies found.</span></div>`;
      return;
    }

    analyticsLeadsList.innerHTML = leads.map((lead, idx) => `
      <div class="lead-item" data-index="${idx}" onclick="window.openLeadDetails(${idx})">
        <div class="lead-avatar-col">
          <div class="lead-monogram ${lead.is_sent ? 'avatar-sent' : 'avatar-disc'}">
            ${getInitials(lead.agency_name)}
          </div>
        </div>
        <div class="lead-info-col">
          <div class="lead-name-row">
            <span class="lead-name">${escapeHtml(lead.agency_name)}</span>
          </div>
          <span class="lead-meta">${escapeHtml(lead.city || 'Australia')} • ${escapeHtml(lead.email || '-')}</span>
        </div>
        <div class="lead-right-col">
          <span class="lead-badge ${lead.is_sent ? 'badge-sent' : 'badge-preview'}">
            ${lead.is_sent ? 'SENT' : 'READY'}
          </span>
          <span class="chevron-arrow">›</span>
        </div>
      </div>
    `).join('');
  }

  // Filter Search
  if (leadsSearchInput) {
    leadsSearchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        renderAnalyticsLeads(state.leads);
        return;
      }
      const filtered = state.leads.filter(l => 
        (l.agency_name && l.agency_name.toLowerCase().includes(q)) ||
        (l.city && l.city.toLowerCase().includes(q)) ||
        (l.email && l.email.toLowerCase().includes(q)) ||
        (l.specialties && l.specialties.toLowerCase().includes(q))
      );
      renderAnalyticsLeads(filtered);
    });
  }

  // Analytics Filter Tabs
  analyticsTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      analyticsTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const type = tab.getAttribute('data-tab');

      if (type === 'daily') {
        renderAnalyticsLeads(state.leads.filter(l => l.is_sent));
      } else if (type === 'weekly') {
        renderAnalyticsLeads(state.leads.filter(l => !l.is_sent));
      } else {
        renderAnalyticsLeads(state.leads);
      }
    });
  });

  // 8. Open Lead Detail Drawer (Exposed globally for row clicks)
  window.openLeadDetails = function(index) {
    const lead = state.leads[index];
    if (!lead) return;
    state.selectedLead = lead;

    drawerAgencyName.textContent = lead.agency_name;
    drawerWebsiteText.textContent = lead.website ? cleanWebsiteUrl(lead.website) : 'Website';
    drawerWebsiteLink.href = lead.website || '#';
    drawerCity.textContent = lead.city || 'Australia';
    
    drawerStatus.textContent = lead.is_sent ? 'CONTACTED' : 'READY TO OUTREACH';
    drawerStatus.className = `lead-status-pill ${lead.is_sent ? 'status-sent' : 'status-ready'}`;

    drawerEmail.textContent = lead.email || 'No public email';
    drawerSubject.textContent = lead.subject || `Enquiry for ${lead.agency_name}`;
    drawerMailtoLink.href = lead.email ? `mailto:${lead.email}?subject=${encodeURIComponent(lead.subject || `Enquiry for ${lead.agency_name}`)}` : '#';

    // LinkedIn Links
    if (lead.linkedin_url && lead.linkedin_url.length > 5) {
      drawerCompanyLiLink.href = lead.linkedin_url;
      drawerCompanyLiLink.style.display = 'inline-flex';
    } else {
      drawerCompanyLiLink.style.display = 'none';
    }
    drawerFounderLiLink.href = lead.founder_search_url || `https://www.google.com/search?q=site:linkedin.com/in+%22Founder%22+%22${encodeURIComponent(lead.agency_name)}%22`;

    // LinkedIn Connection Note
    const liNote = lead.linkedin_note || `Hi! Loved your marketing client work in ${lead.city || 'Australia'}. We help creative & PR teams handle complex web engineering without hiring in-house devs. Would love to connect!`;
    drawerLiNote.textContent = liNote;

    // Instagram Links & DMs
    const hasIg = lead.instagram_handle && lead.instagram_handle !== 'Not Listed';
    if (hasIg) {
      drawerIgHandle.textContent = lead.instagram_handle;
      drawerIgLink.href = lead.instagram_url || `https://instagram.com/${lead.instagram_handle.replace('@', '')}`;
      drawerIgLink.style.display = 'inline-flex';
    } else {
      drawerIgHandle.textContent = 'Not listed on homepage';
      drawerIgLink.style.display = 'none';
    }

    const igDm = lead.instagram_dm || `Hey ${lead.agency_name}! Huge fan of your campaigns in ${lead.city || 'Australia'}. Do you ever take on clients needing bespoke web apps or custom Shopify engineering? We partner with marketing studios as a white-label dev arm. Let's chat!`;
    drawerIgDm.textContent = igDm;

    openModal(leadDetailModal);
  };

  // Copy Buttons in Lead Detail Drawer
  if (btnCopyLiNote) {
    btnCopyLiNote.addEventListener('click', async () => {
      const text = drawerLiNote.textContent;
      try {
        await navigator.clipboard.writeText(text);
        showToast('LinkedIn Note copied to clipboard!');
      } catch (e) {
        fallbackCopyTextToClipboard(text);
      }
    });
  }

  if (btnCopyIgDm) {
    btnCopyIgDm.addEventListener('click', async () => {
      const text = drawerIgDm.textContent;
      try {
        await navigator.clipboard.writeText(text);
        showToast('Instagram DM copied to clipboard!');
      } catch (e) {
        fallbackCopyTextToClipboard(text);
      }
    });
  }

  // 9. PDF Dossier Downloads (Safe In-App Download)
  async function triggerPdfDownload() {
    showToast('Preparing Executive PDF Dossier...');
    try {
      // 1. Generate/refresh PDF on server
      const genResp = await fetch(`${getApiBase()}/api/generate-pdf`, { method: 'POST' });
      if (!genResp.ok) {
        const errData = await genResp.json().catch(() => ({}));
        showToast(errData.detail || 'No leads in pipeline yet. Launch a campaign first!', true);
        return;
      }

      // 2. Fetch the generated PDF as a Blob to download without leaving the app
      showToast('Downloading PDF Dossier...');
      const downloadUrl = `${getApiBase()}/api/download-pdf`;
      const pdfResp = await fetch(downloadUrl);
      if (!pdfResp.ok) {
        showToast('PDF file not available yet. Please try again.', true);
        return;
      }

      const blob = await pdfResp.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const tempLink = document.createElement('a');
      tempLink.href = blobUrl;
      tempLink.setAttribute('download', 'Galileo_Duke_Leads_Dossier.pdf');
      tempLink.style.display = 'none';
      document.body.appendChild(tempLink);
      tempLink.click();
      document.body.removeChild(tempLink);
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10000);
      showToast('PDF Dossier downloaded successfully!');
    } catch (err) {
      console.warn('PDF download error:', err);
      // Fallback: Open in external browser without replacing current WebView
      window.open(`${getApiBase()}/api/download-pdf`, '_system');
    }
  }

  if (btnQuickPdf) btnQuickPdf.addEventListener('click', triggerPdfDownload);
  if (navPdfExport) navPdfExport.addEventListener('click', triggerPdfDownload);
  if (btnExportFullPdf) btnExportFullPdf.addEventListener('click', triggerPdfDownload);

  // Backend URL configuration handler
  function updateBackendUrlDisplay() {
    if (settingBackendUrlDesc) {
      const saved = localStorage.getItem('GND_BACKEND_URL');
      if (saved && saved.trim()) {
        settingBackendUrlDesc.textContent = saved.trim();
      } else if (window.location.protocol.startsWith('http')) {
        settingBackendUrlDesc.textContent = `${window.location.origin} (Auto)`;
      } else {
        settingBackendUrlDesc.textContent = 'http://10.0.2.2:8000 (Default)';
      }
    }
  }
  updateBackendUrlDisplay();

  if (btnConfigBackendUrl) {
    btnConfigBackendUrl.addEventListener('click', () => {
      const current = localStorage.getItem('GND_BACKEND_URL') || (window.location.protocol.startsWith('http') ? window.location.origin : 'http://10.0.2.2:8000');
      const entered = prompt('Enter your External Backend URL (e.g. https://your-server.onrender.com or http://192.168.1.X:8000):', current);
      if (entered !== null) {
        const clean = entered.trim().replace(/\/+$/, '');
        if (clean) {
          localStorage.setItem('GND_BACKEND_URL', clean);
          showToast(`Connected backend to: ${clean}`);
        } else {
          localStorage.removeItem('GND_BACKEND_URL');
          showToast('Backend reset to auto-detect');
        }
        updateBackendUrlDisplay();
        setupSSE();
        loadStats();
        loadLeads();
      }
    });
  }

  // Helper Functions
  function getInitials(name) {
    if (!name) return 'GD';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function cleanWebsiteUrl(url) {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      return parsed.hostname.replace(/^www\./, '');
    } catch (e) {
      return url;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.position = 'fixed';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      showToast('Copied to clipboard!');
    } catch (err) {
      showToast('Copy failed, please select manually', true);
    }
    document.body.removeChild(textArea);
  }

  // Initial Boot
  setupSSE();
  loadStats();
  loadLeads();
});
