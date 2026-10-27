const library = require('../../utils/library.js');

Page({
  data: {
    sections: [
      {
        title: '挑建议',
        lines: [
          '首页选一个想改善的方向，答两步小问卷，就能拿到来自已上架内容的个性化建议。',
          '推荐条目保留来源、成本与证据强度；情境指南保留适用情况、表达示例、例外与代价，点击可查看完整内容。'
        ]
      },
      {
        title: '搜与读',
        lines: [
          `搜索覆盖 ${library.getTotalStepCount()} 条建议的标题与正文，可按书、主题筛选。`,
          '正文里的绿色上标是条目引用，点一下跳转，再点「回到原文」返回；虚线词语可点开名词解释。'
        ]
      },
      {
        title: '收藏与阅读进度',
        lines: [
          '星标收藏建议 / 章节 / 主题，在「收藏」页集中管理。本地记录免费使用；永久 VIP 可主动开启云同步，支持同一微信账户跨设备恢复。',
          '阅读排版可在右上角 Aa 里调字号、行距和纸白/米黄/夜间底色。'
        ]
      },
      {
        title: '离线与更新',
        lines: [
          '内容会自动缓存，弱网也能读已看过的部分。',
          '「离线下载」可拿到整本书的 PDF / EPUB / HTML。'
        ]
      },
      {
        title: '反馈',
        lines: [
          '「我的 → 反馈建议」直接发消息给作者，都会看。'
        ]
      }
    ]
  },

  onShareAppMessage() {
    return {
      title: '使用说明丨人生指南库',
      path: '/pages/reco/reco',
      imageUrl: '/assets/porcelain/home-hero.jpg'
    };
  }
});
