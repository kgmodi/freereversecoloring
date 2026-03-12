'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { getStroke } from 'perfect-freehand'
import type { Design } from '@/data/designs'

// == Types ==

interface DrawingPoint {
  x: number // image-space coordinate (0 to design.width)
  y: number // image-space coordinate (0 to design.height)
  pressure: number // 0.0 to 1.0
}

interface DrawingStroke {
  id: string
  points: DrawingPoint[]
  tool: 'pen' | 'eraser'
  size: number
  timestamp: number
}

// == Constants ==

const STROKE_COLOR = '#2D2B3D'
const STROKE_OPACITY = 0.85
const THIN_SIZE = 6
const THICK_SIZE = 16
const ERASER_SIZE_MULTIPLIER = 3
const MAX_UNDO = 50
const AUTOSAVE_DEBOUNCE = 1000

function storageKey(designId: string) {
  return `frc-draw-${designId}`
}

// == Helpers ==

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function getSvgPathFromStroke(points: number[][]): string {
  if (!points.length) return ''

  const d = points.reduce(
    (acc: (string | number)[], [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length]
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
      return acc
    },
    ['M', ...points[0], 'Q'],
  )
  d.push('Z')
  return d.join(' ')
}

function renderStrokeToCtx(
  ctx: CanvasRenderingContext2D,
  stroke: DrawingStroke,
  scale: number,
) {
  const inputPoints = stroke.points.map((p) => [
    p.x * scale,
    p.y * scale,
    p.pressure,
  ])

  const effectiveSize =
    stroke.tool === 'eraser'
      ? stroke.size * ERASER_SIZE_MULTIPLIER * scale
      : stroke.size * scale

  const outlinePoints = getStroke(inputPoints, {
    size: effectiveSize,
    thinning: stroke.tool === 'eraser' ? 0 : 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: false,
    last: true,
  })

  if (!outlinePoints.length) return

  const pathStr = getSvgPathFromStroke(outlinePoints)
  const path = new Path2D(pathStr)

  ctx.save()
  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = '#000'
    ctx.fill(path)
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = STROKE_COLOR
    ctx.globalAlpha = STROKE_OPACITY
    ctx.fill(path)
  }
  ctx.restore()
}

// == Component ==

export function DrawingCanvas({ design }: { design: Design }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  // Drawing state
  const strokesRef = useRef<DrawingStroke[]>([])
  const undoStackRef = useRef<DrawingStroke[]>([])
  const activePointsRef = useRef<DrawingPoint[]>([])
  const isDrawingRef = useRef(false)
  const hasPenRef = useRef(false)
  const scaleRef = useRef(1)
  const displayDimsRef = useRef({ w: 0, h: 0 })
  const activeTool = useRef<'pen' | 'eraser'>('pen')
  const activeSize = useRef<number>(THIN_SIZE)
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number>(0)
  const needsRenderRef = useRef(false)

  // UI state
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [sizeLabel, setSizeLabel] = useState<'thin' | 'thick'>('thin')
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [toolbarVisible, setToolbarVisible] = useState(true)
  const [showHint, setShowHint] = useState(
    () =>
      typeof window !== 'undefined' &&
      !localStorage.getItem('frc-draw-visited'),
  )
  const [showPrompts, setShowPrompts] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const toolbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync tool/size refs with state
  useEffect(() => {
    activeTool.current = tool
  }, [tool])
  useEffect(() => {
    activeSize.current = sizeLabel === 'thin' ? THIN_SIZE : THICK_SIZE
  }, [sizeLabel])

  // -- Canvas setup & resize --

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    // Compute display dimensions preserving aspect ratio
    const imageAspect = design.width / design.height
    let displayW = rect.width
    let displayH = rect.width / imageAspect
    if (displayH > rect.height) {
      displayH = rect.height
      displayW = rect.height * imageAspect
    }

    displayDimsRef.current = { w: displayW, h: displayH }
    scaleRef.current = displayW / design.width

    canvas.style.width = `${displayW}px`
    canvas.style.height = `${displayH}px`
    canvas.width = displayW * dpr
    canvas.height = displayH * dpr

    const ctx = canvas.getContext('2d')
    if (ctx) ctx.scale(dpr, dpr)

    renderAllStrokes()
  }, [design.width, design.height])

  // -- Rendering --

  const renderAllStrokes = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const { w, h } = displayDimsRef.current
    ctx.clearRect(0, 0, w, h)

    const scale = scaleRef.current
    for (const stroke of strokesRef.current) {
      renderStrokeToCtx(ctx, stroke, scale)
    }

    // Render active stroke
    if (activePointsRef.current.length > 1) {
      const activeStroke: DrawingStroke = {
        id: 'active',
        points: activePointsRef.current,
        tool: activeTool.current,
        size: activeSize.current,
        timestamp: 0,
      }
      renderStrokeToCtx(ctx, activeStroke, scale)
    }

    ctx.restore()
  }, [])

  const requestRender = useCallback(() => {
    if (!needsRenderRef.current) {
      needsRenderRef.current = true
      rafRef.current = requestAnimationFrame(() => {
        needsRenderRef.current = false
        renderAllStrokes()
      })
    }
  }, [renderAllStrokes])

  // -- Auto-save --

  const autoSave = useCallback(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => {
      try {
        const data = JSON.stringify(strokesRef.current)
        localStorage.setItem(storageKey(design.designId), data)
      } catch {
        // localStorage full or unavailable — silent fail
      }
    }, AUTOSAVE_DEBOUNCE)
  }, [design.designId])

  // -- Undo / Redo --

  const updateUndoState = useCallback(() => {
    setCanUndo(strokesRef.current.length > 0)
    setCanRedo(undoStackRef.current.length > 0)
  }, [])

  const undo = useCallback(() => {
    if (strokesRef.current.length === 0) return
    const last = strokesRef.current.pop()!
    undoStackRef.current.push(last)
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift()
    updateUndoState()
    renderAllStrokes()
    autoSave()
  }, [renderAllStrokes, updateUndoState, autoSave])

  const redo = useCallback(() => {
    if (undoStackRef.current.length === 0) return
    const next = undoStackRef.current.pop()!
    strokesRef.current.push(next)
    updateUndoState()
    renderAllStrokes()
    autoSave()
  }, [renderAllStrokes, updateUndoState, autoSave])

  // -- Pointer events --

  const getImageCoords = useCallback(
    (e: PointerEvent): DrawingPoint => {
      const canvas = canvasRef.current!
      const rect = canvas.getBoundingClientRect()
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top
      const scale = scaleRef.current
      return {
        x: screenX / scale,
        y: screenY / scale,
        pressure: e.pressure || 0.5,
      }
    },
    [],
  )

  const hideToolbarDuringDrawing = useCallback(() => {
    setToolbarVisible(false)
    if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current)
  }, [])

  const showToolbarAfterDrawing = useCallback(() => {
    if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current)
    toolbarTimerRef.current = setTimeout(() => setToolbarVisible(true), 300)
  }, [])

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      // Palm rejection: if pen detected, ignore all touch input
      if (e.pointerType === 'pen') hasPenRef.current = true
      if (hasPenRef.current && e.pointerType === 'touch') return

      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

      isDrawingRef.current = true
      activePointsRef.current = [getImageCoords(e)]

      hideToolbarDuringDrawing()

      if (showHint) {
        setShowHint(false)
        localStorage.setItem('frc-draw-visited', '1')
      }
    },
    [getImageCoords, hideToolbarDuringDrawing, showHint],
  )

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDrawingRef.current) return
      if (hasPenRef.current && e.pointerType === 'touch') return

      activePointsRef.current.push(getImageCoords(e))
      requestRender()
    },
    [getImageCoords, requestRender],
  )

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      if (!isDrawingRef.current) return
      if (hasPenRef.current && e.pointerType === 'touch') return

      isDrawingRef.current = false

      if (activePointsRef.current.length > 1) {
        const stroke: DrawingStroke = {
          id: uid(),
          points: [...activePointsRef.current],
          tool: activeTool.current,
          size: activeSize.current,
          timestamp: Date.now(),
        }
        strokesRef.current.push(stroke)
        undoStackRef.current = [] // new stroke clears redo
        updateUndoState()
        autoSave()
      }

      activePointsRef.current = []
      renderAllStrokes()
      showToolbarAfterDrawing()
    },
    [renderAllStrokes, updateUndoState, autoSave, showToolbarAfterDrawing],
  )

  // -- Download composite --

  const downloadComposite = useCallback(async () => {
    const img = imgRef.current
    if (!img) return

    setIsSaving(true)
    try {
      // Wait for image to be fully loaded
      await new Promise<void>((resolve) => {
        if (img.complete && img.naturalWidth > 0) return resolve()
        img.onload = () => resolve()
      })

      const offscreen = document.createElement('canvas')
      offscreen.width = design.width
      offscreen.height = design.height
      const ctx = offscreen.getContext('2d')!

      // Draw background at full resolution
      ctx.drawImage(img, 0, 0, design.width, design.height)

      // Render all strokes at full resolution (scale = 1)
      for (const stroke of strokesRef.current) {
        renderStrokeToCtx(ctx, stroke, 1)
      }

      // Export
      offscreen.toBlob(
        (blob) => {
          if (!blob) return
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${design.slug}-my-drawing.png`
          a.click()
          URL.revokeObjectURL(url)
          setIsSaving(false)
        },
        'image/png',
      )
    } catch {
      setIsSaving(false)
    }
  }, [design.width, design.height, design.slug])

  // -- Share via Web Share API --

  const shareDrawing = useCallback(async () => {
    const img = imgRef.current
    if (!img || !navigator.share) return

    setIsSaving(true)
    try {
      await new Promise<void>((resolve) => {
        if (img.complete && img.naturalWidth > 0) return resolve()
        img.onload = () => resolve()
      })

      const offscreen = document.createElement('canvas')
      offscreen.width = design.width
      offscreen.height = design.height
      const ctx = offscreen.getContext('2d')!
      ctx.drawImage(img, 0, 0, design.width, design.height)
      for (const stroke of strokesRef.current) {
        renderStrokeToCtx(ctx, stroke, 1)
      }

      const blob = await new Promise<Blob | null>((resolve) =>
        offscreen.toBlob(resolve, 'image/png'),
      )
      if (!blob) return

      const file = new File([blob], `${design.slug}-my-drawing.png`, {
        type: 'image/png',
      })

      await navigator.share({
        title: `My reverse coloring: ${design.title}`,
        text: 'Check out my reverse coloring drawing!',
        url: `https://www.freereversecoloring.com/gallery/${design.slug}/`,
        files: [file],
      })
    } catch {
      // User cancelled share or API unavailable
    } finally {
      setIsSaving(false)
    }
  }, [design.width, design.height, design.slug, design.title])

  // -- Clear all --

  const clearAll = useCallback(() => {
    if (strokesRef.current.length === 0) return
    if (!confirm('Clear your entire drawing? This cannot be undone.')) return
    strokesRef.current = []
    undoStackRef.current = []
    updateUndoState()
    renderAllStrokes()
    localStorage.removeItem(storageKey(design.designId))
  }, [renderAllStrokes, updateUndoState, design.designId])

  // -- Effects --

  // Setup canvas + pointer events + resize observer
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    // Restore from localStorage
    try {
      const saved = localStorage.getItem(storageKey(design.designId))
      if (saved) {
        strokesRef.current = JSON.parse(saved)
        setCanUndo(strokesRef.current.length > 0)
      }
    } catch {
      // Corrupt data — ignore
    }

    setupCanvas()

    // Pointer events
    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('pointercancel', handlePointerUp)

    // Resize
    const ro = new ResizeObserver(() => setupCanvas())
    ro.observe(container)

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointercancel', handlePointerUp)
      ro.disconnect()
      cancelAnimationFrame(rafRef.current)
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
      if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current)
    }
  }, [
    design.designId,
    setupCanvas,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  ])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'z' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault()
        redo()
      } else if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        undo()
      } else if (e.key === 'p' || e.key === 'P') {
        setTool('pen')
      } else if (e.key === 'e' || e.key === 'E') {
        setTool('eraser')
      } else if (e.key === '1') {
        setSizeLabel('thin')
      } else if (e.key === '2') {
        setSizeLabel('thick')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  // Dismiss hint after 4s
  useEffect(() => {
    if (!showHint) return
    const t = setTimeout(() => setShowHint(false), 4000)
    return () => clearTimeout(t)
  }, [showHint])

  // Warn before leaving with unsaved strokes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (strokesRef.current.length > 0) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // -- Render --

  const canShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#1a1825]"
    >
      {/* Background image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={design.imagePath}
        alt={design.title}
        draggable={false}
        crossOrigin="anonymous"
        className="pointer-events-none select-none"
        style={{
          width: displayDimsRef.current.w || 'auto',
          height: displayDimsRef.current.h || 'auto',
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
        }}
      />

      {/* Drawing canvas overlay */}
      <canvas
        ref={canvasRef}
        className="absolute cursor-crosshair"
        style={{
          touchAction: 'none',
          width: displayDimsRef.current.w || '100%',
          height: displayDimsRef.current.h || '100%',
        }}
      />

      {/* First-time hint */}
      {showHint && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <div className="rounded-2xl bg-black/50 px-8 py-5 text-center backdrop-blur-sm">
            <p className="text-lg font-medium text-white">
              Your canvas is ready
            </p>
            <p className="mt-1 text-sm text-white/70">
              Tap anywhere to start drawing
            </p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div
        className={`absolute bottom-6 left-1/2 z-40 -translate-x-1/2 transition-all duration-300 ${
          toolbarVisible
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-4 opacity-0'
        }`}
      >
        <div className="flex items-center gap-1 rounded-full bg-white/90 px-2 py-2 shadow-lg ring-1 ring-black/5 backdrop-blur-md">
          {/* Pen */}
          <ToolbarButton
            active={tool === 'pen'}
            onClick={() => setTool('pen')}
            label="Pen (P)"
          >
            <PenIcon />
          </ToolbarButton>

          {/* Eraser */}
          <ToolbarButton
            active={tool === 'eraser'}
            onClick={() => setTool('eraser')}
            label="Eraser (E)"
          >
            <EraserIcon />
          </ToolbarButton>

          {/* Divider */}
          <div className="mx-1 h-6 w-px bg-black/10" />

          {/* Undo */}
          <ToolbarButton
            disabled={!canUndo}
            onClick={undo}
            label="Undo (Cmd+Z)"
          >
            <UndoIcon />
          </ToolbarButton>

          {/* Thickness toggle */}
          <ToolbarButton
            onClick={() =>
              setSizeLabel((s) => (s === 'thin' ? 'thick' : 'thin'))
            }
            label={`Size: ${sizeLabel} (1/2)`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <div
                className={`rounded-full bg-[#2D2B3D] transition-all ${sizeLabel === 'thin' ? 'h-2 w-2 opacity-100' : 'h-1.5 w-1.5 opacity-40'}`}
              />
              <div
                className={`rounded-full bg-[#2D2B3D] transition-all ${sizeLabel === 'thick' ? 'h-3.5 w-3.5 opacity-100' : 'h-2.5 w-2.5 opacity-40'}`}
              />
            </div>
          </ToolbarButton>

          {/* Divider */}
          <div className="mx-1 h-6 w-px bg-black/10" />

          {/* Prompts */}
          {design.drawingPrompts.length > 0 && (
            <ToolbarButton
              active={showPrompts}
              onClick={() => setShowPrompts((v) => !v)}
              label="Drawing ideas"
            >
              <LightbulbIcon />
            </ToolbarButton>
          )}

          {/* Clear */}
          <ToolbarButton onClick={clearAll} label="Clear all">
            <TrashIcon />
          </ToolbarButton>

          {/* Divider */}
          <div className="mx-1 h-6 w-px bg-black/10" />

          {/* Download */}
          <ToolbarButton
            onClick={downloadComposite}
            disabled={isSaving}
            label="Download"
          >
            <DownloadIcon />
          </ToolbarButton>

          {/* Share */}
          {canShare && (
            <ToolbarButton
              onClick={shareDrawing}
              disabled={isSaving}
              label="Share"
            >
              <ShareIcon />
            </ToolbarButton>
          )}
        </div>
      </div>

      {/* Drawing prompts panel */}
      {showPrompts && (
        <div className="absolute right-4 bottom-20 z-40 max-w-xs rounded-2xl bg-white/95 p-4 shadow-lg ring-1 ring-black/5 backdrop-blur-md">
          <h3 className="text-sm font-semibold text-[#2D2B3D]">
            Drawing Ideas
          </h3>
          <ul className="mt-2 space-y-2">
            {design.drawingPrompts.map((prompt, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#9B7BC7] text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span className="text-sm text-[#4A3F6B]">{prompt}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// == Toolbar button ==

function ToolbarButton({
  children,
  active,
  disabled,
  onClick,
  label,
}: {
  children: React.ReactNode
  active?: boolean
  disabled?: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
        active
          ? 'bg-[#9B7BC7] text-white'
          : disabled
            ? 'cursor-not-allowed text-black/20'
            : 'text-[#2D2B3D] hover:bg-black/5 active:bg-black/10'
      }`}
    >
      {children}
    </button>
  )
}

// == Icons (inline SVGs, 20x20) ==

function PenIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
    </svg>
  )
}

function EraserIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m20 20-5.05-5.05m0 0L18.36 11.54a2 2 0 0 0 0-2.83l-4.07-4.07a2 2 0 0 0-2.83 0L4 12.1a2 2 0 0 0 0 2.83L8.95 19.95m5.05-5.05L8.95 19.95m0 0H4" />
    </svg>
  )
}

function UndoIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
    </svg>
  )
}

function LightbulbIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a7 7 0 0 0-4 12.73V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.27A7 7 0 0 0 12 2ZM9 21h6" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0-12.814a2.25 2.25 0 1 0 4.5 0 2.25 2.25 0 0 0-4.5 0Zm0 12.814a2.25 2.25 0 1 0 4.5 0 2.25 2.25 0 0 0-4.5 0Z" />
    </svg>
  )
}
