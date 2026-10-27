const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'..');
function load(file,{vip=false,loggedIn=vip,error=false,unlocked=false}={}){
 let spec,ads=0,downloads=0,route='';const app={globalData:{downloadUnlocked:unlocked}};
 const cloud={status:()=>({loggedIn,vip}),checkVip:async()=>{if(error)throw Error('offline');return vip}};
 const profile={ts:100,concerns:[]};const store={get:()=>null,set:()=>{throw Error('VIP must not write share unlock')}};
 const wx={showToast(){},showLoading(){},hideLoading(){},navigateTo:o=>route=o.url};
 const deps={'../../utils/cloud-sync.js':cloud,'../../utils/rewarded-ad.js':{playAd:()=>ads++,preloadAd(){}},'../../utils/download-config.js':{DOWNLOAD_FILES:[{key:'pdf'}]},'../../utils/data.js':{getDataStatus:()=>null},'../../utils/time.js':{absolute:()=>''},'../../utils/match.js':{totalCount:()=>1,getProfile:()=>profile,hasProfile:()=>true,recommend:()=>[{}],summarize:()=>''},'../../utils/store.js':store};
 vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),{Page:x=>spec=x,getApp:()=>app,wx,require:n=>deps[n]||{},setTimeout:f=>f(),console});
 const p={...spec,data:JSON.parse(JSON.stringify(spec.data)),setData(x){Object.assign(this.data,x)}};
 p.startDownload=()=>downloads++;
 return {p,app,get ads(){return ads},get downloads(){return downloads},get route(){return route}};
}
(async()=>{
 for(const file of ['pkg-read/download/download.js','pagesA/download/download.js']){
  let x=load(file,{vip:true});await x.p.refreshAccess();assert(x.p.data.unlocked&&x.p.data.vip);await x.p.onFileAction({currentTarget:{dataset:{index:0}}});assert.equal(x.downloads,1);assert.equal(x.ads,0);assert(!x.app.globalData.downloadUnlocked);
  x=load(file);await x.p.onWatchAd();assert.equal(x.ads,1);
  x=load(file,{vip:true,error:true});await x.p.onWatchAd();assert.equal(x.ads,0);assert(!x.p.data.unlocked);
  x=load(file);x.p.data.vip=true;x.p.data.unlocked=true;await x.p.onFileAction({currentTarget:{dataset:{index:0}}});assert.equal(x.downloads,0);assert(!x.p.data.unlocked);
 }
 let x=load('pages/mine/mine.js',{vip:true});await x.p.openDownload();assert.equal(x.ads,0);assert.equal(x.route,'/pkg-read/download/download');assert(!x.app.globalData.downloadUnlocked);
 x=load('pages/mine/mine.js');await x.p.openDownload();assert.equal(x.ads,1);
 x=load('pagesB/survey-result/survey-result.js',{vip:true});x.p.onLoad({});await x.p.refreshVipAccess();await new Promise(r=>setImmediate(r));assert.equal(x.p.data.locked,false);
 x=load('pagesB/survey-result/survey-result.js');x.p.onLoad({});await new Promise(r=>setImmediate(r));assert.equal(x.p.data.locked,true);
 console.log('12 VIP benefit checks passed: menu/direct/legacy downloads, no ad on VIP or failed verification, logout relock, deep result exemption, free-user gates');
})().catch(e=>{console.error(e);process.exitCode=1});
