import { useEffect, useState } from 'react'
import { Donut } from '../sop/Charts'
import { num } from '../sop/views'
import { Meter } from '../supply/Meter'
import { MonthPanel } from './MonthPanel'
import { Findings, Kpi, LineFetch, Select, Window } from './DesignBoard'

export default function PurchasingBoard() {
  const [months, setMonths] = useState('24')
  const [filters, setFilters] = useState({ vendor: '', buyer: '', sheet: '' })
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
    fetch(`/api/research/purchasing?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.message || 'Purchasing dashboard failed')
        setData(body.data)
      })
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [months, filters])

  if (list) {
    return (
      <LineFetch
        path="/api/research/purchasing/lines"
        query={list}
        months={months}
        filters={filters}
        onBack={() => setList(null)}
        columns={[['poNumber', 'PO'], ['vendor', 'Vendor'], ['item', 'Item'], ['qty', 'Qty'], ['shortQty', 'Short'], ['ordered', 'Ordered'], ['delivery', 'Delivery']]}
        placeholder="PO, vendor, item, buyer"
        render={(row) => (
          <tr key={row.id}>
            <td>{row.poNumber || '—'}</td>
            <td>{row.vendor}<div className="clip muted">{row.buyer}</div></td>
            <td>{row.item}<div className="clip muted">{row.description}</div></td>
            <td>{num(row.qty)}</td>
            <td className={row.shortQty ? 'late' : ''}>{row.open ? num(row.shortQty) : '—'}</td>
            <td>{row.ordered}</td>
            <td className={row.late ? 'late' : ''}>{row.delivery || '—'}</td>
          </tr>
        )}
      />
    )
  }

  return (
    <>
      <header>
        <div>
          <p className="eyebrow">Purchasing research</p>
          <h1>Which orders are still short</h1>
        </div>
        <Window months={months} onMonths={setMonths} />
      </header>
      {error && <p className="banner">{error}</p>}
      {!data && loading && <p className="muted">Reading purchase orders…</p>}
      {data && (
        <>
          <section className="filters">
            <Select label="Sheet" value={filters.sheet} options={data.options.sheets} onChange={(sheet) => setFilters({ ...filters, sheet })} />
            <Select label="Buyer" value={filters.buyer} options={data.options.buyers} onChange={(buyer) => setFilters({ ...filters, buyer })} />
            <Select label="Vendor" value={filters.vendor} options={data.options.vendors} onChange={(vendor) => setFilters({ ...filters, vendor })} />
            {loading && <span className="muted">Updating…</span>}
          </section>
          <Findings items={data.findings} />
          <section className="kpis">
            <Kpi label="Lines" value={data.kpis.lines} note={`${num(Math.round(data.kpis.qty))} pieces ordered`} onClick={() => setList({ view: 'lines', title: 'Purchase lines' })} />
            <Kpi label="Still short" value={data.kpis.open} note={`${num(Math.round(data.kpis.shortQty))} pieces`} tone="tone-open" onClick={() => setList({ view: 'open', title: 'Still short' })} />
            <Kpi label="Filled" value={data.kpis.filled} note="Received covers the order" tone="tone-ok" onClick={() => setList({ view: 'filled', title: 'Filled' })} />
            <Kpi label="Past delivery" value={data.kpis.late} note="Still short after the delivery date" tone="tone-bad" onClick={() => setList({ view: 'late', title: 'Past delivery' })} />
            <Kpi label="Vendors" value={data.kpis.vendors} note="In this window" />
            <Kpi label="Buyers" value={data.kpis.buyers} note="In this window" />
          </section>
          <section className="rings">
            <article className="panel">
              <h2>Filled against still short</h2>
              <p className="muted">A line is short when received quantity is below the order.</p>
              <Donut caption="lines" slices={[
                { label: 'Filled', value: data.kpis.filled, color: '#3ee0c0', view: 'filled' },
                { label: 'Still short', value: data.kpis.open, color: '#f0a05a', view: 'open' },
              ]} onPick={(slice) => setList({ view: slice.view, title: slice.label })} />
            </article>
            <article className="panel">
              <h2>Sheets</h2>
              <p className="muted">Canada, USA, and France purchase sheets.</p>
              <Donut caption="lines" slices={data.sheets.map((row) => ({ label: row.name, value: row.count }))} onPick={(slice) => setList({ view: 'lines', sheet: slice.label, title: slice.label })} />
            </article>
          </section>
          <MonthPanel
            monthly={data.monthly}
            all={data.all}
            labels={{
              all: 'All lines',
              done: 'Filled',
              still: 'Still short',
              arrived: 'Ordered',
              hint: 'Ordered is the month on the purchase line. Filled and still short come from that same group.',
              views: { arrived: 'monthLines', completed: 'monthFilled', remaining: 'monthOpen' },
            }}
            onOpen={setList}
          />
          <section className="ranks">
            <Rank title="Open by vendor" hint="Bar length is open lines. The note is pieces still short." rows={data.vendors} note={(row) => `${num(Math.round(row.qty))} short`} onPick={(name) => setList({ view: 'open', vendor: name, title: name })} />
            <Rank title="Buyers" hint="Lines placed in this window." rows={data.buyers} note={(row) => `${num(row.qty)} still short`} onPick={(name) => setList({ view: 'lines', buyer: name, title: name })} />
            <Rank title="Open items" hint="The part on the purchase line." rows={data.items} note={(row) => `${num(Math.round(row.qty))} short`} onPick={(name) => setList({ view: 'open', item: name, title: name })} />
          </section>
        </>
      )}
    </>
  )
}

function Rank({ title, hint, rows, note, onPick }) {
  return (
    <article className="panel">
      <h2>{title}</h2>
      <p className="muted">{hint}</p>
      <Meter rows={rows.map((row) => ({ key: row.name, label: row.name, amount: row.count, figure: num(row.count), note: note(row) }))} onPick={(row) => onPick(row.label)} />
    </article>
  )
}
