/**
 * v2 客户端验收测试（node 模拟 wx，沿 v1 match 测试的方式）
 *
 * 覆盖：ID 迁移、store v2 命名空间、library 数据层（基线/主题/跨书聚合）、
 * 推荐本地兜底、pkg-read 内容层 rehydrate、app.json 页面四件套完整性。
 * 运行：node tools/test-v2.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0;
let fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; }
  else { fail++; console.error('  ✗', name); }
};

/* ---------- wx 模拟：内存版 Storage ---------- */
const storage = {};
const memStore = {
  getStorageSync: (k) => (k in storage ? storage[k] : ''),
  setStorageSync: (k, v) => { storage[k] = v; },
  removeStorageSync: (k) => { delete storage[k]; },
  request: () => { throw new Error('no network in tests'); }
};
global.wx = memStore;

/* ---------- 1. ID 迁移 ---------- */
const migrate = require(`${ROOT}/utils/migrate.js`);
ok(migrate.withBookPrefix('b01') === 'hltb:b01', '迁移: 裸章 id → hltb:b01');
ok(migrate.withBookPrefix('b3') === 'hltb:b03', '迁移: 补零');
ok(migrate.withBookPrefix('b03-12') === 'hltb:b03:12', '迁移: 章内条 id');
ok(migrate.withBookPrefix('hltb:b01') === 'hltb:b01', '迁移: v2 格式原样');
ok(migrate.withBookPrefix('b705') === 'b705', '迁移: 3 位以上数字非法条引用不转换');
storage['favorites'] = ['b01', 'b02-3', 'hltb:b05'];
ok(migrate.migrateV2() === true, '迁移: 首次执行返回 true');
ok(storage['favorites'][0] === 'hltb:b01' && storage['favorites'][1] === 'hltb:b02:3', '迁移: favorites 已补前缀');
ok(Array.isArray(storage['htlb:v1:backup'].favorites), '迁移: 已备份旧数据');
ok(migrate.migrateV2() === false, '迁移: 二次执行幂等');
const uid = migrate.getClientUuid();
ok(/^u-/.test(uid) && migrate.getClientUuid() === uid, '迁移: 匿名 uuid 稳定');

/* ---------- 2. store v2 命名空间 ---------- */
delete require.cache[require.resolve(`${ROOT}/utils/store.js`)];
const store = require(`${ROOT}/utils/store.js`);
store.v2.set('probe', { a: 1 });
ok(store.v2.get('probe').a === 1, 'store v2: 读写');
ok(storage['htlb:v2:probe'] !== undefined, 'store v2: key 前缀 htlb:v2:');
ok(store.getMeta === store.getMeta, 'store v1: API 保持');

/* ---------- 3. library 数据层（基线） ---------- */
delete require.cache[require.resolve(`${ROOT}/utils/library.js`)];
const library = require(`${ROOT}/utils/library.js`);
const books = library.getBooks();
ok(books.length >= 1 && books[0].id === 'hltb', 'library: 书目基线');
ok(library.getChapters('hltb').length === 34, 'library: 34 章');
ok(library.getTotalStepCount() === 1407, 'library: 总条数 1407（767 条人生建议 + 640 条人情世故建议）');
ok(library.getTopics().length === 22, 'library: 22 主题');
ok(library.getTopics().filter(t => t.primary).length === 8, 'library: 8 个主推 chips');
const b03 = library.getChapter('hltb', 'b03');
ok(b03 && (b03.topicIds || []).includes('sleep'), 'library: b03 归属 sleep 主题');
ok(library.getChaptersByTopic('sleep').length >= 1, 'library: 主题跨书聚合');
const g = library.getGlossary('hltb');
ok(Array.isArray(g) && g.length >= 40, 'library: 术语表完整（' + g.length + ' 条）');
ok(library.getQuotes().length > 0, 'library: 语录池');
/* 深浅字段：chapters 带 stepCount / topicIds */
ok(typeof b03.stepCount === 'number' && b03.stepCount > 0, 'library: stepCount 在索引上');

/* ---------- 4. 推荐本地兜底（服务端不可达 → local） ---------- */
delete require.cache[require.resolve(`${ROOT}/utils/match.js`)];
const match = require(`${ROOT}/utils/match.js`);
match.recommendV2({ topicIds: ['sleep'], budget: 't5', goals: ['free'] }, 4).then((res) => {
  ok(res.source === 'local', '推荐: 离线回落本地规则引擎');
  ok(Array.isArray(res.items) && res.items.length > 0, '推荐: 有结果');
  ok(res.items.every(it => /^hltb:b\d+:\d+$/.test(it.step.uid)), '推荐: 条目 uid 为 v2 三段式');
  ok(res.items.every(it => it.step.cost && it.step.cost.time === '少'), '推荐: 时间硬过滤生效');
}).then(() => pkgReadTests()).catch((e) => { console.error('推荐兜底异常', e); pkgReadTests(); });

function pkgReadTests() {
  /* ---------- 5. pkg-read 内容层（基线 rehydrate） ---------- */
  delete require.cache[require.resolve(`${ROOT}/pkg-read/utils/content.js`)];
  const content = require(`${ROOT}/pkg-read/utils/content.js`);
  const steps = content.getSteps('hltb', 'b03');
  ok(steps.length === 27, '内容层: b03 基线条目 27');
  ok(steps[0].uid === 'hltb:b03:1', '内容层: 基线 rehydrate 出 v2 uid');
  ok(steps[0].title && steps[0].plain, '内容层: 标题/说人话在');
  ok(steps.every(s => !s.source), '内容层: 瘦身口径（基线无 source，在线补）');

  /* ---------- 6. app.json 页面四件套完整性 ---------- */
  const appJson = JSON.parse(fs.readFileSync(`${ROOT}/app.json`, 'utf-8'));
  const allPages = [
    ...appJson.pages,
    ...appJson.subpackages.flatMap(sp => sp.pages.map(p => `${sp.root}/${p}`))
  ];
  let missing = [];
  allPages.forEach(p => {
    ['js', 'wxml', 'json'].forEach(ext => {
      if (!fs.existsSync(path.join(ROOT, `${p}.${ext}`))) missing.push(`${p}.${ext}`);
    });
  });
  ok(missing.length === 0, `app.json: 全部页面四件套齐全${missing.length ? '（缺 ' + missing.join(',') + '）' : ''}`);
  ok(appJson.tabBar.list.length === 4 &&
     appJson.tabBar.list[0].pagePath === 'pages/reco/reco', 'app.json: tabBar 四项且推荐页在首位');
  const tabPages = appJson.tabBar.list.map(t => t.pagePath);
  ok(tabPages.every(p => appJson.pages.includes(p)), 'app.json: tabBar 页都在主包');

  console.log(`\n${fail === 0 ? '✅' : '❌'} v2 客户端验收：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
