'use client'

export function PrintButton({
  imageSrc,
  title,
  children,
}: {
  imageSrc: string
  title: string
  children: React.ReactNode
}) {
  function handlePrint() {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print — ${title}</title>
          <style>
            * { margin: 0; padding: 0; }
            body {
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
            }
            img {
              max-width: 100%;
              max-height: 100vh;
              object-fit: contain;
            }
            @media print {
              @page { margin: 0; }
              body { display: flex; justify-content: center; align-items: center; min-height: 100vh; }
              img { max-width: 100%; max-height: 100vh; }
            }
          </style>
        </head>
        <body>
          <img src="${imageSrc}" alt="${title}" onload="window.print(); window.close();" />
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  return (
    <button
      onClick={handlePrint}
      className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#4A3F6B] ring-1 ring-[#9B7BC7]/20 transition hover:bg-[#F8F6FF] hover:ring-[#9B7BC7]/40"
    >
      {children}
    </button>
  )
}
