import { type Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import { Container } from '@/components/Container'
import { FadeIn, FadeInStagger } from '@/components/FadeIn'
import { PageIntro } from '@/components/PageIntro'
import { RootLayout } from '@/components/RootLayout'
import { Border } from '@/components/Border'
import { GalleryFilter } from '@/components/GalleryFilter'

import designs from '@/data/designs.json'

export const metadata: Metadata = {
  title: 'Gallery',
  description:
    'Browse our collection of reverse coloring pages. Beautiful watercolor backgrounds ready for your creative outlines.',
}

// Extract unique themes for filter
const themes = Array.from(new Set(designs.map((d) => d.theme)))

export default function GalleryPage() {
  return (
    <RootLayout>
      <PageIntro eyebrow="Gallery" title="Browse our reverse coloring designs">
        <p>
          Each design is a unique watercolor background, crafted to
          inspire your creativity. Pick one, print it, and add your own outlines
          to create something beautiful.
        </p>
      </PageIntro>

      <Container className="mt-16 sm:mt-20">
        <GalleryFilter themes={themes} designs={designs} />
      </Container>
    </RootLayout>
  )
}
