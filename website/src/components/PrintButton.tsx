'use client'

export function PrintButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-neutral-950 ring-1 ring-neutral-300 transition hover:bg-neutral-50 hover:ring-neutral-400"
    >
      {children}
    </button>
  )
}
