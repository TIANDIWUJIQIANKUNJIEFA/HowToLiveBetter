// Shared account actions keep purchase and account settings on the same login/consent flow.
module.exports = (cloud, wx) => ({
  async ensureLogin() {
    if (!cloud.status().loggedIn || ['loginRequired', 'accountChanged'].includes(cloud.status().phase)) await cloud.login();
    if (cloud.status().accountChanged) {
      const accepted = await new Promise(resolve => wx.showModal({ title: '切换微信账户',
        content: '本机记录属于另一个微信账户。继续后会保存该账户的本机备份，并切换为当前账户的记录，避免数据混合。',
        success: r => resolve(r.confirm), fail: () => resolve(false) }));
      if (!accepted) throw new Error('已保留原账户的本机记录，未开启同步');
      cloud.claimAccount(true);
    } else cloud.claimAccount();
  },
  async onLogin() {
    if (this.data.busy || this.data.cloud.phase === 'syncing') return;
    this.setData({ busy: true });
    try { await this.ensureLogin(); if (cloud.status().enabled) await cloud.sync(); wx.showToast({ title: '微信账户已连接', icon: 'success' }); }
    catch (e) { this.showError(e); }
    finally { this.setData({ busy: false }); this.render(); }
  },
  async enableWithConsent() {
    const yes = await new Promise(resolve => wx.showModal({ title: '开启云端同步',
      content: '将收藏、最近浏览和阅读进度同步到当前微信账户。首次同步会合并本机记录与云端记录，同一条记录的并发修改以云端较新版本为准。',
      confirmText: '开启同步', success: r => resolve(r.confirm), fail: () => resolve(false) }));
    if (yes) await cloud.setEnabled(true);
  },
  async onToggleSync(e) {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try {
      if (e.detail.value) { await this.ensureLogin(); await this.enableWithConsent(); }
      else await cloud.setEnabled(false);
    } catch (err) { this.showError(err); }
    finally { this.setData({ busy: false }); this.render(); }
  },
  async onSync() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try { await cloud.sync(); wx.showToast({ title: '云端同步完成', icon: 'success' }); }
    catch (e) { this.showError(e); }
    finally { this.setData({ busy: false }); }
  },
  async onRestore() {
    if (this.data.busy || this.data.cloud.phase === 'syncing') return;
    this.setData({ busy: true });
    try {
      await this.ensureLogin();
      const result = await cloud.restore();
      wx.showToast({ title: result.vip ? '已恢复永久 VIP' : '尚未查询到已付款的 VIP 订单', icon: 'none' });
    } catch (e) { this.showError(e); }
    finally { this.setData({ busy: false }); this.render(); }
  },
  async onClearCloud() {
    if (this.data.busy || this.data.cloud.phase === 'syncing') return;
    const yes = await new Promise(resolve => wx.showModal({ title: '清空云端记录',
      content: '将关闭同步并清空此账户的云端收藏、浏览和阅读进度。本机记录保留；其他设备下次同步会接收删除结果。云端保留删除标记与会员订单，重新开启同步也会接收这些删除结果。',
      confirmText: '清空云端', success: r => resolve(r.confirm), fail: () => resolve(false) }));
    if (!yes) return;
    this.setData({ busy: true });
    try { await cloud.setEnabled(false); await cloud.request('DELETE', '/account/sync'); wx.showToast({ title: '云端记录已清空', icon: 'none' }); }
    catch (e) { this.showError(e); }
    finally { this.setData({ busy: false }); this.render(); }
  },
  async onLogout() {
    if (this.data.busy || this.data.cloud.phase === 'syncing') return;
    const yes = await new Promise(resolve => wx.showModal({ title: '退出云账户', content: '本机记录会保留，退出后停止同步。',
      success: r => resolve(r.confirm), fail: () => resolve(false) }));
    if (yes) { await cloud.logout(); this.render(); }
  },
  showError(e) { wx.showToast({ title: (e && e.message) || '操作未完成，请稍后再试', icon: 'none', duration: 3000 }); }
});
