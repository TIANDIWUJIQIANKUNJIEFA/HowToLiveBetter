const cloud = require('../../utils/cloud-sync.js');
const pay = require('../../utils/pay.js');
const createAccountActions = require('../../utils/cloud-account-actions.js');
const { absolute } = require('../../utils/time.js');
Page({
  ...createAccountActions(cloud, wx),
  data: {
    product: { price: '9.90', paymentEnabled: false, iosEnabled: false },
    cloud: {}, purchaseAvailable: false, purchaseLabel: '购买暂未开放', controlColor: '#226B60', busy: false, agreed: false, lastSyncText: '尚未同步', loadError: ''
  },
  onLoad() {
    this._themeHandler = ({ theme }) => this.setData({ controlColor: theme === 'dark' ? '#8BC7B3' : '#226B60' });
    this._themeHandler({ theme: wx.getAppBaseInfo ? wx.getAppBaseInfo().theme : 'light' });
    if (wx.onThemeChange) wx.onThemeChange(this._themeHandler);
    this._unsubscribe = cloud.onChange(() => this.render());
    this.render();
  },
  onShow() {
    cloud.request('GET', '/vip/product', null, false).then(product => {
      let purchaseAvailable = false, purchaseLabel = '购买暂未开放', loadError = '';
      if (product.paymentEnabled) {
        const available = pay.checkAvailability();
        purchaseAvailable = available.ok && (available.platform !== 'ios' || product.iosEnabled);
        if (purchaseAvailable) purchaseLabel = '¥9.90 开通永久 VIP';
        else {
          purchaseLabel = available.ok ? 'iOS 购买暂未开放' : (available.label || '当前微信暂不支持购买');
          loadError = available.ok ? '当前尚未开放 iOS 购买，已购用户仍可登录并恢复权益。' : available.message;
        }
      }
      this.setData({ product, purchaseAvailable, purchaseLabel, loadError });
    }).catch(() => this.setData({ loadError: '会员服务暂未开放，请稍后再来', purchaseAvailable: false, purchaseLabel: '购买暂未开放' }));
    if (cloud.status().loggedIn) cloud.refresh().catch(() => {});
  },
  onUnload() { if (this._unsubscribe) this._unsubscribe(); if (wx.offThemeChange) wx.offThemeChange(this._themeHandler); },
  render() {
    const current = cloud.status();
    this.setData({ cloud: current, lastSyncText: current.lastSync ? absolute(current.lastSync) : '尚未同步' });
  },
  onAgree(e) { this.setData({ agreed: (e.detail.value || []).includes('agree') }); },
  onTerms() {
    wx.showModal({ title: '会员与同步说明', showCancel: false,
      content: '永久 VIP 为一次性 9.90 元，无固定到期日，不自动续费；权益绑定当前微信账户，退款成功后终止。\n\n本地收藏、浏览和阅读继续免费使用。会员另享离线下载免激励视频、深度分析结果免分享解锁。云同步需主动开启，只上传收藏（含标题摘要）、浏览记录和阅读位置，不上传昵称头像或问卷。记录经 HTTPS 传输并存储在服务端，最多保留 10,000 个同步记录（含删除标记）。\n\n关闭同步不会删除本机或云端已有记录，可在「我的 → 账户与同步」清空云端记录。为防止旧设备恢复已删除内容，会保留不含标题与阅读位置的删除标记。会员与订单记录不会随清空操作删除。并发修改时保留云端较新版本；换账户前会备份本机记录。服务问题可通过「我的 → 反馈建议」联系客服。' });
  },
  async onBuy() {
    if (this.data.busy || this.data.cloud.phase === 'syncing') return;
    if (!this.data.agreed) return wx.showToast({ title: '请先阅读并同意会员说明', icon: 'none' });
    if (!this.data.product.paymentEnabled) return wx.showToast({ title: '购买暂未开放', icon: 'none' });
    const availability = pay.checkAvailability();
    if (!availability.ok) return this.showError(new Error(availability.message));
    if (availability.platform === 'ios' && !this.data.product.iosEnabled) return this.showError(new Error('iOS 购买暂未开放'));
    this.setData({ busy: true });
    try {
      await this.ensureLogin();
      if (cloud.status().vip) return wx.showToast({ title: '已是永久 VIP，无需重复购买', icon: 'none' });
      const order = await cloud.request('POST', '/vip/orders', {
        code: await cloud.wxCode(), platform: availability.platform, termsVersion: '2026-10-26'
      });
      wx.setStorageSync('htlb:cloud:' + cloud.status().accountId + ':pendingOrder', order.orderId);
      await new Promise((resolve, reject) => wx.requestVirtualPayment({ ...order.payData,
        success: resolve, fail: e => reject(new Error((e.errMsg || '').includes('cancel') ? '已取消支付' : '支付未完成，可稍后恢复已购权益')) }));
      let paid = false;
      for (let i = 0; i < 5; i++) {
        const result = await cloud.request('GET', '/vip/orders/' + encodeURIComponent(order.orderId));
        if (result.status === 'DELIVERED') { paid = true; break; }
        if (result.status === 'REFUNDED') throw new Error('该订单已退款');
        await new Promise(resolve => setTimeout(resolve, 1200));
      }
      if (!paid) throw new Error('支付确认中，请到「我的 → 账户与同步」恢复权益');
      await cloud.refresh();
      wx.removeStorageSync('htlb:cloud:' + cloud.status().accountId + ':pendingOrder');
      wx.showToast({ title: '永久 VIP 已开通', icon: 'success' });
      await this.enableWithConsent();
    } catch (e) { if (e.status === 409) await cloud.refresh().catch(() => {}); this.showError(e); }
    finally { this.setData({ busy: false }); this.render(); }
  },

});
