import clsx from 'clsx'

export function VideoEmbed({
  src,
  title = 'Video',
  aspectRatio = '16/9',
  className,
}: {
  src: string
  title?: string
  aspectRatio?: string
  className?: string
}) {
  // Convert YouTube watch URLs to embed URLs
  let embedSrc = src
  if (src.includes('youtube.com/watch')) {
    const url = new URL(src)
    const videoId = url.searchParams.get('v')
    if (videoId) {
      embedSrc = `https://www.youtube-nocookie.com/embed/${videoId}`
    }
  } else if (src.includes('youtu.be/')) {
    const videoId = src.split('youtu.be/')[1]?.split('?')[0]
    if (videoId) {
      embedSrc = `https://www.youtube-nocookie.com/embed/${videoId}`
    }
  }

  return (
    <div
      className={clsx(
        'my-12 max-w-none! overflow-hidden rounded-3xl bg-neutral-100',
        className,
      )}
    >
      <div style={{ aspectRatio }} className="relative w-full">
        <iframe
          src={embedSrc}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
        />
      </div>
    </div>
  )
}
