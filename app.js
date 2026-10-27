const { refreshArticles } = require('./utils/data.js');
const { refresh: refreshV2 } = require('./utils/library.js');
const { migrateV2, withBookPrefix } = require('./utils/migrate.js');
const cloud = require('./utils/cloud-sync.js');

App({
  globalData: {
    userInfo: null,
    favorites: [],
    readHistory: [],
    // 本次启动内是否已看完激励视频解锁下载链接（不落盘，下次启动重新解锁）
    downloadUnlocked: false
  },

  onLaunch() {
    /* 先备份迁移，再读入规范 ID，避免旧分享入口重新写入裸章节 ID。 */
    migrateV2();
    this.loadStorage();
    this.tryUpdate();
    /*
     * 后台静默刷新：v1 索引（兼容期保留）+ v2 三书（按 rev 增量）。
     * 页面不等它——拿不到就用缓存/本地基线渲染，下次进来自然生效。
     */
    refreshArticles().then((r) => {
      if (r && r.changed) this.globalData.dataRefreshed = true;
    });
    refreshV2();
    if (wx.onNetworkStatusChange) wx.onNetworkStatusChange((res) => {
      if (!res.isConnected) return;
      require('./utils/api-v2.js').setEnabled(true);
      refreshV2();
      cloud.foreground();
    });
  },

  onShow() {
    this.loadStorage();
    cloud.foreground();
  },

  onHide() { cloud.sync().catch(() => {}); },
  queueCloudRecord(kind, id, value, deleted) { cloud.queue(kind, id, value, deleted); },
  onCloudChange(listener) { return cloud.onChange(listener); },

  loadStorage() {
    try {
      const rawFavorites = wx.getStorageSync('favorites') || [];
      const rawHistory = wx.getStorageSync('readHistory') || [];
      const favorites = [...new Set(rawFavorites.map(withBookPrefix))];
      const readHistory = [...new Set(rawHistory.map(withBookPrefix))];
      if (JSON.stringify(favorites) !== JSON.stringify(rawFavorites)) wx.setStorageSync('favorites', favorites);
      if (JSON.stringify(readHistory) !== JSON.stringify(rawHistory)) wx.setStorageSync('readHistory', readHistory);
      const userInfo = wx.getStorageSync('userInfo') || null;
      this.globalData.favorites = favorites;
      this.globalData.readHistory = readHistory;
      this.globalData.userInfo = userInfo;
    } catch (e) {
      console.error('读取本地缓存失败', e);
    }
  },

  saveFavorites(favorites) {
    favorites = [...new Set(favorites.map(withBookPrefix))];
    const before = this.globalData.favorites || [];
    this.globalData.favorites = favorites;
    wx.setStorageSync('favorites', favorites);
    cloud.recordFavorites(before, favorites);
  },

  saveUserInfo(userInfo) {
    this.globalData.userInfo = userInfo;
    wx.setStorageSync('userInfo', userInfo);
  },

  addReadHistory(articleId) {
    articleId = withBookPrefix(articleId);
    const history = this.globalData.readHistory.filter(id => id !== articleId);
    history.unshift(articleId);
    if (history.length > 100) history.pop();
    this.globalData.readHistory = history;
    wx.setStorageSync('readHistory', history);
    const times = wx.getStorageSync('htlb:cloud:historyTimes') || {};
    times[articleId] = Date.now();
    wx.setStorageSync('htlb:cloud:historyTimes', times);
    cloud.queue('history', articleId, { ts: times[articleId] });
  },

  /**
   * 条目收藏的元数据补充（v2）：收藏页在主包读不到分包正文，
   * 收藏条目时落一份 {uid: {title, plain, bookId, ...}} 到 htlb:v2:favMeta。
   */
  addFavMeta(uid, meta) {
    try {
      const all = wx.getStorageSync('htlb:v2:favMeta') || {};
      all[uid] = { ...(all[uid] || {}), ...meta };
      wx.setStorageSync('htlb:v2:favMeta', all);
      if (this.globalData.favorites.includes(uid)) cloud.queue('favorite', uid, all[uid]);
    } catch { /* ignore */ }
  },

  getFavMeta(uid) {
    try { return (wx.getStorageSync('htlb:v2:favMeta') || {})[uid] || null; } catch { return null; }
  },

  /** 主题收藏（v2 收藏三类之一），独立于文章收藏列表 */
  toggleTopicFav(topicId) {
    try {
      const list = wx.getStorageSync('htlb:v2:favTopics') || [];
      const idx = list.indexOf(topicId);
      if (idx > -1) list.splice(idx, 1); else list.push(topicId);
      wx.setStorageSync('htlb:v2:favTopics', list);
      cloud.queue('topic', topicId, {}, idx > -1);
      return idx === -1;
    } catch { return false; }
  },

  isTopicFav(topicId) {
    try { return ((wx.getStorageSync('htlb:v2:favTopics') || []).indexOf(topicId) > -1); } catch { return false; }
  },

  tryUpdate() {
    if (wx.canIUse('getUpdateManager')) {
      const updateManager = wx.getUpdateManager();
      updateManager.onUpdateReady(() => {
        wx.showModal({
          title: '更新提示',
          content: '新版本已准备好，是否重启应用？',
          success: res => {
            if (res.confirm) updateManager.applyUpdate();
          }
        });
      });
    }
  }
});
