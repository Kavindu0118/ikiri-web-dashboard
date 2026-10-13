import { useState, useRef, useEffect } from 'react'

/**
 * Modern, custom Restaurant Selector Dropdown for the sidebar.
 * Replaces the default system select with an attractive, card-styled dropdown.
 */
export default function RestaurantDropdown({
  selectedRestaurant,
  availableRestaurants = [],
  isRestaurantLoading = false,
  onSelectRestaurant,
  onOpenConnectModal,
  maxLimitReached = false,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const handleSelect = (restaurantId) => {
    setIsOpen(false)
    if (restaurantId !== selectedRestaurant?.id) {
      onSelectRestaurant(restaurantId)
    }
  }

  const handleActionClick = () => {
    setIsOpen(false)
    onOpenConnectModal()
  }

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        id="restaurant-selector-trigger"
        onClick={() => !isRestaurantLoading && setIsOpen((prev) => !prev)}
        disabled={isRestaurantLoading}
        className={`w-full text-left rounded-xl bg-white border px-3 py-2.5 shadow-2xs transition-all duration-150 flex items-center justify-between gap-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${isOpen
          ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
          : 'border-emerald-200/90 hover:border-emerald-300 hover:shadow-xs'
          } ${isRestaurantLoading ? 'opacity-80 cursor-wait bg-emerald-50/20' : 'cursor-pointer'}`}
        title={
          isRestaurantLoading
            ? 'Switching restaurant...'
            : `Current: ${selectedRestaurant?.name || 'Restaurant'}`
        }
      >
        {/* Left info */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="relative flex-shrink-0">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${selectedRestaurant?.isDefault ? 'bg-emerald-500 ring-2 ring-emerald-100' : 'bg-blue-500 ring-2 ring-blue-100'
                }`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-neutral-900 truncate leading-snug">
              {selectedRestaurant?.name || 'Select Restaurant'}
            </p>
          </div>
        </div>

        {/* Right indicator: Spinner or Chevron */}
        <div className="flex-shrink-0 flex items-center justify-center text-neutral-400">
          {isRestaurantLoading ? (
            <svg
              className="animate-spin h-3.5 w-3.5 text-emerald-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-200 text-neutral-500 ${isOpen ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </div>
      </button>

      {/* Dropdown Menu (Pops UP above the button to stay clean in bottom sidebar) */}
      {isOpen && (
        <div
          id="restaurant-selector-popover"
          className="absolute bottom-full mb-2 left-0 right-0 w-full rounded-2xl bg-white border border-emerald-100 shadow-xl p-1.5 z-50 origin-bottom transition-all"
          style={{
            boxShadow: '0 12px 30px -4px rgba(16, 185, 129, 0.12), 0 8px 16px -4px rgba(0, 0, 0, 0.08)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-2.5 py-1.5 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Select Restaurant
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-neutral-100 text-neutral-600">
              {availableRestaurants.length}/2
            </span>
          </div>

          {/* Restaurant Options */}
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {availableRestaurants.map((r) => {
              const isSelected = r.id === selectedRestaurant?.id
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleSelect(r.id)}
                  className={`w-full text-left p-2 rounded-xl flex items-center justify-between gap-2.5 transition-all cursor-pointer ${isSelected
                    ? 'bg-emerald-50 border border-emerald-200/90 text-neutral-900 shadow-2xs'
                    : 'hover:bg-neutral-50 border border-transparent text-neutral-700'
                    }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span
                      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${r.isDefault ? 'bg-emerald-500' : 'bg-blue-500'
                        }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs truncate leading-snug ${isSelected ? 'font-bold text-emerald-950' : 'font-semibold'}`}>
                        {r.name}
                      </p>

                    </div>
                  </div>

                  {/* Active Checkmark */}
                  {isSelected && (
                    <div className="flex-shrink-0 text-emerald-600">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Action Row */}
          <div className="mt-1.5 pt-1.5 border-t border-neutral-100">
            {!maxLimitReached ? (
              <button
                type="button"
                onClick={handleActionClick}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold text-emerald-800 bg-emerald-50/70 hover:bg-emerald-100/80 transition-colors cursor-pointer group border border-emerald-200/60"
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-2xs group-hover:scale-105 transition-transform">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </div>
                  <span className="font-semibold text-emerald-900">Connect New Restaurant</span>
                </div>
                <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100/90 px-1.5 py-0.5 rounded">
                  1 slot free
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleActionClick}
                className="w-full text-center py-2 text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50/60 rounded-xl transition-colors cursor-pointer"
              >
                Manage Branch
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
