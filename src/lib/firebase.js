import { initializeApp, getApps } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'

export const APP_FIREBASE_UID = 'fNtIEiakaJRzz9USQ2RHdmc2FPl2'
export const APP_RESTAURANT_ID = 'jy1PbeHtzCDlaxdXL5on'
export const APP_USER_EMAIL = 'owner@ikiri.local'
export const APP_USER_DISPLAY_NAME = 'Smart POS Owner'
export const GOOGLE_SIGN_IN_DISABLED = true

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

export const db = app ? getFirestore(app) : null
export const auth = app ? getAuth(app) : null

export const getAppSessionUser = () => ({
  uid: APP_FIREBASE_UID,
  email: APP_USER_EMAIL,
  displayName: APP_USER_DISPLAY_NAME,
  photoURL: null,
  providerId: 'custom',
})

// Temporary Google sign-in disable: keep the original implementation available so it can
// be re-enabled later by flipping GOOGLE_SIGN_IN_DISABLED to false.
export const signInWithGoogle = async () => {
  if (GOOGLE_SIGN_IN_DISABLED) return null
  if (!auth) throw new Error('Firebase not initialized')
  const provider = new GoogleAuthProvider()
  return signInWithPopup(auth, provider)
}

export const logoutUser = async () => {
  if (!auth) throw new Error('Firebase not initialized')
  return signOut(auth)
}