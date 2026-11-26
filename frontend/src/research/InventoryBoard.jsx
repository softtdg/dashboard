import { useEffect, useState } from 'react'
import { ChartNoAxesColumnIncreasing, CircleDollarSign, MapPin, Package, PackageCheck, PackageX } from 'lucide-react'
import { Donut } from '../sop/Charts'
import { SparkKpi } from '../sop/SparkKpi'
import { num } from '../sop/views'
import { Meter } from '../supply/Meter'
import { Findings, LineFetch, Select } from './DesignBoard'

export default function InventoryBoard() {
  const [filters, setFilters] = useState({ category: '', region: 'Canada' })
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value) })
    setLoading(true)
    setError('')
    fetch(`/api/research/inventory?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.message || 'Inventory dashboard failed')
        setData(body.data)
      })
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [filters])

  if (list) {
    return (
      <LineFetch
        path="/api/research/inventory/lines"
        query={list}
        months="0"
        filters={filters}
        onBack={() => setList(null)}
        columns={[['part', 'Part'], ['region', 'File'], ['category', 'Category'], ['location', 'Location'], ['qty', 'On hand'], ['value', 'Value']]}
        placeholder="Part, description, location"
        render={(row) => (
          <tr key={row.id}>
            <td>{row.part || '—'}<div className="clip muted">{row.description}</div></td>
            <td>{row.region}</td>
            <td>{row.category}</td>
            <td>{row.location}</td>
            <td className={row.zero ? 'late' : ''}>{num(Math.round(row.qty))}</td>
            <td>{num(Math.round(row.value))}</td>
          </tr>
        )}
      />
    )
  }

  return (
    <>
      <header>
        <div>
          <p className="eyebrow">Inventory research</p>
          <h1>{filters.region === 'USA' ? 'What the USA file lists' : filters.region === 'Canada' ? 'What Canada has on hand' : 'Canada and USA stock'}</h1>
        </div>
      </header>
      {error && <p className="banner">{error}</p>}
      {!data && loading && <p className="muted">Reading stock…</p>}
      {data && (
        <>
          <section className="filters">
            <Select label="File" value={filters.region} options={['Canada', 'USA']} onChange={(region) => setFilters({ ...filters, region, category: '' })} />
            {data.options.categories.length > 0 && (
              <Select label="Category" value={filters.category} options={data.options.categories} onChange={(category) => setFilters({ ...filters, category })} />
            )}
            {loading && <span className="muted">Updating…</span>}
          </section>
          <Findings items={data.findings} />
          <section className="kpis">
            <SparkKpi label="Parts" value={data.kpis.parts} note={filters.region === 'USA' ? 'USA stock file' : filters.region === 'Canada' ? 'Canada stock file' : 'Canada and USA files'} icon={Package} swatch="blue" color="#60a5fa" onClick={() => setList({ view: 'parts', title: filters.region === 'USA' ? 'USA parts' : filters.region === 'Canada' ? 'Canada parts' : 'Canada and USA parts' })} />
            <SparkKpi label="In stock" value={data.kpis.stocked} note={`${num(data.kpis.qty)} pieces`} tone="tone-ok" icon={PackageCheck} swatch="green" color="#34d399" onClick={() => setList({ view: 'stocked', title: 'In stock' })} />
            <SparkKpi label="Nothing on hand" value={data.kpis.zero} note="Quantity is zero" tone="tone-bad" icon={PackageX} swatch="pink" color="#fb7185" onClick={() => setList({ view: 'zero', title: 'Nothing on hand' })} />
            <SparkKpi label="On-hand value" value={data.kpis.value} note="Quantity times stored unit price" tone="tone-info" icon={CircleDollarSign} swatch="amber" color="#fbbf24" />
            <SparkKpi label="Locations" value={data.kpis.locations} note="Places with stock" icon={MapPin} swatch="teal" color="#5eead4" />
          </section>
          <article className="panel">
            <h2 className="with-ico"><ChartNoAxesColumnIncreasing size={18} /> In stock against empty</h2>
            <p className="muted">Empty means the quantity on hand is zero.</p>
            <Donut caption="parts" slices={[
              { label: 'In stock', value: data.kpis.stocked, color: '#3ee0c0', view: 'stocked' },
              { label: 'Nothing on hand', value: data.kpis.zero, color: '#fb7185', view: 'zero' },
            ]} onPick={(slice) => setList({ view: slice.view, title: slice.label })} />
          </article>
          <section className="ranks">
            <article className="panel">
              <h2>Locations</h2>
              <p className="muted">Bar length is pieces on hand. Click a location to list its parts.</p>
              <Meter rows={data.locations.map((row) => ({ key: row.name, label: row.name, amount: row.qty, figure: num(row.qty), note: `${num(row.count)} parts` }))} onPick={(row) => setList({ view: 'stocked', location: row.label, title: row.label })} />
            </article>
            <article className="panel">
              <h2>Highest quantities</h2>
              <p className="muted">The parts with the most pieces on hand.</p>
              <Meter rows={data.parts.map((row) => ({ key: row.name, label: row.name, amount: row.count, figure: num(row.count), note: row.location }))} onPick={(row) => setList({ view: 'parts', part: row.label, title: row.label })} />
            </article>
            <article className="panel">
              <h2>Categories</h2>
              <p className="muted">Bar length is parts in that category. Click one to list them.</p>
              <Meter rows={data.categories.map((row) => ({ key: row.name, label: row.name, amount: row.count, figure: num(row.count), note: `${num(row.count)} parts` }))} onPick={(row) => setList({ view: 'parts', category: row.label, title: row.label })} />
            </article>
          </section>
        </>
      )}
    </>
  )
}
