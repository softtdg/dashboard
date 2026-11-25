import { useEffect, useState } from 'react'
import {
  Boxes,
  CalendarClock,
  ChartNoAxesColumnIncreasing,
  CircleCheck,
  FileText,
  Hourglass,
  Package,
} from 'lucide-react'
import { Donut, Histogram, MonthBars, OpenStageBars } from '../sop/Charts'
import { SparkKpi, spark } from '../sop/SparkKpi'
import { days, num } from '../sop/views'
import { Meter, TimeCompare } from './Meter'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const PERIODS = [
  { value: '12', label: 'Last 12 months' },
  { value: '24', label: 'Last 24 months' },
  { value: '36', label: 'Last 36 months' },
  { value: '0', label: 'All since 2015' },
]

const CARDS = [
  ['lines', 'Backorder lines', 'total', 'In this window', '', FileText, 'blue', '#60a5fa', 'total'],
  ['open', 'Still short', 'open', null, 'tone-open', Hourglass, 'amber', '#fbbf24', 'open'],
  ['closed', 'Cleared', 'closed', null, 'tone-ok', CircleCheck, 'green', '#34d399', 'closed'],
  ['stuck', 'Open over 30 days', 'stuck', 'Still waiting', 'tone-bad', CalendarClock, 'pink', '#fb7185', 'stuck'],
]

export default function BackorderBoard({ data, error, loading, months, filters, onMonths, onFilters, onOpenList }) {
  return (
    <>
      <header>
        <div>
          <p className="eyebrow">Backorder research</p>
          <h1>Who is short, and how long a shortage waits</h1>
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
      {!data && loading && <p className="muted">Reading backorders…</p>}
      {data && (
        <>
          <FilterBar data={data} filters={filters} onFilters={onFilters} loading={loading} />
          <section className="findings">
            {data.findings.map((finding) => <p key={finding}>{finding}</p>)}
          </section>
          <section className="kpis">
            {CARDS.map(([view, label, field, note, tone, Icon, swatch, color, key]) => (
              <SparkKpi
                key={view}
                label={label}
                value={data.kpis[field]}
                note={
                  view === 'open' ? `${days(data.kpis.medianOpen)} median waiting`
                    : view === 'closed' ? `${days(data.kpis.medianClose)} median to clear`
                      : note
                }
                tone={tone}
                icon={Icon}
                swatch={swatch}
                color={color}
                spark={spark(data.trends, key)}
                onClick={() => onOpenList({ view, title: label })}
              />
            ))}
            <SparkKpi label="Parts still short" value={data.kpis.partsOpen} note={`${num(data.kpis.qtyShort)} pieces`} tone="tone-info" icon={Package} swatch="violet" color="#c4b5fd" spark={spark(data.trends, 'partsOpen')} onClick={() => onOpenList({ view: 'open', title: 'Parts still short' })} />
            <SparkKpi label="SOPs with a shortage" value={data.kpis.sopsOpen} note="Open backorder on the SOP" tone="tone-open" icon={Boxes} swatch="teal" color="#5eead4" spark={spark(data.trends, 'sopsOpen')} onClick={() => onOpenList({ view: 'open', title: 'SOPs with a shortage' })} />
          </section>

          <section className="rings">
            <article className="panel">
              <h2 className="with-ico"><ChartNoAxesColumnIncreasing size={18} /> Still short against cleared</h2>
              <p className="muted">Click a slice to open those lines.</p>
              <Donut
                caption="lines"
                slices={[
                  { label: 'Still short', value: data.kpis.open, color: '#f0a05a', view: 'open' },
                  { label: 'Cleared', value: data.kpis.closed, color: '#3ee0c0', view: 'closed' },
                ]}
                onPick={(slice) => onOpenList({ view: slice.view, title: slice.label })}
              />
            </article>
            <article className="panel">
              <h2>How long open ones have waited</h2>
              <p className="muted">Counted from the notice date.</p>
              <Donut
                caption="open"
                slices={data.openAge.filter((row) => row.count > 0).map((row) => ({
                  label: row.label,
                  value: row.count,
                  min: row.min,
                  max: row.max,
                }))}
                onPick={(slice) => onOpenList({ view: 'ageBucket', min: slice.min, max: slice.max, title: `Waiting ${slice.label}` })}
              />
            </article>
            <article className="panel">
              <h2>Days to clear</h2>
              <p className="muted">Cleared backorders only.</p>
              <Donut
                caption="cleared"
                slices={data.histogram.filter((row) => row.count > 0).map((row) => ({
                  label: row.label,
                  value: row.count,
                  min: row.min,
                  max: row.max,
                }))}
                onPick={(slice) => onOpenList({ view: 'closeBucket', min: slice.min, max: slice.max, title: `Cleared in ${slice.label}` })}
              />
            </article>
          </section>

          <TimeCompare
            waiting={data.kpis.medianOpen}
            cleared={data.kpis.medianClose}
            waitingNote={`${num(data.kpis.open)} lines still short`}
            clearedNote={`${num(data.kpis.closed)} lines already cleared`}
            onWaiting={() => onOpenList({ view: 'open', title: 'Still short' })}
            onCleared={() => onOpenList({ view: 'closed', title: 'Cleared' })}
          />

          <section className="grid">
            <article className="panel">
              <h2>Days to clear</h2>
              <p className="muted">Cleared backorders only. Click a band to open those lines.</p>
              <Histogram
                buckets={data.histogram}
                onPick={(bucket) => onOpenList({
                  view: 'closeBucket',
                  min: bucket.min,
                  max: bucket.max,
                  title: `Cleared in ${bucket.label}`,
                })}
              />
            </article>
            <article className="panel">
              <h2>How long open ones have waited</h2>
              <p className="muted">Counted from the notice date. Click a band.</p>
              <OpenStageBars
                rows={data.openAge.filter((row) => row.count > 0).map((row) => ({ stage: row.label, count: row.count, ...row }))}
                onPick={(label) => {
                  const bucket = data.openAge.find((row) => row.label === label)
                  onOpenList({ view: 'ageBucket', min: bucket.min, max: bucket.max, title: `Waiting ${label}` })
                }}
              />
            </article>
          </section>

          <MonthBoard monthly={data.monthly} all={data.all} openCount={data.kpis.open} onOpenList={onOpenList} />

          <section className="ranks duo">
            <Rank title="Customers" hint="Bar length is how many lines are still short." rows={data.customers} onPick={(name) => onOpenList({ view: 'open', customer: name, title: name })} />
            <Rank title="Lead hands" hint="Who is carrying the open shortages." rows={data.leadHands} onPick={(name) => onOpenList({ view: 'open', leadHand: name, title: name })} />
            <Rank title="Parts" hint="The part number on the backorder." rows={data.parts} onPick={(name) => onOpenList({ view: 'open', part: name, title: name })} />
            <Rank title="Programs" hint="Open shortages by program." rows={data.programs} onPick={(name) => onOpenList({ view: 'open', program: name, title: name })} />
          </section>
        </>
      )}
    </>
  )
}

function FilterBar({ data, filters, onFilters, loading }) {
  return (
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
  )
}

function Rank({ title, hint, rows, onPick }) {
  return (
    <article className="panel">
      <h2>{title}</h2>
      <p className="muted">{hint}</p>
      <Meter
        tone="warn"
        rows={rows.map((row) => ({
          key: row.name,
          label: row.name,
          amount: row.open,
          figure: row.open,
          note: `${days(row.medianOpen)} waiting · ${days(row.medianClose)} to clear · ${num(row.shortQty)} short`,
        }))}
        onPick={(row) => onPick(row.label)}
      />
    </article>
  )
}

function monthLabel(month) {
  const [year, index] = month.split('-')
  return `${MONTH_NAMES[Number(index) - 1]} ${year}`
}

function MonthBoard({ monthly, all, openCount, onOpenList }) {
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
  const selected = picked.length ? picked : visible.map((row) => row.month)
  const scopeLabel = picked.length
    ? `${picked.map((month) => MONTH_NAMES[Number(month.slice(5)) - 1]).join(', ')} ${year}`
    : year

  function open(months, kind, title) {
    onOpenList({
      view: kind === 'arrived' ? 'monthArrived' : kind === 'completed' ? 'monthClosed' : 'monthOpen',
      title,
      entryMonth: months.length === 1 ? months[0] : '',
      entryMonths: months.length > 1 ? months.join(',') : '',
    })
  }

  return (
    <section className="panel">
      <div className="all-total">
        <button type="button" onClick={() => open([], 'arrived', 'All backorders')}>
          <span>All backorders</span>
          <strong>{num(all.arrived)}</strong>
        </button>
        <button type="button" className="tone-ok" onClick={() => open([], 'completed', 'All cleared')}>
          <span>Cleared</span>
          <strong>{num(all.completed)}</strong>
        </button>
        <button type="button" className="tone-open" onClick={() => onOpenList({ view: 'open', title: 'All still short' })}>
          <span>Still short</span>
          <strong>{num(openCount)}</strong>
        </button>
      </div>
      <div className="list-head">
        <div>
          <h2>Month by month</h2>
          <p className="muted">Arrived is the month the shortage was noticed. Cleared and still short come from that same group.</p>
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
          <button type="button" onClick={() => open(selected, 'arrived', `${scopeLabel} · noticed`)}>
            <span>Noticed</span>
            <strong>{num(total.arrived)}</strong>
          </button>
          <button type="button" onClick={() => open(selected, 'completed', `${scopeLabel} · cleared`)}>
            <span>Cleared</span>
            <strong>{num(total.completed)}</strong>
          </button>
          <button type="button" onClick={() => open(selected, 'remaining', `${scopeLabel} · still short`)}>
            <span>Still short</span>
            <strong>{num(total.remaining)}</strong>
          </button>
        </div>
      </div>
      <div className="month-picks">
        {yearRows.map((row) => (
          <button key={row.month} type="button" className={picked.includes(row.month) ? 'on' : ''} onClick={() => setPicked((current) => current.includes(row.month) ? current.filter((item) => item !== row.month) : [...current, row.month].sort())}>
            {MONTH_NAMES[Number(row.month.slice(5)) - 1]}
          </button>
        ))}
        {picked.length > 0 && <button type="button" className="clear" onClick={() => setPicked([])}>Clear</button>}
      </div>
      <div className="legend">
        <span><i className="bar-arrived" /> Noticed</span>
        <span><i className="bar-done" /> Cleared</span>
        <span><i className="bar-open" /> Still short</span>
      </div>
      <MonthBars rows={visible} onPick={(row, kind) => open([row.month], kind, `${monthLabel(row.month)} · ${kind === 'arrived' ? 'noticed' : kind === 'completed' ? 'cleared' : 'still short'}`)} />
      <div className="table-wrap">
        <table className="months-table">
          <thead>
            <tr><th>Month</th><th>Noticed</th><th>Cleared</th><th>Still short</th></tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.month}>
                <td>{monthLabel(row.month)}</td>
                <td><Count value={row.arrived} onClick={() => open([row.month], 'arrived', `${monthLabel(row.month)} · noticed`)} /></td>
                <td><Count value={row.completed} onClick={() => open([row.month], 'completed', `${monthLabel(row.month)} · cleared`)} /></td>
                <td><Count value={row.remaining} onClick={() => open([row.month], 'remaining', `${monthLabel(row.month)} · still short`)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Count({ value, onClick }) {
  if (!value) return '—'
  return <button type="button" className="link" onClick={onClick}>{value.toLocaleString()}</button>
}
