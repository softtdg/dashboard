const { connectDB } = require('../db/conn');
const {
  realDate, iso, text, number, cutoffFor, inWindow, todayIso, pretty,
  countText, inMonths, monthlyOf, countTrends, topCount, pageRows,
} = require('./analyticsUtil');

const CACHE_MS = 60 * 1000;
let cache = null;
let loading = null;

async function loadRows() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  if (loading) return loading;
  loading = (async () => {
    const db = await connectDB();
    if (!db.BOMs) throw new Error('Sales orders are not connected');
    const docs = await db.BOMs.collection('sales_orders')
      .find({}, { projection: { lines: 0, comments: 0, memo: 0 } })
      .toArray();
    const today = todayIso();
    const rows = [];
    let before2015 = 0;
    docs.forEach((doc) => {
      const ordered = realDate(doc.date);
      if (!ordered) {
        if (doc.date && String(doc.date) < '2015-01-01') before2015 += 1;
        return;
      }
      const odd = realDate(doc.ODD);
      const open = String(doc.status || '').toLowerCase() === 'open';
      rows.push({
        id: String(doc._id),
        sop: text(doc.SOP),
        ordered: iso(ordered),
        odd: iso(odd),
        customer: text(doc.customer) || '(none)',
        project: text(doc.tdgProject) || '(none)',
        po: text(doc.po),
        currency: text(doc.currency) || '(none)',
        status: open ? 'Open' : 'Closed',
        total: number(doc.total),
        openBalance: open ? number(doc.openBalance) : 0,
        open,
        late: open && iso(odd) != null && iso(odd) < today,
      });
    });
    cache = { at: Date.now(), rows, before2015 };
    loading = null;
    return cache;
  })().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

function scoped(rows, filters, cutoff) {
  return rows.filter((row) => {
    if (filters.customer && row.customer !== filters.customer) return false;
    if (filters.project && row.project !== filters.project) return false;
    if (filters.currency && row.currency !== filters.currency) return false;
    return inWindow(row.ordered, cutoff);
  });
}

async function getSalesDashboard(filters) {
  const loaded = await loadRows();
  const cutoff = cutoffFor(filters.months);
  const rows = scoped(loaded.rows, filters, cutoff);
  const history = scoped(loaded.rows, filters, null);
  const open = rows.filter((row) => row.open);
  const late = rows.filter((row) => row.late);
  const balance = open.reduce((sum, row) => sum + row.openBalance, 0);
  const booked = rows.reduce((sum, row) => sum + row.total, 0);
  const dates = history.map((row) => row.ordered).sort();
  const top = topCount(open, 'customer', 1, (group, row) => { group.value += row.openBalance; });
  const currencies = [...new Set(rows.map((row) => row.currency))];
  return {
    kpis: {
      orders: rows.length,
      open: open.length,
      closed: rows.length - open.length,
      late: late.length,
      balance: Math.round(balance),
      booked: Math.round(booked),
      customers: new Set(rows.map((row) => row.customer)).size,
    },
    trends: countTrends(rows, 'ordered', [
      { key: 'orders' },
      { key: 'open', when: (row) => row.open },
      { key: 'closed', when: (row) => !row.open },
      { key: 'late', when: (row) => row.late },
      { key: 'customers', set: (row) => row.customer },
    ]),
    monthly: monthlyOf(history, 'ordered', 'open'),
    all: {
      arrived: history.length,
      completed: history.filter((row) => !row.open).length,
      remaining: history.filter((row) => row.open).length,
    },
    customers: topCount(open, 'customer', 8, (group, row) => { group.value += row.openBalance; })
      .map((row) => ({ ...row, value: Math.round(row.value) })),
    projects: topCount(open, 'project', 8, (group, row) => { group.value += row.openBalance; })
      .map((row) => ({ ...row, value: Math.round(row.value) })),
    options: {
      customers: [...new Set(loaded.rows.map((row) => row.customer))].sort(),
      projects: [...new Set(loaded.rows.map((row) => row.project))].filter((name) => name !== '(none)').sort(),
      currencies: [...new Set(loaded.rows.map((row) => row.currency))].sort(),
    },
    findings: [
      `Sales orders in view run from ${pretty(dates[0])} to ${pretty(dates.at(-1))}. ${countText(loaded.before2015)} orders dated before 2015 stay outside this page.`,
      `${countText(open.length)} orders are still open, with ${countText(Math.round(balance))} still to invoice. ${countText(late.length)} are already past the promised date.`,
      currencies.length > 1
        ? `Amounts are stored in ${currencies.join(', ')} and added as recorded.`
        : `Amounts are in ${currencies[0] || 'the stored currency'}.`,
      top[0] ? `${top[0].name} has the most open orders: ${countText(top[0].count)}.` : 'No open orders in this window.',
    ],
  };
}

function matches(row, filters, cutoff) {
  if (filters.customer && row.customer !== filters.customer) return false;
  if (filters.project && row.project !== filters.project) return false;
  if (filters.currency && row.currency !== filters.currency) return false;
  const view = filters.view || 'orders';
  const skip = view.startsWith('month') || view.startsWith('all');
  if (!skip && !inWindow(row.ordered, cutoff)) return false;
  if (view === 'open' || view === 'allOpen') return row.open;
  if (view === 'closed' || view === 'allClosed') return !row.open;
  if (view === 'late') return row.late;
  if (view === 'monthOrders') return inMonths(row.ordered, filters);
  if (view === 'monthOpen') return row.open && inMonths(row.ordered, filters);
  if (view === 'monthClosed') return !row.open && inMonths(row.ordered, filters);
  return true;
}

async function listSalesOrders(filters) {
  const loaded = await loadRows();
  const cutoff = cutoffFor(filters.months);
  const needle = text(filters.q).toLowerCase();
  let rows = loaded.rows.filter((row) => matches(row, filters, cutoff));
  if (needle) {
    rows = rows.filter((row) =>
      [row.sop, row.customer, row.project, row.po].join(' ').toLowerCase().includes(needle),
    );
  }
  rows.sort((a, b) => String(b.ordered).localeCompare(String(a.ordered)));
  return pageRows(rows, filters, (row, sort) => {
    if (sort === 'total' || sort === 'openBalance') return row[sort];
    return row[sort];
  });
}

module.exports = { getSalesDashboard, listSalesOrders };
