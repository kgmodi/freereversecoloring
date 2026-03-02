'use client'

export function PrintButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#4A3F6B] ring-1 ring-[#9B7BC7]/20 transition hover:bg-[#F8F6FF] hover:ring-[#9B7BC7]/40"
    >
      {children}
    </button>
  )
}
