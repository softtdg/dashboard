import { useEffect, useState } from 'react'
import { Donut, Histogram } from '../sop/Charts'
import { days, num } from '../sop/views'
import { Meter } from '../supply/Meter'
import { MonthPanel, ResearchList } from './MonthPanel'

const PERIODS = [
  { value: '12', label: 'Last 12 months' },
  { value: '24', label: 'Last 24 months' },
  { value: '36', label: 'Last 36 months' },
  { value: '0', label: 'All since 2015' },
]

export default function DesignBoard() {
  const [months, setMonths] = useState('24')
  const [filters, setFilters] = useState({ requester: '', customer: '', project: '', field: '' })
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState(null)
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ months })
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value) })
    setLoading(true)
    setError('')
    fetch(`/api/research/design?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.message || 'Design dashboard failed')
        setData(body.data)
      })
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [months, filters])

  if (detail) return <DesignDetail row={detail} onClose={() => setDetail(null)} />
  if (list) {
    return (
      <LineFetch
        path="/api/research/design/lines"
        query={list}
        months={months}
        filters={filters}
        onBack={() => setList(null)}
        onOpen={setDetail}
        columns={list.view?.includes('change') || list.view === 'rejected' || list.view === 'accepted' || list.view === 'changeBucket'
          ? [['part', 'Part'], ['field', 'Field'], ['requester', 'Requester'], ['days', 'Days'], ['asked', 'Asked']]
          : [['requester', 'Requester'], ['customer', 'Customer'], ['project', 'Project'], ['components', 'Parts'], ['days', 'Days'], ['asked', 'Asked']]}
        placeholder="Requester, customer, part, field"
        render={(row) => (
          list.view?.includes('change') || list.view === 'rejected' || list.view === 'accepted' || list.view === 'changeBucket' ? (
            <tr key={`${row.kind}-${row.id}`}>
              <td><button type="button" className="link" onClick={() => setDetail(row)}>{row.part || '—'}</button></td>
              <td>{row.field}</td>
              <td>{row.requester}</td>
              <td>{days(row.days)}</td>
              <td>{row.asked}</td>
            </tr>
          ) : (
            <tr key={`${row.kind}-${row.id}`}>
              <td><button type="button" className="link" onClick={() => setDetail(row)}>{row.requester}</button></td>
              <td>{row.customer}</td>
              <td>{row.project}</td>
              <td>{num(row.done)}/{num(row.components)}</td>
              <td>{days(row.days)}</td>
              <td>{row.asked}</td>
            </tr>
          )
        )}
      />
    )
  }

  return (
    <>
      <header>
        <div>
          <p className="eyebrow">Design research</p>
          <h1>How fast a part number is issued</h1>
        </div>
        <Window months={months} onMonths={setMonths} />
      </header>
      {error && <p className="banner">{error}</p>}
      {!data && loading && <p className="muted">Reading design requests…</p>}
      {data && (
        <>
          <section className="filters">
            <Select label="Requester" value={filters.requester} options={data.options.requesters} onChange={(requester) => setFilters({ ...filters, requester })} />
            <Select label="Customer" value={filters.customer} options={data.options.customers} onChange={(customer) => setFilters({ ...filters, customer })} />
            <Select label="Project" value={filters.project} options={data.options.projects} onChange={(project) => setFilters({ ...filters, project })} />
            <Select label="Changed field" value={filters.field} options={data.options.fields} onChange={(field) => setFilters({ ...filters, field })} />
            {loading && <span className="muted">Updating…</span>}
          </section>
          <Findings items={data.findings} />
          <section className="kpis">
            <Kpi label="Requests" value={data.kpis.requests} note={`${days(data.kpis.medianRequest)} median to issue`} onClick={() => setList({ view: 'requests', title: 'Part number requests' })} />
            <Kpi label="Still waiting" value={data.kpis.open} note="Number not issued yet" tone="tone-open" onClick={() => setList({ view: 'open', title: 'Still waiting' })} />
            <Kpi label="Issued" value={data.kpis.done} note="Every part on the request has a number" tone="tone-ok" onClick={() => setList({ view: 'done', title: 'Issued' })} />
            <Kpi label="Changes" value={data.kpis.changes} note={`${days(data.kpis.medianChange)} median to close`} onClick={() => setList({ view: 'changes', title: 'Change requests' })} />
            <Kpi label="Rejected" value={data.kpis.rejected} note="Change was turned down" tone="tone-bad" onClick={() => setList({ view: 'rejected', title: 'Rejected changes' })} />
            <Kpi label="Accepted" value={data.kpis.accepted} note="Change was closed" tone="tone-info" onClick={() => setList({ view: 'accepted', title: 'Accepted changes' })} />
          </section>
          <section className="rings">
            <article className="panel">
              <h2>Issued against still waiting</h2>
              <p className="muted">A request is issued when every part on it has a completion date.</p>
              <Donut caption="requests" slices={[
                { label: 'Issued', value: data.kpis.done, color: '#3ee0c0', view: 'done' },
                { label: 'Still waiting', value: data.kpis.open, color: '#f0a05a', view: 'open' },
              ]} onPick={(slice) => setList({ view: slice.view, title: slice.label })} />
            </article>
            <article className="panel">
              <h2>Changes accepted or rejected</h2>
              <p className="muted">Every change in this window is already closed.</p>
              <Donut caption="changes" slices={[
                { label: 'Accepted', value: data.kpis.accepted, color: '#7dd3fc', view: 'accepted' },
                { label: 'Rejected', value: data.kpis.rejected, color: '#fb7185', view: 'rejected' },
              ]} onPick={(slice) => setList({ view: slice.view, title: slice.label })} />
            </article>
            <article className="panel">
              <h2>Days to issue a number</h2>
              <p className="muted">From the request to the last part number on it.</p>
              <Donut caption="issued" slices={data.requestAge.filter((row) => row.count).map((row) => ({ label: row.label, value: row.count, min: row.min, max: row.max }))} onPick={(slice) => setList({ view: 'requestBucket', min: slice.min, max: slice.max, title: `Issued in ${slice.label}` })} />
            </article>
          </section>
          <article className="panel">
            <h2>Days to close a change</h2>
            <p className="muted">Click a band to open those changes.</p>
            <Histogram buckets={data.changeAge} onPick={(bucket) => setList({ view: 'changeBucket', min: bucket.min, max: bucket.max, title: `Closed in ${bucket.label}` })} />
          </article>
          <MonthPanel
            monthly={data.monthly}
            all={data.all}
            labels={{
              all: 'All requests',
              done: 'Issued',
              still: 'Still waiting',
              arrived: 'Asked',
              hint: 'Asked is the month the request was made. Issued and still waiting come from that same group.',
              views: { arrived: 'monthRequests', completed: 'monthDone', remaining: 'monthOpen' },
            }}
            onOpen={setList}
          />
          <section className="ranks">
            <Rank title="Requesters" hint="Who asks for new part numbers." rows={data.requesters} onPick={(name) => setList({ view: 'requests', requester: name, title: name })} />
            <Rank title="Customers" hint="The customer named on the request." rows={data.customers} onPick={(name) => setList({ view: 'requests', customer: name, title: name })} />
            <Rank title="Changed fields" hint="Which master-list field people ask to change." rows={data.fields} onPick={(name) => setList({ view: 'changes', field: name, title: name })} />
          </section>
        </>
      )}
    </>
  )
}

function DesignDetail({ row, onClose }) {
  const change = row.kind === 'change'
  return (
    <aside className="drawer">
      <button type="button" className="back" onClick={onClose}>← Back</button>
      <p className="eyebrow">{change ? (row.rejected ? 'Rejected' : 'Accepted') : (row.open ? 'Waiting' : 'Issued')}</p>
      <h2>{change ? (row.part || row.field) : row.project}</h2>
      <p>{row.requester}</p>
      <dl>
        <div><dt>Asked</dt><dd>{row.asked}</dd></div>
        <div><dt>{change ? 'Closed' : 'Finished'}</dt><dd>{(change ? row.closed : row.finished) || '—'}</dd></div>
        <div><dt>Days</dt><dd>{days(row.days)}</dd></div>
        {change ? <div><dt>Field</dt><dd>{row.field}</dd></div> : <div><dt>Customer</dt><dd>{row.customer}</dd></div>}
        {change ? <div><dt>New value</dt><dd>{row.newValue || '—'}</dd></div> : <div><dt>Parts</dt><dd>{num(row.done)} / {num(row.components)}</dd></div>}
      </dl>
      {!change && <><h3>Note for admin</h3><p className="note">{row.comments || 'None recorded.'}</p></>}
    </aside>
  )
}

export function Window({ months, onMonths }) {
  return (
    <label>
      Window
      <select value={months} onChange={(event) => onMonths(event.target.value)}>
        {PERIODS.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}
      </select>
    </label>
  )
}

export function Select({ label, value, options, onChange }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  )
}

export function Findings({ items }) {
  return <section className="findings">{items.map((item) => <p key={item}>{item}</p>)}</section>
}

export function Kpi({ label, value, note, tone = '', onClick }) {
  return (
    <button type="button" className={`kpi ${tone}`} onClick={onClick}>
      <p>{label}</p>
      <strong>{num(value)}</strong>
      <span>{note}</span>
    </button>
  )
}

function Rank({ title, hint, rows, onPick }) {
  return (
    <article className="panel">
      <h2>{title}</h2>
      <p className="muted">{hint}</p>
      <Meter rows={rows.map((row) => ({ key: row.name, label: row.name, amount: row.count, figure: num(row.count) }))} onPick={(row) => onPick(row.label)} />
    </article>
  )
}

export function LineFetch({ path, query, months, filters, onBack, columns, placeholder, render }) {
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('')
  const [dir, setDir] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setPage(1)
    setQ('')
    setSort('')
    setDir('')
  }, [query])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ months: months || '0', view: query.view || '', page: String(page), pageSize: '40' })
    const merged = { ...filters, ...query }
    ;['customer', 'project', 'requester', 'field', 'vendor', 'buyer', 'sheet', 'item', 'currency', 'location', 'category', 'part'].forEach((key) => {
      if (merged[key]) params.set(key, merged[key])
    })
    if (query.entryMonth) params.set('entryMonth', query.entryMonth)
    if (query.entryMonths) params.set('entryMonths', query.entryMonths)
    if (query.min != null) params.set('min', String(query.min))
    if (query.max != null) params.set('max', String(query.max))
    if (q.trim()) params.set('q', q.trim())
    if (sort) params.set('sort', sort)
    if (dir) params.set('dir', dir)
    setError('')
    fetch(`${path}?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.message || 'Could not load the list')
        setData(body.data)
      })
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message) })
    return () => controller.abort()
  }, [path, query, months, filters, page, q, sort, dir])

  if (error) return <p className="banner">{error}</p>
  if (!data) return <p className="muted">Loading…</p>
  return (
    <ResearchList
      title={query.title || 'List'}
      columns={columns}
      rows={data.rows.map(render)}
      total={data.total}
      page={data.page}
      pages={data.pages}
      q={q}
      onQuery={(value) => { setQ(value); setPage(1) }}
      sort={sort}
      dir={dir}
      onSort={(key) => {
        if (sort !== key) { setSort(key); setDir('desc') } else setDir((current) => (current === 'desc' ? 'asc' : 'desc'))
        setPage(1)
      }}
      onPage={setPage}
      onBack={onBack}
      placeholder={placeholder}
    />
  )
}
