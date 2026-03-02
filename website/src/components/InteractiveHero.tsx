'use client'

import { useRef, useEffect, useState, useCallback } from 'react'

interface Point {
  x: number
  y: number
  timestamp: number
}

interface Stroke {
  points: Point[]
  createdAt: number
}

const LINE_COLOR = '#2D2B3D'
const LINE_OPACITY = 0.6
const LINE_WIDTH_MIN = 1.5
const LINE_WIDTH_MAX = 3
const FADE_DURATION = 4000 // 4 seconds
const FADE_START = 3000 // Start fading at 3 seconds

export function InteractiveHero({ children }: { children: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const isDrawingRef = useRef(false)
  const currentStrokeRef = useRef<Stroke | null>(null)
  const animationFrameRef = useRef<number>(0)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [showHint, setShowHint] = useState(true)

  // Resize canvas to match container
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(dpr, dpr)
    }
  }, [])

  // Get position relative to canvas
  const getPosition = useCallback(
    (e: MouseEvent | Touch): { x: number; y: number } => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    },
    [],
  )

  // Calculate line width based on speed
  const getLineWidth = useCallback(
    (p1: Point, p2: Point): number => {
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const dt = p2.timestamp - p1.timestamp || 1
      const speed = dist / dt

      // Faster movement = thinner lines (like a real pen)
      const t = Math.min(speed / 2, 1)
      return LINE_WIDTH_MAX - t * (LINE_WIDTH_MAX - LINE_WIDTH_MIN)
    },
    [],
  )

  // Start a new stroke
  const startStroke = useCallback(
    (pos: { x: number; y: number }) => {
      isDrawingRef.current = true
      const point: Point = { x: pos.x, y: pos.y, timestamp: Date.now() }
      currentStrokeRef.current = {
        points: [point],
        createdAt: Date.now(),
      }

      if (!hasDrawn) {
        setHasDrawn(true)
        setShowHint(false)
      }
    },
    [hasDrawn],
  )

  // Add point to current stroke
  const addPoint = useCallback((pos: { x: number; y: number }) => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return

    const point: Point = { x: pos.x, y: pos.y, timestamp: Date.now() }
    currentStrokeRef.current.points.push(point)
  }, [])

  // End current stroke
  const endStroke = useCallback(() => {
    if (currentStrokeRef.current && currentStrokeRef.current.points.length > 1) {
      strokesRef.current.push({
        ...currentStrokeRef.current,
        createdAt: Date.now(),
      })
    }
    isDrawingRef.current = false
    currentStrokeRef.current = null
  }, [])

  // Draw a smooth stroke using quadratic curves
  const drawStroke = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      points: Point[],
      opacity: number,
    ) => {
      if (points.length < 2) return

      ctx.strokeStyle = LINE_COLOR
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalAlpha = opacity * LINE_OPACITY

      // Draw with quadratic curves for smoothness
      for (let i = 1; i < points.length; i++) {
        const p0 = points[i - 1]
        const p1 = points[i]

        const width = getLineWidth(p0, p1)
        ctx.lineWidth = width

        if (i === 1) {
          // First segment: simple line
          ctx.beginPath()
          ctx.moveTo(p0.x, p0.y)
          ctx.lineTo(p1.x, p1.y)
          ctx.stroke()
        } else {
          // Use midpoint quadratic curves for smoothness
          const prev = points[i - 2]
          const mid0x = (prev.x + p0.x) / 2
          const mid0y = (prev.y + p0.y) / 2
          const mid1x = (p0.x + p1.x) / 2
          const mid1y = (p0.y + p1.y) / 2

          ctx.beginPath()
          ctx.moveTo(mid0x, mid0y)
          ctx.quadraticCurveTo(p0.x, p0.y, mid1x, mid1y)
          ctx.stroke()
        }
      }

      ctx.globalAlpha = 1
    },
    [getLineWidth],
  )

  // Animation loop
  const animate = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)

    const now = Date.now()

    // Filter out fully faded strokes
    strokesRef.current = strokesRef.current.filter(
      (stroke) => now - stroke.createdAt < FADE_START + FADE_DURATION,
    )

    // Draw completed strokes with fading
    for (const stroke of strokesRef.current) {
      const age = now - stroke.createdAt
      let opacity = 1

      if (age > FADE_START) {
        opacity = 1 - (age - FADE_START) / FADE_DURATION
      }

      opacity = Math.max(0, Math.min(1, opacity))
      drawStroke(ctx, stroke.points, opacity)
    }

    // Draw current stroke (full opacity)
    if (currentStrokeRef.current && currentStrokeRef.current.points.length > 1) {
      drawStroke(ctx, currentStrokeRef.current.points, 1)
    }

    animationFrameRef.current = requestAnimationFrame(animate)
  }, [drawStroke])

  // Set up event listeners and animation
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    resizeCanvas()

    // Mouse events
    const handleMouseDown = (e: MouseEvent) => {
      startStroke(getPosition(e))
    }
    const handleMouseMove = (e: MouseEvent) => {
      if (isDrawingRef.current) {
        addPoint(getPosition(e))
      }
    }
    const handleMouseUp = () => {
      endStroke()
    }
    const handleMouseLeave = () => {
      endStroke()
    }

    // Touch events
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        e.preventDefault()
        startStroke(getPosition(e.touches[0]))
      }
    }
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && isDrawingRef.current) {
        e.preventDefault()
        addPoint(getPosition(e.touches[0]))
      }
    }
    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault()
      endStroke()
    }

    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('mouseleave', handleMouseLeave)
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false })
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false })

    // Resize handling
    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas()
    })
    resizeObserver.observe(container)

    // Start animation loop
    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseup', handleMouseUp)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchend', handleTouchEnd)
      resizeObserver.disconnect()
      cancelAnimationFrame(animationFrameRef.current)
    }
  }, [resizeCanvas, getPosition, startStroke, addPoint, endStroke, animate])

  // Fade hint after 5 seconds even if user hasn't drawn
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowHint(false)
    }, 6000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div ref={containerRef} className="relative overflow-hidden">
      {/* Watercolor gradient background */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 20% 60%, rgba(106, 172, 184, 0.15), transparent),
            radial-gradient(ellipse 60% 50% at 70% 30%, rgba(155, 123, 199, 0.12), transparent),
            radial-gradient(ellipse 50% 40% at 50% 80%, rgba(232, 136, 155, 0.1), transparent)
          `,
        }}
      />

      {/* Canvas overlay for drawing — between background and content */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0 cursor-crosshair"
        aria-hidden="true"
      />

      {/* Content sits on top, pointer-events pass through to canvas on non-interactive areas */}
      <div className="relative z-10">
        {children}
      </div>

      {/* Draw hint */}
      <div
        className={`absolute bottom-6 left-1/2 z-20 -translate-x-1/2 transition-opacity duration-1000 sm:bottom-8 ${
          showHint ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden="true"
      >
        <div className="flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 shadow-sm ring-1 ring-[#9B7BC7]/10 backdrop-blur-sm">
          <svg
            className="h-4 w-4 text-[#9B7BC7]"
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth="1.5"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125"
            />
          </svg>
          <span className="text-xs font-medium text-[#4A3F6B]">
            Click & drag to draw on the canvas
          </span>
        </div>
      </div>
    </div>
  )
}
