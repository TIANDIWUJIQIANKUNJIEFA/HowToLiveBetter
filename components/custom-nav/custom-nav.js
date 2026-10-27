const { getStatusBarHeight, getNavBarHeight } = require('../../utils/util.js');

Component({
  options: {
    multipleSlots: true
  },

  properties: {
    title: { type: String, value: '' },
    align: { type: String, value: 'center' }, // center | left
    big: { type: Boolean, value: false },     // 左对齐大标题（v2 首页）
    back: { type: Boolean, value: false },
    home: { type: Boolean, value: false },
    bgColor: { type: String, value: 'var(--color-surface, #ffffff)' },
    textColor: { type: String, value: 'var(--color-text, #22262b)' },
    fixed: { type: Boolean, value: true },
    placeholder: { type: Boolean, value: true },
    shadow: { type: Boolean, value: true },
    customBack: { type: Boolean, value: false }  // true 时只抛 back 事件，不直接返回
  },

  data: {
    statusBarHeight: 20,
    navBarHeight: 44
  },

  lifetimes: {
    attached() {
      this.setData({
        statusBarHeight: getStatusBarHeight(),
        navBarHeight: getNavBarHeight()
      });
    }
  },

  methods: {
    onBack() {
      if (this.data.customBack) {
        this.triggerEvent('back');
        return;
      }
      const pages = getCurrentPages();
      if (pages.length > 1) {
        wx.navigateBack();
      } else {
        wx.switchTab({ url: '/pages/reco/reco' });
      }
    },

    onHome() {
      wx.switchTab({ url: '/pages/reco/reco' });
    },

    onRightTap() {
      this.triggerEvent('rightTap');
    }
  }
});
