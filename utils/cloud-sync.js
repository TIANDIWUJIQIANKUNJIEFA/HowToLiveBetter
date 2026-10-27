/** VIP 云同步：本地优先、持久化待同步操作、版本冲突保护、微信账户隔离。 */
const { BASE } = require('./api-v2.js');
const SESSION = 'htlb:cloud:session';
const OWNER = 'htlb:cloud:owner';
const PREFIX = 'htlb:cloud:';
let timer = null, running = null, applying = false;
let phase = 'idle', error = '', verifiedAccount = '', bindingEpoch = 0;
const listeners = new Set();
const read = (key, fallback) => wx.getStorageSync(key) || fallback;
const session = () => read(SESSION, {});
const key = (name, id = session().accountId) => PREFIX + id + ':' + name;
const state = () => read(key('state'), { cursor: 0, versions: {}, lastSync: 0 });
const pending = () => read(key('pending'), {});
const enabled = () => !!session().accountId && read(OWNER, '') === session().accountId && !!read(key('enabled'), false);
const compound = (kind, id) => kind + '/' + id;
function emit() { listeners.forEach(fn => fn(status())); }
function status() {
  const s = session();
  return { loggedIn: !!s.token, vip: !!s.vip, accountId: s.accountId || '',
    accountChanged: phase === 'accountChanged' || (!!read(OWNER, '') && read(OWNER, '') !== s.accountId),
    enabled: enabled(), phase, error,
    pending: s.accountId ? Object.keys(pending()).length : 0,
    lastSync: s.accountId ? state().lastSync : 0 };
}
function request(method, path, data, authenticated = true) {
  const token = session().token;
  return new Promise((resolve, reject) => wx.request({
    url: BASE + '/api/v2' + path, method, data: data == null ? undefined : data, timeout: 15000,
    header: { 'content-type': 'application/json', ...(authenticated && token ? { Authorization: 'Bearer ' + token } : {}) },
    success(res) {
      if (res.statusCode >= 200 && res.statusCode < 300) return resolve(res.data);
      const e = Object.assign(new Error(typeof (res.data || {}).detail === 'string' ? res.data.detail : '云端服务暂不可用，请稍后重试'), { status: res.statusCode });
      if (authenticated && res.statusCode === 401) { phase = 'loginRequired'; error = e.message; emit(); }
      if (authenticated && res.statusCode === 403 && e.message.includes('微信账户')) {
        verifiedAccount = ''; phase = 'accountChanged'; error = e.message;
        if (session().accountId) wx.setStorageSync(key('enabled'), false);
        emit();
      }
      reject(e);
    },
    fail() { reject(new Error('网络未连接，记录已保存在本机')); }
  }));
}
function wxCode() {
  return new Promise((resolve, reject) => wx.login({
    success: r => r.code ? resolve(r.code) : reject(new Error('微信登录失败，请重试')),
    fail: () => reject(new Error('微信登录失败，请重试'))
  }));
}
// Refresh paid benefits against the server and verify the current WeChat identity.
async function checkVip() {
  const before = session();
  if (!before.token || !before.accountId || !before.vip) return false;
  if (status().accountChanged || phase === 'loginRequired') throw new Error('请先在「我的 → 账户与同步」重新连接微信账户');
  await verifyBinding(before.accountId);
  const me = await request('GET', '/account/me');
  if (session().token !== before.token || session().accountId !== before.accountId) throw new Error('微信账户已切换，请重试');
  wx.setStorageSync(SESSION, { ...before, ...me }); emit();
  return !!me.vip;
}
async function login() {
  const result = await request('POST', '/account/login', { code: await wxCode() }, false);
  wx.setStorageSync(SESSION, result);
  verifiedAccount = result.accountId;
  phase = 'idle'; error = ''; emit();
  return status();
}
async function refresh() {
  try {
    const me = await request('GET', '/account/me');
    wx.setStorageSync(SESSION, { ...session(), ...me }); emit();
    return status();
  } catch (e) {
    if (e.status === 401) { phase = 'loginRequired'; error = '登录已过期，请重新连接微信账户'; emit(); }
    throw e;
  }
}

function snapshot() {
  return { favorites: read('favorites', []), topics: read('htlb:v2:favTopics', []),
    meta: read('htlb:v2:favMeta', {}), history: read('readHistory', []),
    progress: read('htlb:v2:progress', {}), historyTimes: read('htlb:cloud:historyTimes', {}) };
}
function saveLocal(data) {
  wx.setStorageSync('favorites', data.favorites);
  wx.setStorageSync('htlb:v2:favTopics', data.topics);
  wx.setStorageSync('htlb:v2:favMeta', data.meta);
  wx.setStorageSync('readHistory', data.history);
  wx.setStorageSync('htlb:v2:progress', data.progress);
  wx.setStorageSync('htlb:cloud:historyTimes', data.historyTimes || {});
  const app = getApp();
  app.globalData.favorites = data.favorites;
  app.globalData.readHistory = data.history;
  app.globalData.cloudRevision = (app.globalData.cloudRevision || 0) + 1;
}
function claimAccount(allowSwitch = false) {
  const s = session(), previous = read(OWNER, '');
  if (!s.accountId) throw new Error('请先微信登录');
  if (previous && previous !== s.accountId) {
    if (!allowSwitch) throw new Error('请确认切换微信账户，避免记录混合');
    wx.setStorageSync(key('localBackup', previous), snapshot());
    saveLocal(read(key('localBackup'), { favorites: [], topics: [], meta: {}, history: [], progress: {}, historyTimes: {} }));
  }
  wx.setStorageSync(OWNER, s.accountId); emit();
}
function cleanValue(value = {}) {
  const out = {};
  ['title', 'plain', 'bookId', 'chapterId', 'chapterTitle', 'index', 'ts', 'scrollTop', 'step'].forEach(k => {
    if (typeof value[k] === 'string') out[k] = value[k].slice(0, k === 'plain' ? 160 : 120);
    else if (typeof value[k] === 'number' && Number.isFinite(value[k])) out[k] = Math.max(0, Math.min(value[k], 1e13));
  });
  return out;
}
function queue(kind, id, value = {}, deleted = false) {
  const owner = read(OWNER, '');
  const canRecord = owner && (read(key('imported', owner), false) || (enabled() && session().vip));
  if (applying || !canRecord) return;
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9:_-]{0,127}$/.test(id) || ['constructor', 'prototype'].includes(id)) return;
  const all = read(key('pending', owner), {}), tag = compound(kind, id), versions = read(key('state', owner), { versions: {} }).versions;
  const previous = all[tag];
  all[tag] = { opId: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
    kind, key: id, value: cleanValue(value), deleted, baseVersion: versions[tag] || 0,
    ...(previous ? { afterOpId: previous.sentOpId || previous.afterOpId || previous.opId } : {}) };
  try { wx.setStorageSync(key('pending', owner), all); error = ''; }
  catch (e) { error = '同步队列保存失败，请检查本机存储空间'; phase = 'error'; emit(); return false; }
  if (enabled()) schedule();
  emit(); return true;
}
function schedule(delay = 800) {
  clearTimeout(timer);
  timer = setTimeout(() => { timer = null; sync().catch(() => {}); }, delay);
}
function recordFavorites(before, after) {
  const meta = read('htlb:v2:favMeta', {});
  before.filter(id => !after.includes(id)).forEach(id => queue('favorite', id, {}, true));
  after.filter(id => !before.includes(id)).forEach(id => queue('favorite', id, meta[id] || {}));
}
function importLocal() {
  const local = snapshot();
  let failed = false;
  const add = (...args) => { if (queue(...args) === false) failed = true; };
  local.favorites.forEach(id => add('favorite', id, local.meta[id] || {}));
  local.topics.forEach(id => add('topic', id));
  local.history.forEach((id, i) => add('history', id, { ts: local.historyTimes[id] || Date.now() - i }));
  Object.keys(local.progress).forEach(id => add('progress', id, local.progress[id]));
  if (failed) throw new Error('同步队列保存失败，请检查本机存储空间');
}
async function setEnabled(on) {
  if (on) {
    await refresh();
    if (!session().vip) throw new Error('开通永久 VIP 后可使用云同步');
    claimAccount();
  }
  wx.setStorageSync(key('enabled'), !!on);
  if (!on) { clearTimeout(timer); phase = 'idle'; error = ''; emit(); return; }
  if (!read(key('imported'), false)) {
    importLocal();
    wx.setStorageSync(key('imported'), true);
  }
  emit(); return sync();
}
function applyRows(rows) {
  const data = snapshot(), st = state(), waiting = pending();
  rows.forEach(row => {
    const tag = compound(row.kind, row.key);
    st.versions[tag] = row.version;
    if (waiting[tag]) return; // 请求过程中产生的新操作不能被旧响应覆盖。
    if (row.kind === 'favorite') {
      data.favorites = data.favorites.filter(id => id !== row.key);
      if (!row.deleted) {
        data.favorites.push(row.key);
        data.meta[row.key] = { ...(data.meta[row.key] || {}), ...row.value };
      } else delete data.meta[row.key];
    } else if (row.kind === 'topic') {
      data.topics = data.topics.filter(id => id !== row.key);
      if (!row.deleted) data.topics.push(row.key);
    } else if (row.kind === 'history') {
      data.history = data.history.filter(id => id !== row.key);
      if (!row.deleted) { data.history.push(row.key); data.historyTimes[row.key] = row.value.ts || 0; }
      else delete data.historyTimes[row.key];
    } else if (row.kind === 'progress') {
      if (row.deleted) delete data.progress[row.key];
      else data.progress[row.key] = row.value;
    }
  });
  data.history = data.history.sort((a, b) => (data.historyTimes[b] || 0) - (data.historyTimes[a] || 0)).slice(0, 100);
  applying = true;
  try { saveLocal(data); wx.setStorageSync(key('state'), st); }
  finally { applying = false; }
}
async function verifyBinding(account) {
  while (verifiedAccount !== account) {
    const epoch = bindingEpoch;
    await request('POST', '/account/verify', { code: await wxCode() });
    if (account !== session().accountId) throw new Error('云账户已切换，本次同步已停止');
    if (epoch === bindingEpoch) verifiedAccount = account;
  }
}
async function perform() {
  if (!enabled()) return status();
  const account = session().accountId;
  phase = 'syncing'; error = ''; emit();
  try {
    await verifyBinding(account);
    await refresh();
    if (!session().vip) { wx.setStorageSync(key('enabled'), false); throw Object.assign(new Error('当前账户未开通 VIP，本机记录不受影响'), { status: 403 }); }
    let conflicts = 0;
    while (Object.keys(pending()).length) {
      if (!enabled() || account !== session().accountId) return status();
      await verifyBinding(account);
      const waiting = pending();
      const records = Object.values(waiting).slice(0, 20);
      records.forEach(record => { record.sentOpId = record.opId; });
      wx.setStorageSync(key('pending'), waiting);
      const batch = records.map(({ sentOpId, ...record }) => record);
      const result = await request('POST', '/account/sync', { changes: batch });
      if (account !== session().accountId) return status();
      const remaining = pending(), st = state();
      result.applied.forEach(row => {
        const tag = compound(row.kind, row.key);
        st.versions[tag] = row.version;
        if (remaining[tag] && remaining[tag].opId !== row.opId) remaining[tag].baseVersion = row.version;
      });
      Object.keys(remaining).forEach(tag => { if (result.ack.includes(remaining[tag].opId)) delete remaining[tag]; });
      wx.setStorageSync(key('pending'), remaining); wx.setStorageSync(key('state'), st);
      if ((result.conflicts || []).length) applyRows(result.conflicts);
      conflicts += (result.conflicts || []).length;
    }
    let more = true;
    while (more) {
      if (!enabled() || account !== session().accountId) return status();
      await verifyBinding(account);
      const result = await request('GET', '/account/sync?cursor=' + state().cursor);
      if (!enabled() || account !== session().accountId) return status();
      applyRows(result.items);
      const st = state(); st.cursor = result.cursor; wx.setStorageSync(key('state'), st);
      more = result.hasMore;
    }
    const st = state(); st.lastSync = Date.now(); wx.setStorageSync(key('state'), st);
    phase = 'idle'; error = conflicts ? '部分记录同时被修改，已保留云端较新版本' : '';
  } catch (e) {
    if (e.status === 409 && !verifiedAccount) wx.setStorageSync(key('enabled'), false);
    phase = e.status === 401 ? 'loginRequired' : e.status === 409 && !verifiedAccount ? 'accountChanged' : 'error'; error = e.message || '同步失败，记录保留在本机';
    if (enabled() && e.status !== 401 && e.status !== 403 && e.status !== 409) schedule(e.status === 429 ? 65000 : 30000);
    throw e;
  } finally { emit(); }
  return status();
}
function sync() {
  if (running) return running;
  running = perform().finally(() => { running = null; });
  return running;
}
async function logout() {
  if (running) await running.catch(() => {});
  if (session().token) await request('POST', '/account/logout').catch(() => {});
  clearTimeout(timer); verifiedAccount = ''; wx.removeStorageSync(SESSION); phase = 'idle'; error = ''; emit();
}
async function restore() {
  const result = await request('POST', '/vip/restore', {});
  wx.setStorageSync(SESSION, { ...session(), ...result }); emit(); return result;
}
module.exports = { status, checkVip, login, refresh, claimAccount, setEnabled, queue, recordFavorites, sync, logout, restore,
  wxCode, request, onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  foreground() { bindingEpoch++; verifiedAccount = ''; if (enabled()) sync().catch(() => {}); } };
