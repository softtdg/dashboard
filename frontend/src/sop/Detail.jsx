import { useEffect, useState } from 'react'
import { days, money } from './views'

export default function Detail({ sopId, onClose }) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setDetail(null)
    setError('')
    fetch(`/api/sop/detail/${sopId}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.message || 'SOP not found')
        setDetail(body.data)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
    return () => controller.abort()
  }, [sopId])

  return (
    <aside className="drawer">
      <button type="button" className="back" onClick={onClose}>← Back</button>
      {error && <p className="banner">{error}</p>}
      {!detail && !error && <p className="muted">Loading SOP…</p>}
      {detail && (
        <>
          <p className="eyebrow">{detail.open ? detail.stage : 'Delivered'}</p>
          <h2>{detail.sopNum}</h2>
          <p>{detail.customer}</p>
          <p className="muted">{detail.program} · {detail.location}</p>
          <dl>
            <div><dt>PO</dt><dd>{detail.poNum || '—'}</dd></div>
            <div><dt>Lead hand</dt><dd>{detail.leadHand}</dd></div>
            <div><dt>Manager</dt><dd>{detail.prodMgr || '—'}</dd></div>
            <div><dt>Amount</dt><dd>{money(detail.amount)}</dd></div>
            <div><dt>Quantity</dt><dd>{detail.qty} / {detail.lines} lines</dd></div>
            <div><dt>Entered</dt><dd>{detail.entered || '—'}</dd></div>
            <div><dt>ODD</dt><dd>{detail.odd || '—'}</dd></div>
            <div><dt>Delivered</dt><dd>{detail.delivered || 'Still open'}</dd></div>
          </dl>
          <h3>Where the time went</h3>
          <ul className="stage-list">
            <li><span>Order entry</span><b>{stageSoFar(detail, 'orderEntryDays', 'Order entry')}</b></li>
            <li><span>Queue to production</span><b>{stageSoFar(detail, 'queueDays', 'Waiting production')}</b></li>
            <li><span>Production</span><b>{stageSoFar(detail, 'productionDays', 'Production')}</b></li>
            <li><span>QA</span><b>{stageSoFar(detail, 'qaDays', 'QA')}</b></li>
            <li><span>Shipping</span><b>{stageSoFar(detail, 'shipDays', 'Shipping')}</b></li>
          </ul>
          <p>
            {detail.bottleneck
              ? `Most recorded time is in ${detail.bottleneck.stage} (${detail.bottleneck.days} days).`
              : 'Stage dates are too thin to explain the delay.'}
          </p>
          {detail.rework && <p className="late">This SOP went back to production for rework.</p>}
          {detail.overdueDays ? <p className="late">{detail.overdueDays} days past ODD.</p> : null}

          <h3>Fixtures and shortages</h3>
          {detail.fixtures.length === 0 && <p className="muted">No lead-hand lines on this SOP.</p>}
          {detail.fixtures.map((fixture) => (
            <article key={`${fixture.fixture}-${fixture.qty}`} className="fixture">
              <strong>{fixture.fixture || 'No fixture'}</strong>
              <p className="muted">{fixture.qty} qty · {money(fixture.amount)}</p>
              <p className="flags">
                {fixture.notifySales && <em>Sales</em>}
                {fixture.notifyPurchasing && <em>Purchasing</em>}
                {fixture.notifyDesign && <em>Design</em>}
              </p>
              {fixture.comments && <p>{fixture.comments}</p>}
              {fixture.backorders.map((item) => (
                <p key={`${item.part}-${item.quantity}`} className={item.open ? 'late' : 'muted'}>
                  {item.part || 'Part'} · {item.received ?? 0}/{item.quantity} {item.uom} {item.open ? 'still short' : 'received'}
                  {item.rootCause ? ` · ${item.rootCause}` : ''}
                </p>
              ))}
            </article>
          ))}

          <h3>Notes</h3>
          <Note label="Order entry" text={detail.comments.orderEntry} />
          <Note label="Production" text={detail.comments.production} />
          <Note label="QA" text={detail.comments.qa} />
        </>
      )}
    </aside>
  )
}

function stageSoFar(detail, key, stage) {
  if (detail[key] != null) return days(detail[key])
  if (detail.open && detail.stage === stage && detail.inStageDays != null) return `${detail.inStageDays}d so far`
  return '—'
}

function Note({ label, text }) {
  return (
    <div className="note">
      <strong>{label}</strong>
      <p>{text?.trim() || 'No comment recorded.'}</p>
    </div>
  )
}
