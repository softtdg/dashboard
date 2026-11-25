import { useEffect, useState } from 'react'
import { Donut } from '../sop/Charts'
import { num } from '../sop/views'
import { Meter } from '../supply/Meter'
import { MonthPanel } from './MonthPanel'
import { Findings, Kpi, LineFetch, Select, Window } from './DesignBoard'

export default function SalesBoard() {
  const [months, setMonths] = useState('24')
  const [filters, setFilters] = useState({ customer: '', project: '', currency: '' })
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ months })
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value) })
    setLoading(true)
    setError('')
    fetch(`/api/research/sales?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.message || 'Sales dashboard failed')
        setData(body.data)
      })
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [months, filters])

  if (list) {
    return (
      <LineFetch
        path="/api/research/sales/lines"
        query={list}
        months={months}
        filters={filters}
        onBack={() => setList(null)}
        columns={[['sop', 'SOP'], ['customer', 'Customer'], ['status', 'Status'], ['total', 'Total'], ['openBalance', 'Open'], ['ordered', 'Ordered'], ['odd', 'ODD']]}
        placeholder="SOP, customer, project, PO"
        render={(row) => (
          <tr key={row.id}>
            <td>{row.sop || '—'}</td>
            <td>{row.customer}<div className="clip muted">{row.project}</div></td>
            <td className={row.late ? 'late' : ''}>{row.status}</td>
            <td>{num(Math.round(row.total))}</td>
            <td>{row.open ? num(Math.round(row.openBalance)) : '—'}</td>
            <td>{row.ordered}</td>
            <td>{row.odd || '—'}</td>
          </tr>
        )}
      />
    )
  }

  return (
    <>
      <header>
        <div>
          <p className="eyebrow">Sales research</p>
          <h1>What is still open on the order book</h1>
        </div>
        <Window months={months} onMonths={setMonths} />
      </header>
      {error && <p className="banner">{error}</p>}
      {!data && loading && <p className="muted">Reading sales orders…</p>}
      {data && (
        <>
          <section className="filters">
            <Select label="Customer" value={filters.customer} options={data.options.customers} onChange={(customer) => setFilters({ ...filters, customer })} />
            <Select label="Project" value={filters.project} options={data.options.projects} onChange={(project) => setFilters({ ...filters, project })} />
            <Select label="Currency" value={filters.currency} options={data.options.currencies} onChange={(currency) => setFilters({ ...filters, currency })} />
            {loading && <span className="muted">Updating…</span>}
          </section>
          <Findings items={data.findings} />
          <section className="kpis">
            <Kpi label="Orders" value={data.kpis.orders} note={`${num(data.kpis.booked)} booked`} onClick={() => setList({ view: 'orders', title: 'Sales orders' })} />
            <Kpi label="Open" value={data.kpis.open} note={`${num(data.kpis.balance)} still to invoice`} tone="tone-open" onClick={() => setList({ view: 'open', title: 'Open orders' })} />
            <Kpi label="Closed" value={data.kpis.closed} note="Nothing left to invoice" tone="tone-ok" onClick={() => setList({ view: 'closed', title: 'Closed orders' })} />
            <Kpi label="Past promise" value={data.kpis.late} note="Open and the promised date has passed" tone="tone-bad" onClick={() => setList({ view: 'late', title: 'Past promise' })} />
            <Kpi label="Customers" value={data.kpis.customers} note="In this window" />
          </section>
          <article className="panel">
            <h2>Open against closed</h2>
            <p className="muted">Open means the order still has a balance.</p>
            <Donut caption="orders" slices={[
              { label: 'Open', value: data.kpis.open, color: '#f0a05a', view: 'open' },
              { label: 'Closed', value: data.kpis.closed, color: '#3ee0c0', view: 'closed' },
            ]} onPick={(slice) => setList({ view: slice.view, title: slice.label })} />
          </article>
          <MonthPanel
            monthly={data.monthly}
            all={data.all}
            labels={{
              all: 'All orders',
              done: 'Closed',
              still: 'Open',
              arrived: 'Booked',
              hint: 'Booked is the month on the sales order. Closed and open come from that same group.',
              views: { arrived: 'monthOrders', completed: 'monthClosed', remaining: 'monthOpen' },
            }}
            onOpen={setList}
          />
          <section className="ranks">
            <Rank title="Open customers" hint="Bar length is open orders. The note is the balance still to invoice." rows={data.customers} onPick={(name) => setList({ view: 'open', customer: name, title: name })} />
            <Rank title="Open projects" hint="The project on the open order." rows={data.projects} onPick={(name) => setList({ view: 'open', project: name, title: name })} />
          </section>
        </>
      )}
    </>
  )
}

function Rank({ title, hint, rows, onPick }) {
  return (
    <article className="panel">
      <h2>{title}</h2>
      <p className="muted">{hint}</p>
      <Meter rows={rows.map((row) => ({ key: row.name, label: row.name, amount: row.count, figure: num(row.count), note: `${num(row.value)} open` }))} onPick={(row) => onPick(row.label)} />
    </article>
  )
}
