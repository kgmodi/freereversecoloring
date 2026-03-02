import { type Metadata } from 'next'
import Link from 'next/link'

import { Container } from '@/components/Container'
import { FadeIn, FadeInStagger } from '@/components/FadeIn'
import { SectionIntro } from '@/components/SectionIntro'
import { SignupForm } from '@/components/SignupForm'
import { Border } from '@/components/Border'
import { RootLayout } from '@/components/RootLayout'

function HeroSection() {
  return (
    <Container className="mt-24 sm:mt-32 md:mt-56">
      <FadeIn className="max-w-3xl">
        <h1 className="font-display text-5xl font-medium tracking-tight text-balance text-neutral-950 sm:text-7xl">
          Beautiful Watercolor Backgrounds. Your Lines. Your Art.
        </h1>
        <p className="mt-6 text-xl text-neutral-600">
          Get free AI-generated reverse coloring pages delivered to your inbox
          every week. Print, draw your outlines, and create something beautiful.
        </p>
        <div className="mt-10">
          <SignupForm />
        </div>
      </FadeIn>
    </Container>
  )
}

const steps = [
  {
    number: '01',
    title: 'Subscribe',
    description:
      'Enter your email to get free weekly reverse coloring pages. No credit card, no catch — just beautiful art in your inbox every Wednesday.',
    icon: EnvelopeIcon,
  },
  {
    number: '02',
    title: 'Print',
    description:
      'Download and print the AI-generated watercolor backgrounds. Each design is unique and crafted to inspire creativity on any paper type.',
    icon: PrinterIcon,
  },
  {
    number: '03',
    title: 'Draw',
    description:
      'Add your own outlines and bring the art to life. Use pen, pencil, marker, or any medium you love. The background is your canvas.',
    icon: PencilIcon,
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
      <SectionIntro
        eyebrow="How It Works"
        title="Three simple steps to your own reverse coloring masterpiece."
        className="mt-24 sm:mt-32 lg:mt-40"
      >
        <p>
          We handle the AI-generated backgrounds. You bring the creativity.
          Every week, a new design lands in your inbox — ready for your lines.
        </p>
      </SectionIntro>
      <Container className="mt-16">
        <FadeInStagger className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {steps.map((step) => (
            <FadeIn key={step.number} className="flex">
              <article className="relative flex w-full flex-col rounded-3xl p-8 ring-1 ring-neutral-950/5 transition hover:bg-neutral-50">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-950">
                    <step.icon className="h-6 w-6 text-white" />
                  </div>
                  <span className="font-display text-sm font-semibold text-neutral-950">
                    Step {step.number}
                  </span>
                </div>
                <h3 className="mt-6 font-display text-2xl font-semibold text-neutral-950">
                  {step.title}
                </h3>
                <p className="mt-4 text-base text-neutral-600">
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

const featuredDesigns = [
  {
    title: 'Ocean Sunset',
    theme: 'Nature',
    gradient: 'from-orange-300 via-rose-400 to-purple-500',
    description:
      'Warm golden hues blending into deep violet — perfect for drawing a seaside scene.',
  },
  {
    title: 'Forest Morning',
    theme: 'Landscape',
    gradient: 'from-emerald-300 via-teal-400 to-cyan-500',
    description:
      'Lush greens and cool blues evoking a misty morning deep in the woods.',
  },
  {
    title: 'Spring Garden',
    theme: 'Floral',
    gradient: 'from-pink-300 via-fuchsia-400 to-violet-500',
    description:
      'Soft pinks and vibrant purples — an ideal canvas for flowers and butterflies.',
  },
]

function FeaturedDesigns() {
  return (
    <>
      <SectionIntro
        eyebrow="This Week's Designs"
        title="Every week, a new canvas awaits."
        className="mt-24 sm:mt-32 lg:mt-40"
      >
        <p>
          AI-generated watercolor backgrounds, crafted to inspire. Each design
          is unique — delivered free to your inbox every week.
        </p>
      </SectionIntro>
      <Container className="mt-16">
        <FadeInStagger className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {featuredDesigns.map((design) => (
            <FadeIn key={design.title} className="flex">
              <article className="relative flex w-full flex-col overflow-hidden rounded-3xl ring-1 ring-neutral-950/5 transition hover:ring-neutral-950/10">
                <div
                  className={`h-64 w-full bg-gradient-to-br ${design.gradient}`}
                  role="img"
                  aria-label={`${design.title} watercolor background preview`}
                />
                <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">
                      {design.theme}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-xl font-semibold text-neutral-950">
                    {design.title}
                  </h3>
                  <p className="mt-2 text-sm text-neutral-600">
                    {design.description}
                  </p>
                </div>
              </article>
            </FadeIn>
          ))}
        </FadeInStagger>
        <FadeIn className="mt-10 flex justify-center">
          <Link
            href="/work"
            className="inline-flex items-center gap-2 font-display text-sm font-semibold text-neutral-950 transition hover:text-neutral-700"
          >
            View Gallery
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
      <FadeIn className="-mx-6 rounded-4xl bg-neutral-950 px-6 py-20 sm:mx-0 sm:py-32 md:px-12">
        <div className="mx-auto max-w-4xl">
          <div className="max-w-xl">
            <h2 className="font-display text-3xl font-medium text-balance text-white sm:text-4xl">
              Start creating today — completely free.
            </h2>
            <p className="mt-4 text-lg text-neutral-300">
              Join thousands of artists, educators, and coloring enthusiasts who
              look forward to a new design every Wednesday.
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
      'Traditional coloring pages give you black outlines to fill in with color. Reverse coloring flips the concept: you receive a pre-colored watercolor background and draw your own outlines on top. It is a creative, relaxing activity that produces stunning artwork — even if you do not consider yourself an artist.',
  },
  {
    question: 'How often do I get new designs?',
    answer:
      'Every Wednesday, a brand-new AI-generated watercolor background is delivered straight to your inbox. Each design is unique and crafted with GPT-4o and gpt-image-1 to ensure vibrant, print-ready quality.',
  },
  {
    question: 'Is it really free?',
    answer:
      'Yes, completely free — forever. There is no premium tier, no paywall, and no credit card required. We believe everyone should have access to creative tools that spark joy. Sign up and start creating right away.',
  },
  {
    question: 'How do I print the designs?',
    answer:
      'Each design is delivered as a high-resolution image optimized for standard letter paper (8.5" x 11"). Simply download the image from the email, open it on your computer, and print it on any home or office printer. For best results, use thicker paper or cardstock — it handles the watercolor look beautifully and provides a better surface for drawing.',
  },
  {
    question: 'What should I use to draw on the prints?',
    answer:
      'Anything you like! Fine-tip markers, gel pens, and felt-tip pens work especially well on printed pages. Pencils and colored pencils are also great choices. The beauty of reverse coloring is that there are no rules — experiment with different tools to discover your style.',
  },
  {
    question: 'Can I share my finished artwork?',
    answer:
      'Absolutely! We encourage you to share your creations. A community gallery feature is coming soon where you can upload your finished pieces and see how others interpreted the same background. In the meantime, share on social media and tag us.',
  },
]

function FAQ() {
  return (
    <>
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
                  <dt className="font-display text-lg font-semibold text-neutral-950">
                    {faq.question}
                  </dt>
                  <dd className="mt-4 text-base text-neutral-600">
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

function Stats() {
  return (
    <div className="mt-24 rounded-4xl bg-neutral-950 py-20 sm:mt-32 sm:py-32 lg:mt-56">
      <Container>
        <FadeIn className="flex items-center gap-x-8">
          <h2 className="text-center font-display text-sm font-semibold tracking-wider text-white sm:text-left">
            Trusted by artists, educators, and coloring enthusiasts
          </h2>
          <div className="h-px flex-auto bg-neutral-800" />
        </FadeIn>
        <FadeInStagger faster>
          <dl className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {[
              { value: '100%', label: 'Free forever' },
              { value: 'Weekly', label: 'New designs every Wednesday' },
              { value: 'AI-Powered', label: 'Unique watercolor art' },
            ].map((stat) => (
              <FadeIn key={stat.label}>
                <div className="flex flex-col items-center gap-2 text-center">
                  <dd className="font-display text-4xl font-semibold text-white sm:text-5xl">
                    {stat.value}
                  </dd>
                  <dt className="text-sm text-neutral-400">{stat.label}</dt>
                </div>
              </FadeIn>
            ))}
          </dl>
        </FadeInStagger>
      </Container>
    </div>
  )
}

export const metadata: Metadata = {
  description:
    'Get free AI-generated reverse coloring pages delivered to your inbox every week. Beautiful watercolor backgrounds — you add the lines.',
}

export default function Home() {
  return (
    <RootLayout>
      <HeroSection />

      <Stats />

      <HowItWorks />

      <FeaturedDesigns />

      <CtaBanner />

      <FAQ />
    </RootLayout>
  )
}
