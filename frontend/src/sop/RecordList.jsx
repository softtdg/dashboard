import { useEffect, useState } from 'react'
import { VIEWS, days, money, num } from './views'

const COLUMNS = [
  ['sopNum', 'SOP'],
  ['customer', 'Customer'],
  ['program', 'Program'],
  ['leadHand', 'Lead hand'],
  ['stage', 'Stage'],
  ['inStageDays', 'In stage'],
  ['cycleDays', 'Cycle'],
  ['overdueDays', 'Past ODD'],
  ['productionDays', 'Production'],
  ['openBackorders', 'Backorders'],
  ['amount', 'Amount'],
]

export default function RecordList({ query, months, filters, onBack, onOpen }) {
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('')
  const [dir, setDir] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const meta = VIEWS[query.view] || VIEWS.tracked

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
      view: query.view,
      page: String(page),
      pageSize: '40',
    })
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value)
    })
    if (query.stage) params.set('stage', query.stage)
    if (query.customer) params.set('customer', query.customer)
    if (query.program) params.set('program', query.program)
    if (query.leadHand) params.set('leadHand', query.leadHand)
    if (query.entryMonth) params.set('entryMonth', query.entryMonth)
    if (query.entryMonths) params.set('entryMonths', query.entryMonths)
    if (query.minCycle != null) params.set('minCycle', String(query.minCycle))
    if (query.maxCycle != null) params.set('maxCycle', String(query.maxCycle))
    if (q.trim()) params.set('q', q.trim())
    if (sort) params.set('sort', sort)
    if (dir) params.set('dir', dir)

    setLoading(true)
    setError('')
    fetch(`/api/sop/records?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.message || 'Could not load SOPs')
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
          <h2>{query.title || meta.title}</h2>
          <p className="muted">{meta.hint} {data ? `${num(data.total)} SOPs.` : ''}</p>
        </div>
        <label>
          Search this list
          <input value={q} placeholder="SOP, PO, customer, program" onChange={(event) => { setQ(event.target.value); setPage(1) }} />
        </label>
      </div>
      {error && <p className="banner">{error}</p>}
      {loading && !data && <p className="muted">Loading SOPs…</p>}
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
                  <tr key={row.sopId}>
                    <td><button type="button" className="link" onClick={() => onOpen(row.sopId)}>{row.sopNum}</button></td>
                    <td>{row.customer}</td>
                    <td>{row.program}</td>
                    <td>{row.leadHand}</td>
                    <td>{row.stage}</td>
                    <td>{days(row.inStageDays)}</td>
                    <td>{days(row.cycleDays ?? row.ageDays)}</td>
                    <td className={row.overdueDays || row.lateDays > 0 ? 'late' : ''}>{days(row.overdueDays || (row.lateDays > 0 ? row.lateDays : null))}</td>
                    <td>{days(row.productionDays)}</td>
                    <td className={row.openBackorders ? 'late' : ''}>{row.openBackorders || '—'}</td>
                    <td>{money(row.amount)}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr><td colSpan={COLUMNS.length}>No SOPs match this cut.</td></tr>
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
