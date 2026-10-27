/**
 * 为我推荐（v2 首页）：状态行 + 问题入口 hero + 今日更新（跨书 git 流水）+ 书架 + 每日一读
 *
 * 设计稿画板 01（暖瓷白 × 松石绿 终稿）。数据来自 utils/library.js + /api/v2/daily；
 * 做过向导后顶部出现画像行。书架固定 2 列：已上架书籍。
 */
const app = getApp();
const library = require('../../utils/library.js');
const { presentation } = require('../../utils/book-presentation.js');
const match = require('../../utils/match.js');
const apiV2 = require('../../utils/api-v2.js');

/* 未上架预告卡（有真实书封与章节数，但不提供阅读） */
const PLACEHOLDER_BOOKS = [];


/* 无档案时的每日一读：按日期取，稳定不抖动 */
const { selectQuote: pickQuote } = require('../../utils/quote.js');

Page({
  data: {
    profileTopics: '',
    hasProfile: false,
    dailyUpdates: [],
    shownUpdates: [],
    updatesExpanded: false,
    dailyCount: 0,
    dailyTitle: '今日更新',
    books: [],
    bookCount: 2,
    quote: null,
    totalSteps: 0
  },

  onLoad() {
    const app = getApp();
    if (app.onCloudChange) this._cloudOff = app.onCloudChange(() => this.render());
    this.render();
  },

  onUnload() { if (this._cloudOff) this._cloudOff(); },
  onShow() {
    this.render();
  },

  onPullDownRefresh() {
    library.refresh({ force: true }).then(() => this.render()).finally(() => wx.stopPullDownRefresh());
  },

  render() {
    const profile = match.getProfileV2();
    const topicNames = (profile && profile.topicIds || [])
      .map(id => (library.getTopic(id) || {}).name).filter(Boolean);

    /* 书架：已上架书籍（含阅读进度） */
    const real = library.getBooks().map(b => {
      const chapters = library.getChapters(b.id);
      const progress = this.readProgress(b.id);
      let meta2 = presentation(b).features;
      let progressPct = null;
      let reading = false;
      if (progress && chapters.length) {
        const idx = chapters.findIndex(c => c.chapterId === progress.chapterId);
        if (idx >= 0) {
          reading = true;
          meta2 = `最近阅读 · 第 ${idx + 1} 章`;
          progressPct = null;
        }
      }
      return {
        id: b.id,
        accent: library.accentVar(b.id) || b.accent || '#226B60',
        ...presentation(b),
        meta1: `${b.stats.chapters} 章 · ${b.stats.steps} 条`,
        meta2,
        progressPct,
        reading
      };
    });
    const known = {};
    real.forEach(b => { known[b.id] = true; });
    const books = real.concat(PLACEHOLDER_BOOKS.filter(p => !known[p.id]));

    this.setData({
      hasProfile: !!topicNames.length,
      profileTopics: topicNames.slice(0, 2).join('、'),
      books,
      bookCount: real.length,
      matchableCount: library.getBooks().filter(b => (b.capabilities || {}).matchable).length,
      previewCount: books.length - real.length,
      quote: pickQuote(),
      totalSteps: library.getTotalStepCount()
    });
    this.loadDaily();
  },

  /** 书架「在读」：阅读页写入的进度（最近一章） */
  readProgress(bookId) {
    try {
      const all = wx.getStorageSync('htlb:v2:progress') || {};
      return all[bookId] || null;
    } catch (e) { return null; }
  },

  /** 今日更新：git 真实流水；空则降级「最近更新」（口径沿 v1） */
  loadDaily() {
    apiV2.getDaily(2).then((res) => {
      const days = (res && res.days) || [];
      const updates = [];
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const todayDays = days.filter(d => d.date === today && (d.updates || []).length);
      (todayDays.length ? todayDays : days).forEach(d => {
        (d.updates || []).slice(0, 4).forEach(u => {
          if (updates.length >= 4) return;
          const ch = library.getChapter(u.bookId, u.chapterId);
          const book = library.getBook(u.bookId);
          if (!book) return;
          updates.push({
            uid: `${u.bookId}:${u.chapterId}`,
            bookId: u.bookId,
            chapterId: u.chapterId,
            title: u.chapterTitle || (ch && ch.title) || u.chapterId,
            bookTitle: (book && book.title) || u.bookId,
            accent: (book && (library.accentVar(book.id) || book.accent)) || '#226B60',
            action: u.action,                                  // new / update
            actionLabel: u.action === 'new' ? '新增' : '更新',
            commits: u.commits || 1,
            dateLabel: (d.date || '').slice(5).replace('-', '/')
          });
        });
      });
      if (updates.length) {
        this.setUpdates(updates, days.some(d => d.date === today && (d.updates || []).length) ? '今日更新' : '最近更新');
      } else {
        this.fallbackDaily();
      }
    }).catch(() => this.fallbackDaily());
  },

  fallbackDaily() {
    const recent = library.getAllChapters()
      .filter(c => c.updatedAt)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, 4);
    const updates = recent.map(c => {
      const book = library.getBook(c.bookId) || {};
      return {
        uid: c.uid, bookId: c.bookId, chapterId: c.chapterId,
        title: c.title, bookTitle: book.title || c.bookId,
        accent: (library.accentVar(book.id) || book.accent) || '#226B60',
        action: 'update', actionLabel: '更新',
        commits: 1,
        dateLabel: (c.updatedAt || '').slice(5, 10).replace('-', '/')
      };
    });
    this.setUpdates(updates, updates.length ? '最近更新' : '暂无更新');
  },

  setUpdates(updates, title) {
    this.setData({ dailyUpdates: updates, shownUpdates: this.data.updatesExpanded ? updates : updates.slice(0, 2), dailyCount: updates.length, dailyTitle: title });
  },
  onToggleUpdates() {
    const expanded = !this.data.updatesExpanded;
    this.setData({ updatesExpanded: expanded, shownUpdates: expanded ? this.data.dailyUpdates : this.data.dailyUpdates.slice(0, 2) });
  },
  onContinue(e) {
    const book = e.currentTarget.dataset.id;
    const progress = this.readProgress(book);
    if (progress && library.getChapter(book, progress.chapterId)) wx.navigateTo({ url: `/pkg-read/chapter-read/chapter-read?book=${book}&chapter=${progress.chapterId}` });
  },

  /* ---------- 交互 ---------- */

  onStartWizard() {
    wx.navigateTo({ url: '/pkg-insight/wizard/wizard' });
  },

  onOpenLibrary() {
    wx.switchTab({ url: '/pages/library/library' });
  },

  onBookTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!library.getBook(id)) {
      wx.showToast({ title: '该书籍即将上架', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/book-detail/book-detail?book=${id}` });
  },

  onUpdateTap(e) {
    const { book, chapter } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pkg-read/chapter-read/chapter-read?book=${book}&chapter=${chapter}` });
  },

  onQuoteTap() {
    wx.navigateTo({ url: `/pkg-read/daily/daily?quoteId=${encodeURIComponent((this.data.quote || {}).id || '')}` });
  },

  onOpenSearch() {
    wx.navigateTo({ url: '/pkg-read/search/search' });
  },

  /* 分享 */
  onShareAppMessage() {
    return { title: '人生指南库：每条建议都标注成本、收益与证据等级', path: '/pages/reco/reco' };
  },
  onShareTimeline() {
    return { title: '人生指南库：帮你挑出真正划算的那几条生活建议' };
  }
});
