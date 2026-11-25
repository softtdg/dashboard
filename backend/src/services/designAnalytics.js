const { query } = require('../db/mssqlPool');
const {
  realDate, iso, spanDays, median, round1, text, cutoffFor, inWindow,
  countText, histogram, inBucket, inMonths, monthlyOf, countTrends, topCount, pageRows,
} = require('./analyticsUtil');

const CACHE_MS = 60 * 1000;
let cache = null;
let loading = null;

async function loadRows() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  if (loading) return loading;
  loading = Promise.all([
    query('design', `
      SELECT
        r.PartNumberRequestEntryId AS id,
        r.RequestTime,
        r.[User] AS requester,
        r.Customer AS customer,
        r.Project AS project,
        r.[Group] AS groupName,
        r.CommentsForAdmin AS comments,
        COUNT(c.PartNumberComponentEntryId) AS components,
        SUM(CASE WHEN YEAR(c.CompletedDate) BETWEEN 2015 AND 2100 THEN 1 ELSE 0 END) AS done,
        MAX(CASE WHEN YEAR(c.CompletedDate) BETWEEN 2015 AND 2100 THEN c.CompletedDate END) AS finished
      FROM PartNumberRequest r
      LEFT JOIN PartNumberRequestComponents c
        ON c.PartNumberRequestEntryId = r.PartNumberRequestEntryId
      GROUP BY r.PartNumberRequestEntryId, r.RequestTime, r.[User], r.Customer, r.Project, r.[Group], r.CommentsForAdmin
    `),
    query('design', `
      SELECT
        pcr.PartNumberChangeRequestEntryId AS id,
        pcr.Field AS field,
        pcr.NewValue AS newValue,
        pcr.DateRequested,
        pcr.DateClosed,
        pcr.Rejected AS rejected,
        pcr.[User] AS requester,
        ml.TDGPN AS part
      FROM PartNumberChangeRequests pcr
      LEFT JOIN MasterList ml ON pcr.MasterListEntryId = ml.MasterListEntryId
    `),
  ]).then(([requests, changes]) => {
    const requestRows = requests.map((row) => {
      const asked = realDate(row.RequestTime);
      const finished = realDate(row.finished);
      const components = Number(row.components) || 0;
      const done = Number(row.done) || 0;
      return {
        id: row.id,
        kind: 'request',
        asked: iso(asked),
        finished: iso(finished),
        days: components > 0 && done === components ? spanDays(asked, finished) : null,
        requester: text(row.requester) || '(none)',
        customer: text(row.customer) || '(none)',
        project: text(row.project) || '(none)',
        groupName: text(row.groupName) || '(none)',
        comments: text(row.comments),
        components,
        done,
        open: done < components || components === 0,
      };
    }).filter((row) => row.asked);
    const changeRows = changes.map((row) => {
      const asked = realDate(row.DateRequested);
      const closed = realDate(row.DateClosed);
      return {
        id: row.id,
        kind: 'change',
        asked: iso(asked),
        closed: iso(closed),
        days: spanDays(asked, closed),
        field: text(row.field) || '(none)',
        newValue: text(row.newValue),
        requester: text(row.requester) || '(none)',
        part: text(row.part),
        rejected: row.rejected === true || row.rejected === 1,
        open: false,
      };
    }).filter((row) => row.asked);
    cache = { at: Date.now(), requestRows, changeRows };
    loading = null;
    return cache;
  }).catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

function scoped(rows, filters, cutoff) {
  return rows.filter((row) => {
    if (filters.requester && row.requester !== filters.requester) return false;
    if (row.kind === 'request') {
      if (filters.field) return false;
      if (filters.customer && row.customer !== filters.customer) return false;
      if (filters.project && row.project !== filters.project) return false;
    }
    if (row.kind === 'change') {
      if (filters.customer || filters.project) return false;
      if (filters.field && row.field !== filters.field) return false;
    }
    return inWindow(row.asked, cutoff);
  });
}

function mergeTrends(groups) {
  const map = new Map();
  groups.flat().forEach((row) => {
    const item = map.get(row.month) || { month: row.month };
    Object.assign(item, row);
    map.set(row.month, item);
  });
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

async function getDesignDashboard(filters) {
  const { requestRows, changeRows } = await loadRows();
  const cutoff = cutoffFor(filters.months);
  const history = scoped(requestRows, filters, null);
  const requests = history.filter((row) => inWindow(row.asked, cutoff));
  const changes = scoped(changeRows, filters, cutoff);
  const open = requests.filter((row) => row.open);
  const rejected = changes.filter((row) => row.rejected);
  const requestDays = median(requests.map((row) => row.days));
  const changeDays = median(changes.map((row) => row.days));
  const sameDay = requests.filter((row) => row.days === 0).length;
  const topField = topCount(changes, 'field', 1)[0];
  const findings = [
    `${countText(requests.length)} part-number requests are in this window. ${countText(open.length)} are still waiting for a number.`,
    `${countText(sameDay)} issued requests were finished the same day they were asked. The median is ${round1(requestDays) ?? '—'} days.`,
    `${countText(changes.length)} change requests are in this window. ${countText(rejected.length)} were rejected. The median close is ${round1(changeDays) ?? '—'} days.`,
  ];
  if (topField) findings.push(`${topField.name} is the field changed most often: ${countText(topField.count)}.`);
  return {
    kpis: {
      requests: requests.length,
      open: open.length,
      done: requests.length - open.length,
      medianRequest: round1(requestDays),
      changes: changes.length,
      rejected: rejected.length,
      accepted: changes.length - rejected.length,
      medianChange: round1(changeDays),
    },
    trends: mergeTrends([
      countTrends(requests, 'asked', [
        { key: 'requests' },
        { key: 'open', when: (row) => row.open },
        { key: 'done', when: (row) => !row.open },
      ]),
      countTrends(changes, 'asked', [
        { key: 'changes' },
        { key: 'rejected', when: (row) => row.rejected },
        { key: 'accepted', when: (row) => !row.rejected },
      ]),
    ]),
    requestAge: histogram(requests.filter((row) => row.days != null).map((row) => row.days)),
    changeAge: histogram(changes.filter((row) => row.days != null).map((row) => row.days)),
    monthly: monthlyOf(history, 'asked', 'open'),
    all: {
      arrived: history.length,
      completed: history.filter((row) => !row.open).length,
      remaining: history.filter((row) => row.open).length,
    },
    requesters: topCount(requests, 'requester'),
    customers: topCount(requests, 'customer'),
    projects: topCount(requests, 'project'),
    fields: topCount(changes, 'field'),
    options: {
      requesters: [...new Set(requestRows.map((row) => row.requester))].sort(),
      customers: [...new Set(requestRows.map((row) => row.customer))].sort(),
      projects: [...new Set(requestRows.map((row) => row.project))].filter((name) => name !== '(none)').sort(),
      fields: [...new Set(changeRows.map((row) => row.field))].sort(),
    },
    findings,
  };
}

function matches(row, filters, cutoff) {
  if (row.kind === 'request' && (filters.customer && row.customer !== filters.customer || filters.project && row.project !== filters.project || filters.field)) return false;
  if (row.kind === 'change' && (filters.customer || filters.project || (filters.field && row.field !== filters.field))) return false;
  if (filters.requester && row.requester !== filters.requester) return false;
  const view = filters.view || 'requests';
  const skipWindow = view.startsWith('month') || view === 'allOpen';
  if (!skipWindow && !inWindow(row.asked, cutoff)) return false;
  if (view === 'open' || view === 'allOpen') return row.kind === 'request' && row.open;
  if (view === 'done') return row.kind === 'request' && !row.open;
  if (view === 'changes' || view === 'monthChanges') return row.kind === 'change' && (view === 'changes' || inMonths(row.asked, filters));
  if (view === 'rejected') return row.kind === 'change' && row.rejected;
  if (view === 'accepted') return row.kind === 'change' && !row.rejected;
  if (view === 'requestBucket') return row.kind === 'request' && inBucket(row.days, filters);
  if (view === 'changeBucket') return row.kind === 'change' && inBucket(row.days, filters);
  if (view === 'monthRequests') return row.kind === 'request' && inMonths(row.asked, filters);
  if (view === 'monthDone') return row.kind === 'request' && !row.open && inMonths(row.asked, filters);
  if (view === 'monthOpen') return row.kind === 'request' && row.open && inMonths(row.asked, filters);
  return row.kind === 'request';
}

async function listDesignLines(filters) {
  const { requestRows, changeRows } = await loadRows();
  const cutoff = cutoffFor(filters.months);
  const needle = text(filters.q).toLowerCase();
  let rows = [...requestRows, ...changeRows].filter((row) => matches(row, filters, cutoff));
  if (needle) {
    rows = rows.filter((row) =>
      [row.requester, row.customer, row.project, row.field, row.part, row.comments, row.newValue]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }
  rows.sort((a, b) => String(b.asked).localeCompare(String(a.asked)));
  return pageRows(rows, filters, (row, sort) => {
    if (sort === 'days') return row.days;
    if (sort === 'components') return row.components;
    return row[sort];
  });
}

module.exports = { getDesignDashboard, listDesignLines };
