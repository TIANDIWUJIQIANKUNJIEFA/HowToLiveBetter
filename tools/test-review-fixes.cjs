/** Isolated review regressions: no real network, persistent storage, ads or shares. */
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('✓ ' + name); };
const flush = () => new Promise(r => setImmediate(r));
function page(file, deps = {}, extra = {}) {
  let spec;
  vm.runInNewContext(read(file), { require: k => { if (!(k in deps)) throw Error('Missing dependency '+k); return deps[k]; }, Page: s => spec = s, getApp: () => ({globalData: {readHistory: [], favorites: []}}), setTimeout, clearTimeout, console, ...extra }, {filename:file});
  const obj = {...spec, data: JSON.parse(JSON.stringify(spec.data))};
  obj.setData = d => Object.assign(obj.data, d);
  return obj;
}
function moduleVm(file, deps = {}, extra = {}) {
  const mod = {exports:{}};
  vm.runInNewContext(read(file), {module:mod, exports:mod.exports, require:k => deps[k], console, ...extra}, {filename:file});
  return mod.exports;
}
(async () => {
  let comp, route;
  vm.runInNewContext(read('components/custom-nav/custom-nav.js'), {require:()=>({}), Component:s=>comp=s, getCurrentPages:()=>[{}], wx:{switchTab:o=>route=o.url}});
  comp.methods.onBack.call({data:{customBack:false}});
  check('F01 root back reaches an actual tab',()=>assert(JSON.parse(read('app.json')).tabBar.list.some(t=>'/'+t.pagePath===route)));
  const lib = {getBook:()=>({id:'hltb',title:'Book'}),getChapter:()=>({}),getTotalStepCount:()=>767,accentVar:()=>null,getAllChapters:()=>[],getBooks:()=>[],getTopics:()=>[]};
  const pending={};
  const search=page('pkg-read/search/search.js',{'../../utils/library.js':lib,'../../utils/api-v2.js':{search:q=>q?new Promise(resolve=>pending[q]=resolve):Promise.resolve({hot:['每天','要求','申请','运动']})},'../utils/content.js':{}});
  search.doSearch('old'); search.doSearch('new');
  check('F02 first request displays loading immediately',()=>assert(search.data.searched && search.data.searching));
  pending.new({chapters:[{title:'NEW'}]}); await flush(); pending.old({chapters:[{title:'OLD'}]}); await flush();
  check('F02 stale response cannot overwrite latest search',()=>assert.equal(search.data.chapters[0].title,'NEW'));
  search.doSearch('clear'); search.onClear(); pending.clear({chapters:[{title:'RESURRECT'}]}); await flush();
  check('F02 clear prevents result resurrection',()=>assert(!search.data.searched && search.data.chapters.length===0));
  check('UX search hot words remove generic stopwords',()=>assert(search.data.hot.includes('运动') && !search.data.hot.includes('每天')));
  const cache={books:[{id:'hltb',rev:'old'}],'chapters:hltb':[{chapterId:'old'}]};let calls=0;
  const baselineDeps={'./api-v2.js':{isEnabled:()=>true,getBooks:()=>Promise.resolve({books:[{id:'hltb',rev:'new'}]}),getIndex:()=>++calls===1?Promise.reject(Error('temporary')):Promise.resolve({chapters:[{chapterId:'new'}]}),getTopics:()=>Promise.resolve({}),getQuotes:()=>Promise.resolve({})},'./store.js':{v2:{get:k=>cache[k],set:(k,v)=>cache[k]=v}},'../data/v2/books.js':[],'../data/v2/chapters.js':{},'../data/v2/glossary.js':{},'../data/v2/quotes.js':[],'../data/v2/topics.js':[]};
  const library=moduleVm('utils/library.js',baselineDeps);
  await library.refresh(); library.getChapters('hltb'); await library.refresh();
  check('F03 failed index retries despite already updated book rev',()=>assert.equal(calls,2));
  check('F03 refreshed chapter index invalidates in-memory snapshot',()=>assert.equal(library.getChapters('hltb')[0].chapterId,'new'));
  await library.refresh();check('F03 synchronized index skips redundant fetch',()=>assert.equal(calls,2));
  const metaCache={books:[{id:'social',rev:'same',capabilities:{matchable:false}}], 'chapters:social':[{chapterId:'rq01'}], 'indexRev:social':'same'};
  const metaLibrary=moduleVm('utils/library.js',{'./api-v2.js':{isEnabled:()=>true,getBooks:async()=>({books:[{id:'social',rev:'same',capabilities:{matchable:true}}]}),getTopics:async()=>({}),getQuotes:async()=>({})},'./store.js':{v2:{get:k=>metaCache[k],set:(k,v)=>metaCache[k]=v}},'../data/v2/books.js':[],'../data/v2/chapters.js':{},'../data/v2/glossary.js':{},'../data/v2/quotes.js':[],'../data/v2/topics.js':[]});
  const metaResult=await metaLibrary.refresh();
  check('UX recommendation capability changes refresh the catalog even when content rev is unchanged',()=>assert(metaResult.changed && metaLibrary.getBook('social').capabilities.matchable));
  let now=100;
  const api=moduleVm('utils/api-v2.js',{}, {Date:{now:()=>now},wx:{request:o=>o.fail({})}});
  for(let i=0;i<3;i++) await api.getBooks().catch(()=>{});
  check('F03 repeated failures start bounded cooldown',()=>assert.equal(api.isEnabled(),false));
  now+=30001;check('F03 cooldown recovers within same session',()=>assert.equal(api.isEnabled(),true));
  const quotes=[{id:'q-a',text:'A'},{id:'q-b',text:'B'}];
  const quote=moduleVm('utils/quote.js',{'./library.js':{getQuotes:()=>quotes}},{Date,Math});
  const dailyDeps={'../../utils/quote.js':quote};
  const daily=page('pkg-read/daily/daily.js',dailyDeps); daily.onLoad({quoteId:'q-a'});daily.onNext();
  const share=daily.onShareAppMessage();const receiver=page('pkg-read/daily/daily.js',dailyDeps); receiver.onLoad({quoteId:decodeURIComponent(share.path.split('quoteId=')[1])});
  check('F04 shared daily quote reproduces sender selection',()=>assert.equal(receiver.data.quote.text,daily.data.quote.text));
  check('F04 next quote differs and timeline preserves ID',()=>assert(daily.data.quote.id!=='q-a' && daily.onShareTimeline().query.includes(daily.data.quote.id)));
  const storage={}; global.wx={getStorageSync:k=>storage[k]||'',setStorageSync:(k,v)=>storage[k]=v,removeStorageSync:k=>delete storage[k],request:o=>o.fail({errMsg:'offline'})};
  const match=require(path.join(root,'utils/match.js'));
  const profile={topicIds:['sleep'],budget:'t5',goals:[]};
  const first=await match.recommendV2(profile,8);const excluded=first.items.slice(0,3).map(it=>it.step.uid);
  for(const uid of excluded) await match.sendFeedback(uid,'doing');
  const after=await match.recommendV2(profile,8);
  check('F05 offline feedback excludes and refills recommendations',()=>assert(after.items.length===8 && after.items.every(it=>!excluded.includes(it.step.uid))));
  check('F05 refill keeps time budget hard constraint',()=>assert(after.items.every(it=>it.step.cost.time==='少' && ['否','些','是'].includes(it.step.cost.will))));
  const index=require(path.join(root,'data/match-index.js')), steps=require(path.join(root,'pkg-read/data/steps-hltb.js'));
  check('F06 every baseline step has exact indexed title and cost metadata',()=>{
    assert.equal(index.length,Object.values(steps).reduce((n,a)=>n+a.length,0));
    for(const row of index){const s=steps[row[0]][row[1]-1];assert(s);assert.equal(row[2],s.title);assert.equal(row[4],s.cost.money);assert.equal(row[5],s.cost.time);assert.equal(row[9],s.grade);}
  });
  // Full reader load with online content update: validates both rendering paths.
  const realLibrary=require(path.join(root,'utils/library.js'));
  const baseContent=require(path.join(root,'pkg-read/utils/content.js'));
  const ch=realLibrary.getChapter('hltb','b03');
  const reader=page('pkg-read/chapter-read/chapter-read.js',{'../../utils/util.js':require(path.join(root,'utils/util.js')),'../../utils/library.js':realLibrary,'../utils/content.js':{...baseContent,fetchSteps:()=>Promise.resolve({changed:false}),fetchContent:()=>Promise.resolve({changed:true,content:[ch.summary,'Distinct paragraph']})},'../../utils/migrate.js':require(path.join(root,'utils/migrate.js')),'../../utils/store.js':require(path.join(root,'utils/store.js'))},{wx:global.wx,getApp:()=>({globalData:{favorites:[]},addReadHistory:()=>{}})});
  reader.bookId='hltb';reader.chapterId='b03';reader.load();await flush();
  check('F08 online intro removes repeated summary and retains one distinct paragraph',()=>assert(reader.data.contentRuns.length===1 && reader.data.contentRuns[0].some(r=>r.t.includes('Distinct paragraph'))));
  reader._lastScrollTop=1234;reader.saveProgress(ch);
  check('UX reading position persists with correct chapter',()=>assert.equal(storage['htlb:v2:progress'].hltb.scrollTop,1234));
  const invalid=page('pkg-read/chapter-read/chapter-read.js',{'../../utils/util.js':require(path.join(root,'utils/util.js')),'../../utils/library.js':realLibrary,'../utils/content.js':baseContent,'../../utils/migrate.js':{},'../../utils/store.js':{}},{wx:global.wx});invalid.onLoad({});
  check('UX invalid shared link exposes recoverable empty state',()=>assert(invalid.data.loadError));
  const result=page('pkg-insight/result/result.js',{'../../utils/library.js':realLibrary,'../../utils/match.js':{getProfileV2:()=>profile,recommendV2:()=>Promise.resolve({items:[],source:'local'})}},{wx:global.wx});result.onLoad();await flush();
  check('UX first recommendation has no share gate or forced delay',()=>assert(!result.data.loading && !result.data.locked && result.data.noResults && result.data.offline));
  let copies=0,adCalls=0;
  const download=page('pkg-read/download/download.js',{'../../utils/cloud-sync.js':{status:()=>({loggedIn:false,vip:false})},'../../utils/download-config.js':{DOWNLOAD_FILES:[]},'../../utils/rewarded-ad.js':{playAd:()=>adCalls++,preloadAd:()=>{}},'../../utils/data.js':{},'../../utils/time.js':{}},{wx:{showToast:()=>{},showLoading:()=>{},setClipboardData:()=>copies++}});
  download.onAllSourcesFailed({key:'pdf'});download.onWatchAd();download.onWatchAd();
  check('UX failed download does not claim or trigger clipboard copy',()=>assert.equal(copies,0));
  check('UX repeated unlock taps launch one video operation',()=>assert.equal(adCalls,1));
  const reco=page('pages/reco/reco.js',{'../../utils/book-presentation.js':require(path.join(root,'utils/book-presentation.js')),'../../utils/library.js':realLibrary,'../../utils/match.js':{getProfileV2:()=>null},'../../utils/api-v2.js':{getDaily:()=>Promise.resolve({days:[{date:'2020-01-01',updates:[{bookId:'hltb',chapterId:'b03'}]}]})},'../../utils/quote.js':quote},{wx:global.wx});reco.render();await flush();
  check('UX homepage counts readable books separately from previews',()=>assert.equal(reco.data.bookCount,realLibrary.getBooks().length));
  check('UX old updates are not labeled today',()=>assert.equal(reco.data.dailyTitle,'最近更新'));
  reco.setUpdates([1,2,3,4],'最近更新');check('UX update list starts compact and expands',()=>{assert.equal(reco.data.shownUpdates.length,2);reco.onToggleUpdates();assert.equal(reco.data.shownUpdates.length,4);});
  check('V02 every referenced theme icon exists',()=>{
    for(const dir of ['pages','pkg-read','pkg-insight']) for(const f of fs.readdirSync(path.join(root,dir),{recursive:true}).filter(x=>x.endsWith('.wxml'))) {
      for(const m of read(dir+'/'+f).matchAll(/src="(\/assets\/[^"{}]+)"/g)) assert(fs.existsSync(path.join(root,m[1].slice(1))),dir+'/'+f+' '+m[1]);
    }
  });
  check('F07 online questionnaire discloses transmitted choices accurately',()=>assert(!read('pkg-insight/wizard/wizard.wxml').includes('不上传') && read('pkg-read/about/about.wxml').includes('匿名标识')));
  console.log(`\n${passed} review regressions passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
