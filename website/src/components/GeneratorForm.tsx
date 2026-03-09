'use client'

import { useState, useRef, useCallback, type FormEvent } from 'react'
import clsx from 'clsx'

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'https://7sjfdtpy7f.execute-api.us-east-1.amazonaws.com/prod'

type FormState =
  | 'idle'
  | 'submitting'
  | 'generating_description'
  | 'generating_image'
  | 'success'
  | 'error'
  | 'rate_limited'

interface GeneratedDesign {
  generationId: string
  imageUrl: string
  title: string
  description: string
  difficulty: string
  drawingPrompts: string[]
  colorPalette: string[]
  tags: string[]
  remainingGenerations: number
}

const examplePrompts = [
  'Ocean sunset with gentle waves',
  'Enchanted forest with morning mist',
  'Mountain lake at dawn',
  'Cherry blossom garden in spring',
  'Northern lights over snowy peaks',
  'Tropical coral reef underwater',
  'Cozy autumn cabin in the woods',
  'Lavender fields under a summer sky',
]

const POLL_INTERVAL_MS = 3000
const MAX_POLL_TIME_MS = 120000 // 2 minutes

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

/**
 * Downloads a cross-origin image by fetching it as a blob.
 * The `download` attribute on <a> tags is ignored for cross-origin URLs
 * (e.g., presigned S3 URLs), so we must fetch-and-save via JS.
 */
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

export function GeneratorForm() {
  const [email, setEmail] = useState('')
  const [prompt, setPrompt] = useState('')
  const [formState, setFormState] = useState<FormState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [result, setResult] = useState<GeneratedDesign | null>(null)
  const [rateLimitInfo, setRateLimitInfo] = useState<{
    nextResetDate: string
  } | null>(null)
  const [honeypot, setHoneypot] = useState('')
  const [loadedAt] = useState(() => Date.now())
  const abortRef = useRef<AbortController | null>(null)

  const isGenerating =
    formState === 'submitting' ||
    formState === 'generating_description' ||
    formState === 'generating_image'

  const pollGenerationStatus = useCallback(
    async (generationId: string, signal: AbortSignal) => {
      const startTime = Date.now()

      while (!signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))

        if (signal.aborted) return

        if (Date.now() - startTime > MAX_POLL_TIME_MS) {
          throw new Error(
            'Generation is taking longer than expected. Please try again later.',
          )
        }

        const statusResponse = await fetch(
          `${API_URL}/api/custom-generate/${generationId}`,
          { signal },
        )
        const statusData = await statusResponse.json()

        if (statusData.status === 'complete') {
          setResult(statusData)
          setFormState('success')
          return
        }

        if (statusData.status === 'failed') {
          throw new Error(
            statusData.errorMessage || 'Generation failed. Please try again.',
          )
        }

        // Update progress UI based on backend status
        if (statusData.status === 'processing') {
          setFormState('generating_image')
        }
      }
    },
    [],
  )

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    // Bot detection: honeypot field filled or form submitted too quickly.
    // Silently return without changing state to avoid revealing detection.
    if (honeypot || Date.now() - loadedAt < 2000) {
      return
    }

    if (!email || !email.includes('@')) {
      setFormState('error')
      setErrorMessage('Please enter a valid email address.')
      return
    }

    if (!prompt || prompt.trim().length < 3) {
      setFormState('error')
      setErrorMessage('Please describe your theme in at least a few words.')
      return
    }

    if (prompt.length > 500) {
      setFormState('error')
      setErrorMessage('Please keep your description under 500 characters.')
      return
    }

    // Cancel any in-flight polling
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setFormState('submitting')
    setErrorMessage('')
    setResult(null)

    try {
      // Step 1: Initiate generation (returns immediately with generationId)
      const response = await fetch(`${API_URL}/api/custom-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, prompt }),
        signal: controller.signal,
      })

      const data = await response.json()

      if (response.status === 429) {
        setFormState('rate_limited')
        setRateLimitInfo({ nextResetDate: data.nextResetDate })
        return
      }

      if (!response.ok) {
        throw new Error(
          data.error || 'Something went wrong. Please try again.',
        )
      }

      // Step 2: Start polling for completion
      setFormState('generating_description')
      await pollGenerationStatus(data.generationId, controller.signal)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return // User navigated away or started a new request
      }
      setFormState('error')
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.',
      )
    }
  }

  function handleReset() {
    abortRef.current?.abort()
    setFormState('idle')
    setPrompt('')
    setResult(null)
    setErrorMessage('')
  }

  function handleExampleClick(example: string) {
    setPrompt(example)
  }

  // -------------------------------------------------------------------------
  // Rate limited state
  // -------------------------------------------------------------------------
  if (formState === 'rate_limited') {
    return (
      <div className="rounded-3xl bg-[#F8F6FF] p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#9B7BC7]/10">
          <svg
            className="h-8 w-8 text-[#9B7BC7]"
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth="1.5"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
        </div>
        <h3 className="font-display text-xl font-semibold text-[#2D2B3D]">
          You&apos;ve used your free generations this month
        </h3>
        <p className="mt-2 text-[#6B687D]">
          Your free generations reset on{' '}
          <span className="font-semibold text-[#4A3F6B]">
            {rateLimitInfo?.nextResetDate
              ? new Date(rateLimitInfo.nextResetDate).toLocaleDateString(
                  'en-US',
                  { month: 'long', day: 'numeric', year: 'numeric' },
                )
              : 'the 1st of next month'}
          </span>
          . In the meantime, check out our{' '}
          <a
            href="/gallery"
            className="font-semibold text-[#9B7BC7] underline hover:text-[#6B46C1]"
          >
            gallery
          </a>{' '}
          for ready-to-print designs!
        </p>
        <button
          onClick={handleReset}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#9B7BC7]/10 px-6 py-3 font-display text-sm font-semibold text-[#4A3F6B] transition hover:bg-[#9B7BC7]/20"
        >
          Back to generator
        </button>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Success state — show generated design
  // -------------------------------------------------------------------------
  if (formState === 'success' && result) {
    const downloadFilename = `${result.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-')}.png`
    return (
      <div className="space-y-8">
        {/* Generated image */}
        <div className="overflow-hidden rounded-3xl bg-[#F8F6FF] shadow-lg shadow-[#9B7BC7]/10 ring-1 ring-[#9B7BC7]/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.imageUrl}
            alt={result.title}
            className="w-full"
          />
        </div>

        {/* Design info */}
        <div className="rounded-3xl bg-[#F8F6FF] p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-display text-2xl font-semibold text-[#2D2B3D]">
                {result.title}
              </h3>
              <div className="mt-2 flex items-center gap-3">
                <span
                  className={clsx(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
                    result.difficulty === 'easy'
                      ? 'bg-green-50 text-green-700 ring-green-600/20'
                      : result.difficulty === 'medium'
                        ? 'bg-yellow-50 text-yellow-700 ring-yellow-600/20'
                        : 'bg-red-50 text-red-700 ring-red-600/20',
                  )}
                >
                  {result.difficulty.charAt(0).toUpperCase() +
                    result.difficulty.slice(1)}
                </span>
                {result.tags.slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full bg-[#9B7BC7]/10 px-2.5 py-0.5 text-xs font-medium text-[#4A3F6B]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <p className="mt-4 text-[#6B687D]">{result.description}</p>

          {/* Color palette */}
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-[#4A3F6B]">
              Color Palette
            </h4>
            <div className="mt-2 flex gap-2">
              {result.colorPalette.map((color) => (
                <div
                  key={color}
                  className="group relative h-10 w-10 rounded-xl shadow-sm ring-1 ring-black/5"
                  style={{ backgroundColor: color }}
                  title={color}
                >
                  <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs text-[#6B687D] opacity-0 transition group-hover:opacity-100">
                    {color}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Drawing prompts */}
          <div className="mt-8">
            <h4 className="text-sm font-semibold text-[#4A3F6B]">
              Drawing Prompts
            </h4>
            <ul className="mt-3 space-y-2">
              {result.drawingPrompts.map((drawingPrompt, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#9B7BC7]/10 text-xs font-semibold text-[#9B7BC7]">
                    {i + 1}
                  </span>
                  <span className="text-sm text-[#6B687D]">{drawingPrompt}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Actions */}
          <div className="mt-8 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={() =>
                handleBlobDownload(result.imageUrl, downloadFilename)
              }
              className="inline-flex items-center gap-2 rounded-xl bg-[#F4845F] px-6 py-3 font-display text-sm font-semibold text-white shadow-sm transition hover:bg-[#e5734e]"
            >
              <DownloadIcon className="h-5 w-5" />
              Download Page
            </button>
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-2 rounded-xl bg-[#9B7BC7]/10 px-6 py-3 font-display text-sm font-semibold text-[#4A3F6B] transition hover:bg-[#9B7BC7]/20"
            >
              <SparkleIcon className="h-5 w-5" />
              Create Another
            </button>
          </div>

          {result.remainingGenerations > 0 && (
            <p className="mt-4 text-xs text-[#6B687D]">
              You have{' '}
              <span className="font-semibold text-[#4A3F6B]">
                {result.remainingGenerations}
              </span>{' '}
              free generation{result.remainingGenerations !== 1 ? 's' : ''}{' '}
              remaining this month.
            </p>
          )}
          {result.remainingGenerations === 0 && (
            <p className="mt-4 text-xs text-[#6B687D]">
              This was your last free generation this month. Resets on the 1st!
            </p>
          )}
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Form state (idle, generating, error)
  // -------------------------------------------------------------------------
  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Honeypot */}
        <div
          aria-hidden="true"
          className="absolute -left-[9999px] -top-[9999px]"
        >
          <label htmlFor="gen-website">Website</label>
          <input
            id="gen-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        {/* Email input */}
        <div>
          <label
            htmlFor="generator-email"
            className="block text-sm font-semibold text-[#4A3F6B]"
          >
            Your email
          </label>
          <input
            id="generator-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (formState === 'error') setFormState('idle')
            }}
            placeholder="you@example.com"
            autoComplete="email"
            disabled={isGenerating}
            className="mt-2 block w-full rounded-2xl border border-[#9B7BC7]/20 bg-white px-5 py-3.5 text-base text-[#2D2B3D] ring-4 ring-transparent transition placeholder:text-[#6B687D]/60 focus:border-[#9B7BC7] focus:outline-hidden focus:ring-[#9B7BC7]/10 disabled:opacity-60"
          />
        </div>

        {/* Theme prompt */}
        <div>
          <label
            htmlFor="generator-prompt"
            className="block text-sm font-semibold text-[#4A3F6B]"
          >
            Describe your theme
          </label>
          <textarea
            id="generator-prompt"
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value)
              if (formState === 'error') setFormState('idle')
            }}
            placeholder="e.g., Ocean sunset with gentle waves and a warm golden sky"
            rows={3}
            disabled={isGenerating}
            maxLength={500}
            className="mt-2 block w-full resize-none rounded-2xl border border-[#9B7BC7]/20 bg-white px-5 py-3.5 text-base text-[#2D2B3D] ring-4 ring-transparent transition placeholder:text-[#6B687D]/60 focus:border-[#9B7BC7] focus:outline-hidden focus:ring-[#9B7BC7]/10 disabled:opacity-60"
          />
          <p className="mt-1.5 text-right text-xs text-[#6B687D]">
            {prompt.length}/500
          </p>
        </div>

        {/* Example prompts */}
        {!isGenerating && (
          <div>
            <p className="mb-2 text-xs font-medium text-[#6B687D]">
              Try an example:
            </p>
            <div className="flex flex-wrap gap-2">
              {examplePrompts.slice(0, 4).map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => handleExampleClick(example)}
                  className="rounded-full bg-[#9B7BC7]/8 px-3 py-1.5 text-xs font-medium text-[#4A3F6B] transition hover:bg-[#9B7BC7]/15"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={isGenerating}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#F4845F] px-8 py-4 font-display text-base font-semibold text-white shadow-sm transition hover:bg-[#e5734e] disabled:opacity-60"
        >
          {isGenerating ? (
            <>
              <svg
                className="h-5 w-5 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className="opacity-25"
                />
                <path
                  d="M12 2a10 10 0 0 1 10 10"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
              <span>
                {formState === 'submitting' && 'Preparing your design...'}
                {formState === 'generating_description' &&
                  'Crafting your watercolor concept...'}
                {formState === 'generating_image' &&
                  'Painting your watercolor...'}
              </span>
            </>
          ) : (
            <>
              <SparkleIcon className="h-5 w-5" />
              Generate My Reverse Coloring Page
            </>
          )}
        </button>
      </form>

      {/* Error message */}
      {formState === 'error' && errorMessage && (
        <p className="mt-3 text-sm text-red-600">{errorMessage}</p>
      )}

      {/* Progress indicator during generation */}
      {isGenerating && (
        <div className="mt-6 rounded-2xl bg-[#F8F6FF] p-6">
          <div className="space-y-4">
            <ProgressStep
              label="Validating your request"
              status={
                formState === 'submitting' ? 'active' : 'complete'
              }
            />
            <ProgressStep
              label="Designing your watercolor concept"
              status={
                formState === 'submitting'
                  ? 'pending'
                  : formState === 'generating_description'
                    ? 'active'
                    : 'complete'
              }
            />
            <ProgressStep
              label="Painting your reverse coloring page"
              status={
                formState === 'generating_image' ? 'active' : 'pending'
              }
            />
          </div>
          <p className="mt-4 text-center text-xs text-[#6B687D]">
            This usually takes 30-60 seconds. Please don&apos;t close the page.
          </p>
        </div>
      )}

      <p className="mt-4 text-xs text-[#6B687D]">
        2 free generations per month. No spam. Your email is only used to track
        your free generations.
      </p>
    </div>
  )
}

function ProgressStep({
  label,
  status,
}: {
  label: string
  status: 'pending' | 'active' | 'complete'
}) {
  return (
    <div className="flex items-center gap-3">
      {status === 'pending' && (
        <div className="h-5 w-5 rounded-full border-2 border-[#9B7BC7]/20" />
      )}
      {status === 'active' && (
        <svg
          className="h-5 w-5 animate-spin text-[#9B7BC7]"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
            className="opacity-25"
          />
          <path
            d="M12 2a10 10 0 0 1 10 10"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      )}
      {status === 'complete' && (
        <svg
          className="h-5 w-5 text-[#7BC77B]"
          viewBox="0 0 24 24"
          fill="none"
        >
          <path
            d="M9 12.75L11.25 15 15 9.75"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        </svg>
      )}
      <span
        className={clsx(
          'text-sm',
          status === 'active'
            ? 'font-semibold text-[#4A3F6B]'
            : status === 'complete'
              ? 'text-[#7BC77B]'
              : 'text-[#6B687D]',
        )}
      >
        {label}
      </span>
    </div>
  )
}
