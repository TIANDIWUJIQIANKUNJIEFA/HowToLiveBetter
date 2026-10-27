/**
 * v1 → v2 数据迁移（幂等，先备份后写，一次性）
 *
 * 变化点（设计稿 3.2）：
 *   - 收藏/阅读历史/点赞里的裸章节 id（b01）→ 补书前缀（hltb:b01）
 *   - v2 ID 格式：bookId:chapterId[:stepIdx]；旧分享链接由阅读页兼容（无 bookId
 *     参数默认 hltb），这里只管本地存储
 *   - surveyProfile 保留原样，v2 字段（topicIds/obstacles）由向导增量写入
 *
 * 由 app.onLaunch 调一次；迁移标记 htlb:v2:migrated 保证幂等。
 */
const MIGRATED_KEY = 'htlb:v2:migrated';
const BACKUP_KEY = 'htlb:v1:backup';

/** 裸 id（b01 / b01-3 / a/b01）→ 带书前缀；已带前缀的不动 */
const withBookPrefix = (id) => {
  if (typeof id !== 'string') return id;
  if (id.indexOf(':') > -1) return id;                       // 已是 v2 格式
  const m = /^b(\d{1,2})(?:-(\d+))?$/.exec(id.trim());
  if (!m) return id;                                          // 非章节 id（不认识就原样保留）
  const chapterId = 'b' + m[1].padStart(2, '0');
  return m[2] ? `hltb:${chapterId}:${m[2]}` : `hltb:${chapterId}`;
};

const migrateList = (raw) => {
  if (!Array.isArray(raw)) return null;
  return raw.map(withBookPrefix);
};

/**
 * @returns {boolean} true 表示本次执行了迁移
 */
function migrateV2() {
  let flag = null;
  try { flag = wx.getStorageSync(MIGRATED_KEY); } catch { flag = null; }
  if (flag) return false;

  const read = (key) => { try { return wx.getStorageSync(key); } catch { return null; } };
  const write = (key, val) => { try { wx.setStorageSync(key, val); } catch { /* ignore */ } };

  const backup = {};
  const favOld = read('favorites');
  const histOld = read('readHistory');
  const likedOld = read('likedArticles');

  if (Array.isArray(favOld)) {
    backup.favorites = favOld;
    write('favorites', migrateList(favOld));
  }
  if (Array.isArray(histOld)) {
    backup.readHistory = histOld;
    write('readHistory', migrateList(histOld));
  }
  if (Array.isArray(likedOld)) {
    backup.likedArticles = likedOld;
    write('likedArticles', migrateList(likedOld));
  }
  if (Object.keys(backup).length) write(BACKUP_KEY, backup);
  write(MIGRATED_KEY, Date.now());
  return true;
}

/** 匿名客户端标识（服务端负反馈维度，无账号体系） */
const CLIENT_KEY = 'htlb:v2:clientUuid';

function getClientUuid() {
  let id = '';
  try { id = wx.getStorageSync(CLIENT_KEY) || ''; } catch { id = ''; }
  if (id) return id;
  id = 'u-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  try { wx.setStorageSync(CLIENT_KEY, id); } catch { /* ignore */ }
  return id;
}

module.exports = { migrateV2, withBookPrefix, getClientUuid };
