const CONTENT = {
  desktop: {
    title: '添加到桌面',
    subtitle: '把生活指南放在手边，下次打开更方便。',
    action: '添加到桌面',
    icon: 'desktop'
  },
  timeline: {
    title: '分享到朋友圈',
    subtitle: '把这份生活灵感，分享给关心的朋友。',
    action: '分享到朋友圈',
    icon: 'moments'
  }
};

Component({
  properties: {
    visible: { type: Boolean, value: false },
    kind: { type: String, value: 'timeline' },
    tone: { type: String, value: 'auto' }
  },
  data: { content: CONTENT.timeline, ringTop: 48, ringLeft: 275, ringSize: 40, cueTop: 100, cueRight: 70, cardTop: 185, cardHeight: 500 },
  observers: {
    'visible, kind': function (visible, kind) {
      this.setData({ content: CONTENT[kind] || CONTENT.timeline });
      if (visible) this.measure();
    }
  },
  methods: {
    measure() {
      const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      let rect;
      try { rect = wx.getMenuButtonBoundingClientRect(); } catch (_) { /* fallback below */ }
      if (!rect || !rect.width || !rect.height) rect = { top: (win.statusBarHeight || 24) + 8, left: win.windowWidth - 94, width: 87, height: 32 };
      const centerX = rect.left + rect.height / 2;
      const cardTop = Math.max(rect.top + rect.height + 100, Math.min(win.windowHeight * 0.25, 215));
      this.setData({
        ringTop: rect.top - 5,
        ringLeft: centerX - (rect.height + 10) / 2,
        ringSize: rect.height + 10,
        cueTop: rect.top + rect.height + 18,
        cueRight: Math.max(24, win.windowWidth - centerX - 12),
        cardTop,
        cardHeight: Math.max(120, win.windowHeight - cardTop - 24)
      });
    },
    onClose() { this.triggerEvent('close'); },
    onNoop() {}
  }
});
