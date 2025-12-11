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
  
  // Create shared types - use Y.Map for structured data
  const rootMap = ydoc.getMap('root')
  
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
    console.log('WebSocket status:', event.status)
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
    console.log('Sync status:', isSynced)
    if (isSynced) {
      updateStatus('Connected', 'green')
      isReady = true
    }
  })

  wsProvider.on('connection-error', (error) => {
    console.error('Connection error:', error)
    updateStatus('Connection Error', 'red')
    isReady = false
  })

  wsProvider.on('connection-close', () => {
    console.log('WebSocket closed')
    updateStatus('Disconnected', 'red')
    isReady = false
  })

  // Initialize counter
  console.log('Initializing counter...')
  
  // Get or create counter
  let counter = rootMap.get('counter')
  if (!counter) {
    counter = new Y.Map()
    rootMap.set('counter', counter)
    counter.set('value', 0)
  }

  // Listen for counter changes
  counter.observe((event) => {
    console.log('Counter changed')
    updateCounter()
  })

  function updateCounter() {
    const counterValue = counter.get('value') || 0
    var counterElement = document.getElementById('counter')
    if (counterElement) {
      counterElement.textContent = counterValue
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

  // Wait for sync before initializing whiteboard
  // Also set up a timeout fallback in case sync event doesn't fire
  let initTimeout = setTimeout(() => {
    console.log('Initializing whiteboard after timeout...')
    tryInitWhiteboard()
  }, 1000)

  if (wsProvider.synced) {
    clearTimeout(initTimeout)
    tryInitWhiteboard()
  } else {
    wsProvider.once('sync', () => {
      clearTimeout(initTimeout)
      tryInitWhiteboard()
    })
  }
  
  // Also try to initialize after a short delay to ensure DOM is ready
  setTimeout(() => {
    if (typeof window.initYjsWhiteboard === 'function' && !window.shapesArray) {
      tryInitWhiteboard()
    }
  }, 500)

  // Counter increment button
  var incrementBtn = document.getElementById('incrementBtn')
  if (incrementBtn) {
    incrementBtn.addEventListener('click', () => {
      if (!isReady) {
        console.error('Document not ready yet. Please wait for connection.')
        alert('Document not ready yet. Please wait for connection.')
        return
      }
      
      console.log('Incrementing...')
      try {
        const currentValue = counter.get('value') || 0
        counter.set('value', currentValue + 1)
        console.log('Counter incremented successfully')
      } catch (error) {
        console.error('Error incrementing counter:', error)
        alert('Error incrementing counter: ' + error.message)
      }
    })
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
