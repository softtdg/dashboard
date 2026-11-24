import { useEffect, useState } from 'react'
import { days, num } from '../sop/views'

const BACKORDER_COLUMNS = [
  ['part', 'Part'],
  ['sopNum', 'SOP'],
  ['customer', 'Customer'],
  ['leadHand', 'Lead hand'],
  ['qty', 'Qty'],
  ['shortQty', 'Short'],
  ['ageDays', 'Waiting'],
  ['closeDays', 'To clear'],
  ['noticed', 'Noticed'],
]

const PURCHASE_COLUMNS = [
  ['item', 'Item'],
  ['poNumber', 'PO'],
  ['vendor', 'Vendor'],
  ['qty', 'Qty'],
  ['shortQty', 'Short'],
  ['ageDays', 'Since ordered'],
  ['lateDays', 'Past promise'],
  ['added', 'Added'],
]

export default function LineList({ kind, query, months, filters, onBack, onOpenSop }) {
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('')
  const [dir, setDir] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const columns = kind === 'purchase' ? PURCHASE_COLUMNS : BACKORDER_COLUMNS

  useEffect(() => {
    setPage(1)
    setQ('')
    setSort('')
    setDir('')
  }, [query, kind])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({
      months,
      view: query.view || '',
      page: String(page),
      pageSize: '40',
    })
    const scoped = {
      customer: query.customer ?? filters.customer,
      program: query.program ?? filters.program,
      leadHand: query.leadHand ?? filters.leadHand,
      location: query.location ?? filters.location,
    }
    Object.entries(scoped).forEach(([key, value]) => {
      if (value) params.set(key, value)
    })
    if (query.part) params.set('part', query.part)
    if (query.vendor) params.set('vendor', query.vendor)
    if (query.item) params.set('item', query.item)
    if (query.entryMonth) params.set('entryMonth', query.entryMonth)
    if (query.entryMonths) params.set('entryMonths', query.entryMonths)
    if (query.min != null) params.set('min', String(query.min))
    if (query.max != null) params.set('max', String(query.max))
    if (q.trim()) params.set('q', q.trim())
    if (sort) params.set('sort', sort)
    if (dir) params.set('dir', dir)

    const path = kind === 'purchase' ? '/api/supply/purchasing/lines' : '/api/supply/backorders/lines'
    setLoading(true)
    setError('')
    fetch(`${path}?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.message || 'Could not load lines')
        setData(body.data)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [kind, query, months, filters, page, q, sort, dir])

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
          <h2>{query.title || 'Lines'}</h2>
          <p className="muted">{data ? `${num(data.total)} lines.` : ''}</p>
        </div>
        <label>
          Search this list
          <input
            value={q}
            placeholder={kind === 'purchase' ? 'Item, PO, vendor' : 'Part, SOP, customer'}
            onChange={(event) => { setQ(event.target.value); setPage(1) }}
          />
        </label>
      </div>
      {error && <p className="banner">{error}</p>}
      {loading && !data && <p className="muted">Loading lines…</p>}
      {data && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {columns.map(([key, label]) => (
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
                    {kind === 'purchase' ? (
                      <>
                        <td>{row.item}<div className="clip muted">{row.description}</div></td>
                        <td>{row.poNumber || '—'}</td>
                        <td>{row.vendor}</td>
                        <td>{num(row.qty)}</td>
                        <td className={row.shortQty ? 'late' : ''}>{num(row.shortQty)}</td>
                        <td>{days(row.ageDays)}</td>
                        <td className={row.lateDays ? 'late' : ''}>{days(row.lateDays)}</td>
                        <td>{row.added || '—'}</td>
                      </>
                    ) : (
                      <>
                        <td>{row.part}<div className="clip muted">{row.description}</div></td>
                        <td>
                          {onOpenSop ? (
                            <button type="button" className="link" onClick={() => onOpenSop(row.sopId)}>{row.sopNum}</button>
                          ) : row.sopNum}
                        </td>
                        <td>{row.customer}</td>
                        <td>{row.leadHand}</td>
                        <td>{num(row.qty)}</td>
                        <td className={row.shortQty ? 'late' : ''}>{row.open ? num(row.shortQty) : '—'}</td>
                        <td>{days(row.ageDays)}</td>
                        <td>{days(row.closeDays)}</td>
                        <td>{row.noticed || '—'}</td>
                      </>
                    )}
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr><td colSpan={columns.length}>Nothing matches this cut.</td></tr>
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
