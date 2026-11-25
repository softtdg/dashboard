const { query } = require('../db/mssqlPool');
const { countTrends } = require('./analyticsUtil');

const DAY = 86400000;
const CACHE_MS = 60 * 1000;
const BUCKETS = [
  { label: '0–7d', min: 0, max: 8 },
  { label: '8–14d', min: 8, max: 15 },
  { label: '15–30d', min: 15, max: 31 },
  { label: '31–60d', min: 31, max: 61 },
  { label: '61–90d', min: 61, max: 91 },
  { label: '91–180d', min: 91, max: 181 },
  { label: '180d+', min: 181, max: null },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let cache = null;
let loading = null;

function realDate(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  if (year < 2015 || year > 2100) return null;
  return date;
}

function iso(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function spanDays(start, end) {
  if (!start || !end) return null;
  const days = Math.round(
    (Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) -
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())) /
      DAY,
  );
  return days < 0 ? null : days;
}

function median(values) {
  const sorted = values.filter((value) => value != null).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round1(value) {
  return value == null ? null : Math.round(value * 10) / 10;
}

function text(value) {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
  return clean && clean !== '.' ? clean : '';
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pretty(value) {
  if (!value) return 'unknown';
  const [year, month, day] = value.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

function countText(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function cutoffFor(months) {
  const count = Number(months);
  if (!count) return null;
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - count);
  return date.toISOString().slice(0, 10);
}

function inWindow(row, cutoff) {
  if (!cutoff) return true;
  return Boolean(row.logged && row.logged >= cutoff);
}

function dispositionOf(row) {
  const ranked = [
    ['Repair', row.repairQty],
    ['Warranty', row.warrantyQty],
    ['Accommodation', row.accomQty],
  ].sort((a, b) => b[1] - a[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : 'Unclassified';
}

function histogram(rows, pick) {
  return BUCKETS.map((bucket) => ({
    ...bucket,
    count: rows.filter((row) => {
      const value = pick(row);
      if (value == null) return false;
      const max = bucket.max == null ? Infinity : bucket.max;
      return value >= bucket.min && value < max;
    }).length,
  }));
}

function topGroups(rows, key, limit = 8) {
  const map = new Map();
  rows.forEach((row) => {
    const name = row[key];
    if (!name) return;
    const group = map.get(name) || { name, count: 0, repairQty: 0, receiveDays: [] };
    group.count += 1;
    group.repairQty += row.repairQty;
    if (row.receiveDays != null) group.receiveDays.push(row.receiveDays);
    map.set(name, group);
  });
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((group) => ({
      name: group.name,
      count: group.count,
      repairQty: group.repairQty,
      medianReceive: round1(median(group.receiveDays)),
    }));
}

async function loadRows() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  if (loading) return loading;
  loading = query(
    'qa',
    `
    SELECT
      r.RMALogEntryId AS id,
      r.RMADate,
      r.RMANumber,
      r.CustomerNCRNumber,
      r.TotalQuantity,
      r.CustomerAccomodationQuantity,
      r.WarrantyQuantity,
      r.RepairQuantity,
      r.CustomerPN,
      r.SerialNumbers,
      r.CustomerDefectDescription,
      r.PartsReceivedOn,
      r.TDGDefectDescription,
      r.PackingSlipNumber,
      ISNULL(NULLIF(LTRIM(RTRIM(d.DefectCodeDescription)), ''), 'None') AS defect,
      ISNULL(NULLIF(LTRIM(RTRIM(c.Name)), ''), '') AS customer
    FROM RMALogEntries r
    LEFT JOIN DefectCodes d ON r.DefectCodeId = d.DefectCodeId
    LEFT JOIN QACustomers c ON r.CustomerQACustomerId = c.QACustomerId
    `,
  )
    .then((records) => {
      const rows = records.map((record) => {
        const loggedOn = realDate(record.RMADate);
        const receivedOn = realDate(record.PartsReceivedOn);
        const row = {
          id: record.id,
          rmaNumber: text(record.RMANumber),
          logged: iso(loggedOn),
          received: iso(receivedOn),
          receiveDays: spanDays(loggedOn, receivedOn),
          customer: text(record.customer) || '(none)',
          defect: text(record.defect) || 'None',
          customerPn: text(record.CustomerPN),
          ncr: text(record.CustomerNCRNumber),
          totalQty: number(record.TotalQuantity),
          accomQty: number(record.CustomerAccomodationQuantity),
          warrantyQty: number(record.WarrantyQuantity),
          repairQty: number(record.RepairQuantity),
          serials: text(record.SerialNumbers),
          customerDefect: text(record.CustomerDefectDescription),
          tdgDefect: text(record.TDGDefectDescription),
          packingSlip: text(record.PackingSlipNumber),
        };
        row.disposition = dispositionOf(row);
        row.waiting = !row.received;
        return row;
      }).filter((row) => row.logged);
      cache = { at: Date.now(), rows };
      loading = null;
      return rows;
    })
    .catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}

function sums(rows) {
  return rows.reduce(
    (sum, row) => ({
      repairQty: sum.repairQty + row.repairQty,
      warrantyQty: sum.warrantyQty + row.warrantyQty,
      accomQty: sum.accomQty + row.accomQty,
      repairLines: sum.repairLines + (row.repairQty > 0 ? 1 : 0),
      warrantyLines: sum.warrantyLines + (row.warrantyQty > 0 ? 1 : 0),
      accomLines: sum.accomLines + (row.accomQty > 0 ? 1 : 0),
    }),
    { repairQty: 0, warrantyQty: 0, accomQty: 0, repairLines: 0, warrantyLines: 0, accomLines: 0 },
  );
}

function monthlyOf(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const month = row.logged.slice(0, 7);
    const item = map.get(month) || { month, arrived: 0, completed: 0, remaining: 0 };
    item.arrived += 1;
    if (row.waiting) item.remaining += 1;
    else item.completed += 1;
    map.set(month, item);
  });
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function findingsFor(rows, allRows) {
  const first = allRows[0]?.logged;
  const last = allRows[allRows.length - 1]?.logged;
  const named = rows.filter((row) => row.defect !== 'None');
  const blank = rows.length - named.length;
  const codes = topGroups(named, 'defect', 1);
  const customers = topGroups(rows, 'customer', 1);
  const repairMedian = median(rows.filter((row) => row.disposition === 'Repair').map((row) => row.receiveDays));
  const warrantyMedian = median(rows.filter((row) => row.disposition === 'Warranty').map((row) => row.receiveDays));
  const waiting = rows.filter((row) => row.waiting).length;
  const lines = [];
  lines.push(
    `The RMA log runs from ${pretty(first)} to ${pretty(last)}. Nothing is logged after that, so a short window only shows the end of the log.`,
  );
  if (!rows.length) {
    lines.push('This window has no RMAs. Open All since 2015 to see the log.');
    return lines;
  }
  if (codes[0]) {
    lines.push(
      `${countText(blank)} of ${countText(rows.length)} returns in this window are coded None. Among named codes, ${codes[0].name} is the largest: ${countText(codes[0].count)}.`,
    );
  }
  lines.push(
    `Parts come back in a median of ${round1(median(rows.map((row) => row.receiveDays))) ?? '—'} days. ${countText(waiting)} returns still have no usable receive date.`,
  );
  if (repairMedian != null && warrantyMedian != null) {
    lines.push(
      `Repair returns come back in a median of ${round1(repairMedian)} days, warranty returns in ${round1(warrantyMedian)} days.`,
    );
  }
  if (customers[0]) {
    lines.push(
      `${customers[0].name} has the most returns in this window: ${countText(customers[0].count)}.`,
    );
  }
  return lines;
}

async function getRmaDashboard(filters) {
  const allRows = [...(await loadRows())].sort((a, b) => a.logged.localeCompare(b.logged));
  const cutoff = cutoffFor(filters.months);
  const rows = allRows.filter((row) => {
    if (filters.customer && row.customer !== filters.customer) return false;
    if (filters.defect && row.defect !== filters.defect) return false;
    return inWindow(row, cutoff);
  });
  const scopedAll = allRows.filter((row) => {
    if (filters.customer && row.customer !== filters.customer) return false;
    if (filters.defect && row.defect !== filters.defect) return false;
    return true;
  });
  const qty = sums(rows);
  const received = rows.filter((row) => !row.waiting);
  const dispositionOrder = ['Repair', 'Warranty', 'Accommodation', 'Unclassified'];
  return {
    kpis: {
      total: rows.length,
      received: received.length,
      waiting: rows.length - received.length,
      medianReceive: round1(median(rows.map((row) => row.receiveDays))),
      named: rows.filter((row) => row.defect !== 'None').length,
      blank: rows.filter((row) => row.defect === 'None').length,
      medianRepair: round1(median(rows.filter((row) => row.disposition === 'Repair').map((row) => row.receiveDays))),
      medianWarranty: round1(median(rows.filter((row) => row.disposition === 'Warranty').map((row) => row.receiveDays))),
      repairCount: rows.filter((row) => row.disposition === 'Repair').length,
      warrantyCount: rows.filter((row) => row.disposition === 'Warranty').length,
      accomCount: rows.filter((row) => row.disposition === 'Accommodation').length,
      ...qty,
    },
    trends: countTrends(rows, 'logged', [
      { key: 'total' },
      { key: 'received', when: (row) => !row.waiting },
      { key: 'waiting', when: (row) => row.waiting },
      { key: 'named', when: (row) => row.defect !== 'None' },
      { key: 'blank', when: (row) => row.defect === 'None' },
      { key: 'repair', when: (row) => row.disposition === 'Repair' },
      { key: 'warranty', when: (row) => row.disposition === 'Warranty' },
      { key: 'accom', when: (row) => row.disposition === 'Accommodation' },
    ]),
    histogram: histogram(received, (row) => row.receiveDays),
    disposition: dispositionOrder
      .map((label) => ({ label, count: rows.filter((row) => row.disposition === label).length }))
      .filter((item) => item.count > 0),
    monthly: monthlyOf(scopedAll),
    all: {
      arrived: scopedAll.length,
      completed: scopedAll.filter((row) => !row.waiting).length,
      remaining: scopedAll.filter((row) => row.waiting).length,
    },
    customers: topGroups(rows, 'customer'),
    defects: topGroups(rows.filter((row) => row.defect !== 'None'), 'defect'),
    parts: topGroups(rows, 'customerPn'),
    options: {
      customers: [...new Set(allRows.map((row) => row.customer))].sort((a, b) => a.localeCompare(b)),
      defects: [...new Set(allRows.map((row) => row.defect))].sort((a, b) => a.localeCompare(b)),
    },
    findings: findingsFor(rows, scopedAll),
  };
}

function inMonths(logged, extra) {
  const months = [];
  if (extra.entryMonth) months.push(extra.entryMonth);
  if (extra.entryMonths) months.push(...String(extra.entryMonths).split(',').filter(Boolean));
  if (!months.length) return Boolean(logged);
  return months.includes(String(logged || '').slice(0, 7));
}

function inBucket(value, extra) {
  if (value == null) return false;
  const min = Number(extra.min ?? 0);
  const max = extra.max == null || extra.max === '' ? Infinity : Number(extra.max);
  return value >= min && value < max;
}

function matches(row, filters, cutoff) {
  if (filters.customer && row.customer !== filters.customer) return false;
  if (filters.defect && row.defect !== filters.defect) return false;
  if (filters.part && row.customerPn !== filters.part) return false;
  if (filters.item && row.disposition !== filters.item) return false;
  const view = filters.view || 'window';
  const monthViews = ['monthLogged', 'monthReceived', 'monthWaiting', 'all', 'allReceived', 'allWaiting'];
  if (!monthViews.includes(view) && !inWindow(row, cutoff)) return false;
  switch (view) {
    case 'received':
    case 'allReceived':
      return !row.waiting;
    case 'waiting':
    case 'allWaiting':
      return row.waiting;
    case 'named':
      return row.defect !== 'None';
    case 'blank':
      return row.defect === 'None';
    case 'receiveBucket':
      return !row.waiting && inBucket(row.receiveDays, filters);
    case 'monthLogged':
      return inMonths(row.logged, filters);
    case 'monthReceived':
      return inMonths(row.logged, filters) && !row.waiting;
    case 'monthWaiting':
      return inMonths(row.logged, filters) && row.waiting;
    default:
      return true;
  }
}

function sortRows(rows, sort, dir) {
  const factor = dir === 'asc' ? 1 : -1;
  const valueOf = (row) => {
    if (sort === 'part') return row.customerPn;
    if (sort === 'qty') return row.totalQty;
    if (sort === 'receiveDays') return row.receiveDays;
    if (sort === 'logged') return row.logged;
    return row[sort];
  };
  return [...rows].sort((a, b) => {
    const left = valueOf(a);
    const right = valueOf(b);
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
    return String(left).localeCompare(String(right)) * factor;
  });
}

async function listRmaLines(filters) {
  const rows = await loadRows();
  const cutoff = cutoffFor(filters.months);
  const needle = text(filters.q).toLowerCase();
  let matched = rows.filter((row) => matches(row, filters, cutoff));
  if (needle) {
    matched = matched.filter((row) =>
      [row.rmaNumber, row.customer, row.customerPn, row.defect, row.ncr, row.tdgDefect]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }
  const sort = filters.sort || 'logged';
  const dir = filters.dir || 'desc';
  matched = sortRows(matched, sort, dir);
  const pageSize = Math.min(Math.max(Number(filters.pageSize) || 40, 1), 100);
  const pages = Math.max(Math.ceil(matched.length / pageSize), 1);
  const page = Math.min(Math.max(Number(filters.page) || 1, 1), pages);
  const start = (page - 1) * pageSize;
  return {
    total: matched.length,
    page,
    pages,
    rows: matched.slice(start, start + pageSize),
  };
}

module.exports = { getRmaDashboard, listRmaLines };
