/**
 * 跨书搜索（设计稿画板 12/13/14）：三段式结果（主题/章节/条目）
 * 服务端 FTS5+jieba（含同义扩展）；失败回落本地扫描（library 章节元数据 + 本书基线条目）。
 * 浏览历史模式 ?type=history 沿 v1。
 */
const app = getApp();
const library = require('../../utils/library.js');
const apiV2 = require('../../utils/api-v2.js');
const content = require('../utils/content.js');

Page({
  data: {
    mode: 'search',        // search | history
    q: '',
    hot: [],
    searched: false,
    topics: [],
    chapters: [],
    steps: [],
    searching: false,
    history: [],
    recent: [],
    totalSteps: 0
  },

  onLoad(options) {
    if (app.onCloudChange) this._cloudOff = app.onCloudChange(() => { if (this.data.mode === 'history') this.loadHistory(); });
    this.setData({ totalSteps: library.getTotalStepCount() });
    if (options.type === 'history') {
      this.setData({ mode: 'history' });
      this.loadHistory();
    } else if (options.keyword) {
      let keyword = options.keyword;
      try { keyword = decodeURIComponent(keyword); } catch (_) { /* retain literal input */ }
      this.setData({ q: keyword });
      this.doSearch(keyword);
    } else {
      this.loadHot();
    }
  },

  onShow() {
    if (this.data.mode === 'history') this.loadHistory();
  },

  loadHot() {
    apiV2.search('').then((res) => {
      /* 设计稿 12：热词一行 8~10 个，多了换行难看 */
      const seeds = ['睡眠', '理财', '焦虑', '急救', '租房', '面试'];
      const stop = new Set(['每天', '要求', '申请', '可以', '应该', '自己', '进行', '方法', '需要', '使用']);
      const extra = ((res && res.hot) || []).filter(t => typeof t === 'string' && t.length >= 2 && t.length <= 8 && !stop.has(t));
      this.setData({ hot: [...new Set(seeds.concat(extra))].slice(0, 10) });
    }).catch(() => {
      this.setData({ hot: ['睡眠', '理财', '焦虑', '急救', '租房', '面试'] });
    });
    /* 最近浏览（设计稿 12 起始态第三段；历史只存 uid 无时间，展示书名即可） */
    const hist = (app.globalData.readHistory || []).slice(0, 4);
    const recent = hist.map(uid => {
      const [bookId, chapterId] = String(uid).split(':');
      const ch = library.getChapter(bookId, chapterId) || {};
      const book = library.getBook(bookId) || {};
      return {
        uid, bookId, chapterId,
        title: ch.title || '',
        bookShort: (book.title || bookId).replace(/人生指南/, '')
      };
    }).filter(x => x.title);
    if (recent.length) this.setData({ recent });
  },

  loadHistory() {
    const hist = (app.globalData.readHistory || []).slice(0, 50);
    const items = hist.map(uid => {
      const [bookId, chapterId] = String(uid).split(':');
      const ch = library.getChapter(bookId, chapterId) || {};
      const book = library.getBook(bookId) || {};
      return {
        uid, bookId, chapterId,
        title: ch.title || uid,
        bookTitle: book.title || bookId,
        accent: library.accentVar(book.id) || book.accent || '#226B60'
      };
    }).filter(x => x.title);
    this.setData({ history: items });
  },

  invalidateSearch() {
    this._searchSeq = (this._searchSeq || 0) + 1;
  },

  onUnload() { if (this._cloudOff) this._cloudOff(); this._disposed = true; this.invalidateSearch(); },

  onInput(e) {
    this.invalidateSearch();
    this.setData({ q: e.detail.value, searching: false, searched: false });
  },

  onHotTap(e) {
    const q = e.currentTarget.dataset.q;
    this.setData({ q });
    this.doSearch(q);
  },

  onConfirm() { this.doSearch(this.data.q); },

  onClear() {
    this.invalidateSearch();
    this.setData({ q: '', searching: false, searched: false, topics: [], chapters: [], steps: [] });
    this.loadHot();
  },

  onHistoryMode() { this.invalidateSearch(); this.setData({ mode: 'history', searching: false }); this.loadHistory(); },
  onSearchMode() { this.setData({ mode: 'search' }); if (!this.data.searched) this.loadHot(); },

  doSearch(q) {
    q = (q || '').trim();
    if (!q) return;
    const seq = this._searchSeq = (this._searchSeq || 0) + 1;
    const current = () => !this._disposed && seq === this._searchSeq && this.data.mode === 'search' && this.data.q.trim() === q;
    this.setData({ q, searched: true, searching: true, offline: false });
    apiV2.search(q, { limit: 20 }).then((res) => {
      if (!current()) return;
      const chapters = ((res && res.chapters) || []).map(c => this.decorateChapter(c));
      const steps = ((res && res.steps) || []).map(s => this.decorateStep(s));
      const topics = ((res && res.topics) || []).map(t => ({ ...t, count: library.getChaptersByTopic(t.id).length }));
      const original = this.localSearch(q, 'social');
      const merge = (a, b, key) => Array.from(new Map(a.concat(b).map(x => [x[key] || [x.bookId, x.chapterId, x.index].join(':'), x])).values());
      this.setData({ searched: true, searching: false,
        topics: merge(topics, original.topics, 'id'),
        chapters: merge(chapters.filter(c => c.bookId !== 'htga'), original.chapters, 'uid'),
        steps: merge(steps.filter(s => s.bookId !== 'htga'), original.steps, 'uid') });
    }).catch(() => {
      if (!current()) return;
      this.setData({ searched: true, searching: false, offline: true, ...this.localSearch(q) });
    });
  },

  /** 本地兜底：章节元数据 + 主书基线条目 扫描 */
  localSearch(q, onlyBook = '') {
    const k = q.toLowerCase();
    const chapters = library.getAllChapters()
      .filter(c => !onlyBook || c.bookId === onlyBook)
      .filter(c => (c.title || '').toLowerCase().includes(k) || (c.summary || '').toLowerCase().includes(k))
      .slice(0, 20).map(c => this.decorateChapter(c));
    const steps = [];
    library.getBooks().filter(b => !onlyBook || b.id === onlyBook).forEach(b => {
      if (!(b.capabilities || {}).structuredAdvice) return;
      library.getChapters(b.id).forEach(ch => {
        content.getSteps(b.id, ch.chapterId).forEach(s => {
          if (steps.length >= 20) return;
          const text = [s.title, s.plain, ...Object.values(s.sections || {})].join(' ').toLowerCase();
          if (text.includes(k)) {
            steps.push(this.decorateStep(s));
          }
        });
      });
    });
    const topics = library.getTopics()
      .filter(t => t.name.toLowerCase().includes(k))
      .map(t => ({ ...t, count: library.getChaptersByTopic(t.id).length }));
    return { topics, chapters, steps };
  },

  decorateChapter(c) {
    const book = library.getBook(c.bookId) || {};
    return { ...c, bookTitle: book.title || c.bookId, accent: library.accentVar(book.id) || book.accent || '#226B60' };
  },

  decorateStep(s) {
    const book = library.getBook(s.bookId) || {};
    const ch = library.getChapter(s.bookId, s.chapterId) || {};
    return { ...s, chapterTitle: ch.title || s.chapterId, bookTitle: book.title || s.bookId, accent: library.accentVar(book.id) || book.accent || '#226B60' };
  },

  onChapterTap(e) {
    const { book, chapter } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pkg-read/chapter-read/chapter-read?book=${book}&chapter=${chapter}` });
  },

  onStepTap(e) {
    const { book, chapter, index } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pkg-read/chapter-read/chapter-read?book=${book}&chapter=${chapter}&step=${index}` });
  },

  onTopicTap(e) {
    wx.navigateTo({ url: `/pages/topic-aggregate/topic-aggregate?topic=${e.currentTarget.dataset.id}` });
  },

  onHistoryTap(e) {
    const { book, chapter } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pkg-read/chapter-read/chapter-read?book=${book}&chapter=${chapter}` });
  },

  onOpenLibrary() { wx.switchTab({ url: '/pages/library/library' }); },

  onShareAppMessage() {
    return { title: `搜「${this.data.q || '生活建议'}」：每条都标注成本与证据`, path: `/pkg-read/search/search?keyword=${encodeURIComponent(this.data.q || '')}` };
  }
});
