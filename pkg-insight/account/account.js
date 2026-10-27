const cloud = require('../../utils/cloud-sync.js');
const createAccountActions = require('../../utils/cloud-account-actions.js');
const { absolute } = require('../../utils/time.js');
Page({
  ...createAccountActions(cloud, wx),
  data: { cloud: {}, busy: false, controlColor: '#226B60', lastSyncText: '尚未同步' },
  onLoad() {
    this._themeHandler = ({ theme }) => this.setData({ controlColor: theme === 'dark' ? '#8BC7B3' : '#226B60' });
    this._themeHandler({ theme: wx.getAppBaseInfo ? wx.getAppBaseInfo().theme : 'light' });
    if (wx.onThemeChange) wx.onThemeChange(this._themeHandler);
    this._unsubscribe = cloud.onChange(() => this.render());
    this.render();
  },
  onShow() {
    this.render();
    if (cloud.status().loggedIn) cloud.refresh().catch(() => {});
  },
  onUnload() {
    if (this._unsubscribe) this._unsubscribe();
    if (wx.offThemeChange) wx.offThemeChange(this._themeHandler);
  },
  render() {
    const current = cloud.status();
    this.setData({ cloud: current, lastSyncText: current.lastSync ? absolute(current.lastSync) : '尚未同步' });
  },
  onVip() { wx.navigateTo({ url: '/pkg-insight/vip/vip' }); }
});
