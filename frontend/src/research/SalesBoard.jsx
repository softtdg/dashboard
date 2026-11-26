import { useEffect, useState } from 'react'
import { CalendarDays, ChartNoAxesColumnIncreasing, CircleCheck, FileText, Hourglass, UsersRound } from 'lucide-react'
import { Donut } from '../sop/Charts'
import { SparkKpi, spark } from '../sop/SparkKpi'
import { num } from '../sop/views'
import { Meter } from '../supply/Meter'
import { MonthPanel } from './MonthPanel'
import { Findings, LineFetch, Select, Window } from './DesignBoard'

const SALES_PERIODS = [
  { value: '12', label: 'Last 12 months' },
  { value: '24', label: 'Last 24 months' },
  { value: '36', label: 'Last 36 months' },
  { value: '0', label: 'All orders' },
]

export default function SalesBoard() {
  const [months, setMonths] = useState('0')
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
        <Window months={months} onMonths={setMonths} periods={SALES_PERIODS} />
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
            <SparkKpi label="Orders" value={data.kpis.orders} note={`${num(data.kpis.booked)} booked`} icon={FileText} swatch="blue" color="#60a5fa" spark={spark(data.trends, 'orders')} onClick={() => setList({ view: 'orders', title: 'Sales orders' })} />
            <SparkKpi label="Open" value={data.kpis.open} note={`${num(data.kpis.balance)} still to invoice`} tone="tone-open" icon={Hourglass} swatch="amber" color="#fbbf24" spark={spark(data.trends, 'open')} onClick={() => setList({ view: 'open', title: 'Open orders' })} />
            <SparkKpi label="Closed" value={data.kpis.closed} note="Nothing left to invoice" tone="tone-ok" icon={CircleCheck} swatch="green" color="#34d399" spark={spark(data.trends, 'closed')} onClick={() => setList({ view: 'closed', title: 'Closed orders' })} />
            <SparkKpi label="Past promise" value={data.kpis.late} note="Open and the promised date has passed" tone="tone-bad" icon={CalendarDays} swatch="pink" color="#fb7185" spark={spark(data.trends, 'late')} onClick={() => setList({ view: 'late', title: 'Past promise' })} />
            <SparkKpi label="Customers" value={data.kpis.customers} note="In this window" icon={UsersRound} swatch="violet" color="#c4b5fd" spark={spark(data.trends, 'customers')} />
          </section>
          <article className="panel">
            <h2 className="with-ico"><ChartNoAxesColumnIncreasing size={18} /> Open against closed</h2>
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
