var ReconnectingWebSocket = require('reconnecting-websocket')
var Connection = require('sharedb/lib/client').Connection

// Wait for DOM to be ready
function init() {
  console.log('Initializing ShareDB client...')
  console.log('Connecting to WebSocket...')

  var socket = new ReconnectingWebSocket('ws://localhost:8080', [], {
    maxEnqueuedMessages: 0,
    connectionTimeout: 4000,
    maxRetries: 10
  })

  var doc = null
  var isReady = false

  function updateStatus(status, color) {
    var statusEl = document.getElementById('status')
    if (statusEl) {
      statusEl.textContent = status
      statusEl.style.color = color || 'black'
    }
  }

  socket.addEventListener('open', () => {
    console.log('WebSocket connected!')
    updateStatus('Connected', 'green')
  })

  socket.addEventListener('error', (error) => {
    console.error('WebSocket error:', error)
    updateStatus('Connection Error', 'red')
    isReady = false
  })

  socket.addEventListener('close', () => {
    console.log('WebSocket closed')
    updateStatus('Disconnected', 'red')
    isReady = false
  })

  var connection = new Connection(socket)

  connection.on('error', (error) => {
    console.error('Connection error:', error)
    updateStatus('ShareDB Error', 'red')
  })

  connection.on('state', (state) => {
    console.log('Connection state:', state)
    if (state === 'connected') {
      updateStatus('Connected', 'green')
    } else if (state === 'connecting') {
      updateStatus('Connecting...', 'orange')
    } else if (state === 'disconnected') {
      updateStatus('Disconnected', 'red')
      isReady = false
    }
  })

  console.log('Getting document...')
  doc = connection.get('doc-collection', 'doc-id')

  doc.subscribe((error) => {
    if (error) {
      console.error('Subscribe error:', error)
      isReady = false
      return
    }
    
    console.log('Document subscribed!', doc.data)

    if (!doc.type) {
      console.log('Creating document...')
      doc.create({counter: 0}, (error) => {
        if (error) {
          console.error('Create error:', error)
          isReady = false
        } else {
          console.log('Document created!')
          isReady = true
          updateCounter()
        }
      })
    } else {
      isReady = true
      updateCounter()
    }
  });

  doc.on('op', (op) => {
    console.log('Operation received:', op)
    updateCounter()
  })

  doc.on('error', (error) => {
    console.error('Document error:', error)
    isReady = false
  })

  function updateCounter() {
    if (doc && doc.data && doc.data.counter !== undefined) {
      var counterElement = document.getElementById('counter')
      if (counterElement) {
        counterElement.textContent = doc.data.counter
      }
    }
  }

  document.getElementById('incrementBtn').addEventListener('click', () => {
    if (!isReady || !doc) {
      console.error('Document not ready yet. Please wait for connection.')
      alert('Document not ready yet. Please wait for connection.')
      return
    }
    
    if (!doc.type) {
      console.error('Document not created yet. Please wait.')
      alert('Document not created yet. Please wait.')
      return
    }
    
    console.log('Incrementing...')
    try {
      doc.submitOp([{p: ['counter'], na: 1}], (error) => {
        if (error) {
          console.error('Submit operation error:', error)
          alert('Error submitting operation: ' + error.message)
        } else {
          console.log('Operation submitted successfully')
        }
      })
    } catch (error) {
      console.error('Error submitting operation:', error)
      alert('Error submitting operation: ' + error.message)
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}