import clsx from 'clsx'

type Row = {
  feature: string
  values: string[]
}

export function ComparisonTable({
  headers,
  rows,
  highlightColumn,
  className,
}: {
  headers: string[]
  rows: Row[]
  highlightColumn?: number
  className?: string
}) {
  return (
    <div
      className={clsx(
        'my-12 max-w-none! -mx-6 overflow-x-auto sm:mx-0',
        className,
      )}
    >
      <table className="w-full min-w-[500px] border-collapse text-sm sm:min-w-0">
        <thead>
          <tr>
            {headers.map((header, i) => (
              <th
                key={i}
                className={clsx(
                  'border-b border-neutral-200 px-4 py-3 text-left font-display text-sm font-semibold',
                  i === 0 ? 'text-neutral-600' : 'text-neutral-950',
                  highlightColumn !== undefined &&
                    i === highlightColumn &&
                    'bg-[#F8F5FD] text-[#9B7BC7]',
                )}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className={clsx(
                ri % 2 === 0 ? 'bg-white' : 'bg-neutral-50',
              )}
            >
              <td className="border-b border-neutral-100 px-4 py-3 font-medium text-neutral-800">
                {row.feature}
              </td>
              {row.values.map((value, vi) => (
                <td
                  key={vi}
                  className={clsx(
                    'border-b border-neutral-100 px-4 py-3 text-neutral-600',
                    highlightColumn !== undefined &&
                      vi + 1 === highlightColumn &&
                      'bg-[#F8F5FD] font-medium text-[#9B7BC7]',
                  )}
                >
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
