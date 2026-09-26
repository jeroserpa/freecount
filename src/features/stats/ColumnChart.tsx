import { useLayoutEffect, useRef, useState } from 'react'
import { niceTicks } from '../../domain/analytics'

export interface Column {
  key: string
  /** Short axis label ("Sep"). */
  label: string
  /** Long label for the tooltip ("September 2026"). */
  title: string
  value: number
}

const AXIS_W = 44
const AXIS_H = 20
const TOP = 22 // room for the selected column's direct label

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/**
 * Single-series column chart. The selected column is emphasised (accent + direct label); the others are context.
 * Each column is a focusable, tappable target with a tooltip. Negative values are drawn at 0 (the tooltip shows
 * the real value).
 */
export function ColumnChart({
  columns,
  selectedKey,
  onSelect,
  format,
  formatTick = format,
  height = 170,
  ariaLabel,
}: {
  columns: Column[]
  selectedKey?: string
  onSelect?: (key: string) => void
  format: (v: number) => string
  formatTick?: (v: number) => string
  height?: number
  ariaLabel: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<string | null>(null)

  const max = Math.max(0, ...columns.map((c) => c.value))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1] || 1
  const plotW = Math.max(0, width - AXIS_W)
  const plotH = height - AXIS_H - TOP
  const band = columns.length ? plotW / columns.length : 0
  const barW = Math.max(4, Math.min(24, band * 0.6))
  const y = (v: number) => TOP + plotH - (Math.max(0, v) / top) * plotH
  const hovered = columns.find((c) => c.key === hover)
  const hoveredIndex = hovered ? columns.indexOf(hovered) : -1

  return (
    <div ref={ref} className="relative select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="group" aria-label={ariaLabel} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={AXIS_W}
                x2={width}
                y1={y(t) + 0.5}
                y2={y(t) + 0.5}
                stroke={t === 0 ? 'var(--chart-baseline)' : 'var(--chart-grid)'}
                strokeWidth={1}
              />
              <text
                x={AXIS_W - 6}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                fontSize={11}
                fill="var(--chart-ink-muted)"
                className="tabular-nums"
              >
                {formatTick(t)}
              </text>
            </g>
          ))}
          {columns.map((c, i) => {
            const cx = AXIS_W + band * i + band / 2
            const x = cx - barW / 2
            const yTop = y(c.value)
            const h = TOP + plotH - yTop
            const r = Math.min(4, h, barW / 2)
            const selected = c.key === selectedKey
            const active = selected || c.key === hover
            // 4px rounded data-end, square at the baseline.
            const path =
              h <= 0
                ? ''
                : `M${x},${TOP + plotH} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${TOP + plotH} Z`
            const showLabel = columns.length <= 12 || i % Math.ceil(columns.length / 12) === 0
            return (
              <g key={c.key}>
                {path && (
                  <path
                    d={path}
                    fill={selected ? 'var(--chart-accent)' : 'var(--chart-context)'}
                    opacity={active || !hover ? 1 : 0.75}
                  />
                )}
                {showLabel && (
                  <text
                    x={cx}
                    y={height - 4}
                    textAnchor="middle"
                    fontSize={11}
                    fill="var(--chart-ink-muted)"
                    fontWeight={selected ? 600 : 400}
                  >
                    {c.label}
                  </text>
                )}
                {selected && (
                  <text x={cx} y={yTop - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="currentColor">
                    {format(c.value)}
                  </text>
                )}
                {/* Hit target: the whole band, bigger than the mark. */}
                <rect
                  x={AXIS_W + band * i}
                  y={0}
                  width={band}
                  height={height}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${c.title}: ${format(c.value)}`}
                  aria-pressed={selected}
                  className="cursor-pointer outline-none focus-visible:stroke-[var(--chart-accent)]"
                  onPointerEnter={() => setHover(c.key)}
                  onPointerLeave={() => setHover((h) => (h === c.key ? null : h))}
                  onFocus={() => setHover(c.key)}
                  onBlur={() => setHover((h) => (h === c.key ? null : h))}
                  onClick={() => onSelect?.(c.key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelect?.(c.key)
                    }
                  }}
                />
              </g>
            )
          })}
        </svg>
      )}
      {hovered && hoveredIndex >= 0 && (
        <div
          className="pointer-events-none absolute z-10 -transtone-x-1/2 whitespace-nowrap rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs text-white shadow-lg dark:bg-stone-100 dark:text-stone-900"
          style={{
            left: Math.min(Math.max(AXIS_W + band * hoveredIndex + band / 2, 60), width - 60),
            top: 0,
          }}
        >
          <span className="block text-sm font-semibold tabular-nums">{format(hovered.value)}</span>
          <span className="opacity-75">{hovered.title}</span>
        </div>
      )}
    </div>
  )
}
