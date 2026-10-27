/**
 * 两步向导（设计稿画板 03/04）：
 *   第 1 步 选一个方向（8 个主主题，选中自动进入下一步）
 *   第 2 步 时间预算（单选）+ 最大障碍（chips 多选可跳过）
 * 产出 surveyProfileV2 → result 页调服务端推荐。
 */
const library = require('../../utils/library.js');
const match = require('../../utils/match.js');

/* 设计稿 03：短名 / 一句画像 / 图标 */
const TOPIC_META = {
  sleep:   { short: '睡眠', desc: '入睡难、熬夜、睡不够', icon: '/assets/icons-v2/moon.png' },
  mind:    { short: '情绪', desc: '焦虑、压力、低谷', icon: '/assets/icons-v2/heartT.png' },
  relation:{ short: '人际', desc: '合作、求助、拒绝、分寸', icon: '/assets/icons-v2/people.png' },
  learn:   { short: '学习', desc: '技能、升学、练习', icon: '/assets/icons-v2/bookO.png' },
  work:    { short: '工作', desc: '效率、职场权益', icon: '/assets/icons-v2/caseI.png' },
  money:   { short: '财务', desc: '攒钱、保险、防骗', icon: '/assets/icons-v2/coin.png' },
  safety:  { short: '安全', desc: '急救、居家、出行', icon: '/assets/icons-v2/shield.png' },
  family:  { short: '家庭', desc: '育儿、长辈、关系', icon: '/assets/icons-v2/house.png' }
};

const BUDGETS = [
  { id: 't5', label: '5–10 分钟', desc: '顺手就能做完的那种' },
  { id: 't15', label: '10–30 分钟', desc: '每天能挤出一小段' },
  { id: 't30', label: '30 分钟以上', desc: '愿意认真投入' },
  { id: 'tfree', label: '时间不固定', desc: '有空就做，别限我' }
];

/* 障碍 → 服务端结构化加成维度（engine.OBSTACLE_BOOST 的 key） */
const OBSTACLES = [
  { id: 'time', label: '时间不够' },
  { id: 'will', label: '怕坚持不下来' },
  { id: 'know', label: '不知道从哪开始' },
  { id: 'none', label: '先看看再说' }
];

Page({
  data: {
    step: 1,
    topics: [],
    sourceCount: 0,
    sourceSteps: 0,
    sel: '',            // 第 1 步选中的 topicId（单选）
    budgets: BUDGETS,
    budget: '',
    obstacles: OBSTACLES,
    obstaclesSel: []
  },

  onLoad(options) {
    const topics = library.getTopics().filter(t => t.primary).map(t => ({
      id: t.id,
      name: t.name,
      short: (TOPIC_META[t.id] || {}).short || t.name,
      desc: (TOPIC_META[t.id] || {}).desc || '',
      icon: (TOPIC_META[t.id] || {}).icon || '/assets/icons-v2/spark.png',
      darkIcon: ((TOPIC_META[t.id] || {}).icon || '/assets/icons-v2/spark.png').replace('/icons-v2/', '/icons-v2/dark/')
    }));
    /* 外部带主题进入（如主题聚合页「为我挑选」）：只预选亮显，仍留在第 1 步 */
    const pre = options.topic && topics.some(t => t.id === options.topic) ? options.topic : '';
    this.setData({ topics, sel: pre });
    this.updateSources();
    library.refresh().then(() => this.updateSources());
  },

  updateSources() {
    const books = library.getBooks().filter(b => (b.capabilities || {}).matchable);
    this.setData({ sourceCount: books.length, sourceSteps: books.reduce((n, b) => n + ((b.stats || {}).steps || 0), 0) });
  },

  /** 第 1 步：点选即高亮，短暂停留后自动进步 */
  onTopic(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.step !== 1 || this._advancing) return;
    this.setData({ sel: id });
    this._advancing = true;
    setTimeout(() => {
      this._advancing = false;
      this.setData({ step: 2 });
    }, 180);
  },

  /** 导航返回：第 2 步回第 1 步，第 1 步退出页面 */
  onNavBack() {
    if (this.data.step === 2) {
      this.setData({ step: 1 });
      return;
    }
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/reco/reco' });
  },

  onBudget(e) { this.setData({ budget: e.currentTarget.dataset.id }); },

  onObstacle(e) {
    const id = e.currentTarget.dataset.id;
    let sel = [...this.data.obstaclesSel];
    const i = sel.indexOf(id);
    if (i > -1) sel.splice(i, 1);
    else if (id === 'none') sel = ['none'];        // 「先看看再说」互斥
    else sel = sel.filter(s => s !== 'none').concat(id);
    this.setData({ obstaclesSel: sel, obstacles: this.data.obstacles.map(item => ({ ...item, selected: sel.includes(item.id) })) });
  },

  onSubmit() {
    const { sel, budget } = this.data;
    if (!sel) {
      wx.showToast({ title: '先选一个方向', icon: 'none' });
      this.setData({ step: 1 });
      return;
    }
    if (!budget) {
      wx.showToast({ title: '选一下每天能投入的时间', icon: 'none' });
      return;
    }
    const obstacles = this.data.obstaclesSel.filter(s => s !== 'none');
    match.saveProfileV2({
      topicIds: [sel],
      budget,
      obstacles,
      goals: [],
      ts: Date.now()
    });
    wx.navigateTo({ url: '/pkg-insight/result/result' });
  },

  onShareAppMessage() {
    return { title: '两步挑出适合你的生活建议', path: '/pages/reco/reco' };
  }
});
