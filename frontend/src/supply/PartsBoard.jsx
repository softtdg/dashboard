import { CalendarDays, ChartNoAxesColumnIncreasing, CircleCheck, Hourglass, Package, ShoppingCart } from 'lucide-react'
import { Donut } from '../sop/Charts'
import { SparkKpi, spark } from '../sop/SparkKpi'
import { days, num } from '../sop/views'
import { Meter, TimeCompare } from './Meter'

const PERIODS = [
  { value: '12', label: 'Last 12 months' },
  { value: '24', label: 'Last 24 months' },
  { value: '36', label: 'Last 36 months' },
  { value: '0', label: 'All since 2015' },
]

export default function PartsBoard({ data, error, loading, months, filters, onMonths, onFilters, onOpenLines, onOpenPurchases }) {
  return (
    <>
      <header>
        <div>
          <p className="eyebrow">Parts research</p>
          <h1>Which part is short, and which one takes longest</h1>
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
      {!data?.purchase && loading && <p className="muted">Reading parts…</p>}
      {data?.purchase && (
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
            <SparkKpi label="Parts seen" value={data.kpis.parts} note="On a backorder in this window" icon={Package} swatch="blue" color="#60a5fa" spark={spark(data.trends, 'parts')} onClick={() => onOpenLines({ view: 'lines', title: 'Parts in this window' })} />
            <SparkKpi label="Still short" value={data.kpis.openParts} note={`${days(data.kpis.medianOpen)} median waiting`} tone="tone-open" icon={Hourglass} swatch="amber" color="#fbbf24" spark={spark(data.trends, 'openParts')} onClick={() => onOpenLines({ view: 'open', title: 'Parts still short' })} />
            <SparkKpi label="Cleared shortages" value={days(data.kpis.medianClose)} note="Median days to clear" tone="tone-ok" icon={CircleCheck} swatch="green" color="#34d399" spark={spark(data.trends, 'closed')} onClick={() => onOpenLines({ view: 'closed', title: 'Cleared shortages' })} />
            <SparkKpi label="Pieces still short" value={data.kpis.qtyShort} note="Quantity not received" tone="tone-info" icon={Package} swatch="teal" color="#5eead4" spark={spark(data.trends, 'qtyShort')} onClick={() => onOpenLines({ view: 'open', title: 'Pieces still short' })} />
            <SparkKpi label="Open purchase lines" value={data.kpis.poLines} note={`${num(data.kpis.poQty)} pieces not received`} tone="tone-open" icon={ShoppingCart} swatch="violet" color="#c4b5fd" spark={spark(data.purchaseTrends, 'poLines')} onClick={() => onOpenPurchases({ title: 'Open purchase lines' })} />
            <SparkKpi label="Past promised date" value={data.kpis.poLate} note={`${num(data.kpis.vendors)} vendors`} tone="tone-bad" icon={CalendarDays} swatch="pink" color="#fb7185" spark={spark(data.purchaseTrends, 'poLate')} onClick={() => onOpenPurchases({ view: 'late', title: 'Past the promised date' })} />
          </section>

          <section className="rings">
            <article className="panel">
              <h2 className="with-ico"><ChartNoAxesColumnIncreasing size={18} /> Parts still short</h2>
              <p className="muted">Seen on a backorder in this window.</p>
              <Donut
                caption="parts"
                slices={[
                  { label: 'Still short', value: data.kpis.openParts, color: '#f0a05a', view: 'open', title: 'Parts still short' },
                  { label: 'Not short now', value: Math.max(data.kpis.parts - data.kpis.openParts, 0), color: '#3ee0c0', view: 'closed', title: 'Cleared shortages' },
                ]}
                onPick={(slice) => onOpenLines({ view: slice.view, title: slice.title })}
              />
            </article>
            <article className="panel">
              <h2>Short most often</h2>
              <p className="muted">Open lines on the busiest parts.</p>
              <Donut
                caption="lines"
                slices={data.mostOpen.slice(0, 6).map((row) => ({
                  label: row.part,
                  value: row.open,
                  part: row.part,
                }))}
                onPick={(slice) => onOpenLines({ view: 'open', part: slice.part, title: slice.part })}
              />
            </article>
            <article className="panel">
              <h2>Purchase lines</h2>
              <p className="muted">Open purchasing lines, including old ones never closed.</p>
              <Donut
                caption="POs"
                slices={[
                  { label: 'Past promised date', value: data.kpis.poLate, color: '#fb7185', view: 'late', title: 'Past the promised date' },
                  { label: 'Still inside the date', value: Math.max(data.kpis.poLines - data.kpis.poLate, 0), color: '#7dd3fc', view: '', title: 'Open purchase lines' },
                ]}
                onPick={(slice) => onOpenPurchases({ view: slice.view, title: slice.title })}
              />
            </article>
          </section>

          <TimeCompare
            waiting={data.kpis.medianOpen}
            cleared={data.kpis.medianClose}
            waitingNote={`${num(data.kpis.openParts)} parts still short`}
            clearedNote="Median across shortages that already cleared"
            onWaiting={() => onOpenLines({ view: 'open', title: 'Parts still short' })}
            onCleared={() => onOpenLines({ view: 'closed', title: 'Cleared shortages' })}
          />

          <section className="panel">
            <h2>Parts short most often</h2>
            <p className="muted">Bar length is open backorder lines. Click a part to see every shortage.</p>
            <PartBoard rows={data.mostOpen} onOpen={onOpenLines} />
          </section>

          <section className="ranks duo">
            <article className="panel">
              <h2>Slowest to clear</h2>
              <p className="muted">Median days from notice to close. At least 3 cleared lines.</p>
              <Meter
                rows={data.slowest.map((row) => ({
                  key: row.part,
                  label: row.part,
                  detail: row.description,
                  amount: row.medianClose || 0,
                  figure: days(row.medianClose),
                  note: `${row.closed} cleared · ${row.open} still open`,
                  part: row.part,
                }))}
                onPick={(row) => onOpenLines({ view: 'closed', part: row.part, title: row.part })}
              />
            </article>
            <article className="panel">
              <h2>Most pieces still short</h2>
              <p className="muted">Quantity still not received.</p>
              <Meter
                tone="warn"
                rows={data.mostQty.map((row) => ({
                  key: row.part,
                  label: row.part,
                  detail: row.description,
                  amount: row.shortQty,
                  figure: num(row.shortQty),
                  note: `${row.open} open lines · ${row.sops} SOPs`,
                  part: row.part,
                }))}
                onPick={(row) => onOpenLines({ view: 'open', part: row.part, title: row.part })}
              />
            </article>
          </section>

          <section className="panel">
            <h2>Open purchase lines</h2>
            <p className="muted">Lines purchasing still has open, including old ones never closed. The window above applies to shortages, not to this list. Location filters the company.</p>
            <div className="duo">
              <div>
                <h3>Vendors</h3>
                <Meter
                  tone="bad"
                  rows={data.purchase.vendors.map((row) => ({
                    key: row.name,
                    label: row.name,
                    amount: row.lines,
                    figure: row.lines,
                    note: `${num(row.shortQty)} short · ${days(row.medianAge)} since ordered · ${row.late} late`,
                  }))}
                  onPick={(row) => onOpenPurchases({ vendor: row.label, title: row.label })}
                />
              </div>
              <div>
                <h3>Items</h3>
                <Meter
                  tone="warn"
                  rows={data.purchase.items.map((row) => ({
                    key: row.name,
                    label: row.name,
                    amount: row.shortQty,
                    figure: num(row.shortQty),
                    note: `${row.lines} lines · ${days(row.medianAge)} since ordered · ${row.late} late`,
                  }))}
                  onPick={(row) => onOpenPurchases({ item: row.label, title: row.label })}
                />
              </div>
            </div>
          </section>
        </>
      )}
    </>
  )
}

function PartBoard({ rows, onOpen }) {
  const peak = Math.max(...rows.map((row) => row.open || 0), 1)
  return (
    <ul className="part-board">
      {rows.map((row, index) => (
        <li key={row.part}>
          <button type="button" onClick={() => onOpen({ view: 'open', part: row.part, title: row.part })}>
            <em className="idx">{index + 1}</em>
            <span>
              <strong>{row.part}</strong>
              <small>{row.description || row.vendor || 'No description'}</small>
            </span>
            <span className="barline warn"><span style={{ width: `${(row.open / peak) * 100}%` }} /></span>
            <span className="chips">
              <i>{row.open} open</i>
              <i>{days(row.medianOpen)} waiting</i>
              <i>{num(row.shortQty)} pcs</i>
              <i>{row.sops} SOPs</i>
            </span>
          </button>
        </li>
      ))}
      {rows.length === 0 && <li className="muted">No part is short in this cut.</li>}
    </ul>
  )
}
