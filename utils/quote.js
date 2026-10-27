const library = require('./library.js');
const idOf = (q, i) => String(q.id == null ? i : q.id);
function selectQuote(id, next = false) {
  const quotes = library.getQuotes();
  if (!quotes.length) return null;
  let index = quotes.findIndex((q, i) => idOf(q, i) === String(id));
  if (next && quotes.length > 1) index = (Math.max(0, index) + 1 + Math.floor(Math.random() * (quotes.length - 1))) % quotes.length;
  if (index < 0) {
    const d = new Date();
    const day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    let hash = 0;
    for (let i = 0; i < day.length; i++) hash = ((hash << 5) - hash) + day.charCodeAt(i);
    index = Math.abs(hash) % quotes.length;
  }
  return { ...quotes[index], id: idOf(quotes[index], index), author: quotes[index].author || '人生指南库' };
}
module.exports = { selectQuote };
