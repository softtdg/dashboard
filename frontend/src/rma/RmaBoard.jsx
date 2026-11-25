import { useEffect, useState } from 'react'
import {
  CalendarOff,
  ChartNoAxesColumnIncreasing,
  CircleOff,
  FileText,
  Handshake,
  PackageCheck,
  Shield,
  Tag,
  Wrench,
} from 'lucide-react'
import { Donut, Histogram, MonthBars } from '../sop/Charts'
import { SparkKpi, spark } from '../sop/SparkKpi'
import { days, num } from '../sop/views'
import { Meter, TimeCompare } from '../supply/Meter'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const PERIODS = [
  { value: '12', label: 'Last 12 months' },
  { value: '24', label: 'Last 24 months' },
  { value: '36', label: 'Last 36 months' },
  { value: '0', label: 'All since 2015' },
]
const DISPOSITION_COLOR = {
  Repair: '#a78bfa',
  Warranty: '#7dd3fc',
  Accommodation: '#fb7185',
  Unclassified: '#94a3b8',
}

export default function RmaBoard() {
  const [months, setMonths] = useState('0')
  const [filters, setFilters] = useState({ customer: '', defect: '' })
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState(null)
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ months })
    if (filters.customer) params.set('customer', filters.customer)
    if (filters.defect) params.set('defect', filters.defect)
    setLoading(true)
    setError('')
    fetch(`/api/rma/dashboard?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.message || 'RMA dashboard failed')
        setData(body.data)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [months, filters])

  if (detail) {
    return <RmaDetail row={detail} onClose={() => setDetail(null)} />
  }

  if (list) {
    return (
      <RmaList
        query={list}
        months={months}
        filters={filters}
        onBack={() => setList(null)}
        onOpen={setDetail}
      />
    )
  }

  return (
    <>
      <header>
        <div>
          <p className="eyebrow">RMA research</p>
          <h1>What comes back, and why</h1>
        </div>
        <label>
          Window
          <select value={months} onChange={(event) => setMonths(event.target.value)}>
            {PERIODS.map((period) => (
              <option key={period.value} value={period.value}>{period.label}</option>
            ))}
          </select>
        </label>
      </header>
      {error && <p className="banner">{error}</p>}
      {!data && loading && <p className="muted">Reading the RMA log…</p>}
      {data && (
        <>
          <FilterBar data={data} filters={filters} onFilters={setFilters} loading={loading} />
          <section className="findings">
            {data.findings.map((finding) => <p key={finding}>{finding}</p>)}
          </section>
          <section className="kpis">
            <SparkKpi label="RMAs" value={data.kpis.total} note="Logged in this window" icon={FileText} swatch="blue" color="#60a5fa" spark={spark(data.trends, 'total')} onClick={() => setList({ view: 'window', title: 'RMAs' })} />
            <SparkKpi label="Parts received" value={data.kpis.received} note={`${days(data.kpis.medianReceive)} median`} tone="tone-ok" icon={PackageCheck} swatch="green" color="#34d399" spark={spark(data.trends, 'received')} onClick={() => setList({ view: 'received', title: 'Parts received' })} />
            <SparkKpi label="No receive date" value={data.kpis.waiting} note="Date missing or not real" tone="tone-open" icon={CalendarOff} swatch="amber" color="#fbbf24" spark={spark(data.trends, 'waiting')} onClick={() => setList({ view: 'waiting', title: 'No receive date' })} />
            <SparkKpi label="Named defect" value={data.kpis.named} note="A code other than None" tone="tone-info" icon={Tag} swatch="teal" color="#5eead4" spark={spark(data.trends, 'named')} onClick={() => setList({ view: 'named', title: 'Named defect' })} />
            <SparkKpi label="Coded None" value={data.kpis.blank} note="No defect was named" tone="tone-bad" icon={CircleOff} swatch="pink" color="#fb7185" spark={spark(data.trends, 'blank')} onClick={() => setList({ view: 'blank', title: 'Coded None' })} />
            <SparkKpi label="Repair" value={data.kpis.repairCount} note={`${num(data.kpis.repairQty)} pieces`} icon={Wrench} swatch="violet" color="#c4b5fd" spark={spark(data.trends, 'repair')} onClick={() => setList({ view: 'window', item: 'Repair', title: 'Repair' })} />
            <SparkKpi label="Warranty" value={data.kpis.warrantyCount} note={`${num(data.kpis.warrantyQty)} pieces`} icon={Shield} swatch="blue" color="#7dd3fc" spark={spark(data.trends, 'warranty')} onClick={() => setList({ view: 'window', item: 'Warranty', title: 'Warranty' })} />
            <SparkKpi label="Accommodation" value={data.kpis.accomCount} note={`${num(data.kpis.accomQty)} pieces`} icon={Handshake} swatch="green" color="#34d399" spark={spark(data.trends, 'accom')} onClick={() => setList({ view: 'window', item: 'Accommodation', title: 'Accommodation' })} />
          </section>

          <section className="rings">
            <article className="panel">
              <h2 className="with-ico"><ChartNoAxesColumnIncreasing size={18} /> Received against still open</h2>
              <p className="muted">A receive date in 2015 or later counts as received. Click a slice.</p>
              <Donut
                caption="RMAs"
                slices={[
                  { label: 'Parts received', value: data.kpis.received, color: '#3ee0c0', view: 'received' },
                  { label: 'No receive date', value: data.kpis.waiting, color: '#f0a05a', view: 'waiting' },
                ]}
                onPick={(slice) => setList({ view: slice.view, title: slice.label })}
              />
            </article>
            <article className="panel">
              <h2>How the return was handled</h2>
              <p className="muted">Each RMA is counted once, by its largest quantity.</p>
              <Donut
                caption="RMAs"
                slices={data.disposition.map((row) => ({
                  label: row.label,
                  value: row.count,
                  color: DISPOSITION_COLOR[row.label],
                }))}
                onPick={(slice) => setList({ view: 'window', item: slice.label, title: slice.label })}
              />
            </article>
            <article className="panel">
              <h2>Days until parts came back</h2>
              <p className="muted">From the RMA date to the receive date.</p>
              <Donut
                caption="received"
                slices={data.histogram.filter((row) => row.count > 0).map((row) => ({
                  label: row.label,
                  value: row.count,
                  min: row.min,
                  max: row.max,
                }))}
                onPick={(slice) => setList({ view: 'receiveBucket', min: slice.min, max: slice.max, title: `Received in ${slice.label}` })}
              />
            </article>
          </section>

          <TimeCompare
            waiting={data.kpis.medianRepair}
            cleared={data.kpis.medianWarranty}
            waitingLabel="Repair"
            clearedLabel="Warranty"
            waitingNote={`${num(data.kpis.repairCount)} returns handled as repair`}
            clearedNote={`${num(data.kpis.warrantyCount)} returns handled as warranty`}
            onWaiting={() => setList({ view: 'window', item: 'Repair', title: 'Repair' })}
            onCleared={() => setList({ view: 'window', item: 'Warranty', title: 'Warranty' })}
          />

          <article className="panel">
            <h2>Days until parts came back</h2>
            <p className="muted">Click a band to open those RMAs.</p>
            <Histogram
              buckets={data.histogram}
              onPick={(bucket) => setList({
                view: 'receiveBucket',
                min: bucket.min,
                max: bucket.max,
                title: `Received in ${bucket.label}`,
              })}
            />
          </article>

          <MonthBoard monthly={data.monthly} all={data.all} onOpenList={setList} />

          <section className="ranks">
            <Rank
              title="Customers"
              hint="Bar length is how many RMAs this customer logged."
              rows={data.customers}
              onPick={(name) => setList({ view: 'window', customer: name, title: name })}
            />
            <Rank
              title="Named defects"
              hint="Returns coded None are left out, so the named codes can be compared."
              rows={data.defects}
              onPick={(name) => setList({ view: 'window', defect: name, title: name })}
            />
            <Rank
              title="Customer parts"
              hint="The customer part number on the RMA."
              rows={data.parts}
              onPick={(name) => setList({ view: 'window', part: name, title: name })}
            />
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
        ['defect', 'Defect', data.options.defects],
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
        rows={rows.map((row) => ({
          key: row.name,
          label: row.name,
          amount: row.count,
          figure: num(row.count),
          note: `${days(row.medianReceive)} to receive · ${num(row.repairQty)} repair pcs`,
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

function MonthBoard({ monthly, all, onOpenList }) {
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

  function open(entryMonths, kind, title) {
    const view = kind === 'arrived' ? 'monthLogged' : kind === 'completed' ? 'monthReceived' : 'monthWaiting'
    onOpenList({
      view,
      title,
      entryMonth: entryMonths.length === 1 ? entryMonths[0] : '',
      entryMonths: entryMonths.length > 1 ? entryMonths.join(',') : '',
    })
  }

  return (
    <section className="panel">
      <div className="all-total">
        <button type="button" onClick={() => open([], 'arrived', 'All RMAs')}>
          <span>All RMAs</span>
          <strong>{num(all.arrived)}</strong>
        </button>
        <button type="button" className="tone-ok" onClick={() => open([], 'completed', 'All parts received')}>
          <span>Parts received</span>
          <strong>{num(all.completed)}</strong>
        </button>
        <button type="button" className="tone-open" onClick={() => open([], 'remaining', 'All with no receive date')}>
          <span>No receive date</span>
          <strong>{num(all.remaining)}</strong>
        </button>
      </div>
      <div className="list-head">
        <div>
          <h2>Month by month</h2>
          <p className="muted">Logged is the month the RMA was dated. Received and still waiting come from that same group.</p>
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
          <button type="button" onClick={() => open(selected, 'arrived', `${scopeLabel} · logged`)}>
            <span>Logged</span>
            <strong>{num(total.arrived)}</strong>
          </button>
          <button type="button" onClick={() => open(selected, 'completed', `${scopeLabel} · received`)}>
            <span>Received</span>
            <strong>{num(total.completed)}</strong>
          </button>
          <button type="button" onClick={() => open(selected, 'remaining', `${scopeLabel} · no receive date`)}>
            <span>No receive date</span>
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
        <span><i className="bar-arrived" /> Logged</span>
        <span><i className="bar-done" /> Received</span>
        <span><i className="bar-open" /> No receive date</span>
      </div>
      <MonthBars
        rows={visible}
        onPick={(row, kind) => open(
          [row.month],
          kind,
          `${monthLabel(row.month)} · ${kind === 'arrived' ? 'logged' : kind === 'completed' ? 'received' : 'no receive date'}`,
        )}
      />
      <div className="table-wrap">
        <table className="months-table">
          <thead>
            <tr><th>Month</th><th>Logged</th><th>Received</th><th>No receive date</th></tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.month}>
                <td>{monthLabel(row.month)}</td>
                <td><Count value={row.arrived} onClick={() => open([row.month], 'arrived', `${monthLabel(row.month)} · logged`)} /></td>
                <td><Count value={row.completed} onClick={() => open([row.month], 'completed', `${monthLabel(row.month)} · received`)} /></td>
                <td><Count value={row.remaining} onClick={() => open([row.month], 'remaining', `${monthLabel(row.month)} · no receive date`)} /></td>
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

const COLUMNS = [
  ['rmaNumber', 'RMA'],
  ['customer', 'Customer'],
  ['part', 'Part'],
  ['defect', 'Defect'],
  ['disposition', 'Handled as'],
  ['qty', 'Qty'],
  ['receiveDays', 'To receive'],
  ['logged', 'Logged'],
]

function RmaList({ query, months, filters, onBack, onOpen }) {
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('')
  const [dir, setDir] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setPage(1)
    setQ('')
    setSort('')
    setDir('')
  }, [query])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({
      months,
      view: query.view || 'window',
      page: String(page),
      pageSize: '40',
    })
    const customer = query.customer ?? filters.customer
    const defect = query.defect ?? filters.defect
    if (customer) params.set('customer', customer)
    if (defect) params.set('defect', defect)
    if (query.part) params.set('part', query.part)
    if (query.item) params.set('item', query.item)
    if (query.entryMonth) params.set('entryMonth', query.entryMonth)
    if (query.entryMonths) params.set('entryMonths', query.entryMonths)
    if (query.min != null) params.set('min', String(query.min))
    if (query.max != null) params.set('max', String(query.max))
    if (q.trim()) params.set('q', q.trim())
    if (sort) params.set('sort', sort)
    if (dir) params.set('dir', dir)
    setLoading(true)
    setError('')
    fetch(`/api/rma/lines?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.message || 'Could not load RMAs')
        setData(body.data)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [query, months, filters, page, q, sort, dir])

  function toggleSort(key) {
    if (sort !== key) {
      setSort(key)
      setDir('desc')
    } else {
      setDir((current) => (current === 'desc' ? 'asc' : 'desc'))
    }
    setPage(1)
  }

  return (
    <section className="panel list-page">
      <div className="list-head">
        <div>
          <button type="button" className="back" onClick={onBack}>← Back</button>
          <h2>{query.title || 'RMAs'}</h2>
          <p className="muted">{data ? `${num(data.total)} RMAs.` : ''}</p>
        </div>
        <label>
          Search this list
          <input
            value={q}
            placeholder="RMA, customer, part, defect"
            onChange={(event) => { setQ(event.target.value); setPage(1) }}
          />
        </label>
      </div>
      {error && <p className="banner">{error}</p>}
      {loading && !data && <p className="muted">Loading RMAs…</p>}
      {data && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {COLUMNS.map(([key, label]) => (
                    <th key={key}>
                      <button type="button" className="sort" onClick={() => toggleSort(key)}>
                        {label}{sort === key ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <button type="button" className="link" onClick={() => onOpen(row)}>{row.rmaNumber || '—'}</button>
                    </td>
                    <td>{row.customer}</td>
                    <td>{row.customerPn || '—'}</td>
                    <td>{row.defect}</td>
                    <td>{row.disposition}</td>
                    <td>{num(row.totalQty)}</td>
                    <td>{days(row.receiveDays)}</td>
                    <td>{row.logged}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr><td colSpan={COLUMNS.length}>Nothing matches this cut.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
            <span>Page {data.page} of {data.pages}</span>
            <button type="button" disabled={page >= data.pages} onClick={() => setPage((current) => current + 1)}>Next</button>
          </div>
        </>
      )}
    </section>
  )
}

function RmaDetail({ row, onClose }) {
  return (
    <aside className="drawer">
      <button type="button" className="back" onClick={onClose}>← Back</button>
      <p className="eyebrow">{row.disposition}</p>
      <h2>{row.rmaNumber || 'RMA'}</h2>
      <p>{row.customer}</p>
      <p className="muted">{row.defect}</p>
      <dl>
        <div><dt>Logged</dt><dd>{row.logged}</dd></div>
        <div><dt>Parts received</dt><dd>{row.received || 'No usable date'}</dd></div>
        <div><dt>Days to receive</dt><dd>{days(row.receiveDays)}</dd></div>
        <div><dt>Customer part</dt><dd>{row.customerPn || '—'}</dd></div>
        <div><dt>Quantity</dt><dd>{num(row.totalQty)}</dd></div>
        <div><dt>Repair</dt><dd>{num(row.repairQty)}</dd></div>
        <div><dt>Warranty</dt><dd>{num(row.warrantyQty)}</dd></div>
        <div><dt>Accommodation</dt><dd>{num(row.accomQty)}</dd></div>
        <div><dt>Customer NCR</dt><dd>{row.ncr || '—'}</dd></div>
        <div><dt>Packing slip</dt><dd>{row.packingSlip || '—'}</dd></div>
        <div><dt>Serials</dt><dd>{row.serials || '—'}</dd></div>
      </dl>
      <h3>Customer description</h3>
      <p className="note">{row.customerDefect || 'None recorded.'}</p>
      <h3>TDG description</h3>
      <p className="note">{row.tdgDefect || 'None recorded.'}</p>
    </aside>
  )
}
