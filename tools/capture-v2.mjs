/**
 * v2 页面截图（写入 docs/images/v2-shots/，与设计稿画板对照用）
 *
 * 前置：cli auto --project . --auto-port 9420 --trust-project
 * 用法：node tools/capture-v2.mjs [name ...]（缺省全部）
 *
 * DevTools 自动化桥接用久会腐烂（导航超时/元素查询失效），
 * 遇 timeout / 页面不匹配自动执行 cli close + cli auto 恢复后重试一次。
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(PROJECT_ROOT, 'docs/images/v2-shots');
const CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const require = createRequire(path.join(PROJECT_ROOT, 'package.json'));
const automator = require('miniprogram-automator');

const SHOTS = [
  { name: '01-reco', url: '/pages/reco/reco', wait: 2200, scroll: 640 },
  { name: '02-wizard-step1', url: '/pkg-insight/wizard/wizard?topic=sleep', wait: 1600 },
  { name: '04-result', url: '/pkg-insight/result/result', wait: 3200, presetProfile: true, scroll: 640,
    expect: 'pkg-insight/result/result' },
  { name: '06-library-shelf', url: '/pages/library/library', mode: 'switchTab', wait: 2000 },
  { name: '07-library-topic', url: '/pages/library/library', mode: 'switchTab', wait: 1600,
    tap: '#tab-topic', tapWait: 900 },
  { name: '08-book-detail', url: '/pages/book-detail/book-detail?book=hltb', wait: 1800, scroll: 640 },
  { name: '10-topic-sleep', url: '/pages/topic-aggregate/topic-aggregate?topic=sleep', wait: 1800 },
  /* 阅读页 reLaunch 会超时（onReady 疑似不返回），从书详情点章节进入 */
  { name: '11-chapter-read', url: '/pages/book-detail/book-detail?book=hltb', wait: 1800,
    tap: '.chrow', tapWait: 3200, expect: 'pkg-read/chapter-read/chapter-read' },
  { name: '12-search', url: '/pkg-read/search/search', wait: 2200 },
  { name: '15-favorite', url: '/pages/favorite/favorite', mode: 'switchTab', wait: 2000 },
  { name: '16-daily', url: '/pkg-read/daily/daily', wait: 1800 },
  { name: '17-download', url: '/pkg-read/download/download', wait: 1800 },
  { name: '18-mine', url: '/pages/mine/mine', mode: 'switchTab', wait: 2000 },
  { name: '19-help', url: '/pkg-read/help/help', wait: 1600 },
  { name: '20-about', url: '/pkg-read/about/about', wait: 1800 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const targets = only.length ? SHOTS.filter((s) => only.includes(s.name)) : SHOTS;

fs.mkdirSync(OUT_DIR, { recursive: true });

let miniProgram = null;

async function connect() {
  miniProgram = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
}

/** 桥接腐烂时：关项目重开，重连 */
async function recover() {
  console.log('  … 桥接恢复中 (cli close + auto)');
  try { execFileSync(CLI, ['close', '--project', PROJECT_ROOT], { timeout: 60000 }); } catch { /* ignore */ }
  await sleep(3000);
  execFileSync(CLI, ['auto', '--project', PROJECT_ROOT, '--auto-port', '9420', '--trust-project'],
    { timeout: 120000 });
  await sleep(8000);
  await connect();
}

/** 截图带重试：滚动后 DevTools 偶发空错 */
async function shot(p) {
  for (let i = 0; i < 4; i++) {
    try { await miniProgram.screenshot({ path: p }); return; } catch (e) { await sleep(800); }
  }
  throw new Error('screenshot 重试耗尽: ' + p);
}

/** 单张截图完整流程；桥接类错误抛 Retryable */
async function runShot(s) {
  try {
    if (s.presetProfile) {
      const ts = Date.now();
      await miniProgram.callWxMethod('setStorageSync', 'htlb:v2:surveyProfileV2',
        JSON.stringify({ topicIds: ['sleep'], budget: 't15', obstacles: ['time'], goals: [], ts }));
      /* 同步写入分享解锁标记，截「已解锁」态（锁定态另有画板 result-lock） */
      await miniProgram.callWxMethod('setStorageSync', 'surveyShareUnlockV2', String(ts));
      await sleep(200);
    }
    await (s.mode === 'switchTab'
      ? miniProgram.switchTab(s.url)
      : miniProgram.reLaunch(s.url));

    /* 路径断言（currentPage 有滞后，多等几轮）——先断言导航目标 */
    const want = s.url.split('?')[0].replace(/^\//, '');
    let cur = null;
    for (let i = 0; i < 30; i++) {
      cur = await miniProgram.currentPage();
      if (cur && cur.path === want) break;
      await sleep(400);
    }
    if (!cur || cur.path !== want) throw new Error('Retryable:page-mismatch:' + (cur ? cur.path : '?'));

    await sleep(s.wait || 1600);
    if (s.tap) {
      const el = await (await miniProgram.currentPage()).$(s.tap);
      if (el) { await el.tap(); await sleep(s.tapWait || 800); }
    }
    /* tap 后若声明了最终页，再断言一次 */
    if (s.tap && s.expect) {
      let c2 = null;
      for (let i = 0; i < 20; i++) {
        c2 = await miniProgram.currentPage();
        if (c2 && c2.path === s.expect) break;
        await sleep(400);
      }
      if (!c2 || c2.path !== s.expect) throw new Error('Retryable:after-tap:' + (c2 ? c2.path : '?'));
    }
    await shot(path.join(OUT_DIR, `${s.name}.png`));
    if (s.scroll) {
      await miniProgram.pageScrollTo(s.scroll);
      await sleep(900);
      await shot(path.join(OUT_DIR, `${s.name}-b.png`));
      await miniProgram.pageScrollTo(0);
    }
  } catch (e) {
    const msg = (e && e.message) || '';
    if (/timeout/i.test(msg)) throw new Error('Retryable:timeout');
    throw e;
  }
}

await connect();

for (const s of targets) {
  try {
    try {
      await runShot(s);
    } catch (e) {
      if (!/^Retryable/.test((e && e.message) || '')) throw e;
      await recover();
      await runShot(s);
    }
    console.log('✓', s.name);
  } catch (e) {
    console.error('✗', s.name, (e && e.message) || JSON.stringify(e));
  }
}

try { await miniProgram.disconnect(); } catch { /* ignore */ }
console.log('完成 →', OUT_DIR);
