/**
 * 主题聚合页（设计稿画板 10）：跨书主题下的全部章节
 * 头卡（图标+统计）· 按书筛选 chips · 章节小卡 · 分批加载 · 主题收藏
 */
const library = require('../../utils/library.js');

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
const PAGE_SIZE = 10;

Page({
  data: {
    topic: { short: '', icon: '' },
    chapters: [],
    shown: [],
    bookChips: [],
    bookCount: 0,
    totalSteps: 0,
    filter: ''
  },

  onLoad(options) {
    const topicId = options.topic || '';
    const raw = library.getTopic(topicId) || { id: topicId, name: '全部方向' };
    /* 章节按 书 → 序 排：同书章节相邻，读者能看出书的边界 */
    const chapters = library.getChaptersByTopic(topicId).sort((a, b) =>
      a.bookId === b.bookId ? a.ord - b.ord : a.bookId.localeCompare(b.bookId));
    const books = {};
    library.getBooks().forEach(b => { books[b.id] = b; });

    const rows = chapters.map(c => ({
      ...c,
      bookTitle: (books[c.bookId] || {}).title || c.bookId,
      accent: library.accentVar(c.bookId) || (books[c.bookId] || {}).accent || '#226B60',
      updatedLabel: (c.updatedAt || '').slice(5, 10).replace('-', '/') || '近期'
    }));

    /* 按书筛选 chips + 总条数 */
    const byBook = {};
    rows.forEach(r => { byBook[r.bookId] = (byBook[r.bookId] || 0) + 1; });
    const bookChips = [{ id: '', label: '全部', count: rows.length }]
      .concat(Object.keys(byBook).map(id => ({
        id,
        label: (books[id] || {}).title || id,
        count: byBook[id]
      })));

    this.setData({
      topic: {
        id: raw.id,
        name: raw.name,
        short: (TOPIC_META[raw.id] || {}).short || raw.name,
        icon: (TOPIC_META[raw.id] || {}).icon || '/assets/icons-v2/spark.png'
      },
      chapters: rows,
      shown: rows.slice(0, PAGE_SIZE),
      bookChips,
      bookCount: Object.keys(byBook).length,
      totalSteps: rows.reduce((s, r) => s + (r.stepCount || 0), 0)
    });
  },

  onShow() {
    const app = getApp();
    this.setData({ topicFav: app.isTopicFav(this.data.topic && this.data.topic.id) });
  },

  onFilter(e) {
    const id = e.currentTarget.dataset.id || '';
    const rows = id ? this.data.chapters.filter(c => c.bookId === id) : this.data.chapters;
    this.setData({ filter: id, shown: rows.slice(0, PAGE_SIZE) });
    this._rows = rows;
  },

  /** disclaim 行点击：加载下一批 */
  onReachBottom() { this.loadMore(); },

  loadMore() {
    const rows = this._rows || this.data.chapters;
    const next = rows.slice(0, this.data.shown.length + PAGE_SIZE);
    if (next.length !== this.data.shown.length) this.setData({ shown: next });
  },

  onFavTopic() {
    const app = getApp();
    const on = app.toggleTopicFav(this.data.topic.id);
    this.setData({ topicFav: on });
    wx.showToast({ title: on ? '已收藏主题' : '已取消收藏', icon: 'none' });
  },

  onChapterTap(e) {
    const { book, chapter } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pkg-read/chapter-read/chapter-read?book=${book}&chapter=${chapter}` });
  },

  onShareAppMessage() {
    const t = this.data.topic || {};
    return { title: `「${t.short || t.name}」主题下的全部指南章节`, path: `/pages/topic-aggregate/topic-aggregate?topic=${t.id}` };
  }
});
