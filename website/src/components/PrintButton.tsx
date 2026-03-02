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
    // Create a full-screen overlay with just the image
    const overlay = document.createElement('div')
    overlay.id = 'print-overlay'
    overlay.innerHTML = `<img src="${imageSrc}" alt="${title}" />`

    // Inject print-only styles
    const style = document.createElement('style')
    style.id = 'print-overlay-style'
    style.textContent = `
      @media print {
        body > *:not(#print-overlay) { display: none !important; }
        #print-overlay {
          display: flex !important;
          justify-content: center;
          align-items: center;
          width: 100vw;
          height: 100vh;
          position: fixed;
          top: 0;
          left: 0;
          background: white;
          z-index: 99999;
        }
        #print-overlay img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }
        @page { margin: 0.5cm; }
      }
      @media screen {
        #print-overlay { display: none !important; }
      }
    `

    document.head.appendChild(style)
    document.body.appendChild(overlay)

    // Small delay to let the image load if not cached
    const img = overlay.querySelector('img')!
    const doPrint = () => {
      window.print()
      // Clean up after print dialog closes
      document.head.removeChild(style)
      document.body.removeChild(overlay)
    }

    if (img.complete) {
      doPrint()
    } else {
      img.onload = doPrint
      img.onerror = doPrint
    }
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
