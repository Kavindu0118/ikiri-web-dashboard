import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  IconSearch,
  IconRefresh,
  IconDownload,
  IconReceiptAudit,
  IconRefund,
  IconVoid,
  IconClock,
  IconAlertTriangle,
  IconX,
} from '../Icons'
import {
  fetchCancelledAndRefundedOrders,
  fetchOpenTickets,
  fetchVoidLogs,
  subscribeToOpenTickets,
  subscribeToTodayAuditOrders,
  subscribeToTodayVoidLogs,
} from '../../lib/ordersStorage'
import { getDateRangeBounds } from '../../lib/analyticsStorage'

const PAGE_SIZE = 10

export default function CancelledRefundedOrdersScreen({
  profile,
  restaurantSettings,
  restaurantId: propRestaurantId,
}) {
  const targetRestaurantId =
    propRestaurantId || profile?.restaurantId || profile?.id || null
  const currencySymbol = restaurantSettings?.currency || '$'

  // Data states
  const [archivedOrders, setArchivedOrders] = useState([])
  const [openTickets, setOpenTickets] = useState([])
  const [voidLogs, setVoidLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  // Filters
  const [filterType, setFilterType] = useState('all') // 'all' | 'voided' | 'item_voids' | 'refunded' | 'open'
  const [dateFilter, setDateFilter] = useState('today') // default to 'today' to optimize db reads
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)

  // Selected ticket for modal
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [activeTicketTab, setActiveTicketTab] = useState('all') // 'all' | ticketId

  // Tables Grid popup modal state
  const [showTablesModal, setShowTablesModal] = useState(false)
  const [tableModalFilter, setTableModalFilter] = useState('all') // 'all' | 'occupied'

  // Card info popover / expand toggles ('voided' | 'refunded' | 'open' | 'audit' | null)
  const [expandedInfoCard, setExpandedInfoCard] = useState(null)

  const toggleCardInfo = (cardKey) => {
    setExpandedInfoCard((prev) => (prev === cardKey ? null : cardKey))
  }

  // Fetch all data
  const loadData = useCallback(
    async (isManualRefresh = false) => {
      if (!targetRestaurantId) {
        setLoading(false)
        return
      }

      if (isManualRefresh) setRefreshing(true)
      else setLoading(true)
      setError(null)

      try {
        // Query Firestore with exact date bounds to only read relevant records
        const { startDate, endDate } = getDateRangeBounds(dateFilter, customStart, customEnd)
        const [archived, open, logs] = await Promise.all([
          fetchCancelledAndRefundedOrders(targetRestaurantId, {
            startDate,
            endDate,
            backupConfig: profile?.backupDatabase,
          }),
          fetchOpenTickets(targetRestaurantId, profile?.backupDatabase),
          fetchVoidLogs(targetRestaurantId, {
            startDate,
            endDate,
            backupConfig: profile?.backupDatabase,
          }),
        ])

        setArchivedOrders(archived)
        setOpenTickets(open)
        setVoidLogs(logs)
        setLastUpdated(new Date())
      } catch (err) {
        console.error('Error fetching audit tickets:', err)
        setError(err.message || 'Failed to load cancelled and refunded orders.')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [targetRestaurantId, profile?.backupDatabase, dateFilter, customStart, customEnd]
  )

  useEffect(() => {
    loadData()
  }, [loadData])

  // Live real-time subscription for open tickets (waiter/POS updates)
  useEffect(() => {
    if (!targetRestaurantId) return

    const unsubOpen = subscribeToOpenTickets(
      targetRestaurantId,
      (liveOpen) => {
        setOpenTickets(liveOpen)
        setLastUpdated(new Date())
      },
      (err) => console.warn('Open tickets live subscription:', err),
      profile?.backupDatabase
    )

    // Real-time listener for today's newly archived voided/refunded tickets
    const unsubAudit = subscribeToTodayAuditOrders(
      targetRestaurantId,
      (todayAuditRecords) => {
        if (!todayAuditRecords || todayAuditRecords.length === 0) return
        setArchivedOrders((prev) => {
          const map = new Map(prev.map((r) => [r.id, r]))
          todayAuditRecords.forEach((r) => map.set(r.id, { ...map.get(r.id), ...r }))
          return Array.from(map.values()).sort((a, b) => {
            const timeA = a.date ? a.date.getTime() : 0
            const timeB = b.date ? b.date.getTime() : 0
            return timeB - timeA
          })
        })
        setLastUpdated(new Date())
      },
      (err) => console.warn('Audit records live subscription:', err),
      profile?.backupDatabase
    )

    // Real-time listener for today's void logs (item reductions)
    const unsubVoidLogs = subscribeToTodayVoidLogs(
      targetRestaurantId,
      (todayLogs) => {
        if (!todayLogs || todayLogs.length === 0) return
        setVoidLogs((prev) => {
          const map = new Map(prev.map((l) => [l.id, l]))
          todayLogs.forEach((l) => map.set(l.id, { ...map.get(l.id), ...l }))
          return Array.from(map.values()).sort((a, b) => {
            const timeA = a.date ? a.date.getTime() : 0
            const timeB = b.date ? b.date.getTime() : 0
            return timeB - timeA
          })
        })
        setLastUpdated(new Date())
      },
      (err) => console.warn('Void logs live subscription:', err),
      profile?.backupDatabase
    )

    return () => {
      unsubOpen()
      unsubAudit()
      unsubVoidLogs()
    }
  }, [targetRestaurantId, profile?.backupDatabase])

  // Reset pagination on filter or search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [filterType, dateFilter, customStart, customEnd, searchQuery])

  // Helper date boundary filter
  const isWithinDateFilter = useCallback(
    (recordDate) => {
      if (!recordDate || !(recordDate instanceof Date) || isNaN(recordDate.getTime())) {
        return true
      }
      if (dateFilter === 'all') return true

      const { startDate, endDate } = getDateRangeBounds(dateFilter, customStart, customEnd)
      if (startDate && recordDate < startDate) return false
      if (endDate && recordDate > endDate) return false
      return true
    },
    [dateFilter, customStart, customEnd]
  )

  // Helper to map void logs by ticketId or dailyNumber
  const voidLogsByTicket = useMemo(() => {
    const map = new Map()
    voidLogs.forEach((log) => {
      if (log.ticketId) {
        const k = String(log.ticketId)
        if (!map.has(k)) map.set(k, [])
        map.get(k).push(log)
      }
      if (log.dailyNumber) {
        const kDaily = `daily_${log.dailyNumber}`
        if (!map.has(kDaily)) map.set(kDaily, [])
        map.get(kDaily).push(log)
      }
    })
    return map
  }, [voidLogs])

  const getTicketVoidLogs = useCallback(
    (ticket) => {
      if (!ticket) return []
      const found = new Map()
      if (ticket.id && voidLogsByTicket.has(String(ticket.id))) {
        voidLogsByTicket.get(String(ticket.id)).forEach((l) => found.set(l.id, l))
      }
      if (ticket.ticketId && voidLogsByTicket.has(String(ticket.ticketId))) {
        voidLogsByTicket.get(String(ticket.ticketId)).forEach((l) => found.set(l.id, l))
      }
      if (ticket.dailyNumber && voidLogsByTicket.has(`daily_${ticket.dailyNumber}`)) {
        voidLogsByTicket.get(`daily_${ticket.dailyNumber}`).forEach((l) => found.set(l.id, l))
      }
      return Array.from(found.values()).sort((a, b) => {
        const timeA = a.date ? a.date.getTime() : 0
        const timeB = b.date ? b.date.getTime() : 0
        return timeB - timeA
      })
    },
    [voidLogsByTicket]
  )

  // Merge and filter records
  const allCombinedRecords = useMemo(() => {
    const list = [...openTickets, ...archivedOrders, ...voidLogs]
    return list.sort((a, b) => {
      const timeA = a.date ? a.date.getTime() : 0
      const timeB = b.date ? b.date.getTime() : 0
      return timeB - timeA
    })
  }, [openTickets, archivedOrders, voidLogs])

  const filteredRecords = useMemo(() => {
    return allCombinedRecords.filter((record) => {
      // 1. Filter by Status/Type Tab
      if (filterType === 'voided') {
        if (record.status !== 'VOIDED' && record.status !== 'CANCELLED') return false
      } else if (filterType === 'item_voids') {
        if (!record.isVoidLog && record.status !== 'ITEM_VOID') return false
      } else if (filterType === 'refunded') {
        if (record.status !== 'REFUNDED') return false
      } else if (filterType === 'open') {
        if (record.status !== 'OPEN') return false
      }

      // 2. Filter by Date range
      if (record.status !== 'OPEN' || dateFilter !== 'all') {
        if (!isWithinDateFilter(record.date)) return false
      }

      // 3. Filter by Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchId = String(record.id || '').toLowerCase().includes(q)
        const matchDaily = String(record.dailyNumber || '').toLowerCase().includes(q)
        const matchNote = String(record.note || '').toLowerCase().includes(q)
        const matchReason = String(record.voidReason || '').toLowerCase().includes(q)
        const matchTable = String(record.tableNumber || '').toLowerCase().includes(q)
        const matchRoom = String(record.roomNumber || '').toLowerCase().includes(q)
        const matchSource = String(record.source || '').toLowerCase().includes(q)
        const matchItem = String(record.itemName || '').toLowerCase().includes(q)

        if (
          !matchId &&
          !matchDaily &&
          !matchNote &&
          !matchReason &&
          !matchTable &&
          !matchRoom &&
          !matchSource &&
          !matchItem
        ) {
          return false
        }
      }

      return true
    })
  }, [allCombinedRecords, filterType, dateFilter, searchQuery, isWithinDateFilter])

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE))
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages)

  const paginatedRecords = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * PAGE_SIZE
    return filteredRecords.slice(startIndex, startIndex + PAGE_SIZE)
  }, [filteredRecords, safeCurrentPage])

  // Table grid metrics based on configured restaurant tableCount and open tickets
  const configuredTables = Number(restaurantSettings?.tableCount || 0)
  const maxTableInTickets = useMemo(() => {
    return openTickets.reduce((max, t) => {
      const n = parseInt(t.tableNumber, 10)
      return !isNaN(n) && n > max ? n : max
    }, 0)
  }, [openTickets])

  const totalTables = useMemo(() => {
    if (configuredTables > 0) return Math.max(configuredTables, maxTableInTickets)
    return Math.max(maxTableInTickets, 20)
  }, [configuredTables, maxTableInTickets])

  const openTicketsByTable = useMemo(() => {
    const map = new Map()
    openTickets.forEach((t) => {
      if (t.tableNumber != null && String(t.tableNumber).trim() !== '') {
        const key = String(t.tableNumber).trim()
        if (!map.has(key)) map.set(key, [])
        map.get(key).push(t)
      }
    })
    return map
  }, [openTickets])

  const tableNumbers = useMemo(() => {
    const list = []
    for (let i = 1; i <= totalTables; i++) {
      list.push(i)
    }
    return list
  }, [totalTables])

  const occupiedTableCount = useMemo(() => {
    return tableNumbers.filter((n) => openTicketsByTable.has(String(n))).length
  }, [tableNumbers, openTicketsByTable])

  const nonTableOpenTickets = useMemo(() => {
    return openTickets.filter((t) => !t.tableNumber || String(t.tableNumber).trim() === '')
  }, [openTickets])

  // Summary Metrics calculations
  const stats = useMemo(() => {
    let voidedCount = 0
    let voidedAmount = 0
    let itemVoidCount = 0
    let itemVoidAmount = 0
    let refundedCount = 0
    let refundedAmount = 0
    let openCount = 0
    let openAmount = 0

    allCombinedRecords.forEach((r) => {
      const matchesDate = r.status === 'OPEN' || isWithinDateFilter(r.date)
      if (!matchesDate) return

      if (r.isVoidLog || r.status === 'ITEM_VOID') {
        itemVoidCount += 1
        itemVoidAmount += Number(r.totalAmount || r.total || 0)
      } else if (r.status === 'VOIDED' || r.status === 'CANCELLED') {
        voidedCount += 1
        voidedAmount += Number(r.total || 0)
      } else if (r.status === 'REFUNDED') {
        refundedCount += 1
        refundedAmount += Number(r.total || 0)
      } else if (r.status === 'OPEN') {
        openCount += 1
        openAmount += Number(r.total || 0)
      }
    })

    return {
      voidedCount,
      voidedAmount,
      itemVoidCount,
      itemVoidAmount,
      refundedCount,
      refundedAmount,
      openCount,
      openAmount,
      totalAuditRecords: voidedCount + itemVoidCount + refundedCount,
      totalAuditLoss: voidedAmount + itemVoidAmount + refundedAmount,
    }
  }, [allCombinedRecords, isWithinDateFilter])

  // CSV Export
  const handleExportCsv = () => {
    if (filteredRecords.length === 0) return

    const headers = [
      'Ticket ID',
      'Daily #',
      'Status',
      'Created Date',
      'Source',
      'Location',
      'Reason / Note',
      'Amount',
    ]

    const rows = filteredRecords.map((r) => {
      const loc = r.tableNumber
        ? `Table ${r.tableNumber}`
        : r.roomNumber
        ? `Room ${r.roomNumber}`
        : r.source || 'Counter'
      const reasonText = r.isVoidLog
        ? `${r.qtyVoided}x ${r.itemName} (${r.previousQty} -> ${r.remainingQty}): ${r.voidReason || r.note || ''}`
        : r.voidReason || r.note || ''
      const amountVal = r.isVoidLog
        ? `-${(r.totalAmount || r.total || 0).toFixed(2)}`
        : r.status === 'REFUNDED'
        ? `-${(r.total || 0).toFixed(2)}`
        : (r.total || 0).toFixed(2)

      return [
        `"${r.id}"`,
        `"${r.dailyNumber || ''}"`,
        `"${r.status}"`,
        `"${r.date ? r.date.toLocaleString() : r.createdAt || ''}"`,
        `"${r.source || ''}"`,
        `"${loc}"`,
        `"${reasonText.replace(/"/g, '""')}"`,
        amountVal,
      ].join(',')
    })

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute(
      'download',
      `cancelled_refunded_orders_${targetRestaurantId}_${new Date().toISOString().split('T')[0]}.csv`
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Format Helper
  const formatTime = (d) => {
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '—'
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (d) => {
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '—'
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getRelativeTime = (d) => {
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return ''
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000)
    if (diffSec < 60) return 'Just now'
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
    return `${Math.floor(diffSec / 86400)}d ago`
  }

  return (
    <div className="p-5 sm:p-7 space-y-5 max-w-7xl mx-auto">
      {/* ── Header Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shadow-xs">
            <IconReceiptAudit />
          </div>
          <div>
            <h1 className="text-xl font-bold text-neutral-900 tracking-tight">
              Cancel & Refunded Orders
            </h1>
            <p className="text-xs text-neutral-500">
              Audit trail for voided tickets, refunds and live open tickets
            </p>
          </div>
        </div>

        {/* Live sync & Action buttons */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Live Synced</span>
            {lastUpdated && (
              <span className="text-[10px] text-emerald-600 border-l border-emerald-200 pl-2">
                {formatTime(lastUpdated)}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 transition shadow-2xs disabled:opacity-50"
            title="Refresh from cloud"
          >
            <span className={refreshing ? 'animate-spin' : ''}>
              <IconRefresh />
            </span>
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredRecords.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 transition shadow-2xs disabled:opacity-40"
          >
            <IconDownload />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* ── Top Section: Count Cards with '!' Info Button ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Voided Orders (Click to filter) */}
        <div
          onClick={() => setFilterType((prev) => (prev === 'voided' ? 'all' : 'voided'))}
          className={`p-4 rounded-2xl bg-white border shadow-2xs hover:shadow-xs transition relative cursor-pointer ${
            filterType === 'voided'
              ? 'border-red-500 ring-2 ring-red-500/20 bg-red-50/25'
              : 'border-red-100 hover:border-red-300'
          }`}
          title="Click to filter voided tickets"
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider transition ${
              filterType === 'voided' ? 'text-red-700' : 'text-neutral-500'
            }`}>
              Voided Tickets
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                toggleCardInfo('voided')
              }}
              title="Click for info"
              className={`h-5 w-5 rounded-full flex items-center justify-center font-bold text-xs transition ${
                expandedInfoCard === 'voided'
                  ? 'bg-red-600 text-white'
                  : 'bg-red-50 text-red-600 hover:bg-red-100'
              }`}
            >
              !
            </button>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-red-600">{stats.voidedCount}</span>
            <span className="text-xs text-neutral-400 font-medium">tickets</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-neutral-500 pt-2 border-t border-neutral-100">
            <span>Voided Total:</span>
            <span className="font-bold text-neutral-800">
              {currencySymbol}{stats.voidedAmount.toFixed(2)}
            </span>
          </div>

          {/* Popover / Info Reveal */}
          {expandedInfoCard === 'voided' && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="mt-2 p-2.5 rounded-xl bg-red-50/90 border border-red-200 text-red-900 text-[11px] leading-relaxed animate-fadeIn"
            >
              <strong>Voided Tickets:</strong> Complete tickets soft-deleted in SQLite/Firestore before payment. Revenue is 0. All items and audit reasons are preserved.
            </div>
          )}
        </div>

        {/* Card 2: Item Voids / Reductions (Click to filter) */}
        <div
          onClick={() => setFilterType((prev) => (prev === 'item_voids' ? 'all' : 'item_voids'))}
          className={`p-4 rounded-2xl bg-white border shadow-2xs hover:shadow-xs transition relative cursor-pointer ${
            filterType === 'item_voids'
              ? 'border-purple-500 ring-2 ring-purple-500/20 bg-purple-50/25'
              : 'border-purple-100 hover:border-purple-300'
          }`}
          title="Click to filter item voids"
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider transition ${
              filterType === 'item_voids' ? 'text-purple-700' : 'text-neutral-500'
            }`}>
              Item Voids
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                toggleCardInfo('item_voids')
              }}
              title="Click for info"
              className={`h-5 w-5 rounded-full flex items-center justify-center font-bold text-xs transition ${
                expandedInfoCard === 'item_voids'
                  ? 'bg-purple-600 text-white'
                  : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
              }`}
            >
              !
            </button>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-purple-600">{stats.itemVoidCount}</span>
            <span className="text-xs text-neutral-400 font-medium">items</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-neutral-500 pt-2 border-t border-neutral-100">
            <span>Lost Value:</span>
            <span className="font-bold text-purple-700">
              -{currencySymbol}{stats.itemVoidAmount.toFixed(2)}
            </span>
          </div>

          {/* Popover / Info Reveal */}
          {expandedInfoCard === 'item_voids' && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="mt-2 p-2.5 rounded-xl bg-purple-50/90 border border-purple-200 text-purple-900 text-[11px] leading-relaxed animate-fadeIn"
            >
              <strong>Item Voids:</strong> Individual items deleted or reduced from saved tickets. Tracks previous qty, remaining qty, unit price, and manager void reason.
            </div>
          )}
        </div>

        {/* Card 3: Refunded Orders (Click to filter) */}
        <div
          onClick={() => setFilterType((prev) => (prev === 'refunded' ? 'all' : 'refunded'))}
          className={`p-4 rounded-2xl bg-white border shadow-2xs hover:shadow-xs transition relative cursor-pointer ${
            filterType === 'refunded'
              ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/25'
              : 'border-amber-100 hover:border-amber-300'
          }`}
          title="Click to filter refunded orders"
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider transition ${
              filterType === 'refunded' ? 'text-amber-700' : 'text-neutral-500'
            }`}>
              Refunded Orders
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                toggleCardInfo('refunded')
              }}
              title="Click for info"
              className={`h-5 w-5 rounded-full flex items-center justify-center font-bold text-xs transition ${
                expandedInfoCard === 'refunded'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
              }`}
            >
              !
            </button>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-amber-600">{stats.refundedCount}</span>
            <span className="text-xs text-neutral-400 font-medium">refunds</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-neutral-500 pt-2 border-t border-neutral-100">
            <span>Refunded Total:</span>
            <span className="font-bold text-amber-700">
              -{currencySymbol}{stats.refundedAmount.toFixed(2)}
            </span>
          </div>

          {/* Popover / Info Reveal */}
          {expandedInfoCard === 'refunded' && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="mt-2 p-2.5 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-[11px] leading-relaxed animate-fadeIn"
            >
              <strong>Refund:</strong> Issued after a customer has paid. Returned funds reduce daily sales and net revenue.
            </div>
          )}
        </div>

        {/* Card 4: Open Tickets (Tap to view Tables Grid) */}
        <div
          onClick={() => setShowTablesModal(true)}
          className="p-4 rounded-2xl bg-white border border-blue-100 shadow-2xs hover:shadow-md hover:border-blue-300 transition relative cursor-pointer group"
          title="Click to view Tables Grid"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 group-hover:text-blue-600 transition">
              Open Tickets
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                toggleCardInfo('open')
              }}
              title="Click for info"
              className={`h-5 w-5 rounded-full flex items-center justify-center font-bold text-xs transition ${
                expandedInfoCard === 'open'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              }`}
            >
              !
            </button>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-blue-600">{stats.openCount}</span>
            <span className="text-xs text-neutral-400 font-medium">active</span>
            {occupiedTableCount > 0 && (
              <span className="ml-auto text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-md">
                {occupiedTableCount} table{occupiedTableCount > 1 ? 's' : ''} open
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-neutral-500 pt-2 border-t border-neutral-100">
            <span>Pending Total:</span>
            <span className="font-bold text-blue-800">
              {currencySymbol}{stats.openAmount.toFixed(2)}
            </span>
          </div>

          {/* Popover / Info Reveal */}
          {expandedInfoCard === 'open' && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="mt-2 p-2.5 rounded-xl bg-blue-50/90 border border-blue-200 text-blue-900 text-[11px] leading-relaxed animate-fadeIn"
            >
              <strong>Open Tickets:</strong> Currently ongoing tickets synced from tables & rooms. Tap card to view live tables grid and see occupied tables.
            </div>
          )}
        </div>
      </div>

      {/* ── Filters Bar ── */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 p-3.5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-neutral-100/90 rounded-xl">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filterType === 'all'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              All ({allCombinedRecords.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('voided')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filterType === 'voided'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <span>Voided Tickets</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                filterType === 'voided' ? 'bg-red-700 text-white' : 'bg-neutral-200 text-neutral-700'
              }`}>
                {stats.voidedCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFilterType('item_voids')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filterType === 'item_voids'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <span>Item Voids</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                filterType === 'item_voids' ? 'bg-purple-700 text-white' : 'bg-neutral-200 text-neutral-700'
              }`}>
                {stats.itemVoidCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFilterType('refunded')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filterType === 'refunded'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <span>Refunded</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                filterType === 'refunded' ? 'bg-amber-700 text-white' : 'bg-neutral-200 text-neutral-700'
              }`}>
                {stats.refundedCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFilterType('open')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filterType === 'open'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <span>Open Tickets</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                filterType === 'open' ? 'bg-blue-700 text-white' : 'bg-neutral-200 text-neutral-700'
              }`}>
                {stats.openCount}
              </span>
            </button>
          </div>

          {/* Date range picker */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="text-xs font-semibold px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="custom">Custom Range</option>
            </select>

            {dateFilter === 'custom' && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="text-xs p-1.5 border border-neutral-200 rounded-lg text-neutral-700"
                />
                <span className="text-xs text-neutral-400">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="text-xs p-1.5 border border-neutral-200 rounded-lg text-neutral-700"
                />
              </div>
            )}
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
            <IconSearch />
          </span>
          <input
            type="text"
            placeholder="Search by Ticket #, Reason / Note, Table #, Room #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-neutral-900 placeholder:text-neutral-400 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-600 text-xs"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Table View with 10 Records Pagination ── */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-10 text-center space-y-2">
            <div className="inline-block animate-spin h-7 w-7 border-3 border-emerald-500 border-t-transparent rounded-full"></div>
            <p className="text-xs font-semibold text-neutral-700">Loading orders from cloud...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600 space-y-2">
            <IconAlertTriangle />
            <p className="text-xs font-bold">{error}</p>
            <button
              onClick={() => loadData(true)}
              className="px-3.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-xs rounded-xl"
            >
              Retry
            </button>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <div className="mx-auto w-10 h-10 rounded-xl bg-neutral-100 text-neutral-400 flex items-center justify-center">
              <IconReceiptAudit />
            </div>
            <h3 className="text-sm font-bold text-neutral-800">No records found</h3>
            <p className="text-xs text-neutral-500 max-w-xs mx-auto">
              There are no cancelled, refunded, or open tickets matching current filters.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50/70 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                    <th className="py-3 px-4">Ticket</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4">Reason / Note</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 text-xs">
                  {paginatedRecords.map((record) => {
                    const isVoidLog = record.isVoidLog || record.status === 'ITEM_VOID'
                    const isVoided = record.status === 'VOIDED' || record.status === 'CANCELLED'
                    const isRefunded = record.status === 'REFUNDED'
                    const isOpen = record.status === 'OPEN'

                    return (
                      <tr
                        key={record.id}
                        className="hover:bg-neutral-50/70 transition cursor-pointer"
                        onClick={() => setSelectedRecord(record)}
                      >
                        {/* Ticket # */}
                        <td className="py-3.5 px-4 font-mono font-bold text-neutral-900">
                          <span>{record.displayId || `#${record.id.slice(0, 8)}`}</span>
                          <span className={`text-[10px] font-sans block ${
                            isVoidLog ? 'text-purple-600 font-semibold' : 'text-neutral-400 font-normal'
                          }`}>
                            {isVoidLog ? 'Item Reduction' : getRelativeTime(record.date)}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          {isVoidLog && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                              <IconAlertTriangle />
                              <span>ITEM VOID</span>
                            </span>
                          )}
                          {isVoided && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">
                              <IconVoid />
                              <span>VOIDED</span>
                            </span>
                          )}
                          {isRefunded && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                              <IconRefund />
                              <span>REFUNDED</span>
                            </span>
                          )}
                          {isOpen && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse"></span>
                              <span>OPEN</span>
                            </span>
                          )}
                        </td>

                        {/* Date & Time */}
                        <td className="py-3.5 px-4 text-neutral-600">
                          <div className="font-semibold text-neutral-800">{formatDate(record.date)}</div>
                          <div className="text-[10px] text-neutral-400">{formatTime(record.date)}</div>
                        </td>

                        {/* Location */}
                        <td className="py-3.5 px-4 text-neutral-700">
                          <div className="font-semibold text-neutral-900">
                            {record.tableNumber
                              ? `Table #${record.tableNumber}`
                              : record.roomNumber
                              ? `Room #${record.roomNumber}`
                              : record.source || 'Counter'}
                          </div>
                        </td>

                        {/* Reason / Note / Item info */}
                        <td className="py-3.5 px-4 max-w-xs">
                          {isVoidLog ? (
                            <div>
                              <div className="font-bold text-neutral-900 text-xs flex items-center gap-1 flex-wrap">
                                <span className="text-purple-700 font-extrabold">{record.qtyVoided}x</span>
                                <span className="text-neutral-900">{record.itemName}</span>
                                <span className="text-[10px] text-neutral-500 font-normal bg-neutral-100 px-1.5 py-0.5 rounded">
                                  {record.previousQty} → {record.remainingQty}
                                </span>
                              </div>
                              <div className="text-[11px] text-neutral-500 truncate mt-0.5">
                                Reason: <span className="text-neutral-700 font-medium">{record.voidReason || 'Item reduced in cart'}</span>
                              </div>
                            </div>
                          ) : record.voidReason ? (
                            <div className="inline-block bg-red-50 text-red-700 px-2.5 py-0.5 rounded-md text-[11px] font-medium truncate max-w-full">
                              {record.voidReason}
                            </div>
                          ) : record.note ? (
                            <div className="inline-block bg-neutral-100 text-neutral-700 px-2.5 py-0.5 rounded-md text-[11px] font-medium truncate max-w-full">
                              {record.note}
                            </div>
                          ) : (
                            <span className="text-neutral-400 italic text-[11px]">—</span>
                          )}
                        </td>

                        {/* Amount */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {isVoidLog && (
                            <div>
                              <span className="font-bold font-mono text-purple-700 text-sm">
                                -{currencySymbol}
                                {(record.totalAmount || record.total || 0).toFixed(2)}
                              </span>
                              <div className="text-[10px] text-neutral-400 font-mono">
                                {record.qtyVoided} × {currencySymbol}{Number(record.unitPrice || 0).toFixed(2)}
                              </div>
                            </div>
                          )}
                          {isVoided && (
                            <div>
                              <span className="line-through text-neutral-400 font-mono text-xs">
                                {currencySymbol}
                                {record.total?.toFixed(2)}
                              </span>
                              <div className="text-[10px] font-bold text-red-600">
                                0 Net
                              </div>
                            </div>
                          )}
                          {isRefunded && (
                            <div>
                              <span className="font-bold font-mono text-amber-700 text-sm">
                                -{currencySymbol}
                                {record.total?.toFixed(2)}
                              </span>
                            </div>
                          )}
                          {isOpen && (
                            <div>
                              <span className="font-bold font-mono text-blue-700 text-sm">
                                {currencySymbol}
                                {record.total?.toFixed(2)}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Action */}
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedRecord(record)
                            }}
                            className="px-2.5 py-1 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold text-[11px] transition"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Pagination Footer (10 Records per page) ── */}
            <div className="p-3.5 bg-neutral-50/80 border-t border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="text-neutral-500 text-[11px]">
                Showing{' '}
                <span className="font-bold text-neutral-800">
                  {filteredRecords.length > 0 ? (safeCurrentPage - 1) * PAGE_SIZE + 1 : 0}
                </span>{' '}
                to{' '}
                <span className="font-bold text-neutral-800">
                  {Math.min(safeCurrentPage * PAGE_SIZE, filteredRecords.length)}
                </span>{' '}
                of <span className="font-bold text-neutral-800">{filteredRecords.length}</span> records
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1.5 self-center sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safeCurrentPage === 1}
                    className="px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 font-semibold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition shadow-2xs"
                  >
                    Previous
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((page) => {
                        // Show current, edges, and neighbors
                        return (
                          page === 1 ||
                          page === totalPages ||
                          Math.abs(page - safeCurrentPage) <= 1
                        )
                      })
                      .map((page, idx, arr) => {
                        const prevPage = arr[idx - 1]
                        const showEllipsis = prevPage && page - prevPage > 1

                        return (
                          <div key={page} className="flex items-center">
                            {showEllipsis && (
                              <span className="px-1 text-neutral-400">...</span>
                            )}
                            <button
                              type="button"
                              onClick={() => setCurrentPage(page)}
                              className={`h-7 w-7 rounded-lg text-xs font-bold transition ${
                                safeCurrentPage === page
                                  ? 'bg-neutral-900 text-white'
                                  : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                              }`}
                            >
                              {page}
                            </button>
                          </div>
                        )
                      })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safeCurrentPage === totalPages}
                    className="px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 font-semibold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition shadow-2xs"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Tables Grid Popup Modal ── */}
      {showTablesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-neutral-200 max-h-[85vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70">
              <div className="flex items-center gap-2.5">
                <h3 className="font-bold text-base text-neutral-900">
                  Tables
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-neutral-200/70 text-neutral-700">
                  {occupiedTableCount} / {totalTables}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Filter occupied only vs all */}
                <div className="flex items-center p-0.5 bg-neutral-200/60 rounded-xl text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setTableModalFilter('all')}
                    className={`px-3 py-1 rounded-lg transition ${
                      tableModalFilter === 'all'
                        ? 'bg-white text-neutral-900 shadow-xs'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    All ({totalTables})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableModalFilter('occupied')}
                    className={`px-3 py-1 rounded-lg transition ${
                      tableModalFilter === 'occupied'
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    Occupied ({occupiedTableCount})
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowTablesModal(false)}
                  className="p-1.5 rounded-xl hover:bg-neutral-200 text-neutral-400 hover:text-neutral-700 transition ml-1"
                >
                  <IconX />
                </button>
              </div>
            </div>

            {/* Grid Body */}
            <div className="p-5 overflow-y-auto space-y-5">
              {/* Tables Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {tableNumbers
                  .filter((tableNum) => {
                    if (tableModalFilter === 'occupied') {
                      return openTicketsByTable.has(String(tableNum))
                    }
                    return true
                  })
                  .map((tableNum) => {
                    const ticketsForTable = openTicketsByTable.get(String(tableNum)) || []
                    const hasOpenTicket = ticketsForTable.length > 0
                    const firstTicket = hasOpenTicket ? ticketsForTable[0] : null
                    const tableTotal = ticketsForTable.reduce(
                      (sum, t) => sum + Number(t.total || 0),
                      0
                    )

                    if (hasOpenTicket) {
                      return (
                        <div
                          key={tableNum}
                          onClick={() => {
                            setActiveTicketTab('all')
                            setSelectedRecord({
                              isTableGroup: true,
                              tableNumber: String(tableNum),
                              tickets: ticketsForTable,
                              total: tableTotal,
                              status: 'OPEN',
                            })
                          }}
                          className="p-3.5 rounded-2xl bg-red-50 border-2 border-red-500 shadow-2xs hover:shadow-md cursor-pointer transition flex flex-col justify-between min-h-[95px] text-left group"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-sm text-red-950">
                              Table {tableNum}
                            </span>
                            <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse"></span>
                          </div>

                          <div className="my-1">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white">
                              {ticketsForTable.length > 1
                                ? `${ticketsForTable.length} Tickets`
                                : firstTicket.displayId}
                            </span>
                          </div>

                          <div className="pt-1.5 border-t border-red-200/80 flex items-center justify-end">
                            <span className="font-mono font-extrabold text-red-950 text-sm">
                              {currencySymbol}{tableTotal.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div
                        key={tableNum}
                        className="p-3.5 rounded-2xl bg-neutral-50/70 border border-neutral-200/70 flex flex-col justify-between min-h-[95px] text-left opacity-60"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-neutral-600">
                            Table {tableNum}
                          </span>
                          <span className="h-1.5 w-1.5 rounded-full bg-neutral-300"></span>
                        </div>
                        <span className="text-xs text-neutral-400">Available</span>
                        <div></div>
                      </div>
                    )
                  })}
              </div>

              {/* Room Service & Counter Open Tickets (if any) */}
              {nonTableOpenTickets.length > 0 && (
                <div className="pt-3 border-t border-neutral-100 space-y-2">
                  <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                    Other Open Tickets ({nonTableOpenTickets.length})
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {nonTableOpenTickets.map((ticket) => (
                      <div
                        key={ticket.id}
                        onClick={() => setSelectedRecord(ticket)}
                        className="p-3.5 rounded-2xl bg-red-50 border-2 border-red-500 shadow-2xs hover:shadow-md cursor-pointer transition flex flex-col justify-between min-h-[95px] text-left"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-red-950 truncate">
                            {ticket.roomNumber ? `Room ${ticket.roomNumber}` : ticket.source || 'Counter'}
                          </span>
                          <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse"></span>
                        </div>
                        <div className="my-1">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white">
                            {ticket.displayId}
                          </span>
                        </div>
                        <div className="pt-1.5 border-t border-red-200/80 flex items-center justify-end">
                          <span className="font-mono font-extrabold text-red-950 text-sm">
                            {currencySymbol}{ticket.total?.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-neutral-50 border-t border-neutral-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowTablesModal(false)}
                className="px-4 py-1.5 rounded-xl bg-neutral-900 text-white font-semibold text-xs hover:bg-neutral-800 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Receipt Modal (Rendered on top with z-[70]) ── */}
      {selectedRecord && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-neutral-200 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/80">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-xl text-white ${
                    selectedRecord.isVoidLog || selectedRecord.status === 'ITEM_VOID'
                      ? 'bg-purple-600'
                      : selectedRecord.status === 'VOIDED'
                      ? 'bg-red-600'
                      : selectedRecord.status === 'REFUNDED'
                      ? 'bg-amber-600'
                      : 'bg-blue-600'
                  }`}
                >
                  <IconReceiptAudit />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-neutral-900">
                    {selectedRecord.isTableGroup
                      ? `Table #${selectedRecord.tableNumber}`
                      : selectedRecord.isVoidLog || selectedRecord.status === 'ITEM_VOID'
                      ? `Item Void — Ticket ${selectedRecord.displayId}`
                      : `Order ${selectedRecord.displayId}`}
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    {selectedRecord.isTableGroup
                      ? `${selectedRecord.tickets?.length || 0} Open ${
                          (selectedRecord.tickets?.length || 0) === 1 ? 'Ticket' : 'Tickets'
                        }`
                      : `${formatDate(selectedRecord.date)} at ${formatTime(selectedRecord.date)}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedRecord(null)
                  setActiveTicketTab('all')
                }}
                className="p-1.5 rounded-xl hover:bg-neutral-200 text-neutral-400 hover:text-neutral-700 transition"
              >
                <IconX />
              </button>
            </div>

            {/* If table group with multiple tickets: tabs bar */}
            {selectedRecord.isTableGroup && (selectedRecord.tickets?.length || 0) > 1 && (
              <div className="flex items-center gap-1.5 px-4 py-2 border-b border-neutral-100 bg-neutral-50/60 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setActiveTicketTab('all')}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition whitespace-nowrap ${
                    activeTicketTab === 'all'
                      ? 'bg-neutral-900 text-white shadow-2xs'
                      : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-100'
                  }`}
                >
                  All Tickets ({selectedRecord.tickets.length})
                </button>
                {selectedRecord.tickets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTicketTab(t.id)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition whitespace-nowrap ${
                      activeTicketTab === t.id
                        ? 'bg-red-600 text-white shadow-2xs'
                        : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-100'
                    }`}
                  >
                    {t.displayId} ({currencySymbol}{Number(t.total || 0).toFixed(0)})
                  </button>
                ))}
              </div>
            )}

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {selectedRecord.isTableGroup ? (
                // ── TABLE GROUP (Displays all tickets for table) ──
                <div className="space-y-4">
                  {(
                    activeTicketTab === 'all' ||
                    !selectedRecord.tickets.some((t) => t.id === activeTicketTab)
                      ? selectedRecord.tickets
                      : selectedRecord.tickets.filter((t) => t.id === activeTicketTab)
                  ).map((ticket, tIdx) => {
                    const ticketVoidLogs = getTicketVoidLogs(ticket)
                    return (
                      <div
                        key={ticket.id || tIdx}
                        className="p-3.5 bg-neutral-50/80 rounded-2xl border border-neutral-200/80 space-y-3"
                      >
                        {/* Ticket header */}
                        <div className="flex items-center justify-between pb-2 border-b border-neutral-200/60">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-neutral-900 text-white font-mono">
                              {ticket.displayId}
                            </span>
                            <span className="text-[11px] text-neutral-500">
                              {formatDate(ticket.date)} at {formatTime(ticket.date)}
                            </span>
                          </div>
                          <span className="font-mono font-extrabold text-neutral-900 text-sm">
                            {currencySymbol}{Number(ticket.total || 0).toFixed(2)}
                          </span>
                        </div>

                        {/* Note / Reason if any */}
                        {(ticket.voidReason || ticket.note) && (
                          <div className="p-2.5 bg-red-50/80 border border-red-200 rounded-xl">
                            <span className="text-[10px] text-red-600 font-bold uppercase block mb-0.5">
                              Audit Note / Reason
                            </span>
                            <p className="font-medium text-red-900 text-xs">
                              {ticket.voidReason || ticket.note}
                            </p>
                          </div>
                        )}

                        {/* Active Items */}
                        {ticket.items && ticket.items.length > 0 ? (
                          <div className="rounded-xl border border-neutral-200 divide-y divide-neutral-100 overflow-hidden bg-white">
                            {ticket.items.map((item, idx) => (
                              <div
                                key={idx}
                                className="p-2.5 flex justify-between items-center text-xs"
                              >
                                <div>
                                  <span className="font-bold text-neutral-800">
                                    {item.qty || item.quantity || 1}x{' '}
                                  </span>
                                  <span className="text-neutral-900">{item.name || 'Item'}</span>
                                </div>
                                <span className="font-mono font-semibold text-neutral-700">
                                  {currencySymbol}
                                  {(
                                    (item.price || 0) * (item.qty || item.quantity || 1)
                                  ).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-neutral-400 italic">
                            No item details recorded
                          </p>
                        )}

                        {/* VOIDED / REMOVED ITEMS FOR THIS TICKET (IF ANY) */}
                        {ticketVoidLogs.length > 0 && (
                          <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-xl space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800 flex items-center gap-1">
                                <IconAlertTriangle />
                                Voided / Removed Items ({ticketVoidLogs.length})
                              </span>
                              <span className="text-[10px] font-mono font-bold text-purple-700">
                                -{currencySymbol}
                                {ticketVoidLogs
                                  .reduce((sum, l) => sum + Number(l.totalAmount || 0), 0)
                                  .toFixed(2)}
                              </span>
                            </div>
                            <div className="divide-y divide-purple-100 bg-white rounded-lg border border-purple-200/70 overflow-hidden">
                              {ticketVoidLogs.map((log) => (
                                <div key={log.id} className="p-2 text-xs flex justify-between items-start gap-2">
                                  <div>
                                    <div className="font-bold text-neutral-900 text-[11px]">
                                      <span className="text-purple-700 font-extrabold">{log.qtyVoided}x </span>
                                      {log.itemName}
                                      <span className="text-[10px] text-neutral-400 ml-1.5 font-normal">
                                        ({log.previousQty} → {log.remainingQty})
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-purple-700 mt-0.5">
                                      Reason: {log.voidReason}
                                    </p>
                                  </div>
                                  <span className="font-mono font-semibold text-purple-700 text-xs whitespace-nowrap">
                                    -{currencySymbol}{Number(log.totalAmount || 0).toFixed(2)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Combined Total Summary */}
                  <div className="flex justify-between items-baseline pt-3 border-t border-neutral-200">
                    <div>
                      <span className="font-bold text-sm text-neutral-900">
                        {activeTicketTab === 'all' && selectedRecord.tickets.length > 1
                          ? 'Combined Table Total:'
                          : 'Ticket Total:'}
                      </span>
                      {activeTicketTab === 'all' && selectedRecord.tickets.length > 1 && (
                        <span className="text-[11px] text-neutral-500 ml-1.5 font-medium">
                          ({selectedRecord.tickets.length} tickets)
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-base font-extrabold text-neutral-900">
                      {currencySymbol}
                      {(activeTicketTab === 'all'
                        ? selectedRecord.total
                        : selectedRecord.tickets.find((t) => t.id === activeTicketTab)?.total || 0
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>
              ) : selectedRecord.isVoidLog || selectedRecord.status === 'ITEM_VOID' ? (
                // ── DEDICATED ITEM VOID AUDIT MODAL ──
                <div className="space-y-4">
                  {/* Meta Info */}
                  <div className="grid grid-cols-2 gap-2.5 p-3 bg-purple-50/70 rounded-xl border border-purple-200 text-[11px]">
                    <div>
                      <span className="text-purple-400 block">Location</span>
                      <span className="font-bold text-purple-900">
                        {selectedRecord.tableNumber
                          ? `Table #${selectedRecord.tableNumber}`
                          : selectedRecord.roomNumber
                          ? `Room #${selectedRecord.roomNumber}`
                          : selectedRecord.source || 'Counter'}
                      </span>
                    </div>
                    <div>
                      <span className="text-purple-400 block">Action</span>
                      <span className="font-bold text-purple-900">ITEM REDUCTION</span>
                    </div>
                    {selectedRecord.ticketId && (
                      <div className="col-span-2 pt-1.5 border-t border-purple-100 flex items-center justify-between text-[10px] text-purple-600 font-mono">
                        <span>Ticket ID: {selectedRecord.ticketId}</span>
                        {selectedRecord.dailyNumber && <span>Sequence: #{selectedRecord.dailyNumber}</span>}
                      </div>
                    )}
                  </div>

                  {/* Item Details Box */}
                  <div className="p-3.5 bg-white rounded-2xl border border-purple-200 shadow-2xs space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider block">
                          Voided Item
                        </span>
                        <h4 className="font-extrabold text-base text-neutral-900 mt-0.5">
                          {selectedRecord.qtyVoided}x {selectedRecord.itemName}
                        </h4>
                      </div>
                      <span className="font-mono font-extrabold text-lg text-purple-700">
                        -{currencySymbol}{Number(selectedRecord.totalAmount || selectedRecord.total || 0).toFixed(2)}
                      </span>
                    </div>

                    <div className="p-2.5 bg-neutral-50 rounded-xl space-y-1.5 text-xs text-neutral-700">
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Quantity Reduction:</span>
                        <span className="font-bold">
                          {selectedRecord.previousQty} (Original) → {selectedRecord.remainingQty} (Remaining)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Unit Price:</span>
                        <span className="font-mono font-semibold">
                          {currencySymbol}{Number(selectedRecord.unitPrice || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-neutral-200 pt-1.5">
                        <span className="font-bold text-neutral-900">Lost Total:</span>
                        <span className="font-mono font-bold text-purple-700">
                          {selectedRecord.qtyVoided} × {currencySymbol}{Number(selectedRecord.unitPrice || 0).toFixed(2)} = {currencySymbol}{Number(selectedRecord.totalAmount || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Void Reason */}
                  <div className="p-3 bg-red-50/80 border border-red-200 rounded-xl">
                    <span className="text-[10px] text-red-600 font-bold uppercase block mb-1">
                      Manager / Cashier Void Reason
                    </span>
                    <p className="font-semibold text-red-900 text-xs">
                      {selectedRecord.voidReason || selectedRecord.note || 'Item reduced in cart'}
                    </p>
                  </div>
                </div>
              ) : (
                // ── STANDARD ORDER / TICKET VIEW ──
                <>
                  {/* Meta info */}
                  <div className="grid grid-cols-2 gap-2.5 p-3 bg-neutral-50 rounded-xl border border-neutral-100 text-[11px]">
                    <div>
                      <span className="text-neutral-400 block">Location</span>
                      <span className="font-bold text-neutral-800">
                        {selectedRecord.tableNumber
                          ? `Table #${selectedRecord.tableNumber}`
                          : selectedRecord.roomNumber
                          ? `Room #${selectedRecord.roomNumber}`
                          : selectedRecord.source || 'Counter'}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block">Status</span>
                      <span className="font-bold text-neutral-800">{selectedRecord.status}</span>
                    </div>
                  </div>

                  {/* Reason / Note */}
                  {(selectedRecord.voidReason || selectedRecord.note) && (
                    <div className="p-3 bg-red-50/80 border border-red-200 rounded-xl">
                      <span className="text-[10px] text-red-600 font-bold uppercase block mb-1">
                        Audit Note / Reason
                      </span>
                      <p className="font-medium text-red-900 text-xs">
                        {selectedRecord.voidReason || selectedRecord.note}
                      </p>
                    </div>
                  )}

                  {/* Items List */}
                  {selectedRecord.items && selectedRecord.items.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="font-bold text-neutral-700 text-xs block">Order Items</span>
                      <div className="rounded-xl border border-neutral-200 divide-y divide-neutral-100 overflow-hidden">
                        {selectedRecord.items.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 flex justify-between items-center bg-white text-xs"
                          >
                            <div>
                              <span className="font-bold text-neutral-800">
                                {item.qty || item.quantity || 1}x{' '}
                              </span>
                              <span className="text-neutral-900">{item.name || 'Item'}</span>
                            </div>
                            <span className="font-mono font-semibold text-neutral-700">
                              {currencySymbol}
                              {(
                                (item.price || 0) * (item.qty || item.quantity || 1)
                              ).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* VOIDED / REMOVED ITEMS SECTION (IF ANY FOR THIS TICKET) */}
                  {(() => {
                    const ticketVoidLogs = getTicketVoidLogs(selectedRecord)
                    if (ticketVoidLogs.length === 0) return null
                    return (
                      <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-purple-800 flex items-center gap-1.5">
                            <IconAlertTriangle />
                            Voided / Removed Items ({ticketVoidLogs.length})
                          </span>
                          <span className="text-[11px] font-mono font-bold text-purple-700">
                            Lost: -{currencySymbol}
                            {ticketVoidLogs
                              .reduce((sum, l) => sum + Number(l.totalAmount || 0), 0)
                              .toFixed(2)}
                          </span>
                        </div>
                        <div className="divide-y divide-purple-100 bg-white rounded-lg border border-purple-200/70 overflow-hidden">
                          {ticketVoidLogs.map((log) => (
                            <div key={log.id} className="p-2.5 text-xs flex justify-between items-start gap-2">
                              <div>
                                <div className="font-bold text-neutral-900">
                                  <span className="text-purple-700 font-extrabold">{log.qtyVoided}x </span>
                                  {log.itemName}
                                  <span className="text-[10px] text-neutral-400 ml-1.5 font-normal">
                                    ({log.previousQty} → {log.remainingQty})
                                  </span>
                                </div>
                                <p className="text-[11px] text-purple-700 mt-0.5">
                                  Reason: {log.voidReason}
                                </p>
                                <span className="text-[10px] text-neutral-400">
                                  {formatTime(log.date)}
                                </span>
                              </div>
                              <span className="font-mono font-semibold text-purple-700 whitespace-nowrap">
                                -{currencySymbol}{Number(log.totalAmount || 0).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Total */}
                  <div className="flex justify-between items-baseline pt-3 border-t border-neutral-200">
                    <span className="font-bold text-sm text-neutral-900">Total:</span>
                    <span className="font-mono text-base font-extrabold text-neutral-900">
                      {currencySymbol}{selectedRecord.total?.toFixed(2)}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-neutral-50 border-t border-neutral-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setSelectedRecord(null)
                  setActiveTicketTab('all')
                }}
                className="px-4 py-1.5 rounded-xl bg-neutral-900 text-white font-semibold text-xs hover:bg-neutral-800 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
