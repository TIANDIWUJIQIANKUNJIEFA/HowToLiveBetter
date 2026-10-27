/**
 * 每日一读（设计稿画板 16）：日期 + 语录（带作者出处）+ 换一句
 */
const { selectQuote } = require('../../utils/quote.js');

Page({
  data: {
    dateText: '',
    weekday: '',
    year: '',
    quote: null
  },

  onLoad(options = {}) {
    const now = new Date();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    this.setData({
      dateText: `${now.getMonth() + 1} / ${now.getDate()}`,
      weekday: `星期${weekdays[now.getDay()]}`,
      year: String(now.getFullYear())
    });
    this.pick(options.quoteId);
  },

  pick(id, next = false) { this.setData({ quote: selectQuote(id, next) }); },

  onNext() { this.pick((this.data.quote || {}).id, true); },

  onShareAppMessage() {
    const q = this.data.quote || {};
    return { title: q.text ? `「${q.text.slice(0, 24)}…」丨每日一读` : '每日一读丨人生指南库', path: `/pkg-read/daily/daily?quoteId=${encodeURIComponent(q.id || '')}` };
  },

  onShareTimeline() {
    const q = this.data.quote || {};
    return { title: q.text ? `「${q.text.slice(0, 24)}…」丨每日一读` : '每日一读丨人生指南库', query: `quoteId=${encodeURIComponent(q.id || '')}` };
  }
});
