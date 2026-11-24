function percentile(values, ratio) {
  const sorted = values.filter((value) => value != null).sort((a, b) => a - b)
  if (!sorted.length) return 1
  return sorted[Math.min(sorted.length - 1, Math.floor(ratio * (sorted.length - 1)))] || 1
}

function ticks(max, count) {
  return Array.from({ length: count + 1 }, (_, index) => Math.round((max * index) / count))
}

const RING = ['#3ee0c0', '#f0a05a', '#a78bfa', '#7dd3fc', '#fb7185', '#fde68a', '#94a3b8']

export function Donut({ slices, center, caption = 'total', onPick }) {
  const drawn = slices.filter((slice) => slice.value > 0)
  const total = drawn.reduce((sum, slice) => sum + slice.value, 0)
  const radius = 52
  const circumference = 2 * Math.PI * radius
  let cursor = 0

  return (
    <div className="donut">
      <svg viewBox="0 0 160 160" role="img">
        <g transform="rotate(-90 80 80)">
          <circle cx="80" cy="80" r={radius} className="donut-track" />
          {drawn.map((slice, index) => {
            const length = total ? (slice.value / total) * circumference : 0
            const gap = drawn.length > 1 && length > 6 ? 3 : 0
            const node = (
              <circle
                key={slice.label}
                cx="80"
                cy="80"
                r={radius}
                className="donut-seg"
                stroke={slice.color || RING[index % RING.length]}
                strokeDasharray={`${Math.max(length - gap, 0)} ${circumference}`}
                strokeDashoffset={-cursor}
                onClick={() => onPick?.(slice)}
              >
                <title>{`${slice.label}: ${slice.value.toLocaleString()}`}</title>
              </circle>
            )
            cursor += length
            return node
          })}
        </g>
        <text className="donut-total" x="80" y="78" textAnchor="middle">{center || (total ? total.toLocaleString() : '—')}</text>
        <text className="donut-cap" x="80" y="96" textAnchor="middle">{caption}</text>
      </svg>
      <ul className="donut-legend">
        {drawn.map((slice, index) => (
          <li key={slice.label}>
            <button type="button" onClick={() => onPick?.(slice)}>
              <i style={{ background: slice.color || RING[index % RING.length] }} />
              <span>{slice.label}</span>
              <b>{slice.value.toLocaleString()}</b>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Histogram({ buckets, onPick }) {
  const max = Math.max(...buckets.map((bucket) => bucket.count), 1)
  return (
    <div className="hist" role="list">
      {buckets.map((bucket) => (
        <button key={bucket.label} type="button" onClick={() => onPick(bucket)} title={`${bucket.count} SOPs`}>
          <span style={{ height: `${Math.max(4, (bucket.count / max) * 100)}%` }} />
          <small>{bucket.count.toLocaleString()}</small>
          <b>{bucket.label}</b>
        </button>
      ))}
    </div>
  )
}

export function ScatterPlot({ points, onPick }) {
  const width = 680
  const height = 340
  const pad = { l: 52, r: 18, t: 14, b: 40 }
  const xMax = percentile(points.map((point) => point.x), 0.95)
  const yMax = percentile(points.map((point) => point.y), 0.95)
  const xScale = (value) => pad.l + (Math.min(value, xMax) / xMax) * (width - pad.l - pad.r)
  const yScale = (value) => height - pad.b - (Math.min(value, yMax) / yMax) * (height - pad.t - pad.b)

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img">
      {ticks(yMax, 4).map((tick) => (
        <g key={`y-${tick}`}>
          <line className="gridline" x1={pad.l} x2={width - pad.r} y1={yScale(tick)} y2={yScale(tick)} />
          <text className="axis" x={pad.l - 8} y={yScale(tick) + 4} textAnchor="end">{tick}</text>
        </g>
      ))}
      {ticks(xMax, 4).map((tick) => (
        <text key={`x-${tick}`} className="axis" x={xScale(tick)} y={height - 16} textAnchor="middle">{tick}</text>
      ))}
      {points.map((point) => (
        <circle
          key={point.sopId}
          cx={xScale(point.x)}
          cy={yScale(point.y)}
          r="3.4"
          className={point.late ? 'late-dot' : 'ok-dot'}
          onClick={() => onPick(point.sopId)}
        >
          <title>{`${point.sopNum}: production ${point.x}d, cycle ${point.y}d`}</title>
        </circle>
      ))}
      <text className="axis-title" x={width / 2} y={height - 2} textAnchor="middle">Production days</text>
      <text className="axis-title" x="14" y={height / 2} transform={`rotate(-90 14 ${height / 2})`} textAnchor="middle">Cycle days</text>
    </svg>
  )
}

export function MonthBars({ rows, onPick }) {
  const width = 760
  const height = 250
  const pad = { left: 42, right: 8, top: 12, bottom: 28 }
  const max = Math.max(...rows.flatMap((row) => [row.arrived, row.completed, row.remaining]), 1)
  const slot = (width - pad.left - pad.right) / Math.max(rows.length, 1)
  const barWidth = Math.min(16, Math.max(6, (slot - 10) / 3))
  const yScale = (value) => height - pad.bottom - (value / max) * (height - pad.top - pad.bottom)
  const series = [
    ['arrived', 'bar-arrived', 'arrived'],
    ['completed', 'bar-done', 'completed'],
    ['remaining', 'bar-open', 'remaining'],
  ]

  return (
    <svg className="chart month-chart" viewBox={`0 0 ${width} ${height}`} role="img">
      {[0, 0.5, 1].map((step) => {
        const value = Math.round(max * step)
        return (
          <g key={step}>
            <line className="gridline" x1={pad.left} x2={width - pad.right} y1={yScale(value)} y2={yScale(value)} />
            <text className="axis" x={pad.left - 6} y={yScale(value) + 4} textAnchor="end">{value}</text>
          </g>
        )
      })}
      {rows.map((row, index) => {
        const origin = pad.left + index * slot + (slot - barWidth * 3) / 2
        const label = row.month.slice(5)
        return (
          <g key={row.month}>
            {series.map(([key, className, kind], seriesIndex) => {
              const value = row[key]
              const x = origin + seriesIndex * barWidth
              const y = yScale(value)
              return (
                <rect
                  key={key}
                  className={className}
                  x={x}
                  y={y}
                  width={barWidth - 2}
                  height={Math.max(0, height - pad.bottom - y)}
                  onClick={() => value && onPick(row, kind)}
                >
                  <title>{`${label}: ${kind} ${value}`}</title>
                </rect>
              )
            })}
            <text className="axis" x={origin + barWidth * 1.5} y={height - 8} textAnchor="middle">
              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(label) - 1]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function FlowChart({ monthly }) {
  const width = 680
  const height = 280
  const pad = { l: 40, r: 12, t: 16, b: 36 }
  const max = Math.max(...monthly.flatMap((item) => [item.entered, item.delivered]), 1)
  const xScale = (index) => pad.l + (monthly.length <= 1 ? 0 : (index / (monthly.length - 1)) * (width - pad.l - pad.r))
  const yScale = (value) => height - pad.b - (value / max) * (height - pad.t - pad.b)
  const path = (key) => monthly.map((item, index) => `${index === 0 ? 'M' : 'L'} ${xScale(index)} ${yScale(item[key])}`).join(' ')

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img">
      {[0, 0.5, 1].map((step) => {
        const value = Math.round(max * step)
        return (
          <g key={step}>
            <line className="gridline" x1={pad.l} x2={width - pad.r} y1={yScale(value)} y2={yScale(value)} />
            <text className="axis" x={pad.l - 6} y={yScale(value) + 4} textAnchor="end">{value}</text>
          </g>
        )
      })}
      <path d={path('entered')} className="line-in" />
      <path d={path('delivered')} className="line-out" />
      {monthly.map((item, index) => (
        index % Math.ceil(monthly.length / 8) === 0 ? (
          <text key={item.month} className="axis" x={xScale(index)} y={height - 14} textAnchor="middle">{item.month.slice(2)}</text>
        ) : null
      ))}
    </svg>
  )
}

export function StageBars({ stages }) {
  const max = Math.max(...stages.map((stage) => stage.medianDays || 0), 1)
  return (
    <ul className="bars">
      {stages.map((stage) => (
        <li key={stage.key}>
          <div>
            <strong>{stage.label}</strong>
            <span>{stage.medianDays ?? '—'}d median · {stage.sample.toLocaleString()} SOPs · avg {stage.avgDays ?? '—'}d</span>
          </div>
          <div className="track"><span style={{ width: `${((stage.medianDays || 0) / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}

export function OpenStageBars({ rows, onPick }) {
  const max = Math.max(...rows.map((row) => row.count), 1)
  return (
    <ul className="bars clickable">
      {rows.map((row) => (
        <li key={row.stage}>
          <button type="button" onClick={() => onPick(row.stage)}>
            <div>
              <strong>{row.stage}</strong>
              <span>{row.count.toLocaleString()} open</span>
            </div>
            <div className="track"><span style={{ width: `${(row.count / max) * 100}%` }} /></div>
          </button>
        </li>
      ))}
    </ul>
  )
}
