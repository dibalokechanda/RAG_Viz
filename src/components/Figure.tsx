import type { Figure } from '../data/types'
import FigureD3Network from './FigureD3Network'
import FigureD3Layered from './FigureD3Layered'

/**
 * Inline monochrome diagrams. Everything is plain SVG on a 0–W viewBox that
 * scales to the panel width; colour comes from CSS variables so the figures
 * stay in step with the theme.
 */

const W = 400
const INK = 'var(--ink)'
const LINE = 'var(--border-strong)'
const MUTE = 'var(--border-heavy)'
const LABEL = 'var(--text-faint)'
const MONO = 'var(--mono)'

function Frame({ h, children }: { h: number; children: React.ReactNode }) {
  return (
    <svg viewBox={`0 0 ${W} ${h}`} width="100%" role="img" className="fig-svg">
      {children}
    </svg>
  )
}

/* ────────────────────────────── bars ────────────────────────────── */

function Bars({ f }: { f: Extract<Figure, { kind: 'bars' }> }) {
  const panels = f.series.length
  const gap = 14
  const panelW = (W - gap * (panels - 1)) / panels
  const plotH = 96
  // Headroom for the panel title; text is drawn from its baseline, so a label
  // at y=9 actually starts above the viewBox and gets clipped.
  const top = panels > 1 ? 24 : 8
  const h = top + plotH + 30
  const yMax = f.yMax ?? Math.max(...f.series.flatMap((s) => s.values)) * 1.12

  return (
    <Frame h={h}>
      {f.series.map((s, si) => {
        const x0 = si * (panelW + gap)
        const n = s.values.length
        const bw = Math.min(36, (panelW - 8) / n - 6)
        const step = (panelW - 8) / n
        return (
          <g key={si}>
            {panels > 1 && (
              <text x={x0 + panelW / 2} y={14} textAnchor="middle" fontSize="11.5" fontFamily={MONO} fill={INK}>
                {s.label}
              </text>
            )}
            {/* baseline */}
            <line x1={x0} y1={top + plotH} x2={x0 + panelW} y2={top + plotH} stroke={LINE} strokeWidth="1" />
            {s.values.map((v, i) => {
              const bh = Math.max(1, (v / yMax) * plotH)
              const bx = x0 + 4 + i * step + (step - bw) / 2
              const on = !f.highlight || f.highlight.includes(i)
              return (
                <g key={i}>
                  <rect
                    x={bx}
                    y={top + plotH - bh}
                    width={bw}
                    height={bh}
                    fill={on ? INK : 'none'}
                    stroke={on ? INK : MUTE}
                    strokeWidth="1"
                  />
                  {f.showValues &&
                    (() => {
                      // A tall bar leaves no headroom for a label above it, and
                      // it would collide with the panel title. Put the value
                      // inside the bar instead once there is room for it.
                      const inside = bh > 26 && on
                      return (
                        <text
                          x={bx + bw / 2}
                          y={inside ? top + plotH - bh + 14 : top + plotH - bh - 5}
                          textAnchor="middle"
                          fontSize="10.5"
                          fontFamily={MONO}
                          fill={inside ? '#fff' : LABEL}
                        >
                          {v.toFixed(v < 1 ? 3 : 1)}
                        </text>
                      )
                    })()}
                  <text
                    x={bx + bw / 2}
                    y={top + plotH + 12}
                    textAnchor="middle"
                    fontSize="11"
                    fontFamily={MONO}
                    fill={LABEL}
                  >
                    {f.categories[i]}
                  </text>
                </g>
              )
            })}
            {f.cutoff && (
              <g>
                <line
                  x1={x0 + 4 + f.cutoff.after * step}
                  y1={top - 2}
                  x2={x0 + 4 + f.cutoff.after * step}
                  y2={top + plotH + 3}
                  stroke={INK}
                  strokeWidth="1"
                  strokeDasharray="3 2"
                />
                <text
                  x={x0 + 4 + f.cutoff.after * step + 4}
                  y={top + 6}
                  fontSize="10.5"
                  fontFamily={MONO}
                  fill={INK}
                >
                  {f.cutoff.label}
                </text>
              </g>
            )}
          </g>
        )
      })}
    </Frame>
  )
}

/* ────────────────────────────── curve ────────────────────────────── */

function Curve({ f }: { f: Extract<Figure, { kind: 'curve' }> }) {
  const padL = 44
  const padR = 8
  // Band above the plot for the y-axis label, so it clears the top tick — those
  // two were landing on each other whenever the label was wide.
  const padT = 28
  const plotH = 124
  // Room below the axis for the tick row plus the x-axis caption.
  const h = padT + plotH + 36
  const plotW = W - padL - padR

  const all = f.lines.flatMap((l) => l.points)
  const xs = all.map((p) => p[0])
  const ys = all.map((p) => p[1])
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const yMin = Math.min(0, ...ys)
  const yMax = Math.max(...ys) * 1.05

  const sx = (x: number) => padL + ((x - xMin) / (xMax - xMin || 1)) * plotW
  const sy = (y: number) => padT + plotH - ((y - yMin) / (yMax - yMin || 1)) * plotH

  return (
    <Frame h={h}>
      {/* axes */}
      <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke={LINE} strokeWidth="1" />
      <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke={LINE} strokeWidth="1" />

      {f.yTicks?.map((t, i) => (
        <g key={i}>
          <line x1={padL - 3} y1={sy(t.at)} x2={padL} y2={sy(t.at)} stroke={LINE} />
          <text x={padL - 6} y={sy(t.at) + 3} textAnchor="end" fontSize="10.5" fontFamily={MONO} fill={LABEL}>
            {t.label}
          </text>
        </g>
      ))}
      {f.xTicks?.map((t, i) => {
        // Anchor the end ticks inward so they cannot hang off either edge, and
        // sit them low enough to clear the y-axis zero label.
        const tx = sx(t.at)
        const anchor = tx > W - padR - 14 ? 'end' : tx < padL + 14 ? 'start' : 'middle'
        return (
          <g key={i}>
            <line x1={tx} y1={padT + plotH} x2={tx} y2={padT + plotH + 3} stroke={LINE} />
            <text
              x={anchor === 'end' ? W : anchor === 'start' ? padL - 4 : tx}
              y={padT + plotH + 17}
              textAnchor={anchor}
              fontSize="10.5"
              fontFamily={MONO}
              fill={LABEL}
            >
              {t.label}
            </text>
          </g>
        )
      })}

      {f.lines.map((l, i) => (
        <polyline
          key={i}
          points={l.points.map((p) => `${sx(p[0])},${sy(p[1])}`).join(' ')}
          fill="none"
          stroke={i === 0 ? INK : MUTE}
          strokeWidth={i === 0 ? 1.6 : 1.2}
          strokeDasharray={l.dashed ? '4 3' : undefined}
        />
      ))}

      {(() => {
        /*
         * Mark labels have to dodge two things: the plotted lines, and each
         * other. Rather than special-casing peaks and troughs, try a handful of
         * placements and take the first that is clear of both.
         */
        const placed: { x: number; y: number; w: number }[] = []

        // Densified points of every line, for hit-testing label boxes.
        const linePts: [number, number][] = []
        f.lines.forEach((l) => {
          for (let i = 0; i < l.points.length - 1; i++) {
            const [ax, ay] = l.points[i]
            const [bx, by] = l.points[i + 1]
            for (let k = 0; k <= 10; k++) {
              const t = k / 10
              linePts.push([sx(ax + (bx - ax) * t), sy(ay + (by - ay) * t)])
            }
          }
        })

        const hitsLine = (x: number, y: number, w: number) =>
          linePts.some((p) => p[0] >= x - 2 && p[0] <= x + w + 2 && p[1] >= y - 10 && p[1] <= y + 3)

        const hitsLabel = (x: number, y: number, w: number) =>
          placed.some((p) => Math.abs(p.y - y) < 13 && x < p.x + p.w + 4 && p.x < x + w + 4)

        return f.marks?.map((m, i) => {
        const px = sx(m.x)
        const py0 = sy(m.y)
        // Flip the label to the left near the right edge so it cannot run off
        // the figure.
        const flip = px > W - padR - 70
        const w = m.label.length * 6.3
        const x0 = flip ? px - 6 - w : px + 6

        // Above, below, then progressively further out on each side.
        const candidates = [py0 - 9, py0 + 18, py0 - 23, py0 + 32, py0 - 37, py0 + 46]
        let py = candidates[0]
        for (const c of candidates) {
          const clamped = Math.min(padT + plotH - 3, Math.max(padT + 9, c))
          if (!hitsLine(x0, clamped, w) && !hitsLabel(x0, clamped, w)) {
            py = clamped
            break
          }
          py = clamped
        }

        placed.push({ x: x0, y: py, w })
        return (
          <g key={i}>
            {/* The dot stays on the data point; only the label is nudged. */}
            <circle cx={px} cy={py0} r="2.8" fill={INK} />
            <text
              x={flip ? px - 6 : px + 6}
              y={py}
              textAnchor={flip ? 'end' : 'start'}
              fontSize="10.5"
              fontFamily={MONO}
              fill={INK}
            >
              {m.label}
            </text>
          </g>
        )
        })
      })()}

      <text x={W - padR} y={h - 4} textAnchor="end" fontSize="10.5" fontFamily={MONO} fill={LABEL}>
        {f.xLabel}
      </text>
      <text x={0} y={12} fontSize="10.5" fontFamily={MONO} fill={LABEL}>
        {f.yLabel}
      </text>
    </Frame>
  )
}

/* ────────────────────────────── segments ────────────────────────────── */

function Segments({ f }: { f: Extract<Figure, { kind: 'segments' }> }) {
  const rowH = 34
  const gap = 20
  const labelW = 4
  /** The first row's label is drawn from its baseline, so it needs room above. */
  const TOP = 6
  const h = TOP + f.rows.length * (rowH + gap) + 6
  const trackW = W - labelW

  return (
    <Frame h={h}>
      {f.rows.map((r, i) => {
        const y = TOP + i * (rowH + gap)
        return (
          <g key={i}>
            <text x={0} y={y + 8} fontSize="11" fontFamily={MONO} fill={LABEL}>
              {r.label}
            </text>
            {r.spans.map((s, j) => {
              const x = labelW + (s.from / f.total) * trackW
              const w = ((s.to - s.from) / f.total) * trackW
              return (
                <g key={j}>
                  <rect
                    x={x + 0.5}
                    y={y + 13}
                    width={Math.max(2, w - 1)}
                    height={rowH - 12}
                    fill={s.ghost ? 'none' : 'var(--surface-hover)'}
                    stroke={s.ghost ? MUTE : LINE}
                    strokeWidth="1"
                    strokeDasharray={s.ghost ? '3 2' : undefined}
                    rx="2"
                  />
                  {s.label && w > 26 && (
                    <text
                      x={x + w / 2}
                      y={y + 13 + (rowH - 12) / 2 + 3}
                      textAnchor="middle"
                      fontSize="10.5"
                      fontFamily={MONO}
                      fill={LABEL}
                    >
                      {s.label}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        )
      })}
    </Frame>
  )
}

/* ────────────────────────────── ranked ────────────────────────────── */

function Ranked({ f }: { f: Extract<Figure, { kind: 'ranked' }> }) {
  const n = f.grades.length
  const gap = 3
  const cw = (W - gap * (n - 1)) / n
  const ch = 40
  /** Band above the cells for the "first relevant" marker. */
  const TOP = 16
  const h = TOP + ch + 26
  const maxG = f.maxGrade ?? Math.max(...f.grades, 1)
  const firstRel = f.grades.findIndex((g) => g > 0)

  return (
    <Frame h={h}>
      {f.grades.map((g, i) => {
        const x = i * (cw + gap)
        // Higher grades render darker; 0 stays an outline.
        const opacity = g === 0 ? 0 : 0.18 + 0.82 * (g / maxG)
        return (
          <g key={i}>
            <rect x={x} y={TOP} width={cw} height={ch} rx="2" fill={INK} fillOpacity={opacity} stroke={g === 0 ? MUTE : 'none'} strokeDasharray={g === 0 ? '3 2' : undefined} />
            <text
              x={x + cw / 2}
              y={TOP + ch / 2 + 4}
              textAnchor="middle"
              fontSize="11.5"
              fontFamily={MONO}
              fill={g / maxG > 0.5 ? '#fff' : LABEL}
            >
              {g}
            </text>
            <text x={x + cw / 2} y={h - 4} textAnchor="middle" fontSize="10.5" fontFamily={MONO} fill={LABEL}>
              {i + 1}
            </text>
          </g>
        )
      })}
      {f.markFirstRelevant && firstRel >= 0 && (
        <g>
          <text
            // Centred on the cell, but clamped so a mark over cell 1 does not
            // hang off the left edge.
            x={Math.max(24, firstRel * (cw + gap) + cw / 2)}
            y={11}
            textAnchor="middle"
            fontSize="10.5"
            fontFamily={MONO}
            fill={INK}
          >
            ↓ first
          </text>
        </g>
      )}
    </Frame>
  )
}

/* ────────────────────────────── blocks ────────────────────────────── */

function Blocks({ f }: { f: Extract<Figure, { kind: 'blocks' }> }) {
  const rowH = 36
  const arrowH = 22
  const gap = 6
  /** Space above a row that carries a label, so the label is not clipped. */
  const LABEL_H = 15
  let h = 0
  f.rows.forEach((r) => {
    h += (r.label ? LABEL_H : 0) + rowH + gap + (r.arrow !== undefined ? arrowH : 0)
  })

  let y = 0
  return (
    <Frame h={h}>
      {f.rows.map((r, i) => {
        // Reserve the label band before drawing the boxes for this row.
        if (r.label) y += LABEL_H
        const rowY = y
        const totalSpan = r.boxes.reduce((s, b) => s + (b.span ?? 1), 0)
        const inner = W - gap * (r.boxes.length - 1)
        let x = 0
        const el = (
          <g key={i}>
            {r.label && (
              <text x={0} y={rowY - 5} fontSize="10.5" fontFamily={MONO} fill={LABEL}>
                {r.label}
              </text>
            )}
            {r.boxes.map((b, j) => {
              const bw = (inner * (b.span ?? 1)) / totalSpan
              const bx = x
              x += bw + gap
              return (
                <g key={j}>
                  <rect
                    x={bx}
                    y={rowY}
                    width={bw}
                    height={rowH}
                    rx="2"
                    fill={b.filled ? INK : 'none'}
                    stroke={b.filled ? INK : b.dashed ? MUTE : LINE}
                    strokeWidth="1"
                    strokeDasharray={b.dashed ? '3 2' : undefined}
                  />
                  <text
                    x={bx + bw / 2}
                    y={rowY + rowH / 2 + 3}
                    textAnchor="middle"
                    // Shrink to fit the box rather than spilling past its edges.
                    fontSize={Math.max(
                      7.5,
                      Math.min(11.5, ((bw - 12) / (b.text.length * 0.62)) | 0 || 7.5),
                    )}
                    fontFamily={MONO}
                    fill={b.filled ? '#fff' : 'var(--text-dim)'}
                  >
                    {b.text}
                  </text>
                </g>
              )
            })}
            {r.arrow !== undefined &&
              (() => {
                // The arrow sits on the left so its caption gets the full width;
                // centring it left long captions running off the right edge.
                const ax = 22
                const tipY = rowY + rowH + arrowH - 2
                const textX = ax + 14
                return (
                  <g>
                    <line x1={ax} y1={rowY + rowH + 3} x2={ax} y2={tipY - 1} stroke={MUTE} strokeWidth="1" />
                    <path
                      d={`M ${ax - 3} ${tipY - 4} L ${ax} ${tipY} L ${ax + 3} ${tipY - 4}`}
                      fill="none"
                      stroke={MUTE}
                      strokeWidth="1"
                    />
                    {r.arrow && (
                      <text
                        x={textX}
                        y={tipY - 1}
                        fontSize={Math.max(8, Math.min(10.5, (W - textX) / (r.arrow.length * 0.62)))}
                        fontFamily={MONO}
                        fill={LABEL}
                      >
                        {r.arrow}
                      </text>
                    )}
                  </g>
                )
              })()}
          </g>
        )
        y += rowH + gap + (r.arrow !== undefined ? arrowH : 0)
        return el
      })}
    </Frame>
  )
}

/* ────────────────────────────── entry ────────────────────────────── */

export default function FigureView({ figure }: { figure: Figure }) {
  const body =
    figure.kind === 'bars' ? (
      <Bars f={figure} />
    ) : figure.kind === 'curve' ? (
      <Curve f={figure} />
    ) : figure.kind === 'segments' ? (
      <Segments f={figure} />
    ) : figure.kind === 'ranked' ? (
      <Ranked f={figure} />
    ) : figure.kind === 'network' ? (
      <FigureD3Network f={figure} />
    ) : figure.kind === 'layered' ? (
      <FigureD3Layered f={figure} />
    ) : (
      <Blocks f={figure} />
    )

  return (
    <figure className="fig">
      {figure.title && <figcaption className="fig-title">{figure.title}</figcaption>}
      {body}
      {figure.caption && <div className="fig-caption">{figure.caption}</div>}
    </figure>
  )
}
