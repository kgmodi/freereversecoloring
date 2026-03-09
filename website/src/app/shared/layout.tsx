import { type Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Shared Design — FreeReverseColoring',
  description:
    'View a custom AI-generated reverse coloring page shared by another creator. Download it, draw your own outlines, or create your own unique design.',
  openGraph: {
    title: 'Shared Design — FreeReverseColoring',
    description:
      'Check out this custom AI-generated reverse coloring page! Download it and draw your own outlines, or create your own unique design.',
    url: 'https://www.freereversecoloring.com/shared/',
    siteName: 'FreeReverseColoring',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Shared Design — FreeReverseColoring',
    description:
      'Check out this custom AI-generated reverse coloring page! Download it and draw your own outlines.',
  },
}

export default function SharedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
