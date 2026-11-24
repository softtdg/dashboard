export const VIEWS = {
  tracked: {
    title: 'Tracked SOPs',
    hint: 'Every tracked SOP in this window, including work that is still open.',
  },
  completed: {
    title: 'Completed SOPs',
    hint: 'Final delivery is recorded. Cycle time is entry date to delivery.',
  },
  open: {
    title: 'Open SOPs',
    hint: 'No final delivery yet.',
  },
  overdue: {
    title: 'Past ODD',
    hint: 'Still open, and the original delivery date has passed.',
  },
  stuckProduction: {
    title: 'Stuck in production',
    hint: 'In production for more than 21 days.',
  },
  stuckQa: {
    title: 'Stuck in QA',
    hint: 'In QA for more than 7 days.',
  },
  waitingProduction: {
    title: 'Waiting to start production',
    hint: 'Order entry is out, and production has not started for more than 21 days.',
  },
  late: {
    title: 'Finished late',
    hint: 'Delivered after ODD.',
  },
  onTime: {
    title: 'Finished on time',
    hint: 'Delivered on or before ODD.',
  },
  rework: {
    title: 'Rework',
    hint: 'Completed SOPs that went back to production.',
  },
  backorder: {
    title: 'Open backorders',
    hint: 'Open SOPs with at least one part still short.',
  },
  productionBackorder: {
    title: 'In production with a shortage',
    hint: 'Currently in production, and at least one backorder is still short.',
  },
  productionClear: {
    title: 'In production, parts clear',
    hint: 'Currently in production with no open backorder. Long stays here are not explained by missing parts.',
  },
  notifyPurchasing: {
    title: 'Waiting on purchasing',
    hint: 'Open SOPs whose lead-hand lines are still flagged for purchasing.',
  },
  notifyDesign: {
    title: 'Waiting on design',
    hint: 'Open SOPs whose lead-hand lines are still flagged for design.',
  },
  notifySales: {
    title: 'Waiting on sales',
    hint: 'Open SOPs whose lead-hand lines are still flagged for sales.',
  },
  highTime: {
    title: 'Highest cycle time',
    hint: 'Completed SOPs, longest entry-to-delivery first.',
  },
  monthArrived: {
    title: 'SOPs that arrived',
    hint: 'SOPs that were entered in this period.',
  },
  monthCompleted: {
    title: 'Completed from that month',
    hint: 'These SOPs arrived in the selected month and now have a final delivery.',
  },
  monthRemaining: {
    title: 'Still open from that month',
    hint: 'These SOPs arrived in the selected month and have not been delivered.',
  },
  cycleBucket: {
    title: 'Cycle time band',
    hint: 'Completed SOPs whose total cycle falls in this band.',
  },
}

export function days(value) {
  return value == null ? '—' : `${value}d`
}

export function num(value) {
  return value == null ? '—' : Number(value).toLocaleString()
}

export function money(value) {
  if (!value) return '—'
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })
}
