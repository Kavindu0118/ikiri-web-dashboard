import React, { useState, useMemo, useEffect } from 'react'

const pad = (n) => String(n).padStart(2, '0')

const normalizeOrderDate = (order) => {
  if (!order) return null
  const val =
    order.createdAt ||
    order.date ||
    order.timestamp ||
    order.updatedAt ||
    order.backedUpAt ||
    order.ticketCreatedAt
  if (!val) return null

  if (typeof val === 'object' && typeof val.toDate === 'function') {
    return val.toDate()
  }
  if (typeof val === 'object' && typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000)
  }
  if (val instanceof Date) {
    return val
  }
  if (typeof val === 'string') {
    const cleanStr = val.includes(' ') && !val.includes('T') ? val.replace(' ', 'T') : val
    const d = new Date(cleanStr)
    if (!isNaN(d.getTime())) return d
  }
  if (typeof val === 'number') {
    const d = new Date(val)
    if (!isNaN(d.getTime())) return d
  }
  return null
}

export default function RevenueBarChart({
  orders = [],
  filterRange = '30d',
  customStart = '',
  customEnd = '',
  currencySymbol = 'Rs. ',
}) {
  const [granularity, setGranularity] = useState('daily') // 'daily' | 'monthly'
  const [hoveredBar, setHoveredBar] = useState(null)

  // Smart-default granularity when filterRange changes to a multi-month range
  useEffect(() => {
    if (['6m', '6months', '12m', '12months', '1y', 'all'].includes(filterRange)) {
      setGranularity('monthly')
    } else {
      setGranularity('daily')
    }
  }, [filterRange])

  // Calculate bucketed data based on filtered orders from the top range bar
  const { buckets, maxRevenue, totalRevenue, totalOrdersCount, avgRevenue, peakBucket, dateSpanDays } = useMemo(() => {
    if (!orders || orders.length === 0) {
      return {
        buckets: [],
        maxRevenue: 100,
        totalRevenue: 0,
        totalOrdersCount: 0,
        avgRevenue: 0,
        peakBucket: null,
        dateSpanDays: 0,
      }
    }

    // Extract valid timestamps from orders
    const validOrders = orders.filter((o) => {
      const status = (o.status || '').toUpperCase()
      if (status && status !== 'PAID' && status !== 'COMPLETED' && status !== 'DELIVERED') {
        return false
      }
      const d = normalizeOrderDate(o)
      return d && !isNaN(d.getTime())
    })

    if (validOrders.length === 0) {
      return {
        buckets: [],
        maxRevenue: 100,
        totalRevenue: 0,
        totalOrdersCount: 0,
        avgRevenue: 0,
        peakBucket: null,
        dateSpanDays: 0,
      }
    }

    const timestamps = validOrders.map((o) => normalizeOrderDate(o).getTime())
    const minTimestamp = Math.min(...timestamps)
    const maxTimestamp = Math.max(...timestamps)

    const now = new Date()
    let startDate = new Date(minTimestamp)
    startDate.setHours(0, 0, 0, 0)
    let endDate = new Date(maxTimestamp)
    endDate.setHours(23, 59, 59, 999)

    // Match top filter bounds if specified
    if (filterRange === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    } else if (filterRange === '7d' || filterRange === '7days') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0)
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    } else if (filterRange === '30d' || filterRange === '30days') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0)
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    } else if (filterRange === '3m' || filterRange === '3months') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate(), 0, 0, 0, 0)
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    } else if (filterRange === '6m' || filterRange === '6months') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate(), 0, 0, 0, 0)
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    } else if (filterRange === '12m' || filterRange === '12months') {
      startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 0, 0, 0, 0)
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    } else if (filterRange === 'custom') {
      if (customStart) startDate = new Date(`${customStart}T00:00:00`)
      if (customEnd) endDate = new Date(`${customEnd}T23:59:59`)
    }

    const spanDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))

    let resultBuckets = []

    if (granularity === 'daily') {
      const map = new Map()
      const curr = new Date(startDate)
      while (curr <= endDate) {
        const key = `${curr.getFullYear()}-${pad(curr.getMonth() + 1)}-${pad(curr.getDate())}`
        const monthShort = curr.toLocaleDateString(undefined, { month: 'short' })
        const dayNum = curr.getDate()
        const label = spanDays > 45 ? `${dayNum} ${monthShort}` : `${monthShort} ${dayNum}`
        const fullDate = curr.toLocaleDateString(undefined, {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
        const entry = {
          key,
          label,
          dayNum,
          monthShort,
          year: curr.getFullYear(),
          fullDate,
          revenue: 0,
          ordersCount: 0,
          itemsCount: 0,
        }
        map.set(key, entry)
        resultBuckets.push(entry)
        curr.setDate(curr.getDate() + 1)
      }

      validOrders.forEach((o) => {
        const d = normalizeOrderDate(o)
        if (!d) return
        const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        const b = map.get(key)
        if (b) {
          b.revenue += Number(o.total || 0)
          b.ordersCount += 1
          b.itemsCount += Array.isArray(o.items) ? o.items.reduce((acc, it) => acc + (it.qty || 1), 0) : 0
        }
      })
    } else {
      // Monthly aggregation
      const startMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
      const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1)

      const map = new Map()
      const curr = new Date(startMonth)
      while (curr <= endMonth) {
        const key = `${curr.getFullYear()}-${pad(curr.getMonth() + 1)}`
        const monthShort = curr.toLocaleDateString(undefined, { month: 'short' })
        const yearShort = `'${String(curr.getFullYear()).slice(-2)}`
        const label = `${monthShort} ${yearShort}`
        const fullDate = curr.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        const entry = {
          key,
          label,
          monthShort,
          yearShort,
          fullDate,
          revenue: 0,
          ordersCount: 0,
          itemsCount: 0,
        }
        map.set(key, entry)
        resultBuckets.push(entry)
        curr.setMonth(curr.getMonth() + 1)
      }

      validOrders.forEach((o) => {
        const d = normalizeOrderDate(o)
        if (!d) return
        const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
        const b = map.get(key)
        if (b) {
          b.revenue += Number(o.total || 0)
          b.ordersCount += 1
          b.itemsCount += Array.isArray(o.items) ? o.items.reduce((acc, it) => acc + (it.qty || 1), 0) : 0
        }
      })
    }

    const totalRev = resultBuckets.reduce((sum, b) => sum + b.revenue, 0)
    const totalOrders = resultBuckets.reduce((sum, b) => sum + b.ordersCount, 0)
    const activeBucketsCount = resultBuckets.filter((b) => b.revenue > 0).length || 1
    const avgRev = totalRev / activeBucketsCount
    const maxRev = Math.max(...resultBuckets.map((b) => b.revenue), 1000)

    let peak = null
    resultBuckets.forEach((b) => {
      if (!peak || b.revenue > peak.revenue) {
        peak = b
      }
    })

    return {
      buckets: resultBuckets,
      maxRevenue: maxRev,
      totalRevenue: totalRev,
      totalOrdersCount: totalOrders,
      avgRevenue: avgRev,
      peakBucket: peak && peak.revenue > 0 ? peak : null,
      dateSpanDays: spanDays,
    }
  }, [orders, filterRange, customStart, customEnd, granularity])

  // Height increased significantly for prominent, well-proportioned vertical bars
  const chartWidth = 900
  const chartHeight = 350
  const padding = { top: 25, right: 25, bottom: 42, left: 80 }
  const usableWidth = chartWidth - padding.left - padding.right
  const usableHeight = chartHeight - padding.top - padding.bottom

  const barCount = buckets.length
  const stepWidth = barCount > 0 ? usableWidth / barCount : usableWidth
  // Responsive bar width tailored for spacing
  const barWidth =
    barCount > 100
      ? Math.max(2.5, stepWidth * 0.85)
      : barCount > 40
      ? Math.max(4, stepWidth * 0.75)
      : barCount > 15
      ? Math.max(8, Math.min(26, stepWidth * 0.65))
      : Math.max(16, Math.min(48, stepWidth * 0.45))

  // Adaptive X-axis label display rule to prevent overlapping
  const visibleLabelIndices = useMemo(() => {
    const total = buckets.length
    if (total === 0) return new Set()
    const indices = new Set()

    if (granularity === 'monthly') {
      const step = total > 14 ? 2 : 1
      for (let i = 0; i < total; i += step) {
        indices.add(i)
      }
      indices.add(total - 1)
    } else {
      const maxLabels = 8
      const step = Math.max(1, Math.ceil(total / maxLabels))
      for (let i = 0; i < total; i += step) {
        indices.add(i)
      }
      indices.add(total - 1)
    }

    return indices
  }, [buckets.length, granularity])

  return (
    <div
      className="card p-5 sm:p-6 mb-6 overflow-hidden"
      onMouseLeave={() => setHoveredBar(null)}
    >
      {/* Header & Controls without emojis */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </span>
            <h3 className="text-base font-bold text-neutral-900">Revenue Bar Chart</h3>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Synced with top date range • Toggle grouping by day or month
          </p>
        </div>

        {/* Clean Daily / Monthly Toggle */}
        <div className="flex rounded-xl bg-neutral-100 p-1 border border-neutral-200/80">
          <button
            type="button"
            onClick={() => setGranularity('daily')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              granularity === 'daily'
                ? 'bg-white text-emerald-700 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Daily
          </button>
          <button
            type="button"
            onClick={() => setGranularity('monthly')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              granularity === 'monthly'
                ? 'bg-white text-emerald-700 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Monthly
          </button>
        </div>
      </div>

      {/* KPI Highlights Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-100">
          <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Total Revenue</p>
          <p className="mt-1 text-base sm:text-lg font-black text-emerald-950 truncate">
            {currencySymbol}
            {totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/70">
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
            Avg / {granularity === 'daily' ? 'Day' : 'Month'}
          </p>
          <p className="mt-1 text-base sm:text-lg font-extrabold text-neutral-900 truncate">
            {currencySymbol}
            {avgRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/70">
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
            Peak {granularity === 'daily' ? 'Day' : 'Month'}
          </p>
          {peakBucket ? (
            <div className="mt-1 truncate">
              <span className="text-sm font-extrabold text-neutral-900">
                {currencySymbol}
                {peakBucket.revenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
              <span className="text-[10px] text-neutral-400 ml-1 font-medium">({peakBucket.label})</span>
            </div>
          ) : (
            <p className="mt-1 text-sm font-medium text-neutral-400">—</p>
          )}
        </div>

        <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/70">
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Checkouts</p>
          <p className="mt-1 text-base sm:text-lg font-extrabold text-neutral-900 truncate">
            {totalOrdersCount} <span className="text-xs font-normal text-neutral-400">orders</span>
          </p>
        </div>
      </div>

      {/* SVG Bar Chart Area with Height Increased */}
      <div
        className="relative w-full overflow-x-auto pb-1"
        onMouseLeave={() => setHoveredBar(null)}
      >
        {buckets.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-neutral-400 font-medium bg-neutral-50/50 rounded-xl border border-dashed border-neutral-200">
            No transaction records found for this period.
          </div>
        ) : (
          <div className="min-w-[550px] h-[340px] relative">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-full overflow-visible"
              preserveAspectRatio="none"
              onMouseLeave={() => setHoveredBar(null)}
            >
              <defs>
                <linearGradient id="chartBarEmeraldGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
                <linearGradient id="chartBarHoverGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>

              {/* Y Grid Lines and Scale Labels */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const lineY = padding.top + ratio * usableHeight
                const revValue = maxRevenue * (1 - ratio)
                return (
                  <g key={idx}>
                    <line
                      x1={padding.left}
                      y1={lineY}
                      x2={chartWidth - padding.right}
                      y2={lineY}
                      stroke="#f1f5f9"
                      strokeWidth="1.2"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={padding.left - 8}
                      y={lineY + 3.5}
                      fill="#94a3b8"
                      fontSize="9.5"
                      fontWeight="600"
                      textAnchor="end"
                    >
                      {currencySymbol}
                      {revValue >= 1000 ? `${(revValue / 1000).toFixed(1)}k` : revValue.toFixed(0)}
                    </text>
                  </g>
                )
              })}

              {/* Baseline axis */}
              <line
                x1={padding.left}
                y1={padding.top + usableHeight}
                x2={chartWidth - padding.right}
                y2={padding.top + usableHeight}
                stroke="#cbd5e1"
                strokeWidth="1.5"
              />

              {/* Bars */}
              {buckets.map((b, idx) => {
                const centerXPct = padding.left + idx * stepWidth + stepWidth / 2
                const barHeight = b.revenue > 0 ? (b.revenue / maxRevenue) * usableHeight : 2
                const barY = padding.top + usableHeight - barHeight
                const isHovered = hoveredBar?.key === b.key

                return (
                  <g
                    key={b.key}
                    className="cursor-pointer"
                    onMouseEnter={() =>
                      setHoveredBar({
                        ...b,
                        x: centerXPct,
                        y: barY,
                      })
                    }
                  >
                    {/* Full column invisible hit area for effortless hover trigger */}
                    <rect
                      x={centerXPct - stepWidth / 2}
                      y={padding.top}
                      width={stepWidth}
                      height={usableHeight}
                      fill="transparent"
                    />

                    {/* Bar rectangle with rounded top corners */}
                    <rect
                      x={centerXPct - barWidth / 2}
                      y={barY}
                      width={barWidth}
                      height={barHeight}
                      rx={Math.min(4, barWidth / 2)}
                      ry={Math.min(4, barWidth / 2)}
                      fill={isHovered ? 'url(#chartBarHoverGrad)' : b.revenue > 0 ? 'url(#chartBarEmeraldGrad)' : '#e2e8f0'}
                      style={{
                        filter: isHovered ? 'drop-shadow(0 4px 8px rgba(16, 185, 129, 0.45))' : 'none',
                        opacity: b.revenue > 0 ? (isHovered ? 1 : 0.92) : 0.35,
                        transition: 'opacity 0.15s ease',
                      }}
                    />
                  </g>
                )
              })}

              {/* Non-overlapping X Axis Labels */}
              {buckets.map((b, idx) => {
                if (!visibleLabelIndices.has(idx)) return null

                const centerXPct = padding.left + idx * stepWidth + stepWidth / 2
                return (
                  <text
                    key={`lbl-${b.key}`}
                    x={centerXPct}
                    y={chartHeight - 14}
                    fill="#64748b"
                    fontSize="9.5"
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    {b.label}
                  </text>
                )
              })}
            </svg>

            {/* Hover Tooltip Floating Card with Smart Boundary Positioning */}
            {hoveredBar && (() => {
              const showBelow = hoveredBar.y < 175
              const xPct = Math.max(16, Math.min(84, (hoveredBar.x / chartWidth) * 100))
              const yPct = (hoveredBar.y / chartHeight) * 100

              return (
                <div
                  className="absolute z-30 pointer-events-none rounded-xl bg-neutral-900/95 backdrop-blur-xs p-3 text-xs text-white shadow-2xl border border-neutral-700 animate-in fade-in zoom-in-95 duration-150"
                  style={{
                    left: `${xPct}%`,
                    top: showBelow ? `calc(${yPct}% + 14px)` : `calc(${yPct}% - 12px)`,
                    transform: showBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
                    minWidth: '160px',
                  }}
                >
                  <p className="font-semibold text-neutral-400 text-[11px] border-b border-neutral-800 pb-1 mb-1.5">
                    {hoveredBar.fullDate || hoveredBar.label}
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-neutral-400 text-[11px]">Revenue:</span>
                      <span className="font-extrabold text-sm text-emerald-400">
                        {currencySymbol}
                        {hoveredBar.revenue.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-[11px] text-neutral-300">
                      <span>Orders:</span>
                      <span className="font-bold">{hoveredBar.ordersCount}</span>
                    </div>
                    {hoveredBar.itemsCount > 0 && (
                      <div className="flex items-center justify-between gap-3 text-[11px] text-neutral-300">
                        <span>Items Sold:</span>
                        <span className="font-bold">{hoveredBar.itemsCount}</span>
                      </div>
                    )}
                    {hoveredBar.ordersCount > 0 && (
                      <div className="flex items-center justify-between gap-3 text-[10px] text-neutral-400 pt-0.5 border-t border-neutral-800">
                        <span>Avg / Order:</span>
                        <span>
                          {currencySymbol}
                          {(hoveredBar.revenue / hoveredBar.ordersCount).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}
