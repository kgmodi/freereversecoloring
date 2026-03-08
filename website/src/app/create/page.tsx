import { type Metadata } from 'next'
import Link from 'next/link'

import { Container } from '@/components/Container'
import { FadeIn, FadeInStagger } from '@/components/FadeIn'
import { GeneratorForm } from '@/components/GeneratorForm'
import { PageIntro } from '@/components/PageIntro'
import { RootLayout } from '@/components/RootLayout'
import { Border } from '@/components/Border'

const features = [
  {
    icon: SparkleIcon,
    title: 'AI-Powered',
    description:
      'Powered by GPT-4o and gpt-image-1 to create unique watercolor backgrounds from your imagination.',
    color: '#6AACB8',
  },
  {
    icon: PrintIcon,
    title: 'Print Ready',
    description:
      'Every generated page is sized at 1024x1536 pixels — perfect for printing on standard letter paper.',
    color: '#9B7BC7',
  },
  {
    icon: PaletteIcon,
    title: 'Unique Every Time',
    description:
      'No two generations are the same. Each design includes a unique color palette and drawing prompts.',
    color: '#E8889B',
  },
]

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

function PrintIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
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

function PaletteIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
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
        d="M4.098 19.902a3.75 3.75 0 0 0 5.304 0l6.401-6.402M6.75 21A3.75 3.75 0 0 1 3 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 0 0 3.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008Z"
      />
    </svg>
  )
}

const howItWorksSteps = [
  {
    number: '1',
    title: 'Describe your theme',
    description:
      'Tell us what you want — "ocean sunset," "enchanted forest," or any scene you can imagine.',
  },
  {
    number: '2',
    title: 'AI creates your watercolor',
    description:
      'Our AI generates a unique watercolor background with soft, dreamy washes of color tailored to your theme.',
  },
  {
    number: '3',
    title: 'Download and draw',
    description:
      'Download your custom page, print it, and add your own outlines and details. Your imagination, our canvas.',
  },
]

const faq = [
  {
    question: 'How many pages can I create for free?',
    answer:
      'You get 2 free custom generations per month. Your limit resets on the 1st of each month. Our weekly designs in the gallery are always free and unlimited!',
  },
  {
    question: 'How long does generation take?',
    answer:
      'Typically 30-60 seconds. Our AI first designs the concept, then paints the watercolor image. The result is a high-resolution page ready for printing.',
  },
  {
    question: 'What makes a good theme description?',
    answer:
      'Be descriptive! Instead of just "ocean," try "calm ocean at sunset with gentle waves reflecting warm golden and pink tones." The more detail you provide, the more personalized your page will be.',
  },
  {
    question: 'Can I print the generated pages?',
    answer:
      'Yes! Every page is generated at 1024x1536 pixels, optimized for 8.5x11 letter paper. For best results, use a color inkjet printer on matte or cardstock paper.',
  },
  {
    question: 'Why do I need to enter my email?',
    answer:
      'Your email is used only to track your free monthly generations. We won\'t send you anything unless you separately subscribe to our weekly newsletter.',
  },
]

export const metadata: Metadata = {
  title: 'Custom Reverse Coloring Page Generator - FreeReverseColoring',
  description:
    'Create your own custom reverse coloring page with AI. Describe any theme and get a unique watercolor background to draw on. Free — 2 per month.',
  openGraph: {
    title: 'Custom Reverse Coloring Page Generator',
    description:
      'Create your own AI-generated watercolor reverse coloring page. Describe any theme and get a unique design in seconds.',
    url: 'https://freereversecoloring.com/create',
  },
}

export default function CreatePage() {
  return (
    <RootLayout>
      <PageIntro
        eyebrow="Custom Generator"
        title="Create your own reverse coloring page."
      >
        <p>
          Describe any theme or scene, and our AI will paint a unique watercolor
          background just for you. Print it, grab a pen, and bring it to life
          with your own lines.
        </p>
      </PageIntro>

      {/* Generator section */}
      <Container className="mt-16">
        <div className="lg:flex lg:gap-x-16">
          {/* Left: Form */}
          <FadeIn className="lg:w-1/2">
            <div className="rounded-3xl bg-white p-8 shadow-lg shadow-[#9B7BC7]/5 ring-1 ring-[#9B7BC7]/10">
              <GeneratorForm />
            </div>
          </FadeIn>

          {/* Right: Features */}
          <FadeIn className="mt-12 lg:mt-0 lg:w-1/2">
            <FadeInStagger className="space-y-6">
              {features.map((feature) => (
                <FadeIn
                  key={feature.title}
                  className="flex gap-5 rounded-2xl p-6 ring-1 ring-[#9B7BC7]/10 transition hover:bg-[#F8F6FF] hover:shadow-md hover:shadow-[#9B7BC7]/5"
                >
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${feature.color}15` }}
                  >
                    <feature.icon
                      className="h-6 w-6"
                      style={{ color: feature.color }}
                    />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold text-[#2D2B3D]">
                      {feature.title}
                    </h3>
                    <p className="mt-1 text-sm text-[#6B687D]">
                      {feature.description}
                    </p>
                  </div>
                </FadeIn>
              ))}
            </FadeInStagger>

            {/* Browse gallery CTA */}
            <div className="mt-8 rounded-2xl bg-gradient-to-r from-[#6AACB8]/10 to-[#9B7BC7]/10 p-6">
              <p className="text-sm text-[#4A3F6B]">
                <span className="font-semibold">Want more designs?</span> We
                publish 3 new watercolor backgrounds every Wednesday — free and
                unlimited.
              </p>
              <Link
                href="/gallery"
                className="mt-3 inline-flex items-center gap-2 font-display text-sm font-semibold text-[#9B7BC7] hover:text-[#6B46C1]"
              >
                Browse the gallery
                <span aria-hidden="true">&rarr;</span>
              </Link>
            </div>
          </FadeIn>
        </div>
      </Container>

      {/* How it works */}
      <Container className="mt-24 sm:mt-32">
        <FadeIn>
          <h2 className="font-display text-3xl font-medium tracking-tight text-[#2D2B3D] sm:text-4xl">
            How it works
          </h2>
        </FadeIn>
        <FadeInStagger className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {howItWorksSteps.map((step) => (
            <FadeIn key={step.number}>
              <div className="relative rounded-3xl p-8 ring-1 ring-[#9B7BC7]/10 transition hover:bg-[#F8F6FF]">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#6AACB8] to-[#9B7BC7] font-display text-lg font-semibold text-white">
                  {step.number}
                </span>
                <h3 className="mt-6 font-display text-xl font-semibold text-[#2D2B3D]">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm text-[#6B687D]">
                  {step.description}
                </p>
              </div>
            </FadeIn>
          ))}
        </FadeInStagger>
      </Container>

      {/* FAQ */}
      <Container className="mt-24 sm:mt-32">
        <FadeIn>
          <h2 className="font-display text-3xl font-medium tracking-tight text-[#2D2B3D] sm:text-4xl">
            Frequently asked questions
          </h2>
        </FadeIn>
        <FadeInStagger className="mt-10">
          <dl className="space-y-8">
            {faq.map((item) => (
              <FadeIn key={item.question}>
                <Border className="pt-8 first:pt-0 first:before:hidden first:after:hidden">
                  <dt className="font-display text-lg font-semibold text-[#2D2B3D]">
                    {item.question}
                  </dt>
                  <dd className="mt-4 text-base text-[#6B687D]">
                    {item.answer}
                  </dd>
                </Border>
              </FadeIn>
            ))}
          </dl>
        </FadeInStagger>
      </Container>

      {/* Bottom CTA */}
      <Container className="mt-24 mb-24 sm:mt-32 sm:mb-32">
        <FadeIn
          className="-mx-6 rounded-4xl px-6 py-20 sm:mx-0 sm:py-32 md:px-12"
          style={{
            background:
              'linear-gradient(135deg, #4A3F6B 0%, #6AACB8 50%, #9B7BC7 100%)',
          }}
        >
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="font-display text-3xl font-medium text-white sm:text-4xl">
              Get free designs every week
            </h2>
            <p className="mt-4 text-lg text-white/80">
              Love creating? Subscribe to get 3 new reverse coloring pages
              delivered to your inbox every Wednesday — completely free.
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                href="/#signup"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 font-display text-sm font-semibold text-[#4A3F6B] shadow-sm transition hover:bg-neutral-100"
              >
                Subscribe for Free
                <span aria-hidden="true">&rarr;</span>
              </Link>
            </div>
          </div>
        </FadeIn>
      </Container>
    </RootLayout>
  )
}
