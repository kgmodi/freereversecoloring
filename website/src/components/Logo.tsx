import clsx from 'clsx'

/**
 * FreeReverseColoring Logo System — v2
 *
 * Concept: "The Emerging Line"
 *
 * A soft watercolor wash shape (the pre-colored background you receive)
 * with a single crisp vector pen stroke drawn over it — the product metaphor
 * in one mark. Color is given; the line is yours.
 *
 * Brand palette (v2):
 *   Ink Indigo   #2D4A5C  — primary (deep teal-navy)
 *   Sage Wash    #B8C9C4  — secondary (neutral bridge, the wash tone)
 *   Terracotta   #A06D63  — accent (warm complement)
 *   Ink Black    #1C1917  — dark text
 *   Parchment    #FAF7F2  — light background
 *
 * Typography:
 *   Display: DM Serif Display (loaded via next/font or Google Fonts)
 *   Body:    DM Sans
 *
 * Usage:
 *   <Logomark />              — icon only, 32×32, defaults to color
 *   <Logomark invert />       — white version for dark backgrounds
 *   <Logo />                  — icon + wordmark, horizontal
 *   <Logo invert />           — white version
 */

export function Logomark({
  invert = false,
  ...props
}: React.ComponentPropsWithoutRef<'svg'> & {
  invert?: boolean
  filled?: boolean
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/*
       * WATERCOLOR WASH LAYER
       * Three overlapping organic blobs simulate wet watercolor pigment.
       * They're intentionally irregular and offset — not circles, not perfectly aligned.
       * This is the "given" color that the user receives.
       */}

      {/* Primary wash — Ink Indigo, largest blob, anchors the composition */}
      <ellipse
        cx="15"
        cy="18"
        rx="10.5"
        ry="9"
        transform="rotate(-8 15 18)"
        className={clsx(invert ? 'fill-white/15' : 'fill-[#2D4A5C]/22')}
      />

      {/* Secondary wash — Sage, offset upper-left, creates depth */}
      <ellipse
        cx="13"
        cy="15"
        rx="8.5"
        ry="7"
        transform="rotate(5 13 15)"
        className={clsx(invert ? 'fill-white/10' : 'fill-[#B8C9C4]/35')}
      />

      {/* Accent wash — Terracotta, lower-right edge, warm highlight */}
      <ellipse
        cx="20"
        cy="21"
        rx="6"
        ry="4.5"
        transform="rotate(-15 20 21)"
        className={clsx(invert ? 'fill-white/8' : 'fill-[#A06D63]/20')}
      />

      {/*
       * THE EMERGING LINE
       * A single confident pen stroke crossing the entire wash area.
       * It starts above the wash (top-left), passes through it, and
       * exits below (bottom-right) — the line "emerging" from color.
       *
       * This IS the product: the user's crisp pen line drawn on the watercolor.
       * The stroke is thick enough to read at favicon sizes, thin enough to feel like a pen.
       */}
      <path
        d="M7 10 C11 12, 14 16, 18 20 C20 22, 22 24, 25 26"
        className={clsx(invert ? 'stroke-white' : 'stroke-[#1C1917]')}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/*
       * PEN NIB
       * A minimal nib shape sits at the start of the stroke (top-left),
       * just above the wash. It grounds the mark as "pen drawing on paper"
       * without being literal/decorative. At small sizes it reads as a dot;
       * at larger sizes it reveals itself as a nib.
       */}
      {/* Nib — small diamond, 3 units, pointing toward the stroke start */}
      <path
        d="M7 10 L5.5 7.5 L7 5 L8.5 7.5 Z"
        className={clsx(invert ? 'fill-white stroke-white' : 'fill-[#2D4A5C] stroke-[#2D4A5C]')}
        strokeWidth="0.5"
        strokeLinejoin="round"
      />

      {/*
       * SECOND STROKE — shorter, fainter
       * Suggests the continuing creative act; implies multiple lines, a drawing in progress.
       * Uses Terracotta to bring the accent color into the mark.
       */}
      <path
        d="M12 24 C15 21.5, 18 20, 22 18"
        className={clsx(invert ? 'stroke-white/45' : 'stroke-[#A06D63]/70')}
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeDasharray="1.5 2"
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
    <div className={clsx('flex items-center gap-3', className)} {...props}>
      <Logomark className="h-10 w-10 shrink-0" invert={invert} />

      {/*
       * Wordmark: "FreeReverseColoring.com"
       * One word, capital F, "Reverse" in brand purple, rest in dark.
       * Bold sans-serif (DM Sans via font-sans).
       */}
      <span
        className={clsx(
          'font-sans tracking-tight leading-none font-bold',
          invert ? 'text-white' : 'text-[#2D2B3D]',
        )}
        style={{ fontSize: '1.375rem' }}
      >
        Free
        <span
          className={clsx(
            invert ? 'text-white/70' : 'text-[#9B7BC7]',
          )}
        >
          Reverse
        </span>
        Coloring
        <span
          className={clsx(
            invert ? 'text-white/50' : 'text-[#2D2B3D]/60',
          )}
        >
          .com
        </span>
      </span>
    </div>
  )
}
