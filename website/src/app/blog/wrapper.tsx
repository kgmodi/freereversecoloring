import Image from 'next/image'

import { Container } from '@/components/Container'
import { FadeIn } from '@/components/FadeIn'
import { GrayscaleTransitionImage } from '@/components/GrayscaleTransitionImage'
import { MDXComponents } from '@/components/MDXComponents'
import { PageLinks } from '@/components/PageLinks'
import { RootLayout } from '@/components/RootLayout'
import { SignupForm } from '@/components/SignupForm'
import { formatDate } from '@/lib/formatDate'
import { type Article, type MDXEntry, loadArticles } from '@/lib/mdx'

function NewsletterSection() {
  return (
    <div className="-mx-6 rounded-4xl bg-[#2D2B3D] px-6 py-20 sm:mx-0 sm:py-32 md:px-12">
      <div className="mx-auto max-w-4xl">
        <div className="max-w-xl">
          <h2 className="font-display text-3xl font-medium text-balance text-white sm:text-4xl">
            Get free designs every week
          </h2>
          <p className="mt-4 text-base text-white/60">
            Beautiful watercolor backgrounds delivered to your inbox. Print,
            grab a pen, and draw your own outlines.
          </p>
          <div className="mt-8">
            <SignupForm variant="dark" />
          </div>
        </div>
      </div>
    </div>
  )
}

function DesignPreviewStrip() {
  const previewDesigns = [
    { src: '/designs/whispers-of-bloom.png', alt: 'Watercolor design — Whispers of Bloom' },
    { src: '/designs/cosmic-voyage.png', alt: 'Watercolor design — Cosmic Voyage' },
    { src: '/designs/enchanted-canopy.png', alt: 'Watercolor design — Enchanted Canopy' },
  ]
  return (
    <div className="mb-4">
      <p className="mb-6 text-center text-sm font-medium text-[#6B687D]">
        Designs subscribers received recently
      </p>
      <div className="grid grid-cols-3 gap-3">
        {previewDesigns.map((d, i) => (
          <div key={i} className="overflow-hidden rounded-2xl bg-neutral-100">
            <Image
              src={d.src}
              alt={d.alt}
              width={400}
              height={300}
              className="aspect-4/3 w-full object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export default async function BlogArticleWrapper({
  article,
  children,
}: {
  article: MDXEntry<Article>
  children: React.ReactNode
}) {
  let allArticles = await loadArticles()
  let moreArticles = allArticles
    .filter(({ metadata }) => metadata !== article.metadata)
    .slice(0, 2)

  const BASE_URL = 'https://www.freereversecoloring.com'

  const jsonLdGraph: Record<string, unknown>[] = [
    {
      '@type': 'Article',
      headline: article.title,
      description: article.description,
      datePublished: article.date,
      author: {
        '@type': 'Organization',
        name: article.author.name,
        url: BASE_URL,
      },
      publisher: {
        '@id': `${BASE_URL}/#organization`,
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': `${BASE_URL}${article.href}`,
      },
      ...(article.heroImage
        ? {
            image: {
              '@type': 'ImageObject',
              url: `${BASE_URL}${article.heroImage}`,
            },
          }
        : {}),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL + '/' },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: BASE_URL + '/blog/' },
        { '@type': 'ListItem', position: 3, name: article.title, item: `${BASE_URL}${article.href}` },
      ],
    },
  ]

  if (article.faqs && article.faqs.length > 0) {
    jsonLdGraph.push({
      '@type': 'FAQPage',
      mainEntity: article.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    })
  }

  const jsonLd = { '@context': 'https://schema.org', '@graph': jsonLdGraph }

  return (
    <RootLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero image section */}
      {article.heroImage && (
        <div className="relative overflow-hidden bg-neutral-100">
          <div className="relative mx-auto max-w-7xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={article.heroImage}
              alt={`Watercolor background for ${article.title}`}
              className="h-[360px] w-full object-cover sm:h-[420px] lg:h-[480px]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-white/80 via-white/30 to-transparent" />
          </div>
        </div>
      )}

      <Container as="article" className={article.heroImage ? 'mt-[-80px] relative z-10' : 'mt-24 sm:mt-32 lg:mt-40'}>
        <FadeIn>
          <header className="mx-auto flex max-w-5xl flex-col text-center">
            <h1 className="mt-6 font-display text-5xl font-medium tracking-tight text-balance text-[#2D2B3D] sm:text-6xl">
              {article.title}
            </h1>
            <time
              dateTime={article.date}
              className="order-first text-sm text-[#6B687D]"
            >
              {formatDate(article.date)}
            </time>
            <p className="mt-6 text-sm text-[#6B687D]">
              <span className="font-semibold text-[#2D2B3D]">
                {article.author.name}
              </span>
              {article.author.role && ` · ${article.author.role}`}
            </p>
          </header>
        </FadeIn>

        <FadeIn>
          <MDXComponents.wrapper className="mt-24 sm:mt-32 lg:mt-40">
            {children}
          </MDXComponents.wrapper>
        </FadeIn>
      </Container>

      {moreArticles.length > 0 && (
        <PageLinks
          className="mt-24 sm:mt-32 lg:mt-40"
          title="More articles"
          pages={moreArticles}
        />
      )}

      <Container className="mt-24 sm:mt-32 lg:mt-40">
        <FadeIn>
          <DesignPreviewStrip />
          <NewsletterSection />
        </FadeIn>
      </Container>
    </RootLayout>
  )
}
