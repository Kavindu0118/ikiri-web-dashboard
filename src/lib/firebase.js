import { initializeApp, getApps } from 'firebase/app'
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const missingFirebaseConfigKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key)

export const isFirebaseConfigured = missingFirebaseConfigKeys.length === 0

const app = isFirebaseConfigured
  ? getApps()[0] ?? initializeApp(firebaseConfig)
  : null

export const db = app
  ? (() => {
      if (typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined') {
        try {
          return initializeFirestore(app, {
            localCache: persistentLocalCache({
              tabManager: persistentMultipleTabManager(),
            }),
          })
        } catch {
          return getFirestore(app)
        }
      }
      return getFirestore(app)
    })()
  : null
export const auth = app ? getAuth(app) : null

export const signInWithGoogle = async () => {
  if (!auth) throw new Error('Firebase not initialized')
  const provider = new GoogleAuthProvider()
  return signInWithPopup(auth, provider)
}

export const logoutUser = async () => {
  if (!auth) throw new Error('Firebase not initialized')
  return signOut(auth)
}

/**
 * Cached map of named Firestore instances for multi-project/multi-restaurant setup.
 */
const firestoreInstances = new Map()

export const getFirestoreForRestaurant = (restaurant) => {
  if (!restaurant) return db
  if (restaurant.isDefault || !restaurant.firebaseConfig?.projectId || !restaurant.firebaseConfig?.apiKey) {
    return db
  }

  const appName = `restaurant_app_${restaurant.id || restaurant.projectId}`

  if (firestoreInstances.has(appName)) {
    return firestoreInstances.get(appName)
  }

  const apps = getApps()
  const existingApp = apps.find((a) => a.name === appName)
  const secondaryApp = existingApp || initializeApp(restaurant.firebaseConfig, appName)

  let secondaryDb = null
  if (typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined') {
    try {
      secondaryDb = initializeFirestore(secondaryApp, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      })
    } catch {
      secondaryDb = getFirestore(secondaryApp)
    }
  } else {
    secondaryDb = getFirestore(secondaryApp)
  }

  firestoreInstances.set(appName, secondaryDb)
  return secondaryDb
}