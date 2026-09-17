import { useState, useMemo } from 'react'
import { IconDownload, IconFileText, IconX } from './Icons'

export const SAMPLE_MENU_JSON = {
  menuTitle: "Signature Restaurant Menu",
  restaurantName: "Surf House Beach Club",
  notes: "All prices include service and tax.",
  sections: [
    {
      title: "Breakfast & Bowls",
      items: [
        {
          name: "Tropical Acai Bowl",
          price: "1450.00",
          description: "Organic acai blended with banana, topped with kiwi, chia seeds and roasted granola.",
          imageUrl: ""
        },
        {
          name: "Avocado Sourdough Toast",
          price: "1250.00",
          description: "Poached eggs, mashed avocado, feta crumble and chili flakes on artisanal sourdough.",
          imageUrl: ""
        },
        {
          name: "Classic Shakshuka",
          price: "1350.00",
          description: "Eggs gently poached in a spiced tomato, pepper and onion sauce with warm pita.",
          imageUrl: ""
        }
      ],
      subcategories: [
        {
          title: "Fresh Breakfast Juices",
          items: [
            {
              name: "Fresh Orange Juice",
              price: "850.00",
              description: "100% cold-pressed local sweet oranges.",
              imageUrl: ""
            },
            {
              name: "Green Detox Glow",
              price: "950.00",
              description: "Cucumber, green apple, celery, spinach, ginger and lime.",
              imageUrl: ""
            }
          ]
        }
      ]
    },
    {
      title: "Mains & Burgers",
      items: [
        {
          name: "Surf House Wagyu Burger",
          price: "2450.00",
          description: "Grilled wagyu beef patty, smoked cheddar, bacon jam, brioche bun with crispy fries.",
          imageUrl: ""
        },
        {
          name: "Grilled Mahi-Mahi Fillet",
          price: "2650.00",
          description: "Fresh ocean catch served with lemon-garlic butter, asparagus and mashed potatoes.",
          imageUrl: ""
        },
        {
          name: "Creamy Truffle Pasta",
          price: "2100.00",
          description: "Handmade fettuccine with wild mushroom medley and black truffle cream sauce.",
          imageUrl: ""
        }
      ]
    },
    {
      title: "Beverages & Cocktails",
      items: [
        {
          name: "Iced Coconut Latte",
          price: "850.00",
          description: "Double espresso shot with fresh creamy coconut milk over ice.",
          imageUrl: ""
        },
        {
          name: "Signature Passion Mojito",
          price: "1650.00",
          description: "White rum, fresh passion fruit pulp, crushed mint, lime and sparkling soda.",
          imageUrl: ""
        },
        {
          name: "Chilled King Coconut",
          price: "450.00",
          description: "Fresh whole king coconut served chilled.",
          imageUrl: ""
        }
      ]
    }
  ]
}

export function normalizeMenuJson(parsedData) {
  let menuTitle = ''
  let restaurantName = ''
  let notes = ''
  let rawSections = []

  if (Array.isArray(parsedData)) {
    if (parsedData.length > 0 && (parsedData[0].title || parsedData[0].section || parsedData[0].items)) {
      rawSections = parsedData
    } else if (parsedData.length > 0 && (parsedData[0].name || parsedData[0].itemName)) {
      // Group flat items by category
      const grouped = {}
      parsedData.forEach(item => {
        const cat = item.category || item.section || 'General'
        if (!grouped[cat]) grouped[cat] = []
        grouped[cat].push(item)
      })
      rawSections = Object.keys(grouped).map(catName => ({
        title: catName,
        items: grouped[catName]
      }))
    }
  } else if (typeof parsedData === 'object' && parsedData !== null) {
    menuTitle = parsedData.menuTitle || parsedData.title || ''
    restaurantName = parsedData.restaurantName || ''
    notes = parsedData.notes || ''

    if (Array.isArray(parsedData.sections)) {
      rawSections = parsedData.sections
    } else if (Array.isArray(parsedData.categories)) {
      rawSections = parsedData.categories
    } else if (Array.isArray(parsedData.items)) {
      const grouped = {}
      parsedData.items.forEach(item => {
        const cat = item.category || item.section || 'General'
        if (!grouped[cat]) grouped[cat] = []
        grouped[cat].push(item)
      })
      rawSections = Object.keys(grouped).map(catName => ({
        title: catName,
        items: grouped[catName]
      }))
    } else {
      const keys = Object.keys(parsedData)
      const possibleCategories = keys.filter(k => Array.isArray(parsedData[k]))
      if (possibleCategories.length > 0) {
        rawSections = possibleCategories.map(catName => ({
          title: catName,
          items: parsedData[catName]
        }))
      }
    }
  }

  const normalizedSections = rawSections.map((sec, secIdx) => {
    const sectionTitle = String(sec.title || sec.name || sec.category || `Section ${secIdx + 1}`).trim()
    const sectionId = sec.id || `sec-${Date.now()}-${secIdx}-${Math.floor(Math.random() * 10000)}`

    const normalizedSubs = Array.isArray(sec.subcategories) ? sec.subcategories.map((sub, subIdx) => {
      const subTitle = String(sub.title || sub.name || `Subcategory ${subIdx + 1}`).trim()
      const subId = sub.id || `sub-${Date.now()}-${subIdx}-${Math.floor(Math.random() * 10000)}`
      const subItems = Array.isArray(sub.items) ? sub.items.map((it, itIdx) => ({
        id: it.id || `itm-${Date.now()}-${subIdx}-${itIdx}-${Math.floor(Math.random() * 10000)}`,
        name: String(it.name || it.title || it.itemName || 'Untitled Item').trim(),
        price: it.price !== undefined && it.price !== null ? String(it.price).replace(/[^0-9.]/g, '') : '',
        description: String(it.description || it.desc || '').trim(),
        imageUrl: String(it.imageUrl || it.image || '').trim()
      })) : []
      return {
        id: subId,
        title: subTitle,
        items: subItems
      }
    }) : []

    const normalizedItems = Array.isArray(sec.items) ? sec.items.map((it, itIdx) => ({
      id: it.id || `itm-${Date.now()}-${secIdx}-${itIdx}-${Math.floor(Math.random() * 10000)}`,
      name: String(it.name || it.title || it.itemName || 'Untitled Item').trim(),
      price: it.price !== undefined && it.price !== null ? String(it.price).replace(/[^0-9.]/g, '') : '',
      description: String(it.description || it.desc || '').trim(),
      imageUrl: String(it.imageUrl || it.image || '').trim()
    })) : []

    return {
      id: sectionId,
      title: sectionTitle,
      items: normalizedItems,
      subcategories: normalizedSubs
    }
  })

  let totalItemsCount = 0
  normalizedSections.forEach(s => {
    totalItemsCount += (s.items?.length || 0)
    s.subcategories?.forEach(sub => {
      totalItemsCount += (sub.items?.length || 0)
    })
  })

  return {
    menuTitle,
    restaurantName,
    notes,
    sections: normalizedSections,
    totalSectionsCount: normalizedSections.length,
    totalItemsCount
  }
}

export default function JsonMenuModal({
  isOpen,
  onClose,
  onApplyJson,
  currentMenuTitle = ''
}) {
  const [activeTab, setActiveTab] = useState('input') // 'input' | 'sample'
  const [jsonText, setJsonText] = useState('')
  const [importMode, setImportMode] = useState('replace') // 'replace' | 'append'
  const [updateTitles, setUpdateTitles] = useState(true)
  const [copiedSample, setCopiedSample] = useState(false)
  const [fileName, setFileName] = useState('')

  const sampleJsonFormatted = useMemo(() => {
    return JSON.stringify(SAMPLE_MENU_JSON, null, 2)
  }, [])

  // Live JSON validation and parsing
  const parseResult = useMemo(() => {
    const trimmed = jsonText.trim()
    if (!trimmed) {
      return { isValid: false, isEmpty: true, error: null, data: null }
    }
    try {
      const parsed = JSON.parse(trimmed)
      const normalized = normalizeMenuJson(parsed)
      if (normalized.totalSectionsCount === 0 && normalized.totalItemsCount === 0) {
        return {
          isValid: false,
          isEmpty: false,
          error: 'No valid sections or items found in JSON structure. Please check sample format.',
          data: null
        }
      }
      return {
        isValid: true,
        isEmpty: false,
        error: null,
        data: normalized
      }
    } catch (err) {
      return {
        isValid: false,
        isEmpty: false,
        error: `JSON Syntax Error: ${err.message}`,
        data: null
      }
    }
  }, [jsonText])

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result
      if (typeof content === 'string') {
        setJsonText(content)
      }
    }
    reader.readAsText(file)
  }

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setJsonText(text)
        setFileName('Pasted from Clipboard')
      }
    } catch {
      alert('Could not access clipboard. Please paste manually into the text area.')
    }
  }

  const handleCopySample = () => {
    navigator.clipboard.writeText(sampleJsonFormatted)
    setCopiedSample(true)
    setTimeout(() => setCopiedSample(false), 2500)
  }

  const handleDownloadSample = () => {
    const blob = new Blob([sampleJsonFormatted], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sample_menu_structure.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleLoadSampleIntoEditor = () => {
    setJsonText(sampleJsonFormatted)
    setFileName('Sample Menu Loaded')
    setActiveTab('input')
  }

  const handleApply = () => {
    if (!parseResult.isValid || !parseResult.data) return
    onApplyJson(parseResult.data, {
      mode: importMode,
      updateTitles
    })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 text-green-700 flex items-center justify-center font-mono font-bold text-lg shadow-2xs">
              {'{ }'}
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900">Automatic Menu Setup via JSON</h3>
              <p className="text-xs text-neutral-500">Upload a JSON file or paste structured JSON to populate sections & items automatically</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition"
            title="Close"
          >
            <IconX />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-200 bg-neutral-100/60 p-1.5 gap-2 px-6">
          <button
            type="button"
            onClick={() => setActiveTab('input')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition duration-150 flex items-center justify-center gap-2 ${
              activeTab === 'input'
                ? 'bg-white text-green-800 shadow-xs border border-neutral-200/80'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/60'
            }`}
          >
            <span>📥</span> Paste or Upload JSON
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sample')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition duration-150 flex items-center justify-center gap-2 ${
              activeTab === 'sample'
                ? 'bg-white text-green-800 shadow-xs border border-neutral-200/80'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/60'
            }`}
          >
            <span>📖</span> Sample Structure & Format Guide
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'input' ? (
            <>
              {/* File Upload / Quick Buttons Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* File picker button */}
                <label className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-green-300 bg-green-50/40 hover:bg-green-50 text-green-800 cursor-pointer transition text-xs font-semibold text-center">
                  <IconFileText />
                  <span>Choose JSON File</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>

                {/* Paste from clipboard */}
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 transition text-xs font-semibold shadow-2xs"
                >
                  <span>📋</span> Paste Clipboard
                </button>

                {/* Load Sample into Editor */}
                <button
                  type="button"
                  onClick={handleLoadSampleIntoEditor}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 transition text-xs font-semibold shadow-2xs"
                >
                  <span>⚡</span> Insert Sample Data
                </button>
              </div>

              {fileName && (
                <div className="flex items-center justify-between text-xs px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-600">
                  <span className="truncate">Active Source: <strong>{fileName}</strong></span>
                  <button
                    type="button"
                    onClick={() => { setJsonText(''); setFileName('') }}
                    className="text-neutral-400 hover:text-red-500 font-bold ml-2"
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* Textarea for JSON */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-neutral-700">
                  <span>JSON Payload:</span>
                  <span className="text-[11px] font-normal text-neutral-400">
                    Supports nested categories, subcategories, flat item lists, or key-value structures
                  </span>
                </div>
                <textarea
                  value={jsonText}
                  onChange={(e) => {
                    setJsonText(e.target.value)
                    if (fileName && fileName !== 'Custom Input') setFileName('Custom Input')
                  }}
                  rows={9}
                  placeholder={`Paste your menu JSON here or click "Insert Sample Data" above...\n\nExample:\n{\n  "sections": [\n    {\n      "title": "Starters",\n      "items": [\n        { "name": "Garlic Bread", "price": "650.00" }\n      ]\n    }\n  ]\n}`}
                  className="w-full rounded-xl border border-neutral-300 p-3 font-mono text-xs text-neutral-800 bg-neutral-50/50 outline-none focus:border-green-500 focus:bg-white transition"
                  spellCheck={false}
                />
              </div>

              {/* Validation Status Card */}
              {parseResult.isEmpty ? (
                <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50/70 text-xs text-neutral-500 flex items-center gap-2">
                  <span>ℹ️</span> Paste your JSON text or upload a <code>.json</code> file to see live parsing results.
                </div>
              ) : parseResult.isValid ? (
                <div className="p-3.5 rounded-xl border border-green-300 bg-green-50/60 text-xs text-green-900 space-y-2">
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm">✓</span> Valid Menu JSON Detected
                    </span>
                    <span className="bg-green-200 text-green-800 px-2 py-0.5 rounded-md text-[11px]">
                      {parseResult.data.totalSectionsCount} Sections · {parseResult.data.totalItemsCount} Items
                    </span>
                  </div>

                  {/* Summary of parsed sections */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {parseResult.data.sections.map((sec, idx) => {
                      const count = (sec.items?.length || 0) + (sec.subcategories?.reduce((acc, sub) => acc + (sub.items?.length || 0), 0) || 0)
                      return (
                        <span key={idx} className="bg-white border border-green-200 text-green-900 px-2 py-1 rounded-lg text-[11px] font-medium shadow-2xs">
                          📁 {sec.title} ({count} items)
                        </span>
                      )
                    })}
                  </div>

                  {parseResult.data.menuTitle && (
                    <p className="text-[11px] text-green-700 pt-0.5">
                      Menu Title: <strong>{parseResult.data.menuTitle}</strong>
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-xs text-red-800 flex items-start gap-2">
                  <span className="text-base leading-none">⚠️</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold">Invalid JSON Payload</p>
                    <p className="mt-0.5 font-mono text-[11px] text-red-600 break-words">{parseResult.error}</p>
                  </div>
                </div>
              )}

              {/* Import Mode Options */}
              <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/40 space-y-3">
                <span className="block text-xs font-bold text-neutral-800">Import Strategy:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                    importMode === 'replace'
                      ? 'border-green-500 bg-green-50/50 text-green-900'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                  }`}>
                    <input
                      type="radio"
                      name="importMode"
                      value="replace"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                      className="mt-0.5 text-green-600"
                    />
                    <div>
                      <span className="font-bold block">Replace Current Menu</span>
                      <span className="text-[11px] text-neutral-500 leading-tight block mt-0.5">
                        Overwrites existing sections and items with this JSON.
                      </span>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                    importMode === 'append'
                      ? 'border-green-500 bg-green-50/50 text-green-900'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                  }`}>
                    <input
                      type="radio"
                      name="importMode"
                      value="append"
                      checked={importMode === 'append'}
                      onChange={() => setImportMode('append')}
                      className="mt-0.5 text-green-600"
                    />
                    <div>
                      <span className="font-bold block">Append to Existing Menu</span>
                      <span className="text-[11px] text-neutral-500 leading-tight block mt-0.5">
                        Keeps existing menu items and adds the new categories & items.
                      </span>
                    </div>
                  </label>
                </div>

                {parseResult.data?.menuTitle && (
                  <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={updateTitles}
                      onChange={(e) => setUpdateTitles(e.target.checked)}
                      className="rounded text-green-600"
                    />
                    <span>Update menu title to "{parseResult.data.menuTitle}"</span>
                  </label>
                )}
              </div>
            </>
          ) : (
            /* Sample JSON View & Guide */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">Standard Menu JSON Format</h4>
                  <p className="text-xs text-neutral-500 mt-0.5">You can copy or download this sample file to fill in your restaurant menu items</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopySample}
                    className="btn-ghost !text-xs !px-3 !py-1.5 font-semibold flex items-center gap-1.5 rounded-lg border border-neutral-200 shadow-2xs"
                  >
                    {copiedSample ? '✓ Copied!' : 'Copy Sample JSON'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadSample}
                    className="btn-green !text-xs !px-3 !py-1.5 font-semibold flex items-center gap-1.5 rounded-lg shadow-2xs text-white"
                  >
                    <IconDownload />
                    Download .json
                  </button>
                </div>
              </div>

              {/* JSON code container */}
              <div className="relative rounded-xl border border-neutral-300 bg-neutral-900 p-4 text-xs font-mono text-green-400 overflow-x-auto max-h-[380px] shadow-inner">
                <pre>{sampleJsonFormatted}</pre>
              </div>

              {/* Structure Explanation Table */}
              <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50 space-y-2 text-xs text-neutral-700">
                <h5 className="font-bold text-neutral-900">Fields Specification:</h5>
                <ul className="list-disc pl-5 space-y-1 text-neutral-600 text-[11px]">
                  <li><code>menuTitle</code> <em>(Optional)</em>: Main title of your menu (e.g., "Dinner Menu").</li>
                  <li><code>sections</code> <em>(Array)</em>: List of categories/sections. Each must have a <code>title</code> and an <code>items</code> array.</li>
                  <li><code>items</code> <em>(Array)</em>: List of food/beverage items. Required: <code>name</code> and <code>price</code>. Optional: <code>description</code>, <code>imageUrl</code>.</li>
                  <li><code>subcategories</code> <em>(Optional Array)</em>: Nested subcategories inside a section with their own <code>items</code>.</li>
                  <li><strong>Alternative Formats</strong>: You can also pass a direct array of items with a <code>category</code> property (e.g. <code>[&#123; "name": "Burger", "category": "Mains", "price": 1200 &#125;]</code>).</li>
                </ul>
              </div>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={handleLoadSampleIntoEditor}
                  className="btn-green text-xs py-2 px-4 rounded-xl font-bold shadow-xs inline-flex items-center gap-2"
                >
                  Load this Sample into Editor & Apply →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-100 bg-neutral-50/80">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost text-xs px-4 py-2 border-neutral-300 rounded-xl"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {activeTab === 'input' && (
              <button
                type="button"
                onClick={handleApply}
                disabled={!parseResult.isValid || !parseResult.data}
                className="btn-green text-xs font-bold px-5 py-2 rounded-xl shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <span>⚡</span>
                Apply & Setup Menu ({parseResult.data?.totalItemsCount || 0} Items)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
