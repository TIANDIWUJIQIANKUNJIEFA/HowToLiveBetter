/**
 * 从设计稿 HTML 重制小程序用位图素材：
 *  - 图标：设计稿 SVG → 指定颜色/尺寸的透明 PNG（assets/icons-v2/）
 *  - 书封：截取 .bk .cover（含 3D 斜放变换与封面文字，直接烘焙）→ JPEG（assets/porcelain/）
 *  - 插画：home-hero 人物（透明 PNG 烘到 hero 底色 #E5ECE6）→ JPEG
 *
 * 用法：node tools/render-assets.mjs   （需 playwright-core，走全局 clawdbot 依赖）
 */
import { chromium } from '/Users/zhengyihui/.nvm/versions/node/v24.13.0/lib/node_modules/clawdbot/node_modules/playwright-core/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));           // miniprogram/tools
const MP = path.resolve(ROOT, '..');
const DESIGN = '/Users/zhengyihui/代码/个人项目/HowToLiveBetter/design-v2/人生指南库-v2-完整设计稿.html';
const ICON_DIR = path.join(MP, 'assets/icons-v2');
const ART_DIR = path.join(MP, 'assets/porcelain');
fs.mkdirSync(ICON_DIR, { recursive: true });
fs.mkdirSync(ART_DIR, { recursive: true });

/* ---------- 设计稿 SVG 图标（stroke 系；quote 为 fill 系） ---------- */
const SVGS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  star: '<path d="M12 3l2.7 5.8 6.3.8-4.6 4.4 1.2 6.2L12 17.2 6.4 20.2l1.2-6.2L3 9.6l6.3-.8z"/>',
  heart: '<path d="M12 20s-7.5-4.7-9.3-9.2C1.2 7 3.4 4 6.8 4c2.2 0 4 1.2 5.2 3 1.2-1.8 3-3 5.2-3 3.4 0 5.6 3 4.1 6.8C19.5 15.3 12 20 12 20z"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  moments: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  books: '<path d="M4 5.5C4 4.7 4.7 4 5.5 4H10v16H5.5C4.7 20 4 19.3 4 18.5zM19 5.5c0-.8-.7-1.5-1.5-1.5H13v16h4.5c.8 0 1.5-.7 1.5-1.5z"/>',
  bmk: '<path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"/>',
  user: '<circle cx="12" cy="8.2" r="3.6"/><path d="M5 20c.8-4 3.4-6 7-6s6.2 2 7 6"/>',
  clockW: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2.5"/>',
  download: '<path d="M12 4v11M8 11l4 4 4-4"/><path d="M5 19h14"/>',
  desktop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
  bookI: '<path d="M5 5a2 2 0 0 1 2-2h12v16H7a2 2 0 0 0-2 2z"/><path d="M9 7h6M9 10.5h6"/>',
  chat: '<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4z"/>',
  pencil: '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.5"/>',
  moon: '<path d="M12.5 3.2a6.2 6.2 0 0 0 8.3 9 9 9 0 1 1-8.3-9z"/>',
  heartT: '<path d="M12 19.6s-6.8-4.2-8.5-8.3C2.3 8.2 4.3 5.6 7.1 5.6c1.9 0 3.7 1.2 4.9 2.9 1.2-1.7 3-2.9 4.9-2.9 2.8 0 4.8 2.6 3.6 5.7-1.7 4.1-8.5 8.3-8.5 8.3z"/>',
  people: '<circle cx="9" cy="8.6" r="2.8"/><path d="M4.2 18.6c.7-3.1 2.5-4.7 4.8-4.7s4.1 1.6 4.8 4.7"/><circle cx="16.2" cy="9.6" r="2.2"/><path d="M15.6 13.9c2.1.2 3.7 1.7 4.3 4.5"/>',
  bookO: '<path d="M4 6.2c0-.9.7-1.6 1.6-1.6H11V19H5.6C4.7 19 4 18.3 4 17.4zM20 6.2c0-.9-.7-1.6-1.6-1.6H13V19h5.4c.9 0 1.6-.7 1.6-1.6z"/>',
  caseI: '<rect x="4" y="8" width="16" height="11" rx="2"/><path d="M9 8V6.8A1.8 1.8 0 0 1 10.8 5h2.4A1.8 1.8 0 0 1 15 6.8V8M4 12.8h16"/>',
  coin: '<circle cx="12" cy="12" r="8.2"/><path d="M9 8.6l3 3.6 3-3.6M12 12.2V17M9.6 13.6h4.8M9.6 15.4h4.8"/>',
  shield: '<path d="M12 3.4l7 2.5v5.1c0 4.3-2.9 7.5-7 9.6-4.1-2.1-7-5.3-7-9.6V5.9z"/><path d="M9 12l2.1 2.1 3.9-4"/>',
  house: '<path d="M4.4 11.2L12 4.6l7.6 6.6v7.2a1.6 1.6 0 0 1-1.6 1.6H6a1.6 1.6 0 0 1-1.6-1.6z"/><path d="M10 20V15h4v5"/>',
};
const QUOTE_SVG = '<svg viewBox="0 0 32 32"><path d="M5 23v-9c0-5 3-8 8-9v4c-3 1-4 3-4 5h5v9zm14 0v-9c0-5 3-8 8-9v4c-3 1-4 3-4 5h5v9z"/></svg>';

const C = { ink: '#242E2B', ink2: '#69736D', ink3: '#727B75', brand: '#226B60', white: '#FFFFFF', orange: '#956947', qmark: '#A3B9AA' };

/* name → [svgKey, color, cssSize]；tab 图标 21px，普通 17px */
const ICONS = [
  ['search', 'ink', 17], ['back', 'ink', 17], ['chev', 'ink3', 13], ['chev-brand', 'brand', 13],
  ['star', 'brand', 17], ['star-orange', 'orange', 17], ['heart', 'brand', 17],
  ['share', 'white', 17], ['share-ink', 'ink', 17], ['moments', 'brand', 17],
  ['spark', 'brand', 21], ['spark-off', 'ink3', 21],
  ['books', 'brand', 21], ['books-off', 'ink3', 21],
  ['bmk', 'brand', 21], ['bmk-off', 'ink3', 21],
  ['user', 'brand', 21], ['user-off', 'ink3', 21],
  ['clockW', 'ink2', 17], ['download', 'brand', 17], ['desktop', 'ink2', 17],
  ['bookI', 'brand', 17], ['chat', 'brand', 17], ['pencil', 'ink2', 17], ['info', 'ink2', 17],
  ['moon', 'brand', 17], ['heartT', 'brand', 17], ['people', 'brand', 17], ['bookO', 'brand', 17],
  ['caseI', 'brand', 17], ['coin', 'brand', 17], ['shield', 'brand', 17], ['house', 'brand', 17],
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 3 });
await page.goto('file://' + DESIGN);
await page.click('button[data-b="home"]');
await page.waitForTimeout(400);

/* ---------- 1) 图标：注入指定颜色/尺寸的 SVG，透明底 PNG ---------- */
for (const [name, colorKey, css] of ICONS) {
  const key = name.replace(/-(brand|off|ink|orange)$/, '');
  const body = SVGS[key] || '';
  await page.evaluate(({ body, color, css }) => {
    const old = document.querySelector('#mp-icon-stage');
    if (old) old.remove();
    const d = document.createElement('div');
    d.id = 'mp-icon-stage';
    d.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:transparent;line-height:0;';
    d.innerHTML = `<svg viewBox="0 0 24 24" width="${css * 3}" height="${css * 3}" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
    document.body.appendChild(d);
  }, { body, color: C[colorKey], css });
  const el = page.locator('#mp-icon-stage');
  await el.screenshot({ path: path.join(ICON_DIR, `${name}.png`) });
}

/* 引号符（fill 型） */
await page.evaluate((svg) => {
  const old = document.querySelector('#mp-icon-stage');
  if (old) old.remove();
  const d = document.createElement('div');
  d.id = 'mp-icon-stage';
  d.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:transparent;line-height:0;';
  d.innerHTML = svg.replace('<svg ', `<svg width="78" height="78" fill="#A3B9AA" `);
  document.body.appendChild(d);
}, QUOTE_SVG);
await page.locator('#mp-icon-stage').screenshot({ path: path.join(ICON_DIR, 'quote.png') });
await page.evaluate(() => document.querySelector('#mp-icon-stage').remove());

/* ---------- 2) 书封：截取 .bk .cover（含 3D 变换与封面文字，JPEG 烘底色） ---------- */
const covers = page.locator('[data-b="home"] .bk .cover');
const n = await covers.count();
for (let i = 0; i < n; i++) {
  await covers.nth(i).screenshot({
    path: path.join(ART_DIR, `cover-${i === 0 ? 'hltb' : 'htga'}.jpg`),
    type: 'jpeg', quality: 88,
  });
}

/* ---------- 2b) 平放书封（书库/详情页，无 3D 变换） ---------- */
await page.click('button[data-b="library"]');
await page.waitForTimeout(400);
const flats = page.locator('[data-b="library"] .big-bk .cover');
const fn = await flats.count();
for (let i = 0; i < fn; i++) {
  await flats.nth(i).screenshot({
    path: path.join(ART_DIR, `flat-cover-${i === 0 ? 'hltb' : 'htga'}.jpg`),
    type: 'jpeg', quality: 90,
  });
}
await page.click('button[data-b="home"]');
await page.waitForTimeout(300);

/* ---------- 3) hero 插画：透明 PNG 烘到 hero 底色 #E5ECE6 上（JPEG） ---------- */
await page.evaluate(() => {
  const old = document.querySelector('#mp-hero-stage');
  if (old) old.remove();
  const img = document.querySelector('[data-b="home"] .qc .illo-side img');
  const d = document.createElement('div');
  d.id = 'mp-hero-stage';
  d.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;width:154px;height:158px;background:#E5ECE6;line-height:0;';
  const c = img.cloneNode();
  c.style.cssText = 'width:100%;height:100%;object-fit:contain;object-position:right bottom;';
  d.appendChild(c);
  document.body.appendChild(d);
});
await page.locator('#mp-hero-stage').screenshot({ path: path.join(ART_DIR, 'home-hero.jpg'), type: 'jpeg', quality: 86 });
await page.evaluate(() => document.querySelector('#mp-hero-stage').remove());

await browser.close();

/* ---------- 汇总 ---------- */
const list = [];
for (const dir of [ICON_DIR, ART_DIR]) {
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.png') || f.endsWith('.jpg')) {
      list.push(`${path.relative(MP, path.join(dir, f))}  ${(fs.statSync(path.join(dir, f)).size / 1024).toFixed(1)}KB`);
    }
  }
}
console.log(list.sort().join('\n'));
console.log(`\nTOTAL ${(list.length)} files`);
