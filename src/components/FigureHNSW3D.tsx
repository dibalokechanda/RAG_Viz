import { useEffect, useMemo, useState } from 'react'
import type { Figure } from '../data/types'

type HNSW3D = Extract<Figure, { kind: 'hnsw3d' }>

const ACCENT = '#a32a2a' // query
const PATH = '#1f7a4d' // the walk / newly inserted

// ── isometric projection ────────────────────────────────────────────────
const VB_W = 400
const VB_H = 320
const CX = 200
const CY = 262 // screen y of the base-layer centre
const P_W = 250 // plane width  (x extent)
const P_D = 118 // plane depth  (z extent, on screen)
const SKEW = 0.42 // how much depth skews horizontally
const GAP = 60 // vertical distance between layers

/** (x,z in [0,1], layer index) → screen [x,y]. */
function proj(x: number, z: number, layer: number): [number, number] {
  const sx = CX + (x - 0.5) * P_W + (z - 0.5) * P_D * SKEW
  const sy = CY - layer * GAP - (z - 0.5) * P_D * 0.5
  return [sx, sy]
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z)

interface Edge {
  source: string
  target: string
  layer: number
}

export default function FigureHNSW3D({ f }: { f: HNSW3D }) {
  const topLayer = Math.max(...f.layers)
  const byId = useMemo(() => new Map(f.nodes.map((n) => [n.id, n])), [f.nodes])

  // Per-layer k-nearest-neighbour edges, computed from the geometry.
  const edges = useMemo<Edge[]>(() => {
    const out: Edge[] = []
    const seen = new Set<string>()
    for (const layer of f.layers) {
      const present = f.nodes.filter((n) => n.maxLayer >= layer)
      const k = layer === 0 ? 3 : 2
      for (const a of present) {
        const near = present
          .filter((o) => o.id !== a.id)
          .sort((p, q) => dist(a, p) - dist(a, q))
          .slice(0, k)
        for (const b of near) {
          const key = [a.id, b.id].sort().join('|') + '@' + layer
          if (!seen.has(key)) {
            seen.add(key)
            out.push({ source: a.id, target: b.id, layer })
          }
        }
      }
    }
    return out
  }, [f.nodes, f.layers])

  const neighboursOnLayer = (id: string, layer: number) =>
    edges
      .filter((e) => e.layer === layer && (e.source === id || e.target === id))
      .map((e) => (e.source === id ? e.target : e.source))

  // ── build the animation timeline ────────────────────────────────────────
  interface Frame {
    reveal: Set<string> // nodes visible so far (build)
    activeNode?: string // pulsing / newly inserted
    pathEdges: Set<string> // "source|target@layer" traversed
    visited: Set<string> // nodes on the search path
    activeLayer?: number
    dropFrom?: number // draw a descend line at this node from this layer
    foundQuery?: boolean
    caption: string
  }

  const frames = useMemo<Frame[]>(() => {
    const out: Frame[] = []
    if (f.mode === 'build') {
      // Insert nodes tallest-first, the way a fresh graph fills its top layers.
      const order = [...f.nodes].sort((a, b) => b.maxLayer - a.maxLayer)
      const shown = new Set<string>()
      for (const n of order) {
        shown.add(n.id)
        out.push({
          reveal: new Set(shown),
          activeNode: n.id,
          pathEdges: new Set(),
          visited: new Set(),
          caption:
            n.maxLayer === topLayer && n.isEntry
              ? `Insert ${n.id}: reaches the top layer L${n.maxLayer}, the entry point.`
              : `Insert ${n.id}: random top layer L${n.maxLayer}. It links to its nearest neighbours on every layer up to L${n.maxLayer}.`,
        })
      }
      out.push({
        reveal: new Set(shown),
        pathEdges: new Set(),
        visited: new Set(),
        caption: 'Graph built. Most nodes live only on L0; a few reach higher, forming the express lanes.',
      })
      return out
    }

    // search mode: greedy descent from the entry node to the query
    const all = new Set(f.nodes.map((n) => n.id))
    const q = f.query ?? { x: 0.5, z: 0.5 }
    const sim = (id: string) => {
      const n = byId.get(id)!
      return -dist(n, q)
    }
    const entry = f.nodes.find((n) => n.isEntry) ?? f.nodes[0]
    let current = entry.id
    const pathEdges = new Set<string>()
    const visited = new Set<string>([current])
    const push = (patch: Partial<Frame> & { caption: string }) =>
      out.push({
        reveal: all,
        pathEdges: new Set(pathEdges),
        visited: new Set(visited),
        ...patch,
      })

    push({ activeNode: current, activeLayer: topLayer, caption: `Enter at ${current} on the top layer L${topLayer}.` })
    for (let L = topLayer; L >= 0; L--) {
      let guard = 0
      while (guard++ < 20) {
        const ns = neighboursOnLayer(current, L)
        let best: string | null = null
        for (const nb of ns) if (best === null || sim(nb) > sim(best)) best = nb
        if (best !== null && sim(best) > sim(current)) {
          pathEdges.add([current, best].sort().join('|') + '@' + L)
          visited.add(best)
          const from = current
          current = best
          push({ activeNode: current, activeLayer: L, caption: `L${L}: ${from} → ${current} moves closer to the query.` })
        } else break
      }
      if (L > 0) {
        push({ activeNode: current, activeLayer: L, dropFrom: L, caption: `Local minimum on L${L}. Drop ${current} to L${L - 1}.` })
      }
    }
    push({ activeNode: current, activeLayer: 0, foundQuery: true, caption: `Nearest neighbour found: ${current}.` })
    return out
  }, [f, byId, edges, topLayer])

  const [i, setI] = useState(0)
  useEffect(() => {
    if (frames.length === 0) return
    const isLast = i % frames.length === frames.length - 1
    const t = window.setTimeout(() => setI((p) => (p + 1) % frames.length), isLast ? 3600 : f.mode === 'build' ? 1300 : 1600)
    return () => clearTimeout(t)
  }, [i, frames, f.mode])

  if (frames.length === 0) return null
  const fr = frames[i % frames.length]

  const q = f.query ?? { x: 0.5, z: 0.5 }
  const edgeKey = (e: Edge) => [e.source, e.target].sort().join('|') + '@' + e.layer

  return (
    <div className="net-fig">
      {/* small top margin so the tallest layer's plane and label don't graze the edge */}
      <svg viewBox={`0 -14 ${VB_W} ${VB_H + 14}`} width="100%" className="fig-svg">
        {/* layer planes, bottom to top */}
        {[...f.layers]
          .sort((a, b) => a - b)
          .map((layer) => {
            const c0 = proj(0, 0, layer)
            const c1 = proj(1, 0, layer)
            const c2 = proj(1, 1, layer)
            const c3 = proj(0, 1, layer)
            const [lx, ly] = proj(0, 1, layer)
            return (
              <g key={`plane-${layer}`}>
                <polygon
                  points={`${c0[0]},${c0[1]} ${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${c3[0]},${c3[1]}`}
                  fill="var(--surface-hover)"
                  fillOpacity={fr.activeLayer === layer ? 0.55 : 0.28}
                  stroke="var(--border-strong)"
                  strokeWidth="1"
                />
                <text x={lx - 8} y={ly - 2} fontSize="11" fontWeight="600" fontFamily="var(--mono)" fill="var(--text-faint)">
                  L{layer}
                </text>
              </g>
            )
          })}

        {/* vertical connectors: the same node across its layers */}
        {f.nodes
          .filter((n) => n.maxLayer >= 1 && fr.reveal.has(n.id))
          .map((n) => {
            const [bx, by] = proj(n.x, n.z, 0)
            const [tx, ty] = proj(n.x, n.z, n.maxLayer)
            return (
              <line
                key={`col-${n.id}`}
                x1={bx}
                y1={by}
                x2={tx}
                y2={ty}
                stroke={fr.visited.has(n.id) ? PATH : 'var(--border-heavy)'}
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity={0.7}
              />
            )
          })}

        {/* descend arrow for the current search drop */}
        {fr.dropFrom !== undefined &&
          fr.activeNode &&
          (() => {
            const n = byId.get(fr.activeNode)!
            const [x1, y1] = proj(n.x, n.z, fr.dropFrom)
            const [x2, y2] = proj(n.x, n.z, fr.dropFrom - 1)
            return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={PATH} strokeWidth="2.5" strokeDasharray="4 3" />
          })()}

        {/* per-layer edges */}
        {edges.map((e) => {
          const s = byId.get(e.source)!
          const t = byId.get(e.target)!
          if (!fr.reveal.has(e.source) || !fr.reveal.has(e.target)) return null
          const [x1, y1] = proj(s.x, s.z, e.layer)
          const [x2, y2] = proj(t.x, t.z, e.layer)
          const walked = fr.pathEdges.has(edgeKey(e))
          return (
            <line
              key={`e-${e.source}-${e.target}-${e.layer}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={walked ? PATH : 'var(--border-heavy)'}
              strokeWidth={walked ? 2.5 : 1}
              opacity={walked ? 1 : 0.55}
            />
          )
        })}

        {/* nodes, on every layer they occupy */}
        {f.nodes.map((n) => {
          if (!fr.reveal.has(n.id)) return null
          const inPath = fr.visited.has(n.id)
          return f.layers
            .filter((L) => n.maxLayer >= L)
            .map((L) => {
              const [x, y] = proj(n.x, n.z, L)
              const isActive = fr.activeNode === n.id
              return (
                <g key={`n-${n.id}-${L}`}>
                  {isActive && (
                    <circle cx={x} cy={y} r="5" fill="none" stroke={PATH} strokeWidth="1.5">
                      <animate attributeName="r" values="5;15;5" dur="1.5s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.8;0;0.8" dur="1.5s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={5}
                    fill={inPath ? PATH : 'var(--surface-hover)'}
                    stroke={inPath ? PATH : 'var(--border-strong)'}
                    strokeWidth="1.5"
                  />
                  {/* label the entry node on its top layer */}
                  {n.isEntry && L === n.maxLayer && (
                    <text x={x} y={y - 9} fontSize="9.5" fontFamily="var(--mono)" fill="var(--text-faint)" textAnchor="middle">
                      entry
                    </text>
                  )}
                </g>
              )
            })
        })}

        {/* query marker (search mode), sitting on the base plane */}
        {f.mode === 'search' &&
          (() => {
            const [qx, qy] = proj(q.x, q.z, 0)
            const found = fr.foundQuery && fr.activeNode
            const fn = found ? byId.get(fr.activeNode!)! : null
            const [fx, fy] = fn ? proj(fn.x, fn.z, 0) : [qx, qy]
            return (
              <g>
                {found && <line x1={fx} y1={fy} x2={qx} y2={qy} stroke={ACCENT} strokeWidth="1.5" strokeDasharray="3 2" />}
                <path
                  d={`M ${qx - 5} ${qy - 5} L ${qx + 5} ${qy + 5} M ${qx + 5} ${qy - 5} L ${qx - 5} ${qy + 5}`}
                  stroke={ACCENT}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <text x={qx} y={qy + 17} fontSize="10.5" fontFamily="var(--mono)" fill={ACCENT} textAnchor="middle">
                  query
                </text>
              </g>
            )
          })()}

        {/* legend */}
        <g transform="translate(12, 306)">
          {f.mode === 'build' ? (
            <>
              <circle cx="4" cy="0" r="4" fill={PATH} />
              <text x="13" y="3.5" fontSize="9.5" fontFamily="var(--mono)" fill="var(--text-dim)">
                just inserted
              </text>
              <line x1="110" y1="0" x2="128" y2="0" stroke="var(--border-heavy)" strokeWidth="1" strokeDasharray="3 3" />
              <text x="134" y="3.5" fontSize="9.5" fontFamily="var(--mono)" fill="var(--text-dim)">
                same node, other layers
              </text>
            </>
          ) : (
            <>
              <line x1="0" y1="0" x2="18" y2="0" stroke={PATH} strokeWidth="2.5" />
              <text x="24" y="3.5" fontSize="9.5" fontFamily="var(--mono)" fill="var(--text-dim)">
                search path
              </text>
              <path d="M 128 -4 L 136 4 M 136 -4 L 128 4" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
              <text x="144" y="3.5" fontSize="9.5" fontFamily="var(--mono)" fill="var(--text-dim)">
                query
              </text>
            </>
          )}
        </g>
      </svg>

      <div className="net-status">{fr.caption}</div>
    </div>
  )
}
