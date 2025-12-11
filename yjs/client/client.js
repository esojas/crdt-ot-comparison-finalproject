// Import Yjs and y-websocket as ES modules
import * as Y from 'https://cdn.skypack.dev/yjs@13.6.27'
import { WebsocketProvider } from 'https://cdn.skypack.dev/y-websocket@3.0.0'

// Wait for DOM to be ready
function init() {
  console.log('Initializing Yjs client...')

  // Create Yjs document
  const ydoc = new Y.Doc()
  
  // Create shared types
  const rootMap = ydoc.getMap('root')
  
  let isReady = false

  function updateStatus(status, color) {
    const statusEl = document.getElementById('status')
    if (statusEl) {
      statusEl.textContent = status
      statusEl.style.color = color || 'black'
    }
  }

  // Connect to WebSocket provider
  console.log('Connecting to WebSocket...')
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

  // ============================================
  // COUNTER SETUP
  // ============================================
  console.log('Initializing counter...')
  
  // Wait for sync before initializing counter
  function initCounter() {
    // Initialize counter value if it doesn't exist
    if (!rootMap.has('counter')) {
      rootMap.set('counter', 0)
      console.log('Counter initialized to 0')
    }

    // Listen for counter changes
    rootMap.observe((event) => {
      event.changes.keys.forEach((change, key) => {
        if (key === 'counter') {
          console.log('Counter changed remotely')
          updateCounter()
        }
      })
    })

    function updateCounter() {
      const counterValue = rootMap.get('counter') || 0
      console.log('Updating counter display to:', counterValue)
      const counterElement = document.getElementById('counter')
      if (counterElement) {
        counterElement.textContent = counterValue
      }
    }

    // Initial counter update
    updateCounter()
  }

  // Wait for initial sync
  if (wsProvider.synced) {
    initCounter()
  } else {
    wsProvider.once('sync', initCounter)
  }

  // Counter increment button
  const incrementBtn = document.getElementById('incrementBtn')
  if (incrementBtn) {
    incrementBtn.addEventListener('click', () => {
      if (!isReady) {
        console.error('Document not ready yet. Please wait for connection.')
        alert('Document not ready yet. Please wait for connection.')
        return
      }
      
      console.log('Incrementing counter...')
      try {
        const currentValue = rootMap.get('counter') || 0
        rootMap.set('counter', currentValue + 1)
        console.log('Counter incremented to', currentValue + 1)
      } catch (error) {
        console.error('Error incrementing counter:', error)
        alert('Error incrementing counter: ' + error.message)
      }
    })
  }

  // ============================================
  // WHITEBOARD SETUP
  // ============================================
  console.log('Initializing whiteboard...')
  
  // Get or create shapes array
  let shapesArray = rootMap.get('shapes')
  if (!shapesArray) {
    shapesArray = new Y.Array()
    rootMap.set('shapes', shapesArray)
  }

  // Initialize canvas
  const canvas = document.getElementById('whiteboard')
  const context = canvas.getContext('2d')
  let isDrawing = false
  let lastX = 0
  let lastY = 0
  let tool = 'pen'
  let currentColor = '#000000'
  let currentLineWidth = 2
  let drag = false
  let dragStartX, dragStartY
  let currentPenStroke = null
  let isWhiteboardReady = false

  // Color and line width controls
  document.getElementById('colorPicker').addEventListener('input', (e) => {
    currentColor = e.target.value
  })

  document.getElementById('lineWidth').addEventListener('input', (e) => {
    currentLineWidth = parseInt(e.target.value)
    document.getElementById('lineWidthValue').textContent = currentLineWidth + 'px'
  })

  // Redraw all shapes from Yjs
  function redrawCanvas() {
    context.clearRect(0, 0, canvas.width, canvas.height)
    
    const shapes = shapesArray.toArray()
    if (!shapes || shapes.length === 0) return
    
    shapes.forEach((shape, index) => {
      if (!shape || typeof shape !== 'object' || !shape.type) {
        console.warn('Invalid shape at index', index, ':', shape)
        return
      }
      
      context.strokeStyle = shape.color || '#000'
      context.fillStyle = shape.color || '#000'
      context.lineWidth = shape.width || 2
      
      if (shape.type === 'line') {
        context.beginPath()
        context.moveTo(shape.startX, shape.startY)
        context.lineTo(shape.endX, shape.endY)
        context.stroke()
      } else if (shape.type === 'rectangle') {
        context.beginPath()
        context.rect(shape.startX, shape.startY,
          shape.endX - shape.startX,
          shape.endY - shape.startY)
        context.stroke()
      } else if (shape.type === 'circle') {
        context.beginPath()
        context.arc(shape.startX, shape.startY,
          shape.radius, 0, Math.PI * 2)
        context.stroke()
      } else if (shape.type === 'text') {
        context.font = '16px Arial'
        context.fillText(shape.text, shape.x, shape.y)
      } else if (shape.type === 'pen') {
        if (shape.points && Array.isArray(shape.points) && shape.points.length > 1) {
          context.beginPath()
          context.moveTo(shape.points[0].x, shape.points[0].y)
          for (let i = 1; i < shape.points.length; i++) {
            context.lineTo(shape.points[i].x, shape.points[i].y)
          }
          context.stroke()
        }
      }
    })
  }

  // Listen for changes from other users
  shapesArray.observe((event) => {
    console.log('Shapes array changed:', event)
    console.log('Array length:', shapesArray.length)
    // Small delay to ensure update is fully applied
    setTimeout(() => {
      const shapes = shapesArray.toArray()
      console.log('Redrawing with', shapes.length, 'shapes')
      redrawCanvas()
    }, 10)
  })

  // Mouse event handlers
  canvas.addEventListener('mousedown', (e) => {
    if (!isWhiteboardReady) {
      alert('Whiteboard not ready yet. Please wait for connection.')
      return
    }
    
    isDrawing = true
    lastX = e.offsetX
    lastY = e.offsetY
    
    if (tool === 'pen') {
      context.beginPath()
      context.moveTo(lastX, lastY)
      currentPenStroke = {
        type: 'pen',
        points: [{x: lastX, y: lastY}],
        color: currentColor,
        width: currentLineWidth
      }
    }
    
    if (tool === 'line' || tool === 'rectangle' || tool === 'circle') {
      drag = true
      dragStartX = e.offsetX
      dragStartY = e.offsetY
    }
  })

  canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return
    
    const { offsetX, offsetY } = e
    
    if (tool === 'pen') {
      context.lineWidth = currentLineWidth
      context.strokeStyle = currentColor
      context.lineTo(offsetX, offsetY)
      context.stroke()
      
      if (currentPenStroke) {
        currentPenStroke.points.push({x: offsetX, y: offsetY})
      }
    } else if (tool === 'eraser') {
      context.clearRect(offsetX - 10, offsetY - 10, 20, 20)
    } else if ((tool === 'line' || tool === 'rectangle' || tool === 'circle') && drag) {
      redrawCanvas()
      
      context.strokeStyle = currentColor
      context.lineWidth = currentLineWidth
      
      if (tool === 'line') {
        context.beginPath()
        context.moveTo(lastX, lastY)
        context.lineTo(offsetX, offsetY)
        context.stroke()
      } else if (tool === 'rectangle') {
        context.beginPath()
        context.rect(lastX, lastY, offsetX - lastX, offsetY - lastY)
        context.stroke()
      } else if (tool === 'circle') {
        const radius = Math.sqrt(Math.pow(offsetX - lastX, 2) +
          Math.pow(offsetY - lastY, 2))
        context.beginPath()
        context.arc(lastX, lastY, radius, 0, Math.PI * 2)
        context.stroke()
      }
    }
  })

  canvas.addEventListener('mouseup', (e) => {
    if (!isDrawing) {
      return
    }
    
    if (tool === 'pen' && currentPenStroke) {
      if (currentPenStroke.points.length > 1) {
        shapesArray.push([currentPenStroke])
        console.log('Pushed pen stroke with', currentPenStroke.points.length, 'points')
      }
      currentPenStroke = null
    } else if (tool === 'line' || tool === 'rectangle' || tool === 'circle') {
      const newShape = {
        type: tool,
        startX: dragStartX,
        startY: dragStartY,
        endX: e.offsetX,
        endY: e.offsetY,
        radius: Math.sqrt(Math.pow(e.offsetX - dragStartX, 2) +
          Math.pow(e.offsetY - dragStartY, 2)),
        color: currentColor,
        width: currentLineWidth
      }
      
      console.log('Pushing new shape:', newShape)
      shapesArray.push([newShape])
      console.log('Shape pushed, array length:', shapesArray.length)
    }
    
    isDrawing = false
    drag = false
  })

  canvas.addEventListener('mouseleave', (e) => {
    if (isDrawing && tool === 'pen' && currentPenStroke && currentPenStroke.points.length > 1) {
      shapesArray.push([currentPenStroke])
      currentPenStroke = null
    }
    isDrawing = false
    drag = false
  })

  // Tool buttons
  document.getElementById('clearBtn').addEventListener('click', () => {
    if (!isWhiteboardReady) {
      alert('Whiteboard not ready yet. Please wait for connection.')
      return
    }
    
    context.clearRect(0, 0, canvas.width, canvas.height)
    
    if (shapesArray.length > 0) {
      shapesArray.delete(0, shapesArray.length)
      console.log('Cleared all shapes')
    }
  })

  document.getElementById('eraserBtn').addEventListener('click', () => {
    tool = 'eraser'
    canvas.classList.add('eraser')
  })

  document.getElementById('toolSelect').addEventListener('change', (e) => {
    tool = e.target.value
    canvas.classList.remove('eraser')
    
    if (tool === 'text') {
      document.getElementById('textInput').classList.remove('hidden')
      document.getElementById('textBox').focus()
    } else {
      document.getElementById('textInput').classList.add('hidden')
    }
  })

  // Text tool
  document.getElementById('textBtn').addEventListener('click', () => {
    const text = document.getElementById('textBox').value
    if (text && isWhiteboardReady) {
      const textShape = {
        type: 'text',
        text: text,
        x: lastX || 100,
        y: lastY || 100,
        color: currentColor
      }
      
      context.font = '16px Arial'
      context.fillStyle = currentColor
      context.fillText(text, textShape.x, textShape.y)
      
      shapesArray.push([textShape])
      
      document.getElementById('textBox').value = ''
      document.getElementById('textInput').classList.add('hidden')
      tool = 'pen'
    }
  })

  // Image upload
  document.getElementById('imageBtn').addEventListener('click', () => {
    document.getElementById('imageInput').click()
  })

  document.getElementById('imageInput').addEventListener('change', (e) => {
    const file = e.target.files[0]
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        context.drawImage(img, 0, 0, Math.min(img.width, canvas.width), Math.min(img.height, canvas.height))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })

  // Save canvas
  document.getElementById('saveBtn').addEventListener('click', () => {
    const image = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.href = image
    link.download = 'whiteboard-' + Date.now() + '.png'
    link.click()
  })

  // Initial render and mark as ready
  setTimeout(() => {
    const initialShapes = shapesArray.toArray()
    console.log('Initial shapes:', initialShapes.length)
    redrawCanvas()
    isWhiteboardReady = true
    console.log('Whiteboard ready!')
  }, 1000)
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
