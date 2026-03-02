import { type Metadata } from 'next'

import { Container } from '@/components/Container'
import { FadeIn } from '@/components/FadeIn'
import { RootLayout } from '@/components/RootLayout'

export const metadata: Metadata = {
  title: 'Terms of Service — FreeReverseColoring.com',
  description:
    'Terms of Service for FreeReverseColoring.com, a service provided by Modi Labs LLC.',
}

export default function TermsOfServicePage() {
  return (
    <RootLayout>
      <Container className="mt-24 sm:mt-32 lg:mt-40">
        <FadeIn>
          <h1 className="font-display text-4xl font-medium tracking-tight text-[#2D2B3D] sm:text-5xl">
            Terms of Service
          </h1>
          <div className="mt-10 max-w-3xl space-y-8 text-base text-[#6B687D]">
            <section>
              <h2 className="font-display text-xl font-semibold text-[#2D2B3D]">
                Introduction
              </h2>
              <p className="mt-3">
                Welcome to FreeReverseColoring.com, a service provided by Modi
                Labs LLC (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or
                &ldquo;our&rdquo;). By accessing our website and using our
                services, you agree to be bound by these Terms of Service and our
                Privacy Policy. These terms apply to all visitors, users, and
                others who wish to access or use our service.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-[#2D2B3D]">
                Use of Service
              </h2>
              <p className="mt-3">
                This website provides downloadable reverse coloring pages and
                related content for personal, non-commercial use. The content,
                including text, graphics, and images, is for informational
                purposes only and is subject to change without notice.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-[#2D2B3D]">
                Email Registration
              </h2>
              <p className="mt-3">
                To access some features of the website, you may be asked to
                register your email. You agree to provide accurate, complete, and
                current information during the registration process.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-[#2D2B3D]">
                Intellectual Property Rights
              </h2>
              <p className="mt-3">
                All content on FreeReverseColoring.com, including but not limited
                to text, graphics, logos, images, and compilation thereof, is the
                property of Modi Labs LLC or its licensors and protected by
                United States and international copyright and intellectual
                property laws.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-[#2D2B3D]">
                Limitation of Liability
              </h2>
              <p className="mt-3">
                Modi Labs LLC, nor its directors, employees, partners, agents,
                suppliers, or affiliates, will be liable for any indirect,
                incidental, special, consequential, or punitive damages,
                including without limitation, loss of profits, data, use,
                goodwill, or other intangible losses, resulting from your access
                to or use of or inability to access or use the service.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-[#2D2B3D]">
                Governing Law
              </h2>
              <p className="mt-3">
                These Terms shall be governed and construed in accordance with
                the laws of the United States and the State of New Jersey,
                without regard to its conflict of law provisions.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-[#2D2B3D]">
                Changes to Terms
              </h2>
              <p className="mt-3">
                Modi Labs LLC reserves the right, at our sole discretion, to
                modify or replace these Terms at any time. By continuing to
                access or use our service after any revisions become effective,
                you agree to be bound by the revised terms.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-[#2D2B3D]">
                Contact Us
              </h2>
              <p className="mt-3">
                If you have any questions about these Terms, please contact us at{' '}
                <a
                  href="mailto:hello@freereversecoloring.com"
                  className="font-semibold text-[#9B7BC7] hover:text-[#4A3F6B]"
                >
                  hello@freereversecoloring.com
                </a>
                .
              </p>
            </section>
          </div>
        </FadeIn>
      </Container>
    </RootLayout>
  )
}
