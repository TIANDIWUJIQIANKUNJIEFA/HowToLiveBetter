/**
 * v2 接口请求层：https://api.aipalnet.cn/lifelib/api/v2/*
 *
 * 后端是 FastAPI（backend/），全部路由挂在 /lifelib 二级目录下。
 * 与 v1 api.js 同一套容灾语义：
 *   - 失败静默：请求层绝不抛错给页面，页面永远有数据可渲染（缓存 → 基线）
 *   - 连续失败 3 次后冷却 30 秒，恢复网络或主动刷新可立即重试（域名没配白名单时避免每次白等 8 秒）
 *   - v2 多了 POST（recommend / feedback），GET 数据端点全部支持 ?rev= 长缓存语义
 */
const BASE = 'https://api.aipalnet.cn/lifelib';
const TIMEOUT = 8000;
const MAX_FAIL = 3;

let failCount = 0;
let disabled = false;
let disabledUntil = 0;
const RETRY_AFTER = 30000;

const setEnabled = (on) => { disabled = !on; disabledUntil = on ? 0 : Date.now() + RETRY_AFTER; if (on) failCount = 0; };
const isEnabled = () => {
  if (disabled && Date.now() >= disabledUntil) setEnabled(true);
  return !disabled;
};

function request(method, path, { params, data } = {}) {
  if (!isEnabled()) return Promise.reject({ reason: 'disabled' });

  let url = BASE + path;
  if (params) {
    const qs = Object.keys(params)
      .filter(k => params[k] !== undefined && params[k] !== '' && params[k] !== null)
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
      .join('&');
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: method || 'GET',
      data: data || undefined,
      timeout: TIMEOUT,
      dataType: 'json',
      header: data ? { 'content-type': 'application/json' } : undefined,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data) {
          failCount = 0;
          resolve(res.data);
        } else {
          reject({ status: res.statusCode, data: res.data });
        }
      },
      fail: (err) => {
        failCount++;
        if (failCount >= MAX_FAIL) setEnabled(false);
        reject({ err });
      }
    });
  });
}

const getBooks = () => request('GET', '/api/v2/books');
const getTopics = () => request('GET', '/api/v2/topics');
const getIndex = (book) => request('GET', '/api/v2/index', { params: { book } });
const getSteps = (book, chapter, rev) =>
  request('GET', `/api/v2/steps/${encodeURIComponent(book)}/${encodeURIComponent(chapter)}`,
    { params: rev ? { rev } : undefined });
const getContent = (book, chapter, rev) =>
  request('GET', `/api/v2/content/${encodeURIComponent(book)}/${encodeURIComponent(chapter)}`,
    { params: rev ? { rev } : undefined });
const getGlossary = (book) => request('GET', '/api/v2/glossary', { params: { book } });
const getDaily = (days, book) => request('GET', '/api/v2/daily', { params: { days: days || 30, book } });
const getQuotes = () => request('GET', '/api/v2/quotes');
const search = (q, opts = {}) => request('GET', '/api/v2/search', {
  params: { q, book: opts.book, topic: opts.topic, type: opts.type, limit: opts.limit }
});
const recommend = (payload) => request('POST', '/api/v2/recommend', { data: payload });
const sendFeedback = (payload) => request('POST', '/api/v2/feedback', { data: payload });

module.exports = {
  BASE,
  setEnabled, isEnabled,
  getBooks, getTopics, getIndex, getSteps, getContent,
  getGlossary, getDaily, getQuotes, search, recommend, sendFeedback
};
