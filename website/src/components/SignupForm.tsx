'use client'

import { useState, type FormEvent } from 'react'
import clsx from 'clsx'

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'https://7sjfdtpy7f.execute-api.us-east-1.amazonaws.com/prod'

type FormState = 'idle' | 'submitting' | 'success' | 'error'

function ArrowIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 16 6" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M16 3 10 .5v2H0v1h10v2L16 3Z"
      />
    </svg>
  )
}

function CheckIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M9 12.75L11.25 15 15 9.75"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  )
}

export function SignupForm({
  variant = 'default',
  className,
}: {
  variant?: 'default' | 'dark' | 'inline'
  className?: string
}) {
  const [email, setEmail] = useState('')
  const [formState, setFormState] = useState<FormState>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!email || !email.includes('@')) {
      setFormState('error')
      setErrorMessage('Please enter a valid email address.')
      return
    }

    setFormState('submitting')
    setErrorMessage('')

    try {
      const response = await fetch(`${API_URL}/api/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: '' }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Something went wrong. Please try again.')
      }

      setFormState('success')
      setEmail('')
    } catch (err) {
      setFormState('error')
      setErrorMessage(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      )
    }
  }

  const isDark = variant === 'dark'

  if (formState === 'success') {
    return (
      <div className={clsx('flex items-center gap-3', className)}>
        <CheckIcon
          className={clsx(
            'h-6 w-6 shrink-0',
            isDark ? 'text-[#7BC77B]' : 'text-[#7BC77B]',
          )}
        />
        <p
          className={clsx(
            'text-sm font-semibold',
            isDark ? 'text-white' : 'text-[#2D2B3D]',
          )}
        >
          You are subscribed! Check your email to confirm.
        </p>
      </div>
    )
  }

  return (
    <div className={className}>
      <form onSubmit={handleSubmit} className="max-w-md">
        <div className="relative">
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (formState === 'error') setFormState('idle')
            }}
            placeholder="Enter your email"
            autoComplete="email"
            aria-label="Email address"
            disabled={formState === 'submitting'}
            className={clsx(
              'block w-full rounded-2xl border py-4 pr-20 pl-6 text-base/6 ring-4 ring-transparent transition placeholder:text-[#6B687D]/60 focus:outline-hidden',
              isDark
                ? 'border-white/20 bg-white/5 text-white focus:border-white focus:ring-white/10'
                : 'border-[#9B7BC7]/20 bg-transparent text-[#2D2B3D] focus:border-[#9B7BC7] focus:ring-[#9B7BC7]/10',
              formState === 'submitting' && 'opacity-60',
            )}
          />
          <div className="absolute inset-y-1 right-1 flex justify-end">
            <button
              type="submit"
              disabled={formState === 'submitting'}
              aria-label={formState === 'submitting' ? 'Subscribing...' : 'Subscribe'}
              className={clsx(
                'flex aspect-square h-full items-center justify-center rounded-xl transition',
                isDark
                  ? 'bg-white text-[#4A3F6B] hover:bg-neutral-100'
                  : 'bg-[#F4845F] text-white hover:bg-[#e5734e]',
                formState === 'submitting' && 'opacity-60',
              )}
            >
              {formState === 'submitting' ? (
                <svg
                  className="h-4 w-4 animate-spin"
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
              ) : (
                <ArrowIcon className="w-4" />
              )}
            </button>
          </div>
        </div>
      </form>

      {formState === 'error' && errorMessage && (
        <p className={clsx('mt-2 text-sm', isDark ? 'text-red-400' : 'text-red-600')}>
          {errorMessage}
        </p>
      )}

      <p
        className={clsx(
          'mt-3 text-xs',
          isDark ? 'text-white/50' : 'text-[#6B687D]',
        )}
      >
        Free forever. No spam. Unsubscribe anytime.
      </p>
    </div>
  )
}
