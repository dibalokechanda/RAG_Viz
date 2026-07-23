import { useMemo } from 'react'
import * as d3 from 'd3'
import { COMMUNITIES, ENTITIES, RELATIONSHIPS, type CommunityId } from '../data/graphrag'

/*
 * Shared drawing kit for every walkthrough canvas.
 *
 * All four graph methods index the same corpus and draw the same knowledge
 * graph, so the layout is computed once here and the panels, eyebrows and
 * filters are shared. That keeps the four tracks visually one artifact rather
 * than four that happen to sit behind the same tabs.
 */

export const W = 1160
export const H = 500
export const ACCENT = '#a32a2a'
export const INK = '#13251b'
export const LINE = '#e6e1d9'
export const DIM = '#8b857c'

const mulberry32 = (a: number) => () => {
  a |= 0
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function wrap(text: string, max: number) {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) {
      lines.push(cur.trim())
      cur = w
    } else cur += ' ' + w
  }
  if (cur.trim()) lines.push(cur.trim())
  return lines
}

/** a soft white panel, the one material every scene is built from */
export function Panel({
  x,
  y,
  w,
  h,
  accent,
  strong,
}: {
  x: number
  y: number
  w: number
  h: number
  accent?: string
  strong?: boolean
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="11" fill="#fff" filter="url(#cardshadow)" />
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx="11"
        fill="none"
        stroke={accent ?? LINE}
        strokeOpacity={accent ? (strong ? 0.65 : 0.4) : 1}
        strokeWidth={strong ? 1.5 : 1}
      />
      {accent && <rect x={x} y={y} width={w} height={4} rx="2" fill={accent} />}
    </g>
  )
}

export function Eyebrow({
  x,
  y,
  children,
  fill = DIM,
}: {
  x: number
  y: number
  children: string
  fill?: string
}) {
  return (
    <text x={x} y={y} fontSize="7.6" fontFamily="var(--mono)" fontWeight="600" fill={fill} letterSpacing="0.1em">
      {children}
    </text>
  )
}

/** gradients and filters, shared by every scene */
export function SceneDefs() {
  return (
    <defs>
      <linearGradient id="paper-sheen" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="100%" stopColor="#f8f6f2" />
      </linearGradient>
      <linearGradient id="ink-sheen" x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0%" stopColor="#1d3529" />
        <stop offset="100%" stopColor="#0e1c15" />
      </linearGradient>
      {(Object.keys(COMMUNITIES) as CommunityId[]).map((c) => {
        const base = COMMUNITIES[c].color
        const hi = d3.color(base)!.brighter(0.9).formatHex()
        return (
          <radialGradient key={c} id={`nodegrad-${c}`} cx="34%" cy="26%" r="76%">
            <stop offset="0%" stopColor={hi} />
            <stop offset="100%" stopColor={base} />
          </radialGradient>
        )
      })}
      <radialGradient id="nodegrad-plain" cx="34%" cy="26%" r="76%">
        <stop offset="0%" stopColor="#cbc5bc" />
        <stop offset="100%" stopColor="#a59e95" />
      </radialGradient>
      <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor={INK} floodOpacity="0.24" />
      </filter>
      <filter id="cardshadow" x="-30%" y="-30%" width="160%" height="190%">
        <feDropShadow dx="0" dy="5" stdDeviation="8" floodColor={INK} floodOpacity="0.11" />
      </filter>
      <filter id="glow" x="-70%" y="-70%" width="240%" height="240%">
        <feGaussianBlur stdDeviation="5" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  )
}

export interface Hull {
  c: CommunityId
  path: string
  cx: number
  cy: number
  bx: number
  by: number
}
export interface Layout {
  pos: Record<string, { x: number; y: number }>
  hulls: Hull[]
  radius: Record<string, number>
}

/**
 * Deterministic force layout over the shared entity set. Seeded, run to
 * completion once, then normalised into the canvas, so the graph is in the
 * same place on every track and every reload.
 *
 * `left` is where the graph's x range starts, letting a scene reserve room
 * for a panel down the side.
 */
export function useGraphLayout(left = 400): Layout {
  return useMemo(() => {
    const rng = mulberry32(7)
    const anchor: Record<CommunityId, [number, number]> = {
      eval: [0.3, 0.3],
      peft: [0.68, 0.3],
      privacy: [0.3, 0.74],
      safety: [0.72, 0.74],
    }
    type SN = { id: string; community: CommunityId; x: number; y: number }
    const nodes: SN[] = ENTITIES.map((e) => ({
      id: e.id,
      community: e.community,
      x: anchor[e.community][0] * 520 + (rng() - 0.5) * 60,
      y: anchor[e.community][1] * 380 + (rng() - 0.5) * 60,
    }))
    const links = RELATIONSHIPS.map((r) => ({ source: r.source, target: r.target }))
    const sim = d3
      .forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force('link', d3.forceLink(links).id((d: d3.SimulationNodeDatum & { id?: string }) => d.id!).distance(74).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-260))
      .force('x', d3.forceX((d: SN) => anchor[d.community][0] * 520).strength(0.18))
      .force('y', d3.forceY((d: SN) => anchor[d.community][1] * 380).strength(0.18))
      .force('collide', d3.forceCollide(34))
      .stop()
    for (let i = 0; i < 400; i++) sim.tick()

    const xs = nodes.map((n) => n.x)
    const ys = nodes.map((n) => n.y)
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
    const [y0, y1] = [Math.min(...ys), Math.max(...ys)]
    const m = (v: number, a: number, b: number, c: number, d: number) => c + ((v - a) / (b - a || 1)) * (d - c)
    const pos: Record<string, { x: number; y: number }> = {}
    for (const n of nodes) pos[n.id] = { x: m(n.x, x0, x1, left, W - 120), y: m(n.y, y0, y1, 82, H - 108) }

    const radius: Record<string, number> = {}
    for (const e of ENTITIES) radius[e.id] = 8 + (e.weight / 10) * 7

    /* bx/by is a badge anchor just below each hull, where nothing else sits:
       node labels always render above their node, so the space under the hull
       is the only reliably empty spot. */
    const hulls: Hull[] = []
    for (const c of Object.keys(COMMUNITIES) as CommunityId[]) {
      const pts = ENTITIES.filter((e) => e.community === c).map((e) => [pos[e.id].x, pos[e.id].y] as [number, number])
      const cx = d3.mean(pts, (p) => p[0])!
      const cy = d3.mean(pts, (p) => p[1])!
      const hull = d3.polygonHull(pts.map((p) => [...p] as [number, number]))
      let path = ''
      let by = cy + 44
      if (hull) {
        const grown = hull.map(([px, py]) => {
          const dx = px - cx
          const dy = py - cy
          const L = Math.hypot(dx, dy) || 1
          return [px + (dx / L) * 36, py + (dy / L) * 36] as [number, number]
        })
        path = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.7))(grown) ?? ''
        by = Math.max(...grown.map((g) => g[1])) + 20
      }
      hulls.push({ c, path, cx, cy, bx: cx, by: Math.min(by, H - 48) })
    }
    return { pos, hulls, radius }
  }, [left])
}

/** the shared knowledge graph, with per-scene emphasis */
export function GraphBody({
  layout,
  highlight,
  dimOthers,
  showHulls,
  coloured = true,
}: {
  layout: Layout
  /** entity ids to draw in the accent colour */
  highlight?: Set<string>
  /** fade everything outside `highlight` */
  dimOthers?: boolean
  showHulls?: boolean
  coloured?: boolean
}) {
  const { pos, hulls, radius } = layout
  const hot = (id: string) => !!highlight?.has(id)
  return (
    <g>
      {showHulls &&
        hulls.map((h) => (
          <path
            key={h.c}
            d={h.path}
            fill={COMMUNITIES[h.c].color}
            fillOpacity="0.085"
            stroke={COMMUNITIES[h.c].color}
            strokeOpacity="0.32"
            strokeWidth="1.2"
          />
        ))}

      {RELATIONSHIPS.map((r) => {
        const a = pos[r.source]
        const b = pos[r.target]
        const on = hot(r.source) && hot(r.target)
        const dim = dimOthers && !on
        return (
          <line
            key={`${r.source}-${r.target}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={on ? ACCENT : '#b6b0a8'}
            strokeWidth={on ? 2.6 : 0.6 + (r.strength / 10) * 1.8}
            opacity={dim ? 0.1 : on ? 0.95 : 0.5}
            style={{ transition: 'opacity 500ms, stroke 400ms' }}
          />
        )
      })}

      {ENTITIES.map((e) => {
        const p = pos[e.id]
        const r = radius[e.id]
        const dim = dimOthers && !hot(e.id)
        return (
          <g key={e.id} opacity={dim ? 0.2 : 1} style={{ transition: 'opacity 500ms' }}>
            <circle
              cx={p.x}
              cy={p.y}
              r={r}
              fill={coloured ? `url(#nodegrad-${e.community})` : 'url(#nodegrad-plain)'}
              stroke="#fff"
              strokeWidth="2"
              filter="url(#soft)"
              style={{ transition: 'fill 600ms' }}
            />
            <text
              x={p.x}
              y={p.y - r - 7}
              fontSize="8.4"
              fontFamily="var(--mono)"
              fontWeight="600"
              fill={hot(e.id) ? ACCENT : '#55504a'}
              textAnchor="middle"
            >
              {e.label.length > 19 ? e.label.slice(0, 18) + '…' : e.label}
            </text>
          </g>
        )
      })}
    </g>
  )
}

export function Legend({ y = H - 16, x = 392 }: { y?: number; x?: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      {(Object.keys(COMMUNITIES) as CommunityId[]).map((c, i) => (
        <g key={c} transform={`translate(${i * 182}, 0)`}>
          <circle cx="0" cy="0" r="5" fill={`url(#nodegrad-${c})`} stroke="#fff" strokeWidth="1.5" filter="url(#soft)" />
          <text x="11" y="3.5" fontSize="8.6" fontFamily="var(--mono)" fill="#6f6960">
            {COMMUNITIES[c].name}
          </text>
        </g>
      ))}
    </g>
  )
}
