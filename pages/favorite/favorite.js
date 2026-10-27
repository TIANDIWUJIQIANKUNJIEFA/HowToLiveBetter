/**
 * 收藏 · 三类（v2，设计稿画板 15）：建议 / 章节 / 主题
 * - 章节：收藏列表里两段式 uid（hltb:b03）
 * - 建议：三段式 uid（hltb:b03:12），标题取 favMeta（收藏时落的那份）
 * - 主题：htlb:v2:favTopics（主题聚合页里收藏）
 */
const app = getApp();
const library = require('../../utils/library.js');

/* 已收藏时长（设计稿 15：「已收藏 26 天」）；无时间戳（旧数据）返回空不展示 */
const favDaysLabel = (ts) => {
  if (!ts) return '';
  const days = Math.floor((Date.now() - ts) / 86400000);
  return days < 1 ? '今天' : `${days} 天`;
};

Page({
  data: {
    tab: 'step',
    tabs: [
      { key: 'step', label: '建议' },
      { key: 'chapter', label: '章节' },
      { key: 'topic', label: '主题' }
    ],
    steps: [],
    chapters: [],
    topics: []
  },

  onLoad() { if (app.onCloudChange) this._cloudOff = app.onCloudChange(() => this.render()); },
  onUnload() { if (this._cloudOff) this._cloudOff(); },

  onShow() {
    this.render();
  },

  render() {
    const favs = app.globalData.favorites || [];
    const steps = [];
    const chapters = [];

    favs.forEach(uid => {
      const segs = String(uid).split(':');
      if (segs.length === 2) {
        const ch = library.getChapter(segs[0], segs[1]);
        const book = library.getBook(segs[0]) || {};
        chapters.push({
          uid, bookId: segs[0], chapterId: segs[1],
          title: (ch && ch.title) || uid,
          brief: (ch && ch.brief) || '',
          bookTitle: book.title || segs[0],
          accent: library.accentVar(segs[0]) || book.accent || '#226B60'
        });
      } else if (segs.length === 3) {
        const meta = app.getFavMeta(uid) || {};
        const ch = library.getChapter(segs[0], segs[1]);
        const book = library.getBook(segs[0]) || {};
        steps.push({
          uid, bookId: segs[0], chapterId: segs[1], index: segs[2],
          title: meta.title || (ch && ch.title) || uid,
          plain: meta.plain || '',
          chapterTitle: meta.chapterTitle || (ch && ch.title) || '',
          bookTitle: meta.bookTitle || book.title || segs[0],
          accent: library.accentVar(segs[0]) || book.accent || '#226B60',
          noLabel: String(segs[2]).padStart(2, '0'),
          favDays: favDaysLabel(meta.ts)
        });
      }
    });

    let topics = [];
    try { topics = wx.getStorageSync('htlb:v2:favTopics') || []; } catch (e) { topics = []; }
    const topicRows = topics.map(id => {
      const t = library.getTopic(id) || { name: id };
      return { id, name: t.name, count: library.getChaptersByTopic(id).length };
    });
    this.setData({
      steps,
      chapters,
      topics: topicRows,
      tabs: [
        { key: 'step', label: '建议', count: steps.length },
        { key: 'chapter', label: '章节', count: chapters.length },
        { key: 'topic', label: '主题', count: topicRows.length }
      ]
    });
  },

  onTab(e) { this.setData({ tab: e.currentTarget.dataset.tab }); },

  onStepTap(e) {
    const { book, chapter, index } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pkg-read/chapter-read/chapter-read?book=${book}&chapter=${chapter}&step=${index}` });
  },

  onChapterTap(e) {
    const { book, chapter } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pkg-read/chapter-read/chapter-read?book=${book}&chapter=${chapter}` });
  },

  onTopicTap(e) {
    wx.navigateTo({ url: `/pages/topic-aggregate/topic-aggregate?topic=${e.currentTarget.dataset.id}` });
  },

  onUnfav(e) {
    const { uid } = e.currentTarget.dataset;
    app.saveFavorites((app.globalData.favorites || []).filter(f => f !== uid));
    this.render();
  },

  goReco() { wx.switchTab({ url: '/pages/reco/reco' }); },

  goLibrary() { wx.switchTab({ url: '/pages/library/library' }); },

  onShareAppMessage() {
    return { title: '我的收藏：一本人生指南书房', path: '/pages/favorite/favorite' };
  }
});
