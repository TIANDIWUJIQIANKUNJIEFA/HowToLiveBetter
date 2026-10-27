/**
 * 图标重制 v2：不走浏览器截图（透明 stage 会把底层内容烤进 PNG），
 * 直接用 ImageMagick 从设计稿 SVG 字符串栅格化，3x 尺寸、透明底。
 * 用法：node tools/gen-icons.mjs
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MP = path.resolve(ROOT, '..');
const DARK = process.env.ICON_THEME === 'dark';
const OUT = path.join(MP, 'assets/icons-v2', DARK ? 'dark' : '');
fs.mkdirSync(OUT, { recursive: true });

const SVGS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  star: '<path d="M12 3l2.7 5.8 6.3.8-4.6 4.4 1.2 6.2L12 17.2 6.4 20.2l1.2-6.2L3 9.6l6.3-.8z"/>',
  heart: '<path d="M12 20s-7.5-4.7-9.3-9.2C1.2 7 3.4 4 6.8 4c2.2 0 4 1.2 5.2 3 1.2-1.8 3-3 5.2-3 3.4 0 5.6 3 4.1 6.8C19.5 15.3 12 20 12 20z"/>',
  'share-nodes': '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.7l7.6-4.4M8.2 13.3l7.6 4.4"/>',
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

const LIGHT = { ink: '#242E2B', ink2: '#69736D', ink3: '#727B75', brand: '#226B60', white: '#FFFFFF', orange: '#956947', qmark: '#A3B9AA' };

const C = DARK ? { ink: '#EEF1E9', ink2: '#B0BEB2', ink3: '#A2B2A5', brand: '#8BC7B3', white: '#152C23', orange: '#E1B78C', qmark: '#8BAF99' } : LIGHT;

/* name → [svgKey, color, cssPx]；输出 3x */
const ICONS = [
  ['search', 'ink', 17], ['back', 'ink', 17], ['chev', 'ink3', 13], ['chev-brand', 'brand', 13],
  ['star', 'brand', 17], ['star-orange', 'orange', 17], ['heart', 'brand', 17],
  ['share-nodes', 'ink2', 17], ['share', 'white', 17], ['share-ink', 'ink', 17], ['moments', 'brand', 17],
  ['spark', 'brand', 21], ['spark-off', 'ink3', 21],
  ['books', 'brand', 21], ['books-off', 'ink3', 21],
  ['bmk', 'brand', 21], ['bmk-off', 'ink3', 21],
  ['user', 'brand', 21], ['user-off', 'ink3', 21],
  ['clockW', 'ink2', 17], ['download', 'brand', 17], ['desktop', 'ink2', 17],
  ['bookI', 'brand', 17], ['chat', 'brand', 17], ['pencil', 'ink2', 17], ['info', 'ink2', 17],
  ['moon', 'brand', 17], ['heartT', 'brand', 17], ['people', 'brand', 17], ['bookO', 'brand', 17],
  ['caseI', 'brand', 17], ['coin', 'brand', 17], ['shield', 'brand', 17], ['house', 'brand', 17],
];

const TMP = fs.mkdtempSync('/tmp/mpicons-');
let done = 0;
for (const [name, colorKey, px] of ICONS) {
  const key = name.replace(/-(brand|off|ink|orange)$/, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${C[colorKey]}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${SVGS[key]}</svg>`;
  const f = path.join(TMP, `${name}.svg`);
  fs.writeFileSync(f, svg);
  /* magick 内置 MSVG 不认继承 stroke；librsvg 的 rsvg-convert 可靠 */
  execFileSync('rsvg-convert', ['-w', String(px * 3), '-h', String(px * 3), '-b', 'none', f, '-o', path.join(OUT, `${name}.png`)]);
  done++;
}

/* 引号符（fill 型，32 viewBox） */
const qsvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="${C.qmark}"><path d="M5 23v-9c0-5 3-8 8-9v4c-3 1-4 3-4 5h5v9zm14 0v-9c0-5 3-8 8-9v4c-3 1-4 3-4 5h5v9z"/></svg>`;
fs.writeFileSync(path.join(TMP, 'quote.svg'), qsvg);
execFileSync('rsvg-convert', ['-w', '78', '-h', '78', '-b', 'none', path.join(TMP, 'quote.svg'), '-o', path.join(OUT, 'quote.png')]);
done++;

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`✓ ${done} icons → assets/icons-v2/`);
