import clsx from 'clsx'
import Image from 'next/image'
import Link from 'next/link'

import { Blockquote } from '@/components/Blockquote'
import { Border } from '@/components/Border'
import { GrayscaleTransitionImage } from '@/components/GrayscaleTransitionImage'
import { StatList, StatListItem } from '@/components/StatList'
import { InlineDrawingCanvas } from '@/components/InlineDrawingCanvas'
import { BeforeAfterSlider } from '@/components/BeforeAfterSlider'
import { ComparisonTable } from '@/components/ComparisonTable'
import { VideoEmbed } from '@/components/VideoEmbed'
import { PinterestImage } from '@/components/PinterestImage'
import { TagList, TagListItem } from '@/components/TagList'

export const MDXComponents = {
  Blockquote({
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof Blockquote>) {
    return <Blockquote className={clsx('my-32', className)} {...props} />
  },
  img: function Img({
    className,
    ...props
  }: React.ComponentPropsWithoutRef<'img'>) {
    return (
      <div
        className={clsx(
          'group isolate my-10 overflow-hidden rounded-4xl bg-neutral-100 max-sm:-mx-6',
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          {...props}
          className="aspect-16/10 w-full object-cover"
        />
      </div>
    )
  },
  StatList({
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof StatList>) {
    return (
      <StatList className={clsx('my-32 max-w-none!', className)} {...props} />
    )
  },
  StatListItem,
  table: function Table({
    className,
    ...props
  }: React.ComponentPropsWithoutRef<'table'>) {
    return (
      <div
        className={clsx(
          'my-10 max-sm:-mx-6 max-sm:flex max-sm:overflow-x-auto',
          className,
        )}
      >
        <div className="max-sm:min-w-full max-sm:flex-none max-sm:px-6">
          <table {...props} />
        </div>
      </div>
    )
  },
  TagList({
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof TagList>) {
    return <TagList className={clsx('my-6', className)} {...props} />
  },
  TagListItem,
  QuickAnswer({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) {
    return (
      <div
        className={clsx(
          'my-10 rounded-2xl border-l-4 border-[#9B7BC7] bg-[#F5F0FF] px-8 py-6',
          className,
        )}
      >
        <p className="mb-2 text-xs font-bold tracking-widest text-[#9B7BC7] uppercase">
          Quick Answer
        </p>
        <div className="text-lg/8 font-medium text-[#2D2B3D]">{children}</div>
      </div>
    )
  },
  TopTip({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) {
    return (
      <Border position="left" className={clsx('my-10 pl-8', className)}>
        <p className="font-display text-sm font-bold tracking-widest text-neutral-950 uppercase">
          Top tip
        </p>
        <div className="mt-4">{children}</div>
      </Border>
    )
  },
  Typography({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
    return <div className={clsx('typography', className)} {...props} />
  },
  PullQuote({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) {
    return (
      <figure
        className={clsx(
          'my-16 max-w-xl! text-center',
          className,
        )}
      >
        <blockquote className="font-display text-2xl/10 font-medium tracking-tight text-[#9B7BC7] italic sm:text-3xl/10">
          {children}
        </blockquote>
      </figure>
    )
  },
  InlineCTA({
    heading = 'Get free designs every week',
    description = 'Beautiful watercolor backgrounds delivered to your inbox. Print, grab a pen, and draw.',
    buttonText = 'Subscribe for Free →',
    className,
  }: {
    heading?: string
    description?: string
    buttonText?: string
    className?: string
  }) {
    return (
      <div
        className={clsx(
          'my-14 max-w-none! rounded-3xl bg-[#F8F5FD] px-8 py-10 text-center sm:px-12',
          className,
        )}
      >
        <p className="font-display text-xl font-medium text-[#2D2B3D] sm:text-2xl">
          {heading}
        </p>
        <p className="mt-2 text-sm text-[#6B687D]">{description}</p>
        <Link
          href="/#signup"
          className="mt-5 inline-block rounded-full bg-[#9B7BC7] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#8A6AB5]"
        >
          {buttonText}
        </Link>
      </div>
    )
  },
  DesignSpotlight({
    designs,
    className,
  }: {
    designs: Array<{ src: string; caption?: string }>
    className?: string
  }) {
    return (
      <div
        className={clsx(
          'my-16 max-w-none! -mx-6 sm:mx-0',
          className,
        )}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {designs.map((design, i) => (
            <div key={i} className="group overflow-hidden rounded-3xl bg-neutral-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={design.src}
                alt={design.caption || 'Watercolor design for reverse coloring'}
                className="aspect-4/3 w-full object-cover"
              />
              {design.caption && (
                <p className="px-4 py-3 text-center text-xs text-[#9B7BC7] italic">
                  {design.caption}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  },
  InlineDrawingCanvas,
  BeforeAfterSlider,
  ComparisonTable,
  VideoEmbed,
  PinterestImage,
  wrapper({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
    return (
      <div
        className={clsx(
          '*:mx-auto *:max-w-3xl [&>:first-child]:mt-0! [&>:last-child]:mb-0!',
          className,
        )}
        {...props}
      />
    )
  },
}
