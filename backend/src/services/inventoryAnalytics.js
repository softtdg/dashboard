const { connectDB } = require('../db/conn');
const { text, number, countText, topCount, pageRows } = require('./analyticsUtil');

const CACHE_MS = 60 * 1000;
let cache = null;
let loading = null;

async function loadRows() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  if (loading) return loading;
  loading = (async () => {
    const db = await connectDB();
    if (!db.BOMs) throw new Error('Inventory is not connected');
    const docs = await db.BOMs.collection('inventory').find({ fileType: { $in: ['CAN', 'USA'] } }).toArray();
    const rows = docs.map((doc) => {
      const qty = number(doc.qty);
      const unitPrice = number(doc.unitPrice);
      return {
        id: String(doc._id),
        region: text(doc.fileType).toUpperCase() === 'USA' ? 'USA' : 'Canada',
        part: text(doc.TDGPN || doc.partNo),
        description: text(doc.description || doc.name),
        location: text(doc.location) || '(none)',
        category: text(doc.category) || '(none)',
        uom: text(doc.uom),
        qty,
        unitPrice,
        value: qty * unitPrice,
        zero: qty <= 0,
      };
    });
    cache = { at: Date.now(), rows };
    loading = null;
    return rows;
  })().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

function regionOf(filters) {
  const value = text(filters.region).toLowerCase();
  if (value === 'usa') return 'USA';
  if (value === 'canada' || value === 'can') return 'Canada';
  return 'ALL';
}

function scoped(rows, filters) {
  const region = regionOf(filters);
  return rows.filter((row) => {
    if (region !== 'ALL' && row.region !== region) return false;
    if (filters.location && row.location !== filters.location) return false;
    if (filters.category && row.category !== filters.category) return false;
    return true;
  });
}

async function getInventoryDashboard(filters) {
  const rows = scoped(await loadRows(), filters);
  const stocked = rows.filter((row) => !row.zero);
  const qty = stocked.reduce((sum, row) => sum + row.qty, 0);
  const value = stocked.reduce((sum, row) => sum + row.value, 0);
  const locationMap = new Map();
  stocked.forEach((row) => {
    const group = locationMap.get(row.location) || { name: row.location, count: 0, qty: 0 };
    group.count += 1;
    group.qty += row.qty;
    locationMap.set(row.location, group);
  });
  const locations = [...locationMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 8);
  const topLocation = locations[0];
  return {
    kpis: {
      parts: rows.length,
      stocked: stocked.length,
      zero: rows.length - stocked.length,
      qty: Math.round(qty),
      value: Math.round(value),
      locations: new Set(stocked.map((row) => row.location)).size,
    },
    locations: locations
      .map((row) => ({ ...row, qty: Math.round(row.qty) }))
      .sort((a, b) => b.qty - a.qty),
    parts: [...stocked].sort((a, b) => b.qty - a.qty).slice(0, 8).map((row) => ({
      name: row.part || row.description || '(none)',
      count: Math.round(row.qty),
      value: Math.round(row.value),
      location: row.location,
    })),
    categories: topCount(rows, 'category', 8),
    options: {
      locations: [...new Set(rows.map((row) => row.location))].sort(),
      categories: [...new Set(rows.map((row) => row.category))].filter((name) => name !== '(none)').sort(),
    },
    findings: findingsFor(regionOf(filters), rows, stocked, qty, value, topLocation),
  };
}

function findingsFor(region, rows, stocked, qty, value, topLocation) {
  const intro = region === 'USA'
    ? 'This is the USA stock file. Part number, location, and quantity are blank on these rows, so the stored breakdown is category.'
    : region === 'Canada'
      ? 'This is the current Canada stock file. Quantity is the on-hand count in that file.'
      : 'Canada and USA are both included. Canada rows carry quantity. USA rows have category only, so they add to the part count and not to pieces on hand.';
  return [
    intro,
    `${countText(rows.length - stocked.length)} of ${countText(rows.length)} parts have nothing on hand. ${countText(Math.round(qty))} pieces are in stock.`,
    `On-hand value at the stored unit price is ${countText(Math.round(value))}.`,
    topLocation ? `${topLocation.name} holds the most pieces: ${countText(Math.round(topLocation.qty))}.` : 'No stocked location in this cut.',
  ];
}

function matches(row, filters) {
  const region = regionOf(filters);
  if (region !== 'ALL' && row.region !== region) return false;
  if (filters.location && row.location !== filters.location) return false;
  if (filters.category && row.category !== filters.category) return false;
  if (filters.part && row.part !== filters.part) return false;
  const view = filters.view || 'parts';
  if (view === 'zero') return row.zero;
  if (view === 'stocked') return !row.zero;
  return true;
}

async function listInventoryParts(filters) {
  const rows = await loadRows();
  const needle = text(filters.q).toLowerCase();
  let matched = rows.filter((row) => matches(row, filters));
  if (needle) {
    matched = matched.filter((row) =>
      [row.part, row.description, row.location, row.category, row.region].join(' ').toLowerCase().includes(needle),
    );
  }
  matched.sort((a, b) => b.qty - a.qty);
  return pageRows(matched, filters, (row, sort) => {
    if (sort === 'qty' || sort === 'value') return row[sort];
    return row[sort];
  });
}

module.exports = { getInventoryDashboard, listInventoryParts };
