const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const source = fs.readFileSync(path.join(__dirname, '../pkg-insight/result/result.js'), 'utf8');

async function main() {
  let page, resolve, sends = 0, recommendations = 0;
  const toasts = [];
  const match = {
    sendFeedback: () => { sends++; return new Promise(r => { resolve = r; }); },
    recommendV2: () => { recommendations++; return Promise.resolve({ items: [] }); }
  };
  vm.runInNewContext(source, {
    getApp: () => ({ globalData: {} }),
    Page: value => { page = value; },
    require: p => p.includes('match') ? match : {},
    wx: { showToast: value => toasts.push(value.title) }
  });
  page.renderResult = () => {};
  page.data.profile = {};
  const event = kind => ({ currentTarget: { dataset: { uid: 'hltb:b03:8', kind } } });
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

  page.onFeedback(event('positive'));
  assert.equal(toasts.length, 0, '提交完成前不能提示已记录');
  page.onFeedback(event('positive'));
  assert.equal(sends, 1, '重复点击不能并发提交');
  resolve({ ok: false, offline: true }); await flush();
  assert.equal(toasts.pop(), '提交失败，请稍后重试');
  assert.equal(recommendations, 0);
  assert.equal(page._feedbackPending, false);

  page.onFeedback(event('positive'));
  resolve({ ok: true }); await flush();
  assert.equal(toasts.pop(), '已记录这条反馈');
  assert.equal(recommendations, 0);

  page.onFeedback(event('negative'));
  resolve({ ok: false, offline: true }); await flush();
  assert.equal(toasts.pop(), '已在本机排除，尚未同步');
  assert.equal(recommendations, 1);
  console.log('feedback contract: pending, duplicate tap, failed/success positive, offline negative passed');
}
main().catch(err => { console.error(err); process.exitCode = 1; });
