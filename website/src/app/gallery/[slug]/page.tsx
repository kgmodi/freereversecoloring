import { type Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Container } from '@/components/Container'
import { FadeIn } from '@/components/FadeIn'
import { PageIntro } from '@/components/PageIntro'
import { RootLayout } from '@/components/RootLayout'
import { Border } from '@/components/Border'
import { PrintButton } from '@/components/PrintButton'

import designs from '@/data/designs.json'

type Design = (typeof designs)[number]

// Required for static export — pre-renders all known design slugs
export function generateStaticParams() {
  return designs.map((design) => ({
    slug: design.slug,
  }))
}

export function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Metadata {
  const design = designs.find((d) => d.slug === params.slug)
  if (!design) return {}

  return {
    title: `${design.title} — Reverse Coloring Page`,
    description: design.description,
  }
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

  const labels: Record<string, string> = {
    easy: 'Beginner Friendly',
    beginner: 'Beginner Friendly',
    medium: 'Intermediate',
    advanced: 'Advanced',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset ${colors[difficulty] || 'bg-neutral-50 text-neutral-700 ring-neutral-600/20'}`}
    >
      {labels[difficulty] || difficulty}
    </span>
  )
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="h-12 w-12 rounded-full ring-1 ring-neutral-200"
        style={{ backgroundColor: color }}
        title={color}
      />
      <span className="text-xs font-mono text-neutral-500">{color}</span>
    </div>
  )
}

function DownloadIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.5"
      stroke="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
      />
    </svg>
  )
}

function ArrowLeftIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.5"
      stroke="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
      />
    </svg>
  )
}

function PrinterIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.5"
      stroke="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m0 0a48.159 48.159 0 0 1 10.5 0m-10.5 0V4.5c0-.621.504-1.125 1.125-1.125h8.25c.621 0 1.125.504 1.125 1.125v3.034"
      />
    </svg>
  )
}

export default function DesignPage({
  params,
}: {
  params: { slug: string }
}) {
  const design = designs.find((d) => d.slug === params.slug)

  if (!design) {
    notFound()
  }

  return (
    <RootLayout>
      <Container className="mt-24 sm:mt-32 lg:mt-40">
        <FadeIn>
          {/* Back link */}
          <Link
            href="/gallery"
            className="group mb-8 inline-flex items-center gap-2 text-sm font-semibold text-neutral-950 transition hover:text-neutral-700"
          >
            <ArrowLeftIcon className="h-4 w-4 transition group-hover:-translate-x-1" />
            Back to Gallery
          </Link>

          <div className="grid grid-cols-1 gap-x-16 gap-y-10 lg:grid-cols-2">
            {/* Left column: image */}
            <div className="relative aspect-[2/3] w-full overflow-hidden rounded-3xl bg-neutral-100">
              <Image
                src={design.imagePath}
                alt={`${design.title} — reverse coloring page watercolor background`}
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
                priority
              />
            </div>

            {/* Right column: details */}
            <div className="flex flex-col">
              {/* Title and badges */}
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold text-neutral-700">
                    {formatTheme(design.theme)}
                  </span>
                  <DifficultyBadge difficulty={design.difficulty} />
                  <span className="text-sm text-neutral-500">
                    Week {design.weekId}
                  </span>
                </div>

                <h1 className="mt-6 font-display text-4xl font-medium tracking-tight text-neutral-950 sm:text-5xl">
                  {design.title}
                </h1>

                <p className="mt-6 text-lg text-neutral-600">
                  {design.description}
                </p>
              </div>

              {/* Action buttons */}
              <div className="mt-8 flex flex-wrap gap-4">
                <a
                  href={design.imagePath}
                  download={`${design.slug}.png`}
                  className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
                >
                  <DownloadIcon className="h-5 w-5" />
                  Download
                </a>
                <PrintButton>
                  <PrinterIcon className="h-5 w-5" />
                  Print
                </PrintButton>
              </div>

              {/* Drawing Ideas */}
              <Border className="mt-10 pt-10">
                <h2 className="font-display text-xl font-semibold text-neutral-950">
                  Drawing Ideas
                </h2>
                <p className="mt-2 text-sm text-neutral-600">
                  Not sure where to start? Here are some suggestions for outlines
                  you can draw on this background:
                </p>
                <ul className="mt-4 space-y-3">
                  {design.drawingPrompts.map((prompt, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-xs font-semibold text-white">
                        {i + 1}
                      </span>
                      <span className="text-base text-neutral-600">
                        {prompt}
                      </span>
                    </li>
                  ))}
                </ul>
              </Border>

              {/* Color Palette */}
              <Border className="mt-10 pt-10">
                <h2 className="font-display text-xl font-semibold text-neutral-950">
                  Color Palette
                </h2>
                <p className="mt-2 text-sm text-neutral-600">
                  The dominant colors in this watercolor background:
                </p>
                <div className="mt-4 flex flex-wrap gap-4">
                  {design.colorPalette.map((color) => (
                    <ColorSwatch key={color} color={color} />
                  ))}
                </div>
              </Border>

              {/* Tags */}
              {design.tags.length > 0 && (
                <div className="mt-8">
                  <div className="flex flex-wrap gap-2">
                    {design.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded-full bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-600 ring-1 ring-inset ring-neutral-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </FadeIn>
      </Container>
    </RootLayout>
  )
}
