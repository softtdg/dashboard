import { useEffect, useState } from 'react'
import {
  CalendarClock,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  CircleCheck,
  Clock,
  Factory,
  FileText,
  Hourglass,
  Package,
  Pencil,
  RefreshCcw,
  ShieldAlert,
  ShoppingCart,
} from 'lucide-react'
import { Donut, Gauge, Histogram, LineChart, MonthBars, ScatterPlot, StageBars, trendRows } from './Charts'
import { SparkKpi, spark } from './SparkKpi'
import { days, num } from './views'
import { Meter, TimeCompare } from '../supply/Meter'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const PERIODS = [
  { value: '12', label: 'Last 12 months' },
  { value: '24', label: 'Last 24 months' },
  { value: '36', label: 'Last 36 months' },
  { value: '0', label: 'All since 2015' },
]

const ICONS = {
  tracked: [FileText, 'blue', '#60a5fa'],
  completed: [CircleCheck, 'green', '#34d399'],
  open: [Hourglass, 'amber', '#fbbf24'],
  overdue: [CalendarDays, 'pink', '#fb7185'],
  stuckProduction: [Factory, 'amber', '#fbbf24'],
  stuckQa: [ShieldAlert, 'violet', '#c4b5fd'],
  waitingProduction: [Clock, 'teal', '#5eead4'],
  late: [CalendarClock, 'pink', '#fb7185'],
  rework: [RefreshCcw, 'violet', '#c4b5fd'],
  backorder: [Package, 'green', '#34d399'],
  notifyPurchasing: [ShoppingCart, 'blue', '#7dd3fc'],
  notifyDesign: [Pencil, 'violet', '#c4b5fd'],
}

const CARDS = [
  ['tracked', 'Tracked', 'tracked', 'In this window', ''],
  ['completed', 'Completed', 'completed', null, 'tone-ok'],
  ['open', 'Open now', 'open', null, 'tone-info'],
  ['overdue', 'Past ODD', 'overdue', 'Still open', 'tone-bad'],
  ['stuckProduction', 'Stuck in production', 'stuckProduction', 'More than 21 days', 'tone-bad'],
  ['stuckQa', 'Stuck in QA', 'stuckQa', 'More than 7 days', 'tone-open'],
  ['waitingProduction', 'Waiting production', 'waitingProduction', 'More than 21 days', 'tone-open'],
  ['late', 'Finished late', 'late', 'After ODD', 'tone-bad'],
  ['rework', 'Rework', 'rework', 'Sent back to production', 'tone-open'],
  ['backorder', 'Open backorders', 'openBackorders', 'Parts still short', 'tone-ok'],
  ['notifyPurchasing', 'Flagged purchasing', 'notifyPurchasing', 'Lead hand still waiting', 'tone-info'],
  ['notifyDesign', 'Flagged design', 'notifyDesign', 'Lead hand still waiting', 'tone-violet'],
]

export default function Overview({
  data,
  error,
  loading,
  months,
  filters,
  onMonths,
  onFilters,
  onOpenList,
  onOpenDetail,
}) {
  return (
    <>
      <header>
        <div>
          <p className="eyebrow">SOP research</p>
          <h1>Where time goes, and which SOP to open</h1>
        </div>
        <label>
          Window
          <select value={months} onChange={(event) => onMonths(event.target.value)}>
            {PERIODS.map((period) => (
              <option key={period.value} value={period.value}>{period.label}</option>
            ))}
          </select>
        </label>
      </header>

      {error && <p className="banner">{error}</p>}
      {!data && loading && <p className="muted">Reading SOP history…</p>}
      {data && (
        <>
          <section className="filters">
            {[
              ['customer', 'Customer', data.options.customers],
              ['program', 'Program', data.options.programs],
              ['leadHand', 'Lead hand', data.options.leadHands],
              ['location', 'Location', data.options.locations],
            ].map(([key, label, options]) => (
              <label key={key}>
                {label}
                <select value={filters[key]} onChange={(event) => onFilters({ ...filters, [key]: event.target.value })}>
                  <option value="">All</option>
                  {options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            ))}
            {loading && <span className="muted">Updating…</span>}
          </section>

          <section className="findings">
            {data.findings.map((finding) => <p key={finding}>{finding}</p>)}
          </section>

          <section className="kpis">
            {CARDS.map(([view, label, field, note, tone]) => {
              const [Icon, swatch, color] = ICONS[view]
              return (
                <SparkKpi
                  key={view}
                  label={label}
                  value={data.kpis[field]}
                  note={view === 'completed' ? `${days(data.kpis.medianCycle)} median cycle` : note}
                  tone={tone}
                  icon={Icon}
                  swatch={swatch}
                  color={color}
                  spark={spark(data.trends, view)}
                  onClick={() => onOpenList({ view, title: label })}
                />
              )
            })}
          </section>

          <section className="rings">
            <article className="panel">
              <h2 className="with-ico"><ChartNoAxesColumnIncreasing size={18} /> Completed against open</h2>
              <p className="muted">Click a slice to open that list.</p>
              <Donut
                caption="SOPs"
                slices={[
                  { label: 'Completed', value: data.kpis.completed, color: '#3ee0c0', view: 'completed' },
                  { label: 'Open now', value: data.kpis.open, color: '#7dd3fc', view: 'open' },
                ]}
                onPick={(slice) => onOpenList({ view: slice.view, title: slice.label })}
              />
            </article>
            <article className="panel">
              <h2>Open work by stage</h2>
              <p className="muted">Where the open SOPs are sitting right now.</p>
              <Donut
                caption="open"
                slices={data.openByStage.map((row) => ({ label: row.stage, value: row.count }))}
                onPick={(slice) => onOpenList({ view: 'open', stage: slice.label, title: `Open · ${slice.label}` })}
              />
            </article>
            <article className="panel">
              <h2>How long a SOP took</h2>
              <p className="muted">Completed SOPs, entry to delivery.</p>
              <Donut
                caption="done"
                slices={data.histogram.map((bucket) => ({
                  label: bucket.label,
                  value: bucket.count,
                  min: bucket.min,
                  max: bucket.max,
                }))}
                onPick={(slice) => onOpenList({
                  view: 'cycleBucket',
                  minCycle: slice.min,
                  maxCycle: slice.max,
                  title: `Cycle ${slice.label}`,
                })}
              />
            </article>
          </section>

          <section className="grid">
            <article className="panel">
              <h2>Trend</h2>
              <p className="muted">One point is one month. Arrived entered that month. Completed and still open are from that same group. Click a month to open those SOPs.</p>
              <div className="legend">
                <span><i className="bar-arrived" /> Arrived</span>
                <span><i className="bar-done" /> Completed</span>
                <span><i className="bar-open" /> Still open</span>
              </div>
              <LineChart
                rows={trendRows(data.monthly, months)}
                series={[
                  { key: 'arrived', color: '#7dd3fc' },
                  { key: 'completed', color: '#3ee0c0' },
                  { key: 'remaining', color: '#f0a05a' },
                ]}
                onPick={(row) => onOpenList({ view: 'monthArrived', title: row.month, entryMonth: row.month, entryMonths: '' })}
              />
            </article>
            <article className="panel">
              <h2>On time</h2>
              <p className="muted">Of the completed SOPs that had a promised date, how many shipped on or before that date. Click the gauge to open them.</p>
              <Gauge
                value={data.kpis.onTimeRate}
                note={`${data.kpis.onTimeRate ?? '—'}% shipped on or before ODD`}
                onPick={() => onOpenList({ view: 'onTime', title: 'On time' })}
              />
            </article>
          </section>

          <TimeCompare
            waiting={data.stages.find((stage) => stage.key === 'productionDays')?.medianDays}
            cleared={data.kpis.medianCycle}
            waitingLabel="Production"
            clearedLabel="Full cycle"
            waitingNote="Median days spent in production"
            clearedNote={`${num(data.kpis.completed)} completed SOPs, entry to delivery`}
            onWaiting={() => onOpenList({ view: 'completed', title: 'Completed' })}
            onCleared={() => onOpenList({ view: 'completed', title: 'Completed' })}
          />

          <section className="grid">
            <article className="panel">
              <h2>Cycle time distribution</h2>
              <p className="muted">Click a band to open every completed SOP in it.</p>
              <Histogram
                buckets={data.histogram}
                onPick={(bucket) => onOpenList({
                  view: 'cycleBucket',
                  minCycle: bucket.min,
                  maxCycle: bucket.max,
                  title: `Cycle ${bucket.label}`,
                })}
              />
            </article>
            <article className="panel">
              <h2>Open work by stage</h2>
              <p className="muted">Bar length is how many SOPs are in that stage. Click one to list them.</p>
              <Meter
                tone="warn"
                rows={data.openByStage.map((row) => ({
                  key: row.stage,
                  label: row.stage,
                  amount: row.count,
                  figure: num(row.count),
                }))}
                onPick={(row) => onOpenList({ view: 'open', stage: row.label, title: `Open · ${row.label}` })}
              />
            </article>
          </section>

          <section className="panel">
            <div className="list-head">
              <div>
                <h2>Production time against total cycle</h2>
                <p className="muted">Each dot is a completed SOP. Amber finished after ODD. Click a dot for that SOP. Axes stop at the 95th percentile so a few extreme jobs do not flatten the rest.</p>
              </div>
              <div className="legend">
                <span><i className="seg-prod" /> On time</span>
                <span><i className="seg-qa" /> Late</span>
              </div>
            </div>
            <ScatterPlot points={data.scatter} onPick={onOpenDetail} />
          </section>

          <AllTotals monthly={data.monthly} onOpenList={onOpenList} />

          <MonthBoard monthly={data.monthly} onOpenList={onOpenList} />

          <section className="grid">
            <article className="panel">
              <h2>Median days by stage</h2>
              <p className="muted">Completed SOPs only. Production is the stage to study first when the median is the longest.</p>
              <StageBars stages={data.stages} />
              <h3>Parts shortage, while still in production</h3>
              <TimeCompare
                waiting={data.compare.withBackorder.medianDays}
                cleared={data.compare.withoutBackorder.medianDays}
                waitingLabel="With a shortage"
                clearedLabel="Parts clear"
                waitingNote={`${num(data.compare.withBackorder.sample)} SOPs still in production`}
                clearedNote={`${num(data.compare.withoutBackorder.sample)} SOPs still in production`}
                onWaiting={() => onOpenList({ view: 'productionBackorder', title: 'In production with a shortage' })}
                onCleared={() => onOpenList({ view: 'productionClear', title: 'In production, parts clear' })}
              />
            </article>
          </section>

          <section className="ranks">
            <Rank title="Customers" rows={data.customers} onPick={(name) => onOpenList({ view: 'tracked', customer: name, title: name })} />
            <Rank title="Programs" rows={data.programs} onPick={(name) => onOpenList({ view: 'tracked', program: name, title: name })} />
            <Rank title="Lead hands" rows={data.leadHands} onPick={(name) => onOpenList({ view: 'tracked', leadHand: name, title: name })} />
          </section>
        </>
      )}
    </>
  )
}

function AllTotals({ monthly, onOpenList }) {
  const allTotal = monthly.reduce(
    (sum, row) => ({
      arrived: sum.arrived + row.arrived,
      completed: sum.completed + row.completed,
      remaining: sum.remaining + row.remaining,
    }),
    { arrived: 0, completed: 0, remaining: 0 },
  )

  function open(kind, title) {
    onOpenList({
      view: kind === 'arrived' ? 'monthArrived' : kind === 'completed' ? 'monthCompleted' : 'monthRemaining',
      title,
      entryMonth: '',
      entryMonths: '',
    })
  }

  return (
    <section className="panel">
      <div className="all-total">
        <button type="button" onClick={() => open('arrived', 'All SOPs')}>
          <span>All total SOP</span>
          <strong>{num(allTotal.arrived)}</strong>
        </button>
        <button type="button" className="tone-ok" onClick={() => open('completed', 'All completed SOPs')}>
          <span>Completed</span>
          <strong>{num(allTotal.completed)}</strong>
        </button>
        <button type="button" className="tone-open" onClick={() => open('remaining', 'All still open')}>
          <span>Still open</span>
          <strong>{num(allTotal.remaining)}</strong>
        </button>
      </div>
    </section>
  )
}

function monthLabel(month) {
  const [year, index] = month.split('-')
  return `${MONTH_NAMES[Number(index) - 1]} ${year}`
}

function MonthBoard({ monthly, onOpenList }) {
  const years = [...new Set(monthly.map((row) => row.month.slice(0, 4)))].sort((a, b) => b.localeCompare(a))
  const [year, setYear] = useState(years[0] || '')
  const [picked, setPicked] = useState([])

  useEffect(() => {
    setPicked([])
  }, [year])

  const yearRows = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`
    return monthly.find((row) => row.month === month) || { month, arrived: 0, completed: 0, remaining: 0 }
  })
  const visible = picked.length ? yearRows.filter((row) => picked.includes(row.month)) : yearRows
  const total = visible.reduce(
    (sum, row) => ({
      arrived: sum.arrived + row.arrived,
      completed: sum.completed + row.completed,
      remaining: sum.remaining + row.remaining,
    }),
    { arrived: 0, completed: 0, remaining: 0 },
  )

  function toggle(month) {
    setPicked((current) => (
      current.includes(month) ? current.filter((item) => item !== month) : [...current, month].sort()
    ))
  }

  function open(months, kind, title) {
    onOpenList({
      view: kind === 'arrived' ? 'monthArrived' : kind === 'completed' ? 'monthCompleted' : 'monthRemaining',
      title,
      entryMonth: months.length === 1 ? months[0] : '',
      entryMonths: months.length > 1 ? months.join(',') : '',
    })
  }

  const selected = picked.length ? picked : visible.map((row) => row.month)
  const scopeLabel = picked.length
    ? `${picked.map((month) => MONTH_NAMES[Number(month.slice(5)) - 1]).join(', ')} ${year}`
    : year

  return (
    <section className="panel">
      <div className="list-head">
        <div>
          <h2>Month by month</h2>
          <p className="muted">Arrived is SOPs entered that month. Completed and still open are counted from that same group.</p>
        </div>
        <label>
          Year
          <select value={year} onChange={(event) => setYear(event.target.value)}>
            {years.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>
      <div className="total-group">
        <h3>{scopeLabel}</h3>
        <div className="all-total">
          <button type="button" onClick={() => open(selected, 'arrived', `${scopeLabel} · arrived`)}>
            <span>Total SOP</span>
            <strong>{num(total.arrived)}</strong>
          </button>
          <button type="button" className="tone-ok" onClick={() => open(selected, 'completed', `${scopeLabel} · completed`)}>
            <span>Completed</span>
            <strong>{num(total.completed)}</strong>
          </button>
          <button type="button" className="tone-open" onClick={() => open(selected, 'remaining', `${scopeLabel} · still open`)}>
            <span>Still open</span>
            <strong>{num(total.remaining)}</strong>
          </button>
        </div>
      </div>
      <div className="month-picks">
        {yearRows.map((row) => (
          <button
            key={row.month}
            type="button"
            className={picked.includes(row.month) ? 'on' : ''}
            onClick={() => toggle(row.month)}
          >
            {MONTH_NAMES[Number(row.month.slice(5)) - 1]}
          </button>
        ))}
        {picked.length > 0 && (
          <button type="button" className="clear" onClick={() => setPicked([])}>Clear</button>
        )}
      </div>
      <div className="legend">
        <span><i className="bar-arrived" /> Arrived</span>
        <span><i className="bar-done" /> Completed</span>
        <span><i className="bar-open" /> Still open</span>
      </div>
      <MonthBars rows={visible} onPick={(row, kind) => open([row.month], kind, `${monthLabel(row.month)} · ${kind === 'arrived' ? 'arrived' : kind === 'completed' ? 'completed' : 'still open'}`)} />
      <div className="table-wrap">
        <table className="months-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Arrived</th>
              <th>Completed</th>
              <th>Still open</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.month} className={picked.includes(row.month) ? 'picked' : ''}>
                <td>{monthLabel(row.month)}</td>
                <td><Count value={row.arrived} onClick={() => open([row.month], 'arrived', `${monthLabel(row.month)} · arrived`)} /></td>
                <td><Count value={row.completed} onClick={() => open([row.month], 'completed', `${monthLabel(row.month)} · completed`)} /></td>
                <td><Count value={row.remaining} onClick={() => open([row.month], 'remaining', `${monthLabel(row.month)} · still open`)} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>{picked.length ? `${picked.length} months` : year}</td>
              <td><Count value={total.arrived} onClick={() => open(selected, 'arrived', `${picked.length ? 'Selected months' : year} · arrived`)} /></td>
              <td><Count value={total.completed} onClick={() => open(selected, 'completed', `${picked.length ? 'Selected months' : year} · completed`)} /></td>
              <td><Count value={total.remaining} onClick={() => open(selected, 'remaining', `${picked.length ? 'Selected months' : year} · still open`)} /></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

function Count({ value, onClick }) {
  if (!value) return '—'
  return <button type="button" className="link" onClick={onClick}>{value.toLocaleString()}</button>
}

function Rank({ title, rows, onPick }) {
  return (
    <article className="panel">
      <h2>{title}</h2>
      <p className="muted">Bar length is the median cycle. Click a name to open those SOPs.</p>
      <Meter
        rows={rows.map((row) => ({
          key: row.name,
          label: row.name,
          amount: row.medianCycle || 0,
          figure: days(row.medianCycle),
          note: `${row.lateRate ?? '—'}% late · ${row.overdue} overdue · ${row.open} open`,
        }))}
        onPick={(row) => onPick(row.label)}
      />
    </article>
  )
}
