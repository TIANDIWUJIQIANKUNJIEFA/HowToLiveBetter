const app = getApp();
const cloud = require('../../utils/cloud-sync.js');
const { DOWNLOAD_FILES } = require('../../utils/download-config.js');
const { playAd, preloadAd } = require('../../utils/rewarded-ad.js');
const { getDataStatus } = require('../../utils/data.js');
const { absolute } = require('../../utils/time.js');

Page({
  data: {
    files: DOWNLOAD_FILES,
    unlocked: false,
    vip: false,
    checkingMembership: false,
    // 卡头「更新 MM-DD」：数据状态里取上游内容最后变更时刻
    updatedShort: '',
    // 广告拉取中，用于页面上的等待态文案
    loading: false,
    // 广告没播成而放行的，页面上给一句说明
    adFailed: false,
    // 正在下载的文件 key + 进度（0-100）
    downloadingKey: '',
    progress: 0,
    // 两个源都下载失败的文件，露出 GitHub 地址让用户复制
    failedKey: '',
    // 原始错误只用于诊断，不在用户界面展示
    lastErrMsg: ''
  },

  onLoad() {
    const st = getDataStatus();
    const short = st && st.updatedAt ? absolute(st.updatedAt, false) : '';
    this.setData({ updatedShort: short ? short.split(' ')[0] : '' });

    // 已从「我的」页看完视频进来（或本次启动已解锁），直接展示链接
    if (app.globalData.downloadUnlocked) {
      this.setData({ unlocked: true, adFailed: !!app.globalData.downloadAdFailed });
      return;
    }

    /*
     * ⚠️ 这里只预热，绝不 show()。平台红线：激励视频必须由用户主动点击触发，
     *    进页面自动播放会被驳回（微信实测驳回过一次）。
     *    正常路径的广告在「我的」页点菜单时就播完了；下面那个按钮是给
     *    扫码 / 分享直接落到本页的兜底路径。
     */
    if (!cloud.status().vip) preloadAd();
  },

  onShow() { this.refreshAccess(); },
  async refreshAccess() {
    if (!cloud.status().loggedIn) {
      this.setData({ vip: false, unlocked: !!app.globalData.downloadUnlocked }); return;
    }
    this.setData({ checkingMembership: true });
    try {
      const vip = await cloud.checkVip();
      this.setData({ vip, unlocked: vip || !!app.globalData.downloadUnlocked });
    } catch (e) {
      this.setData({ vip: false, unlocked: !!app.globalData.downloadUnlocked });
      wx.showToast({ title: e.message || '会员状态暂无法确认，请重试', icon: 'none' });
    } finally { this.setData({ checkingMembership: false }); }
  },

  unlock() {
    app.globalData.downloadUnlocked = true;
    this.setData({ unlocked: true });
  },

  // 广告没播成（环境不支持 / 无填充 / 加载失败）时兜底放行，保证下载功能可用
  failOpen(code) {
    if (this.data.unlocked) return;
    app.globalData.downloadUnlocked = true;
    app.globalData.downloadAdFailed = true;
    this.setData({ unlocked: true, loading: false, adFailed: true });
    wx.showToast({
      title: '视频暂不可用，已直接解锁',
      icon: 'none'
    });
  },

  /* 兜底路径：扫码/分享直接进到本页时，用户点按钮才播（不能自动播） */
  async onWatchAd() {
    if (this.data.loading || this.data.unlocked || this.data.checkingMembership) return;
    this.setData({ loading: true });
    if (cloud.status().loggedIn) {
      try {
        const vip = await cloud.checkVip();
        if (vip) { this.setData({ vip: true, unlocked: true, loading: false }); return; }
      } catch (e) {
        this.setData({ loading: false }); wx.showToast({ title: e.message || '会员状态暂无法确认，请重试', icon: 'none' }); return;
      }
    }
    wx.showLoading({ title: '正在准备视频…', mask: true });

    playAd({
      onStart: () => {
        wx.hideLoading();
      },

      onClose: (ended) => {
        wx.hideLoading();
        this.setData({ loading: false });
        if (ended) {
          this.unlock();
          wx.showToast({ title: '已解锁下载', icon: 'success' });
        } else {
          wx.showToast({ title: '需看完视频才能解锁', icon: 'none' });
        }
        // 播完预加载下一条，避免下次 show 时还没就绪（正式环境常见 2005）
        preloadAd();
      },

      onUnavailable: (err) => {
        wx.hideLoading();
        this.failOpen(err && (err.errCode || err.errMsg));
      }
    });
  },

  /*
   * 单个文件的主操作：三个格式都支持真下载（加速源优先，失败退回 GitHub 直链）。
   * 下载完成后的交付方式按格式分：
   *   - PDF → 直接打开预览
   *   - EPUB / HTML → 小程序打不开，转发给文件传输助手让用户存到本地
   */
  async onFileAction(e) {
    const index = Number(e.currentTarget.dataset.index);
    const file = this.data.files[index];
    if (!file || this.data.downloadingKey) return;

    if (cloud.status().loggedIn || this.data.vip) {
      try {
        const vip = await cloud.checkVip();
        this.setData({ vip, unlocked: vip || !!app.globalData.downloadUnlocked });
      } catch (err) { wx.showToast({ title: err.message || '会员状态暂无法确认，请重试', icon: 'none' }); return; }
    }

    /* 未解锁：文件行置灰仅展示信息，点击引导到底部解锁按钮 */
    if (!this.data.unlocked) {
      wx.showToast({ title: '先看一段视频解锁下载', icon: 'none' });
      return;
    }

    this.startDownload(file);
  },

  /* 下载：加速源优先，失败自动退回 GitHub 直链，都失败才露出地址 */
  startDownload(file) {
    const sources = [file.mirrorUrl, file.url].filter(Boolean);
    this.lastErr = '';
    this.setData({ downloadingKey: file.key, progress: 0, failedKey: '', lastErrMsg: '' });
    this.downloadFrom(file, sources, 0);
  },

  downloadFrom(file, sources, i) {
    const url = sources[i];
    if (!url) {
      this.onAllSourcesFailed(file);
      return;
    }

    const task = wx.downloadFile({
      url,
      success: res => {
        if (res.statusCode !== 200) {
          this.lastErr = 'HTTP ' + res.statusCode;
          this.downloadFrom(file, sources, i + 1);
          return;
        }
        this.setData({ downloadingKey: '', progress: 0 });
        this.openFile(file, res.tempFilePath);
      },
      fail: err => {
        // 记下来，全失败时据此判断是不是域名白名单没配
        this.lastErr = (err && err.errMsg) || '';
        console.warn('downloadFile 失败', url, this.lastErr);

        /* 域名白名单报错时，下一个源若是境外域名（github.com / githubusercontent），
           它同样不可能进白名单，再试一次只会让用户多等一个超时 */
        const next = sources[i + 1];
        if (this.isDomainErr() && next && /githubusercontent\.com|github\.com/.test(next)) {
          this.onAllSourcesFailed(file);
          return;
        }
        this.downloadFrom(file, sources, i + 1);
      }
    });

    if (task && task.onProgressUpdate) {
      task.onProgressUpdate(r => this.setData({ progress: r.progress }));
    }
  },

  /* 下载源均失败时提供手动复制入口。 */
  onAllSourcesFailed(file) {
    this.setData({
      downloadingKey: '',
      progress: 0,
      failedKey: file.key,
      lastErrMsg: this.lastErr || ''
    });
    wx.showToast({ title: '下载暂未成功，可复制链接到浏览器打开', icon: 'none', duration: 3000 });
  },

  // 微信域名白名单报错形如 "downloadFile:fail url not in domain list"
  isDomainErr() {
    return /domain|合法域名/i.test(this.lastErr || '');
  },

  openFile(file, filePath) {
    /* PDF：直接打开，右上角可「用其他应用打开」存到本地 */
    if (file.openType) {
      wx.openDocument({
        filePath,
        fileType: file.openType,
        showMenu: true,
        fail: () => {
          this.setData({ failedKey: file.key });
          wx.showToast({ title: '无法打开，已显示备用链接', icon: 'none' });
        }
      });
      return;
    }

    /* EPUB / HTML：转发给文件传输助手，用户存下来就能导入阅读器 */
    if (!wx.shareFileMessage) {
      // 低版本基础库没有这个 API，退回复制链接
      this.setData({ failedKey: file.key });
      wx.showToast({ title: '当前环境无法发送文件，可复制链接', icon: 'none' });
      return;
    }

    const isDevtools =
      (wx.getDeviceInfo ? wx.getDeviceInfo().platform : '') === 'devtools';

    wx.shareFileMessage({
      filePath,
      fileName: file.name,
      fail: err => {
        const msg = (err && err.errMsg) || '';
        if (msg.includes('cancel')) return; // 用户自己取消，不算失败

        /* 开发者工具不支持 shareFileMessage（真机正常），不能当失败处理，
           否则会出现"明明 200 了还提示下载失败"的误报 */
        if (isDevtools || msg.includes('not support') || msg.includes('not yet')) {
          this.setData({ failedKey: file.key });
          wx.showToast({ title: '当前环境无法发送文件，可复制链接', icon: 'none' });
          return;
        }

        this.setData({ failedKey: file.key });
        wx.showToast({ title: '无法发送，已显示备用链接', icon: 'none' });
      }
    });
  },

  copy(url, label) {
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: `${label} 链接已复制`, icon: 'none' }),
      fail: () => wx.showToast({ title: '复制未成功，请重试', icon: 'none' })
    });
  },

  // 兜底块第一行：复制首选链接（加速源）
  onCopyFallback(e) {
    const file = this.data.files[Number(e.currentTarget.dataset.index)];
    if (file) this.copy(file.copyUrl || file.url, file.label);
  },

  // 兜底块第二行：加速源也不通时才用的 GitHub 备用
  onCopyBackup(e) {
    const file = this.data.files[Number(e.currentTarget.dataset.index)];
    if (file) this.copy(file.url, file.label);
  },

  // 底部按钮：三个格式一起复制（优先加速源）
  onCopyLink() {
    const text = this.data.files.map(f => `${f.label}：${f.copyUrl || f.url}`).join('\n');
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '链接已复制，请到浏览器打开', icon: 'none' })
    });
  },

  onShareAppMessage() {
    return {
      title: '离线下载完整版丨人生指南库',
      path: '/pages/index/index',
      imageUrl: '/assets/images/splash.jpg'
    };
  }
});
