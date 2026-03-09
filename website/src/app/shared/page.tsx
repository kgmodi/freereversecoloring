'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import clsx from 'clsx'

import { Container } from '@/components/Container'
import { FadeIn } from '@/components/FadeIn'
import { RootLayout } from '@/components/RootLayout'
import { Border } from '@/components/Border'

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'https://7sjfdtpy7f.execute-api.us-east-1.amazonaws.com/prod'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SharedDesign {
  generationId: string
  status: string
  imageUrl: string
  title: string
  description: string
  difficulty: string
  drawingPrompts: string[]
  colorPalette: string[]
  tags: string[]
  remainingGenerations: number
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

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

function SparkleIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
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
        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
      />
    </svg>
  )
}

function ShareIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
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
        d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.935-2.186 2.25 2.25 0 0 0-3.935 2.186Z"
      />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
      className={clsx(
        'inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset',
        colors[difficulty] || 'bg-neutral-50 text-neutral-700 ring-neutral-600/20',
      )}
    >
      {labels[difficulty] || difficulty}
    </span>
  )
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="h-12 w-12 rounded-full ring-1 ring-[#9B7BC7]/20"
        style={{ backgroundColor: color }}
        title={color}
      />
      <span className="font-mono text-xs text-[#6B687D]">{color}</span>
    </div>
  )
}

const stepColors = [
  'bg-[#6AACB8]',
  'bg-[#9B7BC7]',
  'bg-[#E8889B]',
  'bg-[#F4845F]',
  'bg-[#7BC77B]',
  'bg-[#6AACB8]',
  'bg-[#9B7BC7]',
  'bg-[#E8889B]',
]

// ---------------------------------------------------------------------------
// Blob download helper (for cross-origin S3 presigned URLs)
// ---------------------------------------------------------------------------

async function handleBlobDownload(url: string, filename: string) {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  } catch {
    // Fallback: open in new tab if blob download fails
    window.open(url, '_blank')
  }
}

// ---------------------------------------------------------------------------
// Share buttons (inline — no external component dependency)
// ---------------------------------------------------------------------------

function ShareButtons({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false)

  const encodedUrl = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(title)

  function handleCopyLink() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-semibold text-[#4A3F6B]">Share:</span>

      {/* Copy link */}
      <button
        type="button"
        onClick={handleCopyLink}
        className="inline-flex items-center gap-1.5 rounded-full bg-[#F8F6FF] px-3 py-1.5 text-xs font-medium text-[#4A3F6B] ring-1 ring-inset ring-[#9B7BC7]/15 transition hover:bg-[#9B7BC7]/10"
      >
        <ShareIcon className="h-3.5 w-3.5" />
        {copied ? 'Copied!' : 'Copy Link'}
      </button>

      {/* Twitter / X */}
      <a
        href={`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full bg-[#F8F6FF] px-3 py-1.5 text-xs font-medium text-[#4A3F6B] ring-1 ring-inset ring-[#9B7BC7]/15 transition hover:bg-[#9B7BC7]/10"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        Twitter
      </a>

      {/* Facebook */}
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full bg-[#F8F6FF] px-3 py-1.5 text-xs font-medium text-[#4A3F6B] ring-1 ring-inset ring-[#9B7BC7]/15 transition hover:bg-[#9B7BC7]/10"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
        </svg>
        Facebook
      </a>

      {/* Pinterest */}
      <a
        href={`https://pinterest.com/pin/create/button/?url=${encodedUrl}&description=${encodedTitle}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full bg-[#F8F6FF] px-3 py-1.5 text-xs font-medium text-[#4A3F6B] ring-1 ring-inset ring-[#9B7BC7]/15 transition hover:bg-[#9B7BC7]/10"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z" />
        </svg>
        Pinterest
      </a>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <RootLayout>
      <Container className="mt-24 sm:mt-32 lg:mt-40">
        <div className="grid grid-cols-1 gap-x-16 gap-y-10 lg:grid-cols-2">
          {/* Image skeleton */}
          <div className="aspect-[2/3] w-full animate-pulse rounded-3xl bg-[#F8F6FF]" />

          {/* Details skeleton */}
          <div className="flex flex-col gap-6">
            <div className="flex gap-3">
              <div className="h-7 w-24 animate-pulse rounded-full bg-[#F8F6FF]" />
              <div className="h-7 w-32 animate-pulse rounded-full bg-[#F8F6FF]" />
            </div>
            <div className="h-12 w-3/4 animate-pulse rounded-2xl bg-[#F8F6FF]" />
            <div className="space-y-2">
              <div className="h-4 w-full animate-pulse rounded-lg bg-[#F8F6FF]" />
              <div className="h-4 w-5/6 animate-pulse rounded-lg bg-[#F8F6FF]" />
              <div className="h-4 w-4/6 animate-pulse rounded-lg bg-[#F8F6FF]" />
            </div>
            <div className="flex gap-4">
              <div className="h-12 w-36 animate-pulse rounded-xl bg-[#F8F6FF]" />
              <div className="h-12 w-36 animate-pulse rounded-xl bg-[#F8F6FF]" />
            </div>
            <div className="space-y-3 pt-8">
              <div className="h-5 w-28 animate-pulse rounded-lg bg-[#F8F6FF]" />
              <div className="h-4 w-full animate-pulse rounded-lg bg-[#F8F6FF]" />
              <div className="h-4 w-full animate-pulse rounded-lg bg-[#F8F6FF]" />
              <div className="h-4 w-3/4 animate-pulse rounded-lg bg-[#F8F6FF]" />
            </div>
          </div>
        </div>
      </Container>
    </RootLayout>
  )
}

// ---------------------------------------------------------------------------
// Error / Not Found state
// ---------------------------------------------------------------------------

function NotFoundState({ message }: { message?: string }) {
  return (
    <RootLayout>
      <Container className="mt-24 sm:mt-32 lg:mt-40">
        <FadeIn>
          <div className="mx-auto max-w-xl text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#F8F6FF]">
              <svg
                className="h-10 w-10 text-[#9B7BC7]"
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth="1.5"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                />
              </svg>
            </div>

            <h1 className="font-display text-3xl font-medium tracking-tight text-[#2D2B3D] sm:text-4xl">
              Design not found
            </h1>

            <p className="mt-4 text-lg text-[#6B687D]">
              {message ||
                'This shared design may have expired or the link might be incorrect. Shared designs are available for a limited time.'}
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/create/"
                className="inline-flex items-center gap-2 rounded-xl bg-[#F4845F] px-6 py-3 font-display text-sm font-semibold text-white shadow-sm transition hover:bg-[#e5734e]"
              >
                <SparkleIcon className="h-5 w-5" />
                Create Your Own
              </Link>
              <Link
                href="/gallery/"
                className="inline-flex items-center gap-2 rounded-xl bg-[#9B7BC7]/10 px-6 py-3 font-display text-sm font-semibold text-[#4A3F6B] transition hover:bg-[#9B7BC7]/20"
              >
                Browse Gallery
              </Link>
            </div>
          </div>
        </FadeIn>
      </Container>
    </RootLayout>
  )
}

// ---------------------------------------------------------------------------
// Main shared design viewer
// ---------------------------------------------------------------------------

function SharedDesignContent() {
  const searchParams = useSearchParams()
  const id = searchParams.get('id')

  const [design, setDesign] = useState<SharedDesign | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setLoading(false)
      setError('No design ID was provided. Please check the link and try again.')
      return
    }

    let cancelled = false

    async function fetchDesign() {
      try {
        const response = await fetch(`${API_URL}/api/custom-generate/${id}`)

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(
              'This design could not be found. It may have expired or the link might be incorrect.',
            )
          }
          throw new Error('Unable to load this design. Please try again later.')
        }

        const data = await response.json()

        if (cancelled) return

        if (data.status !== 'complete') {
          throw new Error(
            'This design is still being generated. Please check back in a moment.',
          )
        }

        setDesign(data)
      } catch (err) {
        if (cancelled) return

        if (
          err instanceof TypeError &&
          (err.message === 'Load failed' ||
            err.message === 'Failed to fetch' ||
            err.message === 'NetworkError when attempting to fetch resource.')
        ) {
          setError(
            'Unable to reach the server. This may be a temporary issue — please wait a moment and try again.',
          )
        } else {
          setError(
            err instanceof Error
              ? err.message
              : 'Something went wrong loading this design.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchDesign()

    return () => {
      cancelled = true
    }
  }, [id])

  // Loading state
  if (loading) {
    return <LoadingSkeleton />
  }

  // Error / not found state
  if (error || !design) {
    return <NotFoundState message={error || undefined} />
  }

  // Success state
  const downloadFilename = `${design.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-')}.png`
  const shareUrl =
    typeof window !== 'undefined'
      ? window.location.href
      : `https://www.freereversecoloring.com/shared/?id=${design.generationId}`

  return (
    <RootLayout>
      <Container className="mt-24 sm:mt-32 lg:mt-40">
        <FadeIn>
          {/* Breadcrumb-style eyebrow */}
          <div className="mb-8 flex items-center gap-2 text-sm text-[#6B687D]">
            <Link
              href="/gallery/"
              className="font-semibold text-[#4A3F6B] transition hover:text-[#9B7BC7]"
            >
              Gallery
            </Link>
            <span aria-hidden="true">/</span>
            <span>Shared Design</span>
          </div>

          <div className="grid grid-cols-1 gap-x-16 gap-y-10 lg:grid-cols-2">
            {/* Left column: image */}
            <div className="relative overflow-hidden rounded-3xl bg-[#F8F6FF] shadow-lg shadow-[#9B7BC7]/10 ring-1 ring-[#9B7BC7]/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={design.imageUrl}
                alt={`${design.title} — shared reverse coloring page`}
                className="w-full"
              />
            </div>

            {/* Right column: details */}
            <div className="flex flex-col">
              {/* Badges */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center rounded-full bg-[#9B7BC7]/10 px-3 py-1 text-sm font-semibold text-[#4A3F6B]">
                  Custom Design
                </span>
                <DifficultyBadge difficulty={design.difficulty} />
              </div>

              {/* Title */}
              <h1 className="mt-6 font-display text-4xl font-medium tracking-tight text-[#2D2B3D] sm:text-5xl">
                {design.title}
              </h1>

              {/* Description */}
              <p className="mt-6 text-lg text-[#6B687D]">
                {design.description}
              </p>

              {/* Action buttons */}
              <div className="mt-8 flex flex-wrap gap-4">
                <button
                  type="button"
                  onClick={() =>
                    handleBlobDownload(design.imageUrl, downloadFilename)
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-[#F4845F] px-6 py-3 font-display text-sm font-semibold text-white shadow-sm transition hover:bg-[#e5734e]"
                >
                  <DownloadIcon className="h-5 w-5" />
                  Download Page
                </button>
                <Link
                  href="/create/"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#9B7BC7]/10 px-6 py-3 font-display text-sm font-semibold text-[#4A3F6B] transition hover:bg-[#9B7BC7]/20"
                >
                  <SparkleIcon className="h-5 w-5" />
                  Create Your Own
                </Link>
              </div>

              {/* Share */}
              <div className="mt-8">
                <ShareButtons title={design.title} url={shareUrl} />
              </div>

              {/* Drawing prompts */}
              {design.drawingPrompts.length > 0 && (
                <Border className="mt-10 pt-10">
                  <h2 className="font-display text-xl font-semibold text-[#2D2B3D]">
                    Drawing Ideas
                  </h2>
                  <p className="mt-2 text-sm text-[#6B687D]">
                    Not sure where to start? Here are some suggestions for
                    outlines you can draw on this background:
                  </p>
                  <ul className="mt-4 space-y-3">
                    {design.drawingPrompts.map((prompt, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span
                          className={clsx(
                            'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
                            stepColors[i % stepColors.length],
                          )}
                        >
                          {i + 1}
                        </span>
                        <span className="text-base text-[#6B687D]">
                          {prompt}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Border>
              )}

              {/* Color palette */}
              {design.colorPalette.length > 0 && (
                <Border className="mt-10 pt-10">
                  <h2 className="font-display text-xl font-semibold text-[#2D2B3D]">
                    Color Palette
                  </h2>
                  <p className="mt-2 text-sm text-[#6B687D]">
                    The dominant colors in this watercolor background:
                  </p>
                  <div className="mt-4 flex flex-wrap gap-4">
                    {design.colorPalette.map((color) => (
                      <ColorSwatch key={color} color={color} />
                    ))}
                  </div>
                </Border>
              )}

              {/* Tags */}
              {design.tags.length > 0 && (
                <div className="mt-8">
                  <div className="flex flex-wrap gap-2">
                    {design.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded-full bg-[#F8F6FF] px-3 py-1 text-xs font-medium text-[#4A3F6B] ring-1 ring-inset ring-[#9B7BC7]/15"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="mt-24 sm:mt-32">
            <div
              className="rounded-3xl px-8 py-16 text-center sm:px-16 sm:py-20"
              style={{
                background:
                  'linear-gradient(135deg, #4A3F6B 0%, #6AACB8 50%, #9B7BC7 100%)',
              }}
            >
              <h2 className="font-display text-3xl font-medium text-white sm:text-4xl">
                Create your own reverse coloring page
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">
                Describe any theme or scene and our AI will paint a unique
                watercolor background just for you. It&apos;s free — 2
                generations per month.
              </p>
              <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Link
                  href="/create/"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 font-display text-sm font-semibold text-[#4A3F6B] shadow-sm transition hover:bg-neutral-100"
                >
                  <SparkleIcon className="h-5 w-5" />
                  Start Creating
                </Link>
                <Link
                  href="/gallery/"
                  className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-8 py-4 font-display text-sm font-semibold text-white transition hover:bg-white/20"
                >
                  Browse Gallery
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </div>
          </div>
        </FadeIn>
      </Container>
    </RootLayout>
  )
}

// ---------------------------------------------------------------------------
// Page export — wraps the client component in Suspense
// (required by Next.js static export for useSearchParams)
// ---------------------------------------------------------------------------

export default function SharedPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <SharedDesignContent />
    </Suspense>
  )
}
