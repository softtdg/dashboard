import { useEffect, useState } from 'react'
import { ChartNoAxesColumnIncreasing, CircleCheck, CircleX, ClipboardList, Hourglass, Package, PackageCheck, UsersRound } from 'lucide-react'
import { Donut } from '../sop/Charts'
import { SparkKpi, spark } from '../sop/SparkKpi'
import { num } from '../sop/views'
import { Meter } from '../supply/Meter'
import { MonthPanel } from './MonthPanel'
import { Findings, LineFetch, Select, Window } from './DesignBoard'

export default function MpfBoard() {
  const [months, setMonths] = useState('24')
  const [filters, setFilters] = useState({ requester: '', project: '' })
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
    fetch(`/api/research/mpf?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.message || 'MPF dashboard failed')
        setData(body.data)
      })
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [months, filters])

  if (list) {
    return (
      <LineFetch
        path="/api/research/mpf/lines"
        query={list}
        months={months}
        filters={filters}
        onBack={() => setList(null)}
        columns={list.view?.startsWith('inv')
          ? [['mpf', 'Pick list'], ['sop', 'SOP'], ['fixture', 'Fixture'], ['requester', 'Asked by'], ['log', 'Status'], ['pick', 'Picker'], ['asked', 'Asked'], ['lines', 'Lines'], ['shortQty', 'Short']]
          : [['mpf', 'MPF'], ['sop', 'SOP'], ['fixture', 'Fixture'], ['requester', 'Asked by'], ['log', 'Request'], ['pick', 'Pick'], ['asked', 'Asked'], ['lines', 'Lines'], ['shortQty', 'Short']]}
        placeholder="MPF, SOP, fixture, requester"
        render={(row) => (
          <tr key={row.id}>
            <td>{row.mpf}</td>
            <td>{row.sop || '—'}</td>
            <td>{row.fixture}<div className="clip muted">{row.description}</div></td>
            <td>{row.requester}</td>
            <td className={row.waiting ? 'late' : ''}>{row.log}</td>
            <td>{row.pick}</td>
            <td>{row.asked}</td>
            <td>{num(row.lines)}</td>
            <td>{row.short ? num(row.shortQty) : '—'}</td>
          </tr>
        )}
      />
    )
  }

  return (
    <>
      <header>
        <div>
          <p className="eyebrow">MPF research</p>
          <h1>From the request log to a picked list</h1>
        </div>
        <Window months={months} onMonths={setMonths} />
      </header>
      {error && <p className="banner">{error}</p>}
      {!data && loading && <p className="muted">Reading MPF requests…</p>}
      {data && (
        <>
          <section className="filters">
            <Select label="Asked by" value={filters.requester} options={data.options.requesters} onChange={(requester) => setFilters({ ...filters, requester })} />
            <Select label="Program" value={filters.project} options={data.options.programs} onChange={(project) => setFilters({ ...filters, project })} />
            {loading && <span className="muted">Updating…</span>}
          </section>
          <Findings items={data.findings} />
          <section className="kpis">
            <SparkKpi label="Requests" value={data.kpis.requests} note={`${num(data.kpis.lines)} sheet lines`} icon={ClipboardList} swatch="blue" color="#60a5fa" spark={spark(data.trends, 'requests')} onClick={() => setList({ view: 'requests', title: 'MPF requests' })} />
            <SparkKpi label="Pending" value={data.kpis.waiting} note="Still in the request log" tone="tone-open" icon={Hourglass} swatch="amber" color="#fbbf24" spark={spark(data.trends, 'waiting')} onClick={() => setList({ view: 'waiting', title: 'Pending requests' })} />
            <SparkKpi label="Approved" value={data.kpis.approved} note={data.kpis.medianApprove == null ? 'No approval time yet' : `${data.kpis.medianApprove}d median to approve`} tone="tone-ok" icon={CircleCheck} swatch="green" color="#34d399" spark={spark(data.trends, 'approved')} onClick={() => setList({ view: 'approved', title: 'Approved requests' })} />
            <SparkKpi label="Rejected" value={data.kpis.rejected} note="Turned down in the request log" tone="tone-bad" icon={CircleX} swatch="pink" color="#fb7185" spark={spark(data.trends, 'rejected')} onClick={() => setList({ view: 'rejected', title: 'Rejected requests' })} />
            <SparkKpi label="Picked" value={data.kpis.picked} note={`${num(data.kpis.toPick)} approved and not picked yet`} icon={PackageCheck} swatch="teal" color="#5eead4" spark={spark(data.trends, 'picked')} onClick={() => setList({ view: 'picked', title: 'Picked lists' })} />
            <SparkKpi label="Still short" value={data.kpis.shortLines} note={`MPF backorder, ${num(data.kpis.shortQty)} pieces not received`} tone="tone-bad" icon={Package} swatch="pink" color="#fb7185" spark={spark(data.shortTrends, 'short')} onClick={() => setList({ view: 'short', title: 'MPF backorder still short' })} />
            <SparkKpi label="Asked by" value={data.kpis.requesters} note="People who requested an MPF" icon={UsersRound} swatch="violet" color="#c4b5fd" spark={spark(data.trends, 'requesters')} />
          </section>
          <article className="panel">
            <h2 className="with-ico"><ChartNoAxesColumnIncreasing size={18} /> MPF pending, approved, and rejected</h2>
            <p className="muted">Only mpfStatus 1. Pending is still in the request log. Approved and rejected are the admin decision.</p>
            <Donut caption="MPF requests" keepZero slices={[
              { label: 'Pending', value: data.kpis.waiting, color: '#f0a05a', view: 'waiting' },
              { label: 'Approved', value: data.kpis.approved, color: '#3ee0c0', view: 'approved' },
              { label: 'Rejected', value: data.kpis.rejected, color: '#fb7185', view: 'rejected' },
            ]} onPick={(slice) => setList({ view: slice.view, title: `MPF ${slice.label.toLowerCase()}` })} />
          </article>
          <article className="panel">
            <h2 className="with-ico"><ClipboardList size={18} /> Inventory pick lists</h2>
            <p className="muted">Only mpfStatus 0. Pending, accepted, and rejected are this pick list's own status. Approved MPFs stay in the MPF cards above.</p>
            <section className="kpis">
              <SparkKpi label="Pick lists" value={data.inventory.lists} note={`${num(data.inventory.lines)} sheet lines`} icon={ClipboardList} swatch="blue" color="#60a5fa" spark={spark(data.invTrends, 'lists')} onClick={() => setList({ view: 'inv', title: 'Inventory pick lists' })} />
              <SparkKpi label="Pending" value={data.inventory.pending} note="Waiting to be accepted" tone="tone-open" icon={Hourglass} swatch="amber" color="#fbbf24" spark={spark(data.invTrends, 'pending')} onClick={() => setList({ view: 'invPending', title: 'Inventory pending' })} />
              <SparkKpi label="Accepted" value={data.inventory.accepted} note="Warehouse accepted the pick list" tone="tone-ok" icon={CircleCheck} swatch="green" color="#34d399" spark={spark(data.invTrends, 'accepted')} onClick={() => setList({ view: 'invAccepted', title: 'Inventory accepted' })} />
              <SparkKpi label="Rejected" value={data.inventory.rejected} note="Turned down before the pick" tone="tone-bad" icon={CircleX} swatch="pink" color="#fb7185" spark={spark(data.invTrends, 'rejected')} onClick={() => setList({ view: 'invRejected', title: 'Inventory rejected' })} />
            </section>
            <Donut caption="inventory" keepZero slices={[
              { label: 'Pending', value: data.inventory.pending, color: '#f0a05a', view: 'invPending' },
              { label: 'Accepted', value: data.inventory.accepted, color: '#3ee0c0', view: 'invAccepted' },
              { label: 'Rejected', value: data.inventory.rejected, color: '#fb7185', view: 'invRejected' },
            ]} onPick={(slice) => setList({ view: slice.view, title: `Inventory ${slice.label.toLowerCase()}` })} />
          </article>
          <MonthPanel
            monthly={data.monthly}
            all={data.all}
            hideAll
            labels={{
              all: 'All requests',
              done: 'Approved or rejected',
              still: 'Pending',
              arrived: 'Asked',
              hint: 'Asked is the month the MPF was requested. Approved or rejected, and pending, come from that same group.',
              views: { arrived: 'monthAsked', completed: 'monthDecided', remaining: 'monthWaiting' },
            }}
            onOpen={setList}
          />
          <section className="ranks">
            <Rank title="Who asked" hint="How many MPFs each person requested." rows={data.requesters} note="requests" onPick={(name) => setList({ view: 'requests', requester: name, title: name })} />
            <Rank title="Programs" hint="The program stored on the fixture. Blank programs are left out." rows={data.programs} note="requests" onPick={(name) => setList({ view: 'requests', project: name, title: name })} />
            <Rank title="Fixtures" hint="The fixture on the MPF request." rows={data.fixtures} note="requests" onPick={(name) => setList({ view: 'requests', item: name, title: name })} />
            <Rank title="Parts still short" hint="Parts on the open MPF backorder. The bar is lines, and the note is pieces not received yet." rows={data.parts} note="pieces" value onPick={(name) => setList({ view: 'short', part: name, title: name })} />
          </section>
        </>
      )}
    </>
  )
}

function Rank({ title, hint, rows, note, value, onPick }) {
  return (
    <article className="panel">
      <h2>{title}</h2>
      <p className="muted">{hint}</p>
      <Meter rows={rows.map((row) => ({ key: row.name, label: row.name, amount: row.count, figure: num(row.count), note: value ? `${num(row.value)} ${note}` : `${num(row.count)} ${note}` }))} onPick={(row) => onPick(row.label)} />
    </article>
  )
}
