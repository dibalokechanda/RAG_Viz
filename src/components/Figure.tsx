import type { Figure } from '../data/types'

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
  const top = panels > 1 ? 16 : 6
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
              <text x={x0 + panelW / 2} y={9} textAnchor="middle" fontSize="11.5" fontFamily={MONO} fill={INK}>
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
                  {f.showValues && (
                    <text
                      x={bx + bw / 2}
                      y={top + plotH - bh - 4}
                      textAnchor="middle"
                      fontSize="10.5"
                      fontFamily={MONO}
                      fill={LABEL}
                    >
                      {v.toFixed(v < 1 ? 3 : 1)}
                    </text>
                  )}
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
  const padT = 8
  const plotH = 124
  const h = padT + plotH + 30
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
      {f.xTicks?.map((t, i) => (
        <g key={i}>
          <line x1={sx(t.at)} y1={padT + plotH} x2={sx(t.at)} y2={padT + plotH + 3} stroke={LINE} />
          <text x={sx(t.at)} y={padT + plotH + 13} textAnchor="middle" fontSize="10.5" fontFamily={MONO} fill={LABEL}>
            {t.label}
          </text>
        </g>
      ))}

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

      {f.marks?.map((m, i) => (
        <g key={i}>
          <circle cx={sx(m.x)} cy={sy(m.y)} r="2.6" fill={INK} />
          <text x={sx(m.x) + 5} y={sy(m.y) - 4} fontSize="10.5" fontFamily={MONO} fill={INK}>
            {m.label}
          </text>
        </g>
      ))}

      <text x={W - padR} y={h - 4} textAnchor="end" fontSize="10.5" fontFamily={MONO} fill={LABEL}>
        {f.xLabel}
      </text>
      <text x={0} y={padT + 4} fontSize="10.5" fontFamily={MONO} fill={LABEL}>
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
  const h = f.rows.length * (rowH + gap) + 6
  const trackW = W - labelW

  return (
    <Frame h={h}>
      {f.rows.map((r, i) => {
        const y = i * (rowH + gap)
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
  const h = ch + 30
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
            <rect x={x} y={10} width={cw} height={ch} rx="2" fill={INK} fillOpacity={opacity} stroke={g === 0 ? MUTE : 'none'} strokeDasharray={g === 0 ? '3 2' : undefined} />
            <text
              x={x + cw / 2}
              y={10 + ch / 2 + 3.5}
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
            x={firstRel * (cw + gap) + cw / 2}
            y={7}
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
  let h = 0
  f.rows.forEach((r) => {
    h += rowH + gap + (r.arrow !== undefined ? arrowH : 0)
  })

  let y = 0
  return (
    <Frame h={h}>
      {f.rows.map((r, i) => {
        const rowY = y
        const totalSpan = r.boxes.reduce((s, b) => s + (b.span ?? 1), 0)
        const inner = W - gap * (r.boxes.length - 1)
        let x = 0
        const el = (
          <g key={i}>
            {r.label && (
              <text x={0} y={rowY - 2} fontSize="10.5" fontFamily={MONO} fill={LABEL}>
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
                    fontSize={bw < 52 ? 10 : 11.5}
                    fontFamily={MONO}
                    fill={b.filled ? '#fff' : 'var(--text-dim)'}
                  >
                    {b.text}
                  </text>
                </g>
              )
            })}
            {r.arrow !== undefined && (
              <g>
                <line
                  x1={W / 2}
                  y1={rowY + rowH + 3}
                  x2={W / 2}
                  y2={rowY + rowH + arrowH - 3}
                  stroke={MUTE}
                  strokeWidth="1"
                />
                <path
                  d={`M ${W / 2 - 3} ${rowY + rowH + arrowH - 6} L ${W / 2} ${rowY + rowH + arrowH - 2} L ${W / 2 + 3} ${rowY + rowH + arrowH - 6}`}
                  fill="none"
                  stroke={MUTE}
                  strokeWidth="1"
                />
                {r.arrow && (
                  <text
                    x={W / 2 + 8}
                    y={rowY + rowH + arrowH - 4}
                    fontSize="10.5"
                    fontFamily={MONO}
                    fill={LABEL}
                  >
                    {r.arrow}
                  </text>
                )}
              </g>
            )}
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
