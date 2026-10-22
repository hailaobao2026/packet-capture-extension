// === State ===
let capturing = false;
let currentTabId = null;
let currentSessionId = null;
let lastSessionId = null;
const pendingRequests = new Map();

// === IndexedDB ===
const DB_NAME = 'PacketCaptureDB';
const DB_VERSION = 1;
const STORE_REQUESTS = 'requests';
const STORE_SESSIONS = 'sessions';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_REQUESTS)) {
        const store = db.createObjectStore(STORE_REQUESTS, { keyPath: 'id', autoIncrement: true });
        store.createIndex('sessionId', 'sessionId');
        store.createIndex('url', 'url');
        store.createIndex('method', 'method');
        store.createIndex('status', 'status');
        store.createIndex('timestamp', 'timestamp');
      }
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(storeName, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbClear(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbGetByIndex(storeName, indexName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const idx = tx.objectStore(storeName).index(indexName);
    const req = idx.getAll(IDBKeyRange.only(value));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// === Session ===
async function createSession(tabId, tabUrl) {
  const session = {
    id: `sess_${Date.now()}`,
    tabId,
    tabUrl,
    startTime: Date.now(),
    endTime: null,
    requestCount: 0,
    name: new Date().toLocaleString('zh-CN')
  };
  await dbPut(STORE_SESSIONS, session);
  currentSessionId = session.id;
  lastSessionId = session.id;
  return session;
}

async function endSession() {
  if (!currentSessionId) return;
  const sessionId = currentSessionId;
  const session = await dbGet(STORE_SESSIONS, currentSessionId);
  if (session) {
    session.endTime = Date.now();
    await dbPut(STORE_SESSIONS, session);
  }
  lastSessionId = sessionId;
  currentSessionId = null;
}

function attachDebugger(tabId) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

function detachDebugger(tabId) {
  return new Promise((resolve) => {
    if (!tabId) {
      resolve();
      return;
    }
    chrome.debugger.detach({ tabId }, () => resolve());
  });
}

async function setStoredCaptureState(isCapturing, tabId = null, sessionId = null) {
  await chrome.storage.local.set({
    capturing: isCapturing,
    capturingTabId: tabId,
    currentSessionId: sessionId,
    lastSessionId
  });
}

// === Capture ===
async function startCapture(tabId) {
  if (capturing) throw new Error('已在抓包中');
  const tab = await chrome.tabs.get(tabId);
  let session = null;
  let attached = false;
  const previousLastSessionId = lastSessionId;

  try {
    await attachDebugger(tabId);
    attached = true;
    currentTabId = tabId;
    session = await createSession(tabId, tab.url);
    await sendCDPCommand(tabId, 'Network.enable');
    capturing = true;
    await setStoredCaptureState(true, tabId, session.id);
  } catch (err) {
    if (attached) await detachDebugger(tabId);
    if (session) await dbDelete(STORE_SESSIONS, session.id).catch(console.error);
    currentTabId = null;
    currentSessionId = null;
    lastSessionId = previousLastSessionId;
    capturing = false;
    await setStoredCaptureState(false);
    throw err;
  }
}

async function stopCapture() {
  if (!capturing) return;
  const tabId = currentTabId;
  await endSession();
  capturing = false;
  currentTabId = null;
  pendingRequests.clear();
  await setStoredCaptureState(false);
  await detachDebugger(tabId);
}

// === CDP Events ===
chrome.debugger.onEvent.addListener((source, method, params) => {
  if (!capturing || source.tabId !== currentTabId) return;
  switch (method) {
    case 'Network.requestWillBeSent': onRequestSent(params); break;
    case 'Network.responseReceived': onResponseReceived(params); break;
    case 'Network.loadingFinished': onLoadingFinished(source.tabId, params); break;
    case 'Network.loadingFailed': onLoadingFailed(params); break;
  }
});

function onRequestSent(params) {
  const { requestId, request, redirectResponse, type, timestamp, wallTime } = params;
  if (redirectResponse && pendingRequests.has(requestId)) {
    persistRedirectRequest(requestId, redirectResponse, timestamp);
  }

  pendingRequests.set(requestId, {
    requestId,
    sessionId: currentSessionId,
    url: request.url,
    method: request.method,
    requestHeaders: request.headers || {},
    requestBody: request.postData || null,
    resourceType: type || 'Other',
    timestamp: wallTime * 1000,
    cdpTimestamp: timestamp,
    status: 0,
    statusText: '',
    responseHeaders: {},
    responseBody: null,
    responseBase64Encoded: false,
    contentType: '',
    size: 0,
    duration: 0,
    failed: false,
    errorText: null
  });
}

function persistRedirectRequest(requestId, response, timestamp) {
  const pending = pendingRequests.get(requestId);
  if (!pending) return;

  pending.status = response.status || 0;
  pending.statusText = response.statusText || '';
  pending.responseHeaders = response.headers || {};
  pending.contentType = response.mimeType || '';
  pending.size = response.encodedDataLength || pending.size || 0;
  pending.duration = Math.max(0, Math.round((timestamp - pending.cdpTimestamp) * 1000));
  pending.redirectURL = response.url || '';
  persistRequest(pending).catch(console.error);
  pendingRequests.delete(requestId);
}

function onResponseReceived(params) {
  const { requestId, response } = params;
  const pending = pendingRequests.get(requestId);
  if (!pending) return;
  pending.status = response.status || 0;
  pending.statusText = response.statusText || '';
  pending.responseHeaders = response.headers || {};
  pending.contentType = response.mimeType || '';
  pending.size = response.encodedDataLength || 0;
}

async function onLoadingFinished(tabId, params) {
  const { requestId, timestamp, encodedDataLength } = params;
  const pending = pendingRequests.get(requestId);
  if (!pending) return;

  pending.duration = Math.round((timestamp - pending.cdpTimestamp) * 1000);
  pending.size = encodedDataLength || pending.size;

  // Get response body
  try {
    const body = await sendCDPCommand(tabId, 'Network.getResponseBody', { requestId });
    pending.responseBody = body.body;
    pending.responseBase64Encoded = body.base64Encoded || false;
  } catch { /* some resources don't have accessible body */ }

  // Truncate oversized body (500KB)
  if (pending.responseBody && pending.responseBody.length > 500000) {
    pending.responseBody = pending.responseBody.substring(0, 500000) + '\n... [truncated]';
    pending.truncated = true;
  }

  try {
    await persistRequest(pending);
  } catch (e) {
    console.error('Failed to save request:', e);
  }
  pendingRequests.delete(requestId);
}

function onLoadingFailed(params) {
  const { requestId, errorText } = params;
  const pending = pendingRequests.get(requestId);
  if (!pending) return;
  pending.failed = true;
  pending.errorText = errorText || 'Unknown error';
  persistRequest(pending).catch(console.error);
  pendingRequests.delete(requestId);
}

async function persistRequest(request) {
  await dbPut(STORE_REQUESTS, request);
  if (!request.sessionId) return;

  const session = await dbGet(STORE_SESSIONS, request.sessionId);
  if (session) {
    session.requestCount = (session.requestCount || 0) + 1;
    await dbPut(STORE_SESSIONS, session);
  }
}

function sendCDPCommand(tabId, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

// === Tab & Debugger Events ===
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === currentTabId && capturing) {
    stopCapture();
  }
});

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId === currentTabId && capturing) {
    endSession().catch(console.error);
    capturing = false;
    currentTabId = null;
    pendingRequests.clear();
    setStoredCaptureState(false).catch(console.error);
  }
});

// === HAR Export ===
function parseQueryString(url) {
  try {
    const u = new URL(url);
    return Array.from(u.searchParams.entries()).map(([name, value]) => ({ name, value }));
  } catch { return []; }
}

async function buildHAR(sessionId) {
  const requests = sessionId
    ? await dbGetByIndex(STORE_REQUESTS, 'sessionId', sessionId)
    : await dbGetAll(STORE_REQUESTS);

  return {
    log: {
      version: '1.2',
      creator: { name: '抓包归档', version: '1.1.0' },
      entries: requests.map(req => ({
        startedDateTime: new Date(req.timestamp).toISOString(),
        time: req.duration || 0,
        request: {
          method: req.method,
          url: req.url,
          httpVersion: 'HTTP/1.1',
          headers: Object.entries(req.requestHeaders || {}).map(([name, value]) => ({ name, value: String(value) })),
          queryString: parseQueryString(req.url),
          postData: req.requestBody ? {
            mimeType: req.requestHeaders?.['Content-Type'] || 'application/octet-stream',
            text: req.requestBody
          } : undefined,
          bodySize: req.requestBody ? req.requestBody.length : 0
        },
        response: {
          status: req.status || 0,
          statusText: req.statusText || '',
          httpVersion: 'HTTP/1.1',
          headers: Object.entries(req.responseHeaders || {}).map(([name, value]) => ({ name, value: String(value) })),
          content: {
            size: req.size || 0,
            mimeType: req.contentType || 'application/octet-stream',
            text: req.responseBody || '',
            encoding: req.responseBase64Encoded ? 'base64' : undefined
          },
          redirectURL: req.redirectURL || '',
          headersSize: -1,
          bodySize: req.size || 0
        },
        cache: {},
        timings: { send: 0, wait: req.duration || 0, receive: 0 }
      }))
    }
  };
}

// === AI Analysis ===
const AI_PROVIDERS = {
  openai: {
    label: 'OpenAI 兼容',
    defaultBaseUrl: 'https://api.openai.com',
    modelsPath: '/v1/models',
    chatPath: '/v1/chat/completions'
  },
  anthropic: {
    label: 'Anthropic Claude',
    defaultBaseUrl: 'https://api.anthropic.com',
    modelsPath: '/v1/models',
    chatPath: '/v1/messages'
  }
};
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_AI_MAX_REQUESTS = 40;
const DEFAULT_AI_BODY_LIMIT = 6000;
const DEFAULT_AI_OUTPUT_TOKENS = 2000;
const SENSITIVE_KEY_RE = /(authorization|cookie|set-cookie|token|secret|password|passwd|pwd|api[-_]?key|access[-_]?key|session|jwt|csrf|xsrf|credential|signature|sign|auth)/i;

function normalizeAIProvider(provider) {
  return AI_PROVIDERS[provider] ? provider : 'openai';
}

function normalizeBaseUrl(provider, baseUrl = '') {
  const p = normalizeAIProvider(provider);
  return (baseUrl || AI_PROVIDERS[p].defaultBaseUrl)
    .replace(/\/+$/, '')
    .replace(/\/v1$/, '');
}

function buildModelsUrl(provider, config = {}) {
  const raw = (config.modelsBaseUrl || config.modelListBaseUrl || '').trim().replace(/\/+$/, '');
  if (raw && /\/v1\/models$/i.test(raw)) return raw;
  const base = normalizeBaseUrl(provider, raw || config.baseUrl);
  return `${base}${AI_PROVIDERS[provider].modelsPath}`;
}

function maskSensitiveValue(value) {
  if (value === undefined || value === null) return value;
  const s = String(value);
  if (s.length <= 8) return '***';
  return `${s.slice(0, 4)}***${s.slice(-4)}`;
}

function redactObject(obj, redactSensitive) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(v => redactObject(v, redactSensitive));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (redactSensitive && SENSITIVE_KEY_RE.test(k)) {
      out[k] = maskSensitiveValue(v);
    } else if (v && typeof v === 'object') {
      out[k] = redactObject(v, redactSensitive);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function redactHeaders(headers, redactSensitive) {
  return redactObject(headers || {}, redactSensitive) || {};
}

function redactUrl(url, redactSensitive) {
  if (!redactSensitive) return url;
  try {
    const u = new URL(url);
    for (const key of Array.from(u.searchParams.keys())) {
      if (SENSITIVE_KEY_RE.test(key)) {
        u.searchParams.set(key, maskSensitiveValue(u.searchParams.get(key)));
      }
    }
    return u.toString();
  } catch {
    return url;
  }
}

function truncateText(text, maxLen = DEFAULT_AI_BODY_LIMIT) {
  if (text === undefined || text === null) return null;
  const s = String(text);
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}\n... [truncated ${s.length - maxLen} chars]`;
}

function maybeRedactBody(body, redactSensitive, maxLen) {
  if (!body) return null;
  if (!redactSensitive) return truncateText(body, maxLen);
  try {
    const parsed = JSON.parse(String(body));
    return truncateText(JSON.stringify(redactObject(parsed, true), null, 2), maxLen);
  } catch {
    try {
      const raw = String(body);
      if (raw.includes('=')) {
        const params = new URLSearchParams(raw);
        let changed = false;
        for (const key of Array.from(params.keys())) {
          if (SENSITIVE_KEY_RE.test(key)) {
            params.set(key, maskSensitiveValue(params.get(key)));
            changed = true;
          }
        }
        if (changed) return truncateText(params.toString(), maxLen);
      }
    } catch { /* not form encoded */ }
    return truncateText(body, maxLen);
  }
}

function buildAIRequestSnapshot(req, options) {
  const includeBodies = options.includeBodies !== false;
  const redactSensitive = options.redactSensitive !== false;
  const bodyLimit = Math.max(500, Number(options.bodyLimit) || DEFAULT_AI_BODY_LIMIT);

  const item = {
    id: req.id,
    startedAt: req.timestamp ? new Date(req.timestamp).toISOString() : null,
    durationMs: req.duration || 0,
    resourceType: req.resourceType || 'Other',
    request: {
      method: req.method,
      url: redactUrl(req.url, redactSensitive),
      headers: redactHeaders(req.requestHeaders, redactSensitive)
    },
    response: {
      status: req.pending ? 'PENDING' : (req.failed ? 'FAILED' : (req.status || 0)),
      statusText: req.statusText || '',
      contentType: req.contentType || '',
      size: req.size || 0,
      headers: redactHeaders(req.responseHeaders, redactSensitive)
    }
  };

  if (includeBodies) {
    item.request.body = maybeRedactBody(req.requestBody, redactSensitive, bodyLimit);
    item.response.body = req.responseBase64Encoded
      ? `[base64 response omitted, length=${String(req.responseBody || '').length}]`
      : maybeRedactBody(req.responseBody, redactSensitive, bodyLimit);
  }
  if (req.failed) item.error = req.errorText || 'Unknown error';
  if (req.pending) item.pending = true;
  if (req.truncated) item.response.truncatedByCapture = true;
  return item;
}

async function getRequestsForAnalysis(sessionId) {
  const requests = sessionId
    ? await dbGetByIndex(STORE_REQUESTS, 'sessionId', sessionId)
    : await dbGetAll(STORE_REQUESTS);
  const pending = Array.from(pendingRequests.values())
    .filter(req => !sessionId || req.sessionId === sessionId)
    .map(req => ({ ...req, pending: true, id: req.id || req.requestId }));
  return requests.concat(pending).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

function buildAnalysisMessages(snapshot) {
  const system = [
    '你是资深 HTTP/API 抓包分析助手。',
    '请基于用户提供的 Chrome 抓包数据分析业务流程、接口用途和潜在问题。',
    '不要编造抓包中不存在的接口或字段；不确定时明确说明。',
    '输出中文 Markdown，结构包含：总体结论、请求链路、关键接口、异常/风险、建议下一步。'
  ].join('\n');

  const user = [
    '请分析下面这批实时抓包请求。重点关注：',
    '1. 业务链路/页面动作大概做了什么；',
    '2. 每个关键 URL 的请求方法、状态码、请求参数/返回字段含义；',
    '3. 失败状态、鉴权/CORS/参数/风控/重试/重定向等问题；',
    '4. 可执行的修复或继续排查建议。',
    '',
    '抓包 JSON：',
    '```json',
    JSON.stringify(snapshot, null, 2),
    '```'
  ].join('\n');

  return { system, user };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 60_000) {
  if (AbortSignal.timeout) {
    return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractAIText(provider, data) {
  if (provider === 'anthropic') {
    return (data.content || [])
      .map(part => part.type === 'text' ? part.text : '')
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  const content = data.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    return content.map(part => part.text || part.content || '').join('\n').trim();
  }
  return String(content || '').trim();
}

async function callAIModel(config, snapshot) {
  const provider = normalizeAIProvider(config.provider);
  const base = normalizeBaseUrl(provider, config.baseUrl);
  const apiKey = (config.apiKey || '').trim();
  const model = (config.model || '').trim();
  const maxTokens = Math.max(256, Number(config.maxOutputTokens) || DEFAULT_AI_OUTPUT_TOKENS);

  if (!apiKey) throw new Error('缺少 API Key');
  if (!model) throw new Error('缺少模型名称');

  const { system, user } = buildAnalysisMessages(snapshot);
  let url;
  let headers;
  let body;

  if (provider === 'anthropic') {
    url = `${base}${AI_PROVIDERS.anthropic.chatPath}`;
    headers = {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
      'Content-Type': 'application/json'
    };
    body = {
      model,
      max_tokens: maxTokens,
      temperature: 0.2,
      system,
      messages: [{ role: 'user', content: user }]
    };
  } else {
    url = `${base}${AI_PROVIDERS.openai.chatPath}`;
    headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
    body = {
      model,
      temperature: 0.2,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    };
  }

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  }, 90_000);

  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!res.ok) {
    const errMsg = data.error?.message || data.message || text || `HTTP ${res.status}`;
    throw new Error(`模型接口返回 ${res.status}: ${errMsg}`);
  }

  const analysis = extractAIText(provider, data);
  if (!analysis) throw new Error('模型响应中没有可读文本');

  return {
    provider,
    model,
    baseUrl: base,
    analysis,
    usage: data.usage || null
  };
}

async function listAIModels(config) {
  const provider = normalizeAIProvider(config.provider);
  const apiKey = (config.apiKey || '').trim();
  if (!apiKey) throw new Error('缺少 API Key');
  const modelsUrl = buildModelsUrl(provider, config);

  if (provider === 'anthropic') {
    const headers = {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true'
    };
    const models = [];
    let afterId;
    while (true) {
      const params = new URLSearchParams({ limit: '1000' });
      if (afterId) params.set('after_id', afterId);
      const url = `${modelsUrl}?${params.toString()}`;
      const res = await fetchWithTimeout(url, { headers }, 30_000);
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
      if (!res.ok) {
        const errMsg = data.error?.message || data.message || text || `HTTP ${res.status}`;
        throw new Error(`获取模型列表失败 ${res.status}: ${errMsg}`);
      }
      models.push(...(data.data || []).map(m => ({
        id: m.id,
        displayName: m.display_name || m.id
      })));
      if (!data.has_more || !data.last_id) break;
      afterId = data.last_id;
    }
    return models;
  }

  const url = modelsUrl;
  const headers = { Authorization: `Bearer ${apiKey}` };
  const res = await fetchWithTimeout(url, { headers }, 30_000);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const errMsg = data.error?.message || data.message || text || `HTTP ${res.status}`;
    throw new Error(`获取模型列表失败 ${res.status}: ${errMsg}`);
  }
  return (data.data || []).map(m => ({
    id: m.id,
    displayName: m.id
  }));
}

async function analyzeCapture(msg) {
  const requests = await getRequestsForAnalysis(msg.sessionId);
  if (!requests.length) throw new Error('当前会话没有可分析的请求');

  const maxRequests = Math.max(1, Number(msg.options?.maxRequests) || DEFAULT_AI_MAX_REQUESTS);
  const clipped = requests.slice(-maxRequests);
  const snapshot = {
    generatedAt: new Date().toISOString(),
    sessionId: msg.sessionId || null,
    totalRequestsInSession: requests.length,
    includedRequests: clipped.length,
    note: clipped.length < requests.length ? `仅发送最后 ${clipped.length} 条请求给模型` : '',
    options: {
      includeBodies: msg.options?.includeBodies !== false,
      redactSensitive: msg.options?.redactSensitive !== false
    },
    requests: clipped.map(req => buildAIRequestSnapshot(req, msg.options || {}))
  };

  const result = await callAIModel(msg.config || {}, snapshot);
  return { ok: true, ...result, snapshotMeta: {
    totalRequestsInSession: requests.length,
    includedRequests: clipped.length
  }};
}

async function analyzeRequest(msg) {
  const req = await dbGet(STORE_REQUESTS, msg.requestId);
  if (!req) throw new Error('未找到选中的请求记录');

  const snapshot = {
    generatedAt: new Date().toISOString(),
    sessionId: req.sessionId || null,
    totalRequestsInSession: 1,
    includedRequests: 1,
    note: '仅分析用户选中的单条请求，请重点解释请求用途、参数、响应字段、异常风险和排查建议。',
    options: {
      includeBodies: msg.options?.includeBodies !== false,
      redactSensitive: msg.options?.redactSensitive !== false
    },
    requests: [buildAIRequestSnapshot(req, msg.options || {})]
  };

  const result = await callAIModel(msg.config || {}, snapshot);
  return {
    ok: true,
    ...result,
    requestMeta: {
      id: req.id,
      method: req.method,
      status: req.status,
      url: req.url
    },
    snapshotMeta: {
      totalRequestsInSession: 1,
      includedRequests: 1
    }
  };
}

// === Message Handler ===
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  handleMessage(message)
    .then(sendResponse)
    .catch(err => sendResponse({ ok: false, error: err.message }));
  return true;
});

async function handleMessage(msg) {
  switch (msg.action) {
    case 'startCapture':
      await startCapture(msg.tabId);
      return { ok: true };

    case 'stopCapture':
      await stopCapture();
      return { ok: true };

    case 'getStatus':
      return {
        capturing,
        tabId: currentTabId,
        sessionId: currentSessionId,
        lastSessionId,
        pendingCount: pendingRequests.size
      };

    case 'getRequests': {
      let requests = msg.sessionId
        ? await dbGetByIndex(STORE_REQUESTS, 'sessionId', msg.sessionId)
        : await dbGetAll(STORE_REQUESTS);
      const f = msg.filters || {};
      if (f.method) requests = requests.filter(r => r.method === f.method);
      if (f.status) requests = requests.filter(r => String(r.status).startsWith(String(f.status)));
      if (f.search) {
        const s = f.search.toLowerCase();
        requests = requests.filter(r => r.url.toLowerCase().includes(s));
      }
      if (f.domain) {
        requests = requests.filter(r => {
          try { return new URL(r.url).hostname.includes(f.domain); } catch { return false; }
        });
      }
      return { ok: true, requests };
    }

    case 'getRequestDetail': {
      const req = await dbGet(STORE_REQUESTS, msg.id);
      return { ok: true, request: req };
    }

    case 'getSessions': {
      const sessions = await dbGetAll(STORE_SESSIONS);
      return { ok: true, sessions: sessions.reverse() };
    }

    case 'exportHAR': {
      const har = await buildHAR(msg.sessionId);
      return { ok: true, data: har, ext: 'har' };
    }

    case 'exportJSON': {
      const requests = msg.sessionId
        ? await dbGetByIndex(STORE_REQUESTS, 'sessionId', msg.sessionId)
        : await dbGetAll(STORE_REQUESTS);
      return { ok: true, data: requests, ext: 'json' };
    }

    case 'listAIModels': {
      const models = await listAIModels(msg.config || {});
      return { ok: true, models };
    }

    case 'analyzeCapture':
      return await analyzeCapture(msg);

    case 'analyzeRequest':
      return await analyzeRequest(msg);

    case 'clearRequests': {
      if (msg.sessionId) {
        const db = await openDB();
        const tx = db.transaction(STORE_REQUESTS, 'readwrite');
        const idx = tx.objectStore(STORE_REQUESTS).index('sessionId');
        const cursor = idx.openCursor(IDBKeyRange.only(msg.sessionId));
        cursor.onsuccess = (e) => {
          const c = e.target.result;
          if (c) { c.delete(); c.continue(); }
        };
        await new Promise(r => { tx.oncomplete = r; });
      } else {
        await dbClear(STORE_REQUESTS);
      }
      return { ok: true };
    }

    case 'deleteSession': {
      // Delete all requests in this session
      const db = await openDB();
      const tx = db.transaction(STORE_REQUESTS, 'readwrite');
      const idx = tx.objectStore(STORE_REQUESTS).index('sessionId');
      const cursor = idx.openCursor(IDBKeyRange.only(msg.sessionId));
      cursor.onsuccess = (e) => {
        const c = e.target.result;
        if (c) { c.delete(); c.continue(); }
      };
      await new Promise(r => { tx.oncomplete = r; });
      // Delete session itself
      await dbDelete(STORE_SESSIONS, msg.sessionId);
      return { ok: true };
    }

    default:
      return { ok: false, error: 'Unknown action' };
  }
}

// === Keep alive during capture ===
chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive' && capturing) {
    chrome.storage.local.get('capturing');
  }
});

// === Restore state on SW restart ===
chrome.storage.local.get(['capturing', 'capturingTabId', 'currentSessionId', 'lastSessionId'], (data) => {
  lastSessionId = data.lastSessionId || data.currentSessionId || null;
  if (data.capturing && data.capturingTabId) {
    currentTabId = data.capturingTabId;
    currentSessionId = data.currentSessionId || null;
    chrome.debugger.attach({ tabId: data.capturingTabId }, '1.3', () => {
      if (chrome.runtime.lastError) {
        // Tab gone or already detached
        endSession();
        setStoredCaptureState(false);
        return;
      }
      chrome.debugger.sendCommand({ tabId: data.capturingTabId }, 'Network.enable', null, () => {
        if (chrome.runtime.lastError) {
          endSession();
          setStoredCaptureState(false);
          return;
        }
        capturing = true;
      });
    });
  }
});
