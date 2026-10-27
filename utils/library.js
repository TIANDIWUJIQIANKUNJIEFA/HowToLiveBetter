/**
 * v2 数据层：三书统一（utils/library.js，主包）
 *
 * 数据形态对齐后端统一内容模型（设计稿 3.1）：
 *   Book { id,title,author,description,license,sourceUrl,accent,rev,stats,capabilities }
 *   Chapter { uid,bookId,chapterId,ord,title,summary,brief,topicIds,stepCount,updatedAt }
 *   Step    { uid,bookId,chapterId,index,title,plain,cost,gainText,ratio,grade,... }
 *
 * 取数三级：内存 → Storage(htlb:v2:*) → 接口 → 随包基线 data/v2/*。
 * 条目正文基线只有主书（steps-hltb.js 在 pkg-read 分包，主包读不到——
 * 分包引主包可以、反过来不行），主包的正文兜底交给 pkg-read 的 content.js。
 *
 * 基线瘦身心口径（设计稿 5 包体积预算）：基线 step 不带 uid/bookId/chapterId
 * （由 键名/数组序号/文件名 推导），读取时在 rehydrate 里补全。
 */
const api = require('./api-v2.js');
const store = require('./store.js').v2;

const baselineBooks = require('../data/v2/books.js');
const baselineChapters = require('../data/v2/chapters.js');
const baselineGlossary = require('../data/v2/glossary.js');
const baselineQuotes = require('../data/v2/quotes.js');
const baselineTopics = require('../data/v2/topics.js');

/* ---------- 内存层 ---------- */
let _books = null;          // 数组
let _bookMap = null;
let _chapters = null;       // { bookId: [chapter] }
let _topics = null;

/* 书籍身份色（深浅自适应）：inline style 里直接可用。
   基线 books.js 里的 accent 是浅色态固定值，深色模式下深底配深字不可读，
   所以 UI 层一律走这里拿 token 变量；未知书籍回落基线 accent。 */
const ACCENT_VARS = { hltb: 'var(--lb-bk1)', social: 'var(--lb-bk2)', upgr: 'var(--lb-bk3)' };
const accentVar = (bookId) => ACCENT_VARS[bookId] || null;

const invalidate = () => { _books = null; _bookMap = null; _chapters = null; _topics = null; };

/* ---------- 基线 ---------- */
const baselineBookList = () => baselineBooks.map(b => ({ ...b, source: 'baseline' }));
const mergeCatalog = (remote) => {
  const map = {};
  baselineBookList().forEach(b => { map[b.id] = b; });
  (Array.isArray(remote) ? remote : []).forEach(b => {
    if (b.id === 'htga' || (b.id === 'social' && b.origin === 'bundled-original') || (map[b.id] && map[b.id].origin === 'bundled-original')) return;
    map[b.id] = b;
  });
  return Object.values(map).filter(b => b.id !== 'htga');
};

const baselineIndex = (bookId) => (baselineChapters[bookId] || []).map(c => ({ ...c, source: 'baseline' }));

/** 基线 step 补全推导字段（基线瘦身：uid/bookId/chapterId/index 不落盘） */
function rehydrateSteps(bookId, chapterId, rawList) {
  return (rawList || []).map((s, i) => ({
    uid: `${bookId}:${chapterId}:${i + 1}`,
    bookId,
    chapterId,
    index: i + 1,
    meta: {},
    topicIds: [],
    ...s
  }));
}

/* ---------- 读取（同步，页面首屏用） ---------- */

const getBooks = () => {
  if (_books) return _books;
  const cached = store.get('books');
  _books = mergeCatalog(cached);
  _bookMap = null;
  return _books;
};

const getBook = (bookId) => {
  if (!_bookMap) {
    /* 先在局部变量里建好再赋值：getBooks() 会把 _bookMap 重置为 null，重入会崩 */
    const map = {};
    getBooks().forEach(b => { map[b.id] = b; });
    _bookMap = map;
  }
  return _bookMap[bookId] || null;
};

const getChapters = (bookId) => {
  if (_chapters && _chapters[bookId]) return _chapters[bookId];
  const original = baselineBooks.find(b => b.id === bookId && b.origin === 'bundled-original');
  if (original) return baselineIndex(bookId);
  const cached = store.get(`chapters:${bookId}`);
  const current = cached && cached.length && (bookId !== 'social' || cached.every(c => /^rq\d{2}$/.test(c.chapterId)));
  const list = current ? cached : baselineIndex(bookId);
  if (!_chapters) _chapters = {};
  _chapters[bookId] = list;
  return list;
};

const getChapter = (bookId, chapterId) =>
  getChapters(bookId).find(c => c.chapterId === chapterId) || null;

const getGlossary = (bookId) => {
  const cached = store.get(`glossary:${bookId}`);
  if (cached && cached.length) return cached;
  return baselineGlossary[bookId] || [];
};

const getQuotes = () => {
  const cached = store.get('quotes');
  if (cached && cached.length) return cached;
  return baselineQuotes || [];
};

/* 主推主题展示顺序（设计稿 01/02/06：睡眠 情绪 人际 学习 工作 财务 安全 家庭） */
const PRIMARY_ORDER = ['sleep', 'mind', 'relation', 'learn', 'work', 'money', 'safety', 'family'];

/** 主题清单（向导 chips / 主题宫格 / 主题聚合页）：server 下发，离线用随包快照 */
const getTopics = () => {
  if (_topics) return _topics;
  const cached = store.get('topics');
  const list = (cached && cached.length ? cached : baselineTopics).slice();
  const rank = (t) => {
    const i = PRIMARY_ORDER.indexOf(t.id);
    return i === -1 ? PRIMARY_ORDER.length : i;
  };
  /* 主推主题按设计稿顺序排前，其余主题保持原相对顺序随后（稳定排序，仅影响展示） */
  _topics = list.sort((a, b) => {
    if (a.primary !== b.primary) return a.primary ? -1 : 1;
    return rank(a) - rank(b);
  });
  return _topics;
};

const getTopic = (id) => getTopics().find(t => t.id === id) || null;

/** 所有书的全部章节（跨书聚合用） */
const getAllChapters = () => {
  const out = [];
  getBooks().forEach(b => { getChapters(b.id).forEach(c => out.push(c)); });
  return out;
};

/** 主题 → 章节列表（跨书聚合） */
const getChaptersByTopic = (topicId) =>
  getAllChapters().filter(c => (c.topicIds || []).indexOf(topicId) > -1);

/** 统计：条目总数（随书 rev 更新） */
const getTotalStepCount = () =>
  getBooks().reduce((s, b) => s + ((b.stats && b.stats.steps) || 0), 0);

/* ---------- 刷新（后台静默，页面不等它） ---------- */

/**
 * 对齐每书 rev：GET /books 后只拉有变化的书索引。
 * @returns {Promise<{changed:boolean, reason:string}>} 永远 resolve
 */
const refresh = (options = {}) => {
  if (options.force) api.setEnabled(true);
  if (!api.isEnabled()) return Promise.resolve({ changed: false, reason: 'disabled' });

  return api.getBooks().then((res) => {
    const books = mergeCatalog((res && res.books) || []);
    if (!books.length) return { changed: false, reason: 'bad-books' };


    let changed = JSON.stringify(books) !== JSON.stringify(mergeCatalog(store.get('books')));
    store.set('books', books);          // 目录小，直接写（含最新 rev）
    invalidate();

    /* 逐书对 rev：变了才拉章节索引（10KB 级） */
    return Promise.all(books.map(b => {
      if (b.origin === 'bundled-original') return Promise.resolve(false);
      const cached = store.get(`chapters:${b.id}`);
      const synced = store.get(`indexRev:${b.id}`);
      if (synced === b.rev && Array.isArray(cached) && cached.length) return Promise.resolve(false);
      return api.getIndex(b.id).then((idx) => {
        const chapters = (idx && idx.chapters) || [];
        if (chapters.length) {
          if (store.set(`chapters:${b.id}`, chapters) === false) return false;
          store.set(`indexRev:${b.id}`, b.rev);
          if (_chapters) delete _chapters[b.id];
          changed = true;
        }
        return true;
      }).catch(() => false);
    })).then(() => {
      /* 小件顺手刷新（体积小、失败静默） */
      api.getTopics().then((t) => {
        if (t && t.topics && t.topics.length) { store.set('topics', t.topics); _topics = null; }
      }).catch(() => {});
      api.getQuotes().then((q) => {
        if (q && q.quotes && q.quotes.length) store.set('quotes', q.quotes);
      }).catch(() => {});
      books.forEach(b => {
        if (!b.capabilities || !b.capabilities.glossary) return;
        api.getGlossary(b.id).then((g) => {
          if (g && g.terms && g.terms.length) store.set(`glossary:${b.id}`, g.terms);
        }).catch(() => {});
      });
      return { changed, reason: changed ? 'updated' : 'same-rev' };
    });
  }).catch((e) => ({ changed: false, reason: 'request-failed', error: e }));
};

module.exports = {
  getBooks, getBook, getChapters, getChapter, getChaptersByTopic, getAllChapters,
  getGlossary, getQuotes, getTopics, getTopic,
  getTotalStepCount, rehydrateSteps,
  accentVar,
  refresh, invalidate
};
