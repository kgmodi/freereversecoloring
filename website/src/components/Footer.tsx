import Link from 'next/link'

import { Container } from '@/components/Container'
import { FadeIn } from '@/components/FadeIn'
import { Logo } from '@/components/Logo'
import { SignupForm } from '@/components/SignupForm'

const navigation = [
  {
    title: 'Explore',
    links: [
      { title: 'Gallery', href: '/gallery' },
      { title: 'How It Works', href: '/#how-it-works' },
      { title: 'FAQ', href: '/#faq' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { title: 'Privacy Policy', href: '/privacy' },
      { title: 'Terms of Service', href: '/terms-of-service' },
      {
        title: 'hello@freereversecoloring.com',
        href: 'mailto:hello@freereversecoloring.com',
      },
    ],
  },
]

function Navigation() {
  return (
    <nav>
      <ul role="list" className="grid grid-cols-2 gap-8">
        {navigation.map((section, sectionIndex) => (
          <li key={sectionIndex}>
            <div className="font-display text-sm font-semibold tracking-wider text-[#2D2B3D]">
              {section.title}
            </div>
            <ul role="list" className="mt-4 text-sm text-[#6B687D]">
              {section.links.map((link, linkIndex) => (
                <li key={linkIndex} className="mt-4">
                  <Link
                    href={link.href}
                    className="transition hover:text-[#9B7BC7]"
                  >
                    {link.title}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function Footer() {
  return (
    <Container as="footer" className="mt-24 w-full sm:mt-32 lg:mt-40">
      <FadeIn>
        <div className="grid grid-cols-1 gap-x-8 gap-y-16 lg:grid-cols-2">
          <Navigation />
          <div className="flex lg:justify-end">
            <div className="max-w-sm">
              <h2 className="font-display text-sm font-semibold tracking-wider text-[#2D2B3D]">
                Get free weekly designs
              </h2>
              <p className="mt-4 text-sm text-[#6B687D]">
                Subscribe to receive new AI-generated reverse coloring pages
                every week. Completely free.
              </p>
              <div className="mt-6">
                <SignupForm />
              </div>
            </div>
          </div>
        </div>
        <div className="mt-24 mb-20 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-t border-[#9B7BC7]/10 pt-12">
          <Link href="/" aria-label="Home">
            <Logo />
          </Link>
          <p className="text-sm text-[#6B687D]">
            &copy; 2024-{new Date().getFullYear()} FreeReverseColoring.com. All
            rights reserved.
          </p>
        </div>
      </FadeIn>
    </Container>
  )
}
