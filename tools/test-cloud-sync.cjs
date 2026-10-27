/** 云同步行为回归：隔离网络与存储，不连接生产、不发起真实支付。 */
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const clone = x => JSON.parse(JSON.stringify(x));
const flush = () => new Promise(r => setImmediate(r));
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };
class Server {
  constructor() { this.accounts = {}; this.calls = []; this.offline = false; }
  account(id) { return this.accounts[id] ||= { vip: true, version: 0, items: {}, ops: new Set() }; }
  async handle(o) {
    this.calls.push(o);
    if (this.offline) throw Error('offline');
    const url = new URL(o.url), p = url.pathname.replace('/api/v2', '');
    const actor = p === '/account/login' ? o.data.code : (o.header.Authorization || '').replace('Bearer token-', '');
    const account = this.account(actor);
    const me = { accountId: actor, token: 'token-' + actor, vip: account.vip };
    if (p === '/account/verify') return { statusCode: o.data.code === actor ? 200 : 409, data: o.data.code === actor ? me : { detail: 'account changed' } };
    if (p === '/account/login' || p === '/account/me') return { statusCode: 200, data: me };
    if (p === '/account/logout') return { statusCode: 200, data: { ok: true } };
    if (!account.vip) return { statusCode: 403, data: { detail: 'VIP required' } };
    if (o.method === 'POST' && p === '/account/sync') {
      const ack = [], applied = [], conflicts = [];
      for (const item of o.data.changes) {
        const tag = item.kind + '/' + item.key;
        ack.push(item.opId);
        if (account.ops.has(item.opId)) continue;
        const previous = account.items[tag];
        if (previous && previous.version > item.baseVersion && item.afterOpId !== previous.last_op) conflicts.push(clone(previous));
        else {
          const record = { ...clone(item), version: ++account.version, last_op: item.opId };
          account.items[tag] = record;
          applied.push({ kind: item.kind, key: item.key, opId: item.opId, version: record.version });
        }
        account.ops.add(item.opId);
      }
      const response = { statusCode: 200, data: { ack, applied, conflicts, version: account.version } };
      if (this.failAfterPush) { this.failAfterPush = false; throw Error('response lost'); }
      if (this.holdNextPush) { this.holdNextPush = false; await new Promise(resolve => { this.release = resolve; }); }
      return response;
    }
    if (o.method === 'GET' && p === '/account/sync') {
      const cursor = Number(url.searchParams.get('cursor') || 0);
      const items = Object.values(account.items).filter(x => x.version > cursor).sort((a,b)=>a.version-b.version);
      return { statusCode: 200, data: { items: clone(items.slice(0,250)), hasMore: items.length>250, cursor: items.length?items[Math.min(items.length,250)-1].version:cursor } };
    }
    throw Error('Unexpected request ' + p);
  }
}
function device(server, actor='alice') {
  const storage = new Map(), timers = new Map(); let seq = 0;
  const app = { globalData: { favorites: [], readHistory: [] } };
  const wx = {
    getStorageSync: k => storage.has(k) ? clone(storage.get(k)) : '',
    setStorageSync: (k,v) => storage.set(k,clone(v)), removeStorageSync: k=>storage.delete(k),
    login: o => o.success({code: ctx.actor}),
    request: o => { server.handle(o).then(r=>o.success(clone(r)),()=>o.fail({errMsg:'offline'})); }
  };
  const mod = { exports: {} };
  const ctx = { actor, storage, wx, app, timers };
  vm.runInNewContext(fs.readFileSync(path.join(root,'utils/cloud-sync.js'),'utf8'), {
    module: mod, require:()=>({BASE:'https://test.local'}), wx, getApp:()=>app,
    setTimeout:(fn,ms)=>{timers.set(++seq,{fn,ms});return seq;}, clearTimeout:id=>timers.delete(id), console
  });
  ctx.cloud = mod.exports;
  ctx.favorites = ids => {
    const previous = wx.getStorageSync('favorites') || [];
    wx.setStorageSync('favorites',ids); app.globalData.favorites = ids;
    ctx.cloud.recordFavorites(previous,ids);
  };
  ctx.connect = async () => { await ctx.cloud.login(); ctx.cloud.claimAccount(); await ctx.cloud.setEnabled(true); };
  return ctx;
}
(async () => {
  const server = new Server(), a = device(server);
  a.wx.setStorageSync('favorites',['hltb:b03:8']);
  a.wx.setStorageSync('htlb:v2:favMeta',{'hltb:b03:8':{title:'睡眠建议'}});
  a.wx.setStorageSync('readHistory',['hltb:b03']);
  a.wx.setStorageSync('htlb:v2:progress',{hltb:{chapterId:'b03',scrollTop:320,ts:1}});
  await a.cloud.login(); a.cloud.foreground(); await flush();
  check('未同意开启前不上传记录',()=>assert(!server.calls.some(c=>c.url.includes('/account/sync'))));
  a.cloud.claimAccount(); await a.cloud.setEnabled(true);
  check('首次同步合并本机收藏、历史和进度',()=>assert.equal(Object.keys(server.account('alice').items).length,3));
  const b = device(server); await b.connect();
  check('第二台设备恢复同账户收藏和进度',()=>{
    assert.deepEqual(b.wx.getStorageSync('favorites'),['hltb:b03:8']);
    assert.equal(b.wx.getStorageSync('htlb:v2:progress').hltb.scrollTop,320);
  });
  server.offline = true;
  a.favorites(['hltb:b03:8','hltb:b03:9']);
  await assert.rejects(a.cloud.sync());
  check('断网保留本机记录和持久化队列',()=>{
    assert.equal(a.cloud.status().pending,1);
    assert(a.wx.getStorageSync('favorites').includes('hltb:b03:9'));
  });
  server.offline = false; await a.cloud.sync();
  check('恢复网络后重试成功并清空已确认队列',()=>assert.equal(a.cloud.status().pending,0));
  // 服务端落库成功、响应丢失，再取消收藏，不能被自己的旧上传覆盖。
  server.failAfterPush = true;
  a.favorites([...a.wx.getStorageSync('favorites'),'hltb:b03:10']);
  await assert.rejects(a.cloud.sync());
  a.favorites(a.wx.getStorageSync('favorites').filter(id=>id!=='hltb:b03:10'));
  await a.cloud.sync();
  check('响应丢失后取消收藏不会复活',()=>{
    assert(server.account('alice').items['favorite/hltb:b03:10'].deleted);
    assert(!a.wx.getStorageSync('favorites').includes('hltb:b03:10'));
  });
  server.holdNextPush = true;
  a.favorites([...a.wx.getStorageSync('favorites'),'hltb:b03:11']);
  const inFlight = a.cloud.sync();
  for(let i=0;i<10&&!server.release;i++) await flush();
  a.favorites(a.wx.getStorageSync('favorites').filter(id=>id!=='hltb:b03:11'));
  server.release(); await inFlight;
  check('请求中产生的新删除不会被旧响应吞掉',()=>assert(server.account('alice').items['favorite/hltb:b03:11'].deleted));
  // B 尚保留收藏，A 已删除；B 的旧离线快照不能覆盖云端删除。
  a.favorites(a.wx.getStorageSync('favorites').filter(id=>id!=='hltb:b03:8')); await a.cloud.sync();
  b.cloud.queue('favorite','hltb:b03:8',{title:'旧设备的记录'});
  const tag = 'htlb:cloud:alice:state', st = b.wx.getStorageSync(tag);
  st.cursor = server.account('alice').version; b.wx.setStorageSync(tag,st);
  await b.cloud.sync();
  check('游标已前进时仍能应用冲突响应中的删除',()=>assert(!b.wx.getStorageSync('favorites').includes('hltb:b03:8')));
  await a.cloud.setEnabled(false);
  a.favorites([...a.wx.getStorageSync('favorites'),'hltb:b03:12']);
  check('关闭同步时仅本机排队，不上传',()=>assert(!server.account('alice').items['favorite/hltb:b03:12']));
  await a.cloud.setEnabled(true);
  check('重新开启同步后补齐关闭期间的修改',()=>assert(server.account('alice').items['favorite/hltb:b03:12']));
  await a.cloud.logout();
  a.favorites([...a.wx.getStorageSync('favorites'),'hltb:b03:13']);
  await a.cloud.login(); a.cloud.claimAccount(); await a.cloud.setEnabled(true);
  check('退出后本机修改可在同账号重新登录时续传',()=>assert(server.account('alice').items['favorite/hltb:b03:13']));
  await a.cloud.logout();
  const aliceLocal = a.wx.getStorageSync('favorites');
  a.actor = 'bob'; await a.cloud.login();
  await assert.rejects(a.cloud.setEnabled(true));
  check('更换微信账户默认阻止混合上传',()=>assert.equal(Object.keys(server.account('bob').items).length,0));
  a.cloud.claimAccount(true); await a.cloud.setEnabled(true);
  check('确认换账户后使用隔离的本地数据',()=>assert.deepEqual(a.wx.getStorageSync('favorites'),[]));
  await a.cloud.logout(); a.actor='alice'; await a.cloud.login(); a.cloud.claimAccount(true); await a.cloud.setEnabled(true);
  check('切回账户可恢复本机备份和云记录',()=>assert.deepEqual(a.wx.getStorageSync('favorites'),aliceLocal));
  const switched = device(server,'bob');
  switched.wx.setStorageSync('htlb:cloud:session',{accountId:'alice',token:'token-alice',vip:true});
  switched.wx.setStorageSync('htlb:cloud:owner','alice');
  switched.wx.setStorageSync('htlb:cloud:alice:enabled',true);
  switched.cloud.foreground(); await flush(); await flush();
  check('重新进前台先核对当前微信账号，缓存令牌不能跨账号自动上传',()=>{
    assert.equal(switched.cloud.status().phase,'accountChanged');
    assert.equal(switched.cloud.status().enabled,false);
  });
  const free = device(server,'free'); server.account('free').vip=false;
  free.wx.setStorageSync('favorites',['hltb:b01:1']); await free.cloud.login();
  const paidBenefits=await a.cloud.checkVip();
  check('VIP 下载等权益经服务端确认',()=>assert.equal(paidBenefits,true));
  free.wx.setStorageSync('htlb:cloud:session',{...free.wx.getStorageSync('htlb:cloud:session'),vip:true});
  assert.equal(await free.cloud.checkVip(),false);
  check('本机伪造 VIP 缓存不能获得付费权益',()=>assert.equal(free.cloud.status().vip,false));
  await assert.rejects(switched.cloud.checkVip());
  check('微信账户变化后不能沿用旧会员权益',()=>assert.equal(switched.cloud.status().accountChanged,true));
  await assert.rejects(free.cloud.setEnabled(true));
  check('非 VIP 不上传但本地收藏仍可使用',()=>assert.deepEqual(free.wx.getStorageSync('favorites'),['hltb:b01:1']));
  // 前端支付 success 不能作为 VIP 开通凭据。
  let page, orders=0, confirmations=0, refreshes=0; const toasts=[];
  let member=false;
  const cloud = {status:()=>({loggedIn:true,vip:member}),claimAccount(){},onChange:()=>()=>{},wxCode:async()=> 'one-time-code',
    request:async(method,url)=>{if(method==='POST'){orders++;return {orderId:'V-test-order',payData:{mode:'short_series_goods'}};}confirmations++;return {status:'PENDING'};},
    refresh:async()=>{refreshes++;member=true;},setEnabled:async()=>{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'pkg-insight/vip/vip.js'),'utf8'), {
    require:name=>name.includes('cloud-account-actions')?require(path.join(root,'utils/cloud-account-actions.js')):name.includes('cloud-sync')?cloud:name.includes('pay.js')?{checkAvailability:()=>({ok:true,platform:'android'})}:{absolute:()=>''},
    Page:p=>page=p,wx:{setStorageSync(){},removeStorageSync(){},showToast:x=>toasts.push(x.title),requestVirtualPayment:o=>o.success({}),showModal:o=>o.success({confirm:false})},setTimeout:fn=>{fn();return 1;}
  });
  page.setData = d=>Object.assign(page.data,d);
  Object.assign(page.data,{agreed:true,product:{paymentEnabled:true},cloud:{loggedIn:true}});
  const purchase = page.onBuy(); await page.onBuy(); await purchase;
  check('支付回调成功但服务端待确认时不能显示已开通',()=>{
    assert.equal(orders,1);assert.equal(confirmations,5);assert.equal(refreshes,0);
    assert(!toasts.includes('永久 VIP 已开通'));
  });
  let appSpec; const appStorage = new Map(); const queued = [];
  vm.runInNewContext(fs.readFileSync(path.join(root,'app.js'),'utf8'), {
    App: spec=>appSpec=spec,
    require: name=>name.includes('migrate')?require(path.join(root,'utils/migrate.js')):name.includes('cloud-sync')?{
      recordFavorites:(before,after)=>queued.push(after),queue:(...args)=>queued.push(args)
    }:{},
    wx:{getStorageSync:k=>appStorage.get(k)||'',setStorageSync:(k,v)=>appStorage.set(k,v)},console
  });
  appSpec.saveFavorites(['b03-8','hltb:b03:8']);
  appSpec.addReadHistory('b03');
  check('旧分享入口的收藏 ID 被规范化并去重后再同步',()=>assert.deepEqual([...appSpec.globalData.favorites],['hltb:b03:8']));
  check('旧入口浏览记录统一为带书名前缀的 ID',()=>assert.equal(appSpec.globalData.readHistory[0],'hltb:b03'));
  console.log(`\n${checks} cloud/VIP client checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1;});
