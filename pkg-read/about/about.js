/* 来源与授权（设计稿 21）：署名要求在「关于」页履行，复制的是上游仓库地址。
   dot 色用 token 变量，深色模式随 --lb-* 自动适配 */
const SOURCES = [
  {
    title: '《高性价比人生指南》',
    sub: 'eternity4719 · CC BY 4.0 · 转载需署名',
    accent: 'var(--lb-bk1)',
    url: 'https://github.com/eternity4719/HowToLiveBetter'
  },
  {
    title: '《人情世故指南》',
    sub: 'changxueyi · CC BY 4.0 · 正文仅作格式转换',
    accent: 'var(--lb-bk2)',
    url: 'https://github.com/changxueyi/renqing-shigu'
  },
  {
    title: '本项目源码',
    sub: 'HuiTurn/HowToLiveBetter',
    accent: 'var(--lb-ink)',
    url: 'https://github.com/HuiTurn/HowToLiveBetter'
  }
];

Page({
  data: {
    version: '',
    sources: SOURCES
  },

  onLoad() {
    /* 真实版本号：正式版取后台发布版本；开发/体验版标注环境 */
    let version = '';
    try {
      const info = wx.getAccountInfoSync();
      const mp = (info && info.miniProgram) || {};
      version = mp.version || { develop: 'dev', trial: 'trial' }[mp.envVersion] || '';
    } catch (e) { /* ignore */ }
    this.setData({ version: version || '1.0.0' });
  },

  onCopySource(e) {
    const src = SOURCES[Number(e.currentTarget.dataset.index)];
    if (!src) return;
    wx.setClipboardData({
      data: src.url,
      success: () => wx.showToast({ title: '链接已复制', icon: 'none' })
    });
  },

  onShareAppMessage() {
    return {
      title: '更好的生活，从每一个选择开始丨人生指南库',
      path: '/pages/reco/reco',
      imageUrl: '/assets/porcelain/home-hero.jpg'
    };
  }
});
