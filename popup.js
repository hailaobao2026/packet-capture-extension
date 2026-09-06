// === DOM ===
const $ = (id) => document.getElementById(id);

const captureBtn = $('captureBtn');
const aiAnalyzeBtn = $('aiAnalyzeBtn');
const exportHarBtn = $('exportHarBtn');
const exportJsonBtn = $('exportJsonBtn');
const clearBtn = $('clearBtn');
const statusBadge = $('statusBadge');
const searchInput = $('searchInput');
const methodFilter = $('methodFilter');
const statusFilter = $('statusFilter');
const requestCount = $('requestCount');
const requestList = $('requestList');
const detailPanel = $('detailPanel');
const detailContent = $('detailContent');
const detailTitle = $('detailTitle');
const closeDetailBtn = $('closeDetailBtn');
const archiveList = $('archiveList');
const aiProvider = $('aiProvider');
const aiBaseUrl = $('aiBaseUrl');
const aiModelsBaseUrl = $('aiModelsBaseUrl');
const aiApiKey = $('aiApiKey');
const aiModel = $('aiModel');
const aiCustomModelRow = $('aiCustomModelRow');
const aiCustomModel = $('aiCustomModel');
const aiIncludeBodies = $('aiIncludeBodies');
const aiRedactSensitive = $('aiRedactSensitive');
const aiMaxRequests = $('aiMaxRequests');
const aiSaveBtn = $('aiSaveBtn');
const aiLoadModelsBtn = $('aiLoadModelsBtn');
const aiRunBtn = $('aiRunBtn');
const aiCopyBtn = $('aiCopyBtn');
const aiStatus = $('aiStatus');
const aiResult = $('aiResult');

let capturing = false;
let currentTabId = null;
let currentSessionId = null;
let selectedSessionId = null;
let selectedReqId = null;
let allRequests = [];
let refreshTimer = null;
let aiLoading = false;
let latestAIAnalysis = '';

const AI_CONFIG_KEY = 'aiConfig';
const AI_KEY_MATERIAL_KEY = 'aiKeyMaterial';
const AI_DEFAULT_BASE_URL = {
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com'
};
const AI_MODEL_PLACEHOLDER = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest'
};
const AI_CUSTOM_MODEL_VALUE = '__custom__';

// === Init ===
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id;

  // Tab switching
  document.querySelectorAll('.tab').forEach(tabEl => {
    tabEl.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tabEl.classList.add('active');
      $(tabEl.dataset.tab + 'Tab').classList.add('active');
      if (tabEl.dataset.tab === 'archive') loadArchives();
      if (tabEl.dataset.tab === 'ai') updateAIButtons();
    });
  });

  await loadAIConfig();
  await refreshStatus();
  await refreshRequests();
  startAutoRefresh();
}

// === Messaging ===
function sendMsg(msg) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(msg, resp => resolve(resp || {}));
  });
}

// === Status ===
async function refreshStatus() {
  const s = await sendMsg({ action: 'getStatus' });
  capturing = s.capturing;
  currentSessionId = s.sessionId || null;
  if (capturing) selectedSessionId = currentSessionId;
  if (!selectedSessionId) selectedSessionId = currentSessionId || s.lastSessionId || null;
  updateUI();
}

function updateUI() {
  if (capturing) {
    statusBadge.textContent = '抓包中...';
    statusBadge.className = 'status-badge capturing';
    captureBtn.textContent = '停止抓包';
    captureBtn.classList.add('active');
  } else {
    statusBadge.textContent = '未启动';
    statusBadge.className = 'status-badge';
    captureBtn.textContent = '开始抓包';
    captureBtn.classList.remove('active');
  }
  exportHarBtn.disabled = allRequests.length === 0;
  exportJsonBtn.disabled = allRequests.length === 0;
  clearBtn.disabled = allRequests.length === 0;
  updateAIButtons();
}

// === Requests ===
async function refreshRequests() {
  const resp = await sendMsg({
    action: 'getRequests',
    sessionId: selectedSessionId || undefined,
    filters: {
      search: searchInput.value || undefined,
      method: methodFilter.value || undefined,
      status: statusFilter.value || undefined
    }
  });
  if (resp.ok) {
    allRequests = resp.requests;
    renderList();
    updateUI();
  }
}

function renderList() {
  requestCount.textContent = `共 ${allRequests.length} 条请求`;
  if (allRequests.length === 0) {
    requestList.innerHTML = '<div class="empty-state">暂无数据，点击「开始抓包」捕获请求</div>';
    return;
  }

  const items = [...allRequests].reverse();
  requestList.innerHTML = items.map(r => {
    const url = fmtUrl(r.url);
    const statusClass = r.failed ? 's-err' : r.status === 0 ? 's-pending' : `s-${String(r.status)[0]}xx`;
    return `<div class="request-item${r.id === selectedReqId ? ' selected' : ''}" data-id="${r.id}">
      <span class="method-badge m-${r.method}">${r.method}</span>
      <span class="status-code ${statusClass}">${r.failed ? 'ERR' : r.status || '...'}</span>
      <span class="req-url" title="${esc(r.url)}">${esc(url)}</span>
      <span class="req-size">${fmtSize(r.size)}</span>
      <span class="req-time">${fmtTime(r.duration)}</span>
    </div>`;
  }).join('');

  requestList.querySelectorAll('.request-item').forEach(el => {
    el.addEventListener('click', () => showDetail(parseInt(el.dataset.id)));
  });
}

// === Detail ===
async function showDetail(id) {
  selectedReqId = id;
  requestList.querySelectorAll('.request-item').forEach(el => {
    el.classList.toggle('selected', parseInt(el.dataset.id) === id);
  });

  const resp = await sendMsg({ action: 'getRequestDetail', id });
  if (!resp.ok || !resp.request) return;

  const r = resp.request;
  detailTitle.textContent = `${r.method} ${r.status || '...'}`;
  detailPanel.classList.add('visible');

  let html = `<div class="detail-actions">
      <button class="btn btn-ai btn-sm" id="analyzeRequestBtn" data-id="${r.id}">AI分析此请求</button>
    </div>
    <div class="detail-section"><h3>General</h3>
    <dl class="detail-meta">
      <dt>URL</dt><dd>${esc(r.url)}</dd>
      <dt>Method</dt><dd>${r.method}</dd>
      <dt>Status</dt><dd>${r.status} ${esc(r.statusText)}</dd>
      <dt>Type</dt><dd>${r.resourceType}</dd>
      <dt>Time</dt><dd>${fmtTime(r.duration)}</dd>
      <dt>Size</dt><dd>${fmtSize(r.size)}</dd>
    </dl></div>`;

  if (r.requestHeaders && Object.keys(r.requestHeaders).length) {
    html += `<div class="detail-section"><h3>Request Headers</h3><pre>${esc(fmtHeaders(r.requestHeaders))}</pre></div>`;
  }
  if (r.requestBody) {
    html += `<div class="detail-section"><h3>Request Body</h3><pre>${esc(fmtBody(r.requestBody))}</pre></div>`;
  }
  if (r.responseHeaders && Object.keys(r.responseHeaders).length) {
    html += `<div class="detail-section"><h3>Response Headers</h3><pre>${esc(fmtHeaders(r.responseHeaders))}</pre></div>`;
  }
  if (r.responseBody) {
    html += `<div class="detail-section"><h3>Response Body</h3><pre>${esc(fmtBody(r.responseBody))}</pre></div>`;
  }
  if (r.failed) {
    html += `<div class="detail-section"><h3>Error</h3><pre style="color:#e57373">${esc(r.errorText)}</pre></div>`;
  }

  detailContent.innerHTML = html;
  $('analyzeRequestBtn')?.addEventListener('click', () => runAIAnalysisForRequest(r.id));
}

// === Archives ===
async function loadArchives() {
  const resp = await sendMsg({ action: 'getSessions' });
  if (!resp.ok) return;
  const sessions = resp.sessions;

  if (sessions.length === 0) {
    archiveList.innerHTML = '<div class="empty-state">暂无归档记录</div>';
    return;
  }

  archiveList.innerHTML = sessions.map(s => {
    const dur = s.endTime ? fmtTime(s.endTime - s.startTime) : '进行中';
    const date = new Date(s.startTime).toLocaleString('zh-CN');
    return `<div class="archive-item" data-sid="${s.id}">
      <div class="archive-info">
        <div class="archive-name">${esc(s.name || date)}</div>
        <div class="archive-meta">${s.requestCount} 条请求 | ${dur} | ${date}</div>
      </div>
      <div class="archive-actions">
        <button class="btn btn-secondary btn-sm archive-view" data-sid="${s.id}">查看</button>
        <button class="btn btn-secondary btn-sm archive-export-har" data-sid="${s.id}">HAR</button>
        <button class="btn btn-danger btn-sm archive-delete" data-sid="${s.id}">删除</button>
      </div>
    </div>`;
  }).join('');

  archiveList.querySelectorAll('.archive-view').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      selectedSessionId = btn.dataset.sid;
      // Switch to capture tab and filter by this session
      document.querySelector('.tab[data-tab="capture"]').click();
      await refreshRequests();
    });
  });

  archiveList.querySelectorAll('.archive-export-har').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await exportData('exportHAR', btn.dataset.sid);
    });
  });

  archiveList.querySelectorAll('.archive-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('确定删除该归档？')) return;
      await sendMsg({ action: 'deleteSession', sessionId: btn.dataset.sid });
      loadArchives();
    });
  });
}

// === Event Handlers ===
captureBtn.addEventListener('click', async () => {
  if (capturing) {
    await sendMsg({ action: 'stopCapture' });
    stopAutoRefresh();
  } else {
    if (!currentTabId) return;
    const resp = await sendMsg({ action: 'startCapture', tabId: currentTabId });
    if (!resp.ok) { alert(resp.error || '启动失败'); return; }
    await refreshStatus();
    selectedSessionId = currentSessionId;
    startAutoRefresh();
  }
  await refreshStatus();
  await refreshRequests();
});

exportHarBtn.addEventListener('click', () => {
  exportData('exportHAR', selectedSessionId || undefined);
});

exportJsonBtn.addEventListener('click', () => {
  exportData('exportJSON', selectedSessionId || undefined);
});

clearBtn.addEventListener('click', async () => {
  if (!confirm('确定清空所有抓包数据？')) return;
  await sendMsg({ action: 'clearRequests', sessionId: selectedSessionId || undefined });
  selectedReqId = null;
  detailPanel.classList.remove('visible');
  await refreshRequests();
});

aiAnalyzeBtn.addEventListener('click', async () => {
  document.querySelector('.tab[data-tab="ai"]').click();
  await runAIAnalysis();
});

aiRunBtn.addEventListener('click', runAIAnalysis);
aiSaveBtn.addEventListener('click', async () => {
  await saveAIConfig();
  setAIStatus('配置已保存', 'ok');
});
aiLoadModelsBtn.addEventListener('click', loadAIModels);
aiModel.addEventListener('change', updateCustomModelVisibility);
aiCopyBtn.addEventListener('click', async () => {
  if (!latestAIAnalysis) return;
  try {
    await navigator.clipboard.writeText(latestAIAnalysis);
    setAIStatus('分析结果已复制', 'ok');
  } catch {
    setAIStatus('复制失败，请手动选择文本复制', 'err');
  }
});

aiProvider.addEventListener('change', () => {
  const provider = aiProvider.value;
  const oldDefaults = Object.values(AI_DEFAULT_BASE_URL);
  if (!aiBaseUrl.value.trim() || oldDefaults.includes(aiBaseUrl.value.trim())) {
    aiBaseUrl.value = AI_DEFAULT_BASE_URL[provider] || '';
  }
  aiBaseUrl.placeholder = AI_DEFAULT_BASE_URL[provider] || '';
  aiModelsBaseUrl.placeholder = `${AI_DEFAULT_BASE_URL[provider] || ''}/v1/models`;
  aiApiKey.placeholder = provider === 'anthropic' ? 'sk-ant-...' : 'sk-...';
  aiCustomModel.placeholder = AI_MODEL_PLACEHOLDER[provider] || '';
  renderAIModelOptions([], getSelectedAIModel());
});

closeDetailBtn.addEventListener('click', () => {
  detailPanel.classList.remove('visible');
  selectedReqId = null;
  requestList.querySelectorAll('.request-item.selected').forEach(el => el.classList.remove('selected'));
});

// Filters
let debounce = null;
searchInput.addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(refreshRequests, 300);
});
methodFilter.addEventListener('change', refreshRequests);
statusFilter.addEventListener('change', refreshRequests);

// === Auto Refresh ===
function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(() => { if (capturing) refreshRequests(); }, 2000);
}
function stopAutoRefresh() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
}

// === AI Analysis ===
function getSelectedAIModel() {
  return aiModel.value === AI_CUSTOM_MODEL_VALUE
    ? aiCustomModel.value.trim()
    : aiModel.value.trim();
}

function updateCustomModelVisibility() {
  const isCustom = aiModel.value === AI_CUSTOM_MODEL_VALUE;
  aiCustomModelRow.classList.toggle('is-hidden', !isCustom);
  if (isCustom) aiCustomModel.focus();
}

function renderAIModelOptions(models = [], selectedModel = '') {
  const selected = (selectedModel || '').trim();
  const seen = new Set();
  const normalized = models
    .map(m => ({
      id: String(m.id || '').trim(),
      displayName: String(m.displayName || m.id || '').trim()
    }))
    .filter(m => m.id && !seen.has(m.id) && seen.add(m.id));

  const options = ['<option value="">请选择模型</option>'];
  for (const m of normalized) {
    options.push(`<option value="${esc(m.id)}">${esc(m.displayName || m.id)}</option>`);
  }
  if (selected && !seen.has(selected)) {
    options.push(`<option value="${esc(selected)}">${esc(selected)}</option>`);
  }
  options.push(`<option value="${AI_CUSTOM_MODEL_VALUE}">自定义输入...</option>`);
  aiModel.innerHTML = options.join('');

  if (selected) {
    aiModel.value = selected;
  } else if (normalized[0]) {
    aiModel.value = normalized[0].id;
  } else {
    aiModel.value = '';
  }
  updateCustomModelVisibility();
}

async function getAICryptoKey() {
  const store = await chrome.storage.local.get(AI_KEY_MATERIAL_KEY);
  let raw = store[AI_KEY_MATERIAL_KEY];
  if (!raw) {
    raw = Array.from(crypto.getRandomValues(new Uint8Array(32)));
    await chrome.storage.local.set({ [AI_KEY_MATERIAL_KEY]: raw });
  }
  return crypto.subtle.importKey('raw', new Uint8Array(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptAIApiKey(plain) {
  if (!plain) return '';
  const key = await getAICryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  return { iv: Array.from(iv), data: Array.from(new Uint8Array(cipher)) };
}

async function decryptAIApiKey(enc) {
  if (!enc || typeof enc !== 'object') return enc || '';
  try {
    const key = await getAICryptoKey();
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(enc.iv) }, key, new Uint8Array(enc.data));
    return new TextDecoder().decode(plainBuf);
  } catch {
    return '';
  }
}

async function loadAIConfig() {
  const data = await chrome.storage.local.get(AI_CONFIG_KEY);
  const cfg = data[AI_CONFIG_KEY] || {};
  aiProvider.value = cfg.provider || 'openai';
  aiBaseUrl.value = cfg.baseUrl || AI_DEFAULT_BASE_URL[aiProvider.value] || '';
  aiModelsBaseUrl.value = cfg.modelsBaseUrl || '';
  aiApiKey.value = (await decryptAIApiKey(cfg.apiKey)) || '';
  aiCustomModel.value = cfg.model || '';
  aiIncludeBodies.checked = cfg.includeBodies !== false;
  aiRedactSensitive.checked = cfg.redactSensitive !== false;
  aiMaxRequests.value = cfg.maxRequests || 40;
  aiProvider.dispatchEvent(new Event('change'));
  renderAIModelOptions([], cfg.model || '');
}

function collectAIConfig() {
  return {
    provider: aiProvider.value || 'openai',
    baseUrl: aiBaseUrl.value.trim(),
    modelsBaseUrl: aiModelsBaseUrl.value.trim(),
    apiKey: aiApiKey.value.trim(),
    model: getSelectedAIModel(),
    includeBodies: aiIncludeBodies.checked,
    redactSensitive: aiRedactSensitive.checked,
    maxRequests: Math.max(1, parseInt(aiMaxRequests.value, 10) || 40)
  };
}

async function saveAIConfig() {
  const cfg = collectAIConfig();
  const toStore = { ...cfg, apiKey: await encryptAIApiKey(cfg.apiKey) };
  await chrome.storage.local.set({ [AI_CONFIG_KEY]: toStore });
  return cfg;
}

function validateAIConfig(cfg) {
  if (!cfg.apiKey) return '请先填写 API Key';
  if (!cfg.model) return '请先填写模型名称，或点击「获取模型列表」选择模型';
  return '';
}

function updateAIButtons() {
  const noData = allRequests.length === 0 && !capturing;
  aiAnalyzeBtn.disabled = noData || aiLoading;
  aiRunBtn.disabled = noData || aiLoading;
  aiLoadModelsBtn.disabled = aiLoading;
  aiSaveBtn.disabled = aiLoading;
  aiCopyBtn.disabled = !latestAIAnalysis;
}

function setAIStatus(text, type = '') {
  aiStatus.textContent = text;
  aiStatus.className = `ai-status ${type}`.trim();
}

async function loadAIModels() {
  const cfg = await saveAIConfig();
  const err = cfg.apiKey ? '' : '请先填写 API Key';
  if (err) { setAIStatus(err, 'err'); return; }

  aiLoading = true;
  updateAIButtons();
  setAIStatus('正在获取模型列表...', 'loading');
  try {
    const resp = await sendMsg({ action: 'listAIModels', config: cfg });
    if (!resp.ok) throw new Error(resp.error || '获取模型列表失败');
    const models = resp.models || [];
    renderAIModelOptions(models, cfg.model);
    await saveAIConfig();
    const selected = getSelectedAIModel();
    setAIStatus(`已获取 ${models.length} 个模型，当前选择：${selected || '未选择'}`, 'ok');
  } catch (e) {
    setAIStatus(e.message || '获取模型列表失败', 'err');
  } finally {
    aiLoading = false;
    updateAIButtons();
  }
}

async function runAIAnalysis() {
  await refreshRequests();
  if (allRequests.length === 0 && !capturing) {
    setAIStatus('当前会话没有可分析的请求', 'err');
    return;
  }

  const cfg = await saveAIConfig();
  const err = validateAIConfig(cfg);
  if (err) { setAIStatus(err, 'err'); return; }

  aiLoading = true;
  latestAIAnalysis = '';
  updateAIButtons();
  setAIStatus('正在发送抓包数据给模型分析...', 'loading');
  aiResult.innerHTML = '<div class="empty-state">AI 分析中，请稍候...</div>';

  try {
    const resp = await sendMsg({
      action: 'analyzeCapture',
      sessionId: selectedSessionId || currentSessionId || undefined,
      config: cfg,
      options: {
        includeBodies: cfg.includeBodies,
        redactSensitive: cfg.redactSensitive,
        maxRequests: cfg.maxRequests
      }
    });
    if (!resp.ok) throw new Error(resp.error || 'AI 分析失败');
    latestAIAnalysis = resp.analysis || '';
    const meta = resp.snapshotMeta || {};
    setAIStatus(`分析完成：发送 ${meta.includedRequests || '-'} / ${meta.totalRequestsInSession || '-'} 条请求，模型 ${resp.model}`, 'ok');
    aiResult.innerHTML = `<pre class="ai-markdown">${esc(latestAIAnalysis)}</pre>`;
  } catch (e) {
    latestAIAnalysis = '';
    setAIStatus(e.message || 'AI 分析失败', 'err');
    aiResult.innerHTML = `<div class="empty-state error">${esc(e.message || 'AI 分析失败')}</div>`;
  } finally {
    aiLoading = false;
    updateAIButtons();
  }
}

async function runAIAnalysisForRequest(requestId) {
  const cfg = await saveAIConfig();
  const err = validateAIConfig(cfg);
  if (err) { setAIStatus(err, 'err'); document.querySelector('.tab[data-tab="ai"]').click(); return; }

  document.querySelector('.tab[data-tab="ai"]').click();
  aiLoading = true;
  latestAIAnalysis = '';
  updateAIButtons();
  setAIStatus('正在分析当前选中的单条请求...', 'loading');
  aiResult.innerHTML = '<div class="empty-state">AI 正在分析此请求，请稍候...</div>';

  try {
    const resp = await sendMsg({
      action: 'analyzeRequest',
      requestId,
      config: cfg,
      options: {
        includeBodies: cfg.includeBodies,
        redactSensitive: cfg.redactSensitive
      }
    });
    if (!resp.ok) throw new Error(resp.error || 'AI 分析失败');
    latestAIAnalysis = resp.analysis || '';
    setAIStatus(`单条请求分析完成：${resp.requestMeta?.method || ''} ${resp.requestMeta?.status || ''}，模型 ${resp.model}`, 'ok');
    aiResult.innerHTML = `<pre class="ai-markdown">${esc(latestAIAnalysis)}</pre>`;
  } catch (e) {
    latestAIAnalysis = '';
    setAIStatus(e.message || 'AI 分析失败', 'err');
    aiResult.innerHTML = `<div class="empty-state error">${esc(e.message || 'AI 分析失败')}</div>`;
  } finally {
    aiLoading = false;
    updateAIButtons();
  }
}

async function exportData(action, sessionId) {
  const resp = await sendMsg({ action, sessionId });
  if (!resp.ok) {
    alert(resp.error || '导出失败');
    return;
  }
  downloadJson(resp.data, resp.ext || 'json');
}

async function downloadJson(data, ext) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  try {
    await chrome.downloads.download({ url, filename: `capture-${ts}.${ext}`, saveAs: true });
  } catch (err) {
    alert(err.message || '下载失败');
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

// === Formatters ===
function fmtUrl(url) {
  try { const u = new URL(url); return u.pathname + u.search; } catch { return url; }
}

function fmtSize(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function fmtTime(ms) {
  if (!ms) return '-';
  if (ms < 1000) return ms + ' ms';
  return (ms / 1000).toFixed(2) + ' s';
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtHeaders(h) {
  return Object.entries(h || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
}

function fmtBody(body) {
  if (!body) return '';
  try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; }
}

// === Start ===
init();
