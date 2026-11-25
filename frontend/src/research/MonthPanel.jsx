import { useEffect, useState } from 'react'
import { MonthBars } from '../sop/Charts'
import { num } from '../sop/views'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function MonthPanel({ monthly, all, labels, onOpen }) {
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
    onOpen({
      view: labels.views[kind],
      title,
      entryMonth: entryMonths.length === 1 ? entryMonths[0] : '',
      entryMonths: entryMonths.length > 1 ? entryMonths.join(',') : '',
    })
  }

  return (
    <section className="panel">
      <div className="all-total">
        <button type="button" onClick={() => open([], 'arrived', labels.all)}>
          <span>{labels.all}</span>
          <strong>{num(all.arrived)}</strong>
        </button>
        <button type="button" className="tone-ok" onClick={() => open([], 'completed', labels.done)}>
          <span>{labels.done}</span>
          <strong>{num(all.completed)}</strong>
        </button>
        <button type="button" className="tone-open" onClick={() => open([], 'remaining', labels.still)}>
          <span>{labels.still}</span>
          <strong>{num(all.remaining)}</strong>
        </button>
      </div>
      <div className="list-head">
        <div>
          <h2>Month by month</h2>
          <p className="muted">{labels.hint}</p>
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
          <button type="button" onClick={() => open(selected, 'arrived', `${scopeLabel} · ${labels.arrived}`)}>
            <span>{labels.arrived}</span>
            <strong>{num(total.arrived)}</strong>
          </button>
          <button type="button" onClick={() => open(selected, 'completed', `${scopeLabel} · ${labels.done}`)}>
            <span>{labels.done}</span>
            <strong>{num(total.completed)}</strong>
          </button>
          <button type="button" onClick={() => open(selected, 'remaining', `${scopeLabel} · ${labels.still}`)}>
            <span>{labels.still}</span>
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
        <span><i className="bar-arrived" /> {labels.arrived}</span>
        <span><i className="bar-done" /> {labels.done}</span>
        <span><i className="bar-open" /> {labels.still}</span>
      </div>
      <MonthBars
        rows={visible}
        onPick={(row, kind) => {
          const month = `${MONTH_NAMES[Number(row.month.slice(5)) - 1]} ${row.month.slice(0, 4)}`
          const name = kind === 'arrived' ? labels.arrived : kind === 'completed' ? labels.done : labels.still
          open([row.month], kind, `${month} · ${name}`)
        }}
      />
    </section>
  )
}

export function ResearchList({ title, columns, rows, total, page, pages, q, onQuery, sort, dir, onSort, onPage, onBack, placeholder, colSpan }) {
  return (
    <section className="panel list-page">
      <div className="list-head">
        <div>
          <button type="button" className="back" onClick={onBack}>← Back</button>
          <h2>{title}</h2>
          <p className="muted">{total == null ? '' : `${Number(total).toLocaleString()} rows.`}</p>
        </div>
        <label>
          Search this list
          <input value={q} placeholder={placeholder} onChange={(event) => onQuery(event.target.value)} />
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map(([key, label]) => (
                <th key={key}>
                  <button type="button" className="sort" onClick={() => onSort(key)}>
                    {label}{sort === key ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows}
            {rows.length === 0 && <tr><td colSpan={colSpan || columns.length}>Nothing matches this cut.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </section>
  )
}
