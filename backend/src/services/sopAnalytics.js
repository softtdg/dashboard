const { query } = require('../db/mssqlPool');
const { countTrends } = require('./analyticsUtil');

const DAY = 86400000;
const CACHE_MS = 60 * 1000;

let cache = null;
let loading = null;

function realDate(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 2015) return null;
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

function average(values) {
  const usable = values.filter((value) => value != null);
  if (!usable.length) return null;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function round1(value) {
  return value == null ? null : Math.round(value * 10) / 10;
}

function currentStage(row) {
  if (row.delivered) return 'Delivered';
  if (row.shippingIn) return 'Shipping';
  if (row.qaIn && !row.qaOut) return 'QA';
  if (row.productionOut && !row.qaIn) return 'Waiting QA';
  if (row.productionIn && !row.productionOut) return 'Production';
  if (row.orderOut && !row.productionIn) return 'Waiting production';
  if (row.entered) return 'Order entry';
  return 'Not started';
}

function stageStart(row, stage) {
  switch (stage) {
    case 'Shipping':
      return row.shippingIn;
    case 'QA':
      return row.qaIn;
    case 'Waiting QA':
      return row.productionOut;
    case 'Production':
      return row.productionIn;
    case 'Waiting production':
      return row.orderOut;
    case 'Order entry':
      return row.entered;
    default:
      return row.entered;
  }
}

function bottleneck(record) {
  const parts = [
    ['Order entry', record.orderEntryDays],
    ['Queue', record.queueDays],
    ['Production', record.productionDays],
    ['QA', record.qaDays],
    ['Shipping', record.shipDays],
  ].filter(([, days]) => days != null);
  if (!parts.length) return null;
  parts.sort((a, b) => b[1] - a[1]);
  return { stage: parts[0][0], days: parts[0][1] };
}

function normalize(row, today) {
  const entered = realDate(row.SOPEntryDateIn);
  const orderOut = realDate(row.SOPOrderEntryOut);
  const odd = realDate(row.ODD);
  const productionIn = realDate(row.ProductionSOPDateIn);
  const productionOut = realDate(row.ProductionDateOut);
  const qaIn = realDate(row.QCDateIn);
  const qaOut = realDate(row.QCOut);
  const rework = realDate(row.ReworkDateOut);
  const shippingIn = realDate(row.ShippingDateIn);
  const delivered = realDate(row.FinalDeliveryDate);

  const draft = {
    entered,
    orderOut,
    odd,
    productionIn,
    productionOut,
    qaIn,
    qaOut,
    shippingIn,
    delivered,
  };
  const stage = currentStage(draft);
  const open = !delivered;
  const cycleDays = spanDays(entered, delivered);
  const ageDays = open ? spanDays(entered, today) : cycleDays;
  const lateDays = spanDays(odd, delivered);
  const overdueDays = open ? spanDays(odd, today) : null;
  const inStageDays = open ? spanDays(stageStart(draft, stage), today) : null;

  const record = {
    sopId: row.SOPId,
    sopNum: row.SOPNum || '',
    poNum: row.PONum || '',
    customer: row.Customer || 'Unknown',
    program: row.Program || 'No program',
    location: row.Location || 'Unknown',
    leadHand: row.LeadHand || 'Unassigned',
    prodMgr: row.ProdMgr || '',
    qty: Number(row.Qty) || 0,
    lines: Number(row.Lines) || 0,
    amount: Number(row.Amount) || 0,
    openBackorders: Number(row.OpenBackorders) || 0,
    notifySales: Number(row.NotifySales) || 0,
    notifyPurchasing: Number(row.NotifyPurchasing) || 0,
    notifyDesign: Number(row.NotifyDesign) || 0,
    entered: iso(entered),
    orderOut: iso(orderOut),
    odd: iso(odd),
    productionIn: iso(productionIn),
    productionOut: iso(productionOut),
    qaIn: iso(qaIn),
    qaOut: iso(qaOut),
    shippingIn: iso(shippingIn),
    delivered: iso(delivered),
    rework: Boolean(rework),
    open,
    stage,
    cycleDays,
    ageDays,
    lateDays,
    overdueDays: overdueDays && overdueDays > 0 ? overdueDays : null,
    inStageDays,
    orderEntryDays: spanDays(entered, orderOut),
    queueDays: spanDays(orderOut, productionIn),
    productionDays: spanDays(productionIn, productionOut),
    qaDays: spanDays(qaIn, qaOut),
    shipDays: spanDays(shippingIn, delivered),
  };
  record.bottleneck = bottleneck(record);
  return record;
}

async function loadRecords() {
  const rows = await query(
    'sop',
    `
    SELECT
      s.SOPId,
      s.SOPNum,
      s.PONum,
      c.Name AS Customer,
      pr.Name AS Program,
      l.Location AS Location,
      pm.Name AS ProdMgr,
      lh.LeadHandName AS LeadHand,
      s.SOPEntryDateIn,
      s.SOPOrderEntryOut,
      s.ODD,
      s.FinalDeliveryDate,
      prod.ProductionSOPDateIn,
      prod.ProductionDateOut,
      CASE
        WHEN qa.FinalDateReceivedInQC IS NOT NULL AND YEAR(qa.FinalDateReceivedInQC) > 2014
        THEN qa.FinalDateReceivedInQC
        ELSE qa.QCDateIn
      END AS QCDateIn,
      qa.QCOut,
      qa.ReworkDateOut,
      se.ShippingDateIn,
      ISNULL(fx.Qty, 0) AS Qty,
      ISNULL(fx.Lines, 0) AS Lines,
      ISNULL(fx.Amount, 0) AS Amount,
      ISNULL(fx.NotifySales, 0) AS NotifySales,
      ISNULL(fx.NotifyPurchasing, 0) AS NotifyPurchasing,
      ISNULL(fx.NotifyDesign, 0) AS NotifyDesign,
      ISNULL(bo.OpenBackorders, 0) AS OpenBackorders
    FROM SOPs s
    LEFT JOIN SOPCustomers c ON s.SOPCustomerId = c.SOPCustomerId
    LEFT JOIN SOPPrograms pr ON s.SOPProgramId = pr.SOPProgramId
    LEFT JOIN SOPLocations l ON s.SOPLocationId = l.SOPLocationId
    LEFT JOIN SOPProductionManagers pm ON s.SOPProductionManagerId = pm.SOPProductionManagerId
    LEFT JOIN SOPProductionEntries prod ON s.SOPProductionEntryId = prod.SOPProductionEntryId
    LEFT JOIN SOPLeadHands lh ON prod.SOPLeadHandId = lh.SOPLeadHandId
    LEFT JOIN SOPQAEntries qa ON s.SOPQAEntryId = qa.SOPQAEntryId
    LEFT JOIN SOPShippingEntries se ON s.SOPShippingEntryId = se.SOPShippingEntryId
    LEFT JOIN (
      SELECT
        SOPId,
        SUM(ISNULL(Quantity, 0)) AS Qty,
        COUNT(*) AS Lines,
        SUM(ISNULL(Amount, 0)) AS Amount,
        SUM(CASE WHEN NotifySales = 1 THEN 1 ELSE 0 END) AS NotifySales,
        SUM(CASE WHEN NotifyPurchasing = 1 THEN 1 ELSE 0 END) AS NotifyPurchasing,
        SUM(CASE WHEN NotifyDesign = 1 THEN 1 ELSE 0 END) AS NotifyDesign
      FROM SOPLeadHandEntries
      WHERE ISNULL(Disabled, 0) = 0
      GROUP BY SOPId
    ) fx ON fx.SOPId = s.SOPId
    LEFT JOIN (
      SELECT
        e.SOPId,
        SUM(CASE
          WHEN b.Received IS NULL OR b.Received < ISNULL(b.Quantity, 0) THEN 1
          ELSE 0
        END) AS OpenBackorders
      FROM SOPLeadHandEntries e
      INNER JOIN SOPBackorderEntries b ON b.SOPLeadHandEntryId = e.SOPLeadHandEntryId
      WHERE ISNULL(e.Disabled, 0) = 0
      GROUP BY e.SOPId
    ) bo ON bo.SOPId = s.SOPId
    WHERE s.ExcludeFromTracker = 0
      AND UPPER(LTRIM(RTRIM(ISNULL(s.SOPNum, '')))) <> 'CANCELLED'
    `,
  );

  const today = new Date();
  return rows.map((row) => normalize(row, today));
}

async function getRecords() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.records;
  if (!loading) {
    loading = loadRecords()
      .then((records) => {
        cache = { at: Date.now(), records };
        return records;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

function inWindow(record, cutoff) {
  if (!cutoff || record.open) return true;
  return Boolean(
    (record.delivered && record.delivered >= cutoff) ||
      (record.entered && record.entered >= cutoff),
  );
}

function cutoffFor(months) {
  const count = Number(months);
  if (!count) return null;
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - count);
  return date.toISOString().slice(0, 10);
}

function stageStats(records, key) {
  const values = records.map((record) => record[key]).filter((value) => value != null);
  return {
    medianDays: round1(median(values)),
    avgDays: round1(average(values)),
    sample: values.length,
  };
}

function rankGroups(records, key, limit = 8) {
  const groups = new Map();
  for (const record of records) {
    const name = record[key] || 'Unknown';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(record);
  }

  return [...groups.entries()]
    .map(([name, items]) => {
      const completed = items.filter((item) => !item.open && item.cycleDays != null);
      const open = items.filter((item) => item.open);
      const late = completed.filter((item) => item.lateDays > 0);
      return {
        name,
        total: items.length,
        completed: completed.length,
        open: open.length,
        overdue: open.filter((item) => item.overdueDays).length,
        medianCycle: round1(median(completed.map((item) => item.cycleDays))),
        medianProduction: round1(median(completed.map((item) => item.productionDays))),
        lateRate: completed.length ? Math.round((late.length / completed.length) * 100) : null,
      };
    })
    .filter((group) => group.completed >= 5 || group.overdue >= 3)
    .sort((a, b) => (b.medianCycle || 0) - (a.medianCycle || 0) || b.overdue - a.overdue)
    .slice(0, limit);
}

function publicRecord(record) {
  return {
    sopId: record.sopId,
    sopNum: record.sopNum,
    poNum: record.poNum,
    customer: record.customer,
    program: record.program,
    location: record.location,
    leadHand: record.leadHand,
    qty: record.qty,
    lines: record.lines,
    amount: record.amount,
    openBackorders: record.openBackorders,
    notifySales: record.notifySales,
    notifyPurchasing: record.notifyPurchasing,
    notifyDesign: record.notifyDesign,
    entered: record.entered,
    odd: record.odd,
    delivered: record.delivered,
    open: record.open,
    stage: record.stage,
    cycleDays: record.cycleDays,
    ageDays: record.ageDays,
    lateDays: record.lateDays,
    overdueDays: record.overdueDays,
    inStageDays: record.inStageDays,
    orderEntryDays: record.orderEntryDays,
    queueDays: record.queueDays,
    productionDays: record.productionDays,
    qaDays: record.qaDays,
    shipDays: record.shipDays,
    rework: record.rework,
    bottleneck: record.bottleneck,
  };
}

const CYCLE_BUCKETS = [
  { label: '0–7d', min: 0, max: 8 },
  { label: '8–14d', min: 8, max: 15 },
  { label: '15–30d', min: 15, max: 31 },
  { label: '31–60d', min: 31, max: 61 },
  { label: '61–90d', min: 61, max: 91 },
  { label: '91–180d', min: 91, max: 181 },
  { label: '180d+', min: 181, max: null },
];

const OPEN_STAGES = [
  'Order entry',
  'Waiting production',
  'Production',
  'Waiting QA',
  'QA',
  'Shipping',
  'Not started',
];

function sampleRows(rows, max) {
  if (rows.length <= max) return rows;
  const step = rows.length / max;
  const picked = [];
  for (let index = 0; index < max; index += 1) {
    picked.push(rows[Math.floor(index * step)]);
  }
  return picked;
}

function applyDimensions(records, { customer, program, leadHand, location } = {}) {
  return records.filter((record) => {
    if (customer && record.customer !== customer) return false;
    if (program && record.program !== program) return false;
    if (leadHand && record.leadHand !== leadHand) return false;
    if (location && record.location !== location) return false;
    return true;
  });
}

function buildMonthly(records) {
  const map = new Map();
  for (const record of records) {
    if (!record.entered) continue;
    const month = record.entered.slice(0, 7);
    if (!map.has(month)) {
      map.set(month, { month, arrived: 0, completed: 0, remaining: 0 });
    }
    const row = map.get(month);
    row.arrived += 1;
    if (record.open) row.remaining += 1;
    else row.completed += 1;
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function entryMonthsOf(extra = {}) {
  const months = [];
  if (extra.entryMonth) months.push(String(extra.entryMonth));
  if (extra.entryMonths) {
    months.push(...String(extra.entryMonths).split(',').map((month) => month.trim()).filter(Boolean));
  }
  return months;
}

function enteredInMonths(record, months) {
  if (!record.entered) return false;
  if (!months.length) return true;
  return months.some((month) => record.entered.startsWith(month));
}

function applyScope(records, { months, customer, program, leadHand, location } = {}) {
  const cutoff = cutoffFor(months);
  const rows = records.filter((record) => {
    if (!inWindow(record, cutoff)) return false;
    if (customer && record.customer !== customer) return false;
    if (program && record.program !== program) return false;
    if (leadHand && record.leadHand !== leadHand) return false;
    if (location && record.location !== location) return false;
    return true;
  });
  return { cutoff, rows };
}

function isCompletedInWindow(record, cutoff) {
  return !record.open && (!cutoff || (record.delivered && record.delivered >= cutoff));
}

function matchesView(record, view, cutoff, extra = {}) {
  switch (view) {
    case 'completed':
      return isCompletedInWindow(record, cutoff);
    case 'open':
      return record.open && (!extra.stage || record.stage === extra.stage);
    case 'overdue':
      return record.open && Boolean(record.overdueDays);
    case 'stuckProduction':
      return record.open && record.stage === 'Production' && record.inStageDays > 21;
    case 'stuckQa':
      return record.open && record.stage === 'QA' && record.inStageDays > 7;
    case 'waitingProduction':
      return record.open && record.stage === 'Waiting production' && record.inStageDays > 21;
    case 'late':
      return isCompletedInWindow(record, cutoff) && record.lateDays > 0;
    case 'onTime':
      return isCompletedInWindow(record, cutoff) && record.odd && !(record.lateDays > 0);
    case 'rework':
      return isCompletedInWindow(record, cutoff) && record.rework;
    case 'backorder':
      return record.open && record.openBackorders > 0;
    case 'productionBackorder':
      return record.open && record.stage === 'Production' && record.openBackorders > 0;
    case 'productionClear':
      return record.open && record.stage === 'Production' && !record.openBackorders;
    case 'notifyPurchasing':
      return record.open && record.notifyPurchasing > 0;
    case 'notifyDesign':
      return record.open && record.notifyDesign > 0;
    case 'notifySales':
      return record.open && record.notifySales > 0;
    case 'highTime':
      return isCompletedInWindow(record, cutoff) && record.cycleDays != null;
    case 'cycleBucket': {
      if (!isCompletedInWindow(record, cutoff) || record.cycleDays == null) return false;
      const min = Number(extra.minCycle ?? extra.min ?? 0);
      const maxValue = extra.maxCycle ?? extra.max;
      const max = maxValue == null || maxValue === '' ? Infinity : Number(maxValue);
      return record.cycleDays >= min && record.cycleDays < max;
    }
    case 'monthArrived':
      return enteredInMonths(record, entryMonthsOf(extra));
    case 'monthCompleted':
      return enteredInMonths(record, entryMonthsOf(extra)) && !record.open;
    case 'monthRemaining':
      return enteredInMonths(record, entryMonthsOf(extra)) && record.open;
    case 'tracked':
    default:
      return true;
  }
}

function buildFindings(kpis, stages, customers, compare) {
  const findings = [];
  const slowest = [...stages].filter((stage) => stage.sample >= 20).sort((a, b) => (b.medianDays || 0) - (a.medianDays || 0))[0];
  if (slowest) {
    findings.push(
      `${slowest.label} holds the most time: median ${slowest.medianDays} days across ${slowest.sample.toLocaleString()} completed SOPs.`,
    );
  }
  const entry = stages.find((stage) => stage.key === 'orderEntryDays');
  if (entry && entry.avgDays > (entry.medianDays || 0) + 20) {
    findings.push(
      `A typical SOP leaves order entry in ${entry.medianDays} days, but the average is ${entry.avgDays} days, so a minority of SOPs wait there much longer.`,
    );
  }
  if (kpis.overdue) {
    findings.push(
      `${kpis.overdue.toLocaleString()} open SOPs are already past ODD. ${kpis.stuckProduction.toLocaleString()} have sat in production longer than 21 days.`,
    );
  }
  const customer = customers.find((item) => item.completed >= 8 && item.medianCycle != null);
  if (customer) {
    findings.push(
      `${customer.name} has the highest median cycle among active customers: ${customer.medianCycle} days, ${customer.lateRate}% late, ${customer.overdue} still overdue.`,
    );
  }
  if (kpis.onTimeRate != null) {
    findings.push(
      `${kpis.onTimeRate}% of completed SOPs in this window shipped on or before ODD. ${kpis.rework.toLocaleString()} completed jobs went back for rework.`,
    );
  }
  if (compare && compare.withBackorder.sample >= 15 && compare.withoutBackorder.sample >= 15) {
    findings.push(
      `Open production SOPs with a parts shortage have sat ${compare.withBackorder.medianDays} days (median), against ${compare.withoutBackorder.medianDays} days when every backorder is clear.`,
    );
  }
  return findings;
}

async function getDashboard({ months = 24, customer, program, leadHand, location } = {}) {
  const records = await getRecords();
  const { cutoff, rows: scoped } = applyScope(records, { months, customer, program, leadHand, location });

  const completed = scoped.filter((record) => !record.open && (!cutoff || (record.delivered && record.delivered >= cutoff)));
  const withCycle = completed.filter((record) => record.cycleDays != null);
  const open = scoped.filter((record) => record.open);
  const onTime = withCycle.filter((record) => record.odd && (record.lateDays == null || record.lateDays === 0));
  const late = withCycle.filter((record) => record.lateDays > 0);
  const judged = withCycle.filter((record) => record.odd);

  const stages = [
    { key: 'orderEntryDays', label: 'Order entry' },
    { key: 'queueDays', label: 'Queue to production' },
    { key: 'productionDays', label: 'Production' },
    { key: 'qaDays', label: 'QA' },
    { key: 'shipDays', label: 'Shipping' },
  ].map((stage) => ({ ...stage, ...stageStats(withCycle, stage.key) }));

  const monthly = buildMonthly(applyDimensions(records, { customer, program, leadHand, location }));

  const customers = rankGroups(scoped, 'customer');
  const kpis = {
    tracked: scoped.length,
    completed: completed.length,
    open: open.length,
    overdue: open.filter((record) => record.overdueDays).length,
    stuckProduction: open.filter((record) => record.stage === 'Production' && record.inStageDays > 21).length,
    stuckQa: open.filter((record) => record.stage === 'QA' && record.inStageDays > 7).length,
    waitingProduction: open.filter((record) => record.stage === 'Waiting production' && record.inStageDays > 21).length,
    medianCycle: round1(median(withCycle.map((record) => record.cycleDays))),
    avgCycle: round1(average(withCycle.map((record) => record.cycleDays))),
    onTimeRate: judged.length ? Math.round((onTime.length / judged.length) * 100) : null,
    late: late.length,
    rework: completed.filter((record) => record.rework).length,
    openBackorders: open.filter((record) => record.openBackorders > 0).length,
    notifyPurchasing: open.filter((record) => record.notifyPurchasing > 0).length,
    notifyDesign: open.filter((record) => record.notifyDesign > 0).length,
    notifySales: open.filter((record) => record.notifySales > 0).length,
  };

  const productionOpen = open.filter((record) => record.stage === 'Production');
  const compare = {
    withBackorder: {
      sample: productionOpen.filter((record) => record.openBackorders > 0).length,
      medianDays: round1(median(
        productionOpen.filter((record) => record.openBackorders > 0).map((record) => record.inStageDays),
      )),
    },
    withoutBackorder: {
      sample: productionOpen.filter((record) => !record.openBackorders).length,
      medianDays: round1(median(
        productionOpen.filter((record) => !record.openBackorders).map((record) => record.inStageDays),
      )),
    },
  };

  const histogram = CYCLE_BUCKETS.map((bucket) => ({
    ...bucket,
    count: withCycle.filter((record) => matchesView(record, 'cycleBucket', cutoff, bucket)).length,
  }));

  const scatter = sampleRows(
    withCycle.filter((record) => record.productionDays != null),
    1200,
  ).map((record) => ({
    x: record.productionDays,
    y: record.cycleDays,
    late: record.lateDays > 0,
    sopId: record.sopId,
    sopNum: record.sopNum,
  }));

  const openByStage = OPEN_STAGES.map((stage) => ({
    stage,
    count: open.filter((record) => record.stage === stage).length,
  })).filter((item) => item.count > 0);

  const names = (key) =>
    [...new Set(records.map((record) => record[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  return {
    generatedAt: new Date().toISOString(),
    window: { months: cutoff ? Number(months) : 0, from: cutoff },
    kpis,
    stages,
    monthly,
    trends: countTrends(scoped, 'entered', [
      { key: 'tracked' },
      { key: 'completed', when: (row) => !row.open },
      { key: 'open', when: (row) => row.open },
      { key: 'overdue', when: (row) => row.open && row.overdueDays },
      { key: 'stuckProduction', when: (row) => row.open && row.stage === 'Production' && row.inStageDays > 21 },
      { key: 'stuckQa', when: (row) => row.open && row.stage === 'QA' && row.inStageDays > 7 },
      { key: 'waitingProduction', when: (row) => row.open && row.stage === 'Waiting production' && row.inStageDays > 21 },
      { key: 'late', when: (row) => row.lateDays > 0 },
      { key: 'rework', when: (row) => !row.open && row.rework },
      { key: 'backorder', when: (row) => row.open && row.openBackorders > 0 },
      { key: 'notifyPurchasing', when: (row) => row.open && row.notifyPurchasing > 0 },
      { key: 'notifyDesign', when: (row) => row.open && row.notifyDesign > 0 },
    ]),
    findings: buildFindings(kpis, stages, customers, compare),
    histogram,
    scatter,
    openByStage,
    compare,
    highTime: withCycle
      .slice()
      .sort((a, b) => b.cycleDays - a.cycleDays)
      .slice(0, 25)
      .map(publicRecord),
    focus: open
      .filter((record) => record.overdueDays || (record.inStageDays || 0) >= 14)
      .sort((a, b) => (b.overdueDays || 0) - (a.overdueDays || 0) || (b.inStageDays || 0) - (a.inStageDays || 0))
      .slice(0, 25)
      .map(publicRecord),
    customers,
    programs: rankGroups(scoped, 'program'),
    leadHands: rankGroups(scoped, 'leadHand'),
    locations: rankGroups(scoped, 'location', 6),
    options: {
      customers: names('customer'),
      programs: names('program'),
      leadHands: names('leadHand'),
      locations: names('location'),
    },
  };
}

async function lookup(q) {
  const term = String(q || '').trim().toLowerCase();
  if (term.length < 2) return [];
  const records = await getRecords();
  return records
    .filter((record) =>
      record.sopNum.toLowerCase().includes(term) ||
      record.poNum.toLowerCase().includes(term) ||
      record.customer.toLowerCase().includes(term),
    )
    .sort((a, b) => Number(b.open) - Number(a.open) || (b.cycleDays || b.ageDays || 0) - (a.cycleDays || a.ageDays || 0))
    .slice(0, 20)
    .map(publicRecord);
}

async function getDetail(sopId) {
  const records = await getRecords();
  const record = records.find((item) => String(item.sopId) === String(sopId));
  if (!record) return null;

  const [notes, lines] = await Promise.all([
    query(
      'sop',
      `
      SELECT TOP 1
        s.OrderEntryComments,
        prod.ProductionComments,
        qa.QAComments
      FROM SOPs s
      LEFT JOIN SOPProductionEntries prod ON s.SOPProductionEntryId = prod.SOPProductionEntryId
      LEFT JOIN SOPQAEntries qa ON s.SOPQAEntryId = qa.SOPQAEntryId
      WHERE s.SOPId = @sopId
      `,
      { sopId: Number(sopId) },
    ),
    query(
      'sop',
      `
      SELECT
        e.SOPLeadHandEntryId,
        e.FixtureNumber,
        e.Quantity,
        e.Amount,
        e.NotifySales,
        e.NotifyPurchasing,
        e.NotifyDesign,
        e.LeadHandComments,
        b.TDGPN,
        b.Quantity AS BackorderQty,
        b.Received,
        b.RootCause,
        b.UOM
      FROM SOPLeadHandEntries e
      LEFT JOIN SOPBackorderEntries b ON b.SOPLeadHandEntryId = e.SOPLeadHandEntryId
      WHERE e.SOPId = @sopId AND ISNULL(e.Disabled, 0) = 0
      ORDER BY e.SOPLeadHandEntryId, b.SOPBackorderEntryId
      `,
      { sopId: Number(sopId) },
    ),
  ]);

  const fixtures = new Map();
  for (const line of lines) {
    if (!fixtures.has(line.SOPLeadHandEntryId)) {
      fixtures.set(line.SOPLeadHandEntryId, {
        fixture: line.FixtureNumber || '',
        qty: Number(line.Quantity) || 0,
        amount: Number(line.Amount) || 0,
        notifySales: Boolean(line.NotifySales),
        notifyPurchasing: Boolean(line.NotifyPurchasing),
        notifyDesign: Boolean(line.NotifyDesign),
        comments: line.LeadHandComments || '',
        backorders: [],
      });
    }
    if (line.TDGPN || line.BackorderQty != null) {
      const received = line.Received == null ? null : Number(line.Received);
      const quantity = Number(line.BackorderQty) || 0;
      fixtures.get(line.SOPLeadHandEntryId).backorders.push({
        part: line.TDGPN || '',
        uom: line.UOM || '',
        quantity,
        received,
        open: received == null || received < quantity,
        rootCause: line.RootCause || '',
      });
    }
  }

  const note = notes[0] || {};
  return {
    ...publicRecord(record),
    prodMgr: record.prodMgr,
    comments: {
      orderEntry: note.OrderEntryComments || '',
      production: note.ProductionComments || '',
      qa: note.QAComments || '',
    },
    fixtures: [...fixtures.values()],
  };
}

const SORTS = {
  cycleDays: 'cycleDays',
  ageDays: 'ageDays',
  overdueDays: 'overdueDays',
  inStageDays: 'inStageDays',
  productionDays: 'productionDays',
  openBackorders: 'openBackorders',
  amount: 'amount',
  sopNum: 'sopNum',
  customer: 'customer',
};

const DEFAULT_SORT = {
  overdue: ['overdueDays', 'desc'],
  stuckProduction: ['inStageDays', 'desc'],
  productionBackorder: ['inStageDays', 'desc'],
  productionClear: ['inStageDays', 'desc'],
  stuckQa: ['inStageDays', 'desc'],
  waitingProduction: ['inStageDays', 'desc'],
  highTime: ['cycleDays', 'desc'],
  completed: ['cycleDays', 'desc'],
  late: ['lateDays', 'desc'],
  backorder: ['openBackorders', 'desc'],
  open: ['overdueDays', 'desc'],
};

async function listRecords(options = {}) {
  const records = await getRecords();
  const view = options.view || 'tracked';
  const monthScoped = view === 'monthArrived' || view === 'monthCompleted' || view === 'monthRemaining';
  const { cutoff, rows: scoped } = applyScope(records, monthScoped ? { ...options, months: 0 } : options);
  const term = String(options.q || '').trim().toLowerCase();
  let matched = scoped.filter((record) => matchesView(record, view, cutoff, options));
  if (term) {
    matched = matched.filter((record) =>
      [record.sopNum, record.poNum, record.customer, record.program, record.leadHand]
        .some((value) => String(value || '').toLowerCase().includes(term)),
    );
  }

  const [fallbackSort, fallbackDir] = DEFAULT_SORT[view] || ['ageDays', 'desc'];
  const sort = SORTS[options.sort] || fallbackSort;
  const dir = options.dir === 'asc' ? 'asc' : options.dir === 'desc' ? 'desc' : fallbackDir;
  matched.sort((a, b) => {
    const left = a[sort];
    const right = b[sort];
    const leftEmpty = left == null || left === '';
    const rightEmpty = right == null || right === '';
    if (leftEmpty && rightEmpty) return 0;
    if (leftEmpty) return 1;
    if (rightEmpty) return -1;
    const factor = dir === 'asc' ? 1 : -1;
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
    return String(left).localeCompare(String(right)) * factor;
  });

  const pageSize = Math.min(Math.max(Number(options.pageSize) || 40, 1), 100);
  const pages = Math.max(1, Math.ceil(matched.length / pageSize));
  const page = Math.min(Math.max(Number(options.page) || 1, 1), pages);
  const start = (page - 1) * pageSize;

  return {
    total: matched.length,
    page,
    pages,
    pageSize,
    sort,
    dir,
    rows: matched.slice(start, start + pageSize).map(publicRecord),
  };
}

module.exports = {
  getDashboard,
  lookup,
  getDetail,
  listRecords,
};
