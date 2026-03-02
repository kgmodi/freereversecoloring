import clsx from 'clsx'

export function Logomark({
  invert = false,
  ...props
}: React.ComponentPropsWithoutRef<'svg'> & {
  invert?: boolean
  filled?: boolean
}) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" {...props}>
      <circle
        cx="16"
        cy="16"
        r="14"
        className={clsx(
          'transition-colors',
          invert ? 'fill-white/10 stroke-white' : 'fill-[#9B7BC7]/10 stroke-[#9B7BC7]',
        )}
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M10 16 C12 10, 20 10, 22 16 C20 22, 12 22, 10 16Z"
        className={clsx(
          'transition-colors',
          invert ? 'fill-white' : 'fill-[#9B7BC7]',
        )}
        opacity="0.6"
      />
      <path
        d="M8 18 C11 12, 21 12, 24 18"
        className={clsx(invert ? 'stroke-white' : 'stroke-[#6AACB8]')}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M9 14 C12 20, 20 20, 23 14"
        className={clsx(invert ? 'stroke-white' : 'stroke-[#E8889B]')}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Logo({
  className,
  invert = false,
  ...props
}: React.ComponentPropsWithoutRef<'div'> & {
  invert?: boolean
  filled?: boolean
  fillOnHover?: boolean
}) {
  return (
    <div className={clsx('flex items-center gap-2', className)} {...props}>
      <Logomark className="h-8 w-8" invert={invert} />
      <span
        className={clsx(
          'font-display text-lg font-semibold tracking-tight',
          invert ? 'text-white' : 'text-[#2D2B3D]',
        )}
      >
        Free<span className={invert ? 'text-white/70' : 'text-[#9B7BC7]'}>Reverse</span>Coloring
      </span>
    </div>
  )
}
