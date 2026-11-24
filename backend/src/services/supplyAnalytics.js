const { query } = require('../db/mssqlPool');

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

let lineCache = null;
let lineLoading = null;
let purchaseCache = null;
let purchaseLoading = null;

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

function norm(value) {
  return text(value).replace(/^#/, '').toUpperCase();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cutoffFor(months) {
  const count = Number(months);
  if (!count) return null;
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - count);
  return date.toISOString().slice(0, 10);
}

function inWindow(line, cutoff) {
  if (!cutoff || line.open) return true;
  return Boolean(
    (line.noticed && line.noticed >= cutoff) ||
      (line.closed && line.closed >= cutoff),
  );
}

function inBucket(value, bucket) {
  if (value == null) return false;
  const max = bucket.max == null ? Infinity : bucket.max;
  return value >= bucket.min && value < max;
}

async function loadCatalog() {
  try {
    const rows = await query('design', 'SELECT TDGPN, Description, Vendor FROM MasterList');
    const map = new Map();
    for (const row of rows) {
      const key = norm(row.TDGPN);
      if (!key || map.has(key)) continue;
      map.set(key, { description: text(row.Description), vendor: text(row.Vendor) });
    }
    return map;
  } catch (error) {
    console.error('Master list lookup failed:', error.message);
    return new Map();
  }
}

async function loadLines(today) {
  const [rows, catalog] = await Promise.all([
    query('sop', `
      SELECT
        b.SOPBackorderEntryId,
        b.TDGPN,
        b.UOM,
        b.Quantity,
        b.Received,
        b.RootCause,
        b.NoticeDate,
        b.ClosedDate,
        e.FixtureNumber,
        s.SOPId,
        s.SOPNum,
        s.PONum,
        c.Name AS CustomerName,
        pr.Name AS ProgramName,
        l.Location AS LocationName,
        lh.LeadHandName
      FROM SOPBackorderEntries b
      INNER JOIN SOPLeadHandEntries e ON e.SOPLeadHandEntryId = b.SOPLeadHandEntryId
      INNER JOIN SOPs s ON s.SOPId = e.SOPId
      LEFT JOIN SOPCustomers c ON s.SOPCustomerId = c.SOPCustomerId
      LEFT JOIN SOPPrograms pr ON s.SOPProgramId = pr.SOPProgramId
      LEFT JOIN SOPLocations l ON s.SOPLocationId = l.SOPLocationId
      LEFT JOIN SOPProductionEntries prod ON s.SOPProductionEntryId = prod.SOPProductionEntryId
      LEFT JOIN SOPLeadHands lh ON prod.SOPLeadHandId = lh.SOPLeadHandId
      WHERE ISNULL(e.Disabled, 0) = 0
        AND ISNULL(s.ExcludeFromTracker, 0) = 0
        AND UPPER(LTRIM(RTRIM(ISNULL(s.SOPNum, '')))) <> 'CANCELLED'
    `),
    loadCatalog(),
  ]);

  return rows.map((row) => {
    const qty = number(row.Quantity);
    const received = row.Received == null ? null : number(row.Received);
    const open = received == null || received < qty;
    const noticed = realDate(row.NoticeDate);
    const closed = realDate(row.ClosedDate);
    const part = norm(row.TDGPN);
    const info = catalog.get(part) || { description: '', vendor: '' };
    return {
      id: row.SOPBackorderEntryId,
      part: part || '(no part)',
      description: info.description,
      vendor: info.vendor,
      uom: text(row.UOM),
      qty,
      received: received == null ? 0 : received,
      shortQty: open ? Math.max(0, qty - (received || 0)) : 0,
      open,
      noticed: iso(noticed),
      closed: open ? null : iso(closed),
      ageDays: open ? spanDays(noticed, today) : null,
      closeDays: open ? null : spanDays(noticed, closed),
      rootCause: text(row.RootCause),
      fixture: text(row.FixtureNumber),
      sopId: row.SOPId,
      sopNum: text(row.SOPNum),
      poNum: text(row.PONum),
      customer: text(row.CustomerName) || '(none)',
      program: text(row.ProgramName) || '(none)',
      leadHand: text(row.LeadHandName) || '(none)',
      location: text(row.LocationName) || '(none)',
    };
  });
}

async function getLines() {
  if (lineCache && Date.now() - lineCache.at < CACHE_MS) return lineCache.lines;
  if (!lineLoading) {
    lineLoading = loadLines(new Date())
      .then((lines) => {
        lineCache = { at: Date.now(), lines };
        return lines;
      })
      .finally(() => {
        lineLoading = null;
      });
  }
  return lineLoading;
}

async function loadPurchases(today) {
  const rows = await query('purchasing', `
    SELECT
      PurchasingOrderId, Quantity, Received, DateAdded, ODD,
      Item, Description, Number, SourceName, UOM, Company
    FROM PurchasingOrders
    WHERE ISNULL(Disabled, 0) = 0
  `);
  return rows.map((row) => {
    const qty = number(row.Quantity);
    const received = number(row.Received);
    const added = realDate(row.DateAdded);
    const odd = realDate(row.ODD);
    const shortQty = Math.max(0, qty - received);
    return {
      id: row.PurchasingOrderId,
      item: norm(row.Item) || '(no item)',
      description: text(row.Description),
      poNumber: text(row.Number),
      vendor: text(row.SourceName) || '(none)',
      company: text(row.Company) || '(none)',
      uom: text(row.UOM),
      qty,
      received,
      shortQty,
      added: iso(added),
      odd: iso(odd),
      ageDays: spanDays(added, today),
      lateDays: odd && odd < today ? spanDays(odd, today) : null,
    };
  });
}

async function getPurchases() {
  if (purchaseCache && Date.now() - purchaseCache.at < CACHE_MS) return purchaseCache.lines;
  if (!purchaseLoading) {
    purchaseLoading = loadPurchases(new Date())
      .then((lines) => {
        purchaseCache = { at: Date.now(), lines };
        return lines;
      })
      .finally(() => {
        purchaseLoading = null;
      });
  }
  return purchaseLoading;
}

function applyLineScope(lines, options, ignoreWindow) {
  const cutoff = ignoreWindow ? null : cutoffFor(options.months);
  const rows = lines.filter((line) => {
    if (!ignoreWindow && !inWindow(line, cutoff)) return false;
    if (options.customer && line.customer !== options.customer) return false;
    if (options.program && line.program !== options.program) return false;
    if (options.leadHand && line.leadHand !== options.leadHand) return false;
    if (options.location && line.location !== options.location) return false;
    if (options.part && line.part !== options.part) return false;
    return true;
  });
  return { cutoff, rows };
}

function names(lines, key) {
  return [...new Set(lines.map((line) => line[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function rankLines(lines, key) {
  const groups = new Map();
  for (const line of lines) {
    const name = line[key] || '(none)';
    const group = groups.get(name) || { name, open: 0, closed: 0, shortQty: 0, ages: [], closes: [] };
    if (line.open) {
      group.open += 1;
      group.shortQty += line.shortQty;
      if (line.ageDays != null) group.ages.push(line.ageDays);
    } else {
      group.closed += 1;
      if (line.closeDays != null) group.closes.push(line.closeDays);
    }
    groups.set(name, group);
  }
  return [...groups.values()]
    .map((group) => ({
      name: group.name,
      open: group.open,
      closed: group.closed,
      shortQty: Math.round(group.shortQty),
      medianOpen: round1(median(group.ages)),
      medianClose: round1(median(group.closes)),
    }))
    .sort((a, b) => b.open - a.open || (b.medianOpen || 0) - (a.medianOpen || 0) || b.closed - a.closed);
}

function buildMonthly(lines) {
  const map = new Map();
  for (const line of lines) {
    if (!line.noticed) continue;
    const month = line.noticed.slice(0, 7);
    const row = map.get(month) || { month, arrived: 0, completed: 0, remaining: 0 };
    row.arrived += 1;
    if (line.open) row.remaining += 1;
    else row.completed += 1;
    map.set(month, row);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function bucketFrom(extra) {
  const max = extra.max == null || extra.max === '' ? null : Number(extra.max);
  return { min: Number(extra.min ?? 0), max: Number.isFinite(max) ? max : null };
}

function matchesLine(line, view, extra) {
  switch (view) {
    case 'open':
      return line.open;
    case 'closed':
      return !line.open;
    case 'stuck':
      return line.open && (line.ageDays || 0) > 30;
    case 'closeBucket':
      return !line.open && inBucket(line.closeDays, bucketFrom(extra));
    case 'ageBucket':
      return line.open && inBucket(line.ageDays, bucketFrom(extra));
    case 'monthArrived':
      return inMonths(line.noticed, extra);
    case 'monthClosed':
      return inMonths(line.noticed, extra) && !line.open;
    case 'monthOpen':
      return inMonths(line.noticed, extra) && line.open;
    default:
      return true;
  }
}

function inMonths(date, extra) {
  if (!date) return false;
  const months = [];
  if (extra.entryMonth) months.push(extra.entryMonth);
  if (extra.entryMonths) months.push(...String(extra.entryMonths).split(',').map((item) => item.trim()).filter(Boolean));
  if (!months.length) return true;
  return months.some((month) => date.startsWith(month));
}

function paginate(rows, options, searchKeys, fallbackSort) {
  const term = String(options.q || '').trim().toLowerCase();
  let matched = rows;
  if (term) {
    matched = rows.filter((row) => searchKeys.some((key) => String(row[key] || '').toLowerCase().includes(term)));
  }
  const sort = options.sort || fallbackSort;
  const dir = options.dir === 'asc' ? 1 : -1;
  matched = matched.slice().sort((a, b) => {
    const left = a[sort];
    const right = b[sort];
    const leftEmpty = left == null || left === '';
    const rightEmpty = right == null || right === '';
    if (leftEmpty && rightEmpty) return 0;
    if (leftEmpty) return 1;
    if (rightEmpty) return -1;
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * dir;
    return String(left).localeCompare(String(right)) * dir;
  });
  const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 40));
  const pages = Math.max(1, Math.ceil(matched.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number(options.page) || 1));
  return {
    total: matched.length,
    page,
    pages,
    pageSize,
    rows: matched.slice((page - 1) * pageSize, page * pageSize),
  };
}

async function getBackorderDashboard(options) {
  const lines = await getLines();
  const { cutoff, rows } = applyLineScope(lines, options, false);
  const open = rows.filter((line) => line.open);
  const closed = rows.filter((line) => !line.open && line.closeDays != null);
  const customers = rankLines(rows, 'customer').slice(0, 8);
  const parts = rankLines(rows, 'part').slice(0, 8);
  const monthly = buildMonthly(applyLineScope(lines, options, true).rows);
  const all = monthly.reduce(
    (sum, row) => ({
      arrived: sum.arrived + row.arrived,
      completed: sum.completed + row.completed,
      remaining: sum.remaining + row.remaining,
    }),
    { arrived: 0, completed: 0, remaining: 0 },
  );
  const kpis = {
    total: rows.length,
    open: open.length,
    closed: rows.length - open.length,
    stuck: open.filter((line) => (line.ageDays || 0) > 30).length,
    medianOpen: round1(median(open.map((line) => line.ageDays))),
    medianClose: round1(median(closed.map((line) => line.closeDays))),
    partsOpen: new Set(open.map((line) => line.part)).size,
    sopsOpen: new Set(open.map((line) => line.sopId)).size,
    qtyShort: Math.round(open.reduce((sum, line) => sum + line.shortQty, 0)),
  };
  const topCustomer = customers.find((row) => row.open > 0);
  const topPart = parts.find((row) => row.open > 0);
  const findings = [
    `Open backorders have been waiting ${kpis.medianOpen ?? '—'} days (median). Ones that already cleared took ${kpis.medianClose ?? '—'} days.`,
    topCustomer
      ? `${topCustomer.name} has the most open backorders: ${topCustomer.open} lines, ${topCustomer.shortQty} pieces still short, waiting ${topCustomer.medianOpen ?? '—'} days.`
      : 'No open backorder is left in this window.',
    topPart
      ? `${topPart.name} is the part on the most open backorders (${topPart.open}). Cleared lines for it took ${topPart.medianClose ?? '—'} days.`
      : 'No part is currently short in this window.',
    `${kpis.stuck} open backorders have already waited more than 30 days, across ${kpis.sopsOpen} SOPs.`,
  ];

  return {
    window: { months: cutoff ? Number(options.months) : 0, from: cutoff },
    kpis,
    all,
    findings,
    histogram: BUCKETS.map((bucket) => ({
      ...bucket,
      count: closed.filter((line) => inBucket(line.closeDays, bucket)).length,
    })),
    openAge: BUCKETS.map((bucket) => ({
      ...bucket,
      count: open.filter((line) => inBucket(line.ageDays, bucket)).length,
    })),
    monthly,
    customers,
    leadHands: rankLines(rows, 'leadHand').filter((row) => row.open > 0).slice(0, 8),
    parts,
    programs: rankLines(rows, 'program').filter((row) => row.open > 0).slice(0, 8),
    options: {
      customers: names(lines, 'customer'),
      programs: names(lines, 'program'),
      leadHands: names(lines, 'leadHand'),
      locations: names(lines, 'location'),
    },
  };
}

async function listBackorderLines(options) {
  const lines = await getLines();
  const monthView = ['monthArrived', 'monthClosed', 'monthOpen'].includes(options.view);
  const { cutoff, rows } = applyLineScope(lines, options, monthView);
  const matched = rows.filter((line) => matchesLine(line, options.view, options));
  const page = paginate(
    matched,
    options,
    ['part', 'description', 'sopNum', 'poNum', 'customer', 'program', 'leadHand', 'fixture', 'vendor'],
    options.view === 'closed' ? 'closeDays' : 'ageDays',
  );
  return { ...page, window: { from: cutoff } };
}

function partRows(lines) {
  const groups = new Map();
  for (const line of lines) {
    const group = groups.get(line.part) || {
      part: line.part,
      description: line.description,
      vendor: line.vendor,
      lines: 0,
      open: 0,
      closed: 0,
      shortQty: 0,
      ages: [],
      closes: [],
      sops: new Set(),
      customers: new Set(),
    };
    group.lines += 1;
    group.sops.add(line.sopId);
    group.customers.add(line.customer);
    if (!group.description && line.description) group.description = line.description;
    if (!group.vendor && line.vendor) group.vendor = line.vendor;
    if (line.open) {
      group.open += 1;
      group.shortQty += line.shortQty;
      if (line.ageDays != null) group.ages.push(line.ageDays);
    } else if (line.closeDays != null) {
      group.closed += 1;
      group.closes.push(line.closeDays);
    } else {
      group.closed += 1;
    }
    groups.set(line.part, group);
  }
  return [...groups.values()].map((group) => ({
    part: group.part,
    description: group.description,
    vendor: group.vendor,
    lines: group.lines,
    open: group.open,
    closed: group.closed,
    shortQty: Math.round(group.shortQty),
    medianOpen: round1(median(group.ages)),
    medianClose: round1(median(group.closes)),
    sops: group.sops.size,
    customers: group.customers.size,
  }));
}

function rankPurchases(lines, key) {
  const groups = new Map();
  for (const line of lines) {
    const name = line[key] || '(none)';
    const group = groups.get(name) || { name, lines: 0, shortQty: 0, ages: [], late: 0 };
    group.lines += 1;
    group.shortQty += line.shortQty;
    if (line.ageDays != null) group.ages.push(line.ageDays);
    if (line.lateDays) group.late += 1;
    groups.set(name, group);
  }
  return [...groups.values()]
    .map((group) => ({
      name: group.name,
      lines: group.lines,
      shortQty: Math.round(group.shortQty),
      medianAge: round1(median(group.ages)),
      late: group.late,
    }))
    .sort((a, b) => b.lines - a.lines || b.shortQty - a.shortQty);
}

async function getPartsDashboard(options) {
  const [lines, purchases] = await Promise.all([getLines(), getPurchases()]);
  const { rows } = applyLineScope(lines, options, false);
  const parts = partRows(rows);
  const openParts = parts.filter((part) => part.open > 0);
  const purchaseRows = purchases.filter((line) => !options.location || line.company === options.location);
  const byOpen = openParts.slice().sort((a, b) => b.open - a.open || b.shortQty - a.shortQty);
  const bySlow = parts
    .filter((part) => part.closed >= 3 && part.medianClose != null)
    .sort((a, b) => b.medianClose - a.medianClose);
  const byQty = openParts.slice().sort((a, b) => b.shortQty - a.shortQty);
  const kpis = {
    parts: parts.length,
    openParts: openParts.length,
    medianOpen: round1(median(rows.filter((line) => line.open).map((line) => line.ageDays))),
    medianClose: round1(median(rows.filter((line) => line.closeDays != null).map((line) => line.closeDays))),
    qtyShort: Math.round(openParts.reduce((sum, part) => sum + part.shortQty, 0)),
    poLines: purchaseRows.length,
    poQty: Math.round(purchaseRows.reduce((sum, line) => sum + line.shortQty, 0)),
    poLate: purchaseRows.filter((line) => line.lateDays).length,
    vendors: new Set(purchaseRows.map((line) => line.vendor)).size,
  };
  const slowest = bySlow[0];
  const busiest = byOpen[0];
  const findings = [
    `${kpis.openParts} parts are still short. A typical open shortage has waited ${kpis.medianOpen ?? '—'} days, and a cleared shortage took ${kpis.medianClose ?? '—'} days.`,
    busiest
      ? `${busiest.part} is short on the most backorders right now: ${busiest.open} lines, ${busiest.shortQty} pieces, across ${busiest.sops} SOPs.`
      : 'No part is currently short in this window.',
    slowest
      ? `${slowest.part} is the slowest part to clear, at ${slowest.medianClose} days median across ${slowest.closed} completed shortages.`
      : 'Not enough cleared shortages yet to rank how long a part takes.',
    `Purchasing still has ${kpis.poLines} lines marked open, ${kpis.poQty.toLocaleString()} pieces not received. ${kpis.poLate} are already past the promised date, including lines ordered years ago that were never closed.`,
  ];

  return {
    kpis,
    findings,
    mostOpen: byOpen.slice(0, 12),
    slowest: bySlow.slice(0, 8),
    mostQty: byQty.slice(0, 8),
    purchase: {
      vendors: rankPurchases(purchaseRows, 'vendor').slice(0, 8),
      items: rankPurchases(purchaseRows, 'item').slice(0, 8),
    },
    options: {
      customers: names(lines, 'customer'),
      programs: names(lines, 'program'),
      leadHands: names(lines, 'leadHand'),
      locations: names(lines, 'location'),
    },
  };
}

async function listPurchaseLines(options) {
  const purchases = await getPurchases();
  let rows = purchases.filter((line) => !options.location || line.company === options.location);
  if (options.vendor) rows = rows.filter((line) => line.vendor === options.vendor);
  if (options.item) rows = rows.filter((line) => line.item === options.item);
  if (options.view === 'late') rows = rows.filter((line) => line.lateDays);
  return paginate(
    rows,
    options,
    ['item', 'description', 'poNumber', 'vendor', 'company'],
    'ageDays',
  );
}

module.exports = {
  getBackorderDashboard,
  listBackorderLines,
  getPartsDashboard,
  listPurchaseLines,
};
