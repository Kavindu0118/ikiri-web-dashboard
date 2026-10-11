import { useState, useEffect } from 'react'
import { IconX } from './Icons'
import { getSecondaryProjectEnvConfig } from '../config/restaurants'

export default function ConnectRestaurantModal({ isOpen, onClose, onSave, connectedRestaurants = [], onDelete }) {
  const [name, setName] = useState('')
  const [restaurantId, setRestaurantId] = useState('')
  const [userId, setUserId] = useState('')
  const [ownerName, setOwnerName] = useState('')

  // Advanced custom credentials toggle (optional)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [customProjectId, setCustomProjectId] = useState('')
  const [customApiKey, setCustomApiKey] = useState('')
  const [customAppId, setCustomAppId] = useState('')

  const [error, setError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('add') // 'add' or 'manage'

  const envConfig = getSecondaryProjectEnvConfig()
  const isMaxReached = connectedRestaurants.length >= 1

  useEffect(() => {
    if (isMaxReached) {
      setActiveTab('manage')
    }
  }, [isMaxReached, isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (isMaxReached) {
      setError('Maximum of 2 restaurants reached (1 Main + 1 Connected Branch). Disconnect the current branch to add another.')
      return
    }

    if (!name.trim()) {
      setError('Please enter a display name for the restaurant.')
      return
    }
    if (!restaurantId.trim()) {
      setError('Please enter the restaurant ID.')
      return
    }

    // Determine config: use custom override if provided, otherwise pull from .env
    const pId = customProjectId.trim() || envConfig.projectId
    const aKey = customApiKey.trim() || envConfig.firebaseConfig.apiKey
    const aId = customAppId.trim() || envConfig.firebaseConfig.appId

    const fbConfig = {
      apiKey: aKey,
      authDomain: envConfig.firebaseConfig.authDomain || (pId ? `${pId}.firebaseapp.com` : ''),
      projectId: pId,
      storageBucket: envConfig.firebaseConfig.storageBucket || (pId ? `${pId}.appspot.com` : ''),
      messagingSenderId: envConfig.firebaseConfig.messagingSenderId,
      appId: aId,
    }

    setIsSubmitting(true)
    try {
      const uniqueId = `branch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      const restaurantData = {
        id: uniqueId,
        name: name.trim(),
        restaurantId: restaurantId.trim(),
        userId: userId.trim(),
        ownerName: ownerName.trim(),
        projectId: pId || 'project-2',
        isDefault: false,
        firebaseConfig: fbConfig,
      }

      await onSave(restaurantData)
      handleClose()
    } catch (err) {
      console.error('Failed to save restaurant:', err)
      setError(err.message || 'Failed to connect restaurant.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setName('')
    setRestaurantId('')
    setUserId('')
    setOwnerName('')
    setCustomProjectId('')
    setCustomApiKey('')
    setCustomAppId('')
    setShowAdvanced(false)
    setError(null)
    setActiveTab(isMaxReached ? 'manage' : 'add')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-neutral-100 overflow-hidden my-8 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-5 bg-gradient-to-r from-emerald-50/60 to-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-neutral-900">
                {isMaxReached ? 'Manage Connected Restaurant' : 'Connect New Restaurant'}
              </h3>
              <p className="text-xs text-neutral-500">
                {isMaxReached ? 'Dashboard limit reached (2/2 restaurants)' : 'Add secondary branch from your second Firebase project'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition"
          >
            <IconX />
          </button>
        </div>

        {/* Tab selection */}
        {connectedRestaurants.length > 0 && (
          <div className="flex border-b border-neutral-100 px-6 bg-neutral-50/50">
            <button
              type="button"
              onClick={() => setActiveTab('manage')}
              className={`py-3 px-4 text-xs font-semibold border-b-2 transition ${activeTab === 'manage'
                ? 'border-emerald-600 text-emerald-800'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
                }`}
            >
              Manage Connected ({connectedRestaurants.length}/1)
            </button>
            {!isMaxReached && (
              <button
                type="button"
                onClick={() => setActiveTab('add')}
                className={`py-3 px-4 text-xs font-semibold border-b-2 transition ${activeTab === 'add'
                  ? 'border-emerald-600 text-emerald-800'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800'
                  }`}
              >
                + Add Restaurant
              </button>
            )}
          </div>
        )}

        {/* Body */}
        {activeTab === 'manage' ? (
          <div className="p-6 space-y-4">
            {isMaxReached && (
              <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200/90 text-amber-900 text-xs shadow-2xs">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-amber-600">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span className="leading-relaxed">
                  <strong>Limit reached (2 restaurants max):</strong> You have reached the maximum allowed limit of 2 restaurants (1 Main + 1 Connected Branch). To connect a different restaurant, disconnect this branch first.
                </span>
              </div>
            )}
            <p className="text-xs text-neutral-500">
              Below is the secondary restaurant connected to this dashboard. You can disconnect it at any time to connect a different branch.
            </p>
            <div className="space-y-2.5 max-h-80 overflow-y-auto">
              {connectedRestaurants.map((rest) => (
                <div
                  key={rest.id}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200/70"
                >
                  <div className="min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      <h4 className="text-sm font-bold text-neutral-900 truncate">{rest.name}</h4>
                    </div>
                    <p className="text-[11px] text-neutral-500 truncate mt-1">
                      Restaurant ID: <span className="font-mono text-neutral-800 font-semibold">{rest.restaurantId}</span>
                      {rest.userId && <> • User ID: <span className="font-mono text-neutral-800 font-semibold">{rest.userId}</span></>}
                      {rest.ownerName && <> • Owner: <span className="text-neutral-800 font-semibold">{rest.ownerName}</span></>}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDelete && onDelete(rest.id)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 transition border border-rose-200/60"
                  >
                    Disconnect
                  </button>
                </div>
              ))}
            </div>
            {!isMaxReached && (
              <div className="pt-3 border-t border-neutral-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveTab('add')}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition"
                >
                  + Add Restaurant
                </button>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 font-medium flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </div>
            )}



            {/* Restaurant Display Name */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Restaurant Display Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Galle Beach Branch or Down Town Cafe"
                className="w-full text-xs font-medium bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5 text-neutral-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
            </div>

            {/* Firestore Restaurant ID */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Restaurant ID <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={restaurantId}
                onChange={(e) => setRestaurantId(e.target.value)}
                placeholder="e.g. rest_123456789 or restaurant doc id"
                className="w-full text-xs font-mono bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5 text-neutral-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
              <p className="text-[10px] text-neutral-400 mt-1">
                This is the restaurant document ID inside your secondary Firestore database.
              </p>
            </div>

            {/* Firestore User ID */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Owner / User ID <span className="text-neutral-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="e.g. user document ID in secondary project"
                className="w-full text-xs font-mono bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5 text-neutral-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
              <p className="text-[10px] text-neutral-400 mt-1">
                User document ID in the secondary project's users collection to load the owner name.
              </p>
            </div>

            {/* Owner Name */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Owner Name <span className="text-neutral-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="e.g. John Doe (fallback owner name)"
                className="w-full text-xs font-medium bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5 text-neutral-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
              <p className="text-[10px] text-neutral-400 mt-1">
                Name of the owner for this branch. If empty, it will be fetched from the User ID profile.
              </p>
            </div>

            {/* Optional Advanced Override */}
            <div className="pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 transition"
              >
                <span>{showAdvanced ? '▾ Hide Custom Credentials' : '▸ Advanced: Override Project Credentials'}</span>
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-2.5 bg-neutral-50/70 p-3 rounded-2xl border border-neutral-200/60">
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600 mb-0.5">Project ID (optional)</label>
                    <input
                      type="text"
                      value={customProjectId}
                      onChange={(e) => setCustomProjectId(e.target.value)}
                      placeholder={envConfig.projectId || 'my-project-id'}
                      className="w-full text-xs font-mono bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600 mb-0.5">API Key (optional)</label>
                    <input
                      type="text"
                      value={customApiKey}
                      onChange={(e) => setCustomApiKey(e.target.value)}
                      placeholder="AIzaSy..."
                      className="w-full text-xs font-mono bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600 mb-0.5">App ID (optional)</label>
                    <input
                      type="text"
                      value={customAppId}
                      onChange={(e) => setCustomAppId(e.target.value)}
                      placeholder="1:123456789:web:abcdef"
                      className="w-full text-xs font-mono bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-100">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-neutral-600 hover:bg-neutral-100 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Connecting...</span>
                  </>
                ) : (
                  <span>Connect Restaurant</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
