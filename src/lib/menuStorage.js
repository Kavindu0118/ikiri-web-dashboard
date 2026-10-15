import {
  setDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  serverTimestamp,
  onSnapshot,
  deleteDoc,
  updateDoc,
  deleteField,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from './firebase'

const USERS_COLLECTION = 'users'
const RESTAURANTS_COLLECTION = 'restaurants'
const MENU_SUBCOLLECTION = 'menu'
const CURRENT_MENU_DOC = 'current'
const ORDERS_SUBCOLLECTION = 'orders'

const slugify = (value = '') =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')

const normalizeMenuSections = (sections) => {
  if (!Array.isArray(sections)) return []
  return sections.map((sec) => ({
    ...sec,
    items: Array.isArray(sec.items)
      ? sec.items.map((it) => ({
          ...it,
          addOns: Array.isArray(it.addOns)
            ? it.addOns
            : Array.isArray(it.addons)
            ? it.addons
            : [],
        }))
      : [],
    subcategories: Array.isArray(sec.subcategories)
      ? sec.subcategories.map((sub) => ({
          ...sub,
          items: Array.isArray(sub.items)
            ? sub.items.map((it) => ({
                ...it,
                addOns: Array.isArray(it.addOns)
                  ? it.addOns
                  : Array.isArray(it.addons)
                  ? it.addons
                  : [],
              }))
            : [],
        }))
      : [],
  }))
}

const normalizeMenu = ({ restaurantId, restaurantData, menuData }) => ({
  id: restaurantData.slug || restaurantId,
  restaurantId,
  slug: restaurantData.slug || restaurantId,
  restaurantName: restaurantData.name || menuData.restaurantName || 'Untitled Restaurant',
  templateId: menuData.templateId || 'minimal-cafe',
  templateLabel: menuData.templateLabel || 'Minimal Cafe',
  menuTitle: menuData.menuTitle || menuData.title || 'Untitled Menu',
  notes: menuData.notes || '',
  sections: normalizeMenuSections(menuData.sections),
  isPublished: Boolean(menuData.isPublished),
  updatedAt: menuData.updatedAt || restaurantData.updatedAt || null,
})

const findRestaurantBySlug = async (slug) => {
  const restaurantQuery = query(
    collection(db, RESTAURANTS_COLLECTION),
    where('slug', '==', slug),
    limit(1),
  )
  const snapshot = await getDocs(restaurantQuery)
  if (snapshot.empty) return null
  return snapshot.docs[0]
}

export const isRestaurantSlugAvailable = async (restaurantId, slug, customDb = null) => {
  const firestore = customDb || db
  if (!isFirebaseConfigured || !firestore || !restaurantId || !slug) return false

  const normalizedSlug = slugify(slug)
  if (!normalizedSlug) return false

  const restaurantQuery = query(
    collection(firestore, RESTAURANTS_COLLECTION),
    where('slug', '==', normalizedSlug),
    limit(2),
  )

  const snapshot = await getDocs(restaurantQuery)
  if (snapshot.empty) return true

  return snapshot.docs.every((docSnap) => docSnap.id === restaurantId)
}

const ensureUniqueRestaurantSlug = async (restaurantName) => {
  const baseSlug = slugify(restaurantName) || `restaurant-${Math.floor(Math.random() * 100000)}`
  let nextSlug = baseSlug

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const existing = await findRestaurantBySlug(nextSlug)
    if (!existing) {
      return nextSlug
    }
    nextSlug = `${baseSlug}-${Math.floor(Math.random() * 1000)}`
  }

  return `${baseSlug}-${Date.now()}`
}

const MENU_CACHE_PREFIX = 'ikiri_menu_cache_'
const DEFAULT_MENU_CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours TTL

export const getCachedMenuRecord = (menuId) => {
  if (!menuId || typeof window === 'undefined') return null
  try {
    const key = `${MENU_CACHE_PREFIX}${encodeURIComponent(String(menuId).toLowerCase().trim())}`
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.data) return null
    const age = Date.now() - (parsed.cachedAt || 0)
    if (age > (parsed.ttlMs || DEFAULT_MENU_CACHE_TTL_MS)) {
      window.localStorage.removeItem(key)
      return null
    }
    return parsed.data
  } catch {
    return null
  }
}

export const setCachedMenuRecord = (menuId, data, ttlMs = DEFAULT_MENU_CACHE_TTL_MS) => {
  if (!menuId || !data || typeof window === 'undefined') return
  try {
    const entry = JSON.stringify({
      data,
      cachedAt: Date.now(),
      ttlMs,
    })
    const key = `${MENU_CACHE_PREFIX}${encodeURIComponent(String(menuId).toLowerCase().trim())}`
    window.localStorage.setItem(key, entry)

    if (data.restaurantId && String(data.restaurantId).toLowerCase() !== String(menuId).toLowerCase()) {
      window.localStorage.setItem(
        `${MENU_CACHE_PREFIX}${encodeURIComponent(String(data.restaurantId).toLowerCase().trim())}`,
        entry
      )
    }
    const slug = data.restaurantData?.slug || data.slug
    if (slug && String(slug).toLowerCase() !== String(menuId).toLowerCase()) {
      window.localStorage.setItem(
        `${MENU_CACHE_PREFIX}${encodeURIComponent(String(slug).toLowerCase().trim())}`,
        entry
      )
    }
  } catch (err) {
    console.warn('Failed to cache menu record in localStorage:', err)
  }
}

export const clearMenuCache = (menuId) => {
  if (!menuId || typeof window === 'undefined') return
  try {
    const key = `${MENU_CACHE_PREFIX}${encodeURIComponent(String(menuId).toLowerCase().trim())}`
    window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export const getMenuRecord = async (menuId, forceFresh = false) => {
  if (!menuId) return null

  // 1. Check browser localStorage cache
  if (!forceFresh) {
    const cached = getCachedMenuRecord(menuId)
    if (cached) {
      return cached
    }
  }

  if (!isFirebaseConfigured || !db) return null

  const byRestaurantIdRef = doc(db, RESTAURANTS_COLLECTION, menuId)
  const byRestaurantIdSnap = await getDoc(byRestaurantIdRef)

  let restaurantId = null
  let restaurantData = null

  if (byRestaurantIdSnap.exists()) {
    restaurantId = byRestaurantIdSnap.id
    restaurantData = byRestaurantIdSnap.data()
  } else {
    const restaurantBySlug = await findRestaurantBySlug(menuId)
    if (!restaurantBySlug) {
      return null
    }
    restaurantId = restaurantBySlug.id
    restaurantData = restaurantBySlug.data()
  }

  const menuRef = doc(db, RESTAURANTS_COLLECTION, restaurantId, MENU_SUBCOLLECTION, CURRENT_MENU_DOC)
  const menuSnap = await getDoc(menuRef)
  if (!menuSnap.exists()) return null

  const normalized = normalizeMenu({
    restaurantId,
    restaurantData,
    menuData: menuSnap.data(),
  })

  // 2. Save fresh record to browser localStorage cache
  setCachedMenuRecord(menuId, normalized)

  return normalized
}

export const saveMenuRecord = async (menuPayload, restaurantId, customSlug = null, customDb = null) => {
  const firestore = customDb || db
  if (!isFirebaseConfigured || !firestore) {
    return {
      remoteSaved: false,
      remoteId: null,
    }
  }

  if (!restaurantId) {
    return { remoteSaved: false, remoteId: null }
  }

  const restaurantRef = doc(firestore, RESTAURANTS_COLLECTION, restaurantId)
  const restaurantSnap = await getDoc(restaurantRef)
  const existingRestaurantData = restaurantSnap.exists() ? restaurantSnap.data() : null

  const restaurantName = menuPayload.restaurantName?.trim() || existingRestaurantData?.name || 'Untitled Restaurant'
  const generatedSlug = slugify(restaurantName)
  const finalSlug = customSlug || existingRestaurantData?.slug || generatedSlug

  await setDoc(restaurantRef, {
    name: restaurantName,
    slug: finalSlug,
    allowOnlineOrders: existingRestaurantData?.allowOnlineOrders ?? false,
    isActive: existingRestaurantData?.isActive ?? true,
    createdAt: existingRestaurantData?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true })

  const menuRef = doc(firestore, RESTAURANTS_COLLECTION, restaurantId, MENU_SUBCOLLECTION, CURRENT_MENU_DOC)
  await setDoc(menuRef, {
    title: menuPayload.menuTitle,
    menuTitle: menuPayload.menuTitle,
    templateId: menuPayload.templateId,
    templateLabel: menuPayload.templateLabel,
    restaurantName: restaurantName,
    notes: menuPayload.notes,
    sections: menuPayload.sections,
    isPublished: true,
    updatedAt: serverTimestamp(),
  }, { merge: true })

  clearMenuCache(restaurantId)
  if (finalSlug) clearMenuCache(finalSlug)
  if (customSlug) clearMenuCache(customSlug)

  return {
    remoteSaved: true,
    remoteId: finalSlug,
  }
}

export const getRestaurantMenu = async (restaurantId, customDb = null) => {
  const firestore = customDb || db
  if (!isFirebaseConfigured || !firestore || !restaurantId) return null

  const restaurantSnap = await getDoc(doc(firestore, RESTAURANTS_COLLECTION, restaurantId))
  if (!restaurantSnap.exists()) return null

  const menuSnap = await getDoc(
    doc(firestore, RESTAURANTS_COLLECTION, restaurantId, MENU_SUBCOLLECTION, CURRENT_MENU_DOC),
  )
  if (!menuSnap.exists()) return null

  return normalizeMenu({
    restaurantId,
    restaurantData: restaurantSnap.data(),
    menuData: menuSnap.data(),
  })
}

export const getUserMenus = async (restaurantId, customDb = null) => {
  const menu = await getRestaurantMenu(restaurantId, customDb)
  return menu ? [menu] : []
}

export const getUserProfile = async (uid, customDb = null, userEmail = null) => {
  const firestore = customDb || db
  if (!isFirebaseConfigured || !firestore || !uid) return null

  const resolveRestId = (data) => {
    if (!data) return null
    return data.restaurantId || data.restaurant_id || (Array.isArray(data.restaurants) ? data.restaurants[0] : null) || null
  }

  // 1. Direct doc lookup by uid: users/{uid} with 10s timeout
  try {
    const docRef = doc(firestore, USERS_COLLECTION, uid)
    const snapPromise = getDoc(docRef)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('getUserProfile timeout')), 10000)
    )
    const snap = await Promise.race([snapPromise, timeoutPromise])
    if (snap && snap.exists()) {
      const data = snap.data()
      const restId = resolveRestId(data)
      if (restId) {
        return { uid: snap.id, ...data, restaurantId: restId }
      }
    }
  } catch (err) {
    console.warn('Could not fetch user profile by UID (attempt 1):', err)
  }

  // 1b. Retry without timeout race in case cold connection took longer
  try {
    const docRef = doc(firestore, USERS_COLLECTION, uid)
    const snap = await getDoc(docRef)
    if (snap && snap.exists()) {
      const data = snap.data()
      const restId = resolveRestId(data)
      if (restId) {
        return { uid: snap.id, ...data, restaurantId: restId }
      }
    }
  } catch (retryErr) {
    console.warn('Could not fetch user profile by UID (retry):', retryErr)
  }

  // 2. Fallback: Search users collection by email
  if (userEmail) {
    try {
      const qEmail = query(
        collection(firestore, USERS_COLLECTION),
        where('email', '==', userEmail.trim().toLowerCase()),
        limit(1)
      )
      const snapEmail = await getDocs(qEmail)
      if (!snapEmail.empty) {
        const foundDoc = snapEmail.docs[0]
        const data = foundDoc.data()
        const restId = resolveRestId(data)
        if (restId) {
          // Heal the link so users/{uid} is directly saved for future logins
          try {
            await setDoc(doc(firestore, USERS_COLLECTION, uid), { ...data, restaurantId: restId }, { merge: true })
          } catch {}
          return { uid, ...data, restaurantId: restId }
        }
      }
    } catch (emailErr) {
      console.warn('Fallback search users by email failed:', emailErr)
    }
  }

  // 3. Fallback: Search subscriptions collection where userId == uid
  try {
    const qSub = query(collection(firestore, 'subscriptions'), where('userId', '==', uid), limit(1))
    const snapSub = await getDocs(qSub)
    if (!snapSub.empty) {
      const subDoc = snapSub.docs[0]
      const subData = subDoc.data()
      const restId = subData.restaurantId || subDoc.id
      if (restId) {
        const profileToSave = { restaurantId: restId, email: userEmail || '' }
        try {
          await setDoc(doc(firestore, USERS_COLLECTION, uid), profileToSave, { merge: true })
        } catch {}
        return { uid, ...profileToSave }
      }
    }
  } catch (subErr) {
    console.warn('Fallback search subscriptions by userId failed:', subErr)
  }

  // 4. Fallback: Search restaurants collection where userId == uid
  try {
    const qRest = query(collection(firestore, RESTAURANTS_COLLECTION), where('userId', '==', uid), limit(1))
    const snapRest = await getDocs(qRest)
    if (!snapRest.empty) {
      const restDoc = snapRest.docs[0]
      const restData = restDoc.data()
      const profileToSave = { restaurantId: restDoc.id, restaurantName: restData.name || '', email: userEmail || '' }
      try {
        await setDoc(doc(firestore, USERS_COLLECTION, uid), profileToSave, { merge: true })
      } catch {}
      return { uid, ...profileToSave }
    }
  } catch (restErr) {
    console.warn('Fallback search restaurants by userId failed:', restErr)
  }

  // 5. Fallback: Search connected_restaurants subcollection under users/{uid}
  try {
    const colRef = collection(firestore, USERS_COLLECTION, uid, 'connected_restaurants')
    const snapConn = await getDocs(colRef)
    if (!snapConn.empty) {
      const connData = snapConn.docs[0].data()
      const restId = connData.restaurantId || snapConn.docs[0].id
      if (restId) {
        const profileToSave = { restaurantId: restId, restaurantName: connData.name || '', email: userEmail || '' }
        try {
          await setDoc(doc(firestore, USERS_COLLECTION, uid), profileToSave, { merge: true })
        } catch {}
        return { uid, ...profileToSave }
      }
    }
  } catch (connErr) {
    console.warn('Fallback search connected_restaurants failed:', connErr)
  }

  return null
}

export const createRestaurantForUser = async (uid, profileData) => {
  if (!isFirebaseConfigured || !db || !uid || !profileData?.restaurantName) return null

  const restaurantName = profileData.restaurantName.trim()
  const ownerName = (profileData.ownerName || '').trim()
  const email = profileData.email || ''
  const uniqueSlug = await ensureUniqueRestaurantSlug(restaurantName)

  const restaurantRef = doc(collection(db, RESTAURANTS_COLLECTION))
  await setDoc(restaurantRef, {
    name: restaurantName,
    slug: uniqueSlug,
    allowOnlineOrders: false,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  // Create default subscription record
  try {
    const subRef = doc(db, 'subscriptions', restaurantRef.id)
    await setDoc(subRef, {
      restaurantId: restaurantRef.id,
      userId: uid,
      subscriptionType: '',
      monthlyCharge: '',
      status: 'Inactive',
      subscribedDate: '',
      nextRenewalDate: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  } catch (subErr) {
    console.error('Error creating initial subscription record:', subErr)
  }

  await setDoc(doc(db, USERS_COLLECTION, uid), {
    ownerName,
    email,
    restaurantId: restaurantRef.id,
    updatedAt: serverTimestamp(),
  }, { merge: true })

  return {
    ownerName,
    email,
    restaurantId: restaurantRef.id,
  }
}

export const getOrCreateSubscription = async (restaurantId, userId = '', customDb = null) => {
  const firestore = customDb || db
  if (!isFirebaseConfigured || !firestore || !restaurantId) return null
  try {
    const subRef = doc(firestore, 'subscriptions', restaurantId)
    const snap = await getDoc(subRef)
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() }
    }
    const initialData = {
      restaurantId,
      userId: userId || '',
      subscriptionType: '',
      monthlyCharge: '',
      status: 'Inactive',
      subscribedDate: '',
      nextRenewalDate: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    await setDoc(subRef, initialData)
    return { id: restaurantId, ...initialData }
  } catch (error) {
    console.error('Error in getOrCreateSubscription:', error)
    return null
  }
}

export const subscribeToSubscription = (restaurantId, onUpdate, customDb = null) => {
  const firestore = customDb || db
  if (!isFirebaseConfigured || !firestore || !restaurantId) return () => {}
  const subRef = doc(firestore, 'subscriptions', restaurantId)
  return onSnapshot(subRef, (snap) => {
    if (snap.exists()) {
      onUpdate({ id: snap.id, ...snap.data() })
    } else {
      onUpdate(null)
    }
  }, (err) => {
    console.error('Error listening to subscription:', err)
  })
}

export const saveUserProfile = async (uid, profileData, customDb = null) => {
  const firestore = customDb || db
  if (!isFirebaseConfigured || !firestore || !uid) return false
  await setDoc(doc(firestore, USERS_COLLECTION, uid), {
    ...profileData,
    updatedAt: serverTimestamp(),
  }, { merge: true })
  return true
}

export const getRestaurantSettings = async (restaurantId, customDb = null) => {
  const firestore = customDb || db
  if (!isFirebaseConfigured || !firestore || !restaurantId) return null
  try {
    const docRef = doc(firestore, RESTAURANTS_COLLECTION, restaurantId)
    const snapPromise = getDoc(docRef)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('getRestaurantSettings timeout')), 10000)
    )
    const snap = await Promise.race([snapPromise, timeoutPromise])
    if (snap.exists()) return { id: snap.id, ...snap.data() }
  } catch (err) {
    console.warn('Could not fetch restaurant settings:', err)
  }
  return null
}

export const subscribeToRestaurantSettings = (restaurantId, callback, customDb = null) => {
  const firestore = customDb || db
  if (!isFirebaseConfigured || !firestore || !restaurantId) {
    callback(null)
    return () => {}
  }
  const docRef = doc(firestore, RESTAURANTS_COLLECTION, restaurantId)
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        callback({ id: snap.id, ...snap.data() })
      } else {
        callback(null)
      }
    },
    (err) => {
      console.error('Error listening to restaurant settings:', err)
      callback(null)
    }
  )
}


export const saveRestaurantProfile = async (restaurantId, profileData) => {
  if (!isFirebaseConfigured || !db || !restaurantId) return false
  await setDoc(doc(db, RESTAURANTS_COLLECTION, restaurantId), {
    name: profileData.restaurantName || profileData.name,
    slug: profileData.slug,
    isActive: profileData.isActive ?? true,
    allowOnlineOrders: profileData.allowOnlineOrders ?? false,
    updatedAt: serverTimestamp(),
  }, { merge: true })
  return true
}

export const saveRestaurantSettings = async (restaurantId, settings, customDb = null) => {
  const firestore = customDb || db
  if (!isFirebaseConfigured || !firestore || !restaurantId) return false
  try {
    const savePromise = setDoc(doc(firestore, RESTAURANTS_COLLECTION, restaurantId), {
      ...settings,
      updatedAt: serverTimestamp(),
    }, { merge: true })
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('saveRestaurantSettings timeout')), 4000)
    )
    await Promise.race([savePromise, timeoutPromise])
    return true
  } catch (err) {
    console.warn('Could not save restaurant settings:', err)
    return false
  }
}

export const createRestaurantOrder = async (restaurantId, orderPayload) => {
  if (!isFirebaseConfigured || !db || !restaurantId) return null
  const ordersRef = collection(db, RESTAURANTS_COLLECTION, restaurantId, ORDERS_SUBCOLLECTION)
  const orderRef = doc(ordersRef)

  await setDoc(orderRef, {
    ...orderPayload,
    restaurantId,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return orderRef.id
}

export const subscribeToRestaurantOrder = (restaurantId, orderId, onChange) => {
  if (!isFirebaseConfigured || !db || !restaurantId || !orderId) return () => {}
  const orderRef = doc(db, RESTAURANTS_COLLECTION, restaurantId, ORDERS_SUBCOLLECTION, orderId)
  return onSnapshot(orderRef, (snap) => {
    if (!snap.exists()) {
      onChange(null)
      return
    }
    onChange({ id: snap.id, ...snap.data() })
  })
}

export const cancelRestaurantOrder = async (restaurantId, orderId) => {
  if (!isFirebaseConfigured || !db || !restaurantId || !orderId) return false
  try {
    const orderRef = doc(db, RESTAURANTS_COLLECTION, restaurantId, ORDERS_SUBCOLLECTION, orderId)
    await deleteDoc(orderRef)
    return true
  } catch (error) {
    console.error("Error cancelling order:", error)
    return false
  }
}

export const deleteMenuRecord = async (restaurantId, customDb = null) => {
  const firestore = customDb || db
  if (!isFirebaseConfigured || !firestore || !restaurantId) return false
  try {
    const menuRef = doc(firestore, RESTAURANTS_COLLECTION, restaurantId, MENU_SUBCOLLECTION, CURRENT_MENU_DOC)
    await deleteDoc(menuRef)
    clearMenuCache(restaurantId)
    return true
  } catch (error) {
    console.error("Error deleting menu:", error)
    return false
  }
}

export const getWaiterCodes = async (restaurantId, customDb = null) => {
  const firestore = customDb || db
  if (!isFirebaseConfigured || !firestore || !restaurantId) return []
  try {
    const docRef = doc(firestore, 'waiterCodes', restaurantId)
    const snap = await getDoc(docRef)
    if (!snap.exists()) return []
    const data = snap.data()
    return Object.entries(data).map(([code, used]) => ({ code, used }))
  } catch (error) {
    console.error("Error getting waiter codes:", error)
    return []
  }
}

export const addWaiterCode = async (restaurantId, code, customDb = null) => {
  const firestore = customDb || db
  if (!isFirebaseConfigured || !firestore || !restaurantId) return false
  try {
    const docRef = doc(firestore, 'waiterCodes', restaurantId)
    await setDoc(docRef, { [code]: false }, { merge: true })
    return true
  } catch (error) {
    console.error("Error adding waiter code:", error)
    return false
  }
}

export const deleteWaiterCode = async (restaurantId, code, customDb = null) => {
  const firestore = customDb || db
  if (!isFirebaseConfigured || !firestore || !restaurantId) return false
  try {
    const docRef = doc(firestore, 'waiterCodes', restaurantId)
    await updateDoc(docRef, { [code]: deleteField() })
    return true
  } catch (error) {
    console.error("Error deleting waiter code:", error)
    return false
  }
}


/**
 * Multi-Project Connected Restaurants (Saved to Project 1 Firestore under users/{uid}/connected_restaurants)
 */
export const getConnectedRestaurants = async (uid) => {
  if (!isFirebaseConfigured || !db || !uid) return []
  try {
    const colRef = collection(db, USERS_COLLECTION, uid, 'connected_restaurants')
    const snap = await getDocs(colRef)
    const list = []
    snap.forEach((d) => {
      list.push({ id: d.id, ...d.data() })
    })
    return list
  } catch (err) {
    console.warn('Failed to load connected restaurants from Firestore:', err)
    return []
  }
}

export const saveConnectedRestaurant = async (uid, restaurantData) => {
  if (!isFirebaseConfigured || !db || !uid || !restaurantData?.id) return false
  try {
    const docRef = doc(db, USERS_COLLECTION, uid, 'connected_restaurants', restaurantData.id)
    await setDoc(docRef, {
      ...restaurantData,
      updatedAt: serverTimestamp(),
    }, { merge: true })
    return true
  } catch (err) {
    console.error('Failed to save connected restaurant to Firestore:', err)
    throw err
  }
}

export const deleteConnectedRestaurant = async (uid, restaurantId) => {
  if (!isFirebaseConfigured || !db || !uid || !restaurantId) return false
  try {
    const docRef = doc(db, USERS_COLLECTION, uid, 'connected_restaurants', restaurantId)
    await deleteDoc(docRef)
    return true
  } catch (err) {
    console.error('Failed to delete connected restaurant from Firestore:', err)
    return false
  }
}



