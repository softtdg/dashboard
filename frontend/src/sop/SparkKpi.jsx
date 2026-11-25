import { Sparkline } from './Charts'
import { num } from './views'

export function spark(rows, key) {
  return (rows || []).map((row) => row[key] || 0)
}

export function SparkKpi({ label, value, note, tone = '', icon: Icon, swatch, color, spark: values, onClick }) {
  return (
    <button type="button" className={`kpi stat ${tone}`} onClick={onClick}>
      <span className={`kpi-ico ${swatch}`}><Icon size={18} strokeWidth={2} /></span>
      <p>{label}</p>
      <strong>{typeof value === 'number' ? num(value) : value}</strong>
      <span>{note}</span>
      {values?.length > 1 && <Sparkline values={values} color={color} />}
    </button>
  )
}
