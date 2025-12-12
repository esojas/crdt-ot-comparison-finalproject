// client.js (module)
import * as Y from 'https://unpkg.com/yjs?module'
import { WebsocketProvider } from 'https://unpkg.com/y-websocket?module'

document.addEventListener('DOMContentLoaded', () => {
  // DOM refs
  const canvas = document.getElementById('whiteboard')
  const context = canvas.getContext('2d')
  const statusEl = document.getElementById('status')
  const counterEl = document.getElementById('counter')
  const incrementBtn = document.getElementById('incrementBtn')
  const colorPicker = document.getElementById('colorPicker')
  const lineWidthInput = document.getElementById('lineWidth')
  const lineWidthValue = document.getElementById('lineWidthValue')
  const clearBtn = document.getElementById('clearBtn')
  const eraserBtn = document.getElementById('eraserBtn')
  const toolSelect = document.getElementById('toolSelect')
  const imageBtn = document.getElementById('imageBtn')
  const imageInput = document.getElementById('imageInput')
  const saveBtn = document.getElementById('saveBtn')
  const textInputWrapper = document.getElementById('textInput')
  const textBox = document.getElementById('textBox')
  const textBtn = document.getElementById('textBtn')

  // local drawing state
  let tool = 'pen'
  let currentColor = colorPicker.value || '#000000'
  let currentLineWidth = Number(lineWidthInput.value || 2)
  let isDrawing = false
  let dragStartX = 0
  let dragStartY = 0
  let currentShapeIndex = -1
  let pendingPenPoints = []
  let renderRaf = null
  let batchRaf = null


  colorPicker.addEventListener('input', (e) => currentColor = e.target.value)
  lineWidthInput.addEventListener('input', (e) => {
    currentLineWidth = Number(e.target.value)
    lineWidthValue.textContent = `${currentLineWidth}px`
  })

  // ---------- Yjs setup ----------
  const ydoc = new Y.Doc()
  // connect to local server. change ws://localhost:1234 if your server runs elsewhere
  const provider = new WebsocketProvider('ws://localhost:1234', 'whiteboard-room', ydoc)

  // shared types
  const shapes = ydoc.getArray('shapes') // array of shape-objects
  const meta = ydoc.getMap('meta') // used to store 'count' and other small shared values

  // connection status
  provider.on('status', (ev) => {
    statusEl.textContent = ev.status
  })

  // ensure counter UI follows shared state
  function updateCounterUI() {
    const v = meta.get('count') || 0
    counterEl.textContent = String(v)
  }

  // observe meta map changes
  meta.observe(() => {
    updateCounterUI()
  })

  // observe shapes (repaint when shapes change)
  shapes.observe(() => {
    redrawCanvas()
  })

  // when provider initially syncs we want to render existing content and set ready state
  provider.once('synced', () => {
    // set default counter if missing
    ydoc.transact(() => {
      if (meta.get('count') === undefined) meta.set('count', 0)
    })
    updateCounterUI()
    redrawCanvas()
    console.log('yjs provider synced')
  })

  // increment button -> shared increment using a ydoc transaction
  incrementBtn.addEventListener('click', () => {
    ydoc.transact(() => {
      const current = meta.get('count') || 0
      meta.set('count', current + 1)
    })
  })

  // clear all shapes (collaborative)
  clearBtn.addEventListener('click', () => {
    ydoc.transact(() => {
      // delete all elements from shapes
      if (shapes.length > 0) {
        shapes.delete(0, shapes.length)
      }
    })
  })

  eraserBtn.addEventListener('click', () => {
    tool = 'eraser'
    canvas.classList.add('eraser')
    alert('Note: Eraser only clears locally. For collaborative erasing you can delete a shape from the list (not implemented here)')
  })

  toolSelect.addEventListener('change', (e) => {
    tool = e.target.value
    canvas.classList.remove('eraser')
    if (tool === 'text') {
      textInputWrapper.classList.remove('hidden')
      textBox.focus()
    } else {
      textInputWrapper.classList.add('hidden')
    }
  })

  textBtn.addEventListener('click', () => {
    const t = textBox.value.trim()
    if (!t) return
    ydoc.transact(() => {
      shapes.push([{ type: 'text', text: t, x: dragStartX || 100, y: dragStartY || 100, color: currentColor }])
    })
    textBox.value = ''
    textInputWrapper.classList.add('hidden')
    tool = 'pen'
  })

  // image upload (local only)
  imageBtn.addEventListener('click', () => imageInput.click())
  imageInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0]
    if (!file) return
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

  saveBtn.addEventListener('click', () => {
    const image = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.href = image
    link.download = 'whiteboard-' + Date.now() + '.png'
    link.click()
  })

  // ---------- drawing & rendering ----------
  function redrawCanvas() {
    if (renderRaf) cancelAnimationFrame(renderRaf)
    renderRaf = requestAnimationFrame(() => {
      context.clearRect(0, 0, canvas.width, canvas.height)
      if (!shapes || shapes.length === 0) return
      const arr = shapes.toArray()
      arr.forEach((shape) => {
        if (!shape) return
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
          const w = shape.endX - shape.startX
          const h = shape.endY - shape.startY
          context.rect(shape.startX, shape.startY, w, h)
          context.stroke()
        } else if (shape.type === 'circle') {
          context.beginPath()
          context.arc(shape.startX, shape.startY, shape.radius || 0, 0, Math.PI * 2)
          context.stroke()
        } else if (shape.type === 'text') {
          context.font = '16px Arial'
          context.fillText(shape.text, shape.x, shape.y)
        } else if (shape.type === 'pen') {
          if (Array.isArray(shape.points) && shape.points.length > 1) {
            context.beginPath()
            context.lineJoin = 'round'
            context.lineCap = 'round'
            context.moveTo(shape.points[0].x, shape.points[0].y)
            for (let i = 1; i < shape.points.length; i++) {
              context.lineTo(shape.points[i].x, shape.points[i].y)
            }
            context.stroke()
          }
        }
      })
    })
  }

  // input events
  canvas.addEventListener('mousedown', (e) => {
    isDrawing = true
    dragStartX = e.offsetX
    dragStartY = e.offsetY

    ydoc.transact(() => {
      if (tool === 'pen') {
        const newStroke = { type: 'pen', points: [{ x: dragStartX, y: dragStartY }], color: currentColor, width: currentLineWidth }
        shapes.push([newStroke])
        currentShapeIndex = shapes.length - 1
      } else if (tool === 'line' || tool === 'rectangle' || tool === 'circle') {
        const tempShape = { type: tool, startX: dragStartX, startY: dragStartY, endX: dragStartX, endY: dragStartY, radius: 0, color: currentColor, width: currentLineWidth }
        shapes.push([tempShape])
        currentShapeIndex = shapes.length - 1
      }
    })
  })

  canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing || currentShapeIndex === -1) return
    const offsetX = e.offsetX
    const offsetY = e.offsetY

  if (tool === 'pen') {
    pendingPenPoints.push({ x: offsetX, y: offsetY })
    if (!batchRaf) {
      batchRaf = requestAnimationFrame(() => {
        if (pendingPenPoints.length > 0 && currentShapeIndex !== -1) {
          ydoc.transact(() => {
            const shape = shapes.get(currentShapeIndex)
            if (shape) {
              const existing = Array.isArray(shape.points) ? shape.points : []
              const updatedPoints = [...existing, ...pendingPenPoints]
              // replace exactly one element at currentShapeIndex
              shapes.delete(currentShapeIndex, 1)
              shapes.insert(currentShapeIndex, [{ ...shape, points: updatedPoints }])
            }
          })
          pendingPenPoints = []
        }
        batchRaf = null
        })
      }
    } else if (tool === 'line' || tool === 'rectangle' || tool === 'circle') {
      const shape = shapes.get(currentShapeIndex)
      if (!shape) return
      const radius = Math.sqrt(Math.pow(offsetX - dragStartX, 2) + Math.pow(offsetY - dragStartY, 2))
      const updated = { ...shape, endX: offsetX, endY: offsetY, radius }
      ydoc.transact(() => {
        shapes.delete(currentShapeIndex, 1)
        shapes.insert(currentShapeIndex, [updated])
      })
    }
  })

  canvas.addEventListener('mouseup', () => {
    if (tool === 'pen' && pendingPenPoints.length > 0 && currentShapeIndex !== -1) {
      ydoc.transact(() => {
        const shape = shapes.get(currentShapeIndex)
        if (shape) {
          const updatedPoints = [...(shape.points || []), ...pendingPenPoints]
          shapes.delete(currentShapeIndex, 1)
          shapes.insert(currentShapeIndex, [{ ...shape, points: updatedPoints }])
        }
      })
      pendingPenPoints = []
    }    
    isDrawing = false
    currentShapeIndex = -1
  })

  // click outside canvas or leave should stop drawing
  canvas.addEventListener('mouseleave', () => {
    if (isDrawing) {
      canvas.dispatchEvent(new Event('mouseup'))
    }
  })

  // initial render (in case there's content before sync)
  redrawCanvas()
})
