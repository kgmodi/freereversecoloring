import { type Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import designs from '@/data/designs'
import { DrawingCanvas } from '@/components/DrawingCanvas'

export function generateStaticParams() {
  return designs.map((d) => ({ slug: d.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const design = designs.find((d) => d.slug === slug)
  if (!design) return {}

  return {
    title: `Draw on ${design.title}`,
    description: `Draw your own outlines on "${design.title}" — a free reverse coloring page. No printing needed, draw directly on your device.`,
    alternates: {
      canonical: `/draw/${design.slug}/`,
    },
    openGraph: {
      title: `Draw on ${design.title} — Free Reverse Coloring`,
      description: `Draw your own outlines on this beautiful watercolor background. No app needed — works on any device.`,
      url: `https://www.freereversecoloring.com/draw/${design.slug}/`,
      images: [
        {
          url: design.imagePath,
          width: design.width,
          height: design.height,
          alt: `${design.title} — reverse coloring page`,
        },
      ],
    },
  }
}

export default async function DrawPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const design = designs.find((d) => d.slug === slug)

  if (!design) {
    notFound()
  }

  return (
    <div className="fixed inset-0 bg-[#1a1825]">
      {/* Back button */}
      <Link
        href={`/gallery/${slug}/`}
        className="fixed top-4 left-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#2D2B3D] shadow-lg ring-1 ring-black/5 backdrop-blur-md transition hover:bg-white"
        aria-label="Back to design"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 12H5m0 0 7 7m-7-7 7-7" />
        </svg>
      </Link>

      {/* Drawing canvas fills viewport */}
      <DrawingCanvas design={design} />
    </div>
  )
}
