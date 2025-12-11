// Import Yjs and y-websocket as ES modules
import * as Y from 'https://cdn.skypack.dev/yjs@13.6.27'
import { WebsocketProvider } from 'https://cdn.skypack.dev/y-websocket@3.0.0'

// Make Y available globally for inline scripts
if (typeof window !== 'undefined') {
  window.Y = Y
  window.WebsocketProvider = WebsocketProvider
}

// Wait for DOM to be ready
function init() {
  console.log('Initializing Yjs client...')
  console.log('Connecting to WebSocket...')

  // Create Yjs document
  const ydoc = new Y.Doc()
  console.log('Yjs Doc created with clientID:', ydoc.clientID)
  
  // Create shared types - use Y.Map for structured data
  const rootMap = ydoc.getMap('root')
  console.log('Root map keys on load:', Array.from(rootMap.keys()))
  
  var isReady = false

  function updateStatus(status, color) {
    var statusEl = document.getElementById('status')
    if (statusEl) {
      statusEl.textContent = status
      statusEl.style.color = color || 'black'
    }
  }

  // Connect to WebSocket provider
  const wsProvider = new WebsocketProvider('ws://localhost:8081', 'whiteboard-room', ydoc)

  wsProvider.on('status', (event) => {
    console.log('[ws] status event:', event.status)
    if (event.status === 'connected') {
      updateStatus('Connected', 'green')
      isReady = true
    } else if (event.status === 'connecting') {
      updateStatus('Connecting...', 'orange')
    } else if (event.status === 'disconnected') {
      updateStatus('Disconnected', 'red')
      isReady = false
    }
  })

  wsProvider.on('sync', (isSynced) => {
    console.log('[ws] sync event:', isSynced)
    if (isSynced) {
      updateStatus('Connected', 'green')
      isReady = true
    }
  })

  wsProvider.on('connection-error', (error) => {
    console.error('[ws] connection error:', error)
    updateStatus('Connection Error', 'red')
    isReady = false
  })

  wsProvider.on('connection-close', () => {
    console.log('[ws] connection closed')
    updateStatus('Disconnected', 'red')
    isReady = false
  })

  // Initialize counter
  console.log('Initializing counter...')
  
  // Counter via CRDT log of deltas (Y.Array of ints)
  let counterOps = rootMap.get('counterOps')
  if (!counterOps) {
    counterOps = new Y.Array()
    rootMap.set('counterOps', counterOps)
    console.log('[counter] created counterOps array')
  } else {
    console.log('[counter] using existing counterOps with length:', counterOps.length)
  }
  // Rebind to the canonical integrated instance from the map
  counterOps = rootMap.get('counterOps')
  console.log('[counter] counterOps is Y.Array:', counterOps instanceof Y.Array, 'constructor:', counterOps?.constructor?.name, 'length:', counterOps?.length)

  function currentCounterValue() {
    const arr = counterOps ? counterOps.toArray() : []
    const sum = arr.reduce((acc, v) => acc + (Number(v) || 0), 0)
    return sum
  }

  // Listen for counter changes on counterOps
  counterOps.observe((event) => {
    console.log('[counter] counterOps changed; length now', counterOps.length, 'event:', event)
    console.log('[counter] current value after change:', currentCounterValue())
    updateCounter()
  })

  // Fallback: listen to any doc update to re-render counter (covers missed observers)
  ydoc.on('update', () => {
    console.log('[counter] doc update received; recomputing counter')
    updateCounter()
  })

  function updateCounter() {
    const counterValue = currentCounterValue()
    var counterElement = document.getElementById('counter')
    if (counterElement) {
      const before = counterElement.textContent
      counterElement.textContent = String(counterValue)
      console.log('Counter UI updated to', counterValue, '(was:', before, ')')
    } else {
      console.warn('Counter element not found')
    }
  }

  // Initial counter update
  updateCounter()

  // Initialize whiteboard
  console.log('Initializing whiteboard...')
  
  // Get or create shapes array
  let shapesArray = rootMap.get('shapes')
  if (!shapesArray) {
    shapesArray = new Y.Array()
    rootMap.set('shapes', shapesArray)
    console.log('Created shapes array')
  } else {
    console.log('Shapes array already present with length:', shapesArray.length)
  }

  // Initialize whiteboard UI
  function tryInitWhiteboard() {
    if (typeof window.initYjsWhiteboard === 'function') {
      console.log('Calling window.initYjsWhiteboard...')
      window.initYjsWhiteboard(shapesArray)
    } else {
      console.log('window.initYjsWhiteboard not ready yet, retrying in 100ms...')
      setTimeout(tryInitWhiteboard, 100)
    }
  }

  // On sync, initialize whiteboard (counterOps works offline/online)
  wsProvider.on('sync', (isSynced) => {
    if (isSynced) {
      console.log('[ws] sync -> initialize whiteboard and counter UI')
      updateCounter()
      tryInitWhiteboard()
    }
  })

  // If already synced (e.g., fast reconnect)
  if (wsProvider.synced) {
    updateCounter()
    tryInitWhiteboard()
  }

  // Counter increment button
  var incrementBtn = document.getElementById('incrementBtn')
  if (incrementBtn) {
    incrementBtn.addEventListener('click', () => {
      console.log('[ui] increment button clicked; isReady:', isReady, 'ws synced:', wsProvider.synced)
      if (!isReady) {
        console.error('Document not ready yet. Please wait for connection.')
        alert('Document not ready yet. Please wait for connection.')
        return
      }
      
      const canonical = rootMap.get('counterOps')
      console.log('[counter] appending increment op; counterOps length before:', counterOps.length, 'same instance as rootMap.get?', counterOps === canonical)
      try {
        if (!canonical || typeof canonical.push !== 'function') {
          console.error('[counter] counterOps missing or invalid:', canonical)
          return
        }
        canonical.push([1]) // log an increment event
        counterOps = canonical // keep local reference in sync
        const newLen = canonical.length
        console.log('[counter] increment op appended; total ops:', newLen, 'current value:', currentCounterValue(), 'rootMap.get len:', rootMap.get('counterOps')?.length)
      } catch (error) {
        console.error('Error incrementing counter:', error)
        alert('Error incrementing counter: ' + error.message)
      }
    })
  } else {
    console.warn('[ui] increment button not found in DOM')
  }

  // Log current counter shortly after init for debugging
  setTimeout(() => {
    console.log('[debug] post-init counter value:', currentCounterValue(), 'ops length:', counterOps.length)
  }, 500)
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
