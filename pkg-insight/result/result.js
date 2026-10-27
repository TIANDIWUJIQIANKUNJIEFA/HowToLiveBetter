/**
 * 推荐结果（设计稿画板 04/05）：
 *   - 按实际请求进度加载 → 服务端推荐（理由 chips，无百分比）
 *   - 首选大卡 + 其他建议（来源分散）；行内负反馈「不太合适 / 已经在做」即时换一条
 *   - 推荐直接展示，自愿分享；区分无档案、无结果与本地兜底
 *   - scope 声明（设计稿 4.3.E：当前推荐来自哪几本书）
 */
const app = getApp();
const match = require('../../utils/match.js');
const library = require('../../utils/library.js');

const COST_LABEL = {
  money: { '0': '不花钱', '少': '花少量钱', '多': '花不少钱' },
  time: { '少': '顺手', '中': '花几小时', '多': '每天占时间' }
};
const BUDGET_LABEL = { t5: '5–10 分钟', t15: '10–30 分钟', t30: '30 分钟以上', tfree: '时间不固定' };
const OBSTACLE_LABEL = { time: '时间不够', will: '怕坚持不下来', know: '不知道从哪开始', none: '先看看再说' };
const TOPIC_SHORT = {
  sleep: '睡眠', mind: '情绪', relation: '人际', learn: '学习',
  work: '工作', money: '财务', safety: '安全', family: '家庭'
};

function decorate(item) {
  const s = item.step || {};
  const cost = s.cost || {};
  return {
    ...item,
    step: s,
    chips: (item.reasons || []).slice(0, 3),
    attrChips: [COST_LABEL.money[cost.money], COST_LABEL.time[cost.time]].filter(Boolean),
    accent: library.accentVar(s.bookId) || ((library.getBook(s.bookId) || {}).accent) || '#226B60',
    fav: (app.globalData.favorites || []).indexOf(s.uid) > -1
  };
}

Page({
  data: {
    loading: true,
    locked: false,
    profile: null,
    summaryRuns: [],
    scope: '',
    first: null,
    others: [],
    bookCount: 1,
    totalSteps: 0,
    empty: false
  },

  onLoad() {
    const profile = match.getProfileV2();
    if (!profile || !(profile.topicIds || []).length) {
      /* 无档案空态：引导去做问卷（设计稿：空态不锁） */
      this.setData({ empty: true, loading: false });
      return;
    }
    this.setData({ profile, locked: false, totalSteps: library.getTotalStepCount() });
    match.recommendV2(profile, 8).then(res => this.renderResult(res));
  },

  renderResult(res) {
    const items = (res.items || []).map(decorate);
    const bookCount = new Set(items.map(it => it.step.bookId)).size;
    this.setData({
      loading: false,
      noResults: !items.length,
      offline: res.source === 'local',
      first: items[0] || null,
      others: items.slice(1),
      bookCount: bookCount || 1,
      summaryRuns: this.summaryRuns(items, bookCount || 1),
      scope: res.scope === 'hltb' ? '当前推荐来自《高性价比人生指南》' : '',
      totalSteps: library.getTotalStepCount()
    });
  },

  /** 摘要条富文本段：关注 X · 每天约 Y · 障碍 Z，从 N 本书里挑出 M 条 */
  summaryRuns(items, bookCount) {
    const p = this.data.profile || {};
    const topics = (p.topicIds || []).map(id => TOPIC_SHORT[id] || (library.getTopic(id) || {}).name || id);
    const obstacle = (p.obstacles || []).map(id => OBSTACLE_LABEL[id]).filter(Boolean);
    const runs = [
      { t: '关注 ' }, { t: topics.join('、') || '综合', b: 1 },
      { t: ' · 每天约 ' }, { t: BUDGET_LABEL[p.budget] || '任意时间', b: 1 }
    ];
    if (obstacle.length) {
      runs.push({ t: ' · 障碍 ' }, { t: obstacle.join('、'), b: 1 });
    }
    runs.push({ t: `，从 ${bookCount} 本书里挑出 ${items.length} 条` });
    return runs;
  },

  onOpenStep(e) {
    const { book, chapter, index } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pkg-read/chapter-read/chapter-read?book=${book}&chapter=${chapter}&step=${index}`
    });
  },

  onFav(e) {
    const uid = e.currentTarget.dataset.uid;
    const favorites = [...(app.globalData.favorites || [])];
    const idx = favorites.indexOf(uid);
    if (idx > -1) favorites.splice(idx, 1); else favorites.push(uid);
    app.saveFavorites(favorites);
    /* 条目收藏补元数据（收藏页在主包，查不到分包正文，落一份标题） */
    if (idx === -1 && app.addFavMeta) {
      const it = [this.data.first].concat(this.data.others)
        .find(x => x && x.step && x.step.uid === uid);
      if (it) {
        app.addFavMeta(uid, {
          title: it.step.title, plain: it.step.plain,
          bookId: it.step.bookId, chapterId: it.step.chapterId,
          index: it.step.index, chapterTitle: it.chapterTitle, bookTitle: it.bookTitle,
          ts: Date.now()
        });
      }
    }
    const flip = (it) => (it && it.step && it.step.uid === uid) ? { ...it, fav: idx === -1 } : it;
    this.setData({
      first: flip(this.data.first),
      others: this.data.others.map(flip)
    });
  },

  /** 反馈：negative/doing 即时换一条；positive 只记录致谢 */
  onFeedback(e) {
    const { uid, kind } = e.currentTarget.dataset;
    if (this._feedbackPending) return;
    this._feedbackPending = true;
    match.sendFeedback(uid, kind).then((res) => {
      if (kind === 'positive') {
        wx.showToast({ title: res.ok ? '已记录这条反馈' : '提交失败，请稍后重试', icon: 'none' });
        return;
      }
      wx.showToast({ title: res.ok
        ? (kind === 'doing' ? '已记录，以后不再推它' : '好的，换一条')
        : '已在本机排除，尚未同步', icon: 'none' });
      return match.recommendV2(this.data.profile, 8).then((result) => this.renderResult(result));
    }).finally(() => { this._feedbackPending = false; });
  },

  onRedo() {
    wx.redirectTo({ url: '/pkg-insight/wizard/wizard' });
  },

  onDeepSurvey() {
    wx.navigateTo({ url: '/pagesB/survey/survey' });
  },

  onRecoHome() {
    wx.switchTab({ url: '/pages/reco/reco' });
  },

  /* 自愿分享，结果访问不依赖分享状态。 */
  onShareAppMessage() {
    return { title: this.shareTitle(), path: '/pages/reco/reco' };
  },

  shareTitle() {
    const p = this.data.profile || {};
    const names = (p.topicIds || []).map(id => (library.getTopic(id) || {}).name || id);
    return names.length
      ? `我在人生指南库为「${names[0]}」挑出了几条建议`
      : '人生指南库：每条建议都标注成本与证据';
  },

  onShareTimeline() {
    return { title: '人生指南库：帮你挑出真正划算的那几条生活建议' };
  }
});
