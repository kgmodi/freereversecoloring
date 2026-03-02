import { type Metadata } from 'next'

import { Container } from '@/components/Container'
import { FadeIn } from '@/components/FadeIn'
import { RootLayout } from '@/components/RootLayout'

export const metadata: Metadata = {
  title: 'Privacy Policy — FreeReverseColoring.com',
  description:
    'How FreeReverseColoring.com handles your personal information, cookies, and data.',
}

export default function PrivacyPage() {
  return (
    <RootLayout>
      <Container className="mt-24 sm:mt-32 lg:mt-40">
        <FadeIn>
          <h1 className="font-display text-4xl font-medium tracking-tight text-[#2D2B3D] sm:text-5xl">
            Privacy Policy
          </h1>
          <div className="mt-10 max-w-3xl space-y-8 text-base text-[#6B687D]">
            <section>
              <h2 className="font-display text-xl font-semibold text-[#2D2B3D]">
                Introduction
              </h2>
              <p className="mt-3">
                At FreeReverseColoring.com, we are committed to protecting your
                privacy. This policy outlines how we handle your personal
                information.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-[#2D2B3D]">
                Information Collected
              </h2>
              <p className="mt-3">
                We may collect personal information when you register, subscribe,
                or use our services. This information may include your name,
                email, and other contact details.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-[#2D2B3D]">
                Use of Information
              </h2>
              <p className="mt-3">
                The information we collect is used to provide our services to
                you, to improve our website, and to communicate with you
                regarding our services or offers.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-[#2D2B3D]">
                Use of Google Analytics
              </h2>
              <p className="mt-3">
                We use Google Analytics to help us understand how our customers
                use the site. The data collected includes site traffic and usage
                patterns. This information helps us to improve our service and
                enhance user experience.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-[#2D2B3D]">
                Security
              </h2>
              <p className="mt-3">
                We are committed to ensuring that your information is secure. We
                have put in place suitable physical, electronic, and managerial
                procedures to safeguard the information we collect online.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-[#2D2B3D]">
                Cookies
              </h2>
              <p className="mt-3">
                Our website may use &ldquo;cookies&rdquo; to enhance your
                experience. Most web browsers automatically accept cookies, but
                you can usually modify your browser setting to decline cookies if
                you prefer.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-[#2D2B3D]">
                Sharing of Information
              </h2>
              <p className="mt-3">
                We do not sell, distribute, or lease your personal information to
                third parties unless we have your permission or are required by
                law to do so.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-[#2D2B3D]">
                Your Consent
              </h2>
              <p className="mt-3">
                By using our website, you consent to the collection and use of
                your personal information as described in this Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-[#2D2B3D]">
                Changes to Privacy Policy
              </h2>
              <p className="mt-3">
                We reserve the right to modify this Privacy Policy at any time,
                so please review it frequently. Changes and clarifications will
                take effect immediately upon their posting on the website.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold text-[#2D2B3D]">
                Contact Us
              </h2>
              <p className="mt-3">
                If you have any questions about this Privacy Policy or your
                personal information, please contact us at{' '}
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
