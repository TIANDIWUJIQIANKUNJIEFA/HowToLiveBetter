/**
 * 书籍详情（设计稿画板 09）：书封大卡 + 统计三卡 + topic 筛选 + 章节编号列表（在读徽标/收起展开）
 */
const library = require('../../utils/library.js');
const { presentation } = require('../../utils/book-presentation.js');
const matchIndex = require('../../data/match-index.js');

const PREVIEW_COUNT = 8;   // 首屏预览章节数，其余折叠进「全部 N 章 ›」

/* 统计三卡（设计稿 08/09）：建议条数 / A 级证据占比（有证据能力的书）或章节数 / 平均条阅读。
   占比与均长从主包 match-index 算（字段 9=证据等级、10=正文字数），随索引重建自动更新。 */
function computeStats(book) {
  const rows = book.id === 'hltb' ? matchIndex : [];
  const caps = book.capabilities || {};
  let stat2 = book.stats.chapters;
  let stat2Label = '章节数';
  if (caps.evidence && rows.length) {
    const a = rows.filter(r => r[9] === 'A').length;
    stat2 = `A ${Math.round((a / rows.length) * 100)}%`;
    stat2Label = 'A级证据占比';
  }
  const avgWords = rows.length
    ? rows.reduce((s, r) => s + (r[10] || 0), 0) / rows.length
    : 0;
  const avgMin = Math.max(1, Math.round(avgWords / 300));   // ≈300 字/分钟
  return { stat2, stat2Label, avgMin };
}

Page({
  data: {
    book: null,
    chapters: [],
    shownChapters: [],
    filteredCount: 0,
    hasMore: false,
    topics: [],            // 本书出现的 topic 筛选 chips
    filter: '',            // 当前筛选 topicId
    heroAccent: '#226B60',
    updatedLabel: '',
    topicCount: 0,
    readingId: ''
  },

  onLoad(options) {
    const bookId = options.book || 'hltb';
    const book = library.getBook(bookId);
    if (!book) {
      this.setData({ loadError: '这本书暂时无法找到，请从书库重新选择。' });
      return;
    }
    this.bookId = bookId;
    this.allChapters = library.getChapters(bookId);
    /* 本书出现过的主题（按章节数排） */
    const count = {};
    this.allChapters.forEach(c => (c.topicIds || []).forEach(t => { count[t] = (count[t] || 0) + 1; }));
    const topics = Object.keys(count)
      .map(id => ({ id, name: (library.getTopic(id) || {}).name || id, count: count[id] }))
      .sort((a, b) => b.count - a.count);

    /* 在读章（阅读页写入） */
    let readingId = '';
    try {
      const progress = (wx.getStorageSync('htlb:v2:progress') || {})[bookId];
      if (progress && this.allChapters.some(c => c.chapterId === progress.chapterId)) readingId = progress.chapterId;
    } catch (e) { /* ignore */ }

    const upd = (book.sourceUpdatedAt || '').slice(5, 10).replace('-', '/');
    this.setData({
      book,
      bookPresentation: presentation(book),
      heroAccent: library.accentVar(bookId) || book.accent || '#226B60',
      updatedLabel: upd || '近期',
      topicCount: topics.length,
      topics: [{ id: '', name: '全部', count: this.allChapters.length }].concat(topics),
      chapters: this.allChapters,
      readingId,
      ...computeStats(book)
    });
    this.applyFilter('');
  },

  onShow() {
    if (!this.bookId) return;
    const progress = (wx.getStorageSync('htlb:v2:progress') || {})[this.bookId];
    const chapter = progress && library.getChapter(this.bookId, progress.chapterId);
    this.setData({ readingId: chapter ? chapter.chapterId : '', readingTitle: chapter ? chapter.title : '' });
  },
  onOpenLibrary() { wx.switchTab({ url: '/pages/library/library' }); },
  onContinue() {
    if (this.data.readingId) wx.navigateTo({ url: `/pkg-read/chapter-read/chapter-read?book=${this.bookId}&chapter=${this.data.readingId}` });
  },

  applyFilter(filter) {
    const list = filter
      ? this.data.chapters.filter(c => (c.topicIds || []).indexOf(filter) > -1)
      : this.data.chapters;
    this._filtered = list;
    this.setData({
      filter,
      filteredCount: list.length,
      hasMore: list.length > PREVIEW_COUNT,
      shownChapters: list.slice(0, this._expanded ? list.length : PREVIEW_COUNT)
    });
  },

  onFilter(e) {
    this._expanded = false;
    this.applyFilter(e.currentTarget.dataset.id || '');
  },

  onToggleAll() {
    this._expanded = !this._expanded;
    const list = this._filtered || this.data.chapters;
    this.setData({
      hasMore: !this._expanded && list.length > PREVIEW_COUNT,
      shownChapters: this._expanded ? list : list.slice(0, PREVIEW_COUNT)
    });
  },

  onChapterTap(e) {
    const { chapter } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pkg-read/chapter-read/chapter-read?book=${this.bookId}&chapter=${chapter}`
    });
  },

  onCopySource() {
    wx.setClipboardData({ data: this.data.book.sourceUrl });
  },

  onDownloadTap() {
    wx.navigateTo({ url: '/pkg-read/download/download' });
  },

  onShareAppMessage() {
    const b = this.data.book || {};
    return { title: `《${b.title}》：${(b.stats && b.stats.steps) || ''} 条可操作的建议`, path: `/pages/book-detail/book-detail?book=${b.id}` };
  }
});
