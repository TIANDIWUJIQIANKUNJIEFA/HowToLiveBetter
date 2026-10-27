/**
 * 章节阅读 · 建议型模板（v2 阅读核心，设计稿画板 11）
 *
 * 自 v1 pagesA/article 完整移植的解析层（上标引用 / 术语 / 来源拆分）+ v2 适配：
 *   - 入参 ?book=&chapter=&step=（旧链接 ?id=b01 由 withBookPrefix 永久兼容）
 *   - 数据：library.js（元数据/术语/主题）+ 本分包 content.js（正文三级取数）
 *   - 新增「阅读排版调节」：字号 / 行距 / 底色（纸白·米黄·夜间），存 htlb:v2:reader
 *   - 顶栏书徽标 + 书名；topic 标签；阅读进度写书架「在读」
 */
const app = getApp();
const library = require('../../utils/library.js');
const content = require('../utils/content.js');
const migrate = require('../../utils/migrate.js');
const { getStatusBarHeight, getNavBarHeight } = require('../../utils/util.js');

/* 标签文案映射（与上游 index.html 的 LABEL / LENS_LABEL 一致） */
const LENS_LABEL = { '死亡率': '换寿命', '金钱': '换钱', '时间': '换时间精力', '自由': '换人身自由' };
const COST_LABEL = {
  money: { '0': '不花钱', '少': '花少量钱', '多': '花不少钱' },
  time: { '少': '顺手', '中': '花几小时', '多': '每天占时间' },
  will: { '否': '不用毅力', '些': '要一点毅力', '是': '要很多毅力' }
};
const RATIO_KEY = { '极高': 3, '高': 2, '一般': 1 };

const SUP_RE = /（\s*(?:第\s*(\d+)\s*节)?\s*第\s*(\d+(?:\s*[到\-–—~]\s*\d+)?)\s*条\s*(?:，\s*([^）]+?)\s*)?）|(?:第\s*(\d+)\s*节)?\s*第\s*(\d+(?:\s*[到\-–—~]\s*\d+)?)\s*条/g;

/* 各书章条目数（校验引用有效性），来自章节索引的 stepCount */
const stepCounts = () => {
  const map = {};
  library.getAllChapters().forEach(c => { map[`${c.bookId}:${c.chapterId}`] = c.stepCount || 0; });
  return map;
};

/* 术语表：library 按书取（服务端缓存 > 基线），渲染层匹配原文不动 */
function buildTermRegex(bookId) {
  const list = library.getGlossary(bookId) || [];
  const TERM_MAP = {};
  list.forEach(t => { TERM_MAP[t.term] = t; });
  const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isLatin = (t) => /^[A-Za-z0-9%. ]+$/.test(t);
  const latin = list.filter(t => isLatin(t.term)).map(t => escRe(t.term));
  const cjk = list.filter(t => !isLatin(t.term)).map(t => escRe(t.term));
  const parts = [];
  if (latin.length) parts.push(`(?:^|[^A-Za-z0-9])(?:${latin.join('|')})(?![A-Za-z0-9])`);
  if (cjk.length) parts.push(`(?:${cjk.join('|')})`);
  return { TERM_MAP, TERM_RE: parts.length ? new RegExp(parts.join('|'), 'g') : null };
}

const normNums = (s) => String(s).replace(/\s+/g, '').replace(/[到–—~]/g, '-');

function pushText(runs, text, b, term) {
  if (!text) return;
  if (!term.TERM_RE) { runs.push({ t: text, b }); return; }
  let last = 0;
  let m;
  term.TERM_RE.lastIndex = 0;
  while ((m = term.TERM_RE.exec(text)) !== null) {
    const key = term.TERM_MAP[m[0]] ? m[0] : m[0].slice(1);
    if (!term.TERM_MAP[key]) continue;
    const lead = m[0].length - key.length;
    if (m.index > last) runs.push({ t: text.slice(last, m.index), b });
    if (lead) runs.push({ t: m[0].slice(0, lead), b });
    runs.push({ t: key, b, term: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ t: text.slice(last), b });
}

/* 单段引用拆解：chapterKey = bookId:chapterId（引用校验 + 跨篇跳转） */
function makeRuns(text, chapterKey, chapterId, counts, term) {
  const runs = [];
  let last = 0;
  SUP_RE.lastIndex = 0;
  let m;
  const maxStep = counts[chapterKey] || 0;
  while ((m = SUP_RE.exec(text)) !== null) {
    const sec = m[1] !== undefined ? Number(m[1]) : (m[4] !== undefined ? Number(m[4]) : null);
    const nums = normNums(m[2] !== undefined ? m[2] : m[5]);
    const desc = m[3];
    const list = nums.split('-').map(Number);
    let ref = null;
    if (sec !== null) {
      const to = 'b' + String(sec).padStart(2, '0');
      const max = counts[`${chapterKey.split(':')[0]}:${to}`] || 0;
      if (max && list.every(n => n >= 1 && n <= max)) ref = { step: list[0], to };
    } else if (list.every(n => n >= 1 && n <= maxStep)) {
      ref = { step: list[0], to: '' };
    }
    if (m.index > last) pushText(runs, text.slice(last, m.index), false, term);
    if (ref) {
      if (desc) pushText(runs, `（${desc}）`, false, term);
      runs.push({ t: sec !== null ? `${sec}·${nums}` : nums, b: false, ref });
    } else {
      pushText(runs, m[0], false, term);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) pushText(runs, text.slice(last), false, term);
  void chapterId;
  return runs;
}

function parseRich(text, chapterKey, chapterId, counts, term) {
  if (!text) return [{ t: '' }];
  const runs = [];
  String(text).split('**').forEach((seg, i) => {
    if (!seg) return;
    const b = i % 2 === 1;
    makeRuns(seg, chapterKey, chapterId, counts, term).forEach(r => runs.push(b ? { ...r, b: true } : r));
  });
  return runs.length ? runs : [{ t: '' }];
}

/* 来源拆分（与上游 splitSrc 一致） */
const SRC_OPEN = '「『（';
const SRC_CLOSE = '」』）';
const splitSrc = (text) => {
  const parts = [];
  let buf = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (SRC_OPEN.includes(c)) depth++;
    if (SRC_CLOSE.includes(c)) depth = Math.max(0, depth - 1);
    const semi = c === '；' || (c === ';' && /\s/.test(text[i - 1] || '') && /\s/.test(text[i + 1] || ''));
    if (semi && depth === 0) { parts.push(buf); buf = ''; continue; }
    buf += c;
  }
  parts.push(buf);
  return parts.map(s => s.trim()).filter(Boolean);
};

const URL_RE = /https?:\/\/[^\s）)；;；，,」』"'》]+/g;
const urlRuns = (text) => {
  const runs = [];
  let last = 0;
  let m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) runs.push({ t: text.slice(last, m.index) });
    runs.push({ t: m[0], url: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ t: text.slice(last) });
  return runs;
};

/* 条目渲染装饰：收藏态 + 折叠态 + chips + 富文本 runs（favs 传三段式条目收藏 uid 列表） */
function decorateSteps(steps, chapterKey, chapterId, counts, term, favs) {
  const favSet = favs || [];
  return (steps || []).map(s => {
    const meta = s.meta || {};
    const cost = s.cost || {};
    const sourceText = String(s.source || '').replace(/<(https?:\/\/[^>]+)>/g, '$1');
    const srcParts = s.source ? (s.meta && s.meta.kind === 'editorial' ? sourceText.split(/\n\n+/).filter(Boolean) : splitSrc(sourceText)) : [];
    const uid = `${chapterKey}:${s.index}`;
    return {
      ...s,
      uid,
      isFav: favSet.indexOf(uid) > -1,
      flash: false,
      noLabel: String(s.index).padStart(2, '0'),
      ratioText: s.ratio || meta.ratio || '',
      dispute: meta.dispute || '',
      todo: meta.todo || '',
      costOpen: true, gainOpen: true, noteOpen: true, refsOpen: false,
      refCount: srcParts.length,
      refList: srcParts.map(t => ({ runs: urlRuns(t) })),
      lensText: LENS_LABEL[s.lens || meta.lens] || s.lens || meta.lens || '',
      costTags: [COST_LABEL.money[cost.money], COST_LABEL.time[cost.time], COST_LABEL.will[cost.will]].filter(Boolean),
      ratioKey: RATIO_KEY[s.ratio || meta.ratio] || 1,
      sectionRows: Object.keys(s.sections || {}).map(label => ({ label, runs: parseRich(s.sections[label], chapterKey, chapterId, counts, term) })),
      hasSections: Object.keys(s.sections || {}).length > 0,
      sceneLabels: [s.scene, s.object].filter(Boolean),
      plainRuns: parseRich(s.plain, chapterKey, chapterId, counts, term),
      costRuns: parseRich(s.costText, chapterKey, chapterId, counts, term),
      gainRuns: parseRich(s.gainText, chapterKey, chapterId, counts, term),
      noteRuns: parseRich(s.note, chapterKey, chapterId, counts, term)
    };
  });
}

/* 阅读排版设置（设计稿 4.1：字号/行距/底色三组调节） */
const READER_DEFAULT = { font: 'md', line: 'md', theme: 'paper' };   // theme: paper|sepia|night
const FONT_CLS = { sm: 'rd-font-sm', md: '', lg: 'rd-font-lg' };
const LINE_CLS = { sm: 'rd-line-sm', md: '', lg: 'rd-line-lg' };
const THEME_CLS = { paper: '', sepia: 'rd-theme-sepia', night: 'rd-theme-night' };
/* 导航随阅读底色：手动主题不能依赖系统深浅（令牌 --lb-* 是系统级的） */
const THEME_NAV = {
  paper: { navBg: 'var(--lb-surface, #FFFDF9)', navText: 'var(--lb-ink, #242E2B)' },
  sepia: { navBg: '#F3EBD8', navText: '#242E2B' },
  night: { navBg: '#101613', navText: '#D7E0D5' }
};

Page({
  data: {
    book: null,
    chapter: null,
    topicTags: [],
    steps: [],
    contentRuns: [],
    summaryRuns: [],
    sourceNote: '',
    isFavorite: false,
    isLiked: false,
    burstShow: false,
    starPop: false,
    term: null,
    termShow: false,
    relatedChapters: [],
    citeBack: false,
    citeBackAction: 'scroll',
    citeBackLabel: '回到原文',
    /* 排版调节 */
    showTypeset: false,
    reader: READER_DEFAULT,
    fontCls: '',
    lineCls: '',
    themeCls: '',
    navBg: THEME_NAV.paper.navBg,
    navText: THEME_NAV.paper.navText
  },

  onLoad(options) {
    /* 旧分享链接兼容：?id=b01（&step=N）→ hltb:b01 */
    let { book, chapter, step, id } = options || {};
    if (!book && id) {
      const mapped = migrate.withBookPrefix(id).split(':');
      book = mapped[0]; chapter = mapped[1];
    }
    book = book || 'hltb';
    if (!chapter) {
      this.setData({ loadError: '链接缺少章节信息，请从书库重新选择。' });
      return;
    }
    this.bookId = book;
    this.chapterId = chapter;

    const reader = this.loadReaderSettings();
    this.setData({
      reader,
      fontCls: FONT_CLS[reader.font] || '',
      lineCls: LINE_CLS[reader.line] || '',
      themeCls: THEME_CLS[reader.theme] || '',
      ...(THEME_NAV[reader.theme] || THEME_NAV.paper)
    });

    const previous = (wx.getStorageSync('htlb:v2:progress') || {})[book];
    this._restoreTop = !step && previous && previous.chapterId === chapter ? previous.scrollTop || 0 : 0;
    this._themeListener = () => this.syncStatusBar();
    if (wx.onThemeChange) wx.onThemeChange(this._themeListener);
    this.load();
    if (Number(step) >= 1) {
      this._entryStep = Number(step);   // 带 ?step= 进入：底栏/菜单转发默认定位到该条
      this._entryTimer = setTimeout(() => this.scrollToStep(Number(step)), 400);
      this.setData({ citeBack: true, citeBackAction: 'back', citeBackLabel: '返回上处' });
    }
  },

  load() {
    const book = library.getBook(this.bookId);
    const chapter = library.getChapter(this.bookId, this.chapterId);
    if (!book || !chapter) {
      this.setData({ loadError: '这个章节暂时无法找到，请重试或返回书库。' });
      return;
    }
    this.book = book;
    this.chapter = chapter;

    const counts = stepCounts();
    const term = buildTermRegex(this.bookId);
    const chapterKey = `${this.bookId}:${this.chapterId}`;
    const favs = app.globalData.favorites || [];

    const steps = decorateSteps(content.getSteps(this.bookId, this.chapterId), chapterKey, this.chapterId, counts, term, favs);
    const summaryRuns = parseRich(chapter.summary, chapterKey, this.chapterId, counts, term);
    /* 服务端把导语同时放进 content[0]：与 summary 相同的段不重复渲染 */
    const norm = (t) => String(t || '').replace(/\s+/g, '');
    const sumKey = norm(chapter.summary);
    const contentRuns = content.getContent(this.bookId, this.chapterId)
      .filter(t => norm(t) !== sumKey)
      .map(t => parseRich(String(t || '').replace('括号里是条号', '数字上标是条号，点一下可跳到对应条目'), chapterKey, this.chapterId, counts, term));

    /* 相关阅读：同主题优先（favs 已在函数开头取出） */
    const related = library.getAllChapters()
      .filter(c => c.uid !== chapter.uid && (c.topicIds || []).some(t => (chapter.topicIds || []).indexOf(t) > -1))
      .slice(0, 4)
      .map(c => ({
        uid: c.uid, bookId: c.bookId, chapterId: c.chapterId,
        title: c.title, brief: c.brief,
        bookTitle: (library.getBook(c.bookId) || {}).title || '',
        accent: library.accentVar(c.bookId) || (library.getBook(c.bookId) || {}).accent || '#226B60',
        isFavorite: favs.includes(c.uid)
      }));

    app.addReadHistory(chapter.uid);


    /* 导航短标题 + 阅读时长估算（约 1.2 min/条，封顶 30） */
    const sectionWords = steps.reduce((n, s) => n + Object.values(s.sections || {}).join('').length, 0);
    const readMinutes = Math.max(3, Math.min(30, Math.round(book.origin === 'bundled-original' ? sectionWords / 300 : steps.length * 1.2)));
    const shortBook = (book.title || '').replace(/人生指南|指南$/, '') || book.title;
    const updatedLabel = (chapter.updatedAt || '').slice(5, 10).replace('-', '/');

    this.setData({
      book,
      chapter,
      navTitle: `${shortBook} · 第 ${chapter.ord} 章`,
      readMinutes,
      updatedLabel,
      topicTags: (chapter.topicIds || []).map(id => (library.getTopic(id) || {}).name || id).slice(0, 3),
      steps,
      summaryRuns,
      contentRuns,
      relatedChapters: related,
      isFavorite: favs.includes(chapter.uid),
      isLiked: (wx.getStorageSync('likedArticles') || []).includes(chapter.uid)
    });

    /* 在线补全：条目 rev 变了替换；导语段补全 */
    content.fetchSteps(this.bookId, this.chapterId).then((r) => {
      if (!r.changed || !r.steps || !r.steps.length) return;
      this.setData({
        readMinutes: Math.max(3, Math.min(30, Math.round(r.steps.length * 1.2))),
        steps: decorateSteps(r.steps, chapterKey, this.chapterId, counts, buildTermRegex(this.bookId),
          app.globalData.favorites || [])
      });
    });
    content.fetchContent(this.bookId, this.chapterId).then((r) => {
      if (!r.changed || !r.content || !r.content.length) return;
      const t = buildTermRegex(this.bookId);
      this.setData({
        contentRuns: r.content.filter(x => norm(x) !== sumKey).map(x => parseRich(String(x || '').replace('括号里是条号', '数字上标是条号，点一下可跳到对应条目'), chapterKey, this.chapterId, counts, t)),
        sourceNote: r.sourceNote || ''
      });
    });
  },

  syncStatusBar() {
    const theme = (this.data.reader || {}).theme;
    const systemDark = wx.getAppBaseInfo ? wx.getAppBaseInfo().theme === 'dark' : false;
    const dark = theme === 'night' || (theme === 'paper' && systemDark);
    wx.setNavigationBarColor({ frontColor: dark ? '#ffffff' : '#000000', backgroundColor: dark ? '#17201C' : '#F6F5F0' });
  },
  onShow() { this.syncStatusBar(); },
  onReady() {
    if (this._restoreTop) this._restoreTimer = setTimeout(() => wx.pageScrollTo({ scrollTop: this._restoreTop, duration: 0 }), 450);
  },
  onHide() {
    if (this.chapter) this.saveProgress(this.chapter);
    const dark = wx.getAppBaseInfo ? wx.getAppBaseInfo().theme === 'dark' : false;
    wx.setNavigationBarColor({ frontColor: dark ? '#ffffff' : '#000000', backgroundColor: dark ? '#17201C' : '#F6F5F0' });
  },
  onUnload() {
    this.onHide();
    if (wx.offThemeChange && this._themeListener) wx.offThemeChange(this._themeListener);
    clearTimeout(this._restoreTimer);
    clearTimeout(this._entryTimer);
    clearTimeout(this._citeArmTimer);
  },
  onRetry() { this.setData({ loadError: '' }); this.load(); },
  onOpenLibrary() { wx.switchTab({ url: '/pages/library/library' }); },

  saveProgress(chapter) {
    try {
      const all = wx.getStorageSync('htlb:v2:progress') || {};
      all[this.bookId] = { chapterId: chapter.chapterId, chapterTitle: chapter.title, scrollTop: this._lastScrollTop || 0, step: this._entryStep || 0, ts: Date.now() };
      wx.setStorageSync('htlb:v2:progress', all);
      if (app.queueCloudRecord) app.queueCloudRecord('progress', this.bookId, all[this.bookId]);
    } catch { /* ignore */ }
  },

  /* ---------- 排版调节 ---------- */
  loadReaderSettings() {
    try {
      const storeV2 = require('../../utils/store.js').v2;
      return { ...READER_DEFAULT, ...(storeV2.get('reader') || {}) };
    } catch { return { ...READER_DEFAULT }; }
  },

  onShowTypeset() { this.setData({ showTypeset: !this.data.showTypeset }); },
  onSetReader(e) {
    const { group, value } = e.currentTarget.dataset;
    const reader = { ...this.data.reader, [group]: value };
    require('../../utils/store.js').v2.set('reader', reader);
    this.setData({
      reader,
      fontCls: FONT_CLS[reader.font] || '',
      lineCls: LINE_CLS[reader.line] || '',
      themeCls: THEME_CLS[reader.theme] || '',
      ...(THEME_NAV[reader.theme] || THEME_NAV.paper)
    });
    this.syncStatusBar();
  },

  /* ---------- 阅读交互（自 v1 移植） ---------- */
  onContentTap(e) {
    const now = Date.now();
    if (this._lastTap && now - this._lastTap < 300) {
      this._lastTap = 0;
      this.onDoubleLike(e);
    } else {
      this._lastTap = now;
    }
  },

  onDoubleLike(e) {
    const { chapter, isLiked } = this.data;
    if (!chapter) return;
    const p = (e.detail && e.detail.clientX != null) ? e.detail : ((e.touches && e.touches[0]) || {});
    this.setData({ burstShow: true, burstX: p.clientX || 0, burstY: p.clientY || 0 });
    setTimeout(() => this.setData({ burstShow: false }), 700);
    if (isLiked) return;
    const liked = wx.getStorageSync('likedArticles') || [];
    if (liked.includes(chapter.uid)) return;
    liked.push(chapter.uid);
    wx.setStorageSync('likedArticles', liked);
    this.setData({ isLiked: true });
  },

  /** 底栏「点赞」：与双击点赞同一条记录逻辑，动画放在栏中心上方 */
  onLike() {
    const { chapter, isLiked } = this.data;
    if (!chapter) return;
    const info = wx.getSystemInfoSync();
    this.setData({ burstShow: true, burstX: info.windowWidth / 2, burstY: info.windowHeight - 180 });
    setTimeout(() => this.setData({ burstShow: false }), 700);
    if (isLiked) return;
    const liked = wx.getStorageSync('likedArticles') || [];
    if (liked.includes(chapter.uid)) return;
    liked.push(chapter.uid);
    wx.setStorageSync('likedArticles', liked);
    this.setData({ isLiked: true });
  },

  onToggleFold(e) {
    const { idx, field } = e.currentTarget.dataset;
    if (idx === undefined || !field) return;
    const step = this.data.steps[idx];
    if (!step) return;
    this.setData({ [`steps[${idx}].${field}`]: !step[field] });
  },

  onCopyRefUrl(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.setClipboardData({ data: url, success: () => wx.showToast({ title: '链接已复制', icon: 'none' }) });
  },

  onTermTap(e) {
    const k = e.currentTarget.dataset.k;
    const t = buildTermRegex(this.bookId).TERM_MAP[k];
    if (!t) return;
    this.setData({ term: { k: t.term, d: t.definition }, termShow: true });
  },

  onCloseTerm() { this.setData({ termShow: false }); },
  onNoop() {},

  onCiteTap(e) {
    const { step, to } = e.currentTarget.dataset;
    const n = Number(step);
    if (!n) return;
    if (to && to !== this.chapterId) {
      wx.navigateTo({ url: `/pkg-read/chapter-read/chapter-read?book=${this.bookId}&chapter=${to}&step=${n}` });
      return;
    }
    this._citeReturnTop = this._lastScrollTop || 0;
    this._citeArmed = false;
    this.scrollToStep(n);
    this.setData({ citeBack: true, citeBackAction: 'scroll', citeBackLabel: '回到原文' });
    clearTimeout(this._citeArmTimer);
    this._citeArmTimer = setTimeout(() => { this._citeArmed = true; }, 500);
  },

  onPageScroll(e) {
    this._lastScrollTop = e.scrollTop;
    if (this._citeArmed && this.data.citeBack && this.data.citeBackAction === 'scroll'
        && this._citeReturnTop != null && Math.abs(e.scrollTop - this._citeReturnTop) < 80) {
      this._citeArmed = false;
      this.setData({ citeBack: false });
    }
  },

  onCiteBackTap() {
    if (this.data.citeBackAction === 'back') {
      wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/reco/reco' }) });
      return;
    }
    this._citeArmed = false;
    wx.pageScrollTo({ scrollTop: this._citeReturnTop || 0, duration: 300 });
    this.setData({ citeBack: false });
  },

  scrollToStep(step) {
    const q = wx.createSelectorQuery();
    q.select(`#step-${step}`).boundingClientRect();
    q.selectViewport().scrollOffset();
    q.exec((res) => {
      const rect = res && res[0];
      const scroll = res && res[1];
      if (!rect || !scroll) return;
      const navH = getStatusBarHeight() + getNavBarHeight();
      wx.pageScrollTo({
        scrollTop: scroll.scrollTop + rect.top - navH - 12,
        duration: 300
      });
      const idx = this.data.steps.findIndex(s => s.index === step);
      if (idx === -1) return;
      const key = `steps[${idx}].flash`;
      this.setData({ [key]: true });
      clearTimeout(this._flashTimer);
      this._flashTimer = setTimeout(() => this.setData({ [key]: false }), 1500);
    });
  },

  onFavorite() {
    const { chapter, isFavorite } = this.data;
    if (!chapter) return;
    const favorites = [...(app.globalData.favorites || [])];
    if (isFavorite) {
      const idx = favorites.indexOf(chapter.uid);
      if (idx > -1) favorites.splice(idx, 1);
      wx.showToast({ title: '已取消收藏', icon: 'none' });
    } else {
      favorites.push(chapter.uid);
      wx.showToast({ title: '已收藏', icon: 'none' });
    }
    app.saveFavorites(favorites);
    this.setData({ isFavorite: !isFavorite, starPop: true });
    setTimeout(() => this.setData({ starPop: false }), 320);
  },

  /* 条目级收藏（收藏页「建议」tab，设计稿画板 15）：uid 三段式 bookId:chapterId:index */
  onStepFavorite(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const step = this.data.steps[idx];
    if (!step) return;
    const uid = `${this.bookId}:${this.chapterId}:${step.index}`;
    const favorites = [...(app.globalData.favorites || [])];
    const at = favorites.indexOf(uid);
    let added;
    if (at > -1) {
      favorites.splice(at, 1);
      wx.showToast({ title: '已取消收藏', icon: 'none' });
      added = false;
    } else {
      favorites.push(uid);
      /* 收藏页在主包读不到分包正文，落一份标题/摘要元数据 */
      app.addFavMeta(uid, {
        title: step.title,
        plain: String(step.plain || '').replace(/\*\*/g, '').slice(0, 80),
        bookId: this.bookId,
        chapterId: this.chapterId,
        index: step.index,
        chapterTitle: (this.chapter && this.chapter.title) || '',
        bookTitle: (this.book && this.book.title) || '',
        ts: Date.now()
      });
      wx.showToast({ title: '已收藏这条建议', icon: 'none' });
      added = true;
    }
    app.saveFavorites(favorites);
    this.setData({ [`steps[${idx}].isFav`]: added, [`steps[${idx}].pop`]: true });
    clearTimeout(this._popTimer);
    this._popTimer = setTimeout(() => this.setData({ [`steps[${idx}].pop`]: false }), 340);
  },

  onRelatedTap(e) {
    const { book, chapter } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pkg-read/chapter-read/chapter-read?book=${book}&chapter=${chapter}` });
  },

  onRelatedFavorite(e) {
    const { id } = e.currentTarget.dataset;
    const favorites = [...(app.globalData.favorites || [])];
    const idx = favorites.indexOf(id);
    if (idx > -1) favorites.splice(idx, 1); else favorites.push(id);
    app.saveFavorites(favorites);
    this.setData({
      relatedChapters: this.data.relatedChapters.map(c =>
        c.uid === id ? { ...c, isFavorite: idx === -1 } : c)
    });
  },

  onShowTimelineGuide() { this.setData({ showGuide: true }); },

  onCloseGuide() { this.setData({ showGuide: false }); },

  onShareAppMessage(e) {
    const { chapter, book, steps } = this.data;
    if (!chapter) return { title: '更好的生活，从每一个选择开始丨人生指南库', path: '/pages/reco/reco' };

    /* 条目级分享（三级定位 book/chapter/step，方案 4.3.C）：
       ① 条目行内分享按钮 e.target.dataset.step；② 带 ?step= 进入时默认分享该条。
       接收方 onLoad 的 ?step= 会滚动定位 + 高亮。 */
    const ds = (e && e.target && e.target.dataset) || {};
    const stepNo = Number(ds.step) || this._entryStep || 0;
    if (stepNo) {
      const step = (steps || []).find(s => s.index === stepNo);
      if (step) {
        const shortBook = (book.title || '').replace(/人生指南|指南$/, '') || book.title;
        return {
          title: `${step.title}丨${shortBook}`,
          path: `/pkg-read/chapter-read/chapter-read?book=${chapter.bookId}&chapter=${chapter.chapterId}&step=${stepNo}`
        };
      }
    }
    return {
      title: `${chapter.title}丨${(book && book.title) || '人生指南库'}`,
      path: `/pkg-read/chapter-read/chapter-read?book=${chapter.bookId}&chapter=${chapter.chapterId}`
    };
  },

  onShareTimeline() {
    const { chapter } = this.data;
    if (!chapter) return { title: '人生指南库' };
    return {
      title: `${chapter.title}丨人生指南库`,
      query: `book=${chapter.bookId}&chapter=${chapter.chapterId}`
    };
  }
});
