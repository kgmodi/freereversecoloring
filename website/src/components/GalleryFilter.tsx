'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import clsx from 'clsx'
import { motion, AnimatePresence } from 'framer-motion'

type Design = {
  designId: string
  weekId: string
  title: string
  description: string
  theme: string
  slug: string
  imagePath: string
  status: string
  difficulty: string
  drawingPrompts: string[]
  colorPalette: string[]
  tags: string[]
  isPremium: boolean
  width: number
  height: number
  createdAt: string
}

function formatTheme(theme: string): string {
  return theme
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const colors: Record<string, string> = {
    easy: 'bg-green-50 text-green-700 ring-green-600/20',
    beginner: 'bg-green-50 text-green-700 ring-green-600/20',
    medium: 'bg-yellow-50 text-yellow-700 ring-yellow-600/20',
    advanced: 'bg-red-50 text-red-700 ring-red-600/20',
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
        colors[difficulty] || 'bg-neutral-50 text-neutral-700 ring-neutral-600/20',
      )}
    >
      {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
    </span>
  )
}

export function GalleryFilter({
  themes,
  designs,
}: {
  themes: string[]
  designs: Design[]
}) {
  const [activeTheme, setActiveTheme] = useState<string | null>(null)

  const filtered = activeTheme
    ? designs.filter((d) => d.theme === activeTheme)
    : designs

  return (
    <>
      {/* Filter buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-[#2D2B3D]">
          Filter by theme:
        </span>
        <button
          onClick={() => setActiveTheme(null)}
          className={clsx(
            'rounded-full px-4 py-1.5 text-sm font-semibold transition',
            activeTheme === null
              ? 'bg-[#9B7BC7] text-white'
              : 'bg-[#9B7BC7]/10 text-[#4A3F6B] hover:bg-[#9B7BC7]/20',
          )}
        >
          All
        </button>
        {themes.map((theme) => (
          <button
            key={theme}
            onClick={() => setActiveTheme(theme)}
            className={clsx(
              'rounded-full px-4 py-1.5 text-sm font-semibold transition',
              activeTheme === theme
                ? 'bg-[#9B7BC7] text-white'
                : 'bg-[#9B7BC7]/10 text-[#4A3F6B] hover:bg-[#9B7BC7]/20',
            )}
          >
            {formatTheme(theme)}
          </button>
        ))}
      </div>

      {/* Design grid */}
      <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {filtered.map((design) => (
            <motion.div
              key={design.designId}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <Link
                href={`/gallery/${design.slug}`}
                className="group relative flex w-full flex-col overflow-hidden rounded-3xl ring-1 ring-[#9B7BC7]/10 transition hover:ring-[#9B7BC7]/25 hover:shadow-lg hover:shadow-[#9B7BC7]/10"
              >
                <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#F8F6FF]">
                  <Image
                    src={design.imagePath}
                    alt={`${design.title} — reverse coloring page watercolor background`}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-[#9B7BC7]/10 px-2.5 py-0.5 text-xs font-semibold text-[#4A3F6B]">
                      {formatTheme(design.theme ?? '')}
                    </span>
                    <DifficultyBadge difficulty={design.difficulty ?? ''} />
                  </div>
                  <h3 className="mt-4 font-display text-xl font-semibold text-[#2D2B3D]">
                    {design.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm text-[#6B687D]">
                    {design.description}
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-[#4A3F6B]">
                    View design
                    <span
                      aria-hidden="true"
                      className="transition group-hover:translate-x-1"
                    >
                      &rarr;
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {filtered.length === 0 && (
        <div className="mt-16 text-center">
          <p className="text-lg text-[#6B687D]">
            No designs found for this theme. Check back soon!
          </p>
        </div>
      )}
    </>
  )
}
