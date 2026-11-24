import { useEffect, useMemo, useState } from 'react'
import logo from './assets/tdg-logo.png'
import './App.css'
import Detail from './sop/Detail'
import Overview from './sop/Overview'
import RecordList from './sop/RecordList'
import BackorderBoard from './supply/BackorderBoard'
import LineList from './supply/LineList'
import PartsBoard from './supply/PartsBoard'

const TABS = [
  { id: 'sop', label: 'SOP' },
  { id: 'backorder', label: 'Backorder' },
  { id: 'parts', label: 'Parts' },
]

export default function App() {
  const [tab, setTab] = useState('sop')
  const [months, setMonths] = useState('24')
  const [filters, setFilters] = useState({ customer: '', program: '', leadHand: '', location: '' })
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [supply, setSupply] = useState(null)
  const [supplyError, setSupplyError] = useState('')
  const [supplyLoading, setSupplyLoading] = useState(false)

  const params = useMemo(() => {
    const search = new URLSearchParams({ months })
    Object.entries(filters).forEach(([key, value]) => {
      if (value) search.set(key, value)
    })
    return search.toString()
  }, [months, filters])

  useEffect(() => {
    if (tab !== 'sop') return undefined
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch(`/api/sop/dashboard?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.message || 'Dashboard failed')
        setData(body.data)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [params, tab])

  useEffect(() => {
    if (tab !== 'backorder' && tab !== 'parts') return undefined
    const controller = new AbortController()
    setSupplyLoading(true)
    setSupplyError('')
    setSupply(null)
    const path = tab === 'backorder' ? '/api/supply/backorders' : '/api/supply/parts'
    fetch(`${path}?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.message || 'Dashboard failed')
        setSupply(body.data)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setSupplyError(err.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setSupplyLoading(false)
      })
    return () => controller.abort()
  }, [params, tab])

  return (
    <div className="app">
      <div className="shell">
        <div className="brand">
          <img src={logo} alt="TDG Transit Design Group" />
        </div>
      <nav className="tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'on' : ''}
            onClick={() => {
              setTab(item.id)
              setList(null)
              setDetailId(null)
              setSupply(null)
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
      </div>

      <main>
        {tab === 'sop' && !list && (
          <Overview
            data={data}
            error={error}
            loading={loading}
            months={months}
            filters={filters}
            onMonths={setMonths}
            onFilters={setFilters}
            onOpenList={setList}
            onOpenDetail={setDetailId}
          />
        )}
        {tab === 'sop' && list && (
          <RecordList
            key={JSON.stringify(list)}
            query={list}
            months={months}
            filters={filters}
            onBack={() => setList(null)}
            onOpen={setDetailId}
          />
        )}
        {tab === 'backorder' && !list && (
          <BackorderBoard
            data={supply}
            error={supplyError}
            loading={supplyLoading}
            months={months}
            filters={filters}
            onMonths={setMonths}
            onFilters={setFilters}
            onOpenList={setList}
          />
        )}
        {tab === 'backorder' && list && (
          <LineList
            key={JSON.stringify(list)}
            kind="backorder"
            query={list}
            months={months}
            filters={filters}
            onBack={() => setList(null)}
            onOpenSop={setDetailId}
          />
        )}
        {tab === 'parts' && !list && (
          <PartsBoard
            data={supply}
            error={supplyError}
            loading={supplyLoading}
            months={months}
            filters={filters}
            onMonths={setMonths}
            onFilters={setFilters}
            onOpenLines={setList}
            onOpenPurchases={(query) => setList({ ...query, kind: 'purchase' })}
          />
        )}
        {tab === 'parts' && list?.kind === 'purchase' && (
          <LineList
            key={JSON.stringify(list)}
            kind="purchase"
            query={list}
            months={months}
            filters={filters}
            onBack={() => setList(null)}
          />
        )}
        {tab === 'parts' && list && list.kind !== 'purchase' && (
          <LineList
            key={JSON.stringify(list)}
            kind="backorder"
            query={list}
            months={months}
            filters={filters}
            onBack={() => setList(null)}
            onOpenSop={setDetailId}
          />
        )}
      </main>

      {detailId && <Detail sopId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}
