/**
 * Storage 缓存层（接口数据的落地位置）
 *
 * 取数优先级是「内存 → Storage 缓存 → 接口 → 本地基线」，这一层管第二级：
 * 命中缓存就能秒开、断网也能看，不必每次都等网络。
 *
 * 容量：微信 Storage 总上限 10 MB、单 key 1 MB。34 篇正文约 1.4 MB，
 * 这里按 6 MB 设软上限，超了按 LRU 淘汰「正文」类 key，
 * 索引和术语永远保留（它们小且是首屏必需）。
 *
 * key 约定：htlb:<name>，正文是 htlb:steps:<id>
 */
const PREFIX = 'htlb:';
const SOFT_LIMIT = 6 * 1024 * 1024;   // 6 MB
/* 永不淘汰：首屏必需且体积小；appVer 是版本迁移标记，surveyProfile 是调研档案、surveyShareUnlock 是结果解锁标记，都不能被淘汰 */
const KEEP = ['meta', 'articles', 'glossary', 'appVer', 'surveyProfile', 'surveyShareUnlock'];

/**
 * 命名空间工厂：同一套 LRU 逻辑，不同 key 前缀与保留名单。
 * v1 顶层导出沿用 'htlb:' 前缀；v2 数据层用 store.v2（'htlb:v2:'）。
 */
function createStore(prefix, keepNames, softLimit) {
  const k = (name) => prefix + name;

  let index = null;
  const loadIndex = () => {
    if (!index) {
      try { index = wx.getStorageSync(k('lru')) || {}; } catch { index = {}; }
    }
    return index;
  };
  const saveIndex = () => {
    try { wx.setStorageSync(k('lru'), index); } catch { /* 写不进就放弃索引，不影响数据 */ }
  };

  const byteLen = (s) => s.replace(/[\u0080-\u07ff]/g, 'aa').replace(/[\u0800-\uffff]/g, 'aaa').length;
  const usage = () => Object.values(loadIndex()).reduce((s, it) => s + (it.size || 0), 0);

  function set(name, value) {
    const key = k(name);
    let str;
    try {
      str = JSON.stringify(value);
    } catch {
      return false;
    }
    const size = byteLen(str);
    if (size > 900 * 1024) return false;
    try {
      wx.setStorageSync(key, str);
    } catch {
      return false;
    }
    const idx = loadIndex();
    idx[key] = { ts: Date.now(), size };
    saveIndex();
    evictIfNeeded();
    return true;
  }

  function get(name) {
    let str;
    try {
      str = wx.getStorageSync(k(name));
    } catch {
      return null;
    }
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch {
      del(name);
      return null;
    }
  }

  function del(name) {
    const key = k(name);
    try { wx.removeStorageSync(key); } catch { /* ignore */ }
    const idx = loadIndex();
    delete idx[key];
    saveIndex();
  }

  function evictIfNeeded() {
    const idx = loadIndex();
    let total = usage();
    if (total <= softLimit) return;
    const candidates = Object.keys(idx)
      .filter(key => !keepNames.some(n => key === k(n)))
      .sort((a, b) => (idx[a].ts || 0) - (idx[b].ts || 0));
    for (const key of candidates) {
      if (total <= softLimit) break;
      try { wx.removeStorageSync(key); } catch { /* ignore */ }
      total -= idx[key].size || 0;
      delete idx[key];
    }
    saveIndex();
  }

  return { k, get, set, del, usage, loadIndex, saveIndex };
}

const v1 = createStore(PREFIX, KEEP, SOFT_LIMIT);

/* ---------- v1 语义化封装：上层不用自己拼 key（页面代码不变） ---------- */

const metaKey = (name) => v1.k(`meta:${name}`);

const getMeta = () => v1.get('meta');
const setMeta = (m) => v1.set('meta', m);

const getArticles = () => v1.get('articles');
const setArticles = (list) => v1.set('articles', list);

const getGlossary = () => v1.get('glossary');
const setGlossary = (g) => v1.set('glossary', g);

const getSteps = (id) => v1.get(`steps:${id}`);

/** 正文按 rev 存：rev 没变就不用重写，省 Storage 写入 */
const setSteps = (id, steps, rev) => {
  const prev = v1.get(metaKey(`steps:${id}`));
  if (prev && prev.rev === rev) return true;
  const ok = v1.set(`steps:${id}`, steps);
  if (ok) v1.set(metaKey(`steps:${id}`), { rev, ts: Date.now() });
  return ok;
};

const stepsRev = (id) => (v1.get(metaKey(`steps:${id}`)) || {}).rev || 0;

const clearAll = () => {
  const idx = v1.loadIndex();
  Object.keys(idx).forEach(key => { try { wx.removeStorageSync(key); } catch { /* ignore */ } });
  v1.saveIndex();
};

/**
 * 绑定小程序版本号：发版后清掉旧版接口缓存，让随包基线优先
 *
 * 否则存量用户本地 Storage 里的旧缓存会一直压住新包里的 data/articles.js /
 * steps.js（data.js 里 _cached 优先级高于 baseline），导致「发版更新数据」对老用户
 * 失效，要等数据版本号 bump 才生效。
 *
 * 做法：模块加载时比对版本号，变了就清掉 articles/glossary/meta 与所有 steps 缓存，
 * 本次启动回落到随包基线；之后 refreshArticles 若发现数据版本更新会重新灌缓存。
 *
 * ⚠️ 开发者工具里 miniProgram.version 为空字符串，此时跳过（开发态不按「发版」处理，
 *    否则每次编译都清缓存、看不到接口缓存效果）。
 */
const APPVER_KEY = 'appVer';

const migrateForAppVersion = (currentVersion) => {
  if (!currentVersion) return false;            // 开发态/取不到版本，跳过
  const prev = v1.get(APPVER_KEY);
  if (prev === currentVersion) return false;    // 版本没变，不动
  v1.del('articles');
  v1.del('glossary');
  v1.del('meta');
  const idx = v1.loadIndex();
  Object.keys(idx)
    .filter(key => key.startsWith(v1.k('steps:')))
    .forEach((key) => { try { wx.removeStorageSync(key); } catch { /* ignore */ } delete idx[key]; });
  v1.saveIndex();
  v1.set(APPVER_KEY, currentVersion);
  return !!prev;                                // true 表示发生了版本升级
};

/* ---------- v2 命名空间：三书数据层专用（utils/library.js） ---------- */
/*
 * 永不淘汰：books/chapters/glossary/topics 是首屏必需且小；
 * profile/favorites/migration 标记不在 LRU 管辖内（直存直取的 key 也没进索引的不受影响）。
 * 正文类（steps:/content:）可淘汰，软上限 4MB——v2 正文主要来自接口，缓存按书记账。
 */
const v2 = createStore('htlb:v2:', ['books', 'chapters', 'glossary', 'topics', 'quotes'], 4 * 1024 * 1024);

module.exports = {
  get: v1.get, set: v1.set, del: v1.del, usage: v1.usage, clearAll,
  migrateForAppVersion,
  getMeta, setMeta,
  getArticles, setArticles,
  getGlossary, setGlossary,
  getSteps, setSteps, stepsRev,
  stepsKey: (id) => v1.k(`steps:${id}`),
  v2
};
