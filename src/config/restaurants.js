/**
 * Multi-Restaurant / Multi-Project Configuration
 * 
 * - Project 1 (Main Restaurant): Uses default Firebase credentials from .env
 * - Project 2 (Secondary Project): Uses VITE_RESTAURANT2_* credentials from .env
 * - Connected Restaurants: Onboarded branches loaded dynamically from Firestore (Project 1)
 *   and cached in localStorage for instant offline access.
 */

const STORAGE_KEY = 'connected_restaurants_list'

export const getDefaultMainRestaurant = () => {
  let cachedName = 'Main Restaurant'
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('main_restaurant_info')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.name) cachedName = parsed.name
      }
    } catch (e) {}
  }
  return {
    id: 'main',
    name: cachedName,
    restaurantId: null, // Resolves dynamically to profile?.restaurantId
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'main-project',
    isDefault: true,
    firebaseConfig: {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    },
  }
}

export const getSecondaryProjectEnvConfig = () => {
  const apiKey = import.meta.env.VITE_RESTAURANT2_API_KEY
  const projectId = import.meta.env.VITE_RESTAURANT2_PROJECT_ID
  const appId = import.meta.env.VITE_RESTAURANT2_APP_ID

  const isConfigured = Boolean(apiKey && projectId && appId)

  return {
    isConfigured,
    projectId: projectId || '',
    firebaseConfig: {
      apiKey: apiKey || '',
      authDomain: import.meta.env.VITE_RESTAURANT2_AUTH_DOMAIN || (projectId ? `${projectId}.firebaseapp.com` : ''),
      projectId: projectId || '',
      storageBucket: import.meta.env.VITE_RESTAURANT2_STORAGE_BUCKET || (projectId ? `${projectId}.appspot.com` : ''),
      messagingSenderId: import.meta.env.VITE_RESTAURANT2_MESSAGING_SENDER_ID || '',
      appId: appId || '',
    },
  }
}

export const getStoredConnectedRestaurants = () => {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.warn('Failed to parse connected restaurants from localStorage:', err)
    return []
  }
}

export const setStoredConnectedRestaurants = (restaurants) => {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(restaurants || []))
  } catch (err) {
    console.warn('Failed to write connected restaurants to localStorage:', err)
  }
}
