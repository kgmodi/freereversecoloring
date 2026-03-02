import { type Metadata } from 'next'
import Script from 'next/script'

import '@/styles/tailwind.css'

export const metadata: Metadata = {
  title: {
    template: '%s - FreeReverseColoring',
    default:
      'Free Reverse Coloring Pages | Weekly Watercolor Designs',
  },
  description:
    'Get free reverse coloring pages delivered to your inbox every week. Beautiful watercolor backgrounds — you print, grab a pen, and draw your own outlines.',
  keywords:
    'free reverse coloring pages, coloring book, reverse coloring book, creative prompts, weekly designs, artistic challenge, coloring for adults, drawing, art therapy, watercolor backgrounds, coloring pages',
  authors: [{ name: 'FreeReverseColoring.com' }],
  metadataBase: new URL('https://www.freereversecoloring.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: 'https://www.freereversecoloring.com/',
    title: 'Free Reverse Coloring Pages | Weekly Watercolor Designs',
    description:
      'Join FreeReverseColoring.com for unique artistic challenges. Sign up and get exclusive access to weekly reverse coloring page designs!',
    siteName: 'FreeReverseColoring',
    images: [
      {
        url: '/designs/whispers-of-the-deep.webp',
        width: 1024,
        height: 1024,
        alt: 'Free Reverse Coloring Pages — beautiful watercolor backgrounds for creative outlines',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free Reverse Coloring Pages | Weekly Creative Designs',
    description:
      'Join FreeReverseColoring.com for unique artistic challenges. Download and transform vibrant backdrops into masterpieces!',
    images: ['/designs/whispers-of-the-deep.webp'],
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full bg-[#2D2B3D] text-base antialiased">
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-ERGD1FQ73M"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-ERGD1FQ73M');
          `}
        </Script>
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
