const DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BUCKETS = [
  { label: '0–7d', min: 0, max: 8 },
  { label: '8–14d', min: 8, max: 15 },
  { label: '15–30d', min: 15, max: 31 },
  { label: '31–60d', min: 31, max: 61 },
  { label: '61–90d', min: 61, max: 91 },
  { label: '91–180d', min: 91, max: 181 },
  { label: '180d+', min: 181, max: null },
];

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

function cutoffFor(months) {
  const count = Number(months);
  if (!count) return null;
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - count);
  return date.toISOString().slice(0, 10);
}

function inWindow(day, cutoff) {
  if (!cutoff) return true;
  return Boolean(day && day >= cutoff);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function pretty(value) {
  if (!value) return 'unknown';
  const [year, month, day] = value.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

function countText(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function histogram(values) {
  return BUCKETS.map((bucket) => ({
    ...bucket,
    count: values.filter((value) => {
      if (value == null) return false;
      const max = bucket.max == null ? Infinity : bucket.max;
      return value >= bucket.min && value < max;
    }).length,
  }));
}

function inBucket(value, extra) {
  if (value == null) return false;
  const min = Number(extra.min ?? 0);
  const max = extra.max == null || extra.max === '' ? Infinity : Number(extra.max);
  return value >= min && value < max;
}

function inMonths(day, extra) {
  const months = [];
  if (extra.entryMonth) months.push(extra.entryMonth);
  if (extra.entryMonths) months.push(...String(extra.entryMonths).split(',').filter(Boolean));
  if (!months.length) return Boolean(day);
  return months.includes(String(day || '').slice(0, 7));
}

function countTrends(rows, dayKey, flags) {
  const map = new Map();
  rows.forEach((row) => {
    const day = row[dayKey];
    if (!day) return;
    const month = String(day).slice(0, 7);
    let item = map.get(month);
    if (!item) {
      item = { month };
      flags.forEach((flag) => {
        item[flag.key] = flag.set ? new Set() : 0;
      });
      map.set(month, item);
    }
    flags.forEach((flag) => {
      if (flag.set) {
        const value = flag.set(row);
        if (value) item[flag.key].add(value);
      } else if (flag.sum) item[flag.key] += flag.sum(row) || 0;
      else if (!flag.when || flag.when(row)) item[flag.key] += 1;
    });
  });
  return [...map.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((item) => {
      const out = { month: item.month };
      flags.forEach((flag) => {
        out[flag.key] = flag.set ? item[flag.key].size : item[flag.key];
      });
      return out;
    });
}

function monthlyOf(rows, dayKey, openKey) {
  const map = new Map();
  rows.forEach((row) => {
    if (!row[dayKey]) return;
    const month = row[dayKey].slice(0, 7);
    const item = map.get(month) || { month, arrived: 0, completed: 0, remaining: 0 };
    item.arrived += 1;
    if (row[openKey]) item.remaining += 1;
    else item.completed += 1;
    map.set(month, item);
  });
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function topCount(rows, key, limit = 8, extra) {
  const map = new Map();
  rows.forEach((row) => {
    const name = row[key];
    if (!name || name === '(none)') return;
    const group = map.get(name) || { name, count: 0, qty: 0, value: 0 };
    group.count += 1;
    if (extra) extra(group, row);
    map.set(name, group);
  });
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function pageRows(rows, filters, sortValue) {
  const sort = filters.sort || '';
  const dir = filters.dir === 'asc' ? 1 : -1;
  const sorted = sort
    ? [...rows].sort((a, b) => {
      const left = sortValue(a, sort);
      const right = sortValue(b, sort);
      if (left == null && right == null) return 0;
      if (left == null) return 1;
      if (right == null) return -1;
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * dir;
      return String(left).localeCompare(String(right)) * dir;
    })
    : rows;
  const pageSize = Math.min(Math.max(Number(filters.pageSize) || 40, 1), 100);
  const pages = Math.max(Math.ceil(sorted.length / pageSize), 1);
  const page = Math.min(Math.max(Number(filters.page) || 1, 1), pages);
  const start = (page - 1) * pageSize;
  return { total: sorted.length, page, pages, rows: sorted.slice(start, start + pageSize) };
}

module.exports = {
  realDate,
  iso,
  spanDays,
  median,
  round1,
  text,
  number,
  cutoffFor,
  inWindow,
  todayIso,
  pretty,
  countText,
  histogram,
  inBucket,
  inMonths,
  monthlyOf,
  countTrends,
  topCount,
  pageRows,
};
