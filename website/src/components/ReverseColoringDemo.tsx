'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useInView, useAnimation, type Variants } from 'framer-motion'

// SVG paths representing hand-drawn outlines on top of the watercolor
// The viewBox is 1024x1536 to match the image aspect ratio (2:3)
// Paths are designed to trace tree trunks, branches, leaves, and nature elements
// that complement the blue/green/yellow spring forest watercolor

// --- Tree trunks (bottom up, slightly wavy) ---
const treeTrunk1 =
  'M 320 1536 C 318 1450 322 1370 316 1290 C 312 1210 320 1140 318 1060 C 316 980 322 910 320 840 C 318 770 315 710 318 650'

const treeTrunk2 =
  'M 680 1536 C 684 1460 678 1380 682 1300 C 686 1220 676 1150 680 1070 C 684 990 678 920 682 850 C 686 780 680 720 682 660'

const treeTrunk3 =
  'M 500 1536 C 498 1470 504 1400 500 1330 C 496 1260 502 1200 500 1130 C 498 1060 504 1000 500 940'

// --- Major branches ---
const branch1Left =
  'M 318 820 C 300 790 270 770 240 740 C 210 710 180 690 150 670'

const branch1Right =
  'M 320 760 C 340 730 370 710 400 680 C 430 650 455 630 480 600'

const branch2Left =
  'M 680 830 C 660 800 630 780 600 755 C 570 730 545 710 520 690'

const branch2Right =
  'M 682 760 C 710 730 740 710 770 680 C 800 650 830 625 860 600'

const branch3Left =
  'M 500 1000 C 470 970 440 950 410 920 C 380 890 350 870 320 850'

const branch3Right =
  'M 500 960 C 530 930 560 910 590 880 C 620 850 650 830 680 810'

// --- Small twigs off branches ---
const twig1 =
  'M 240 740 C 220 720 200 710 180 690'
const twig2 =
  'M 400 680 C 420 660 430 640 450 620'
const twig3 =
  'M 770 680 C 790 660 810 650 830 630'
const twig4 =
  'M 600 755 C 580 735 560 725 540 710'

// --- Leaf shapes (small curved strokes suggesting leaves) ---
const leaf1 =
  'M 140 660 C 130 640 140 620 160 610 C 180 600 190 620 180 640 C 170 660 150 670 140 660'
const leaf2 =
  'M 460 590 C 450 570 460 550 480 540 C 500 530 510 550 500 570 C 490 590 470 600 460 590'
const leaf3 =
  'M 860 590 C 850 570 860 550 880 540 C 900 530 910 550 900 570 C 890 590 870 600 860 590'
const leaf4 =
  'M 200 680 C 190 665 195 648 210 640 C 225 632 235 648 225 665 C 215 682 205 688 200 680'
const leaf5 =
  'M 750 670 C 740 653 745 636 760 628 C 775 620 785 636 775 653 C 765 670 755 678 750 670'
const leaf6 =
  'M 340 620 C 335 605 340 588 352 582 C 365 576 372 590 365 605 C 358 620 345 628 340 620'
const leaf7 =
  'M 570 870 C 560 855 565 838 580 830 C 595 822 605 838 595 855 C 585 872 575 878 570 870'
const leaf8 =
  'M 380 910 C 370 895 375 878 390 870 C 405 862 415 878 405 895 C 395 912 385 918 380 910'
const leaf9 =
  'M 660 800 C 650 785 655 768 670 760 C 685 752 695 768 685 785 C 675 802 665 808 660 800'
const leaf10 =
  'M 290 830 C 280 815 285 798 300 790 C 315 782 325 798 315 815 C 305 832 295 838 290 830'

// --- Grass blades at bottom ---
const grass1 = 'M 100 1536 C 95 1500 90 1470 80 1440'
const grass2 = 'M 140 1536 C 145 1495 150 1460 160 1430'
const grass3 = 'M 180 1536 C 175 1505 170 1480 165 1450'
const grass4 = 'M 830 1536 C 835 1500 840 1470 850 1440'
const grass5 = 'M 870 1536 C 865 1505 860 1480 855 1450'
const grass6 = 'M 910 1536 C 920 1500 925 1470 935 1440'
const grass7 = 'M 950 1536 C 945 1510 940 1485 935 1460'

// --- A small butterfly ---
const butterflyBody = 'M 800 480 L 800 510'
const butterflyLeftWing =
  'M 800 490 C 780 475 770 460 775 450 C 780 440 790 445 800 460'
const butterflyRightWing =
  'M 800 490 C 820 475 830 460 825 450 C 820 440 810 445 800 460'
const butterflyAntenna1 = 'M 800 480 C 793 468 788 460 785 452'
const butterflyAntenna2 = 'M 800 480 C 807 468 812 460 815 452'

// --- A couple of small raindrops (matching the drip theme) ---
const raindrop1 = 'M 420 200 C 420 180 430 165 420 150'
const raindrop2 = 'M 620 160 C 620 140 630 125 620 110'
const raindrop3 = 'M 250 240 C 250 220 260 205 250 190'

// Group paths by drawing order with timing
interface PathGroup {
  paths: string[]
  delay: number      // seconds before this group starts
  duration: number   // seconds to draw each path in this group
  strokeWidth?: number
}

const pathGroups: PathGroup[] = [
  // 1. Tree trunks first (0s - 1.5s)
  {
    paths: [treeTrunk1, treeTrunk2, treeTrunk3],
    delay: 0,
    duration: 1.5,
    strokeWidth: 2.5,
  },
  // 2. Major branches (0.8s - 2.3s)
  {
    paths: [branch1Left, branch1Right, branch2Left, branch2Right, branch3Left, branch3Right],
    delay: 0.8,
    duration: 1.0,
    strokeWidth: 2,
  },
  // 3. Twigs (1.5s - 2.5s)
  {
    paths: [twig1, twig2, twig3, twig4],
    delay: 1.5,
    duration: 0.6,
    strokeWidth: 1.8,
  },
  // 4. Leaves (2.0s - 3.5s)
  {
    paths: [leaf1, leaf2, leaf3, leaf4, leaf5, leaf6, leaf7, leaf8, leaf9, leaf10],
    delay: 2.0,
    duration: 0.5,
    strokeWidth: 2,
  },
  // 5. Grass (2.8s - 3.5s)
  {
    paths: [grass1, grass2, grass3, grass4, grass5, grass6, grass7],
    delay: 2.8,
    duration: 0.4,
    strokeWidth: 1.5,
  },
  // 6. Butterfly (3.2s - 4.0s)
  {
    paths: [butterflyBody, butterflyLeftWing, butterflyRightWing, butterflyAntenna1, butterflyAntenna2],
    delay: 3.2,
    duration: 0.5,
    strokeWidth: 1.8,
  },
  // 7. Raindrops (3.5s - 4.2s)
  {
    paths: [raindrop1, raindrop2, raindrop3],
    delay: 3.5,
    duration: 0.4,
    strokeWidth: 1.5,
  },
]

// Flatten into individual path entries with computed delays
interface AnimatedPath {
  d: string
  delay: number
  duration: number
  strokeWidth: number
}

function buildAnimatedPaths(): AnimatedPath[] {
  const result: AnimatedPath[] = []
  for (const group of pathGroups) {
    for (let i = 0; i < group.paths.length; i++) {
      result.push({
        d: group.paths[i],
        delay: group.delay + i * 0.15, // stagger within group
        duration: group.duration,
        strokeWidth: group.strokeWidth ?? 2,
      })
    }
  }
  return result
}

const animatedPaths = buildAnimatedPaths()

// Animation timing constants
const HOLD_TIME = 2 // seconds to hold completed drawing
const FADE_OUT_TIME = 1 // seconds to fade out
const PAUSE_TIME = 2 // seconds of pause before restart

function AnimatedPath({
  d,
  delay,
  duration,
  strokeWidth,
  cycle,
}: AnimatedPath & { cycle: number }) {
  const pathRef = useRef<SVGPathElement>(null)
  const [pathLength, setPathLength] = useState(1000)

  useEffect(() => {
    if (pathRef.current) {
      const length = pathRef.current.getTotalLength()
      setPathLength(length)
    }
  }, [])

  const variants: Variants = {
    hidden: {
      strokeDashoffset: pathLength,
      opacity: 0,
    },
    drawing: {
      strokeDashoffset: 0,
      opacity: 0.7,
      transition: {
        strokeDashoffset: {
          delay,
          duration,
          ease: 'easeInOut',
        },
        opacity: {
          delay,
          duration: 0.1,
          ease: 'easeIn',
        },
      },
    },
    fadeOut: {
      strokeDashoffset: 0,
      opacity: 0,
      transition: {
        opacity: {
          duration: FADE_OUT_TIME,
          ease: 'easeOut',
        },
      },
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

export function ReverseColoringDemo() {
  const containerRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(containerRef, { once: false, amount: 0.3 })
  const controls = useAnimation()
  const [cycle, setCycle] = useState(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear any pending timeouts
  const clearPendingTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  useEffect(() => {
    if (!isInView) {
      clearPendingTimeout()
      controls.set('hidden')
      return
    }

    const runCycle = async () => {
      // Drawing phase
      await controls.start('drawing')

      // Hold the completed drawing
      await new Promise<void>((resolve) => {
        timeoutRef.current = setTimeout(resolve, HOLD_TIME * 1000)
      })

      // Fade out
      await controls.start('fadeOut')

      // Pause before restart
      await new Promise<void>((resolve) => {
        timeoutRef.current = setTimeout(resolve, PAUSE_TIME * 1000)
      })

      // Reset and start new cycle
      setCycle((c) => c + 1)
    }

    runCycle()

    return () => {
      clearPendingTimeout()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInView, cycle])

  return (
    <div ref={containerRef} className="flex flex-col items-center">
      <div className="relative w-full max-w-[360px] lg:max-w-[400px]">
        {/* Soft shadow / frame effect */}
        <div className="overflow-hidden rounded-2xl shadow-xl shadow-[#9B7BC7]/15 ring-1 ring-white/60">
          <div className="relative" style={{ aspectRatio: '2 / 3' }}>
            {/* Watercolor background image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/designs/springs-first-drizzle.png"
              alt="Spring watercolor background with blue and green washes — a reverse coloring page where you draw outlines on top"
              className="absolute inset-0 h-full w-full object-cover"
              loading="eager"
            />

            {/* Animated SVG overlay */}
            <motion.svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 1024 1536"
              preserveAspectRatio="xMidYMid slice"
              animate={controls}
              initial="hidden"
            >
              {animatedPaths.map((path, i) => (
                <AnimatedPath
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
      </div>

      {/* Caption */}
      <p className="mt-4 text-center font-display text-sm font-medium tracking-wide text-[#6B687D]">
        We provide the colors. You add the lines.
      </p>
    </div>
  )
}
