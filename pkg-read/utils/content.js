/**
 * pkg-read 数据层（v2）：章节正文 + 条目（分包侧）
 *
 * 主包 library.js 只有章节元数据；正文（导语段 / 条目）在这里，
 * 分包引主包可以、反过来不行。三级取数：Storage(htlb:v2:) → 接口 → 随包基线。
 * 基线只有主书 steps-hltb.js（瘦身口径见 backend gen_client_baseline）：
 *   - 不含 source/note（阅读页里在线后补全）
 *   - 导语正文基线只有 summary 一段（content 段落在线拉）
 */
const library = require('../../utils/library.js');
const apiV2 = require('../../utils/api-v2.js');
const storeV2 = require('../../utils/store.js').v2;

/* 主书正文基线在分包内，直接 require；其他书没有基线（在线优先） */
const BASELINES = {
  hltb: require('../data/steps-hltb.js'),
  social: require('../data/steps-social.js')
};
const baselineSteps = (bookId) => BASELINES[bookId] || null;

const stepsKey = (bookId, chapterId) => `steps:${bookId}:${chapterId}`;
const stepsRevKey = (bookId, chapterId) => `stepsRev:${bookId}:${chapterId}`;
const contentKey = (bookId, chapterId) => `content:${bookId}:${chapterId}`;

/** 条目（同步）：缓存 → 基线（主书） */
const getSteps = (bookId, chapterId) => {
  if (bookId === 'social' && !/^rq\d{2}$/.test(chapterId)) return [];
  const book = library.getBook(bookId);
  if (book && book.origin === 'bundled-original') {
    const base = baselineSteps(bookId) || {};
    return library.rehydrateSteps(bookId, chapterId, base[chapterId] || []);
  }
  const cached = storeV2.get(stepsKey(bookId, chapterId));
  if (Array.isArray(cached) && cached.length) return cached;
  const base = baselineSteps(bookId);
  if (base && base[chapterId]) return library.rehydrateSteps(bookId, chapterId, base[chapterId]);
  return [];
};

const getStepsRev = (bookId, chapterId) => {
  const meta = storeV2.get(stepsRevKey(bookId, chapterId));
  return (meta && meta.rev) || '';
};

/** 主动拉条目（rev 没变不写缓存）；返回是否更新 */
const fetchSteps = (bookId, chapterId) => {
  if ((library.getBook(bookId) || {}).origin === 'bundled-original' || !apiV2.isEnabled()) return Promise.resolve({ changed: false, steps: getSteps(bookId, chapterId) });
  return apiV2.getSteps(bookId, chapterId).then((res) => {
    const steps = (res && res.steps) || [];
    if (!steps.length) return { changed: false, steps: getSteps(bookId, chapterId) };
    const changed = res.rev !== getStepsRev(bookId, chapterId);
    if (changed) {
      storeV2.set(stepsKey(bookId, chapterId), steps);
      storeV2.set(stepsRevKey(bookId, chapterId), { rev: res.rev, ts: Date.now() });
    }
    return { changed, steps, updatedAt: res.updatedAt };
  }).catch(() => ({ changed: false, steps: getSteps(bookId, chapterId) }));
};

/** 导语段（同步）：缓存 → summary 一段兜底 */
const getContent = (bookId, chapterId) => {
  const original = (library.getBook(bookId) || {}).origin === 'bundled-original';
  const cached = original ? null : storeV2.get(contentKey(bookId, chapterId));
  if (Array.isArray(cached) && cached.length) return cached;
  const ch = library.getChapter(bookId, chapterId);
  return ch && ch.summary ? [ch.summary] : [];
};

const fetchContent = (bookId, chapterId) => {
  if ((library.getBook(bookId) || {}).origin === 'bundled-original' || !apiV2.isEnabled()) return Promise.resolve({ changed: false });
  return apiV2.getContent(bookId, chapterId).then((res) => {
    const content = (res && res.content) || [];
    if (!content.length) return { changed: false };
    const prev = storeV2.get(contentKey(bookId, chapterId)) || [];
    const changed = JSON.stringify(prev) !== JSON.stringify(content);
    if (changed) storeV2.set(contentKey(bookId, chapterId), content);
    return { changed, content, sourceNote: res.sourceNote };
  }).catch(() => ({ changed: false }));
};

module.exports = { getSteps, getStepsRev, fetchSteps, getContent, fetchContent, stepsKey };
