/**
 * 书库（v2 tabBar）：书架 / 主题 双 tab
 * 设计稿画板 07/08。书架=书籍大卡（平放书封+cbadge 徽标行）；主题=8 宫格（图标+章数）。
 */
const library = require('../../utils/library.js');
const { presentation } = require('../../utils/book-presentation.js');

const TOPIC_META = {
  sleep:   { short: '睡眠', icon: '/assets/icons-v2/moon.png' },
  mind:    { short: '情绪', icon: '/assets/icons-v2/heartT.png' },
  relation:{ short: '人际', icon: '/assets/icons-v2/people.png' },
  learn:   { short: '学习', icon: '/assets/icons-v2/bookO.png' },
  work:    { short: '工作', icon: '/assets/icons-v2/caseI.png' },
  money:   { short: '财务', icon: '/assets/icons-v2/coin.png' },
  safety:  { short: '安全', icon: '/assets/icons-v2/shield.png' },
  family:  { short: '家庭', icon: '/assets/icons-v2/house.png' }
};

/* 未上架预告卡（真实书封与章节数，不可读） */
const PLACEHOLDER_BOOKS = [];


Page({
  data: {
    tab: 'shelf',          // shelf | topic
    books: [],
    topics: []
  },

  onLoad() {
    const app = getApp();
    if (app.onCloudChange) this._cloudOff = app.onCloudChange(() => this.render()); this.render(); },
  onUnload() { if (this._cloudOff) this._cloudOff(); },
  onShow() { this.render(); },
  onPullDownRefresh() {
    library.refresh({ force: true }).then(() => this.render()).finally(() => wx.stopPullDownRefresh());
  },

  render() {
    const real = library.getBooks().map(b => {
      const caps = b.capabilities || {};
      const badges = [`${(b.stats && b.stats.chapters) || 0} 章 · ${(b.stats && b.stats.steps) || 0} 条`];
      if (caps.evidence) badges.push('证据分级');
      if (caps.matchable) badges.push('可推荐');
      if (!caps.evidence) badges.push('情境建议');
      if (b.origin === 'bundled-original') badges.push('原创');
      const savedProgress = this.readProgress(b.id);
      const progress = savedProgress && library.getChapter(b.id, savedProgress.chapterId) ? savedProgress : null;
      return {
        id: b.id,
        title: b.title,
        accent: library.accentVar(b.id) || b.accent || '#226B60',
        ...presentation(b),
        cover: presentation(b).flatCover,
        descLine2: progress ? `在读 · ${progress.chapterTitle}` : presentation(b).descLine2,
        badges,
        readingId: progress && library.getChapter(b.id, progress.chapterId) ? progress.chapterId : ''
      };
    });
    const known = {};
    real.forEach(b => { known[b.id] = true; });
    const books = real.concat(PLACEHOLDER_BOOKS.filter(p => !known[p.id]));

    /* 主题宫格：8 个主主题，附命中章节数 */
    const allChapters = library.getAllChapters();
    const topics = library.getTopics().filter(t => t.primary).map(t => ({
      id: t.id,
      short: (TOPIC_META[t.id] || {}).short || t.name,
      icon: (TOPIC_META[t.id] || {}).icon || '/assets/icons-v2/spark.png',
      darkIcon: ((TOPIC_META[t.id] || {}).icon || '/assets/icons-v2/spark.png').replace('/icons-v2/', '/icons-v2/dark/'),
      count: allChapters.filter(c => (c.topicIds || []).indexOf(t.id) > -1).length
    }));

    this.setData({ books, topics });
  },

  readProgress(bookId) {
    try {
      const all = wx.getStorageSync('htlb:v2:progress') || {};
      return all[bookId] || null;
    } catch (e) { return null; }
  },

  onTab(e) { this.setData({ tab: e.currentTarget.dataset.tab }); },

  onOpenSearch() {
    wx.navigateTo({ url: '/pkg-read/search/search' });
  },

  onContinue(e) {
    const { id, chapter } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pkg-read/chapter-read/chapter-read?book=${id}&chapter=${chapter}` });
  },

  onBookTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!library.getBook(id)) {
      wx.showToast({ title: '该书籍即将上架', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/book-detail/book-detail?book=${id}` });
  },

  onTopicTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/topic-aggregate/topic-aggregate?topic=${id}` });
  },

  onShareAppMessage() {
    return { title: '人生指南库：一间放进步指南的书房', path: '/pages/library/library' };
  }
});
