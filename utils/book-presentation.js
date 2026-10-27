/** Book-specific presentation; availability comes from the catalog. */
const CONFIG = {
  hltb: { titleLine1: '高性价比', titleLine2: '人生指南', cover: '/assets/porcelain/cover-hltb.jpg', flatCover: '/assets/porcelain/flat-cover-hltb.jpg', descLine1: '长寿防病 · 急救 · 理财 · 法律红线 · 育儿', descLine2: '每条写明成本、收益与证据等级', features: '证据分级 · 说人话解读' },
  social: { titleLine1: '人情世故', titleLine2: '指南', cover: '/assets/porcelain/cover-social.jpg', flatCover: '/assets/porcelain/flat-cover-social.jpg', descLine1: '说话 · 人情 · 工作 · 家庭 · 人生阶段', descLine2: '讲清规则，也讲清人心', features: 'changxueyi · CC BY 4.0' }
};
function presentation(book) {
  return CONFIG[book.id] || { titleLine1: book.title, titleLine2: '', cover: '', flatCover: '', descLine1: book.description || '', descLine2: '', features: '按主题阅读' };
}
module.exports = { presentation };
