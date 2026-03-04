import clsx from 'clsx'

export function PinterestImage({
  src,
  alt,
  title,
  description,
  className,
}: {
  src: string
  alt: string
  title?: string
  description?: string
  className?: string
}) {
  return (
    <div
      className={clsx(
        'group my-12 max-w-none! overflow-hidden rounded-3xl bg-neutral-100',
        className,
      )}
    >
      {/* 2:3 aspect ratio optimized for Pinterest */}
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="aspect-2/3 w-full object-cover"
          data-pin-description={description || alt}
          data-pin-media={src}
        />
        {/* Text overlay at bottom */}
        {title && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-6 pt-16 pb-6">
            <p className="font-display text-lg font-semibold text-white sm:text-xl">
              {title}
            </p>
            {description && (
              <p className="mt-1 text-sm text-white/80">{description}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
