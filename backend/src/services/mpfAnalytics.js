const { connectDB } = require('../db/conn');
const {
  realDate, iso, spanDays, median, text, number, cutoffFor, inWindow, pretty,
  countText, inMonths, monthlyOf, countTrends, topCount, pageRows,
} = require('./analyticsUtil');

const CACHE_MS = 60 * 1000;
let cache = null;
let loading = null;

function logName(status) {
  if (status === 1) return 'Approved';
  if (status === 2) return 'Rejected';
  return 'Pending';
}

function pickName(status) {
  if (status === 1) return 'Picked';
  if (status === 2) return 'Pick rejected';
  return 'Not picked';
}

async function loadRows() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  if (loading) return loading;
  loading = (async () => {
    const db = await connectDB();
    if (!db.BOMs) throw new Error('MPF lists are not connected');
    const [docs, backs] = await Promise.all([
      db.BOMs.collection('pickList').find(
        { mpfStatus: { $in: [0, 1] } },
        {
          projection: {
            MPFRequestedBy: 1,
            excelFixtureDetail: 1,
            mpfStatus: 1,
            project: 1,
            pickListNumber: 1,
            status: 1,
            picker: 1,
            createdBy: 1,
            acceptedBy: 1,
            MPFPickLogStatus: 1,
            MPFPickedAt: 1,
            createdAt: 1,
            partType: 1,
            'sheetData.TDGPN': 1,
            'sheetData.TotalQtyNeeded': 1,
            'sheetData.mpfQty': 1,
          },
        },
      ).toArray(),
      db.BOMs.collection('mpfBackorder').find(
        {},
        {
          projection: {
            pickListId: 1,
            mpfNumber: 1,
            refSOPNum: 1,
            fixtureNumber: 1,
            fixtureDescription: 1,
            programName: 1,
            mpfRequestedBy: 1,
            createdAt: 1,
            'backorders.TDGPN': 1,
            'backorders.Quantity': 1,
            'backorders.Received': 1,
            'backorders.Description': 1,
          },
        },
      ).toArray(),
    ]);

    const shortage = new Map();
    backs.forEach((doc) => {
      const lines = Array.isArray(doc.backorders) ? doc.backorders : [];
      const openLines = lines.filter((line) => number(line.Quantity) > number(line.Received));
      const items = openLines.map((line) => ({
        part: text(line.TDGPN),
        qty: number(line.Quantity) - number(line.Received),
        description: text(line.Description),
      })).filter((line) => line.part);
      shortage.set(String(doc.pickListId), {
        lines: items.length,
        qty: items.reduce((sum, line) => sum + line.qty, 0),
        parts: [...new Set(items.map((line) => line.part))],
        items,
      });
    });

    const rows = docs.map((doc) => {
      const fixture = doc.excelFixtureDetail || {};
      const asked = realDate(doc.createdAt);
      const approvedAt = realDate(doc.MPFPickedAt);
      const logStatus = number(doc.MPFPickLogStatus);
      const pickStatus = number(doc.status);
      const sheet = Array.isArray(doc.sheetData) ? doc.sheetData : [];
      const short = shortage.get(String(doc._id)) || { lines: 0, qty: 0, parts: [], items: [] };
      const numberLabel = doc.pickListNumber == null || doc.pickListNumber === ''
        ? ''
        : String(doc.pickListNumber);
      return {
        id: String(doc._id),
        number: numberLabel,
        mpf: numberLabel ? `MPF#${numberLabel}` : 'MPF',
        sop: text(fixture.sopNum),
        fixture: text(fixture.fixture) || '(none)',
        description: text(fixture.description),
        program: text(fixture.programName) || '(none)',
        mpfStatus: number(doc.mpfStatus),
        requester: text(doc.MPFRequestedBy) || '(none)',
        picker: text(doc.picker),
        createdBy: text(doc.createdBy),
        acceptedBy: text(doc.acceptedBy),
        partType: text(doc.partType) || '(none)',
        asked: iso(asked),
        approvedOn: iso(approvedAt),
        approveDays: logStatus === 1 ? spanDays(asked, approvedAt) : null,
        logStatus,
        log: logName(logStatus),
        pickStatus,
        pick: pickName(pickStatus),
        waiting: logStatus === 0,
        approved: logStatus === 1,
        rejected: logStatus === 2,
        picked: pickStatus === 1,
        toPick: logStatus === 1 && pickStatus === 0,
        lines: sheet.length,
        qty: sheet.reduce((sum, line) => sum + number(line.TotalQtyNeeded), 0),
        askedQty: sheet.reduce((sum, line) => sum + number(line.mpfQty), 0),
        parts: [...new Set(sheet.map((line) => text(line.TDGPN)).filter(Boolean))],
        short: short.lines > 0,
        shortLines: short.lines,
        shortQty: short.qty,
        shortParts: short.parts,
        shortItems: short.items,
        shortNote: short.items.map((line) => (line.description ? `${line.part} ${line.description}` : line.part)).join(', '),
      };
    }).filter((row) => row.asked);

    const inventory = rows.filter((row) => row.mpfStatus === 0).map((row) => ({
      ...row,
      mpf: row.number ? `PL#${row.number}` : 'Pick list',
      requester: row.requester !== '(none)' ? row.requester : (row.createdBy || '(none)'),
      log: row.pickStatus === 1 ? 'Accepted' : row.pickStatus === 2 ? 'Rejected' : 'Pending',
      pick: row.picker || '—',
      waiting: row.pickStatus === 0,
      approved: row.pickStatus === 1,
      rejected: row.pickStatus === 2,
      kind: 'inventory',
    }));
    const mpfRows = rows.filter((row) => row.mpfStatus === 1);

    const backRows = [];
    backs.forEach((doc) => {
      const asked = realDate(doc.createdAt);
      const lines = Array.isArray(doc.backorders) ? doc.backorders : [];
      lines.forEach((line) => {
        const quantity = number(line.Quantity);
        const received = number(line.Received);
        const open = quantity > received;
        const part = text(line.TDGPN);
        backRows.push({
          id: String(line._id || `${doc._id}-${part}`),
          mpf: text(doc.mpfNumber) || 'MPF',
          sop: text(doc.refSOPNum),
          fixture: text(doc.fixtureNumber) || '(none)',
          description: text(line.Description) || text(doc.fixtureDescription),
          program: text(doc.programName) || '(none)',
          requester: text(doc.mpfRequestedBy) || '(none)',
          asked: iso(asked),
          log: open ? 'Still short' : 'Received',
          pick: part || '—',
          waiting: false,
          approved: false,
          rejected: false,
          picked: false,
          toPick: false,
          short: open,
          lines: 1,
          shortQty: open ? quantity - received : 0,
          quantity,
          received,
          part,
          shortNote: [part, text(line.Description)].filter(Boolean).join(' '),
        });
      });
    });

    cache = { at: Date.now(), rows: mpfRows, inventory, backRows };
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
    if (filters.requester && row.requester !== filters.requester) return false;
    if (filters.project && row.program !== filters.project) return false;
    return inWindow(row.asked, cutoff);
  });
}

function scopedBack(rows, filters, cutoff) {
  return rows.filter((row) => {
    if (filters.requester && row.requester !== filters.requester) return false;
    if (filters.project && row.program !== filters.project) return false;
    if (filters.part && row.part !== filters.part) return false;
    return inWindow(row.asked, cutoff);
  });
}

async function getMpfDashboard(filters) {
  const loaded = await loadRows();
  const cutoff = cutoffFor(filters.months);
  const rows = scoped(loaded.rows, filters, cutoff);
  const history = scoped(loaded.rows, filters, null);
  const inventory = scoped(loaded.inventory || [], filters, cutoff);
  const waiting = rows.filter((row) => row.waiting);
  const approved = rows.filter((row) => row.approved);
  const picked = rows.filter((row) => row.picked);
  const backs = scopedBack(loaded.backRows, filters, cutoff);
  const openBack = backs.filter((row) => row.short);
  const shortQty = openBack.reduce((sum, row) => sum + row.shortQty, 0);
  const dates = history.map((row) => row.asked).sort();
  const wait = median(approved.map((row) => row.approveDays));
  const top = topCount(rows, 'requester', 1);
  const usa = rows.filter((row) => row.requester.toUpperCase() === 'USA PRODUCTION').length;
  return {
    kpis: {
      requests: rows.length,
      waiting: waiting.length,
      approved: approved.length,
      rejected: rows.filter((row) => row.rejected).length,
      picked: picked.length,
      toPick: rows.filter((row) => row.toPick).length,
      short: openBack.length,
      shortLines: openBack.length,
      shortQty: Math.round(shortQty),
      lines: rows.reduce((sum, row) => sum + row.lines, 0),
      requesters: new Set(rows.map((row) => row.requester)).size,
      medianApprove: wait == null ? null : Math.round(wait),
    },
    inventory: {
      lists: inventory.length,
      pending: inventory.filter((row) => row.waiting).length,
      accepted: inventory.filter((row) => row.approved).length,
      rejected: inventory.filter((row) => row.rejected).length,
      lines: inventory.reduce((sum, row) => sum + row.lines, 0),
    },
    invTrends: countTrends(inventory, 'asked', [
      { key: 'lists' },
      { key: 'pending', when: (row) => row.waiting },
      { key: 'accepted', when: (row) => row.approved },
      { key: 'rejected', when: (row) => row.rejected },
    ]),
    trends: countTrends(rows, 'asked', [
      { key: 'requests' },
      { key: 'waiting', when: (row) => row.waiting },
      { key: 'approved', when: (row) => row.approved },
      { key: 'rejected', when: (row) => row.rejected },
      { key: 'picked', when: (row) => row.picked },
      { key: 'requesters', set: (row) => row.requester },
    ]),
    shortTrends: countTrends(backs, 'asked', [
      { key: 'short', when: (row) => row.short },
    ]),
    monthly: monthlyOf(history, 'asked', 'waiting'),
    all: {
      arrived: history.length,
      completed: history.filter((row) => !row.waiting).length,
      remaining: history.filter((row) => row.waiting).length,
    },
    requesters: topCount(rows, 'requester', 8),
    programs: topCount(rows, 'program', 8),
    fixtures: topCount(rows, 'fixture', 8),
    parts: topCount(openBack, 'part', 8, (group, row) => { group.value += row.shortQty; })
      .map((row) => ({ ...row, value: Math.round(row.value) })),
    options: {
      requesters: [...new Set([...loaded.rows, ...(loaded.inventory || [])].map((row) => row.requester))].filter((name) => name !== '(none)').sort(),
      programs: [...new Set([...loaded.rows, ...(loaded.inventory || [])].map((row) => row.program))].filter((name) => name !== '(none)').sort(),
    },
    findings: [
      `An MPF is a pick list with mpfStatus 1. It waits in the request log, then an admin approves or rejects it. Approving records who accepted it and when. The warehouse pick is the next step: status 1 means that pick list was accepted.`,
      `Requests in view run from ${pretty(dates[0])} to ${pretty(dates.at(-1))}. ${countText(waiting.length)} are pending, ${countText(approved.length)} are approved, ${countText(rows.filter((row) => row.rejected).length)} are rejected, and ${countText(picked.length)} have been picked.`,
      wait == null
        ? 'No approved request has both an ask date and an approval time yet.'
        : `Approved requests took a median of ${Math.round(wait)} ${Math.round(wait) === 1 ? 'day' : 'days'} from the ask to the approval.`,
      `Still short is the open MPF backorder: ${countText(openBack.length)} lines, ${countText(Math.round(shortQty))} pieces not received yet. A line is added when the pick is short, and it drops off once the received quantity catches up.`,
      usa
        ? `${countText(usa)} requests were asked by USA Production. Those follow the USA request log; the others follow the Canada log.`
        : 'None of the requests in this window were asked by USA Production.',
      top[0] ? `${top[0].name} asked for the most MPFs: ${countText(top[0].count)}.` : 'No MPF requests in this window.',
      `A pick list with mpfStatus 0 is inventory, not an MPF. Its status is pending, accepted, or rejected. ${countText(inventory.filter((row) => row.waiting).length)} are pending, ${countText(inventory.filter((row) => row.approved).length)} are accepted, and ${countText(inventory.filter((row) => row.rejected).length)} are rejected. An approved MPF also shows on that inventory overview once it is ready to pick; those stay in the MPF cards.`,
    ],
  };
}

function matches(row, filters, cutoff) {
  if (filters.requester && row.requester !== filters.requester) return false;
  if (filters.project && row.program !== filters.project) return false;
  if (filters.item && row.fixture !== filters.item) return false;
  const view = filters.view || 'requests';
  const skip = view.startsWith('month') || view.startsWith('all');
  if (!skip && !inWindow(row.asked, cutoff)) return false;
  if (view === 'waiting' || view === 'allWaiting' || view === 'monthWaiting') {
    return row.waiting && (view === 'monthWaiting' ? inMonths(row.asked, filters) : true);
  }
  if (view === 'approved' || view === 'allApproved') return row.approved;
  if (view === 'rejected') return row.rejected;
  if (view === 'picked') return row.picked;
  if (view === 'toPick') return row.toPick;
  if (view === 'monthAsked' || view === 'allRequests') {
    return view === 'monthAsked' ? inMonths(row.asked, filters) : true;
  }
  if (view === 'monthDecided' || view === 'allDecided') {
    return !row.waiting && (view === 'monthDecided' ? inMonths(row.asked, filters) : true);
  }
  return true;
}

function matchesInventory(row, filters, cutoff) {
  if (filters.requester && row.requester !== filters.requester) return false;
  if (filters.project && row.program !== filters.project) return false;
  if (filters.item && row.fixture !== filters.item) return false;
  if (!inWindow(row.asked, cutoff)) return false;
  if (filters.view === 'invPending') return row.waiting;
  if (filters.view === 'invAccepted') return row.approved;
  if (filters.view === 'invRejected') return row.rejected;
  return true;
}

async function listMpfRequests(filters) {
  const loaded = await loadRows();
  const cutoff = cutoffFor(filters.months);
  const needle = text(filters.q).toLowerCase();
  const view = filters.view || 'requests';
  let rows;
  if (view === 'short') rows = scopedBack(loaded.backRows, filters, cutoff).filter((row) => row.short);
  else if (view.startsWith('inv')) rows = (loaded.inventory || []).filter((row) => matchesInventory(row, filters, cutoff));
  else rows = loaded.rows.filter((row) => matches(row, filters, cutoff));
  if (needle) {
    rows = rows.filter((row) =>
      [row.mpf, row.sop, row.fixture, row.requester, row.program, row.shortNote]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }
  rows.sort((a, b) => String(b.asked).localeCompare(String(a.asked)));
  return pageRows(rows, filters, (row, sort) => {
    if (sort === 'lines' || sort === 'shortQty') return row[sort];
    return row[sort];
  });
}

module.exports = { getMpfDashboard, listMpfRequests };
