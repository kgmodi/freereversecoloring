import { type Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import { Container } from '@/components/Container'
import { FadeIn, FadeInStagger } from '@/components/FadeIn'
import { PageIntro } from '@/components/PageIntro'
import { RootLayout } from '@/components/RootLayout'
import { Border } from '@/components/Border'
import { GalleryFilter } from '@/components/GalleryFilter'

import designs from '@/data/designs.json'

export const metadata: Metadata = {
  title: 'Gallery',
  description:
    'Browse our collection of AI-generated reverse coloring pages. Beautiful watercolor backgrounds ready for your creative outlines.',
}

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const colors: Record<string, string> = {
    easy: 'bg-green-50 text-green-700 ring-green-600/20',
    medium: 'bg-yellow-50 text-yellow-700 ring-yellow-600/20',
    advanced: 'bg-red-50 text-red-700 ring-red-600/20',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${colors[difficulty] || 'bg-neutral-50 text-neutral-700 ring-neutral-600/20'}`}
    >
      {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
    </span>
  )
}

function ThemeBadge({ theme }: { theme: string }) {
  const label = theme
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  return (
    <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-700">
      {label}
    </span>
  )
}

function DesignCard({
  design,
}: {
  design: (typeof designs)[number]
}) {
  return (
    <FadeIn className="flex">
      <Link
        href={`/gallery/${design.slug}`}
        className="group relative flex w-full flex-col overflow-hidden rounded-3xl ring-1 ring-neutral-950/5 transition hover:ring-neutral-950/15"
      >
        <div className="relative aspect-[2/3] w-full overflow-hidden bg-neutral-100">
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
            <ThemeBadge theme={design.theme} />
            <DifficultyBadge difficulty={design.difficulty} />
          </div>
          <h3 className="mt-4 font-display text-xl font-semibold text-neutral-950">
            {design.title}
          </h3>
          <p className="mt-2 line-clamp-2 text-sm text-neutral-600">
            {design.description}
          </p>
          <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-neutral-950">
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
    </FadeIn>
  )
}

// Extract unique themes for filter
const themes = Array.from(new Set(designs.map((d) => d.theme)))

export default function GalleryPage() {
  return (
    <RootLayout>
      <PageIntro eyebrow="Gallery" title="Browse our reverse coloring designs">
        <p>
          Each design is a unique AI-generated watercolor background, crafted to
          inspire your creativity. Pick one, print it, and add your own outlines
          to create something beautiful.
        </p>
      </PageIntro>

      <Container className="mt-16 sm:mt-20">
        <GalleryFilter themes={themes} designs={designs} />
      </Container>
    </RootLayout>
  )
}
