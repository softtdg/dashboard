const { connectDB } = require('../db/conn');
const {
  realDate, iso, text, number, cutoffFor, inWindow, todayIso, pretty,
  countText, inBucket, inMonths, monthlyOf, topCount, pageRows,
} = require('./analyticsUtil');

const CACHE_MS = 60 * 1000;
let cache = null;
let loading = null;

async function loadRows() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  if (loading) return loading;
  loading = (async () => {
    const db = await connectDB();
    if (!db.BOMs) throw new Error('Purchasing list is not connected');
    const docs = await db.BOMs.collection('purchaseOrderList')
      .find({}, { projection: { comments: 0, __v: 0 } })
      .toArray();
    const today = todayIso();
    const rows = docs.map((doc) => {
      const ordered = realDate(doc.date);
      const delivery = realDate(doc.deliveryDate);
      const qty = number(doc.QTY);
      const received = number(doc.received);
      const shortQty = Math.max(qty - received, 0);
      const open = shortQty > 0;
      return {
        id: String(doc._id),
        poNumber: text(doc.num),
        ordered: iso(ordered),
        delivery: iso(delivery),
        vendor: text(doc.sourceName) || '(none)',
        buyer: text(doc.BUYER) || '(none)',
        item: text(doc.Item),
        description: text(doc.itemDescription),
        project: text(doc.project) || '(none)',
        sheet: text(doc.sheetType) || '(none)',
        currency: text(doc.currency),
        qty,
        received,
        shortQty,
        open,
        late: open && iso(delivery) != null && iso(delivery) < today,
      };
    }).filter((row) => row.ordered);
    cache = { at: Date.now(), rows };
    loading = null;
    return rows;
  })().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

function scoped(rows, filters, cutoff) {
  return rows.filter((row) => {
    if (filters.vendor && row.vendor !== filters.vendor) return false;
    if (filters.buyer && row.buyer !== filters.buyer) return false;
    if (filters.sheet && row.sheet !== filters.sheet) return false;
    if (filters.item && row.item !== filters.item) return false;
    return inWindow(row.ordered, cutoff);
  });
}

async function getPurchasingDashboard(filters) {
  const allRows = await loadRows();
  const cutoff = cutoffFor(filters.months);
  const rows = scoped(allRows, filters, cutoff);
  const history = scoped(allRows, filters, null);
  const open = rows.filter((row) => row.open);
  const late = rows.filter((row) => row.late);
  const first = history.map((row) => row.ordered).sort()[0];
  const last = history.map((row) => row.ordered).sort().at(-1);
  const topVendor = topCount(open, 'vendor', 1)[0];
  return {
    kpis: {
      lines: rows.length,
      open: open.length,
      filled: rows.length - open.length,
      late: late.length,
      qty: rows.reduce((sum, row) => sum + row.qty, 0),
      shortQty: open.reduce((sum, row) => sum + row.shortQty, 0),
      vendors: new Set(rows.map((row) => row.vendor)).size,
      buyers: new Set(rows.map((row) => row.buyer)).size,
    },
    monthly: monthlyOf(history, 'ordered', 'open'),
    all: {
      arrived: history.length,
      completed: history.filter((row) => !row.open).length,
      remaining: history.filter((row) => row.open).length,
    },
    vendors: topCount(open, 'vendor', 8, (group, row) => { group.qty += row.shortQty; }),
    buyers: topCount(rows, 'buyer', 8, (group, row) => { group.qty += row.open ? 1 : 0; }),
    items: topCount(open, 'item', 8, (group, row) => { group.qty += row.shortQty; }),
    sheets: topCount(rows, 'sheet', 6),
    options: {
      vendors: [...new Set(allRows.map((row) => row.vendor))].sort(),
      buyers: [...new Set(allRows.map((row) => row.buyer))].sort(),
      sheets: [...new Set(allRows.map((row) => row.sheet))].sort(),
    },
    findings: [
      `Purchase lines run from ${pretty(first)} to ${pretty(last)}.`,
      `${countText(open.length)} lines in this window are still short, ${countText(Math.round(open.reduce((sum, row) => sum + row.shortQty, 0)))} pieces. ${countText(late.length)} of those are already past the delivery date.`,
      topVendor ? `${topVendor.name} has the most open lines: ${countText(topVendor.count)}.` : 'No open lines in this window.',
    ],
  };
}

function matches(row, filters, cutoff) {
  if (filters.vendor && row.vendor !== filters.vendor) return false;
  if (filters.buyer && row.buyer !== filters.buyer) return false;
  if (filters.sheet && row.sheet !== filters.sheet) return false;
  if (filters.item && row.item !== filters.item) return false;
  const view = filters.view || 'lines';
  const skip = view.startsWith('month') || view.startsWith('all');
  if (!skip && !inWindow(row.ordered, cutoff)) return false;
  if (view === 'open' || view === 'allOpen') return row.open;
  if (view === 'filled' || view === 'allFilled') return !row.open;
  if (view === 'late') return row.late;
  if (view === 'monthLines') return inMonths(row.ordered, filters);
  if (view === 'monthOpen') return row.open && inMonths(row.ordered, filters);
  if (view === 'monthFilled') return !row.open && inMonths(row.ordered, filters);
  return true;
}

async function listPurchasingLines(filters) {
  const rows = await loadRows();
  const cutoff = cutoffFor(filters.months);
  const needle = text(filters.q).toLowerCase();
  let matched = rows.filter((row) => matches(row, filters, cutoff));
  if (needle) {
    matched = matched.filter((row) =>
      [row.poNumber, row.vendor, row.buyer, row.item, row.description, row.project]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }
  matched.sort((a, b) => String(b.ordered).localeCompare(String(a.ordered)));
  return pageRows(matched, filters, (row, sort) => {
    if (sort === 'shortQty' || sort === 'qty') return row[sort];
    return row[sort];
  });
}

module.exports = { getPurchasingDashboard, listPurchasingLines };
