'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useInView, useAnimation, type Variants } from 'framer-motion'
import clsx from 'clsx'

// SVG paths for a landscape watercolor drawing demo
// viewBox 1024x683 (~3:2 landscape) to match blog image aspect ratio
// Designed for springs-first-drizzle.png — blue/green/yellow forest watercolor

// --- Tree trunks ---
const trunk1 = 'M 200 683 C 198 620 202 560 196 500 C 192 440 200 380 198 320 C 196 260 202 210 200 160'
const trunk2 = 'M 450 683 C 454 630 448 575 452 520 C 456 465 446 415 450 360 C 454 305 448 260 450 220'
const trunk3 = 'M 700 683 C 698 635 704 585 700 535 C 696 485 702 440 700 395 C 698 350 694 310 698 270'
const trunk4 = 'M 880 683 C 882 640 878 595 882 550 C 886 505 878 465 882 425 C 886 385 880 350 882 320'

// --- Major branches ---
const branch1L = 'M 198 300 C 175 270 145 250 115 225 C 85 200 60 180 35 165'
const branch1R = 'M 200 250 C 225 220 260 200 290 175 C 320 150 345 130 370 110'
const branch2L = 'M 450 340 C 420 310 385 290 350 265 C 315 240 285 225 260 210'
const branch2R = 'M 452 290 C 480 260 515 240 545 215 C 575 190 600 170 625 150'
const branch3L = 'M 700 370 C 670 340 635 320 600 300 C 565 280 540 265 515 250'
const branch3R = 'M 698 320 C 730 290 765 270 795 245 C 825 220 850 200 875 180'
const branch4L = 'M 882 380 C 855 355 830 340 805 320'
const branch4R = 'M 880 340 C 910 315 940 295 965 270'

// --- Small twigs ---
const twig1 = 'M 115 225 C 95 210 80 195 65 185'
const twig2 = 'M 290 175 C 310 155 325 140 340 125'
const twig3 = 'M 545 215 C 565 195 580 180 595 165'
const twig4 = 'M 795 245 C 815 225 830 210 845 195'
const twig5 = 'M 350 265 C 330 248 315 238 300 225'
const twig6 = 'M 600 300 C 580 285 565 275 548 262'

// --- Leaf shapes ---
const leaf1 = 'M 25 155 C 15 138 22 120 40 112 C 58 104 65 120 55 138 C 45 155 32 162 25 155'
const leaf2 = 'M 360 100 C 350 82 358 65 375 58 C 392 50 400 65 390 82 C 380 100 367 108 360 100'
const leaf3 = 'M 625 140 C 615 122 622 105 640 98 C 658 90 665 105 655 122 C 645 140 632 148 625 140'
const leaf4 = 'M 875 170 C 865 152 872 135 890 128 C 908 120 915 135 905 152 C 895 170 882 178 875 170'
const leaf5 = 'M 55 180 C 48 168 52 155 64 150 C 76 145 82 158 75 170 C 68 182 60 186 55 180'
const leaf6 = 'M 250 200 C 242 185 248 170 262 164 C 276 158 282 172 275 186 C 268 200 255 208 250 200'
const leaf7 = 'M 510 240 C 502 225 508 210 522 204 C 536 198 542 212 535 226 C 528 240 515 248 510 240'
const leaf8 = 'M 840 185 C 832 170 838 155 852 148 C 866 142 872 156 865 170 C 858 185 845 192 840 185'
const leaf9 = 'M 960 260 C 952 245 958 230 972 224 C 986 218 992 232 985 246 C 978 260 965 268 960 260'
const leaf10 = 'M 340 118 C 335 108 338 96 348 92 C 358 88 362 98 357 108 C 352 118 344 124 340 118'
const leaf11 = 'M 595 158 C 588 145 593 132 605 127 C 617 122 622 135 615 147 C 608 160 600 165 595 158'
const leaf12 = 'M 300 218 C 295 208 298 196 308 192 C 318 188 322 198 317 208 C 312 218 304 224 300 218'

// --- Grass at bottom ---
const grass1 = 'M 50 683 C 45 660 38 640 30 620'
const grass2 = 'M 80 683 C 85 655 90 632 98 612'
const grass3 = 'M 110 683 C 105 662 100 645 95 625'
const grass4 = 'M 550 683 C 545 665 540 650 533 633'
const grass5 = 'M 580 683 C 588 660 592 642 600 625'
const grass6 = 'M 940 683 C 945 660 950 640 958 620'
const grass7 = 'M 970 683 C 965 665 960 648 955 630'
const grass8 = 'M 1000 683 C 1005 658 1010 638 1018 618'

// --- Small birds in sky ---
const bird1L = 'M 160 80 C 148 72 138 68 130 75'
const bird1R = 'M 160 80 C 172 72 182 68 190 75'
const bird2L = 'M 760 55 C 748 47 738 43 730 50'
const bird2R = 'M 760 55 C 772 47 782 43 790 50'

// --- Raindrops/drips ---
const drip1 = 'M 300 50 C 300 35 308 22 300 10'
const drip2 = 'M 520 40 C 520 25 528 12 520 0'
const drip3 = 'M 820 65 C 820 48 828 35 820 22'

interface PathGroup {
  paths: string[]
  delay: number
  duration: number
  strokeWidth?: number
}

const pathGroups: PathGroup[] = [
  // 1. Tree trunks (0s)
  { paths: [trunk1, trunk2, trunk3, trunk4], delay: 0, duration: 2.5, strokeWidth: 2.5 },
  // 2. Major branches (1.5s)
  { paths: [branch1L, branch1R, branch2L, branch2R, branch3L, branch3R, branch4L, branch4R], delay: 1.5, duration: 1.8, strokeWidth: 2 },
  // 3. Twigs (3s)
  { paths: [twig1, twig2, twig3, twig4, twig5, twig6], delay: 3, duration: 1.0, strokeWidth: 1.5 },
  // 4. Leaves (4s)
  { paths: [leaf1, leaf2, leaf3, leaf4, leaf5, leaf6, leaf7, leaf8, leaf9, leaf10, leaf11, leaf12], delay: 4, duration: 0.8, strokeWidth: 1.8 },
  // 5. Grass (5.5s)
  { paths: [grass1, grass2, grass3, grass4, grass5, grass6, grass7, grass8], delay: 5.5, duration: 0.6, strokeWidth: 1.5 },
  // 6. Birds (6.5s)
  { paths: [bird1L, bird1R, bird2L, bird2R], delay: 6.5, duration: 0.5, strokeWidth: 1.5 },
  // 7. Drips (7s)
  { paths: [drip1, drip2, drip3], delay: 7, duration: 0.5, strokeWidth: 1.2 },
]

interface AnimatedPathData {
  d: string
  delay: number
  duration: number
  strokeWidth: number
}

function buildAnimatedPaths(): AnimatedPathData[] {
  const result: AnimatedPathData[] = []
  for (const group of pathGroups) {
    for (let i = 0; i < group.paths.length; i++) {
      result.push({
        d: group.paths[i],
        delay: group.delay + i * 0.2,
        duration: group.duration,
        strokeWidth: group.strokeWidth ?? 2,
      })
    }
  }
  return result
}

const animatedPaths = buildAnimatedPaths()

const HOLD_TIME = 4
const FADE_OUT_TIME = 1.5
const PAUSE_TIME = 3

function DemoPath({
  d,
  delay,
  duration,
  strokeWidth,
  cycle,
}: AnimatedPathData & { cycle: number }) {
  const pathRef = useRef<SVGPathElement>(null)
  const [pathLength, setPathLength] = useState(1000)

  useEffect(() => {
    if (pathRef.current) {
      setPathLength(pathRef.current.getTotalLength())
    }
  }, [])

  const variants: Variants = {
    hidden: { strokeDashoffset: pathLength, opacity: 0 },
    drawing: {
      strokeDashoffset: 0,
      opacity: 0.75,
      transition: {
        strokeDashoffset: { delay, duration, ease: 'easeInOut' },
        opacity: { delay, duration: 0.15, ease: 'easeIn' },
      },
    },
    fadeOut: {
      strokeDashoffset: 0,
      opacity: 0,
      transition: { opacity: { duration: FADE_OUT_TIME, ease: 'easeOut' } },
    },
  }

  return (
    <motion.path
      ref={pathRef}
      d={d}
      fill="none"
      stroke="#2D2B3D"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={pathLength}
      variants={variants}
      key={`${d}-${cycle}`}
    />
  )
}

export function BlogDrawingDemo({
  image = '/designs/springs-first-drizzle.png',
  caption = 'Watch how outlines bring a watercolor background to life — this is reverse coloring.',
  className,
}: {
  image?: string
  caption?: string
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(containerRef, { once: false, amount: 0.3 })
  const controls = useAnimation()
  const [cycle, setCycle] = useState(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPendingTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  useEffect(() => {
    let cancelled = false

    if (!isInView) {
      clearPendingTimeout()
      controls.set('hidden')
      return
    }

    const runCycle = async () => {
      try {
        await controls.start('drawing')
        if (cancelled) return

        await new Promise<void>((resolve) => {
          timeoutRef.current = setTimeout(resolve, HOLD_TIME * 1000)
        })
        if (cancelled) return

        await controls.start('fadeOut')
        if (cancelled) return

        await new Promise<void>((resolve) => {
          timeoutRef.current = setTimeout(resolve, PAUSE_TIME * 1000)
        })
        if (cancelled) return

        setCycle((c) => c + 1)
      } catch {
        // Animation interrupted — ignore
      }
    }

    runCycle()

    return () => {
      cancelled = true
      clearPendingTimeout()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInView, cycle])

  return (
    <div
      ref={containerRef}
      className={clsx('my-12 max-w-none!', className)}
    >
      <div className="overflow-hidden rounded-3xl shadow-lg shadow-[#9B7BC7]/10 ring-1 ring-neutral-200/50">
        <div className="relative" style={{ aspectRatio: '3 / 2' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt="Watercolor background — watch as outlines are drawn on top"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <motion.svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 1024 683"
            preserveAspectRatio="xMidYMid slice"
            animate={controls}
            initial="hidden"
          >
            {animatedPaths.map((path, i) => (
              <DemoPath
                key={`${i}-${cycle}`}
                d={path.d}
                delay={path.delay}
                duration={path.duration}
                strokeWidth={path.strokeWidth}
                cycle={cycle}
              />
            ))}
          </motion.svg>
        </div>
      </div>
      {caption && (
        <p className="mt-3 text-center text-sm text-[#6B687D] italic">
          {caption}
        </p>
      )}
    </div>
  )
}
