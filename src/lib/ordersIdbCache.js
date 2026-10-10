import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  Timestamp,
} from 'firebase/firestore'
import { normalizeOrderDate, toLocalISOString } from './analyticsStorage'
import { getActiveFirestoreInstance, normalizeVoidLog } from './ordersStorage'

const DB_NAME = 'ikiri_orders_cache_v1'
const DB_VERSION = 2
const STORE_ORDERS = 'orders'
const STORE_META = 'sync_meta'
const STORE_VOID_LOGS = 'void_logs'

let dbPromise = null

/**
 * Checks whether IndexedDB is supported in the current runtime environment.
 */
export const isIdbSupported = () => {
  return typeof window !== 'undefined' && 'indexedDB' in window
}

/**
 * Opens or reuses the IndexedDB database connection.
 */
export const openOrdersDb = () => {
  if (!isIdbSupported()) return Promise.resolve(null)
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = event.target.result

      // Orders store: indexed by composite key (restaurantId__orderId)
      if (!db.objectStoreNames.contains(STORE_ORDERS)) {
        const orderStore = db.createObjectStore(STORE_ORDERS, { keyPath: 'cacheKey' })
        orderStore.createIndex('by_restaurant', 'restaurantId', { unique: false })
        orderStore.createIndex('by_created', 'createdAt', { unique: false })
      }

      // Metadata store: tracks last sync timestamps per restaurant
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'restaurantId' })
      }

      // Void logs store: indexed by composite key (restaurantId__logId)
      if (!db.objectStoreNames.contains(STORE_VOID_LOGS)) {
        const voidStore = db.createObjectStore(STORE_VOID_LOGS, { keyPath: 'cacheKey' })
        voidStore.createIndex('by_restaurant', 'restaurantId', { unique: false })
        voidStore.createIndex('by_voided', 'voidedAt', { unique: false })
      }
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = (err) => {
      console.warn('Failed to open IndexedDB orders cache:', err)
      resolve(null)
    }
  })

  return dbPromise
}

/**
 * Retrieves all cached orders for a given restaurant from IndexedDB.
 */
export const getCachedOrders = async (restaurantId) => {
  if (!restaurantId || !isIdbSupported()) return []

  try {
    const db = await openOrdersDb()
    if (!db) return []

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_ORDERS, 'readonly')
      const store = tx.objectStore(STORE_ORDERS)
      const index = store.index('by_restaurant')
      const request = index.getAll(IDBKeyRange.only(restaurantId))

      request.onsuccess = () => {
        const records = request.result || []
        // Extract raw order object from record
        const orders = records.map((r) => r.order || r)
        resolve(orders)
      }

      request.onerror = (err) => {
        console.warn('Error reading cached orders from IndexedDB:', err)
        resolve([])
      }
    })
  } catch (err) {
    console.warn('Error in getCachedOrders:', err)
    return []
  }
}

/**
 * Retrieves synchronization metadata for a restaurant.
 */
export const getCacheSyncMeta = async (restaurantId) => {
  if (!restaurantId || !isIdbSupported()) return null

  try {
    const db = await openOrdersDb()
    if (!db) return null

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_META, 'readonly')
      const store = tx.objectStore(STORE_META)
      const request = store.get(restaurantId)

      request.onsuccess = () => {
        resolve(request.result || null)
      }

      request.onerror = () => {
        resolve(null)
      }
    })
  } catch (err) {
    return null
  }
}

/**
 * Persists an array of orders to IndexedDB cache for a restaurant.
 */
export const saveOrdersToCache = async (restaurantId, orders) => {
  if (!restaurantId || !Array.isArray(orders) || orders.length === 0 || !isIdbSupported()) {
    return false
  }

  try {
    const db = await openOrdersDb()
    if (!db) return false

    return new Promise((resolve) => {
      const tx = db.transaction([STORE_ORDERS, STORE_META], 'readwrite')
      const orderStore = tx.objectStore(STORE_ORDERS)
      const metaStore = tx.objectStore(STORE_META)

      let latestDateStr = ''
      let latestDateTime = 0

      orders.forEach((order) => {
        if (!order || typeof order !== 'object') return
        const orderId = order.id || order.orderId || `ord_${Math.random().toString(36).slice(2, 9)}`
        const dateObj = normalizeOrderDate(order)
        const dateIso = dateObj ? toLocalISOString(dateObj) : (typeof order.createdAt === 'string' ? order.createdAt : '')

        if (dateObj) {
          const t = dateObj.getTime()
          if (t > latestDateTime) {
            latestDateTime = t
            latestDateStr = dateIso
          }
        }

        const record = {
          cacheKey: `${restaurantId}__${orderId}`,
          restaurantId,
          orderId,
          createdAt: dateIso,
          order: {
            ...order,
            id: orderId,
          },
        }

        orderStore.put(record)
      })

      // Update sync metadata
      const metaReq = metaStore.get(restaurantId)
      metaReq.onsuccess = () => {
        const prevMeta = metaReq.result || {}
        let resolvedLatestDate = latestDateStr
        if (prevMeta.lastOrderCreatedAt && (!latestDateStr || prevMeta.lastOrderCreatedAt > latestDateStr)) {
          resolvedLatestDate = prevMeta.lastOrderCreatedAt
        }

        metaStore.put({
          restaurantId,
          lastSyncAt: new Date().toISOString(),
          lastOrderCreatedAt: resolvedLatestDate,
          cachedAt: Date.now(),
        })
      }

      tx.oncomplete = () => resolve(true)
      tx.onerror = (err) => {
        console.warn('Error writing to IndexedDB orders cache:', err)
        resolve(false)
      }
    })
  } catch (err) {
    console.warn('Error saving orders to IndexedDB cache:', err)
    return false
  }
}

/**
 * Clears cached orders and sync metadata for a specific restaurant.
 */
export const clearRestaurantOrdersCache = async (restaurantId) => {
  if (!restaurantId || !isIdbSupported()) return false

  try {
    const db = await openOrdersDb()
    if (!db) return false

    return new Promise((resolve) => {
      const tx = db.transaction([STORE_ORDERS, STORE_META], 'readwrite')
      const orderStore = tx.objectStore(STORE_ORDERS)
      const metaStore = tx.objectStore(STORE_META)

      const index = orderStore.index('by_restaurant')
      const req = index.openKeyCursor(IDBKeyRange.only(restaurantId))

      req.onsuccess = (e) => {
        const cursor = e.target.result
        if (cursor) {
          orderStore.delete(cursor.primaryKey)
          cursor.continue()
        }
      }

      metaStore.delete(restaurantId)

      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
    })
  } catch (err) {
    console.warn('Failed to clear orders cache:', err)
    return false
  }
}

/**
 * Incremental Fetch Orchestrator:
 * 1. Instantly loads cached orders from IndexedDB (0ms UI latency).
 * 2. If cached orders exist, finds the newest order date and queries Firestore ONLY
 *    for orders created after that timestamp (delta sync).
 * 3. Merges new records, updates IndexedDB, and returns the unified list.
 */
export const fetchOrdersWithIncrementalCache = async (
  firestoreDb,
  targetRestaurantId,
  {
    forceRefresh = false,
    onInitialCachedLoaded = null,
    maxLimit = 5000,
  } = {}
) => {
  if (!firestoreDb || !targetRestaurantId) return []

  const ordersMap = new Map()

  const addOrder = (orderData, fallbackId) => {
    if (!orderData || typeof orderData !== 'object') return
    const orderId =
      orderData.id ||
      orderData.orderId ||
      orderData.orderNumber ||
      orderData.invoiceNumber ||
      fallbackId ||
      `order_${Math.random().toString(36).substring(2, 9)}`

    ordersMap.set(orderId, {
      id: orderId,
      ...orderData,
    })
  }

  const parseDocData = (data, docId) => {
    if (!data) return
    if (Array.isArray(data.orders)) {
      data.orders.forEach((ord, idx) => addOrder(ord, `${docId}_ord_${idx}`))
    } else if (Array.isArray(data.backups)) {
      data.backups.forEach((ord, idx) => addOrder(ord, `${docId}_bk_${idx}`))
    } else if (Array.isArray(data.sales)) {
      data.sales.forEach((ord, idx) => addOrder(ord, `${docId}_sl_${idx}`))
    } else if (Array.isArray(data.items) || data.total !== undefined || data.status || data.createdAt) {
      addOrder(data, docId)
    }
  }

  // ── Step 1: Check Local IndexedDB Cache ─────────────────────────────────────
  let cachedOrders = []
  let latestCachedDateStr = null
  let latestCachedDateObj = null

  if (!forceRefresh) {
    try {
      cachedOrders = await getCachedOrders(targetRestaurantId)
      if (cachedOrders.length > 0) {
        cachedOrders.forEach((o) => addOrder(o))

        // Immediately notify caller so the UI renders instantly
        if (typeof onInitialCachedLoaded === 'function') {
          onInitialCachedLoaded(Array.from(ordersMap.values()))
        }

        // Determine latest timestamp in cache
        const meta = await getCacheSyncMeta(targetRestaurantId)
        if (meta?.lastOrderCreatedAt) {
          latestCachedDateStr = meta.lastOrderCreatedAt
          const d = normalizeOrderDate({ createdAt: meta.lastOrderCreatedAt })
          if (d) latestCachedDateObj = d
        }

        // Also inspect items in cache to verify highest timestamp
        for (const o of cachedOrders) {
          const d = normalizeOrderDate(o)
          if (d && (!latestCachedDateObj || d.getTime() > latestCachedDateObj.getTime())) {
            latestCachedDateObj = d
            latestCachedDateStr = toLocalISOString(d) || (typeof o.createdAt === 'string' ? o.createdAt : null)
          }
        }
      }
    } catch (e) {
      console.warn('Cache read notice:', e)
    }
  } else {
    // If user clicked Force Refresh, clear existing cache
    await clearRestaurantOrdersCache(targetRestaurantId)
  }

  // ── Step 2: Fetch Delta from Firestore ─────────────────────────────────────
  const candidateCollections = [
    collection(firestoreDb, 'backup', targetRestaurantId, 'orders'),
    collection(firestoreDb, 'restaurants', targetRestaurantId, 'orders'),
    collection(firestoreDb, 'backups', targetRestaurantId, 'orders'),
    collection(firestoreDb, 'backup', targetRestaurantId, 'sales'),
    collection(firestoreDb, 'backup', targetRestaurantId, 'records'),
  ]

  // If this is the very first sync (no cached orders) or force refresh, also check legacy backup doc
  if (ordersMap.size === 0) {
    try {
      const mainDocRef = doc(firestoreDb, 'backup', targetRestaurantId)
      const mainDocSnap = await getDoc(mainDocRef)
      if (mainDocSnap.exists()) {
        parseDocData(mainDocSnap.data(), mainDocSnap.id)
      }
    } catch (e) {
      // ignore
    }
  }

  const newOrdersFetched = []

  for (const colRef of candidateCollections) {
    try {
      let snap = null

      if (latestCachedDateStr) {
        // INCREMENTAL / DELTA QUERY:
        // Only fetch orders created on or after the newest cached timestamp!
        try {
          const qStr = query(
            colRef,
            where('createdAt', '>=', latestCachedDateStr),
            limit(1000)
          )
          snap = await getDocs(qStr)
        } catch (e) {
          // Fallback to timestamp bounds if createdAt is Firestore Timestamp
          if (latestCachedDateObj) {
            try {
              const qTs = query(
                colRef,
                where('createdAt', '>=', Timestamp.fromDate(latestCachedDateObj)),
                limit(1000)
              )
              snap = await getDocs(qTs)
            } catch (err) {
              // ignore
            }
          }
        }
      } else {
        // FULL INITIAL FETCH (only runs on first visit when cache is completely empty):
        try {
          const qFull = query(colRef, limit(maxLimit))
          snap = await getDocs(qFull)
        } catch (e) {
          // ignore
        }
      }

      if (snap && !snap.empty) {
        snap.forEach((docSnap) => {
          const prevSize = ordersMap.size
          parseDocData(docSnap.data(), docSnap.id)
          // If this document is newly added or updated, track it
          if (ordersMap.size > prevSize) {
            const addedOrder = ordersMap.get(docSnap.id) || docSnap.data()
            newOrdersFetched.push(addedOrder)
          }
        })
      }
    } catch (e) {
      // Continue to next collection
    }
  }

  const allOrders = Array.from(ordersMap.values())

  // ── Step 3: Update Local Cache with New Data ───────────────────────────────
  if (newOrdersFetched.length > 0 || (cachedOrders.length === 0 && allOrders.length > 0)) {
    // If we fetched new orders or it's the initial full load, save to IndexedDB
    saveOrdersToCache(targetRestaurantId, allOrders).catch((err) => {
      console.warn('Error saving to cache:', err)
    })
  } else if (cachedOrders.length > 0) {
    // No new orders created since last check; refresh metadata sync timestamp
    saveOrdersToCache(targetRestaurantId, []).catch(() => {})
  }

  return allOrders
}

/**
 * Retrieves all cached void logs for a restaurant from IndexedDB.
 */
export const getCachedVoidLogs = async (restaurantId, { startDate = null, endDate = null } = {}) => {
  if (!restaurantId || !isIdbSupported()) return []

  try {
    const db = await openOrdersDb()
    if (!db) return []

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_VOID_LOGS, 'readonly')
      const store = tx.objectStore(STORE_VOID_LOGS)
      const index = store.index('by_restaurant')
      const request = index.getAll(IDBKeyRange.only(restaurantId))

      request.onsuccess = () => {
        const records = request.result || []
        const logs = records.map((r) => {
          const raw = r.log || r
          return normalizeVoidLog(raw, r.logId || raw.id)
        }).filter(Boolean)

        resolve(filterAndSortVoidLogs(logs, startDate, endDate))
      }

      request.onerror = (err) => {
        console.warn('Error reading cached void logs from IndexedDB:', err)
        resolve([])
      }
    })
  } catch (err) {
    console.warn('Error in getCachedVoidLogs:', err)
    return []
  }
}

/**
 * Persists void logs to the IndexedDB cache.
 */
export const saveVoidLogsToCache = async (restaurantId, voidLogs) => {
  if (!restaurantId || !Array.isArray(voidLogs) || voidLogs.length === 0 || !isIdbSupported()) {
    return false
  }

  try {
    const db = await openOrdersDb()
    if (!db) return false

    return new Promise((resolve) => {
      const tx = db.transaction([STORE_VOID_LOGS, STORE_META], 'readwrite')
      const voidStore = tx.objectStore(STORE_VOID_LOGS)
      const metaStore = tx.objectStore(STORE_META)

      let latestDateStr = ''
      let latestDateTime = 0

      voidLogs.forEach((rawLog) => {
        if (!rawLog || typeof rawLog !== 'object') return
        const norm = normalizeVoidLog(rawLog)
        if (!norm) return
        const logId = norm.id

        const dateObj = norm.date instanceof Date ? norm.date : (norm.voidedAt instanceof Date ? norm.voidedAt : null)
        const dateIso = dateObj && !isNaN(dateObj.getTime())
          ? toLocalISOString(dateObj)
          : (typeof norm.voidedAt === 'string' ? norm.voidedAt : (typeof norm.createdAt === 'string' ? norm.createdAt : ''))

        if (dateObj && !isNaN(dateObj.getTime())) {
          const t = dateObj.getTime()
          if (t > latestDateTime) {
            latestDateTime = t
            latestDateStr = dateIso
          }
        }

        const serializableLog = {
          ...norm,
          voidedAt: dateIso,
          date: dateIso,
          createdAt: typeof norm.createdAt === 'string' ? norm.createdAt : dateIso,
        }

        const record = {
          cacheKey: `${restaurantId}__${logId}`,
          restaurantId,
          logId: String(logId),
          voidedAt: dateIso,
          log: serializableLog,
        }

        voidStore.put(record)
      })

      // Update sync metadata
      const metaReq = metaStore.get(restaurantId)
      metaReq.onsuccess = () => {
        const prevMeta = metaReq.result || {}
        let resolvedLatestDate = latestDateStr
        if (prevMeta.lastVoidLogAt && (!latestDateStr || prevMeta.lastVoidLogAt > latestDateStr)) {
          resolvedLatestDate = prevMeta.lastVoidLogAt
        }

        metaStore.put({
          ...prevMeta,
          restaurantId,
          lastVoidLogsSyncAt: new Date().toISOString(),
          lastVoidLogAt: resolvedLatestDate,
        })
      }

      tx.oncomplete = () => resolve(true)
      tx.onerror = (err) => {
        console.warn('Error writing void logs to IndexedDB:', err)
        resolve(false)
      }
    })
  } catch (err) {
    console.warn('Error saving void logs to IndexedDB cache:', err)
    return false
  }
}

/**
 * Clears cached void logs for a specific restaurant.
 */
export const clearRestaurantVoidLogsCache = async (restaurantId) => {
  if (!restaurantId || !isIdbSupported()) return false

  try {
    const db = await openOrdersDb()
    if (!db) return false

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_VOID_LOGS, 'readwrite')
      const voidStore = tx.objectStore(STORE_VOID_LOGS)
      const index = voidStore.index('by_restaurant')
      const req = index.openKeyCursor(IDBKeyRange.only(restaurantId))

      req.onsuccess = (e) => {
        const cursor = e.target.result
        if (cursor) {
          voidStore.delete(cursor.primaryKey)
          cursor.continue()
        }
      }

      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
    })
  } catch (err) {
    console.warn('Failed to clear void logs cache:', err)
    return false
  }
}

/**
 * Filters and sorts void logs by date range.
 */
export const filterAndSortVoidLogs = (list, startDate, endDate) => {
  let result = list
  if (startDate || endDate) {
    result = result.filter((r) => {
      if (!r.date) return true
      const d = r.date instanceof Date ? r.date : new Date(r.date)
      if (isNaN(d.getTime())) return true
      if (startDate && d < startDate) return false
      if (endDate && d > endDate) return false
      return true
    })
  }

  return result.sort((a, b) => {
    const timeA = a.date instanceof Date ? a.date.getTime() : a.date ? new Date(a.date).getTime() : 0
    const timeB = b.date instanceof Date ? b.date.getTime() : b.date ? new Date(b.date).getTime() : 0
    return timeB - timeA
  })
}

/**
 * Incremental Fetch Orchestrator for Void Logs:
 * 1. Checks local IndexedDB cache first.
 * 2. If cached logs exist, queries Firestore ONLY for newly appended void logs (delta sync).
 * 3. Saves new records to IndexedDB and returns merged list.
 */
export const fetchVoidLogsWithIncrementalCache = async (
  restaurantId,
  {
    startDate = null,
    endDate = null,
    limitCount = 2000,
    backupConfig = null,
    forceRefresh = false,
    onInitialCachedLoaded = null,
  } = {}
) => {
  if (!restaurantId) return []
  const firestoreDb = getActiveFirestoreInstance(backupConfig)
  if (!firestoreDb) return []

  const logsMap = new Map()

  const addLog = (raw, fallbackId) => {
    const norm = normalizeVoidLog(raw, fallbackId)
    if (!norm) return
    logsMap.set(norm.id, norm)
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

  // 1. Check local IndexedDB cache
  let cachedLogs = []
  let latestCachedDateStr = null
  let latestCachedDateTime = 0

  if (!forceRefresh) {
    try {
      cachedLogs = await getCachedVoidLogs(restaurantId)
      if (cachedLogs.length > 0) {
        cachedLogs.forEach((l) => logsMap.set(l.id, l))

        if (typeof onInitialCachedLoaded === 'function') {
          const initialFiltered = filterAndSortVoidLogs(Array.from(logsMap.values()), startDate, endDate)
          onInitialCachedLoaded(initialFiltered)
        }

        // Find newest void log in cache
        for (const l of cachedLogs) {
          const d = l.date instanceof Date ? l.date : (l.voidedAt ? new Date(l.voidedAt) : (l.createdAt ? new Date(l.createdAt) : null))
          if (d && !isNaN(d.getTime()) && d.getTime() > latestCachedDateTime) {
            latestCachedDateTime = d.getTime()
            latestCachedDateStr = toLocalISOString(d) || (typeof l.voidedAt === 'string' ? l.voidedAt : (typeof l.createdAt === 'string' ? l.createdAt : null))
          }
        }
      }
    } catch (e) {
      console.warn('Void logs cache read notice:', e)
    }
  } else {
    await clearRestaurantVoidLogsCache(restaurantId)
  }

  // 2. Fetch delta or full from Firestore
  const candidateCollections = [
    collection(firestoreDb, 'backup', restaurantId, 'void_logs'),
    collection(firestoreDb, 'restaurants', restaurantId, 'void_logs'),
    collection(firestoreDb, 'backups', restaurantId, 'void_logs'),
  ]

  // If initial load and empty cache, also check parent backup doc
  if (logsMap.size === 0) {
    try {
      const parentRef = doc(firestoreDb, 'backup', restaurantId)
      const parentSnap = await getDoc(parentRef)
      if (parentSnap.exists()) {
        parseDoc(parentSnap.data(), parentSnap.id)
      }
    } catch {
      // ignore
    }
  }

  const newLogsFetched = []

  for (const colRef of candidateCollections) {
    try {
      let snap = null

      if (latestCachedDateStr) {
        // Incremental Delta Query: only fetch void logs created after latest cached date
        try {
          const qStr = query(
            colRef,
            where('voidedAt', '>=', latestCachedDateStr),
            limit(limitCount)
          )
          snap = await getDocs(qStr)
        } catch {
          // Fallback to createdAt
          try {
            const qCreated = query(
              colRef,
              where('createdAt', '>=', latestCachedDateStr),
              limit(limitCount)
            )
            snap = await getDocs(qCreated)
          } catch {
            // ignore
          }
        }
      } else {
        // Full initial fetch when cache is empty
        try {
          const qFull = query(colRef, limit(limitCount))
          snap = await getDocs(qFull)
        } catch {
          // ignore
        }
      }

      if (snap && !snap.empty) {
        snap.forEach((docSnap) => {
          const prevSize = logsMap.size
          parseDoc(docSnap.data(), docSnap.id)
          if (logsMap.size > prevSize) {
            const added = logsMap.get(docSnap.id) || docSnap.data()
            newLogsFetched.push(added)
          }
        })
      }
    } catch {
      // continue next collection
    }
  }

  const allLogs = Array.from(logsMap.values())

  // 3. Persist to IndexedDB cache
  if (newLogsFetched.length > 0 || (cachedLogs.length === 0 && allLogs.length > 0)) {
    saveVoidLogsToCache(restaurantId, allLogs).catch((err) => {
      console.warn('Error saving void logs to cache:', err)
    })
  }

  // 4. Filter by date bounds and sort
  return filterAndSortVoidLogs(allLogs, startDate, endDate)
}
