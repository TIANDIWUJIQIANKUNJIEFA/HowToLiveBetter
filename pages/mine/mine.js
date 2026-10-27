const app = getApp();
const cloud = require('../../utils/cloud-sync.js');
const { playAd } = require('../../utils/rewarded-ad.js');
const { getDataStatus, refreshArticles } = require('../../utils/data.js');
const { absolute } = require('../../utils/time.js');

/*
 * 「离线下载」行内说明的更新时间：三态文案，见 utils/time.js
 *   api / cache →「更新于 10-23 22:41」（接口时间或缓存里记的时间）
 *   local       →「离线数据 · 封存于 …」（接口与缓存都没有，用的是随包基线）
 * 本地基线的时间取自全篇 updatedAt 的最大值（同步脚本写入的上游最后提交时间）。
 * 与设计稿 19 一致用短格式（MM-DD HH:mm），不带年份。
 */
const dataUpdatedLabel = () => {
  const st = getDataStatus();
  if (!st || !st.updatedAt) return '';
  const short = absolute(st.updatedAt, false);
  return (st.source === 'local' ? '离线数据 · 封存于 ' : '更新于 ') + short;
};

const DEFAULT_USER = {
  nickname: '人生探索者',
  avatar: '',
  bio: '更好的生活，从现在开始'
};

// 作者公众号名称（复制搜索用）
const OFFICIAL_ACCOUNT = 'HuiTurn';

// 公众号原始 ID，形如 gh_xxxxxxxxxxxx（公众号后台「设置 → 账号详情」可查）。
// 填上后点「去关注」会直接打开公众号主页；留空则回退为复制名称引导搜索。
// 注意：跳转的公众号需与小程序为同主体或关联主体，否则会失败并回退。
const OFFICIAL_ACCOUNT_ID = 'gh_5af98cf72f8e';

Page({
  data: {
    userInfo: { ...DEFAULT_USER },
    menuList: [
      { id: 'cloud', icon: 'desktop', label: '账户与同步' },
      { id: 'download', icon: 'download', label: '离线下载' },
      { id: 'desktop', icon: 'desktop', label: '添加到桌面' },
      // { id: 'sponsor', icon: 'heart', label: '赞助小程序' }, // 暂时隐藏赞助入口（tip-panel / pay 逻辑保留，取消本行注释即可恢复）
      { id: 'about', icon: 'bookI', label: '关于我们' },
      { id: 'feedback', icon: 'chat', label: '反馈建议', desc: '有建议，随时告诉我们' }
    ],
    cloud: {},
    favoriteCount: 0,
    historyCount: 0,
    readingCount: 0,
    // 赞助弹窗显隐
    tipVisible: false,
    // 公众号关注：官方组件加载成功后隐藏兜底卡片
    accountName: OFFICIAL_ACCOUNT,
    // 能否直接打开公众号主页（需原始 ID + 基础库 3.7.10+）
    canJump: !!OFFICIAL_ACCOUNT_ID && typeof wx.openOfficialAccountProfile === 'function',
    oaReady: false,
    // 添加到桌面引导蒙层
    showGuide: false,
    // 「离线下载」行第三行展示的数据更新时间（三态文案，精确到时分）
    dataUpdated: dataUpdatedLabel()
  },

  onLoad() {
    this._cloudUnsubscribe = cloud.onChange(() => { this.setData({ cloud: cloud.status() }); this.loadData(); });
    this.setData({ userInfo: { ...DEFAULT_USER, ...(app.globalData.userInfo || {}) } });
    this.loadData();
  },

  onShow() {
    this.setData({ cloud: cloud.status() });
    this.loadData();
    /* 启动时的刷新可能还没回来，回到本页时再取一次状态并顺带补一次刷新 */
    this.setData({ dataUpdated: dataUpdatedLabel() });
    refreshArticles().then((r) => {
      if (r && r.changed) this.setData({ dataUpdated: dataUpdatedLabel() });
    });
  },

  onUnload() { if (this._cloudUnsubscribe) this._cloudUnsubscribe(); },
  onVip() { wx.navigateTo({ url: '/pkg-insight/vip/vip' }); },

  loadData() {
    const favorites = app.globalData.favorites || [];
    const history = app.globalData.readHistory || [];
    /* 在读 = 有阅读进度的书数（与书架「在读」同口径，见 pages/library） */
    let readingCount = 0;
    try {
      readingCount = Object.keys(wx.getStorageSync('htlb:v2:progress') || {}).length;
    } catch (e) { /* ignore */ }
    this.setData({
      favoriteCount: favorites.length + (wx.getStorageSync('htlb:v2:favTopics') || []).length,
      historyCount: history.length,
      readingCount,
      avatarLetter: (this.data.userInfo.nickname || '人').slice(0, 1)
    });
  },

  /* 统计行入口：收藏 / 浏览历史 / 在读（书库） */
  onStatTap(e) {
    const target = e.currentTarget.dataset.target;
    if (target === 'favorite') {
      wx.switchTab({ url: '/pages/favorite/favorite' });
    } else if (target === 'history') {
      wx.navigateTo({ url: '/pkg-read/search/search?type=history' });
    } else if (target === 'library') {
      wx.switchTab({ url: '/pages/library/library' });
    }
  },

  onEditProfile() {
    const { userInfo } = this.data;
    wx.showModal({
      title: '编辑昵称',
      editable: true,
      placeholderText: '输入昵称（12 字以内）',
      content: userInfo.nickname,
      success: (res) => {
        if (!res.confirm) return;
        const nickname = (res.content || '').trim().slice(0, 12);
        if (!nickname) {
          wx.showToast({ title: '昵称不能为空', icon: 'none' });
          return;
        }
        const next = { ...userInfo, nickname };
        app.saveUserInfo(next);
        this.setData({ userInfo: next, avatarLetter: nickname.slice(0, 1) });
        wx.showToast({ title: '已保存', icon: 'none' });
      }
    });
  },

  onMenuTap(e) {
    const { item } = e.currentTarget.dataset;
    if (!item) return;

    if (item.id === 'favorites') {
      wx.switchTab({ url: '/pages/favorite/favorite' });
      return;
    }

    if (item.id === 'history') {
      wx.navigateTo({ url: '/pkg-read/search/search?type=history' });
      return;
    }

    if (item.id === 'cloud') {
      wx.navigateTo({ url: '/pkg-insight/account/account' });
      return;
    }

    if (item.id === 'desktop') {
      this.showDesktopGuide();
      return;
    }

    if (item.id === 'download') {
      this.openDownload();
      return;
    }

    if (item.id === 'sponsor') {
      this.setData({ tipVisible: true });
      return;
    }

    if (item.id === 'about') {
      wx.navigateTo({ url: '/pkg-read/about/about' });
      return;
    }
  },

  /*
   * 离线下载：点菜单就先播激励视频，看完再跳下载页。
   *
   * ⚠️ 视频必须挂在这次点击上（平台红线：进页面自动播放会被驳回），
   *    所以播放放在入口页而不是 download 页的 onLoad；download 页只负责展示链接，
   *    它自己那个按钮是给扫码 / 分享直接进页面的兜底路径。
   */
  async openDownload() {
    if (this._openingDownload) return;
    this._openingDownload = true;
    const goto = () => { this._openingDownload = false; wx.navigateTo({ url: '/pkg-read/download/download' }); };
    if (cloud.status().loggedIn) {
      wx.showLoading({ title: '正在确认会员…', mask: true });
      try {
        const vip = await cloud.checkVip();
        wx.hideLoading();
        if (vip) return goto();
      } catch (e) {
        wx.hideLoading(); this._openingDownload = false;
        wx.showToast({ title: e.message || '会员状态暂无法确认，请重试', icon: 'none' }); return;
      }
    }

    // 本次启动已经看过视频，直接进页面，不重复打扰
    if (app.globalData.downloadUnlocked) {
      goto();
      return;
    }

    wx.showLoading({ title: '正在准备视频…', mask: true });

    playAd({
      onStart: () => wx.hideLoading(),

      onClose: (ended) => {
        wx.hideLoading();
        if (!ended) {
          this._openingDownload = false;
          wx.showToast({ title: '需看完视频才能解锁', icon: 'none' });
          return;
        }
        app.globalData.downloadUnlocked = true;
        wx.showToast({ title: '已解锁下载', icon: 'success' });
        goto();
      },

      // 广告拉不到（无填充 / 审核中 / 环境不支持）也要保证功能可用，直接放行
      onUnavailable: () => {
        wx.hideLoading();
        app.globalData.downloadUnlocked = true;
        app.globalData.downloadAdFailed = true;
        goto();
      }
    });
  },

  // 与「分享到朋友圈」同款：高亮右上角胶囊，两步引导
  showDesktopGuide() { this.setData({ showGuide: true }); },

  onCloseGuide() {
    this.setData({ showGuide: false });
  },

  onTipClose() {
    this.setData({ tipVisible: false });
  },

  // official-account 组件加载成功：隐藏兜底卡片，用官方关注组件
  onOaLoad() {
    this.setData({ oaReady: true });
  },

  // 组件不可用（未关联公众号 / 未在后台开启 / 场景值不支持等），保留兜底卡片即可
  onOaError(e) {
    console.warn('公众号关注组件不可用', e && e.detail);
  },

  // 优先直接打开公众号主页，失败/不支持时回退为复制名称引导搜索
  onFollowAuthor() {
    if (!this.data.canJump) {
      this.copyAccountName();
      return;
    }

    wx.openOfficialAccountProfile({
      username: OFFICIAL_ACCOUNT_ID,
      fail: (err) => {
        console.warn('打开公众号主页失败，回退复制名称', err);
        this.copyAccountName();
      }
    });
  },

  copyAccountName() {
    wx.setClipboardData({
      data: OFFICIAL_ACCOUNT,
      success: () => {
        wx.showToast({ title: '公众号名已复制，去微信搜索关注', icon: 'none' });
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '更好的生活，从每一个选择开始丨人生指南库',
      path: '/pages/index/index',
      imageUrl: '/assets/images/splash.jpg'
    };
  }
});
