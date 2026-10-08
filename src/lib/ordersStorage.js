import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  onSnapshot,
} from 'firebase/firestore'
import { db as defaultDb, isFirebaseConfigured } from './firebase'
import { getBackupFirestore, isBackupDbConfigured } from './inventoryStorage'
import { normalizeOrderDate, toLocalISOString } from './analyticsStorage'

/**
 * Returns the preferred Firestore instance (custom backup db or default Firebase db).
 */
export const getActiveFirestoreInstance = (backupConfig) => {
  if (backupConfig && isBackupDbConfigured(backupConfig)) {
    const backupDb = getBackupFirestore(backupConfig)
    if (backupDb) return backupDb
  }
  return defaultDb
}

/**
 * Normalizes an open ticket or archived order item into a standard structure.
 */
export const normalizeOrderRecord = (docData, fallbackId = '') => {
  if (!docData || typeof docData !== 'object') return null

  const id =
    docData.id ??
    docData.ticketId ??
    docData.orderId ??
    fallbackId ??
    `record_${Math.random().toString(36).slice(2, 8)}`

  const statusRaw = String(docData.status || 'OPEN').trim().toUpperCase()
  let status = statusRaw
  if (statusRaw === 'CANCEL' || statusRaw === 'CANCELLED') status = 'VOIDED'

  const rawDate = normalizeOrderDate(docData)
  const items = Array.isArray(docData.items) ? docData.items : []

  // Calculate or verify total
  let total = Number(docData.total ?? 0)
  if (isNaN(total)) total = 0

  return {
    ...docData,
    id: String(id),
    dailyNumber: docData.dailyNumber != null ? String(docData.dailyNumber) : null,
    displayId: docData.dailyNumber ? `#${docData.dailyNumber}` : `#${id}`,
    status,
    total,
    date: rawDate,
    createdAt: docData.createdAt || (rawDate ? rawDate.toISOString() : null),
    updatedAt: docData.updatedAt || docData.backedUpAt || null,
    source: docData.source || 'COUNTER',
    paymentMethod: docData.paymentMethod || null,
    tableNumber: docData.tableNumber != null ? String(docData.tableNumber) : null,
    roomNumber: docData.roomNumber != null ? String(docData.roomNumber) : null,
    orderType: docData.orderType || null,
    note: docData.note || '',
    voidReason: docData.voidReason || (docData.note && docData.note.toLowerCase().includes('void') ? docData.note : ''),
    items,
    itemCount: items.reduce((sum, item) => sum + (Number(item.qty || item.quantity) || 1), 0),
    cardFeeAmount: Number(docData.cardFeeAmount || 0),
    serviceFeeAmount: Number(docData.serviceFeeAmount || 0),
  }
}

/**
 * Fetches real-time open tickets from Firestore:
 * Primary path: restaurants/{restaurantId}/open_tickets
 * Fallback paths: backup/{restaurantId}/open_tickets, {restaurantId}/open_tickets
 */
export const fetchOpenTickets = async (restaurantId, backupConfig = null) => {
  if (!restaurantId) return []
  const firestoreDb = getActiveFirestoreInstance(backupConfig)
  if (!firestoreDb) return []

  const ticketsMap = new Map()

  const candidateCollections = [
    collection(firestoreDb, 'restaurants', restaurantId, 'open_tickets'),
    collection(firestoreDb, 'backup', restaurantId, 'open_tickets'),
  ]

  for (const colRef of candidateCollections) {
    try {
      const snap = await getDocs(colRef)
      if (!snap.empty) {
        snap.forEach((docSnap) => {
          const norm = normalizeOrderRecord(docSnap.data(), docSnap.id)
          if (norm && norm.status === 'OPEN' && !ticketsMap.has(norm.id)) {
            ticketsMap.set(norm.id, norm)
          }
        })
      }
    } catch (err) {
      // Continue to fallback collections
    }
  }

  // Also check if primary restaurant doc has open_tickets array
  try {
    const parentDocRef = doc(firestoreDb, 'restaurants', restaurantId)
    const parentSnap = await getDoc(parentDocRef)
    if (parentSnap.exists()) {
      const data = parentSnap.data()
      if (Array.isArray(data.open_tickets)) {
        data.open_tickets.forEach((t, i) => {
          const norm = normalizeOrderRecord(t, `doc_open_${i}`)
          if (norm && norm.status === 'OPEN' && !ticketsMap.has(norm.id)) {
            ticketsMap.set(norm.id, norm)
          }
        })
      }
    }
  } catch (err) {
    // Ignore
  }

  return Array.from(ticketsMap.values()).sort((a, b) => {
    const timeA = a.date ? a.date.getTime() : 0
    const timeB = b.date ? b.date.getTime() : 0
    return timeB - timeA
  })
}

/**
 * Sets up a real-time listener for open tickets.
 * Subscribes to: restaurants/{restaurantId}/open_tickets
 */
export const subscribeToOpenTickets = (restaurantId, onUpdate, onError, backupConfig = null) => {
  if (!restaurantId) return () => {}
  const firestoreDb = getActiveFirestoreInstance(backupConfig)
  if (!firestoreDb) return () => {}

  try {
    const colRef = collection(firestoreDb, 'restaurants', restaurantId, 'open_tickets')
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list = []
        snapshot.forEach((docSnap) => {
          const norm = normalizeOrderRecord(docSnap.data(), docSnap.id)
          if (norm && norm.status === 'OPEN') {
            list.push(norm)
          }
        })
        list.sort((a, b) => {
          const timeA = a.date ? a.date.getTime() : 0
          const timeB = b.date ? b.date.getTime() : 0
          return timeB - timeA
        })
        onUpdate(list)
      },
      (err) => {
        if (typeof onError === 'function') onError(err)
        else console.warn('Open tickets live subscription note:', err)
      }
    )
  } catch (err) {
    if (typeof onError === 'function') onError(err)
    return () => {}
  }
}

/**
 * Fetches Voided/Cancelled and Refunded orders from Firestore backup/archive collections.
 * Paths checked:
 * - backup/{restaurantId}/orders
 * - restaurants/{restaurantId}/orders
 * - backups/{restaurantId}/orders
 * - backup/{restaurantId}/sales
 */
export const fetchCancelledAndRefundedOrders = async (
  restaurantId,
  { startDate = null, endDate = null, limitCount = 2000, backupConfig = null } = {}
) => {
  if (!restaurantId) return []
  const firestoreDb = getActiveFirestoreInstance(backupConfig)
  if (!firestoreDb) return []

  const recordsMap = new Map()

  const addRecord = (raw, fallbackId) => {
    const norm = normalizeOrderRecord(raw, fallbackId)
    if (!norm) return
    const status = norm.status
    if (status === 'VOIDED' || status === 'CANCELLED' || status === 'REFUNDED') {
      if (!recordsMap.has(norm.id)) {
        recordsMap.set(norm.id, norm)
      }
    }
  }

  const parseDoc = (data, docId) => {
    if (!data) return
    if (Array.isArray(data.orders)) {
      data.orders.forEach((o, i) => addRecord(o, `${docId}_ord_${i}`))
    } else if (Array.isArray(data.backups)) {
      data.backups.forEach((o, i) => addRecord(o, `${docId}_bk_${i}`))
    } else if (Array.isArray(data.sales)) {
      data.sales.forEach((o, i) => addRecord(o, `${docId}_sl_${i}`))
    } else {
      addRecord(data, docId)
    }
  }

  const startLocalStr = startDate ? toLocalISOString(startDate) : null
  const endLocalStr = endDate ? toLocalISOString(endDate) : null
  const startTs = startDate ? Timestamp.fromDate(startDate) : null
  const endTs = endDate ? Timestamp.fromDate(endDate) : null

  // 1. Single aggregate documents (only if querying all or recent)
  if (!startDate || !endDate) {
    try {
      const mainDocRef = doc(firestoreDb, 'backup', restaurantId)
      const mainSnap = await getDoc(mainDocRef)
      if (mainSnap.exists()) {
        parseDoc(mainSnap.data(), mainSnap.id)
      }
    } catch (err) {
      // Ignore
    }
  }

  // 2. Candidate Subcollections with server-side date bounds to optimize DB reads
  const candidateCollections = [
    collection(firestoreDb, 'backup', restaurantId, 'orders'),
    collection(firestoreDb, 'restaurants', restaurantId, 'orders'),
    collection(firestoreDb, 'backups', restaurantId, 'orders'),
    collection(firestoreDb, 'backup', restaurantId, 'sales'),
    collection(firestoreDb, 'backup', restaurantId, 'void_records'),
    collection(firestoreDb, 'restaurants', restaurantId, 'void_records'),
  ]

  for (const colRef of candidateCollections) {
    try {
      let fetched = false

      // A. Query with local ISO string format used by POS app (e.g. 2026-10-08T07:15:00)
      if (startLocalStr && endLocalStr) {
        try {
          const qStr = query(
            colRef,
            where('createdAt', '>=', startLocalStr),
            where('createdAt', '<=', endLocalStr),
            limit(limitCount)
          )
          const snapStr = await getDocs(qStr)
          if (!snapStr.empty) {
            snapStr.forEach((docSnap) => {
              parseDoc(docSnap.data(), docSnap.id)
            })
            fetched = true
          }
        } catch (e) {
          // May not have index or differs
        }
      }

      // B. Query with Firestore Timestamp bounds
      if (!fetched && startTs && endTs) {
        try {
          const qTs = query(
            colRef,
            where('createdAt', '>=', startTs),
            where('createdAt', '<=', endTs),
            limit(limitCount)
          )
          const snapTs = await getDocs(qTs)
          if (!snapTs.empty) {
            snapTs.forEach((docSnap) => {
              parseDoc(docSnap.data(), docSnap.id)
            })
            fetched = true
          }
        } catch (e) {
          // Timestamp field differs
        }
      }

      // C. Fallback query if no date specified or previous queries didn't match
      if (!fetched && (!startDate || !endDate)) {
        const snap = await getDocs(query(colRef, limit(limitCount)))
        if (!snap.empty) {
          snap.forEach((docSnap) => {
            parseDoc(docSnap.data(), docSnap.id)
          })
        }
      }
    } catch (err) {
      // Continue next collection
    }
  }

  let list = Array.from(recordsMap.values())

  // In-memory date boundary filter
  if (startDate || endDate) {
    list = list.filter((r) => {
      if (!r.date) return true
      if (startDate && r.date < startDate) return false
      if (endDate && r.date > endDate) return false
      return true
    })
  }

  return list.sort((a, b) => {
    const timeA = a.date ? a.date.getTime() : 0
    const timeB = b.date ? b.date.getTime() : 0
    return timeB - timeA
  })
}

/**
 * Real-time listener for newly voided/refunded orders today.
 */
export const subscribeToTodayAuditOrders = (restaurantId, onUpdate, onError, backupConfig = null) => {
  if (!restaurantId) return () => {}
  const firestoreDb = getActiveFirestoreInstance(backupConfig)
  if (!firestoreDb) return () => {}

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const startLocalStr = toLocalISOString(startOfToday)
  const colRef = collection(firestoreDb, 'backup', restaurantId, 'orders')

  let q
  try {
    q = query(colRef, where('createdAt', '>=', startLocalStr))
  } catch {
    try {
      q = query(colRef, limit(200))
    } catch {
      q = colRef
    }
  }

  return onSnapshot(
    q,
    (snapshot) => {
      const records = []
      snapshot.forEach((docSnap) => {
        const data = docSnap.data()
        const norm = normalizeOrderRecord(data, docSnap.id)
        if (norm && (norm.status === 'VOIDED' || norm.status === 'CANCELLED' || norm.status === 'REFUNDED')) {
          records.push(norm)
        }
      })
      onUpdate(records)
    },
    (err) => {
      if (typeof onError === 'function') onError(err)
      else console.warn('Audit orders live listener note:', err)
    }
  )
}

/**
 * Normalizes a void log document into a standard audit record structure.
 * Corresponds to POS void_logs collection: backup/{restaurantId}/void_logs/{logId}
 */
export const normalizeVoidLog = (docData, fallbackId = '') => {
  if (!docData || typeof docData !== 'object') return null

  const id =
    docData.id ??
    docData.logId ??
    fallbackId ??
    `void_log_${Math.random().toString(36).slice(2, 8)}`

  const rawDate = normalizeOrderDate(
    docData.voidedAt || docData.createdAt || docData.timestamp || docData.date
  )

  const qtyVoided = Number(docData.qtyVoided ?? docData.quantityVoided ?? docData.qty ?? 1) || 1
  const unitPrice = Number(docData.unitPrice ?? docData.price ?? 0) || 0
  let totalAmount = Number(docData.totalAmount ?? docData.amount ?? qtyVoided * unitPrice)
  if (isNaN(totalAmount) || totalAmount === 0) {
    totalAmount = qtyVoided * unitPrice
  }

  const dailyNumber = docData.dailyNumber != null ? String(docData.dailyNumber) : null
  const ticketId = docData.ticketId != null ? String(docData.ticketId) : null

  return {
    ...docData,
    id: String(id),
    ticketId,
    ticketItemId: docData.ticketItemId ? String(docData.ticketItemId) : null,
    dailyNumber,
    displayId: dailyNumber
      ? `#${dailyNumber}`
      : ticketId
      ? `#${ticketId.slice(0, 8)}`
      : `#${String(id).slice(0, 8)}`,
    tableNumber: docData.tableNumber != null ? String(docData.tableNumber) : null,
    roomNumber: docData.roomNumber != null ? String(docData.roomNumber) : null,
    itemName: docData.itemName || docData.name || 'Item',
    itemId: docData.itemId ? String(docData.itemId) : null,
    previousQty: Number(docData.previousQty ?? docData.prevQty ?? 0),
    remainingQty: Number(docData.remainingQty ?? docData.remQty ?? 0),
    qtyVoided,
    unitPrice,
    totalAmount,
    total: totalAmount, // for compatibility with total-based views
    voidReason: docData.voidReason || docData.reason || docData.note || 'Item reduced in cart',
    note: docData.note || docData.voidReason || 'Item reduced in cart',
    voidedAt: rawDate,
    date: rawDate,
    createdAt: docData.createdAt || (rawDate ? rawDate.toISOString() : null),
    status: 'ITEM_VOID',
    source: docData.source || 'POS',
    isVoidLog: true,
  }
}

/**
 * Fetches Void Logs from Firestore.
 * Paths checked:
 * - backup/{restaurantId}/void_logs
 * - restaurants/{restaurantId}/void_logs
 * - backups/{restaurantId}/void_logs
 */
export const fetchVoidLogs = async (
  restaurantId,
  { startDate = null, endDate = null, limitCount = 2000, backupConfig = null } = {}
) => {
  if (!restaurantId) return []
  const firestoreDb = getActiveFirestoreInstance(backupConfig)
  if (!firestoreDb) return []

  const logsMap = new Map()

  const addLog = (raw, fallbackId) => {
    const norm = normalizeVoidLog(raw, fallbackId)
    if (!norm) return
    if (!logsMap.has(norm.id)) {
      logsMap.set(norm.id, norm)
    }
  }

  const parseDoc = (data, docId) => {
    if (!data) return
    if (Array.isArray(data.void_logs)) {
      data.void_logs.forEach((l, i) => addLog(l, `${docId}_vl_${i}`))
    } else if (Array.isArray(data.voidLogs)) {
      data.voidLogs.forEach((l, i) => addLog(l, `${docId}_vl_${i}`))
    } else {
      addLog(data, docId)
    }
  }

  const startLocalStr = startDate ? toLocalISOString(startDate) : null
  const endLocalStr = endDate ? toLocalISOString(endDate) : null

  // 1. Check parent doc if void_logs array stored there
  if (!startDate || !endDate) {
    try {
      const parentRef = doc(firestoreDb, 'backup', restaurantId)
      const parentSnap = await getDoc(parentRef)
      if (parentSnap.exists()) {
        parseDoc(parentSnap.data(), parentSnap.id)
      }
    } catch {
      // Ignore
    }
  }

  // 2. Subcollections
  const candidateCollections = [
    collection(firestoreDb, 'backup', restaurantId, 'void_logs'),
    collection(firestoreDb, 'restaurants', restaurantId, 'void_logs'),
    collection(firestoreDb, 'backups', restaurantId, 'void_logs'),
  ]

  for (const colRef of candidateCollections) {
    try {
      let fetched = false

      if (startLocalStr && endLocalStr) {
        try {
          const qStr = query(
            colRef,
            where('voidedAt', '>=', startLocalStr),
            where('voidedAt', '<=', endLocalStr),
            limit(limitCount)
          )
          const snapStr = await getDocs(qStr)
          if (!snapStr.empty) {
            snapStr.forEach((docSnap) => parseDoc(docSnap.data(), docSnap.id))
            fetched = true
          }
        } catch {
          // Fallback
        }

        if (!fetched) {
          try {
            const qCreated = query(
              colRef,
              where('createdAt', '>=', startLocalStr),
              where('createdAt', '<=', endLocalStr),
              limit(limitCount)
            )
            const snapCreated = await getDocs(qCreated)
            if (!snapCreated.empty) {
              snapCreated.forEach((docSnap) => parseDoc(docSnap.data(), docSnap.id))
              fetched = true
            }
          } catch {
            // Ignore
          }
        }
      }

      if (!fetched) {
        let q
        try {
          q = query(colRef, limit(limitCount))
        } catch {
          q = colRef
        }
        const snap = await getDocs(q)
        if (!snap.empty) {
          snap.forEach((docSnap) => parseDoc(docSnap.data(), docSnap.id))
        }
      }
    } catch {
      // Continue next collection
    }
  }

  let list = Array.from(logsMap.values())

  if (startDate || endDate) {
    list = list.filter((r) => {
      if (!r.date) return true
      if (startDate && r.date < startDate) return false
      if (endDate && r.date > endDate) return false
      return true
    })
  }

  return list.sort((a, b) => {
    const timeA = a.date ? a.date.getTime() : 0
    const timeB = b.date ? b.date.getTime() : 0
    return timeB - timeA
  })
}

/**
 * Real-time listener for today's void logs.
 */
export const subscribeToTodayVoidLogs = (restaurantId, onUpdate, onError, backupConfig = null) => {
  if (!restaurantId) return () => {}
  const firestoreDb = getActiveFirestoreInstance(backupConfig)
  if (!firestoreDb) return () => {}

  const colRef = collection(firestoreDb, 'backup', restaurantId, 'void_logs')

  let q
  try {
    q = query(colRef, limit(200))
  } catch {
    q = colRef
  }

  return onSnapshot(
    q,
    (snapshot) => {
      const logs = []
      snapshot.forEach((docSnap) => {
        const norm = normalizeVoidLog(docSnap.data(), docSnap.id)
        if (norm) logs.push(norm)
      })
      onUpdate(logs)
    },
    (err) => {
      if (typeof onError === 'function') onError(err)
      else console.warn('Void logs live listener note:', err)
    }
  )
}

