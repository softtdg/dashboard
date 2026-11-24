import { days } from '../sop/views'

export function Meter({ rows, max, tone = '', onPick }) {
  const peak = max || Math.max(...rows.map((row) => row.amount || 0), 1)
  return (
    <ul className="meter">
      {rows.map((row) => (
        <li key={row.key}>
          <button type="button" onClick={() => onPick(row)}>
            <span className="meter-copy">
              <strong>{row.label}</strong>
              {row.detail ? <em>{row.detail}</em> : null}
            </span>
            <b>{row.figure}</b>
            <span className={`barline ${tone}`}>
              <span style={{ width: `${Math.max(row.amount ? 4 : 0, (row.amount / peak) * 100)}%` }} />
            </span>
            {row.note ? <small>{row.note}</small> : null}
          </button>
        </li>
      ))}
      {rows.length === 0 && <li className="muted">Nothing in this cut.</li>}
    </ul>
  )
}

export function TimeCompare({
  waiting,
  cleared,
  waitingNote,
  clearedNote,
  onWaiting,
  onCleared,
  waitingLabel = 'Still waiting',
  clearedLabel = 'Typical time to clear',
}) {
  const peak = Math.max(waiting || 0, cleared || 0, 1)
  return (
    <section className="compare story">
      <button type="button" onClick={onWaiting}>
        <span>{waitingLabel}</span>
        <strong>{days(waiting)}</strong>
        <span className="barline warn"><span style={{ width: `${((waiting || 0) / peak) * 100}%` }} /></span>
        <span>{waitingNote}</span>
      </button>
      <button type="button" onClick={onCleared}>
        <span>{clearedLabel}</span>
        <strong>{days(cleared)}</strong>
        <span className="barline"><span style={{ width: `${((cleared || 0) / peak) * 100}%` }} /></span>
        <span>{clearedNote}</span>
      </button>
    </section>
  )
}
