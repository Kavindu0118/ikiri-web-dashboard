import { useState, useEffect, useMemo, useCallback } from 'react'
import { db, isFirebaseConfigured } from '../../lib/firebase'
import { jsPDF } from 'jspdf'
import { IconAnalytics, IconDownload, IconFileText, IconSearch } from '../Icons'
import RevenueBarChart from '../analytics/RevenueBarChart'
import {
  getDateRangeBounds,
  fetchOrdersByDateRange,
  subscribeToTodayOrders,
  saveDailySummary,
  fetchDailySummariesRange,
  normalizeOrderDate,
} from '../../lib/analyticsStorage'

export const getOrderChannelInfo = (order) => {
  if (!order) return { key: 'COUNTER', label: 'Counter / Walk-in', icon: '', badgeColor: 'bg-neutral-100 text-neutral-800 border-neutral-200' }
  const src = (order.source || '').toUpperCase()
  const ordType = (order.orderType || '').toUpperCase()

  if (src === 'SURFHOUSE' || src === 'SURF_HOUSE' || ordType === 'SURFHOUSE' || ordType === 'SURF_HOUSE' || ordType === 'RENTAL') {
    return { key: 'SURFHOUSE', label: 'Surf House / Rentals', icon: '', badgeColor: 'bg-amber-50 text-amber-800 border-amber-200' }
  }
  if (src === 'ROOM' || ordType === 'ROOM' || (order.roomNumber !== undefined && order.roomNumber !== null && String(order.roomNumber).trim() !== '')) {
    return { key: 'ROOM', label: 'Room Service', icon: '', badgeColor: 'bg-purple-50 text-purple-800 border-purple-200' }
  }
  if (src === 'TABLE' || ordType === 'TABLE' || (order.tableNumber !== undefined && order.tableNumber !== null && String(order.tableNumber).trim() !== '')) {
    return { key: 'TABLE', label: 'Dine-In (Tables)', icon: '', badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200' }
  }
  if (src === 'ONLINE' || src === 'QR' || ordType === 'ONLINE') {
    return { key: 'ONLINE', label: 'Online / QR Orders', icon: '', badgeColor: 'bg-sky-50 text-sky-800 border-sky-200' }
  }
  return { key: 'COUNTER', label: 'Counter / Walk-in', icon: '', badgeColor: 'bg-neutral-100 text-neutral-800 border-neutral-200' }
}

export const getOrderLocationLabel = (order) => {
  if (!order) return 'Walk-in / Counter'
  if (order.roomNumber !== undefined && order.roomNumber !== null && String(order.roomNumber).trim() !== '') {
    return `Room ${order.roomNumber}`
  }
  if (order.tableNumber !== undefined && order.tableNumber !== null && String(order.tableNumber).trim() !== '') {
    return `Table ${order.tableNumber}`
  }
  const src = (order.source || '').toUpperCase()
  const ordType = (order.orderType || '').toUpperCase()
  if (src === 'SURFHOUSE' || src === 'SURF_HOUSE' || ordType === 'SURFHOUSE' || ordType === 'RENTAL') {
    return 'Surf House'
  }
  if (src === 'ONLINE' || ordType === 'ONLINE') {
    return 'Online QR'
  }
  return 'Walk-in / Counter'
}

export default function AnalyticsScreen({ profile, restaurantSettings, restaurantId: propRestaurantId, setActiveSection }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [filterRange, setFilterRange] = useState('7d') // 'today', '7d', '30d', 'all', 'custom'
  const [hoveredPoint, setHoveredPoint] = useState(null) // for chart tooltips
  const [viewMode, setViewMode] = useState('dashboard') // 'dashboard', 'detailed-items', or 'reports'
  const [detailedFilterRange, setDetailedFilterRange] = useState('7d')
  const [hoveredItemPoint, setHoveredItemPoint] = useState(null)
  const [customStartDateTime, setCustomStartDateTime] = useState('')
  const [customEndDateTime, setCustomEndDateTime] = useState('')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Reports state
  const [reportType, setReportType] = useState('itemized_bill') // 'itemized_bill', 'summary_80mm', 'transactions', 'items', 'payments'
  const [reportSearchQuery, setReportSearchQuery] = useState('')
  const [reportPaymentFilter, setReportPaymentFilter] = useState('all')
  const [reportSourceFilter, setReportSourceFilter] = useState('all')
  const [reportStatusFilter, setReportStatusFilter] = useState('PAID')
  const [reportSortField, setReportSortField] = useState('date')
  const [reportSortDir, setReportSortDir] = useState('desc')
  const [copyStatus, setCopyStatus] = useState(false)
  const [tableCurrentPage, setTableCurrentPage] = useState(1)
  const [tablePageSize, setTablePageSize] = useState(50)

  // Reset pagination on filter or search changes
  useEffect(() => {
    setTableCurrentPage(1)
  }, [filterRange, customStartDateTime, customEndDateTime, reportStatusFilter, reportPaymentFilter, reportSourceFilter, reportSearchQuery, reportSortField, reportSortDir])

  const targetRestaurantId = useMemo(() => {
    return propRestaurantId || profile?.restaurantId || restaurantSettings?.id || profile?.id || null
  }, [propRestaurantId, profile?.restaurantId, profile?.id, restaurantSettings?.id])

  const setQuickCustomRange = (preset) => {
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const formatDT = (d) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

    if (preset === 'today_full') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
      setCustomStartDateTime(formatDT(start))
      setCustomEndDateTime(formatDT(end))
    } else if (preset === 'yesterday') {
      const yesterday = new Date(now)
      yesterday.setDate(now.getDate() - 1)
      const start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0)
      const end = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59)
      setCustomStartDateTime(formatDT(start))
      setCustomEndDateTime(formatDT(end))
    } else if (preset === 'lunch') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 0, 0)
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 0, 0)
      setCustomStartDateTime(formatDT(start))
      setCustomEndDateTime(formatDT(end))
    } else if (preset === 'dinner') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0, 0)
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 30, 0)
      setCustomStartDateTime(formatDT(start))
      setCustomEndDateTime(formatDT(end))
    } else if (preset === 'last24h') {
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      setCustomStartDateTime(formatDT(start))
      setCustomEndDateTime(formatDT(now))
    } else if (preset === 'clear') {
      setCustomStartDateTime('')
      setCustomEndDateTime('')
    }
  }

  const handleSelectFilterRange = (range) => {
    setFilterRange(range)
    if (range === 'custom' && !customStartDateTime && !customEndDateTime) {
      setQuickCustomRange('today_full')
    }
  }

  // Strategy 1: Server-side order fetch
  const fetchBackupData = useCallback(async () => {
    if (!isFirebaseConfigured || !db || !targetRestaurantId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const fetchedOrders = await fetchOrdersByDateRange(db, targetRestaurantId, null, null, 5000)
      setOrders(fetchedOrders)
    } catch (err) {
      console.error('Error fetching backup database orders:', err)
      setError(err.message || 'Could not load analytics data.')
    } finally {
      setLoading(false)
    }
  }, [targetRestaurantId])

  useEffect(() => {
    fetchBackupData()
  }, [fetchBackupData])

  // Strategy 3: Real-time listener restricted strictly to active shift (Today)
  useEffect(() => {
    if (!isFirebaseConfigured || !db || !targetRestaurantId) return

    // Only subscribe to real-time events when viewing today or ranges that encompass current day
    const isViewingToday = filterRange === 'today' || filterRange === '7d' || filterRange === '7days' || filterRange === '30d' || filterRange === '30days'
    if (!isViewingToday) return

    const unsub = subscribeToTodayOrders(
      db,
      targetRestaurantId,
      (todayOrders) => {
        if (!todayOrders || todayOrders.length === 0) return
        setOrders((prev) => {
          const map = new Map(prev.map((o) => [o.id, o]))
          todayOrders.forEach((o) => map.set(o.id, { ...map.get(o.id), ...o }))
          return Array.from(map.values())
        })
      },
      (err) => {
        console.warn('Active shift realtime listener notice:', err)
      }
    )

    return () => unsub()
  }, [targetRestaurantId, filterRange])

  // Filter orders by selected date range
  const filteredOrders = useMemo(() => {
    const now = new Date()
    return orders.filter((order) => {
      const orderDate = normalizeOrderDate(order)
      if (!orderDate || isNaN(orderDate.getTime())) return false

      if (filterRange === 'today') {
        return (
          orderDate.getDate() === now.getDate() &&
          orderDate.getMonth() === now.getMonth() &&
          orderDate.getFullYear() === now.getFullYear()
        )
      } else if (filterRange === 'yesterday') {
        const y = new Date(now)
        y.setDate(y.getDate() - 1)
        return (
          orderDate.getDate() === y.getDate() &&
          orderDate.getMonth() === y.getMonth() &&
          orderDate.getFullYear() === y.getFullYear()
        )
      } else if (filterRange === '7d' || filterRange === '7days') {
        const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0)
        return orderDate >= sevenDaysAgo
      } else if (filterRange === '30d' || filterRange === '30days') {
        const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0)
        return orderDate >= thirtyDaysAgo
      } else if (filterRange === '3m' || filterRange === '3months') {
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate(), 0, 0, 0, 0)
        return orderDate >= threeMonthsAgo
      } else if (filterRange === '6m' || filterRange === '6months') {
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate(), 0, 0, 0, 0)
        return orderDate >= sixMonthsAgo
      } else if (filterRange === '12m' || filterRange === '12months') {
        const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 0, 0, 0, 0)
        return orderDate >= twelveMonthsAgo
      } else if (filterRange === 'custom') {
        if (!customStartDateTime && !customEndDateTime) return true
        let match = true
        if (customStartDateTime) {
          const start = new Date(customStartDateTime)
          if (!isNaN(start.getTime())) {
            match = match && orderDate >= start
          }
        }
        if (customEndDateTime) {
          const end = new Date(customEndDateTime)
          if (!isNaN(end.getTime())) {
            match = match && orderDate <= end
          }
        }
        return match
      }
      return true // 'all'
    })
  }, [orders, filterRange, customStartDateTime, customEndDateTime])

  // Aggregate stats
  const stats = useMemo(() => {
    let totalRevenue = 0
    let totalOrders = 0
    let itemsSold = 0
    let cardFees = 0
    let serviceFees = 0
    let highestOrder = 0

    const paymentMethods = {}
    const orderSources = {
      'TABLE': 0,
      'ROOM': 0,
      'SURFHOUSE': 0,
      'COUNTER': 0,
      'ONLINE': 0,
    }
    const popularItems = {}
    const locationRevenue = {}
    const dailyRevenueMap = {}

    // Sort filtered orders by date
    const sorted = [...filteredOrders].sort((a, b) => {
      const dateA = normalizeOrderDate(a) || new Date(0)
      const dateB = normalizeOrderDate(b) || new Date(0)
      return dateA.getTime() - dateB.getTime()
    })

    sorted.forEach((order) => {
      // Only count PAID orders
      const isPaid = order.status?.toUpperCase() === 'PAID'
      if (!isPaid) return

      totalOrders += 1
      const orderTotal = Number(order.total || 0)
      totalRevenue += orderTotal
      cardFees += Number(order.cardFeeAmount || 0)
      serviceFees += Number(order.serviceFeeAmount || 0)

      if (orderTotal > highestOrder) {
        highestOrder = orderTotal
      }

      // Payment method
      const payMethod = order.paymentMethod?.toUpperCase() || 'CASH'
      paymentMethods[payMethod] = (paymentMethods[payMethod] || 0) + orderTotal

      // Source channel
      const channelInfo = getOrderChannelInfo(order)
      orderSources[channelInfo.key] = (orderSources[channelInfo.key] || 0) + orderTotal

      // Location performance (Tables, Rooms with partitions, Surfhouse, Counter)
      const locLabel = getOrderLocationLabel(order)
      if (locLabel) {
        if (!locationRevenue[locLabel]) {
          locationRevenue[locLabel] = {
            table: locLabel,
            location: locLabel,
            revenue: 0,
            count: 0,
            channel: channelInfo.key,
            icon: channelInfo.icon,
          }
        }
        locationRevenue[locLabel].revenue += orderTotal
        locationRevenue[locLabel].count += 1
      }

      // Date key for revenue trend (YYYY-MM-DD)
      const dateStr = typeof order.createdAt === 'string' ? order.createdAt.split('T')[0] : (order.createdAt?.toDate ? order.createdAt.toDate().toISOString().split('T')[0] : 'Unknown')
      dailyRevenueMap[dateStr] = (dailyRevenueMap[dateStr] || 0) + orderTotal

      // Item aggregates
      if (Array.isArray(order.items)) {
        order.items.forEach((item) => {
          const name = item.name || 'Unnamed Item'
          const qty = Number(item.qty || 1)
          const price = Number(item.price || 0)
          const itemTotal = qty * price

          itemsSold += qty
          if (!popularItems[name]) {
            popularItems[name] = { qty: 0, revenue: 0 }
          }
          popularItems[name].qty += qty
          popularItems[name].revenue += itemTotal
        })
      }
    })

    const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0

    // Format daily trend data
    const dailyTrend = Object.keys(dailyRevenueMap)
      .sort()
      .map((date) => {
        const d = new Date(date)
        const formattedDate = !isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : date
        return {
          dateStr: formattedDate,
          rawDate: date,
          revenue: dailyRevenueMap[date],
        }
      })

    // Format popular items
    const popularItemsList = Object.keys(popularItems)
      .map((name) => ({
        name,
        qty: popularItems[name].qty,
        revenue: popularItems[name].revenue,
      }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)

    // Format table & location performance
    const tablePerformanceList = Object.values(locationRevenue)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6)

    return {
      totalRevenue,
      totalOrders,
      itemsSold,
      cardFees,
      serviceFees,
      highestOrder,
      aov,
      paymentMethods,
      orderSources,
      popularItemsList,
      tablePerformanceList,
      dailyTrend,
      rawSortedOrders: sorted,
    }
  }, [filteredOrders])

  // SVG Chart Dimensions & Computations
  const chartWidth = 500
  const chartHeight = 200
  const chartPadding = { top: 20, right: 20, bottom: 30, left: 50 }

  const chartPoints = useMemo(() => {
    const trend = stats.dailyTrend
    if (trend.length === 0) return []

    const maxRev = Math.max(...trend.map((t) => t.revenue), 100)
    const xRange = chartWidth - chartPadding.left - chartPadding.right
    const yRange = chartHeight - chartPadding.top - chartPadding.bottom

    return trend.map((t, index) => {
      const x = chartPadding.left + (index / Math.max(trend.length - 1, 1)) * xRange
      const y = chartPadding.top + yRange - (t.revenue / maxRev) * yRange
      return { x, y, date: t.dateStr, revenue: t.revenue }
    })
  }, [stats.dailyTrend])

  const chartPath = useMemo(() => {
    if (chartPoints.length === 0) return ''
    let d = `M ${chartPoints[0].x} ${chartPoints[0].y}`
    for (let i = 1; i < chartPoints.length; i++) {
      // Calculate control points for smooth Bezier curve
      const cpX1 = chartPoints[i - 1].x + (chartPoints[i].x - chartPoints[i - 1].x) / 2
      const cpY1 = chartPoints[i - 1].y
      const cpX2 = chartPoints[i - 1].x + (chartPoints[i].x - chartPoints[i - 1].x) / 2
      const cpY2 = chartPoints[i].y
      d += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${chartPoints[i].x} ${chartPoints[i].y}`
    }
    return d
  }, [chartPoints])

  const chartAreaPath = useMemo(() => {
    if (chartPoints.length === 0) return ''
    const bottomY = chartHeight - chartPadding.bottom
    let d = chartPath
    d += ` L ${chartPoints[chartPoints.length - 1].x} ${bottomY}`
    d += ` L ${chartPoints[0].x} ${bottomY} Z`
    return d
  }, [chartPoints, chartPath])



  const allItemsStats = useMemo(() => {
    const now = new Date()
    
    // First, filter orders in the date range
    const filteredOrdersForItems = orders.filter((order) => {
      let orderDate
      if (order.createdAt) {
        orderDate = new Date(order.createdAt)
      } else {
        return false
      }
      if (isNaN(orderDate.getTime())) return false

      if (detailedFilterRange === 'today') {
        return (
          orderDate.getDate() === now.getDate() &&
          orderDate.getMonth() === now.getMonth() &&
          orderDate.getFullYear() === now.getFullYear()
        )
      } else if (detailedFilterRange === '7d') {
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(now.getDate() - 7)
        return orderDate >= sevenDaysAgo
      } else if (detailedFilterRange === '30d') {
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(now.getDate() - 30)
        return orderDate >= thirtyDaysAgo
      } else if (detailedFilterRange === 'custom') {
        if (!customStartDateTime && !customEndDateTime && !customStartDate && !customEndDate) return true
        let match = true
        const startVal = customStartDateTime || (customStartDate ? `${customStartDate}T00:00` : '')
        const endVal = customEndDateTime || (customEndDate ? `${customEndDate}T23:59:59` : '')
        if (startVal) {
          const start = new Date(startVal)
          if (!isNaN(start.getTime())) {
            match = match && orderDate >= start
          }
        }
        if (endVal) {
          const end = new Date(endVal)
          if (!isNaN(end.getTime())) {
            match = match && orderDate <= end
          }
        }
        return match
      }
      return true // 'all'
    })

    // Now, aggregate details for all items across these orders
    const itemsMap = {}
    const dailySalesMap = {} // dateStr -> totalSalesForDay
    let totalPeriodRevenue = 0
    let totalPeriodQty = 0

    // Compute overall total item revenue in this period to keep contribution percentages correct
    let overallRevenue = 0
    filteredOrdersForItems.forEach((order) => {
      const isPaid = order.status?.toUpperCase() === 'PAID'
      if (!isPaid) return
      if (Array.isArray(order.items)) {
        order.items.forEach((item) => {
          overallRevenue += Number(item.qty || 1) * Number(item.price || 0)
        })
      }
    })

    filteredOrdersForItems.forEach((order) => {
      const isPaid = order.status?.toUpperCase() === 'PAID'
      if (!isPaid) return

      const dateStr = order.createdAt.split('T')[0]

      if (Array.isArray(order.items)) {
        order.items.forEach((item) => {
          const name = item.name || 'Unnamed Item'

          // Apply search query filter if provided
          if (searchQuery && !name.toLowerCase().includes(searchQuery.toLowerCase())) {
            return
          }

          const qty = Number(item.qty || 1)
          const price = Number(item.price || 0)
          const itemTotal = qty * price

          totalPeriodQty += qty
          totalPeriodRevenue += itemTotal
          dailySalesMap[dateStr] = (dailySalesMap[dateStr] || 0) + itemTotal

          if (!itemsMap[name]) {
            itemsMap[name] = {
              name,
              qty: 0,
              revenue: 0,
              prices: [],
            }
          }
          itemsMap[name].qty += qty
          itemsMap[name].revenue += itemTotal
          itemsMap[name].prices.push(price)
        })
      }
    })

    // Convert items map to sorted array
    const itemsList = Object.keys(itemsMap).map((name) => {
      const item = itemsMap[name]
      const avgPrice = item.qty > 0 ? item.revenue / item.qty : (item.prices.length > 0 ? item.prices.reduce((a,b)=>a+b, 0) / item.prices.length : 0)
      const contributionPct = overallRevenue > 0 ? (item.revenue / overallRevenue) * 100 : 0
      return {
        name,
        qty: item.qty,
        revenue: item.revenue,
        avgPrice,
        contributionPct,
      }
    }).sort((a, b) => b.qty - a.qty)

    // Format daily sales trend for the chart
    const dailyTrend = Object.keys(dailySalesMap)
      .sort()
      .map((date) => {
        const d = new Date(date)
        const formattedDate = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        return {
          dateStr: formattedDate,
          rawDate: date,
          earnings: dailySalesMap[date],
        }
      })

    return {
      itemsList,
      dailyTrend,
      totalPeriodRevenue,
      totalPeriodQty,
    }
  }, [orders, detailedFilterRange, customStartDate, customEndDate, searchQuery])

  const detailedChartPoints = useMemo(() => {
    const trend = allItemsStats.dailyTrend
    if (trend.length === 0) return []

    const maxEarn = Math.max(...trend.map((t) => t.earnings), 10)
    const xRange = chartWidth - chartPadding.left - chartPadding.right
    const yRange = chartHeight - chartPadding.top - chartPadding.bottom

    return trend.map((t, index) => {
      const x = chartPadding.left + (index / Math.max(trend.length - 1, 1)) * xRange
      const y = chartPadding.top + yRange - (t.earnings / maxEarn) * yRange
      return { x, y, date: t.dateStr, earnings: t.earnings }
    })
  }, [allItemsStats])

  const detailedChartPath = useMemo(() => {
    if (detailedChartPoints.length === 0) return ''
    let d = `M ${detailedChartPoints[0].x} ${detailedChartPoints[0].y}`
    for (let i = 1; i < detailedChartPoints.length; i++) {
      const cpX1 = detailedChartPoints[i - 1].x + (detailedChartPoints[i].x - detailedChartPoints[i - 1].x) / 2
      const cpY1 = detailedChartPoints[i - 1].y
      const cpX2 = detailedChartPoints[i - 1].x + (detailedChartPoints[i].x - detailedChartPoints[i - 1].x) / 2
      const cpY2 = detailedChartPoints[i].y
      d += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${detailedChartPoints[i].x} ${detailedChartPoints[i].y}`
    }
    return d
  }, [detailedChartPoints])

  const detailedChartAreaPath = useMemo(() => {
    if (detailedChartPoints.length === 0) return ''
    const bottomY = chartHeight - chartPadding.bottom
    let d = detailedChartPath
    d += ` L ${detailedChartPoints[detailedChartPoints.length - 1].x} ${bottomY}`
    d += ` L ${detailedChartPoints[0].x} ${bottomY} Z`
    return d
  }, [detailedChartPoints, detailedChartPath])

  const currencySymbol = restaurantSettings?.currency === 'LKR' ? 'Rs. ' : '$'

  // Helper for CSV export
  const exportToCSV = (filename, rows) => {
    const processRow = (row) => {
      return row
        .map((val) => {
          let finalVal = val === null || val === undefined ? '' : String(val)
          if (finalVal.search(/("|,|\n|\r)/g) >= 0) {
            finalVal = `"${finalVal.replace(/"/g, '""')}"`
          }
          return finalVal
        })
        .join(',')
    }

    const csvContent = '\uFEFF' + rows.map(processRow).join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Aggregate Report Data
  const reportData = useMemo(() => {
    const now = new Date()

    // 1. Filter orders by date/time
    const timeFiltered = orders.filter((order) => {
      let orderDate
      if (order.createdAt) {
        if (typeof order.createdAt === 'object' && typeof order.createdAt.toDate === 'function') {
          orderDate = order.createdAt.toDate()
        } else if (typeof order.createdAt === 'object' && order.createdAt.seconds) {
          orderDate = new Date(order.createdAt.seconds * 1000)
        } else {
          orderDate = new Date(order.createdAt)
        }
      } else {
        return false
      }

      if (!orderDate || isNaN(orderDate.getTime())) return false

      if (filterRange === 'today') {
        return (
          orderDate.getDate() === now.getDate() &&
          orderDate.getMonth() === now.getMonth() &&
          orderDate.getFullYear() === now.getFullYear()
        )
      } else if (filterRange === '7d') {
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(now.getDate() - 7)
        return orderDate >= sevenDaysAgo
      } else if (filterRange === '30d') {
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(now.getDate() - 30)
        return orderDate >= thirtyDaysAgo
      } else if (filterRange === '3m') {
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate(), 0, 0, 0, 0)
        return orderDate >= threeMonthsAgo
      } else if (filterRange === '6m') {
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate(), 0, 0, 0, 0)
        return orderDate >= sixMonthsAgo
      } else if (filterRange === '12m') {
        const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 0, 0, 0, 0)
        return orderDate >= twelveMonthsAgo
      } else if (filterRange === 'custom') {
        if (!customStartDateTime && !customEndDateTime) return true
        let match = true
        if (customStartDateTime) {
          const start = new Date(customStartDateTime)
          if (!isNaN(start.getTime())) match = match && orderDate >= start
        }
        if (customEndDateTime) {
          const end = new Date(customEndDateTime)
          if (!isNaN(end.getTime())) match = match && orderDate <= end
        }
        return match
      }
      return true
    })

    // 2. Filter by search query, payment method, source, status
    const fullyFiltered = timeFiltered.filter((order) => {
      if (reportStatusFilter !== 'all') {
        const s = (order.status || 'PAID').toUpperCase()
        if (s !== reportStatusFilter.toUpperCase()) return false
      }

      if (reportPaymentFilter !== 'all') {
        const pm = (order.paymentMethod || 'CASH').toUpperCase()
        if (pm !== reportPaymentFilter.toUpperCase()) return false
      }

      if (reportSourceFilter !== 'all') {
        const cInfo = getOrderChannelInfo(order)
        if (cInfo.key !== reportSourceFilter.toUpperCase()) return false
      }

      if (reportSearchQuery.trim()) {
        const q = reportSearchQuery.toLowerCase()
        const matchId = String(order.id || '').toLowerCase().includes(q)
        const matchTable = String(order.tableNumber || '').toLowerCase().includes(q)
        const matchRoom = String(order.roomNumber || '').toLowerCase().includes(q)
        const matchNote = String(order.note || '').toLowerCase().includes(q)
        const matchPay = String(order.paymentMethod || '').toLowerCase().includes(q)
        const matchSource = String(order.source || '').toLowerCase().includes(q)
        const matchType = String(order.orderType || '').toLowerCase().includes(q)
        const matchItems = Array.isArray(order.items) && order.items.some((i) => (i.name || '').toLowerCase().includes(q))
        if (!matchId && !matchTable && !matchRoom && !matchNote && !matchPay && !matchSource && !matchType && !matchItems) return false
      }

      return true
    })

    // Summary calculations
    let totalGrossRevenue = 0
    let totalCardFees = 0
    let totalServiceFees = 0
    let totalOrdersCount = 0
    let totalItemsSold = 0

    // Datasets
    const itemsMap = {}
    const paymentMap = {}
    const dailyMap = {}
    const channelMap = {
      'COUNTER': { key: 'COUNTER', channel: 'Counter / Walk-in', count: 0, total: 0, icon: '' },
      'TABLE': { key: 'TABLE', channel: 'Dine-In (Tables)', count: 0, total: 0, icon: '' },
      'ROOM': { key: 'ROOM', channel: 'Room Service', count: 0, total: 0, icon: '' },
      'SURFHOUSE': { key: 'SURFHOUSE', channel: 'Surf House / Rentals', count: 0, total: 0, icon: '' },
      'ONLINE': { key: 'ONLINE', channel: 'Online / QR Orders', count: 0, total: 0, icon: '' },
    }

    // Sort orders
    const sortedOrders = [...fullyFiltered].sort((a, b) => {
      const dateA = normalizeOrderDate(a) || new Date(0)
      const dateB = normalizeOrderDate(b) || new Date(0)
      if (reportSortField === 'total') {
        return reportSortDir === 'asc' ? Number(a.total || 0) - Number(b.total || 0) : Number(b.total || 0) - Number(a.total || 0)
      }
      return reportSortDir === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime()
    })

    // Totals & datasets
    let totalDiscounts = 0
    let grossItemsSubtotal = 0
    let cashTotal = 0
    let cardGrossTotal = 0
    let onlineTotal = 0

    sortedOrders.forEach((order) => {
      const total = Number(order.total || 0)
      const cardFee = Number(order.cardFeeAmount || 0)
      const serviceFee = Number(order.serviceFeeAmount || 0)
      const subtotal = total - cardFee - serviceFee

      totalOrdersCount += 1
      totalGrossRevenue += total
      totalCardFees += cardFee
      totalServiceFees += serviceFee
      grossItemsSubtotal += subtotal

      // Payment aggregation
      const payKey = (order.paymentMethod || 'CASH').toUpperCase()
      if (!paymentMap[payKey]) {
        paymentMap[payKey] = { method: payKey, count: 0, gross: 0, fees: 0 }
      }
      paymentMap[payKey].count += 1
      paymentMap[payKey].gross += total
      paymentMap[payKey].fees += cardFee + serviceFee

      if (payKey === 'CASH') {
        cashTotal += total
      } else if (payKey === 'CARD') {
        cardGrossTotal += total
      } else if (payKey === 'ONLINE') {
        onlineTotal += total
      }

      // Date aggregation
      const dateObj = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt || 0)
      const dateKey = !isNaN(dateObj.getTime()) ? dateObj.toISOString().split('T')[0] : 'Unknown Date'
      if (!dailyMap[dateKey]) {
        dailyMap[dateKey] = { date: dateKey, count: 0, items: 0, gross: 0, fees: 0 }
      }
      dailyMap[dateKey].count += 1
      dailyMap[dateKey].gross += total
      dailyMap[dateKey].fees += cardFee + serviceFee

      // Items aggregation
      if (Array.isArray(order.items)) {
        order.items.forEach((it) => {
          const name = it.name || 'Unnamed Item'
          const qty = Number(it.qty || 1)
          const price = Number(it.price || 0)
          const disc = Number(it.discountAmount || 0)
          const itemSubtotal = qty * price
          const itemPaid = Math.max(0, itemSubtotal - disc)

          totalItemsSold += qty
          totalDiscounts += disc
          dailyMap[dateKey].items += qty

          if (!itemsMap[name]) {
            itemsMap[name] = {
              name,
              qty: 0,
              price,
              subtotal: 0,
              discount: 0,
              paid: 0,
              revenue: 0,
            }
          }
          itemsMap[name].qty += qty
          itemsMap[name].subtotal += itemSubtotal
          itemsMap[name].discount += disc
          itemsMap[name].paid += itemPaid
          itemsMap[name].revenue += itemPaid
        })
      }

      // Channel aggregation
      const cInfo = getOrderChannelInfo(order)
      if (channelMap[cInfo.key]) {
        channelMap[cInfo.key].count += 1
        channelMap[cInfo.key].total += total
      }
    })

    const totalFees = totalCardFees + totalServiceFees
    const totalNetRevenue = totalGrossRevenue - totalFees
    const aov = totalOrdersCount > 0 ? totalGrossRevenue / totalOrdersCount : 0
    const cashlessTotal = Math.max(0, totalGrossRevenue - cashTotal)
    const cashlessNet = Math.max(0, cashlessTotal - totalCardFees)
    const channelList = Object.values(channelMap).filter((c) => c.count > 0)

    // Items list
    const itemsList = Object.values(itemsMap)
      .map((it) => ({
        ...it,
        percentage: totalGrossRevenue > 0 ? (it.revenue / totalGrossRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.qty - a.qty)

    // Payments list
    const paymentsList = Object.values(paymentMap)
      .map((pm) => ({
        ...pm,
        net: pm.gross - pm.fees,
        percentage: totalGrossRevenue > 0 ? (pm.gross / totalGrossRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.gross - a.gross)

    return {
      filteredOrders: sortedOrders,
      totalGrossRevenue,
      totalNetRevenue,
      totalFees,
      totalCardFees,
      totalServiceFees,
      totalOrdersCount,
      totalItemsSold,
      totalDiscounts,
      grossItemsSubtotal,
      cashTotal,
      cardGrossTotal,
      onlineTotal,
      cashlessTotal,
      cashlessNet,
      channelList,
      aov,
      itemsList,
      paymentsList,
    }
  }, [orders, filterRange, customStartDateTime, customEndDateTime, reportStatusFilter, reportPaymentFilter, reportSourceFilter, reportSearchQuery, reportSortField, reportSortDir])

  // Strategy 2: Automatically save pre-aggregated daily summary rollup when viewing today's active data
  useEffect(() => {
    if (!isFirebaseConfigured || !db || !targetRestaurantId || reportData.totalOrdersCount === 0) return
    if (filterRange === 'today') {
      const todayKey = new Date().toISOString().split('T')[0]
      saveDailySummary(db, targetRestaurantId, todayKey, {
        totalOrdersCount: reportData.totalOrdersCount,
        grossRevenue: reportData.totalGrossRevenue,
        netRevenue: reportData.totalNetRevenue,
        cashTotal: reportData.cashTotal,
        cashlessTotal: reportData.cashlessTotal,
        totalCardFees: reportData.totalCardFees,
        totalServiceFees: reportData.totalServiceFees,
        totalDiscounts: reportData.totalDiscounts,
        totalItemsSold: reportData.totalItemsSold,
      })
    }
  }, [reportData, filterRange, targetRestaurantId])

  const totalTransactions = reportData.filteredOrders.length
  const totalTransactionPages = Math.ceil(totalTransactions / tablePageSize) || 1
  const paginatedOrders = useMemo(() => {
    const startIdx = (tableCurrentPage - 1) * tablePageSize
    return reportData.filteredOrders.slice(startIdx, startIdx + tablePageSize)
  }, [reportData.filteredOrders, tableCurrentPage, tablePageSize])

  const handleDownloadPDF = () => {
    const restaurantName = restaurantSettings?.name || 'SURF HOUSE'
    const restaurantAddress = restaurantSettings?.address || ''
    const restaurantPhone = restaurantSettings?.phone || ''
    const waiterName = profile?.displayName || profile?.name || 'Cashier'
    const cleanRestName = restaurantName.toLowerCase().replace(/[^a-z0-9]/g, '_')
    const timeRangeStr =
      filterRange === 'custom' && customStartDateTime && customEndDateTime
        ? `${customStartDateTime.replace(/[:]/g, '-')}_to_${customEndDateTime.replace(/[:]/g, '-')}`
        : filterRange
    const filename = `${cleanRestName}_${reportType === 'itemized_bill' ? 'daily_report_1' : reportType}_${timeRangeStr}.pdf`

    let dateRangeLabel = 'All Historical Records'
    if (filterRange === 'today') {
      const now = new Date()
      dateRangeLabel = `Today (${now.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })})`
    } else if (filterRange === '7d') {
      dateRangeLabel = 'Last 7 Days'
    } else if (filterRange === '30d') {
      dateRangeLabel = 'Last 30 Days'
    } else if (filterRange === '3m') {
      dateRangeLabel = 'Last 3 Months'
    } else if (filterRange === '6m') {
      dateRangeLabel = 'Last 6 Months'
    } else if (filterRange === '12m') {
      dateRangeLabel = 'Last 12 Months'
    } else if (filterRange === 'custom') {
      if (customStartDateTime && customEndDateTime) {
        dateRangeLabel = `${customStartDateTime.replace('T', ' ')} to ${customEndDateTime.replace('T', ' ')}`
      } else {
        dateRangeLabel = 'Custom Range'
      }
    }

    const generatedDateStr = new Date().toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })

    const pageWidth = 210
    const pageHeight = 297
    const margin = 14
    const contentWidth = pageWidth - margin * 2 // 182mm
    let currentY = 16

    const checkPageBreak = (neededHeight) => {
      if (currentY + neededHeight > pageHeight - 18) {
        doc.addPage()
        currentY = 16
        return true
      }
      return false
    }

    const drawHeader = (title, subtitle) => {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(15)
      doc.setTextColor(0, 0, 0)
      doc.text(restaurantName.toUpperCase(), margin, currentY)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(60, 60, 60)
      if (restaurantAddress || restaurantPhone) {
        const contact = [restaurantAddress, restaurantPhone ? `Tel: ${restaurantPhone}` : ''].filter(Boolean).join(' | ')
        doc.text(contact, margin, currentY + 4.5)
        currentY += 4.5
      }

      currentY += 7
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(0, 0, 0)
      doc.text(title.toUpperCase(), margin, currentY)

      if (subtitle) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        doc.setTextColor(80, 80, 80)
        doc.text(subtitle, margin, currentY + 4)
        currentY += 4
      }

      currentY += 5

      // Clean metadata box (pure black and white borders)
      doc.setFillColor(250, 250, 250)
      doc.setDrawColor(200, 200, 200)
      doc.rect(margin, currentY, contentWidth, 11, 'FD')

      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(70, 70, 70)

      const colW = contentWidth / 4
      doc.text('REPORT PERIOD', margin + 3, currentY + 4)
      doc.text('WAITER / CASHIER', margin + colW + 3, currentY + 4)
      doc.text('TOTAL CHECKOUTS', margin + colW * 2 + 3, currentY + 4)
      doc.text('GENERATED ON', margin + colW * 3 + 3, currentY + 4)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(0, 0, 0)
      doc.text(doc.splitTextToSize(dateRangeLabel, colW - 5)[0] || dateRangeLabel, margin + 3, currentY + 8.5)
      doc.text(doc.splitTextToSize(waiterName, colW - 5)[0] || waiterName, margin + colW + 3, currentY + 8.5)
      doc.text(`${reportData.totalOrdersCount} Orders`, margin + colW * 2 + 3, currentY + 8.5)
      doc.text(generatedDateStr, margin + colW * 3 + 3, currentY + 8.5)

      currentY += 15
    }

    const addFooters = () => {
      const totalPages = doc.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i)
        doc.setDrawColor(200, 200, 200)
        doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(100, 100, 100)
        doc.text(`${restaurantName} — Official Financial & Operational Report`, margin, pageHeight - 6.5)
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 6.5, { align: 'right' })
      }
    }

    if (reportType === 'itemized_bill') {
      drawHeader('Daily Report 1 — Itemized Sales Report', 'Item-by-item sales with quantities, prices, discounts, and bottom-line overall totals')

      const drawTableHeaders = () => {
        doc.setFillColor(240, 240, 240)
        doc.setDrawColor(0, 0, 0)
        doc.rect(margin, currentY, contentWidth, 7, 'F')
        doc.line(margin, currentY, margin + contentWidth, currentY)
        doc.line(margin, currentY + 7, margin + contentWidth, currentY + 7)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(0, 0, 0)
        doc.text('ITEM NAME', margin + 3, currentY + 4.8)
        doc.text('QTY', margin + 74, currentY + 4.8, { align: 'center' })
        doc.text(`PRICE (${currencySymbol.trim()})`, margin + 104, currentY + 4.8, { align: 'right' })
        doc.text(`SUBTOTAL (${currencySymbol.trim()})`, margin + 130, currentY + 4.8, { align: 'right' })
        doc.text(`DISCOUNT (${currencySymbol.trim()})`, margin + 154, currentY + 4.8, { align: 'right' })
        doc.text(`PAID (${currencySymbol.trim()})`, margin + contentWidth - 3, currentY + 4.8, { align: 'right' })
        currentY += 7
      }

      drawTableHeaders()

      reportData.itemsList.forEach((it, idx) => {
        checkPageBreak(7)
        if (currentY === 16) {
          drawTableHeaders()
        }

        if (idx % 2 === 1) {
          doc.setFillColor(248, 248, 248)
          doc.rect(margin, currentY, contentWidth, 6, 'F')
        }
        doc.setDrawColor(230, 230, 230)
        doc.line(margin, currentY + 6, margin + contentWidth, currentY + 6)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(0, 0, 0)

        const itemName = doc.splitTextToSize(it.name || 'Item', 62)[0] || (it.name || 'Item')
        doc.text(itemName, margin + 3, currentY + 4.2)
        doc.text(String(it.qty), margin + 74, currentY + 4.2, { align: 'center' })
        doc.text(Number(it.price || 0).toFixed(2), margin + 104, currentY + 4.2, { align: 'right' })
        doc.text(Number(it.subtotal || it.qty * it.price).toFixed(2), margin + 130, currentY + 4.2, { align: 'right' })
        doc.text(it.discount > 0 ? Number(it.discount).toFixed(2) : '--', margin + 154, currentY + 4.2, { align: 'right' })

        doc.setFont('helvetica', 'bold')
        doc.text(Number(it.paid || it.revenue).toFixed(2), margin + contentWidth - 3, currentY + 4.2, { align: 'right' })
        currentY += 6
      })

      currentY += 5
      checkPageBreak(45)

      doc.setDrawColor(0, 0, 0)
      doc.line(margin, currentY, margin + contentWidth, currentY)
      currentY += 4

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0)
      doc.text('OVERALL FINANCIAL TOTALS & RECONCILIATION', margin, currentY)
      currentY += 4

      const boxW = contentWidth / 2 - 3
      const startBoxY = currentY

      // Left Box: Order Metrics & Fees
      doc.setFillColor(250, 250, 250)
      doc.setDrawColor(200, 200, 200)
      doc.rect(margin, startBoxY, boxW, 36, 'FD')

      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60, 60, 60)
      doc.text('Number of Orders:', margin + 4, startBoxY + 6)
      doc.text('Gross Items Subtotal:', margin + 4, startBoxY + 12)
      doc.text('Total Discounts:', margin + 4, startBoxY + 18)
      doc.text('Service Charge Fee:', margin + 4, startBoxY + 24)
      doc.text('Card Processing Fee:', margin + 4, startBoxY + 30)

      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)
      doc.text(String(reportData.totalOrdersCount), margin + boxW - 4, startBoxY + 6, { align: 'right' })
      doc.text(`${reportData.grossItemsSubtotal.toFixed(2)} ${currencySymbol}`, margin + boxW - 4, startBoxY + 12, { align: 'right' })
      doc.text(`${reportData.totalDiscounts > 0 ? reportData.totalDiscounts.toFixed(2) : '0.00'} ${currencySymbol}`, margin + boxW - 4, startBoxY + 18, { align: 'right' })
      doc.text(`${reportData.totalServiceFees.toFixed(2)} ${currencySymbol}`, margin + boxW - 4, startBoxY + 24, { align: 'right' })
      doc.text(`${reportData.totalCardFees.toFixed(2)} ${currencySymbol}`, margin + boxW - 4, startBoxY + 30, { align: 'right' })

      // Right Box: Settlement & Grand Total (White/Light Background)
      const rightBoxX = margin + boxW + 6
      doc.setFillColor(250, 250, 250)
      doc.setDrawColor(200, 200, 200)
      doc.rect(rightBoxX, startBoxY, boxW, 36, 'FD')

      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60, 60, 60)
      doc.text('Cash Payments in Register:', rightBoxX + 4, startBoxY + 6)
      doc.text('Cashless / Card Payments:', rightBoxX + 4, startBoxY + 12)
      doc.text('Total Items Sold:', rightBoxX + 4, startBoxY + 18)

      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)
      doc.text(`${reportData.cashTotal.toFixed(2)} ${currencySymbol}`, rightBoxX + boxW - 4, startBoxY + 6, { align: 'right' })
      doc.text(`${reportData.cashlessTotal.toFixed(2)} ${currencySymbol}`, rightBoxX + boxW - 4, startBoxY + 12, { align: 'right' })
      doc.text(`${reportData.totalItemsSold} Units`, rightBoxX + boxW - 4, startBoxY + 18, { align: 'right' })

      // Grand Total Highlight Box (Clean Light Gray)
      doc.setFillColor(240, 240, 240)
      doc.setDrawColor(180, 180, 180)
      doc.rect(rightBoxX + 2, startBoxY + 22, boxW - 4, 11, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.setTextColor(0, 0, 0)
      doc.text('GRAND TOTAL (INCL. FEES):', rightBoxX + 5, startBoxY + 29)
      doc.setFontSize(9.5)
      doc.text(`${reportData.totalGrossRevenue.toFixed(2)} ${currencySymbol}`, rightBoxX + boxW - 5, startBoxY + 29, { align: 'right' })

      currentY = startBoxY + 42
    } else if (reportType === 'summary_80mm') {
      drawHeader('Day-End Sales & Closing Z-Report', 'Complete financial audit, cash drawer count, channel breakdown & closing reconciliation')

      // 1. FINANCIAL SUMMARY
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9.5)
      doc.setTextColor(0, 0, 0)
      doc.text('1. FINANCIAL & REVENUE SUMMARY', margin, currentY)
      currentY += 4

      const cardW = (contentWidth - 9) / 4
      const cardH = 14

      const drawMetricCard = (x, title, value, isHighlight = false) => {
        if (isHighlight) {
          doc.setFillColor(235, 235, 235)
          doc.setDrawColor(0, 0, 0)
        } else {
          doc.setFillColor(250, 250, 250)
          doc.setDrawColor(200, 200, 200)
        }
        doc.rect(x, currentY, cardW, cardH, 'FD')
        doc.setFontSize(7)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(70, 70, 70)
        doc.text(title.toUpperCase(), x + 3, currentY + 4.5)
        doc.setFontSize(8.5)
        doc.setTextColor(0, 0, 0)
        doc.text(value, x + 3, currentY + 10.5)
      }

      drawMetricCard(margin, 'Gross Subtotal', `${currencySymbol}${reportData.grossItemsSubtotal.toFixed(2)}`)
      drawMetricCard(margin + cardW + 3, 'Service Fee (10%)', `${currencySymbol}${reportData.totalServiceFees.toFixed(2)}`)
      drawMetricCard(margin + (cardW + 3) * 2, 'Card Fee (3%)', `${currencySymbol}${reportData.totalCardFees.toFixed(2)}`)
      drawMetricCard(margin + (cardW + 3) * 3, 'Grand Total', `${currencySymbol}${reportData.totalGrossRevenue.toFixed(2)}`, true)

      currentY += cardH + 7

      // 2. PAYMENT RECONCILIATION
      checkPageBreak(50)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9.5)
      doc.setTextColor(0, 0, 0)
      doc.text('2. PAYMENT RECONCILIATION & CASH DRAWER AUDIT', margin, currentY)
      currentY += 4

      // Expected Cash Highlight Bar
      doc.setFillColor(245, 245, 245)
      doc.setDrawColor(0, 0, 0)
      doc.rect(margin, currentY, contentWidth, 8, 'FD')
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)
      doc.text('EXPECTED PHYSICAL CASH IN REGISTER:', margin + 4, currentY + 5.2)
      doc.setFontSize(9)
      doc.text(`${currencySymbol}${reportData.cashTotal.toFixed(2)}`, margin + contentWidth - 4, currentY + 5.2, { align: 'right' })
      currentY += 10

      // Payments Table
      doc.setFillColor(240, 240, 240)
      doc.setDrawColor(0, 0, 0)
      doc.rect(margin, currentY, contentWidth, 6, 'F')
      doc.line(margin, currentY, margin + contentWidth, currentY)
      doc.line(margin, currentY + 6, margin + contentWidth, currentY + 6)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(0, 0, 0)
      doc.text('PAYMENT METHOD', margin + 3, currentY + 4.2)
      doc.text('ORDERS COUNT', margin + 70, currentY + 4.2, { align: 'center' })
      doc.text(`GROSS VOLUME (${currencySymbol.trim()})`, margin + 110, currentY + 4.2, { align: 'right' })
      doc.text(`FEES DEDUCTED (${currencySymbol.trim()})`, margin + 145, currentY + 4.2, { align: 'right' })
      doc.text(`NET SETTLEMENT (${currencySymbol.trim()})`, margin + contentWidth - 3, currentY + 4.2, { align: 'right' })
      currentY += 6

      reportData.paymentsList.forEach((p, idx) => {
        if (idx % 2 === 1) {
          doc.setFillColor(248, 248, 248)
          doc.rect(margin, currentY, contentWidth, 5.5, 'F')
        }
        doc.setDrawColor(230, 230, 230)
        doc.line(margin, currentY + 5.5, margin + contentWidth, currentY + 5.5)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.5)
        doc.setTextColor(0, 0, 0)
        doc.text(p.method, margin + 3, currentY + 3.8)
        doc.setFont('helvetica', 'normal')
        doc.text(String(p.count), margin + 70, currentY + 3.8, { align: 'center' })
        doc.text(p.gross.toFixed(2), margin + 110, currentY + 3.8, { align: 'right' })
        doc.text(p.fees.toFixed(2), margin + 145, currentY + 3.8, { align: 'right' })
        doc.setFont('helvetica', 'bold')
        doc.text(p.net.toFixed(2), margin + contentWidth - 3, currentY + 3.8, { align: 'right' })
        currentY += 5.5
      })

      currentY += 7

      // 3. SALES BY CHANNEL
      checkPageBreak(40)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9.5)
      doc.setTextColor(0, 0, 0)
      doc.text('3. SALES BY ORDER CHANNEL', margin, currentY)
      currentY += 4

      doc.setFillColor(240, 240, 240)
      doc.rect(margin, currentY, contentWidth, 6, 'F')
      doc.line(margin, currentY, margin + contentWidth, currentY)
      doc.line(margin, currentY + 6, margin + contentWidth, currentY + 6)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.text('CHANNEL', margin + 3, currentY + 4.2)
      doc.text('CHECKOUTS', margin + 80, currentY + 4.2, { align: 'center' })
      doc.text(`TOTAL REVENUE (${currencySymbol.trim()})`, margin + 140, currentY + 4.2, { align: 'right' })
      doc.text('% SHARE', margin + contentWidth - 3, currentY + 4.2, { align: 'right' })
      currentY += 6

      reportData.channelList.forEach((c, idx) => {
        if (idx % 2 === 1) {
          doc.setFillColor(248, 248, 248)
          doc.rect(margin, currentY, contentWidth, 5.5, 'F')
        }
        doc.setDrawColor(230, 230, 230)
        doc.line(margin, currentY + 5.5, margin + contentWidth, currentY + 5.5)

        const share = reportData.totalGrossRevenue > 0 ? ((c.total / reportData.totalGrossRevenue) * 100).toFixed(1) : '0.0'
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.5)
        doc.text(c.channel, margin + 3, currentY + 3.8)
        doc.setFont('helvetica', 'normal')
        doc.text(String(c.count), margin + 80, currentY + 3.8, { align: 'center' })
        doc.text(c.total.toFixed(2), margin + 140, currentY + 3.8, { align: 'right' })
        doc.text(`${share}%`, margin + contentWidth - 3, currentY + 3.8, { align: 'right' })
        currentY += 5.5
      })

      currentY += 7

      // 4. SIGN-OFF AUDIT
      checkPageBreak(30)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9.5)
      doc.setTextColor(0, 0, 0)
      doc.text('4. AUDIT & SIGN-OFF', margin, currentY)
      currentY += 6

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text('Cashier Signature: _________________________________', margin + 4, currentY)
      doc.text('Manager Signature: _________________________________', margin + 100, currentY)
      currentY += 7
      doc.text('Date Verified: ____________________________________', margin + 4, currentY)
      doc.text('Notes / Discrepancy: _______________________________', margin + 100, currentY)
      currentY += 10
    } else if (reportType === 'transactions') {
      drawHeader('Transaction & Order Records Log', `Detailed record of all ${reportData.filteredOrders.length} filtered transactions`)

      const drawTxHeaders = () => {
        doc.setFillColor(240, 240, 240)
        doc.setDrawColor(0, 0, 0)
        doc.rect(margin, currentY, contentWidth, 7, 'F')
        doc.line(margin, currentY, margin + contentWidth, currentY)
        doc.line(margin, currentY + 7, margin + contentWidth, currentY + 7)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.5)
        doc.setTextColor(0, 0, 0)
        doc.text('ORDER ID', margin + 2, currentY + 4.8)
        doc.text('DATE & TIME', margin + 24, currentY + 4.8)
        doc.text('CHANNEL / LOCATION', margin + 60, currentY + 4.8)
        doc.text('ITEMS ORDERED', margin + 105, currentY + 4.8)
        doc.text('PAY', margin + 148, currentY + 4.8)
        doc.text(`TOTAL (${currencySymbol.trim()})`, margin + contentWidth - 2, currentY + 4.8, { align: 'right' })
        currentY += 7
      }

      drawTxHeaders()

      reportData.filteredOrders.forEach((o, idx) => {
        checkPageBreak(7)
        if (currentY === 16) {
          drawTxHeaders()
        }

        if (idx % 2 === 1) {
          doc.setFillColor(248, 248, 248)
          doc.rect(margin, currentY, contentWidth, 6, 'F')
        }
        doc.setDrawColor(230, 230, 230)
        doc.line(margin, currentY + 6, margin + contentWidth, currentY + 6)

        const dateObj = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt || 0)
        const dateFormatted = !isNaN(dateObj.getTime()) ? dateObj.toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
        const cInfo = getOrderChannelInfo(o)
        const locLabel = getOrderLocationLabel(o)
        const itemsSummary = Array.isArray(o.items)
          ? o.items.map((i) => `${i.qty || 1}x ${i.name || 'Item'}`).join(', ')
          : '—'

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        doc.setTextColor(0, 0, 0)
        doc.text(String(o.id || idx + 1).slice(-10), margin + 2, currentY + 4.2)

        doc.setFont('helvetica', 'normal')
        doc.text(dateFormatted, margin + 24, currentY + 4.2)
        doc.text(`${cInfo.label.slice(0, 10)} - ${locLabel.slice(0, 12)}`, margin + 60, currentY + 4.2)
        doc.text(doc.splitTextToSize(itemsSummary, 40)[0] || itemsSummary, margin + 105, currentY + 4.2)
        doc.text(String(o.paymentMethod || 'CASH').slice(0, 6), margin + 148, currentY + 4.2)

        doc.setFont('helvetica', 'bold')
        doc.text(Number(o.total || 0).toFixed(2), margin + contentWidth - 2, currentY + 4.2, { align: 'right' })
        currentY += 6
      })

      // Summary totals row
      currentY += 4
      checkPageBreak(15)
      doc.setDrawColor(0, 0, 0)
      doc.line(margin, currentY, margin + contentWidth, currentY)
      currentY += 4
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.text(`TOTAL ORDERS: ${reportData.totalOrdersCount}`, margin + 2, currentY)
      doc.text(`NET: ${currencySymbol}${(reportData.totalGrossRevenue - reportData.totalFees).toFixed(2)}`, margin + 70, currentY)
      doc.text(`FEES: ${currencySymbol}${reportData.totalFees.toFixed(2)}`, margin + 115, currentY)
      doc.text(`GROSS: ${currencySymbol}${reportData.totalGrossRevenue.toFixed(2)}`, margin + contentWidth - 2, currentY, { align: 'right' })
      currentY += 6
      doc.line(margin, currentY, margin + contentWidth, currentY)
    } else if (reportType === 'items') {
      drawHeader('Product Sales & Menu Performance Report', 'Item quantities, unit prices, revenues, and sales share ranking')

      const drawItemHeaders = () => {
        doc.setFillColor(240, 240, 240)
        doc.setDrawColor(0, 0, 0)
        doc.rect(margin, currentY, contentWidth, 7, 'F')
        doc.line(margin, currentY, margin + contentWidth, currentY)
        doc.line(margin, currentY + 7, margin + contentWidth, currentY + 7)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(0, 0, 0)
        doc.text('PRODUCT / ITEM NAME', margin + 3, currentY + 4.8)
        doc.text('UNITS SOLD', margin + 90, currentY + 4.8, { align: 'center' })
        doc.text(`UNIT PRICE (${currencySymbol.trim()})`, margin + 125, currentY + 4.8, { align: 'right' })
        doc.text(`TOTAL REVENUE (${currencySymbol.trim()})`, margin + 158, currentY + 4.8, { align: 'right' })
        doc.text('% SHARE', margin + contentWidth - 3, currentY + 4.8, { align: 'right' })
        currentY += 7
      }

      drawItemHeaders()

      reportData.itemsList.forEach((it, idx) => {
        checkPageBreak(7)
        if (currentY === 16) {
          drawItemHeaders()
        }

        if (idx % 2 === 1) {
          doc.setFillColor(248, 248, 248)
          doc.rect(margin, currentY, contentWidth, 6, 'F')
        }
        doc.setDrawColor(230, 230, 230)
        doc.line(margin, currentY + 6, margin + contentWidth, currentY + 6)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(0, 0, 0)
        doc.text(doc.splitTextToSize(it.name || 'Item', 80)[0] || (it.name || 'Item'), margin + 3, currentY + 4.2)
        doc.text(String(it.qty), margin + 90, currentY + 4.2, { align: 'center' })
        doc.text(Number(it.price || 0).toFixed(2), margin + 125, currentY + 4.2, { align: 'right' })
        doc.setFont('helvetica', 'bold')
        doc.text(Number(it.revenue || 0).toFixed(2), margin + 158, currentY + 4.2, { align: 'right' })
        doc.setFont('helvetica', 'normal')
        doc.text(`${(it.percentage || 0).toFixed(1)}%`, margin + contentWidth - 3, currentY + 4.2, { align: 'right' })
        currentY += 6
      })

      currentY += 4
      checkPageBreak(15)
      doc.setDrawColor(0, 0, 0)
      doc.line(margin, currentY, margin + contentWidth, currentY)
      currentY += 4
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.text(`TOTAL DISTINCT ITEMS: ${reportData.itemsList.length}`, margin + 3, currentY)
      doc.text(`TOTAL UNITS: ${reportData.totalItemsSold}`, margin + 90, currentY, { align: 'center' })
      doc.text(`TOTAL: ${currencySymbol}${reportData.totalGrossRevenue.toFixed(2)}`, margin + 158, currentY, { align: 'right' })
      doc.text('100.0%', margin + contentWidth - 3, currentY, { align: 'right' })
      currentY += 6
      doc.line(margin, currentY, margin + contentWidth, currentY)
    } else if (reportType === 'payments') {
      drawHeader('Payment Methods & Settlement Audit Report', 'Audit of collected payment methods, gateway fees deducted, and net settlements')

      const drawPayHeaders = () => {
        doc.setFillColor(240, 240, 240)
        doc.setDrawColor(0, 0, 0)
        doc.rect(margin, currentY, contentWidth, 7, 'F')
        doc.line(margin, currentY, margin + contentWidth, currentY)
        doc.line(margin, currentY + 7, margin + contentWidth, currentY + 7)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(0, 0, 0)
        doc.text('PAYMENT METHOD', margin + 3, currentY + 4.8)
        doc.text('TRANSACTIONS COUNT', margin + 70, currentY + 4.8, { align: 'center' })
        doc.text(`GROSS VOLUME (${currencySymbol.trim()})`, margin + 110, currentY + 4.8, { align: 'right' })
        doc.text(`FEES DEDUCTED (${currencySymbol.trim()})`, margin + 145, currentY + 4.8, { align: 'right' })
        doc.text(`NET SETTLEMENT (${currencySymbol.trim()})`, margin + contentWidth - 3, currentY + 4.8, { align: 'right' })
        currentY += 7
      }

      drawPayHeaders()

      reportData.paymentsList.forEach((pm, idx) => {
        checkPageBreak(7)
        if (currentY === 16) {
          drawPayHeaders()
        }

        if (idx % 2 === 1) {
          doc.setFillColor(248, 248, 248)
          doc.rect(margin, currentY, contentWidth, 6, 'F')
        }
        doc.setDrawColor(230, 230, 230)
        doc.line(margin, currentY + 6, margin + contentWidth, currentY + 6)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.5)
        doc.setTextColor(0, 0, 0)
        doc.text(pm.method, margin + 3, currentY + 4.2)
        doc.setFont('helvetica', 'normal')
        doc.text(String(pm.count), margin + 70, currentY + 4.2, { align: 'center' })
        doc.text(pm.gross.toFixed(2), margin + 110, currentY + 4.2, { align: 'right' })
        doc.text(pm.fees.toFixed(2), margin + 145, currentY + 4.2, { align: 'right' })
        doc.setFont('helvetica', 'bold')
        doc.text(pm.net.toFixed(2), margin + contentWidth - 3, currentY + 4.2, { align: 'right' })
        currentY += 6
      })

      currentY += 5
      checkPageBreak(25)

      doc.setFillColor(245, 245, 245)
      doc.setDrawColor(0, 0, 0)
      doc.rect(margin, currentY, contentWidth, 8, 'FD')
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)
      doc.text('EXPECTED PHYSICAL CASH IN REGISTER:', margin + 4, currentY + 5.2)
      doc.setFontSize(9)
      doc.text(`${currencySymbol}${reportData.cashTotal.toFixed(2)}`, margin + contentWidth - 4, currentY + 5.2, { align: 'right' })
      currentY += 12

      doc.setDrawColor(0, 0, 0)
      doc.line(margin, currentY, margin + contentWidth, currentY)
      currentY += 4
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.text(`TOTAL ORDERS: ${reportData.totalOrdersCount}`, margin + 3, currentY)
      doc.text(`GROSS: ${currencySymbol}${reportData.totalGrossRevenue.toFixed(2)}`, margin + 110, currentY, { align: 'right' })
      doc.text(`FEES: ${currencySymbol}${reportData.totalFees.toFixed(2)}`, margin + 145, currentY, { align: 'right' })
      doc.text(`NET: ${currencySymbol}${reportData.totalNetRevenue.toFixed(2)}`, margin + contentWidth - 3, currentY, { align: 'right' })
      currentY += 6
      doc.line(margin, currentY, margin + contentWidth, currentY)
    }

    addFooters()
    doc.save(filename)
  }

  const handleDownloadReport = () => {
    const restaurantName = restaurantSettings?.name || 'KAIFF'
    const waiterName = profile?.displayName || profile?.name || 'Sergey'
    const cleanRestName = restaurantName.toLowerCase().replace(/[^a-z0-9]/g, '_')
    const timeRangeStr =
      filterRange === 'custom' && customStartDateTime && customEndDateTime
        ? `${customStartDateTime.replace(/[:]/g, '-')}_to_${customEndDateTime.replace(/[:]/g, '-')}`
        : filterRange
    const filename = `${cleanRestName}_${reportType === 'itemized_bill' ? 'daily_report_1' : reportType}_${timeRangeStr}.csv`

    if (reportType === 'itemized_bill') {
      const rows = [
        [`DAILY REPORT 1 FOR ${restaurantName.toUpperCase()}`],
        ['Location:', restaurantName],
        ['Waiter:', waiterName],
        ['Period:', timeRangeStr],
        ['Total Checkouts:', reportData.totalOrdersCount],
        ['Generated At:', new Date().toLocaleString()],
        [],
        ['Name', 'Quantity', `Price (${currencySymbol})`, `Subtotal (${currencySymbol})`, `Discount (${currencySymbol})`, `Paid (${currencySymbol})`],
        ...reportData.itemsList.map((i) => [
          i.name,
          i.qty,
          Number(i.price || 0).toFixed(2),
          Number(i.subtotal || i.qty * i.price).toFixed(2),
          i.discount > 0 ? Number(i.discount).toFixed(2) : '--',
          Number(i.paid || i.revenue).toFixed(2),
        ]),
        [],
        ['Number of orders', reportData.totalOrdersCount],
        ['Subtotal', `${reportData.grossItemsSubtotal.toFixed(2)} ${currencySymbol}`],
        ['Discounts', `${reportData.totalDiscounts.toFixed(2)} ${currencySymbol}`],
        ['Service charge fee', `${reportData.totalServiceFees.toFixed(2)} ${currencySymbol}`],
        ['Total, incl. discounts', `${reportData.totalGrossRevenue.toFixed(2)} ${currencySymbol}`],
        ['Cash payments', `${reportData.cashTotal.toFixed(2)} ${currencySymbol}`],
        [
          'Cashless payments',
          reportData.totalCardFees > 0
            ? `${reportData.cashlessTotal.toFixed(2)} ${currencySymbol} (Net after fee: ${reportData.cashlessNet.toFixed(2)} ${currencySymbol})`
            : `${reportData.cashlessTotal.toFixed(2)} ${currencySymbol}`,
        ],
      ]
      exportToCSV(filename, rows)
      return
    }

    if (reportType === 'summary_80mm') {
      const rows = [
        ['DAILY SALES CLOSING & FINANCIAL REPORT'],
        ['Restaurant:', restaurantName],
        ['Address:', restaurantSettings?.address || ''],
        ['Phone:', restaurantSettings?.phone || ''],
        ['Report Period:', timeRangeStr],
        ['Total Orders:', reportData.totalOrdersCount],
        ['Printed At:', new Date().toLocaleString()],
        [],
        ['1. FINANCIAL SUMMARY'],
        ['Gross Items Subtotal', `${currencySymbol}${reportData.grossItemsSubtotal.toFixed(2)}`],
        ['Service Charge Collected', `${currencySymbol}${reportData.totalServiceFees.toFixed(2)}`],
        ['Card Processing Fees', `${currencySymbol}${reportData.totalCardFees.toFixed(2)}`],
        ['GRAND TOTAL REVENUE', `${currencySymbol}${reportData.totalGrossRevenue.toFixed(2)}`],
        [],
        ['2. PAYMENT RECONCILIATION & CASH DRAWER'],
        ['Payment Method', 'Orders Count', `Gross Amount (${currencySymbol})`, `Fees Deducted (${currencySymbol})`, `Net Amount (${currencySymbol})`],
        ...reportData.paymentsList.map((p) => [p.method, p.count, p.gross.toFixed(2), p.fees.toFixed(2), p.net.toFixed(2)]),
        ['EXPECTED CASH IN DRAWER', '', `${currencySymbol}${reportData.cashTotal.toFixed(2)}`],
        [],
        ['3. SALES BY CHANNEL'],
        ['Channel', 'Orders Count', `Total Revenue (${currencySymbol})`],
        ...reportData.channelList.map((c) => [c.channel, c.count, c.total.toFixed(2)]),
        [],
        ['4. MENU ITEMS SOLD SUMMARY'],
        ['Item Name', 'Units Sold', `Unit Price (${currencySymbol})`, `Total Revenue (${currencySymbol})`, '% Contribution'],
        ...reportData.itemsList.map((i) => [i.name, i.qty, i.price.toFixed(2), i.revenue.toFixed(2), `${i.percentage.toFixed(1)}%`]),
        ['TOTAL UNITS SOLD', reportData.totalItemsSold, '', `${currencySymbol}${reportData.grossItemsSubtotal.toFixed(2)}`, '100.0%'],
      ]
      exportToCSV(filename, rows)
      return
    }

    if (reportType === 'transactions') {
      const headers = [
        'Order ID',
        'Date & Time',
        'Channel',
        'Location (Table / Room / Space)',
        'Guest / Order Note',
        'Items Ordered',
        'Status',
        'Payment Method',
        `Subtotal (${currencySymbol})`,
        `Service Fee (${currencySymbol})`,
        `Card Fee (${currencySymbol})`,
        `Total Amount (${currencySymbol})`,
      ]
      const rows = reportData.filteredOrders.map((o) => {
        const dateObj = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt || 0)
        const dateFormatted = !isNaN(dateObj.getTime()) ? dateObj.toLocaleString() : ''
        const cInfo = getOrderChannelInfo(o)
        const locLabel = getOrderLocationLabel(o)
        const itemsSummary = Array.isArray(o.items)
          ? o.items.map((i) => `${i.qty || 1}x ${i.name || 'Item'} (${currencySymbol}${Number(i.price || 0).toFixed(2)})`).join('; ')
          : 'No items'
        const total = Number(o.total || 0)
        const sFee = Number(o.serviceFeeAmount || 0)
        const cFee = Number(o.cardFeeAmount || 0)
        const subtotal = total - sFee - cFee
        return [
          o.id,
          dateFormatted,
          cInfo.label,
          locLabel,
          o.note || '',
          itemsSummary,
          o.status || 'PAID',
          o.paymentMethod || 'CASH',
          subtotal.toFixed(2),
          sFee.toFixed(2),
          cFee.toFixed(2),
          total.toFixed(2),
        ]
      })

      // Add summary row
      rows.push([])
      rows.push([
        'SUMMARY TOTALS',
        '',
        '',
        '',
        '',
        `${reportData.totalItemsSold} items total`,
        `${reportData.totalOrdersCount} orders`,
        '',
        (reportData.totalGrossRevenue - reportData.totalFees).toFixed(2),
        reportData.totalServiceFees.toFixed(2),
        reportData.totalCardFees.toFixed(2),
        reportData.totalGrossRevenue.toFixed(2),
      ])

      exportToCSV(filename, [headers, ...rows])
    } else if (reportType === 'items') {
      const headers = ['Item Name', 'Units Sold', `Unit Price (${currencySymbol})`, `Total Revenue (${currencySymbol})`, '% Contribution']
      const rows = reportData.itemsList.map((i) => [
        i.name,
        i.qty,
        i.price.toFixed(2),
        i.revenue.toFixed(2),
        `${i.percentage.toFixed(1)}%`,
      ])
      rows.push([])
      rows.push(['SUMMARY TOTALS', reportData.totalItemsSold, '', reportData.totalGrossRevenue.toFixed(2), '100.0%'])
      exportToCSV(filename, [headers, ...rows])
    } else if (reportType === 'payments') {
      const headers = ['Payment Method', 'Orders Count', `Gross Volume (${currencySymbol})`, `Fees Deducted (${currencySymbol})`, `Net Revenue (${currencySymbol})`, '% Share']
      const rows = reportData.paymentsList.map((p) => [
        p.method,
        p.count,
        p.gross.toFixed(2),
        p.fees.toFixed(2),
        p.net.toFixed(2),
        `${p.percentage.toFixed(1)}%`,
      ])
      rows.push([])
      rows.push(['SUMMARY TOTALS', reportData.totalOrdersCount, reportData.totalGrossRevenue.toFixed(2), reportData.totalFees.toFixed(2), reportData.totalNetRevenue.toFixed(2), '100.0%'])
      exportToCSV(filename, [headers, ...rows])
    }
  }

  // Render unconfigured UI state
  if (!isFirebaseConfigured || !db) {
    return (
      <div className="p-6 sm:p-8 flex flex-col items-center justify-center min-h-[70vh] max-w-xl mx-auto text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-50 text-amber-600">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-neutral-900">Firebase Not Configured</h2>
        <p className="mt-3 text-sm text-neutral-500 leading-relaxed">
          Please check your project environment variables for Firebase configuration.
        </p>
      </div>
    )
  }

  if (!targetRestaurantId) {
    return (
      <div className="p-6 sm:p-8 flex flex-col items-center justify-center min-h-[70vh] max-w-xl mx-auto text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl" style={{ background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)' }}>
          <IconAnalytics />
        </div>
        <h2 className="text-2xl font-bold text-neutral-900">No Restaurant Profile Found</h2>
        <p className="mt-3 text-sm text-neutral-500 leading-relaxed">
          Please select or setup your restaurant profile to view synced POS backup sales and analytics.
        </p>
        <button
          onClick={() => setActiveSection?.('settings')}
          className="btn-green mt-8 flex items-center gap-2 px-6 py-3 font-semibold"
        >
          Go to Settings
        </button>
      </div>
    )
  }

  // Render loading state
  if (loading) {
    return (
      <div className="p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between border-b pb-4">
          <div className="h-8 w-48 bg-neutral-200 rounded animate-pulse" />
          <div className="h-10 w-32 bg-neutral-200 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white border border-neutral-100 rounded-2xl p-5 space-y-3 shadow-sm animate-pulse">
              <div className="h-4 w-20 bg-neutral-200 rounded" />
              <div className="h-8 w-28 bg-neutral-200 rounded" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-72 bg-white border border-neutral-100 rounded-2xl shadow-sm animate-pulse" />
          <div className="h-72 bg-white border border-neutral-100 rounded-2xl shadow-sm animate-pulse" />
        </div>
      </div>
    )
  }

  // Render error state
  if (error) {
    return (
      <div className="p-6 sm:p-8 flex flex-col items-center justify-center min-h-[70vh] max-w-xl mx-auto text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-red-50 text-red-500">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-neutral-900">Database Connection Failed</h2>
        <p className="mt-3 text-sm text-red-600 leading-relaxed border border-red-200 bg-red-50/50 p-4 rounded-xl font-mono text-left text-xs max-w-lg">
          {error}
        </p>
        <div className="mt-8 flex gap-4">
          <button
            onClick={() => fetchBackupData()}
            className="btn-green px-5 py-2.5 font-semibold text-sm"
          >
            Retry Connection
          </button>
        </div>
      </div>
    )
  }

  const handleCopyTable = () => {
    let text = ''
    if (reportType === 'itemized_bill') {
      const firstDateText = filterRange === 'custom' && customStartDateTime
        ? new Date(customStartDateTime).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
        : new Date().toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })

      text = [
        `DAILY REPORT 1 FOR ${firstDateText.toUpperCase()}`,
        `Location:\t${restaurantSettings?.name || 'KAIFF'}`,
        `Waiter:\t${profile?.displayName || profile?.name || 'Sergey'}`,
        `Period:\t${filterRange}`,
        '',
        'Name\tQuantity\tPrice\tSubtotal\tDiscount\tPaid',
        ...reportData.itemsList.map(
          (i) => `${i.name}\t${i.qty}\t${Number(i.price || 0).toFixed(2)}\t${Number(i.subtotal || i.qty * i.price).toFixed(2)}\t${i.discount > 0 ? Number(i.discount).toFixed(2) : '--'}\t${Number(i.paid || i.revenue).toFixed(2)}`
        ),
        '',
        `Number of orders:\t${reportData.totalOrdersCount}`,
        `Subtotal:\t${reportData.grossItemsSubtotal.toFixed(2)} Rs`,
        `Discounts:\t${reportData.totalDiscounts.toFixed(2)} Rs`,
        `Service charge fee:\t${reportData.totalServiceFees.toFixed(2)} Rs`,
        `Total, incl. discounts:\t${reportData.totalGrossRevenue.toFixed(2)} Rs`,
        `Cash payments:\t${reportData.cashTotal.toFixed(2)} Rs`,
        reportData.totalCardFees > 0
          ? `Cashless payments:\t${reportData.cashlessTotal.toFixed(2)} Rs (Net after fee: ${reportData.cashlessNet.toFixed(2)} Rs)`
          : `Cashless payments:\t${reportData.cashlessTotal.toFixed(2)} Rs`,
      ].join('\n')
    } else if (reportType === 'summary_80mm') {
      text = [
        'DAILY SALES CLOSING REPORT',
        `Period:\t${filterRange}`,
        `Total Orders:\t${reportData.totalOrdersCount}`,
        `Gross Subtotal:\t${reportData.grossItemsSubtotal.toFixed(2)}`,
        `Service Fees:\t${reportData.totalServiceFees.toFixed(2)}`,
        `Card Fees:\t${reportData.totalCardFees.toFixed(2)}`,
        `Grand Total Revenue:\t${reportData.totalGrossRevenue.toFixed(2)}`,
        `Cash in Drawer:\t${reportData.cashTotal.toFixed(2)}`,
        '',
        'PAYMENTS BREAKDOWN:',
        ...reportData.paymentsList.map((p) => `${p.method}\t${p.count} orders\t${p.gross.toFixed(2)}`),
        '',
        'SALES BY CHANNEL:',
        ...reportData.channelList.map((c) => `${c.channel}\t${c.count} orders\t${c.total.toFixed(2)}`),
        '',
        'ITEMS SOLD SUMMARY:',
        ...reportData.itemsList.map((i) => `${i.name}\t${i.qty} units\t${i.revenue.toFixed(2)}`),
      ].join('\n')
    } else if (reportType === 'transactions') {
      text = ['Order ID\tDate\tChannel\tLocation\tNote\tItems\tStatus\tPayment\tSubtotal\tService Fee\tCard Fee\tTotal']
        .concat(
          reportData.filteredOrders.map((o) => {
            const d = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt || 0)
            const cInfo = getOrderChannelInfo(o)
            const locLabel = getOrderLocationLabel(o)
            const itemsSummary = Array.isArray(o.items)
              ? o.items.map((i) => `${i.qty || 1}x ${i.name || 'Item'}`).join(', ')
              : ''
            const total = Number(o.total || 0)
            const sFee = Number(o.serviceFeeAmount || 0)
            const cFee = Number(o.cardFeeAmount || 0)
            return `${o.id}\t${d.toLocaleString()}\t${cInfo.label}\t${locLabel}\t${o.note || ''}\t${itemsSummary}\t${o.status || 'PAID'}\t${o.paymentMethod || 'CASH'}\t${(total - sFee - cFee).toFixed(2)}\t${sFee.toFixed(2)}\t${cFee.toFixed(2)}\t${total.toFixed(2)}`
          })
        )
        .join('\n')
    } else if (reportType === 'items') {
      text = ['Item Name\tUnits Sold\tPrice\tRevenue\t% Share']
        .concat(
          reportData.itemsList.map(
            (i) => `${i.name}\t${i.qty}\t${i.price.toFixed(2)}\t${i.revenue.toFixed(2)}\t${i.percentage.toFixed(1)}%`
          )
        )
        .join('\n')
    } else if (reportType === 'payments') {
      text = ['Payment Method\tOrders\tGross\tFees\tNet\t% Share']
        .concat(
          reportData.paymentsList.map(
            (p) => `${p.method}\t${p.count}\t${p.gross.toFixed(2)}\t${p.fees.toFixed(2)}\t${p.net.toFixed(2)}\t${p.percentage.toFixed(1)}%`
          )
        )
        .join('\n')
    }
    navigator.clipboard.writeText(text)
    setCopyStatus(true)
    setTimeout(() => setCopyStatus(false), 2500)
  }

  // ── Render Reports View ───────────────────────────────────────────────────
  if (viewMode === 'reports') {
    return (
      <div className="p-6 sm:p-8 space-y-6">
        {/* Top Navigation Tabs & Header */}
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 border-b border-green-100/80 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <button
                onClick={() => setViewMode('dashboard')}
                className="text-[11px] font-bold text-neutral-400 hover:text-green-600 transition uppercase tracking-wider flex items-center gap-1"
              >
                Analytics
              </button>
              <span className="text-neutral-300">/</span>
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Reports & Exports</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-neutral-900 flex items-center gap-2">
              Sales & Financial Reports
            </h2>
          </div>

          {/* View Mode Switcher */}
          <div className="inline-flex items-center p-1 bg-neutral-100/90 rounded-xl border border-neutral-200/60 shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode('dashboard')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-white/40 transition-all"
            >
              <IconAnalytics />
              <span>Overview</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('reports')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-emerald-800 shadow-xs transition-all"
            >
              <IconFileText />
              <span>Sales Reports</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('detailed-items')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-white/40 transition-all"
            >
              <span>Menu Items</span>
            </button>
          </div>
        </div>

        {/* Report Controls & Custom Date-Time Filter Card */}
        <div className="card p-5 space-y-4">
          {/* Report Type Selector Tabs */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-2.5">Select Report Type</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {[
                { id: 'itemized_bill', label: 'Daily Report 1', desc: 'Itemized Bill (Name, Qty, Price, Disc, Paid)' },
                { id: 'summary_80mm', label: 'Daily Closing Report', desc: 'Drawer audit, channels & slip' },
                { id: 'transactions', label: 'Detailed Sales & Orders', desc: 'Itemized receipts & tickets' },
                { id: 'items', label: 'Product Sales Breakdown', desc: 'Units & item revenues' },
                { id: 'payments', label: 'Payment Methods Summary', desc: 'Cash vs Card vs Online' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setReportType(tab.id)}
                  className={`p-3 rounded-xl text-left border transition ${
                    reportType === tab.id
                      ? 'border-emerald-600 bg-emerald-50/60 shadow-2xs'
                      : 'border-neutral-200 bg-white hover:bg-neutral-50/80 text-neutral-700'
                  }`}
                >
                  <p className={`text-xs font-bold ${reportType === tab.id ? 'text-emerald-800' : 'text-neutral-800'}`}>
                    {tab.label}
                  </p>
                  <p className="text-[11px] text-neutral-400 mt-0.5">{tab.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Timeframe & Custom Date Time Controls */}
          <div className="pt-3 border-t border-neutral-100 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Timeframe:</span>
                <div className="inline-flex items-center p-0.5 bg-neutral-100/90 rounded-lg border border-neutral-200/60 shadow-2xs">
                  {[
                    { id: 'today', label: 'Today' },
                    { id: '7d', label: '7 Days' },
                    { id: '30d', label: '30 Days' },
                    { id: '3m', label: '3M' },
                    { id: '6m', label: '6M' },
                    { id: '12m', label: '12M' },
                    { id: 'all', label: 'All' },
                    { id: 'custom', label: 'Custom Range', isCustom: true },
                  ].map(({ id, label, isCustom }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleSelectFilterRange(id)}
                      className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                        filterRange === id
                          ? 'bg-emerald-600 text-white font-semibold shadow-2xs'
                          : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/60'
                      }`}
                    >
                      {isCustom && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                      )}
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Date-Time Presets & Clear */}
              {filterRange === 'custom' && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase">Presets:</span>
                  <button
                    type="button"
                    onClick={() => setQuickCustomRange('today_full')}
                    className="rounded-md bg-neutral-100 hover:bg-neutral-200/80 px-2 py-0.5 text-[11px] font-semibold text-neutral-700 transition"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickCustomRange('yesterday')}
                    className="rounded-md bg-neutral-100 hover:bg-neutral-200/80 px-2 py-0.5 text-[11px] font-semibold text-neutral-700 transition"
                  >
                    Yesterday
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickCustomRange('last24h')}
                    className="rounded-md bg-neutral-100 hover:bg-neutral-200/80 px-2 py-0.5 text-[11px] font-semibold text-neutral-700 transition"
                  >
                    Last 24h
                  </button>
                  {(customStartDateTime || customEndDateTime) && (
                    <button
                      type="button"
                      onClick={() => setQuickCustomRange('clear')}
                      className="rounded-md bg-red-50 hover:bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-600 transition"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Custom Range Date & Time Inputs Panel */}
            {filterRange === 'custom' && (
              <div className="p-3.5 bg-emerald-50/40 rounded-xl border border-emerald-100 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-emerald-900 mb-1 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      From (Start Date & Time)
                    </label>
                    <input
                      type="datetime-local"
                      value={customStartDateTime}
                      onChange={(e) => setCustomStartDateTime(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-emerald-900 mb-1 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      Till (End Date & Time)
                    </label>
                    <input
                      type="datetime-local"
                      value={customEndDateTime}
                      onChange={(e) => setCustomEndDateTime(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 shadow-2xs"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Summary Metrics Bar */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="rounded-2xl p-4 bg-emerald-700 text-white shadow-xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">Gross Sales</p>
            <p className="text-2xl font-extrabold mt-1">
              {currencySymbol}{reportData.totalGrossRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-[10px] text-emerald-200 mt-0.5 font-medium">{reportData.totalOrdersCount} orders</p>
          </div>

          <div className="rounded-2xl p-4 bg-white border border-neutral-200 shadow-2xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Net Sales</p>
            <p className="text-xl font-bold text-neutral-900 mt-1">
              {currencySymbol}{reportData.totalNetRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-[10px] text-neutral-500 mt-0.5 font-medium">Excluding taxes & fees</p>
          </div>

          <div className="rounded-2xl p-4 bg-white border border-neutral-200 shadow-2xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Total Fees</p>
            <p className="text-xl font-bold text-neutral-900 mt-1">
              {currencySymbol}{reportData.totalFees.toFixed(2)}
            </p>
            <p className="text-[10px] text-neutral-500 mt-0.5 font-medium">Card & service charges</p>
          </div>

          <div className="rounded-2xl p-4 bg-white border border-neutral-200 shadow-2xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Items Sold</p>
            <p className="text-xl font-bold text-neutral-900 mt-1">
              {reportData.totalItemsSold}
            </p>
            <p className="text-[10px] text-neutral-500 mt-0.5 font-medium">Total quantity</p>
          </div>

          <div className="col-span-2 lg:col-span-1 rounded-2xl p-4 bg-white border border-neutral-200 shadow-2xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Avg Ticket</p>
            <p className="text-xl font-bold text-neutral-900 mt-1">
              {currencySymbol}{reportData.aov.toFixed(2)}
            </p>
            <p className="text-[10px] text-neutral-500 mt-0.5 font-medium">Per checkout</p>
          </div>
        </div>

        {/* Download & Actions Toolbar + Data Table */}
        <div className="card overflow-hidden">
          {/* Action Toolbar */}
          <div className="p-4 bg-neutral-50/70 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-neutral-900">
                {reportType === 'itemized_bill' && 'Daily Report 1 (Itemized Bill)'}
                {reportType === 'summary_80mm' && 'Day-End Sales & Closing Report'}
                {reportType === 'transactions' && 'Itemized Sales & Orders Table'}
                {reportType === 'items' && 'Product Sales Breakdown Table'}
                {reportType === 'payments' && 'Payment Methods Summary Table'}
              </h3>
              <p className="text-xs text-neutral-500">
                {reportType === 'itemized_bill' && 'Item-by-item sales with quantities, unit prices, discounts, paid amount and bottom-line overall totals'}
                {reportType === 'summary_80mm' && 'Complete financial audit, cash drawer count, channel breakdown & closing report'}
                {reportType === 'transactions' && `${reportData.filteredOrders.length} transaction records found`}
                {reportType === 'items' && `${reportData.itemsList.length} distinct items sold`}
                {reportType === 'payments' && `${reportData.paymentsList.length} payment channels`}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleCopyTable}
                className="btn-ghost !text-xs !px-2.5 !py-1.5 font-semibold flex items-center gap-1.5 rounded-lg border border-neutral-200 shadow-2xs [&>svg]:w-3.5 [&>svg]:h-3.5"
                title="Copy table data to clipboard"
              >
                {copyStatus ? '✓ Copied!' : 'Copy Data'}
              </button>
              <button
                type="button"
                onClick={handleDownloadReport}
                className="btn-ghost !text-xs !px-3 !py-1.5 font-semibold flex items-center gap-1.5 rounded-lg border border-neutral-200 shadow-2xs hover:bg-neutral-100 text-neutral-700 [&>svg]:w-3.5 [&>svg]:h-3.5"
                title="Download CSV spreadsheet"
              >
                <IconDownload />
                Download CSV
              </button>
              <button
                type="button"
                onClick={handleDownloadPDF}
                className="btn-green !text-xs !px-3.5 !py-1.5 font-bold flex items-center gap-1.5 shadow-xs rounded-lg text-white [&>svg]:w-3.5 [&>svg]:h-3.5"
                title="Download Clean A4 Black & White PDF Report"
              >
                <IconFileText />
                Download PDF (A4)
              </button>
            </div>
          </div>

          {/* Filters Sub-Toolbar for Reports */}
          <div className="p-3.5 bg-white border-b border-neutral-200 flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                <IconSearch />
              </span>
              <input
                type="text"
                value={reportSearchQuery}
                onChange={(e) => setReportSearchQuery(e.target.value)}
                placeholder="Search ticket #, room, table, guest, items..."
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50/60 pl-9 pr-8 py-1.5 text-xs outline-none focus:border-emerald-500 focus:bg-white transition"
              />
              {reportSearchQuery && (
                <button
                  type="button"
                  onClick={() => setReportSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-xs text-neutral-400 hover:text-neutral-700"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Channel Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Channel:</span>
              <select
                value={reportSourceFilter}
                onChange={(e) => setReportSourceFilter(e.target.value)}
                className="rounded-xl border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs font-semibold text-neutral-800 outline-none focus:border-emerald-500 transition cursor-pointer"
              >
                <option value="all">All Channels</option>
                <option value="TABLE">Dine-In Tables</option>
                <option value="ROOM">Room Service</option>
                <option value="SURFHOUSE">Surf House / Rentals</option>
                <option value="ONLINE">Online / QR Orders</option>
                <option value="COUNTER">Counter / Walk-in</option>
              </select>
            </div>

            {/* Payment Method Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Payment:</span>
              <select
                value={reportPaymentFilter}
                onChange={(e) => setReportPaymentFilter(e.target.value)}
                className="rounded-xl border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs font-semibold text-neutral-800 outline-none focus:border-emerald-500 transition cursor-pointer"
              >
                <option value="all">All Payments</option>
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="ONLINE">Online</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Status:</span>
              <select
                value={reportStatusFilter}
                onChange={(e) => setReportStatusFilter(e.target.value)}
                className="rounded-xl border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs font-semibold text-neutral-800 outline-none focus:border-emerald-500 transition cursor-pointer"
              >
                <option value="PAID">Paid</option>
                <option value="all">All Statuses</option>
                <option value="REFUNDED">Refunded</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="OPEN">Open</option>
              </select>
            </div>
          </div>

          {/* Report Container */}
          <div className="overflow-x-auto max-h-[680px] overflow-y-auto">
            {reportType === 'itemized_bill' && (
              <div className="p-4 sm:p-6 bg-neutral-50/40 space-y-4">
                {/* Shift Information Header */}
                <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xs">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">Location</span>
                      <span className="font-bold text-neutral-900 text-sm">{restaurantSettings?.name || 'SURF HOUSE'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">Waiter / Cashier</span>
                      <span className="font-bold text-neutral-900 text-sm">{profile?.displayName || profile?.name || 'Cashier'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">From</span>
                      <span className="font-semibold text-neutral-700">
                        {customStartDateTime ? new Date(customStartDateTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Beginning 00:00'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">Till</span>
                      <span className="font-semibold text-neutral-700">
                        {customEndDateTime ? new Date(customEndDateTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Current 23:59'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 1. Itemized Table: Name | Quantity | Price | Subtotal | Discount | Paid */}
                <div className="rounded-2xl border border-neutral-200 bg-white shadow-2xs overflow-hidden">
                  <div className="p-3.5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/60">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800 flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">1</span>
                      Daily Report 1 — Itemized Sales
                    </h4>
                    <span className="text-xs text-neutral-500 font-semibold">{reportData.itemsList.length} unique items</span>
                  </div>

                  <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-neutral-50 text-neutral-500 font-bold uppercase tracking-wider border-b border-neutral-100 sticky top-0 z-10">
                        <tr>
                          <th className="py-2.5 px-4">Name</th>
                          <th className="py-2.5 px-3 text-center">Quantity</th>
                          <th className="py-2.5 px-3 text-right">Price</th>
                          <th className="py-2.5 px-3 text-right">Subtotal</th>
                          <th className="py-2.5 px-3 text-right">Discount</th>
                          <th className="py-2.5 px-4 text-right font-black text-neutral-800">Paid</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 font-medium text-neutral-700">
                        {reportData.itemsList.length === 0 ? (
                          <tr>
                            <td colSpan="6" className="py-8 text-center text-neutral-400 font-medium">
                              No items sold in this timeframe.
                            </td>
                          </tr>
                        ) : (
                          reportData.itemsList.map((it, idx) => (
                            <tr key={idx} className="hover:bg-neutral-50/70 transition">
                              <td className="py-2.5 px-4 font-bold text-neutral-900">{it.name}</td>
                              <td className="py-2.5 px-3 text-center font-bold text-neutral-800">{it.qty}</td>
                              <td className="py-2.5 px-3 text-right text-neutral-600">{Number(it.price || 0).toFixed(2)}</td>
                              <td className="py-2.5 px-3 text-right font-semibold text-neutral-800">{Number(it.subtotal || it.qty * it.price).toFixed(2)}</td>
                              <td className="py-2.5 px-3 text-right text-amber-700 font-semibold">
                                {it.discount > 0 ? Number(it.discount).toFixed(2) : '--'}
                              </td>
                              <td className="py-2.5 px-4 text-right font-black text-emerald-700">
                                {Number(it.paid || it.revenue).toFixed(2)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 2. Overall Details Section */}
                <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xs space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800 flex items-center gap-2 border-b border-neutral-100 pb-2.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-blue-100 text-blue-800 text-[10px] font-extrabold">2</span>
                    Overall Details & Financial Totals
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-xs text-neutral-700">
                    <div className="space-y-2 divide-y divide-neutral-100">
                      <div className="flex justify-between pt-1 font-medium">
                        <span className="text-neutral-500 font-semibold">Number of orders</span>
                        <span className="font-bold text-neutral-900 text-sm">{reportData.totalOrdersCount}</span>
                      </div>
                      <div className="flex justify-between pt-2">
                        <span className="text-neutral-500 font-semibold">Gross Subtotal</span>
                        <span className="font-bold text-neutral-900">{reportData.grossItemsSubtotal.toFixed(2)} Rs</span>
                      </div>
                      <div className="flex justify-between pt-2">
                        <span className="text-neutral-500 font-semibold">Total Discounts</span>
                        <span className="font-bold text-amber-700">{reportData.totalDiscounts > 0 ? reportData.totalDiscounts.toFixed(2) : '0.00'} Rs</span>
                      </div>
                      <div className="flex justify-between pt-2">
                        <span className="text-neutral-500 font-semibold">Service charge fee</span>
                        <span className="font-bold text-neutral-900">{reportData.totalServiceFees.toFixed(2)} Rs</span>
                      </div>
                      <div className="flex justify-between pt-2">
                        <span className="text-neutral-500 font-semibold">Card processing fee</span>
                        <span className="font-bold text-neutral-900">{reportData.totalCardFees.toFixed(2)} Rs</span>
                      </div>
                    </div>

                    <div className="space-y-2 divide-y divide-neutral-100">
                      <div className="flex justify-between pt-1">
                        <span className="text-neutral-500 font-semibold">Cash payments in register</span>
                        <span className="font-bold text-neutral-900">{reportData.cashTotal.toFixed(2)} Rs</span>
                      </div>
                      <div className="flex justify-between items-start pt-2">
                        <div>
                          <span className="text-neutral-500 font-semibold block">Cashless / Card payments</span>
                          {reportData.totalCardFees > 0 && (
                            <span className="text-[11px] text-neutral-400 font-medium block">
                              (Net settlement after fee: {reportData.cashlessNet.toFixed(2)} Rs)
                            </span>
                          )}
                        </div>
                        <span className="font-bold text-neutral-900">{reportData.cashlessTotal.toFixed(2)} Rs</span>
                      </div>
                      <div className="flex justify-between pt-2">
                        <span className="text-neutral-500 font-semibold">Total items sold</span>
                        <span className="font-bold text-neutral-900">{reportData.totalItemsSold} Units</span>
                      </div>
                      <div className="flex justify-between pt-3 pb-1.5 bg-emerald-50/90 -mx-3 px-3 rounded-xl border border-emerald-200 mt-2">
                        <span className="font-black text-emerald-900 uppercase text-xs">Total, incl. discounts & fees</span>
                        <span className="font-black text-emerald-800 text-base">{reportData.totalGrossRevenue.toFixed(2)} Rs</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {reportType === 'summary_80mm' && (
              <div className="p-4 sm:p-6 bg-neutral-50/40 space-y-4">
                {/* 1. Financial Summary */}
                <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800 flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">1</span>
                      Financial & Revenue Breakdown
                    </h4>
                    <span className="text-xs text-neutral-400 font-semibold">{reportData.totalOrdersCount} checkouts</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/60">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Gross Subtotal</p>
                      <p className="text-sm sm:text-base font-bold text-neutral-900 mt-1">
                        {currencySymbol}{reportData.grossItemsSubtotal.toFixed(2)}
                      </p>
                    </div>
                    <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/60">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Service Fee (10%)</p>
                      <p className="text-sm sm:text-base font-bold text-neutral-900 mt-1">
                        {currencySymbol}{reportData.totalServiceFees.toFixed(2)}
                      </p>
                    </div>
                    <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/60">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Card Fee (3%)</p>
                      <p className="text-sm sm:text-base font-bold text-neutral-900 mt-1">
                        {currencySymbol}{reportData.totalCardFees.toFixed(2)}
                      </p>
                    </div>
                    <div className="p-3 bg-emerald-700 text-white rounded-xl shadow-xs">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">Grand Total</p>
                      <p className="text-base sm:text-lg font-black text-white mt-0.5">
                        {currencySymbol}{reportData.totalGrossRevenue.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. Payment Method & Cash Drawer Reconciliation */}
                <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800 flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-blue-100 text-blue-800 text-[10px] font-extrabold">2</span>
                      Payment Reconciliation & Cash Drawer Audit
                    </h4>
                    <span className="text-[10px] font-bold uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Reconciled</span>
                  </div>

                  {/* Cash in Drawer Hero Box */}
                  <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                        Expected Physical Cash in Register
                      </p>
                      <p className="text-[11px] text-emerald-600 mt-0.5">Count drawer notes & coins to balance against this figure</p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-xl sm:text-2xl font-black text-emerald-800">
                        {currencySymbol}{reportData.cashTotal.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-neutral-100 text-neutral-400 font-semibold uppercase">
                          <th className="py-2">Payment Method</th>
                          <th className="py-2 text-center">Orders Count</th>
                          <th className="py-2 text-right">Gross Volume</th>
                          <th className="py-2 text-right">Fees Deducted</th>
                          <th className="py-2 text-right">Net Settlement</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-50 font-medium text-neutral-700">
                        {reportData.paymentsList.map((pm, idx) => (
                          <tr key={idx} className="hover:bg-neutral-50/60">
                            <td className="py-2 font-bold text-neutral-900">{pm.method}</td>
                            <td className="py-2 text-center text-neutral-600">{pm.count}</td>
                            <td className="py-2 text-right font-semibold text-neutral-900">{currencySymbol}{pm.gross.toFixed(2)}</td>
                            <td className="py-2 text-right text-neutral-500">{currencySymbol}{pm.fees.toFixed(2)}</td>
                            <td className="py-2 text-right font-bold text-emerald-700">{currencySymbol}{pm.net.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3. Sales By Channel */}
                <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 shadow-2xs space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800 flex items-center gap-2 border-b border-neutral-100 pb-2.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-100 text-amber-800 text-[10px] font-extrabold">3</span>
                    Sales by Order Channel
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                    {reportData.channelList.map((c, idx) => (
                      <div key={idx} className="p-3 rounded-xl border border-neutral-200/60 bg-neutral-50/70">
                        <p className="text-xs font-bold text-neutral-800">{c.channel}</p>
                        <div className="flex items-baseline justify-between mt-2">
                          <span className="text-xs text-neutral-500">{c.count} checkouts</span>
                          <span className="text-sm font-extrabold text-neutral-900">{currencySymbol}{c.total.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Menu Items Summary */}
                <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800 flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-indigo-100 text-indigo-800 text-[10px] font-extrabold">4</span>
                      Product Sales Summary
                    </h4>
                    <span className="text-xs text-neutral-500 font-semibold">{reportData.totalItemsSold} total units</span>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="sticky top-0 bg-white text-neutral-400 font-semibold uppercase border-b border-neutral-100">
                        <tr>
                          <th className="py-2">Item Name</th>
                          <th className="py-2 text-center">Qty</th>
                          <th className="py-2 text-right">Unit Price</th>
                          <th className="py-2 text-right">Total Revenue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-50 font-medium text-neutral-700">
                        {reportData.itemsList.map((it, idx) => (
                          <tr key={idx} className="hover:bg-neutral-50/60">
                            <td className="py-2 font-bold text-neutral-900">{it.name}</td>
                            <td className="py-2 text-center font-semibold">{it.qty}</td>
                            <td className="py-2 text-right text-neutral-500">{currencySymbol}{it.price.toFixed(2)}</td>
                            <td className="py-2 text-right font-extrabold text-neutral-900">{currencySymbol}{it.revenue.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            {reportType === 'transactions' && (
              <div>
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-neutral-50 text-neutral-600 font-bold uppercase tracking-wider border-b border-neutral-200 sticky top-0 z-10">
                    <tr>
                      <th className="py-3 px-4">Order ID</th>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4">Channel</th>
                      <th className="py-3 px-4">Location</th>
                      <th className="py-3 px-4">Items Summary</th>
                      <th className="py-3 px-4">Payment</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Fees</th>
                      <th className="py-3 px-4 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 font-medium text-neutral-700">
                    {reportData.filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="py-10 text-center text-neutral-400 font-medium">
                          No transactions found matching your filters.
                        </td>
                      </tr>
                    ) : (
                      paginatedOrders.map((order) => {
                        const dateObj = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt || 0)
                        const dateFormatted = !isNaN(dateObj.getTime())
                          ? dateObj.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : '—'
                        const total = Number(order.total || 0)
                        const fees = Number(order.serviceFeeAmount || 0) + Number(order.cardFeeAmount || 0)
                        const cInfo = getOrderChannelInfo(order)
                        const locLabel = getOrderLocationLabel(order)

                        return (
                          <tr key={order.id} className="hover:bg-neutral-50/80 transition">
                            <td className="py-3 px-4 font-mono font-bold text-neutral-900">#{order.id}</td>
                            <td className="py-3 px-4 text-neutral-500 whitespace-nowrap">{dateFormatted}</td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${cInfo.badgeColor}`}>
                                {cInfo.label}
                              </span>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-bold text-neutral-900">
                                  {locLabel}
                                </span>
                                {order.note && (
                                  <span className="inline-flex items-center gap-1 text-[10.5px] text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md max-w-xs truncate" title={order.note}>
                                    Note: {order.note}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 max-w-xs truncate" title={Array.isArray(order.items) ? order.items.map(i => `${i.qty || 1}x ${i.name}`).join(', ') : ''}>
                              {Array.isArray(order.items) && order.items.length > 0 ? (
                                order.items.map((i, idx) => (
                                  <span key={idx} className="mr-1 inline-block bg-neutral-100 px-1.5 py-0.5 rounded text-[11px] text-neutral-800">
                                    {i.qty || 1}x {i.name}
                                  </span>
                                ))
                              ) : (
                                <span className="text-neutral-400">No items</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${order.paymentMethod === 'CARD' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                {order.paymentMethod || 'CASH'}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
                                {order.status || 'PAID'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right text-neutral-500 whitespace-nowrap">
                              {currencySymbol}{fees.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right font-extrabold text-neutral-900 whitespace-nowrap">
                              {currencySymbol}{total.toFixed(2)}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                  {reportData.filteredOrders.length > 0 && (
                    <tfoot className="bg-neutral-100/80 font-bold text-neutral-900 border-t border-neutral-300 sticky bottom-0 z-10">
                      <tr>
                        <td colSpan="4" className="py-3 px-4">TOTALS ({reportData.filteredOrders.length} Transactions)</td>
                        <td className="py-3 px-4 text-neutral-600">{reportData.totalItemsSold} items sold</td>
                        <td colSpan="2"></td>
                        <td className="py-3 px-4 text-right text-neutral-700">{currencySymbol}{reportData.totalFees.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-black text-emerald-700 text-sm">
                          {currencySymbol}{reportData.totalGrossRevenue.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>

                {/* Pagination Controls Bar */}
                {totalTransactions > 0 && (
                  <div className="p-3.5 bg-neutral-50 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-600">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-neutral-500">Rows per page:</span>
                      <select
                        value={tablePageSize}
                        onChange={(e) => {
                          setTablePageSize(Number(e.target.value))
                          setTableCurrentPage(1)
                        }}
                        className="px-2.5 py-1 bg-white border border-neutral-200 rounded-lg text-xs font-semibold text-neutral-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none shadow-2xs cursor-pointer"
                      >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                      <span className="text-neutral-300 mx-1">|</span>
                      <span>
                        Showing <strong className="text-neutral-900">{(tableCurrentPage - 1) * tablePageSize + 1}</strong> to <strong className="text-neutral-900">{Math.min(tableCurrentPage * tablePageSize, totalTransactions)}</strong> of <strong className="text-neutral-900">{totalTransactions}</strong> records
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={tableCurrentPage <= 1}
                        onClick={() => setTableCurrentPage(1)}
                        className="px-2.5 py-1 rounded-lg border border-neutral-200 bg-white font-semibold hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-2xs"
                        title="First Page"
                      >
                        «
                      </button>
                      <button
                        type="button"
                        disabled={tableCurrentPage <= 1}
                        onClick={() => setTableCurrentPage((p) => Math.max(1, p - 1))}
                        className="px-3 py-1 rounded-lg border border-neutral-200 bg-white font-semibold hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-2xs"
                        title="Previous Page"
                      >
                        ‹ Prev
                      </button>

                      <span className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold rounded-lg shadow-2xs">
                        Page {tableCurrentPage} of {totalTransactionPages}
                      </span>

                      <button
                        type="button"
                        disabled={tableCurrentPage >= totalTransactionPages}
                        onClick={() => setTableCurrentPage((p) => Math.min(totalTransactionPages, p + 1))}
                        className="px-3 py-1 rounded-lg border border-neutral-200 bg-white font-semibold hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-2xs"
                        title="Next Page"
                      >
                        Next ›
                      </button>
                      <button
                        type="button"
                        disabled={tableCurrentPage >= totalTransactionPages}
                        onClick={() => setTableCurrentPage(totalTransactionPages)}
                        className="px-2.5 py-1 rounded-lg border border-neutral-200 bg-white font-semibold hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-2xs"
                        title="Last Page"
                      >
                        »
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {reportType === 'items' && (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-neutral-50 text-neutral-600 font-bold uppercase tracking-wider border-b border-neutral-200 sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-4">Menu Item Name</th>
                    <th className="py-3 px-4 text-center">Units Sold</th>
                    <th className="py-3 px-4 text-right">Unit Price</th>
                    <th className="py-3 px-4 text-right">Total Revenue</th>
                    <th className="py-3 px-4 text-right">% Contribution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-medium text-neutral-700">
                  {reportData.itemsList.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-10 text-center text-neutral-400 font-medium">
                        No item sales recorded for this period.
                      </td>
                    </tr>
                  ) : (
                    reportData.itemsList.map((item, idx) => (
                      <tr key={idx} className="hover:bg-neutral-50/80 transition">
                        <td className="py-3 px-4 font-bold text-neutral-900">{item.name}</td>
                        <td className="py-3 px-4 text-center font-semibold text-neutral-800">{item.qty}</td>
                        <td className="py-3 px-4 text-right text-neutral-600">{currencySymbol}{item.price.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-extrabold text-neutral-900">{currencySymbol}{item.revenue.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right">
                          <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded font-bold text-[11px]">
                            {item.percentage.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {reportData.itemsList.length > 0 && (
                  <tfoot className="bg-neutral-100/80 font-bold text-neutral-900 border-t border-neutral-300 sticky bottom-0 z-10">
                    <tr>
                      <td className="py-3 px-4">TOTALS ({reportData.itemsList.length} Items)</td>
                      <td className="py-3 px-4 text-center">{reportData.totalItemsSold}</td>
                      <td></td>
                      <td className="py-3 px-4 text-right font-black text-emerald-700 text-sm">
                        {currencySymbol}{reportData.totalGrossRevenue.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold">100.0%</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}

            {reportType === 'payments' && (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-neutral-50 text-neutral-600 font-bold uppercase tracking-wider border-b border-neutral-200 sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-4">Payment Method</th>
                    <th className="py-3 px-4 text-center">Transactions Count</th>
                    <th className="py-3 px-4 text-right">Gross Volume</th>
                    <th className="py-3 px-4 text-right">Fees Deducted</th>
                    <th className="py-3 px-4 text-right">Net Revenue</th>
                    <th className="py-3 px-4 text-right">% Volume Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-medium text-neutral-700">
                  {reportData.paymentsList.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-10 text-center text-neutral-400 font-medium">
                        No payments recorded in this period.
                      </td>
                    </tr>
                  ) : (
                    reportData.paymentsList.map((pm, idx) => (
                      <tr key={idx} className="hover:bg-neutral-50/80 transition">
                        <td className="py-3 px-4 font-bold text-neutral-900 flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${pm.method === 'CARD' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                            {pm.method}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-semibold text-neutral-800">{pm.count}</td>
                        <td className="py-3 px-4 text-right font-extrabold text-neutral-900">{currencySymbol}{pm.gross.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-neutral-500">{currencySymbol}{pm.fees.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-700">{currencySymbol}{pm.net.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-bold text-neutral-700">{pm.percentage.toFixed(1)}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {reportData.paymentsList.length > 0 && (
                  <tfoot className="bg-neutral-100/80 font-bold text-neutral-900 border-t border-neutral-300 sticky bottom-0 z-10">
                    <tr>
                      <td className="py-3 px-4">TOTALS</td>
                      <td className="py-3 px-4 text-center">{reportData.totalOrdersCount}</td>
                      <td className="py-3 px-4 text-right font-black text-emerald-700 text-sm">
                        {currencySymbol}{reportData.totalGrossRevenue.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right text-neutral-700">{currencySymbol}{reportData.totalFees.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-800">{currencySymbol}{reportData.totalNetRevenue.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-bold">100.0%</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (viewMode === 'detailed-items') {
    return (
      <div className="p-6 sm:p-8 space-y-6">
        {/* Back Button & Header */}
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 border-b border-green-100/80 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <button
                onClick={() => {
                  setHoveredItemPoint(null)
                  setViewMode('dashboard')
                }}
                className="text-[11px] font-bold text-neutral-400 hover:text-green-600 transition uppercase tracking-wider flex items-center gap-1"
              >
                Analytics
              </button>
              <span className="text-neutral-300">/</span>
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Menu Items</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-neutral-900 flex items-center gap-2">
              Menu Items Analytics
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            {/* View Mode Switcher */}
            <div className="inline-flex items-center p-1 bg-neutral-100/90 rounded-xl border border-neutral-200/60 shadow-2xs">
              <button
                type="button"
                onClick={() => { setHoveredItemPoint(null); setViewMode('dashboard'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-white/40 transition-all"
              >
                <IconAnalytics />
                <span>Overview</span>
              </button>
              <button
                type="button"
                onClick={() => { setHoveredItemPoint(null); setViewMode('reports'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-white/40 transition-all"
              >
                <IconFileText />
                <span>Sales Reports</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('detailed-items')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-emerald-800 shadow-xs transition-all"
              >
                <span>Menu Items</span>
              </button>
            </div>

            {/* Timeframe Compact Segmented Control */}
            <div className="inline-flex items-center p-0.5 bg-neutral-100/90 rounded-lg border border-neutral-200/60 shadow-2xs">
              {[
                { id: 'today', label: 'Today' },
                { id: '7d', label: '7 Days' },
                { id: '30d', label: '30 Days' },
                { id: 'all', label: 'All' },
                { id: 'custom', label: 'Custom', isCustom: true },
              ].map(({ id, label, isCustom }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setHoveredItemPoint(null)
                    setDetailedFilterRange(id)
                    if (id === 'custom' && !customStartDateTime && !customEndDateTime) {
                      setQuickCustomRange('today_full')
                    }
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                    detailedFilterRange === id
                      ? 'bg-emerald-600 text-white font-semibold shadow-2xs'
                      : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/60'
                  }`}
                >
                  {isCustom && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  )}
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {detailedFilterRange === 'custom' && (
              <div className="flex flex-wrap items-center gap-1.5 ml-1">
                <input
                  type="datetime-local"
                  value={customStartDateTime}
                  onChange={(e) => setCustomStartDateTime(e.target.value)}
                  className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-700 outline-none focus:border-green-500 shadow-2xs"
                />
                <span className="text-xs text-neutral-400 font-bold">to</span>
                <input
                  type="datetime-local"
                  value={customEndDateTime}
                  onChange={(e) => setCustomEndDateTime(e.target.value)}
                  className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-700 outline-none focus:border-green-500 shadow-2xs"
                />
              </div>
            )}
          </div>
        </div>

        {/* Detailed KPI Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Quantity */}
          <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-sm" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' }}>
            <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/10" />
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-100">Total Items Sold</p>
            <p className="mt-3 text-3xl font-extrabold">{allItemsStats.totalPeriodQty}</p>
            <div className="mt-3 text-xs text-indigo-100/90 font-medium">
              <span>Units sold in timeframe</span>
            </div>
          </div>

          {/* Total Earnings */}
          <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-sm" style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' }}>
            <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/10" />
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-100">Revenue Earned</p>
            <p className="mt-3 text-3xl font-extrabold">
              {currencySymbol}
              {allItemsStats.totalPeriodRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <div className="mt-3 text-xs text-emerald-100/90 font-medium">
              <span>Direct sales income</span>
            </div>
          </div>

          {/* Unique Items Sold */}
          <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-sm" style={{ background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)' }}>
            <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/10" />
            <p className="text-xs font-bold uppercase tracking-widest text-amber-100">Unique Items Sold</p>
            <p className="mt-3 text-3xl font-extrabold">
              {allItemsStats.itemsList.length}
            </p>
            <div className="mt-3 text-xs text-amber-100/90 font-medium">
              <span>Menu items active</span>
            </div>
          </div>

          {/* Active Sales Days */}
          <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-sm" style={{ background: 'linear-gradient(135deg, #db2777 0%, #ec4899 100%)' }}>
            <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/10" />
            <p className="text-xs font-bold uppercase tracking-widest text-pink-100">Active Sales Days</p>
            <p className="mt-3 text-3xl font-extrabold">
              {allItemsStats.dailyTrend.length}
            </p>
            <div className="mt-3 text-xs text-pink-100/90 font-medium">
              <span>Days with POS transactions</span>
            </div>
          </div>
        </div>

        {/* Daily Sales Chart */}
        <div className="card p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-neutral-900">Per Day Total Sales</h3>
            <p className="text-xs text-neutral-500">Gross revenue generated per day for all menu items</p>
          </div>

          <div className="mt-6 relative h-[210px] w-full">
            {allItemsStats.dailyTrend.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-neutral-400 font-medium">
                No sales recorded in this timeframe.
              </div>
            ) : (
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-full w-full overflow-visible">
                <defs>
                  <linearGradient id="itemChartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Y Grid Lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((val, idx) => {
                  const maxEarn = Math.max(...allItemsStats.dailyTrend.map((t) => t.earnings), 10)
                  const lineY = chartPadding.top + val * (chartHeight - chartPadding.top - chartPadding.bottom)
                  const textLabel = (maxRev => (maxRev * (1 - val)).toFixed(0))(maxEarn)
                  return (
                    <g key={idx}>
                      <line
                        x1={chartPadding.left}
                        y1={lineY}
                        x2={chartWidth - chartPadding.right}
                        y2={lineY}
                        stroke="#e5e7eb"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={chartPadding.left - 10}
                        y={lineY + 4}
                        fill="#9ca3af"
                        fontSize="9"
                        fontWeight="600"
                        textAnchor="end"
                      >
                        {currencySymbol}{textLabel}
                      </text>
                    </g>
                  )
                })}

                {/* Area under curve */}
                <path d={detailedChartAreaPath} fill="url(#itemChartGradient)" />

                {/* Main Curved Line */}
                <path d={detailedChartPath} fill="none" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" />

                {/* Point nodes & interaction */}
                {detailedChartPoints.map((pt, idx) => (
                  <g key={idx}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="4"
                      fill="#ffffff"
                      stroke="#6366f1"
                      strokeWidth="2.5"
                      className="cursor-pointer transition-transform hover:scale-150"
                      onMouseEnter={() => setHoveredItemPoint(pt)}
                      onMouseLeave={() => setHoveredItemPoint(null)}
                    />
                  </g>
                ))}

                {/* X Axis Labels */}
                {detailedChartPoints.map((pt, idx) => {
                  const step = Math.ceil(detailedChartPoints.length / 6)
                  if (idx % step !== 0 && idx !== detailedChartPoints.length - 1) return null

                  return (
                    <text
                      key={idx}
                      x={pt.x}
                      y={chartHeight - 10}
                      fill="#9ca3af"
                      fontSize="9"
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      {pt.date}
                    </text>
                  )
                })}
              </svg>
            )}

            {/* Hover Tooltip */}
            {hoveredItemPoint && (
              <div
                className="absolute z-10 rounded-xl bg-neutral-900 p-2.5 text-xs text-white shadow-md border border-neutral-800"
                style={{
                  left: `${(hoveredItemPoint.x / chartWidth) * 100}%`,
                  top: `${(hoveredItemPoint.y / chartHeight) * 100 - 25}%`,
                  transform: 'translate(-50%, -100%)',
                }}
              >
                <p className="font-semibold text-neutral-400">{hoveredItemPoint.date}</p>
                <p className="mt-0.5 font-bold text-sm">
                  {currencySymbol}
                  {hoveredItemPoint.earnings.toFixed(2)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* All Items Performance Table */}
        <div className="card p-5 overflow-hidden space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-neutral-900">Menu Items Performance</h3>
              <p className="text-xs text-neutral-500">List of all items sold with quantities and pricing</p>
            </div>

            {/* Search Input Box */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Filter by item name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-1.5 w-full sm:w-60 text-xs font-semibold rounded-lg border border-neutral-300 bg-white text-neutral-700 placeholder-neutral-400 outline-none transition focus:border-green-500 focus:ring-1 focus:ring-green-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-100 text-neutral-400 uppercase font-bold tracking-wider">
                  <th className="py-2.5 font-semibold">Item Name</th>
                  <th className="py-2.5 font-semibold text-center">Quantity Sold</th>
                  <th className="py-2.5 font-semibold text-right">Avg Unit Price</th>
                  <th className="py-2.5 font-semibold text-right">Total Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50 font-medium text-neutral-700">
                {allItemsStats.itemsList.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="py-6 text-center text-neutral-400 font-medium">
                      No sales recorded in this timeframe.
                    </td>
                  </tr>
                ) : (
                  allItemsStats.itemsList.map((item) => (
                    <tr key={item.name} className="hover:bg-neutral-50/50">
                      <td className="py-3 font-bold text-neutral-900">{item.name}</td>
                      <td className="py-3 text-center text-neutral-800 font-semibold">{item.qty}</td>
                      <td className="py-3 text-right text-neutral-600">
                        {currencySymbol}
                        {item.avgPrice.toFixed(2)}
                      </td>
                      <td className="py-3 text-right font-extrabold text-neutral-900">
                        {currencySymbol}
                        {item.revenue.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 border-b border-green-100/80 pb-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">POS Sales</p>
          <div className="mt-0.5 flex items-center gap-2.5">
            <h2 className="text-2xl font-bold tracking-tight text-neutral-900">Restaurant Analytics</h2>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 rounded-full px-2.5 py-0.5 shadow-2xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Connected
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {/* View Mode Switcher */}
          <div className="inline-flex items-center p-1 bg-neutral-100/90 rounded-xl border border-neutral-200/60 shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode('dashboard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'dashboard'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/40'
              }`}
            >
              <IconAnalytics />
              <span>Overview</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('reports')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'reports'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/40'
              }`}
            >
              <IconFileText />
              <span>Sales Reports</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('detailed-items')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'detailed-items'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/40'
              }`}
            >
              <span>Menu Items</span>
            </button>
          </div>

          {/* Timeframe Compact Segmented Control */}
          <div className="inline-flex items-center p-0.5 bg-neutral-100/90 rounded-lg border border-neutral-200/60 shadow-2xs">
            {[
              { id: 'today', label: 'Today' },
              { id: '7d', label: '7 Days' },
              { id: '30d', label: '30 Days' },
              { id: '3m', label: '3 Months' },
              { id: '6m', label: '6 Months' },
              { id: '12m', label: '12 Months' },
              { id: 'all', label: 'All' },
              { id: 'custom', label: 'Custom', isCustom: true },
            ].map(({ id, label, isCustom }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleSelectFilterRange(id)}
                className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                  filterRange === id
                    ? 'bg-emerald-600 text-white font-semibold shadow-2xs'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/60'
                }`}
              >
                {isCustom && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                )}
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Custom Date & Time Selector Panel */}
      {filterRange === 'custom' && (
        <div className="rounded-2xl border border-green-200 bg-gradient-to-br from-green-50/80 via-white to-emerald-50/40 p-4 sm:p-5 shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-green-100/80 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-600 text-white shadow-sm flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-bold text-neutral-900">Custom Date & Time Range</h4>
                <p className="text-xs text-neutral-500">Select dates and exact hours via calendar view to filter POS sales data</p>
              </div>
            </div>

            {/* Quick Shift / Window Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mr-1">Presets:</span>
              <button
                type="button"
                onClick={() => setQuickCustomRange('today_full')}
                className="rounded-lg bg-white border border-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition shadow-2xs"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setQuickCustomRange('yesterday')}
                className="rounded-lg bg-white border border-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition shadow-2xs"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => setQuickCustomRange('last24h')}
                className="rounded-lg bg-white border border-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition shadow-2xs"
              >
                Last 24h
              </button>
              {(customStartDateTime || customEndDateTime) && (
                <button
                  type="button"
                  onClick={() => setQuickCustomRange('clear')}
                  className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 transition"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Date & Time Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5 flex items-center gap-1.5">
                <span className="flex h-2 w-2 rounded-full bg-green-500" />
                Start Date & Time (From)
              </label>
              <input
                type="datetime-local"
                value={customStartDateTime}
                onChange={(e) => setCustomStartDateTime(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100 shadow-2xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5 flex items-center gap-1.5">
                <span className="flex h-2 w-2 rounded-full bg-red-500" />
                End Date & Time (To)
              </label>
              <input
                type="datetime-local"
                value={customEndDateTime}
                onChange={(e) => setCustomEndDateTime(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100 shadow-2xs"
              />
            </div>
          </div>

          {/* Active Range Summary Pill */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600 bg-white/80 backdrop-blur-sm rounded-xl p-3 border border-green-100">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-green-800">Filtered Window:</span>
              <span className="font-mono text-neutral-800">
                {customStartDateTime ? new Date(customStartDateTime).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Beginning'}
                {' → '}
                {customEndDateTime ? new Date(customEndDateTime).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Latest'}
              </span>
            </div>
            <div className="font-bold text-green-700 bg-green-100/70 px-2.5 py-1 rounded-lg">
              {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'} matched
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Revenue */}
        <div
          className="relative overflow-hidden rounded-2xl p-5 text-white shadow-sm"
          style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' }}
        >
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/10" />
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-100">Revenue</p>
          <p className="mt-3 text-3xl font-extrabold">{currencySymbol}{stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <div className="mt-3 flex items-center justify-between text-xs text-emerald-100/90 font-medium">
            <span>Card Fees: {currencySymbol}{stats.cardFees.toFixed(2)}</span>
            <span>Service Fees: {currencySymbol}{stats.serviceFees.toFixed(2)}</span>
          </div>
        </div>

        {/* Orders */}
        <div
          className="relative overflow-hidden rounded-2xl p-5 text-white shadow-sm"
          style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' }}
        >
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/10" />
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-100">Orders</p>
          <p className="mt-3 text-3xl font-extrabold">{stats.totalOrders}</p>
          <div className="mt-3 text-xs text-indigo-100/90 font-medium">
            <span>Completed POS checkouts</span>
          </div>
        </div>

        {/* Average Order Value (AOV) */}
        <div
          className="relative overflow-hidden rounded-2xl p-5 text-white shadow-sm"
          style={{ background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)' }}
        >
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/10" />
          <p className="text-xs font-bold uppercase tracking-widest text-amber-100">Average Order (AOV)</p>
          <p className="mt-3 text-3xl font-extrabold">{currencySymbol}{stats.aov.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <div className="mt-3 text-xs text-amber-100/90 font-medium">
            <span>Max Order: {currencySymbol}{stats.highestOrder.toFixed(2)}</span>
          </div>
        </div>

        {/* Items Sold */}
        <div
          className="relative overflow-hidden rounded-2xl p-5 text-white shadow-sm"
          style={{ background: 'linear-gradient(135deg, #db2777 0%, #ec4899 100%)' }}
        >
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/10" />
          <p className="text-xs font-bold uppercase tracking-widest text-pink-100">Items Sold</p>
          <p className="mt-3 text-3xl font-extrabold">{stats.itemsSold}</p>
          <div className="mt-3 text-xs text-pink-100/90 font-medium">
            <span>Avg items/order: {stats.totalOrders > 0 ? (stats.itemsSold / stats.totalOrders).toFixed(1) : 0}</span>
          </div>
        </div>
      </div>

      {/* Revenue Bar Chart (Synced with top date range, Daily / Monthly toggle) */}
      <RevenueBarChart
        orders={filteredOrders}
        filterRange={filterRange}
        customStart={customStartDateTime}
        customEnd={customEndDateTime}
        currencySymbol={currencySymbol}
      />

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Line Chart */}
        <div className="card lg:col-span-2 p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-neutral-900">Revenue Trend</h3>
            <p className="text-xs text-neutral-500">Sales volume performance over selected period</p>
          </div>

          <div className="mt-6 relative h-[210px] w-full">
            {stats.dailyTrend.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-neutral-400 font-medium">
                No paid orders recorded in this period.
              </div>
            ) : (
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-full w-full overflow-visible">
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Y Grid Lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((val, idx) => {
                  const maxRev = Math.max(...stats.dailyTrend.map((t) => t.revenue), 100)
                  const lineY = chartPadding.top + val * (chartHeight - chartPadding.top - chartPadding.bottom)
                  const textLabel = (maxRev * (1 - val)).toFixed(0)
                  return (
                    <g key={idx}>
                      <line
                        x1={chartPadding.left}
                        y1={lineY}
                        x2={chartWidth - chartPadding.right}
                        y2={lineY}
                        stroke="#e5e7eb"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={chartPadding.left - 10}
                        y={lineY + 4}
                        fill="#9ca3af"
                        fontSize="9"
                        fontWeight="600"
                        textAnchor="end"
                      >
                        {currencySymbol}{textLabel}
                      </text>
                    </g>
                  )
                })}

                {/* Area under curve */}
                <path d={chartAreaPath} fill="url(#chartGradient)" />

                {/* Main Curved Line */}
                <path d={chartPath} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />

                {/* Point nodes & interaction */}
                {chartPoints.map((pt, idx) => (
                  <g key={idx}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="4"
                      fill="#ffffff"
                      stroke="#10b981"
                      strokeWidth="2.5"
                      className="cursor-pointer transition-transform hover:scale-150"
                      onMouseEnter={() => setHoveredPoint(pt)}
                      onMouseLeave={() => setHoveredPoint(null)}
                    />
                  </g>
                ))}

                {/* X Axis Labels */}
                {chartPoints.map((pt, idx) => {
                  // Only show subset of labels if there are too many points
                  const step = Math.ceil(chartPoints.length / 6)
                  if (idx % step !== 0 && idx !== chartPoints.length - 1) return null

                  return (
                    <text
                      key={idx}
                      x={pt.x}
                      y={chartHeight - 10}
                      fill="#9ca3af"
                      fontSize="9"
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      {pt.date}
                    </text>
                  )
                })}
              </svg>
            )}

            {/* Hover Tooltip */}
            {hoveredPoint && (
              <div
                className="absolute z-10 rounded-xl bg-neutral-900 p-2.5 text-xs text-white shadow-md border border-neutral-800"
                style={{
                  left: `${(hoveredPoint.x / chartWidth) * 100}%`,
                  top: `${(hoveredPoint.y / chartHeight) * 100 - 25}%`,
                  transform: 'translate(-50%, -100%)',
                }}
              >
                <p className="font-semibold text-neutral-400">{hoveredPoint.date}</p>
                <p className="mt-0.5 font-bold text-sm">
                  {currencySymbol}
                  {hoveredPoint.revenue.toFixed(2)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Popular Items Horizontal Bar Chart */}
        <div className="card p-5">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-base font-bold text-neutral-900">Popular Items</h3>
              <p className="text-xs text-neutral-500">Top menu choices by quantities sold</p>
            </div>
            <button
              onClick={() => {
                setViewMode('detailed-items')
              }}
              className="text-xs font-semibold text-green-600 hover:text-green-700 hover:underline transition"
            >
              View Details →
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {stats.popularItemsList.length === 0 ? (
              <div className="flex h-44 items-center justify-center text-sm text-neutral-400 font-medium">
                No items sold yet.
              </div>
            ) : (
              stats.popularItemsList.map((item, idx) => {
                const maxQty = Math.max(...stats.popularItemsList.map((i) => i.qty), 1)
                const percentage = (item.qty / maxQty) * 100
                const colors = ['bg-emerald-500', 'bg-indigo-500', 'bg-amber-500', 'bg-pink-500', 'bg-sky-500']

                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-neutral-800 truncate max-w-[150px]">{item.name}</span>
                      <span className="font-medium text-neutral-500">
                        {item.qty} sold ({currencySymbol}
                        {item.revenue.toFixed(2)})
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${colors[idx % colors.length]}`}
                        style={{ width: `${percentage}%`, transition: 'width 0.5s ease-out' }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Detailed Insights Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Methods & Channels */}
        <div className="card p-5 space-y-6">
          <div>
            <h3 className="text-base font-bold text-neutral-900">Channels & Payment Types</h3>
            <p className="text-xs text-neutral-500">Breakdown of orders and transaction value</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Payment Method Breakdown */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-400">Payment Types</h4>
              <div className="space-y-3">
                {Object.keys(stats.paymentMethods).length === 0 ? (
                  <p className="text-xs text-neutral-400 font-medium">No sales recorded.</p>
                ) : (
                  Object.keys(stats.paymentMethods).map((method) => {
                    const value = stats.paymentMethods[method]
                    const pct = (value / stats.totalRevenue) * 100
                    return (
                      <div key={method} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold text-neutral-700">
                          <span>{method}</span>
                          <span>
                            {pct.toFixed(0)}% ({currencySymbol}
                            {value.toFixed(2)})
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${method === 'CARD' ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Channels Breakdown */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-400">Order Channel</h4>
              <div className="space-y-3">
                {Object.keys(stats.orderSources).filter((k) => stats.orderSources[k] > 0).length === 0 ? (
                  <p className="text-xs text-neutral-400 font-medium">No sales recorded.</p>
                ) : (
                  Object.keys(stats.orderSources)
                    .filter((source) => stats.orderSources[source] > 0)
                    .map((source) => {
                      const value = stats.orderSources[source]
                      const pct = stats.totalRevenue > 0 ? (value / stats.totalRevenue) * 100 : 0
                      const colors = {
                        COUNTER: 'bg-indigo-500',
                        TABLE: 'bg-emerald-500',
                        ROOM: 'bg-purple-500',
                        SURFHOUSE: 'bg-amber-500',
                        ONLINE: 'bg-sky-500',
                      }
                      const channelLabels = {
                        COUNTER: 'Counter / Walk-in',
                        TABLE: 'Dine-In (Tables)',
                        ROOM: 'Room Service',
                        SURFHOUSE: 'Surf House / Rentals',
                        ONLINE: 'Online / QR',
                      }
                      return (
                        <div key={source} className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold text-neutral-700">
                            <span>{channelLabels[source] || source}</span>
                            <span>
                              {pct.toFixed(0)}% ({currencySymbol}
                              {value.toFixed(2)})
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${colors[source] || 'bg-neutral-400'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Location & Space Performance */}
        <div className="card p-5">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-base font-bold text-neutral-900">Table & Space Performance</h3>
              <p className="text-xs text-neutral-500">Top earning tables, hotel rooms & surf house</p>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
              {stats.tablePerformanceList.length} Active Spaces
            </span>
          </div>

          <div className="space-y-3.5">
            {stats.tablePerformanceList.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-neutral-400 font-medium">
                No location or room transactions recorded in this timeframe.
              </div>
            ) : (
              stats.tablePerformanceList.map((tbl, idx) => {
                const maxTableRev = Math.max(...stats.tablePerformanceList.map((t) => t.revenue), 1)
                const percentage = (tbl.revenue / maxTableRev) * 100

                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs font-bold text-neutral-800">
                      <span className="flex items-center gap-1.5">
                        <span className="font-bold text-neutral-900">{tbl.location}</span>
                        {tbl.count > 0 && (
                          <span className="text-[10px] text-neutral-400 font-normal">
                            ({tbl.count} {tbl.count === 1 ? 'order' : 'orders'})
                          </span>
                        )}
                      </span>
                      <span className="font-extrabold text-neutral-900">
                        {currencySymbol}
                        {tbl.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="card p-5 overflow-hidden">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-base font-bold text-neutral-900">Recent Transactions</h3>
            <p className="text-xs text-neutral-500">Last checkout operations synced from POS app</p>
          </div>
          <button
            onClick={() => setViewMode('reports')}
            className="text-xs font-semibold text-green-600 hover:text-green-700 hover:underline transition flex items-center gap-1"
          >
            <span>Full Sales Report</span>
            <span>→</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-100 text-neutral-400 uppercase font-bold tracking-wider">
                <th className="py-2.5 font-semibold">Order ID</th>
                <th className="py-2.5 font-semibold">Date/Time</th>
                <th className="py-2.5 font-semibold">Channel</th>
                <th className="py-2.5 font-semibold">Location</th>
                <th className="py-2.5 font-semibold">Payment</th>
                <th className="py-2.5 font-semibold">Items</th>
                <th className="py-2.5 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50 font-medium text-neutral-700">
              {stats.rawSortedOrders.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-6 text-center text-neutral-400 font-medium">
                    No transactions to show.
                  </td>
                </tr>
              ) : (
                [...stats.rawSortedOrders]
                  .reverse()
                  .slice(0, 6)
                  .map((order) => {
                    const date = new Date(order.createdAt)
                    const formattedDate = !isNaN(date.getTime())
                      ? date.toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'
                    const itemsCount = Array.isArray(order.items)
                      ? order.items.reduce((acc, item) => acc + (item.qty || 1), 0)
                      : 0
                    const cInfo = getOrderChannelInfo(order)
                    const locLabel = getOrderLocationLabel(order)

                    return (
                      <tr key={order.id} className="hover:bg-neutral-50/50">
                        <td className="py-3 font-mono font-bold text-neutral-900">#{order.id}</td>
                        <td className="py-3 text-neutral-500">{formattedDate}</td>
                        <td className="py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${cInfo.badgeColor}`}>
                            {cInfo.label}
                          </span>
                        </td>
                        <td className="py-3 whitespace-nowrap">
                          <span className="font-semibold text-neutral-900">{locLabel}</span>
                          {order.note && (
                            <span className="ml-1 text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200" title={order.note}>
                              Note: {order.note}
                            </span>
                          )}
                        </td>
                        <td className="py-3">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              order.paymentMethod === 'CARD'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {order.paymentMethod || 'CASH'}
                          </span>
                        </td>
                        <td className="py-3 text-neutral-500">{itemsCount} items</td>
                        <td className="py-3 text-right font-extrabold text-neutral-900">
                          {currencySymbol}
                          {Number(order.total || 0).toFixed(2)}
                        </td>
                      </tr>
                    )
                  })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
