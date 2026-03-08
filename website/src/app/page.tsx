import { type Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import { Container } from '@/components/Container'
import { FadeIn, FadeInStagger } from '@/components/FadeIn'
import { InteractiveHero } from '@/components/InteractiveHero'
import { SectionIntro } from '@/components/SectionIntro'
import { SignupForm } from '@/components/SignupForm'
import { Border } from '@/components/Border'
import { RootLayout } from '@/components/RootLayout'
import { ReverseColoringDemo } from '@/components/ReverseColoringDemo'

import designs from '@/data/designs'
import { loadArticles } from '@/lib/mdx'
import { formatDate } from '@/lib/formatDate'

function HeroSection() {
  return (
    <InteractiveHero>
      <Container className="mt-24 pb-20 sm:mt-32 sm:pb-24 md:mt-40 md:pb-32">
        <div className="lg:flex lg:items-center lg:gap-x-12 xl:gap-x-16">
          {/* Left column: text + signup */}
          <FadeIn className="max-w-xl lg:shrink-0">
            <h1 className="font-display text-5xl font-medium tracking-tight text-balance text-[#2D2B3D] sm:text-7xl lg:text-5xl xl:text-6xl">
              Beautiful Watercolor Backgrounds.{' '}
              <span className="bg-gradient-to-r from-[#6AACB8] via-[#9B7BC7] to-[#E8889B] bg-clip-text text-transparent">
                Your Lines. Your Art.
              </span>
            </h1>
            <p className="mt-6 text-xl text-[#6B687D]">
              Every week, we send you 3 free watercolor backgrounds. You
              print them, grab a pen, and draw your own outlines. It&apos;s coloring
              &mdash; reversed.
            </p>
            <div id="signup" className="mt-10">
              <SignupForm />
            </div>
          </FadeIn>

          {/* Right column: animated demo */}
          <FadeIn className="mt-12 lg:mt-0 lg:flex-1">
            <ReverseColoringDemo />
          </FadeIn>
        </div>
      </Container>
    </InteractiveHero>
  )
}

const steps = [
  {
    number: '01',
    title: 'Subscribe',
    description:
      'Enter your email to get free weekly reverse coloring pages. No credit card, no catch — just beautiful art in your inbox every Wednesday.',
    icon: EnvelopeIcon,
    color: 'bg-[#6AACB8]',
  },
  {
    number: '02',
    title: 'Print',
    description:
      'Download and print the watercolor backgrounds. Each design is unique and crafted to inspire creativity on any paper type.',
    icon: PrinterIcon,
    color: 'bg-[#9B7BC7]',
  },
  {
    number: '03',
    title: 'Draw',
    description:
      'Add your own outlines and bring the art to life. Use pen, pencil, marker, or any medium you love. The background is your canvas.',
    icon: PencilIcon,
    color: 'bg-[#E8889B]',
  },
]

function EnvelopeIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
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
        d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
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

function PencilIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
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
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125"
      />
    </svg>
  )
}

function HowItWorks() {
  return (
    <>
      <div id="how-it-works" />
      <SectionIntro
        eyebrow="How It Works"
        title="Three simple steps to your own reverse coloring masterpiece."
        className="mt-24 sm:mt-32 lg:mt-40"
      >
        <p>
          We create the backgrounds. You bring the creativity.
          Every week, a new design lands in your inbox — ready for your lines.
        </p>
      </SectionIntro>
      <Container className="mt-16">
        <FadeInStagger className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {steps.map((step) => (
            <FadeIn key={step.number} className="flex">
              <article className="relative flex w-full flex-col rounded-3xl p-8 ring-1 ring-[#9B7BC7]/10 transition hover:bg-[#F8F6FF] hover:shadow-lg hover:shadow-[#9B7BC7]/5">
                <div className="flex items-center gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-full ${step.color}`}>
                    <step.icon className="h-6 w-6 text-white" />
                  </div>
                  <span className="font-display text-sm font-semibold text-[#4A3F6B]">
                    Step {step.number}
                  </span>
                </div>
                <h3 className="mt-6 font-display text-2xl font-semibold text-[#2D2B3D]">
                  {step.title}
                </h3>
                <p className="mt-4 text-base text-[#6B687D]">
                  {step.description}
                </p>
              </article>
            </FadeIn>
          ))}
        </FadeInStagger>
      </Container>
    </>
  )
}

// Use the 3 most recent designs from the exported data
const featuredDesigns = designs.slice(0, 3)

function formatTheme(theme: string): string {
  return theme
    .split('_')
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function FeaturedDesigns() {
  return (
    <>
      <SectionIntro
        eyebrow="This Week's Designs"
        title="Every week, a new canvas awaits."
        className="mt-24 sm:mt-32 lg:mt-40"
      >
        <p>
          Watercolor backgrounds, crafted to inspire. Each design
          is unique — delivered free to your inbox every week.
        </p>
      </SectionIntro>
      <Container className="mt-16">
        <FadeInStagger className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {featuredDesigns.map((design) => (
            <FadeIn key={design.designId} className="flex">
              <Link
                href={`/gallery/${design.slug}`}
                className="group relative flex w-full flex-col overflow-hidden rounded-3xl ring-1 ring-[#9B7BC7]/10 transition hover:ring-[#9B7BC7]/25 hover:shadow-lg hover:shadow-[#9B7BC7]/10"
              >
                <div className="relative h-64 w-full overflow-hidden bg-[#F8F6FF]">
                  <Image
                    src={design.imagePath}
                    alt={`${design.title} watercolor background preview`}
                    fill
                    sizes="(min-width: 1024px) 33vw, 100vw"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center rounded-full bg-[#9B7BC7]/10 px-3 py-1 text-xs font-semibold text-[#4A3F6B]">
                      {formatTheme(design.theme)}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                        design.difficulty === 'easy' ||
                        design.difficulty === 'beginner'
                          ? 'bg-green-50 text-green-700 ring-green-600/20'
                          : design.difficulty === 'medium'
                            ? 'bg-yellow-50 text-yellow-700 ring-yellow-600/20'
                            : 'bg-red-50 text-red-700 ring-red-600/20'
                      }`}
                    >
                      {design.difficulty.charAt(0).toUpperCase() +
                        design.difficulty.slice(1)}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-xl font-semibold text-[#2D2B3D]">
                    {design.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm text-[#6B687D]">
                    {design.description}
                  </p>
                </div>
              </Link>
            </FadeIn>
          ))}
        </FadeInStagger>
        <FadeIn className="mt-10 flex justify-center">
          <Link
            href="/gallery"
            className="inline-flex items-center gap-2 font-display text-sm font-semibold text-[#4A3F6B] transition hover:text-[#9B7BC7]"
          >
            View Full Gallery
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </FadeIn>
      </Container>
    </>
  )
}

async function BlogPreview() {
  const articles = await loadArticles()
  const recent = articles.slice(0, 3)

  return (
    <>
      <SectionIntro
        title="From the blog"
        className="mt-24 sm:mt-32 lg:mt-40"
      >
        <p>
          Tips, science, and inspiration for your creative practice.
        </p>
      </SectionIntro>
      <Container className="mt-16">
        <FadeInStagger className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {recent.map((article) => (
            <FadeIn key={article.href} className="flex">
              <Link
                href={article.href}
                className="group flex flex-col overflow-hidden rounded-3xl bg-neutral-100 transition hover:bg-neutral-200"
              >
                {article.heroImage && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={article.heroImage}
                    alt={article.title}
                    className="aspect-3/2 w-full object-cover"
                  />
                )}
                <div className="flex flex-1 flex-col p-6">
                  <p className="text-sm text-[#9B7BC7]">
                    <time dateTime={article.date}>
                      {formatDate(article.date)}
                    </time>
                  </p>
                  <h3 className="mt-2 font-display text-lg font-semibold text-[#2D2B3D] group-hover:text-[#9B7BC7]">
                    {article.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm text-[#6B687D]">
                    {article.description}
                  </p>
                </div>
              </Link>
            </FadeIn>
          ))}
        </FadeInStagger>
        <FadeIn className="mt-10 flex justify-center">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 font-display text-sm font-semibold text-[#4A3F6B] transition hover:text-[#9B7BC7]"
          >
            View All Articles
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </FadeIn>
      </Container>
    </>
  )
}

function CtaBanner() {
  return (
    <Container className="mt-24 sm:mt-32 lg:mt-40">
      <FadeIn
        className="-mx-6 rounded-4xl px-6 py-20 sm:mx-0 sm:py-32 md:px-12"
        style={{
          background: `
            linear-gradient(135deg, #4A3F6B 0%, #6AACB8 50%, #9B7BC7 100%)
          `,
        }}
      >
        <div className="mx-auto max-w-4xl">
          <div className="max-w-xl">
            <h2 className="font-display text-3xl font-medium text-balance text-white sm:text-4xl">
              Start creating today — completely free.
            </h2>
            <p className="mt-4 text-lg text-white/80">
              Sign up and get your first set of reverse coloring pages this
              Wednesday. No account needed — just your email.
            </p>
            <div className="mt-8">
              <SignupForm variant="dark" />
            </div>
          </div>
        </div>
      </FadeIn>
    </Container>
  )
}

const faqs = [
  {
    question: 'What is reverse coloring?',
    answer:
      'Reverse coloring is a unique twist on traditional coloring books. Instead of starting with white pages featuring black outlines to fill in with color, reverse coloring presents pre-colored pages. These vibrant backgrounds set the stage for you to add your own patterns, details, and outlines. The process encourages a different kind of creativity, where you define the shapes and bring structure to a colorful canvas, effectively "coloring" with lines and forms instead of different hues. It\'s a creative challenge that flips the usual coloring approach, pushing the boundaries of imagination and artistic expression.',
  },
  {
    question: 'How do I start?',
    answer:
      'Choose Your Page: Select a pre-colored page from our collection that inspires you. Look for colors and gradients that spark your imagination, then print it out.\n\nGather Your Tools: You\'ll need pens, pencils, markers, or any drawing tool you prefer for adding lines and details.\n\nAdd Your Lines: Begin drawing directly on your reverse coloring page. You can outline areas to define shapes or add patterns and textures.\n\nEmbrace Imperfections: Don\'t worry about making mistakes. Every line adds character and makes your design uniquely yours.\n\nEnjoy the Process: Remember, the goal is to relax and enjoy the creative journey. There\'s no right or wrong way to do it!',
  },
  {
    question: 'Is it really free?',
    answer:
      'Yes, completely free. No credit card, no hidden fees, no catch. Sign up, get designs, print, and draw.',
  },
  {
    question: 'What are the best pens for reverse coloring?',
    answer:
      'For reverse coloring, where you\'re drawing lines or adding details to pre-colored pages, the best pens have precision, a variety of line widths, and vibrant ink that stands out on colored backgrounds.\n\nMicron Pens: Celebrated for their precision and archival-quality ink. They come in various sizes, allowing for fine detail work as well as bolder lines. The ink is waterproof and fade-resistant.\n\nFaber-Castell Pitt Artist Pens: Known for their high-quality pigmented India ink, these offer excellent opacity and smooth application. Great for overlaying lines on colored backgrounds.\n\nUni-ball Signo Gel Pens: Particularly good for their range of colors, including white, which is excellent for highlighting or drawing on dark backgrounds. The ink flows smoothly for crisp lines.\n\nSakura Gelly Roll Pens: Ideal for adding decorative touches or highlights. They come in white, metallic, and glitter variants that add a unique dimension to your artwork.\n\nStaedtler Triplus Fineliners: Fine-tipped pens perfect for detail work, with water-based ink that doesn\'t bleed through pages. Wide range of colors available.\n\nStabilo Point 88 Fineliner Pens: Known for their fine tips and vibrant ink, great for precision and adding colorful details that stand out.\n\nPilot FriXion Pens: If you\'re nervous about making permanent marks, these erasable gel pens allow for corrections and adjustments as you define your artwork.',
  },
  {
    question: 'How often do I get new designs?',
    answer:
      'Every Wednesday. Three brand-new watercolor backgrounds arrive in your inbox, each with a unique theme and color palette. They\'re designed to be printed on standard letter paper.',
  },
  {
    question: 'What happens when adults do coloring books?',
    answer:
      'Engaging in coloring books offers adults a range of benefits that encompass mental, emotional, and cognitive health.\n\nMental Health: Coloring can significantly reduce stress and anxiety, fostering a state of mindfulness and presence. It acts as a form of meditation, redirecting focus from stressors and improving mood and concentration.\n\nCreativity and Cognitive Skills: It encourages creativity within structured lines, offering a unique outlet for expressing imagination. The activity also helps in enhancing fine motor skills and hand-eye coordination.\n\nSocial and Emotional Well-being: Adult coloring cultivates a sense of community through sharing artwork and experiences, reducing feelings of isolation. It serves as a therapeutic outlet for non-verbal expression of emotions and can be particularly effective in managing anxiety.\n\nPhysical Benefits: The relaxation induced by coloring has been linked to lower blood pressure, highlighting its physical health benefits.\n\nAccessibility: Coloring is an easily accessible hobby that doesn\'t require special skills or expensive materials, making it a versatile option for stress relief and creative expression at any time and place.',
  },
  {
    question: 'How long does it take to complete a page?',
    answer:
      'The time varies depending on the complexity of the design, the tools you use, the level of detail you want, and your personal pace. For simpler designs, you might spend an hour or less. More intricate designs could take several hours or spread over multiple sessions.\n\nFor beginners, a less detailed page might take 1-3 hours as you explore techniques and combinations. More experienced artists working on highly detailed pages might spend 5-10 hours or more to achieve the depth and detail they desire.\n\nReverse coloring pages can add an extra layer of creative exploration compared to traditional coloring, especially if you\'re aiming for smooth gradients or detailed shading in your outlines.',
  },
  {
    question: 'Can I share my finished artwork?',
    answer:
      'We\'d love to see what you create! A community gallery is coming soon. For now, share on social media — we\'re building something special for artists like you.',
  },
  {
    question: 'I have feedback or questions. How do I contact you?',
    answer:
      'Email us at hello@freereversecoloring.com — we read every message.',
  },
]

function FAQ() {
  return (
    <>
      <div id="faq" />
      <SectionIntro
        eyebrow="FAQ"
        title="Frequently asked questions"
        className="mt-24 sm:mt-32 lg:mt-40"
      >
        <p>
          Everything you need to know about reverse coloring pages and how
          FreeReverseColoring works.
        </p>
      </SectionIntro>
      <Container className="mt-16">
        <FadeInStagger>
          <dl className="space-y-8">
            {faqs.map((faq) => (
              <FadeIn key={faq.question}>
                <Border className="pt-8 first:pt-0 first:before:hidden first:after:hidden">
                  <dt className="font-display text-lg font-semibold text-[#2D2B3D]">
                    {faq.question}
                  </dt>
                  <dd className="mt-4 text-base text-[#6B687D] whitespace-pre-line">
                    {faq.answer}
                  </dd>
                </Border>
              </FadeIn>
            ))}
          </dl>
        </FadeInStagger>
      </Container>
    </>
  )
}

const stats = [
  {
    value: 'Free',
    label: 'Always, no catch',
    gradient: 'from-[#6AACB8]/20 to-[#6AACB8]/5',
    accentColor: '#6AACB8',
    icon: HeartIcon,
  },
  {
    value: 'Weekly',
    label: 'Fresh designs every Wednesday',
    gradient: 'from-[#9B7BC7]/20 to-[#9B7BC7]/5',
    accentColor: '#9B7BC7',
    icon: CalendarIcon,
  },
  {
    value: '3 Designs',
    label: 'Unique watercolors each week',
    gradient: 'from-[#E8889B]/20 to-[#E8889B]/5',
    accentColor: '#E8889B',
    icon: SparklesIcon,
  },
]

function HeartIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="currentColor" aria-hidden="true" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
    </svg>
  )
}

function CalendarIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="currentColor" aria-hidden="true" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
    </svg>
  )
}

function SparklesIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="currentColor" aria-hidden="true" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
    </svg>
  )
}

function Stats() {
  return (
    <Container className="mt-24 sm:mt-32 lg:mt-40">
      <FadeIn className="text-center">
        <h2 className="font-display text-sm font-semibold tracking-wider text-[#9B7BC7]">
          A new way to create art
        </h2>
        <div className="mx-auto mt-3 h-px w-16 bg-gradient-to-r from-transparent via-[#9B7BC7]/40 to-transparent" />
      </FadeIn>
      <FadeInStagger faster className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8">
        {stats.map((stat) => (
          <FadeIn key={stat.label}>
            <div className="group relative flex flex-col items-center rounded-3xl px-8 py-10 text-center transition hover:shadow-lg hover:shadow-[#9B7BC7]/5">
              {/* Watercolor accent blob behind the card */}
              <div
                className="absolute inset-0 -z-10 rounded-3xl opacity-60 transition group-hover:opacity-100"
                style={{
                  background: `
                    radial-gradient(ellipse 80% 70% at 50% 40%, ${stat.accentColor}15, transparent),
                    radial-gradient(ellipse 60% 50% at 30% 70%, ${stat.accentColor}10, transparent)
                  `,
                }}
              />
              {/* Subtle ring */}
              <div className="absolute inset-0 rounded-3xl ring-1 ring-[#9B7BC7]/8" />
              {/* Icon with watercolor circle accent */}
              <div className="relative">
                <div
                  className="absolute -inset-3 rounded-full opacity-30"
                  style={{
                    background: `radial-gradient(circle, ${stat.accentColor}40, transparent 70%)`,
                  }}
                />
                <stat.icon
                  className="relative h-8 w-8"
                  style={{ color: stat.accentColor }}
                />
              </div>
              {/* Value */}
              <dd className="mt-6 font-display text-4xl font-semibold text-[#2D2B3D] sm:text-5xl">
                {stat.value}
              </dd>
              {/* Label */}
              <dt className="mt-2 text-sm text-[#6B687D]">{stat.label}</dt>
              {/* Gradient underline accent */}
              <div
                className="mt-4 h-0.5 w-12 rounded-full opacity-40 transition group-hover:w-16 group-hover:opacity-70"
                style={{
                  background: `linear-gradient(90deg, transparent, ${stat.accentColor}, transparent)`,
                }}
              />
            </div>
          </FadeIn>
        ))}
      </FadeInStagger>
    </Container>
  )
}

export const metadata: Metadata = {
  description:
    'Get free reverse coloring pages delivered to your inbox every week. Beautiful watercolor backgrounds — you add the lines.',
}

function CustomGeneratorPromo() {
  return (
    <Container className="mt-24 sm:mt-32 lg:mt-40">
      <FadeIn>
        <div className="relative overflow-hidden rounded-4xl">
          {/* Background gradient */}
          <div
            className="absolute inset-0 -z-10"
            style={{
              background:
                'linear-gradient(135deg, #F8F6FF 0%, #E8E0F8 40%, #D4EEF1 100%)',
            }}
          />
          <div className="px-8 py-16 sm:px-16 sm:py-20 lg:flex lg:items-center lg:gap-x-16">
            <div className="lg:max-w-lg">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#9B7BC7]/10 px-4 py-1.5 text-sm font-semibold text-[#6B46C1]">
                <SparklesIcon className="h-4 w-4" />
                New Tool
              </span>
              <h2 className="mt-6 font-display text-3xl font-medium tracking-tight text-[#2D2B3D] sm:text-4xl">
                Create your own reverse coloring page
              </h2>
              <p className="mt-4 text-lg text-[#6B687D]">
                Describe any theme — ocean sunsets, enchanted forests, mountain
                lakes — and our AI will paint a unique watercolor background
                just for you. 2 free per month.
              </p>
              <div className="mt-8">
                <Link
                  href="/create"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#F4845F] px-8 py-4 font-display text-sm font-semibold text-white shadow-sm transition hover:bg-[#e5734e]"
                >
                  Try the Generator
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </div>
            <div className="mt-10 lg:mt-0 lg:flex-1">
              {/* Visual preview: stacked watercolor cards */}
              <div className="relative mx-auto max-w-sm">
                <div className="absolute top-4 right-4 left-4 h-64 rotate-3 rounded-2xl bg-gradient-to-br from-[#6AACB8]/30 to-[#9B7BC7]/20 shadow-sm" />
                <div className="absolute top-2 right-2 left-2 h-64 -rotate-2 rounded-2xl bg-gradient-to-br from-[#E8889B]/30 to-[#6AACB8]/20 shadow-sm" />
                <div className="relative h-64 rounded-2xl bg-gradient-to-br from-[#9B7BC7]/40 via-[#6AACB8]/30 to-[#E8889B]/20 p-8 shadow-lg ring-1 ring-white/50">
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <SparklesIcon className="h-10 w-10 text-[#6B46C1]/60" />
                    <p className="mt-4 font-display text-lg font-semibold text-[#4A3F6B]/80">
                      Your Theme Here
                    </p>
                    <p className="mt-1 text-sm text-[#6B687D]/70">
                      AI-generated watercolor
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </FadeIn>
    </Container>
  )
}

export default async function Home() {
  return (
    <RootLayout>
      <HeroSection />

      <Stats />

      <HowItWorks />

      <FeaturedDesigns />

      <CustomGeneratorPromo />

      <BlogPreview />

      <CtaBanner />

      <FAQ />
    </RootLayout>
  )
}
