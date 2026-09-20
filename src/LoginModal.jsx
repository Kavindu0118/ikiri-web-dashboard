import { useEffect } from 'react'
import { APP_RESTAURANT_ID, GOOGLE_SIGN_IN_DISABLED } from './lib/firebase'
import { getUserProfile } from './lib/menuStorage'

export default function LoginModal({ user, onComplete }) {
  if (GOOGLE_SIGN_IN_DISABLED) {
    return null
  }
  useEffect(() => {
    let isMounted = true

    async function resolveProfile() {
      if (!user?.uid) {
        return
      }

      const baseProfile = await getUserProfile(user.uid)
      const profile = {
        uid: user.uid,
        ...(baseProfile || {}),
        ownerName: baseProfile?.ownerName || user.displayName || 'Smart POS Owner',
        email: baseProfile?.email || user.email || 'owner@ikiri.local',
        restaurantId: APP_RESTAURANT_ID,
      }

      if (isMounted) {
        onComplete(profile)
      }
    }

    resolveProfile()
    return () => {
      isMounted = false
    }
  }, [user, onComplete])

  return null
}
