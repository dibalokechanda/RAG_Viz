import { useEffect, useMemo, useState } from 'react'
import * as d3 from 'd3'
import { COMMUNITIES, ENTITIES, RELATIONSHIPS, PAPER, CHUNKING, type CommunityId } from '../data/graphrag'

export type StageKey =
  | 'load'
  | 'extract'
  | 'merge'
  | 'communities'
  | 'embed'
  | 'reports'
  | 'local'
  | 'global'
  | 'drift'

const W = 1160
const H = 500
const ACCENT = '#a32a2a'
const INK = '#13251b'
const LINE = '#e6e1d9'
const DIM = '#8b857c'

const mulberry32 = (a: number) => () => {
  a |= 0
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function wrap(text: string, max: number) {
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

/* a soft white panel used everywhere, so every scene shares one material */
function Panel({
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

function Eyebrow({ x, y, children, fill = DIM }: { x: number; y: number; children: string; fill?: string }) {
  return (
    <text x={x} y={y} fontSize="7.6" fontFamily="var(--mono)" fontWeight="600" fill={fill} letterSpacing="0.1em">
      {children}
    </text>
  )
}

export default function GraphRAGViz({ stage }: { stage: StageKey }) {
  /* ── force layout, computed once and deterministic ───────────────────── */
  const { pos, hulls, radius } = useMemo(() => {
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
    for (const n of nodes) pos[n.id] = { x: m(n.x, x0, x1, 400, W - 120), y: m(n.y, y0, y1, 82, H - 108) }

    const radius: Record<string, number> = {}
    for (const e of ENTITIES) radius[e.id] = 8 + (e.weight / 10) * 7

    /* bx/by is a badge anchor just *below* each hull, where nothing else sits:
       node labels always render above their node, so the space under the hull
       is the only reliably empty spot. */
    const hulls: { c: CommunityId; path: string; cx: number; cy: number; bx: number; by: number }[] = []
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
  }, [])

  /* sub-tick for within-stage animation (chunk window, walks, map-reduce) */
  const [sub, setSub] = useState(0)
  useEffect(() => {
    setSub(0)
    const t = window.setInterval(() => setSub((s) => s + 1), 2200)
    return () => clearInterval(t)
  }, [stage])

  /* body of the paper, wrapped, with paragraph breaks preserved */
  const bodyLines = useMemo(() => {
    const out: { text: string; para: number; first: boolean }[] = []
    PAPER.paragraphs.forEach((p, i) =>
      wrap(p, 56).forEach((l, k) => out.push({ text: l, para: i, first: k === 0 })),
    )
    return out
  }, [])

  const neighbourhood = useMemo(() => {
    const seed = 'lora'
    const s = new Set<string>([seed])
    for (const r of RELATIONSHIPS) {
      if (r.source === seed) s.add(r.target)
      if (r.target === seed) s.add(r.source)
    }
    return s
  }, [])

  const showGraph = ['merge', 'communities', 'embed', 'reports', 'local', 'global', 'drift'].includes(stage)
  const coloured = ['communities', 'embed', 'reports', 'local', 'global', 'drift'].includes(stage)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="gr-svg">
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

      {/* ═══════════════ STAGE 1: load & split ═══════════════ */}
      {stage === 'load' &&
        (() => {
          const PX = 28
          const PY = 42
          const PW = 372
          const PH = 414
          const lineH = 14.2
          const paraGap = 9
          const textTop = PY + 116
          /* y of every wrapped line, with paragraph spacing folded in */
          const lineY: number[] = []
          let cursor = 0
          bodyLines.forEach((l, i) => {
            if (i > 0 && l.first) cursor += paraGap
            lineY.push(textTop + cursor)
            cursor += lineH
          })

          const N = bodyLines.length
          const windows = [
            { from: 0, to: Math.round(N * 0.42) },
            { from: Math.round(N * 0.42) - 1, to: Math.round(N * 0.76) },
            { from: Math.round(N * 0.76) - 1, to: N },
          ]
          const active = sub % 3

          /* token ruler: 3 chunks of 1200 with 100 overlap ⇒ 3400 tokens */
          const RX = 432
          const RTOP = 60
          const RBOT = 450
          const TOTAL = 3400
          const ty = (tok: number) => RTOP + (tok / TOTAL) * (RBOT - RTOP)
          const spans = [
            { from: 0, to: 1200 },
            { from: 1100, to: 2300 },
            { from: 2200, to: 3400 },
          ]

          const CX = 592
          const CW = W - CX - 30
          const CH = 122
          const cardY = [56, 196, 336]

          return (
            <g>
              {/* ── the page ── */}
              <rect x={PX} y={PY} width={PW} height={PH} rx="5" fill="url(#paper-sheen)" filter="url(#cardshadow)" />
              <rect x={PX} y={PY} width={PW} height={PH} rx="5" fill="none" stroke={LINE} />
              <text x={PX + 24} y={PY + 34} fontSize="13" fontFamily="var(--serif)" fontWeight="600" fill={INK}>
                {PAPER.title}
              </text>
              {wrap(PAPER.subtitle, 58).slice(0, 2).map((l, i) => (
                <text key={i} x={PX + 24} y={PY + 51 + i * 11} fontSize="7.4" fontFamily="var(--serif)" fill={DIM}>
                  {l}
                  {i === 1 ? '…' : ''}
                </text>
              ))}
              <line x1={PX + 24} y1={PY + 76} x2={PX + PW - 24} y2={PY + 76} stroke={LINE} />
              <text x={PX + 24} y={PY + 96} fontSize="9" fontFamily="var(--serif)" fontWeight="600" fill={INK}>
                {PAPER.section}
              </text>

              {/* active window highlight */}
              <rect
                x={PX + 15}
                y={lineY[windows[active].from] - 10}
                width={PW - 30}
                height={lineY[windows[active].to - 1] - lineY[windows[active].from] + 15}
                rx="3"
                fill={COMMUNITIES.eval.color}
                fillOpacity="0.1"
                style={{ transition: 'y 800ms cubic-bezier(.4,0,.2,1), height 800ms cubic-bezier(.4,0,.2,1)' }}
              />
              {active > 0 && (
                <rect
                  x={PX + 15}
                  y={lineY[windows[active].from] - 10}
                  width={PW - 30}
                  height={lineH + 5}
                  rx="3"
                  fill={ACCENT}
                  fillOpacity="0.16"
                >
                  <animate attributeName="fill-opacity" values="0.06;0.22;0.06" dur="2.4s" repeatCount="indefinite" />
                </rect>
              )}

              {bodyLines.map((l, i) => (
                <text
                  key={i}
                  x={PX + 24}
                  y={lineY[i]}
                  fontSize="7.8"
                  fontFamily="var(--serif)"
                  fill={i >= windows[active].from && i < windows[active].to ? '#2a2723' : '#b8b2a8'}
                  style={{ transition: 'fill 600ms' }}
                >
                  {l.text}
                </text>
              ))}
              <text x={PX + PW / 2} y={PY + PH + 18} fontSize="7.6" fontFamily="var(--mono)" fill={DIM} textAnchor="middle">
                fine_tuning_survey.pdf · p. 41
              </text>

              {/* ── token axis: the 3 windows drawn to scale, overlaps in red ── */}
              <text x={RX + 26} y={40} fontSize="7.6" fontFamily="var(--mono)" fontWeight="600" fill={DIM} textAnchor="middle" letterSpacing="0.1em">
                TOKEN AXIS
              </text>
              <line x1={RX - 4} y1={RTOP} x2={RX - 4} y2={RBOT} stroke="#ddd8d0" />
              {[0, 1200, 2400, 3400].map((t) => (
                <g key={t}>
                  <line x1={RX - 9} y1={ty(t)} x2={RX - 4} y2={ty(t)} stroke="#c9c3ba" />
                  <text x={RX - 12} y={ty(t) + 3} fontSize="7" fontFamily="var(--mono)" fill={DIM} textAnchor="end">
                    {t}
                  </text>
                </g>
              ))}
              {spans.map((s, i) => {
                const on = i === active
                const bx = RX + 4 + i * 19
                return (
                  <g key={i} opacity={i <= active ? 1 : 0.28} style={{ transition: 'opacity 600ms' }}>
                    <rect
                      x={bx}
                      y={ty(s.from)}
                      width={15}
                      height={ty(s.to) - ty(s.from)}
                      rx="5"
                      fill={on ? COMMUNITIES.eval.color : '#c9c3ba'}
                      fillOpacity={on ? 0.8 : 0.42}
                      style={{ transition: 'fill 500ms, fill-opacity 500ms' }}
                    />
                    {i > 0 && (
                      <rect
                        x={RX + 4 + (i - 1) * 19}
                        y={ty(s.from)}
                        width={34}
                        height={Math.max(ty(spans[i - 1].to) - ty(s.from), 3)}
                        rx="1.5"
                        fill={ACCENT}
                        fillOpacity="0.85"
                      />
                    )}
                    {/* tie the span to its chunk card */}
                    {(() => {
                      const sy = (ty(s.from) + ty(s.to)) / 2
                      const cy = cardY[i] + CH / 2
                      return (
                        <path
                          d={`M ${bx + 15} ${sy} C ${bx + 60} ${sy}, ${CX - 60} ${cy}, ${CX - 8} ${cy}`}
                          stroke={on ? COMMUNITIES.eval.color : '#ddd8d0'}
                          strokeWidth="1"
                          strokeDasharray="3 3"
                          fill="none"
                        />
                      )
                    })()}
                  </g>
                )
              })}
              <text x={RX + 26} y={RBOT + 18} fontSize="7.2" fontFamily="var(--mono)" fill={ACCENT} textAnchor="middle">
                red = overlap
              </text>

              {/* ── resulting chunks ── */}
              <text x={CX} y={40} fontSize="8.6" fontFamily="var(--mono)" fill={DIM}>
                {CHUNKING.splitter}(chunk_size={CHUNKING.size}, chunk_overlap={CHUNKING.overlap})
              </text>
              {cardY.map((cy, i) => {
                const win = windows[i]
                const on = i === active
                return (
                  <g key={i} opacity={i <= active ? 1 : 0.3} style={{ transition: 'opacity 600ms' }}>
                    <Panel x={CX} y={cy} w={CW} h={CH} accent={on ? COMMUNITIES.eval.color : undefined} strong={on} />
                    <text x={CX + 18} y={cy + 26} fontSize="9.6" fontFamily="var(--mono)" fontWeight="600" fill={INK}>
                      chunk_{String(i).padStart(2, '0')}
                    </text>
                    <text x={CX + CW - 18} y={cy + 26} fontSize="8" fontFamily="var(--mono)" fill={DIM} textAnchor="end">
                      {CHUNKING.size} tok · {spans[i].from}–{spans[i].to}
                    </text>
                    <line x1={CX + 18} y1={cy + 36} x2={CX + CW - 18} y2={cy + 36} stroke={LINE} />
                    {i > 0 && <rect x={CX + 14} y={cy + 42} width={CW - 28} height={13} rx="2" fill={ACCENT} fillOpacity="0.13" />}
                    {bodyLines.slice(win.from, win.from + 5).map((l, k) => (
                      <text
                        key={k}
                        x={CX + 18}
                        y={cy + 52 + k * 12}
                        fontSize="7.6"
                        fontFamily="var(--serif)"
                        fill={i > 0 && k === 0 ? ACCENT : '#6f6960'}
                      >
                        {l.text.length > 74 ? l.text.slice(0, 73) + '…' : l.text}
                      </text>
                    ))}
                    {i > 0 && (
                      <g>
                        <path d={`M ${CX - 14} ${cy - 18} v 14`} stroke={ACCENT} strokeWidth="1.2" strokeDasharray="3 3" />
                        <text x={CX - 8} y={cy - 8} fontSize="7.2" fontFamily="var(--mono)" fill={ACCENT}>
                          ↑ {CHUNKING.overlap} tok repeated from chunk_{String(i - 1).padStart(2, '0')}
                        </text>
                      </g>
                    )}
                  </g>
                )
              })}
            </g>
          )
        })()}

      {/* ═══════════════ STAGE 2: extract ═══════════════ */}
      {stage === 'extract' &&
        (() => {
          const ents = [
            { label: 'EVALUATION METRICS', type: 'evaluation metrics', c: 'eval' as CommunityId, d: 'Criteria used to assess the performance of AI models.' },
            { label: 'CROSS-ENTROPY', type: 'evaluation metrics', c: 'eval' as CommunityId, d: 'A key metric quantifying the difference between predicted and actual distributions.' },
            { label: 'PERPLEXITY', type: 'evaluation metrics', c: 'eval' as CommunityId, d: 'Exponentiated cross-entropy; how well a model predicts a sample.' },
            { label: 'DIFFERENTIAL PRIVACY', type: 'differential privacy', c: 'privacy' as CommunityId, d: 'Formal guarantee limiting what can be inferred about a record.' },
          ]
          const rels = [
            { a: 'CROSS-ENTROPY', b: 'PERPLEXITY', s: 7, d: 'Both metrics evaluate LLM performance.' },
            { a: 'HYPERPARAMETERS', b: 'EVALUATION METRICS', s: 8, d: 'Adjusted based on metrics to optimize performance.' },
            { a: 'DIFFERENTIAL PRIVACY', b: 'LARGE LANGUAGE MODELS', s: 7, d: 'LLMs generate synthetic samples under DP.' },
          ]
          return (
            <g>
              {/* chunk in */}
              <Panel x={28} y={128} w={238} h={244} />
              <text x={46} y={154} fontSize="9.6" fontFamily="var(--mono)" fontWeight="600" fill={INK}>
                chunk_04
              </text>
              <text x={248} y={154} fontSize="7.6" fontFamily="var(--mono)" fill={DIM} textAnchor="end">
                1200 tok
              </text>
              <line x1={46} y1={164} x2={248} y2={164} stroke={LINE} />
              {wrap(PAPER.paragraphs[0] + ' ' + PAPER.paragraphs[1], 40).slice(0, 13).map((l, i) => (
                <text key={i} x={46} y={182 + i * 13} fontSize="7.6" fontFamily="var(--serif)" fill="#6f6960">
                  {l}
                </text>
              ))}

              <path d="M 276 250 L 322 250" stroke="#b6b0a8" strokeWidth="1.6" />
              <path d="M 314 245 l 8 5 l -8 5" fill="none" stroke="#b6b0a8" strokeWidth="1.6" />

              {/* LLM */}
              <circle cx={404} cy={250} r="60" fill="none" stroke={COMMUNITIES.eval.color} strokeOpacity="0.3" strokeWidth="1">
                <animate attributeName="r" values="52;74;52" dur="3.4s" repeatCount="indefinite" />
                <animate attributeName="stroke-opacity" values="0.35;0;0.35" dur="3.4s" repeatCount="indefinite" />
              </circle>
              <rect x={332} y={210} width={144} height={80} rx="13" fill="url(#ink-sheen)" filter="url(#cardshadow)" />
              <text x={404} y={244} fontSize="13" fontFamily="var(--serif)" fill="#fff" textAnchor="middle">
                LLM
              </text>
              <text x={404} y={262} fontSize="7.4" fontFamily="var(--mono)" fill="#9fb3a6" textAnchor="middle">
                extraction prompt
              </text>
              <text x={404} y={314} fontSize="7.6" fontFamily="var(--mono)" fill={DIM} textAnchor="middle">
                one call per chunk
              </text>
              <text x={404} y={328} fontSize="7.6" fontFamily="var(--mono)" fill={DIM} textAnchor="middle">
                + gleaning rounds
              </text>

              <path d="M 486 250 L 532 250" stroke="#b6b0a8" strokeWidth="1.6" />
              <path d="M 524 245 l 8 5 l -8 5" fill="none" stroke="#b6b0a8" strokeWidth="1.6" />

              {/* entities out */}
              <Panel x={548} y={46} w={292} h={408} />
              <Eyebrow x={568} y={72}>
                ENTITIES
              </Eyebrow>
              <text x={820} y={72} fontSize="7.4" fontFamily="var(--mono)" fill={DIM} textAnchor="end">
                name · type · description
              </text>
              <line x1={568} y1={82} x2={820} y2={82} stroke={LINE} />
              {ents.map((e, i) => (
                <g key={e.label} opacity={sub % 4 >= i ? 1 : 0.16} style={{ transition: 'opacity 700ms' }}>
                  <circle cx={573} cy={104 + i * 92} r="4.5" fill={`url(#nodegrad-${e.c})`} />
                  <text x={585} y={107 + i * 92} fontSize="8.6" fontFamily="var(--mono)" fontWeight="600" fill={INK}>
                    {e.label}
                  </text>
                  <rect x={568} y={114 + i * 92} width={e.type.length * 4.6 + 12} height={13} rx="6.5" fill={COMMUNITIES[e.c].light} />
                  <text x={574} y={123 + i * 92} fontSize="7" fontFamily="var(--mono)" fill={COMMUNITIES[e.c].color}>
                    {e.type}
                  </text>
                  {wrap(e.d, 44).slice(0, 2).map((l, k) => (
                    <text key={k} x={568} y={143 + i * 92 + k * 11} fontSize="7.4" fontFamily="var(--serif)" fill="#6f6960">
                      {l}
                    </text>
                  ))}
                  {i < 3 && <line x1={568} y1={168 + i * 92} x2={820} y2={168 + i * 92} stroke={LINE} strokeDasharray="2 3" />}
                </g>
              ))}

              {/* relationships out */}
              <Panel x={856} y={46} w={276} h={408} />
              <Eyebrow x={876} y={72}>
                RELATIONSHIPS
              </Eyebrow>
              <text x={1112} y={72} fontSize="7.4" fontFamily="var(--mono)" fill={DIM} textAnchor="end">
                strength 1-10
              </text>
              <line x1={876} y1={82} x2={1112} y2={82} stroke={LINE} />
              {rels.map((r, i) => (
                <g key={r.a + r.b} opacity={sub % 4 >= i + 1 ? 1 : 0.16} style={{ transition: 'opacity 700ms' }}>
                  <text x={876} y={108 + i * 118} fontSize="8.2" fontFamily="var(--mono)" fontWeight="600" fill={INK}>
                    {r.a}
                  </text>
                  <text x={880} y={124 + i * 118} fontSize="9" fontFamily="var(--mono)" fill={ACCENT}>
                    ↓
                  </text>
                  <text x={894} y={124 + i * 118} fontSize="7.4" fontFamily="var(--serif)" fill="#6f6960">
                    {r.d.length > 40 ? r.d.slice(0, 39) + '…' : r.d}
                  </text>
                  <text x={876} y={141 + i * 118} fontSize="8.2" fontFamily="var(--mono)" fontWeight="600" fill={INK}>
                    {r.b}
                  </text>
                  <rect x={876} y={150 + i * 118} width={200} height={5} rx="2.5" fill="#efece6" />
                  <rect x={876} y={150 + i * 118} width={(r.s / 10) * 200} height={5} rx="2.5" fill={ACCENT} fillOpacity="0.75" />
                  <text x={1112} y={155 + i * 118} fontSize="7.6" fontFamily="var(--mono)" fill={ACCENT} textAnchor="end">
                    {r.s}
                  </text>
                  {i < 2 && <line x1={876} y1={176 + i * 118} x2={1112} y2={176 + i * 118} stroke={LINE} strokeDasharray="2 3" />}
                </g>
              ))}
            </g>
          )
        })()}

      {/* ═══════════════ STAGE 3: merge — sub-graphs on the left ═══════════════ */}
      {stage === 'merge' && (
        <g>
          <Eyebrow x={28} y={44}>
            PER-CHUNK SUB-GRAPHS
          </Eyebrow>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <Panel x={28} y={62 + i * 132} w={186} h={112} />
              <text x={44} y={84 + i * 132} fontSize="8.2" fontFamily="var(--mono)" fontWeight="600" fill={DIM}>
                chunk_{String([4, 11, 19][i]).padStart(2, '0')}
              </text>
              {[
                [[40, 30], [116, 22], [78, 62]],
                [[38, 26], [120, 38], [72, 66]],
                [[46, 34], [124, 26], [86, 60]],
              ][i].map(([dx, dy], k) => (
                <g key={k}>
                  <circle cx={28 + dx} cy={90 + i * 132 + dy} r="6.5" fill="url(#nodegrad-plain)" stroke="#fff" strokeWidth="1.5" filter="url(#soft)" />
                </g>
              ))}
              {(() => {
                const p = [
                  [[40, 30], [116, 22], [78, 62]],
                  [[38, 26], [120, 38], [72, 66]],
                  [[46, 34], [124, 26], [86, 60]],
                ][i]
                return (
                  <g stroke="#c9c3ba" strokeWidth="1.3">
                    <line x1={28 + p[0][0]} y1={90 + i * 132 + p[0][1]} x2={28 + p[1][0]} y2={90 + i * 132 + p[1][1]} />
                    <line x1={28 + p[0][0]} y1={90 + i * 132 + p[0][1]} x2={28 + p[2][0]} y2={90 + i * 132 + p[2][1]} />
                  </g>
                )
              })()}
              <path
                d={`M 222 ${118 + i * 132} C 268 ${118 + i * 132}, 300 ${H / 2}, 350 ${H / 2}`}
                fill="none"
                stroke={COMMUNITIES.eval.color}
                strokeOpacity="0.55"
                strokeWidth="1.4"
                strokeDasharray="5 5"
              >
                <animate attributeName="stroke-dashoffset" values="20;0" dur="1.6s" repeatCount="indefinite" />
              </path>
            </g>
          ))}
          <rect x={230} y={H / 2 - 32} width={112} height={64} rx="8" fill="#fff" fillOpacity="0.94" stroke={LINE} />
          <text x={286} y={H / 2 - 14} fontSize="8.4" fontFamily="var(--mono)" fill={DIM} textAnchor="middle">
            merge by
          </text>
          <text x={286} y={H / 2 - 2} fontSize="8.4" fontFamily="var(--mono)" fill={DIM} textAnchor="middle">
            entity name
          </text>
          <text x={286} y={H / 2 + 14} fontSize="7.4" fontFamily="var(--mono)" fill={ACCENT} textAnchor="middle">
            + summarise
          </text>
          <text x={286} y={H / 2 + 26} fontSize="7.4" fontFamily="var(--mono)" fill={ACCENT} textAnchor="middle">
            descriptions
          </text>
        </g>
      )}

      {/* ═══════════════ the knowledge graph ═══════════════ */}
      {showGraph && (
        <g>
          {(stage === 'communities' || stage === 'reports' || stage === 'global' || stage === 'drift') &&
            hulls.map((h) => (
              <path key={h.c} d={h.path} fill={COMMUNITIES[h.c].color} fillOpacity="0.085" stroke={COMMUNITIES[h.c].color} strokeOpacity="0.32" strokeWidth="1.2" />
            ))}

          {RELATIONSHIPS.map((r) => {
            const a = pos[r.source]
            const b = pos[r.target]
            const inLocal = (stage === 'local' || stage === 'drift') && neighbourhood.has(r.source) && neighbourhood.has(r.target)
            const dim = stage === 'local' && !inLocal
            return (
              <line
                key={`${r.source}-${r.target}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={inLocal ? ACCENT : '#b6b0a8'}
                strokeWidth={inLocal ? 2.6 : 0.6 + (r.strength / 10) * 1.8}
                opacity={dim ? 0.1 : inLocal ? 0.95 : 0.5}
                style={{ transition: 'opacity 500ms, stroke 400ms' }}
              />
            )
          })}

          {/* node2vec random walk */}
          {stage === 'embed' &&
            (() => {
              const walks = [
                ['lora', 'llm', 'dp', 'federated', 'healthcare'],
                ['crossentropy', 'perplexity', 'llm', 'advtrain'],
                ['ard', 'wildguard', 'advtrain', 'llm'],
              ]
              const wk = walks[sub % walks.length]
              const d = wk.map((id, i) => `${i ? 'L' : 'M'} ${pos[id].x} ${pos[id].y}`).join(' ')
              return (
                <g>
                  <path d={d} fill="none" stroke={COMMUNITIES.peft.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" filter="url(#glow)">
                    <animate attributeName="stroke-dasharray" values="0 700;700 0" dur="1.6s" fill="freeze" />
                  </path>
                  <circle r="5" fill={COMMUNITIES.peft.color} stroke="#fff" strokeWidth="1.5">
                    <animateMotion path={d} dur="1.6s" fill="freeze" />
                  </circle>
                </g>
              )
            })()}

          {ENTITIES.map((e) => {
            const p = pos[e.id]
            const r = radius[e.id]
            const dim = stage === 'local' && !neighbourhood.has(e.id)
            const seed = (stage === 'local' || stage === 'drift') && e.id === 'lora'
            return (
              <g key={e.id} opacity={dim ? 0.2 : 1} style={{ transition: 'opacity 500ms' }}>
                {seed && (
                  <circle cx={p.x} cy={p.y} r={r + 4} fill="none" stroke={ACCENT} strokeWidth="1.8">
                    <animate attributeName="r" values={`${r + 4};${r + 20};${r + 4}`} dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.9;0;0.9" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
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
                  fill={(stage === 'local' || stage === 'drift') && neighbourhood.has(e.id) ? ACCENT : '#55504a'}
                  textAnchor="middle"
                >
                  {e.label.length > 19 ? e.label.slice(0, 18) + '…' : e.label}
                </text>
              </g>
            )
          })}

          {(stage === 'communities' || stage === 'reports') &&
            hulls.map((h) => (
              <text key={`lbl-${h.c}`} x={h.bx} y={h.by} fontSize="9" fontFamily="var(--mono)" fontWeight="600" fill={COMMUNITIES[h.c].color} textAnchor="middle" opacity="0.85">
                {COMMUNITIES[h.c].name}
              </text>
            ))}
        </g>
      )}

      {/* ═══════════════ STAGE 4: communities — hierarchy panel ═══════════════ */}
      {stage === 'communities' && (
        <g>
          <Panel x={28} y={92} w={310} h={318} />
          <Eyebrow x={48} y={124}>
            HIERARCHICAL LEIDEN
          </Eyebrow>
          <line x1={48} y1={134} x2={318} y2={134} stroke={LINE} />
          <text x={48} y={156} fontSize="8" fontFamily="var(--mono)" fill={DIM}>
            level 0 · coarse partition
          </text>
          {(Object.keys(COMMUNITIES) as CommunityId[]).map((c, i) => (
            <g key={c}>
              <rect x={48} y={166 + i * 30} width={270} height={22} rx="6" fill={COMMUNITIES[c].light} fillOpacity="0.55" />
              <circle cx={60} cy={177 + i * 30} r="4.5" fill={`url(#nodegrad-${c})`} />
              <text x={72} y={180 + i * 30} fontSize="8" fontFamily="var(--mono)" fill={INK}>
                {COMMUNITIES[c].name}
              </text>
              <text x={310} y={180 + i * 30} fontSize="7.4" fontFamily="var(--mono)" fill={COMMUNITIES[c].color} textAnchor="end">
                {ENTITIES.filter((e) => e.community === c).length} nodes
              </text>
            </g>
          ))}
          <line x1={48} y1={298} x2={318} y2={298} stroke={LINE} strokeDasharray="2 3" />
          <text x={48} y={318} fontSize="8" fontFamily="var(--mono)" fill={DIM}>
            level 1 · each split again
          </text>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x={62} y={328 + i * 20} width={256} height={14} rx="4" fill="#f2efe9" />
              <text x={70} y={338 + i * 20} fontSize="7.2" fontFamily="var(--mono)" fill={DIM}>
                {['sub: loss functions', 'sub: rank & alpha', 'sub: clinical shards'][i]}
              </text>
            </g>
          ))}
          <text x={48} y={396} fontSize="7.4" fontFamily="var(--mono)" fill={ACCENT}>
            edge weight = relationship strength
          </text>
        </g>
      )}

      {/* ═══════════════ STAGE 5: embed — vector strip ═══════════════ */}
      {stage === 'embed' && (
        <g>
          <Panel x={28} y={92} w={310} h={306} />
          <Eyebrow x={48} y={120}>
            NODE2VEC
          </Eyebrow>
          <text x={318} y={120} fontSize="7.4" fontFamily="var(--mono)" fill={DIM} textAnchor="end">
            walk_length 40 · dims 1536
          </text>
          <line x1={48} y1={130} x2={318} y2={130} stroke={LINE} />
          <text x={48} y={150} fontSize="7.6" fontFamily="var(--mono)" fill={ACCENT}>
            walk → skip-gram → vector
          </text>
          {ENTITIES.slice(0, 7).map((e, i) => (
            <g key={e.id}>
              <text x={48} y={178 + i * 31} fontSize="7.2" fontFamily="var(--mono)" fill={DIM}>
                {e.label.length > 20 ? e.label.slice(0, 19) + '…' : e.label}
              </text>
              {Array.from({ length: 26 }).map((_, k) => {
                const v = (Math.sin((i + 1) * 2.3 + k * 0.9) + 1) / 2
                return (
                  <rect
                    key={k}
                    x={48 + k * 10.4}
                    y={184 + i * 31}
                    width="8.2"
                    height="9"
                    rx="1.8"
                    fill={COMMUNITIES[e.community].color}
                    fillOpacity={0.16 + v * 0.74}
                  />
                )
              })}
            </g>
          ))}
        </g>
      )}

      {/* ═══════════════ STAGE 6: reports ═══════════════ */}
      {stage === 'reports' &&
        (() => {
          const keys = Object.keys(COMMUNITIES) as CommunityId[]
          const c = keys[sub % keys.length]
          const R = COMMUNITIES[c]
          const h = hulls.find((x) => x.c === c)!
          return (
            <g>
              <path d={`M 340 140 C 380 140, ${h.cx - 90} ${h.cy}, ${h.cx} ${h.cy}`} fill="none" stroke={R.color} strokeWidth="1.4" strokeDasharray="5 5" opacity="0.7">
                <animate attributeName="stroke-dashoffset" values="20;0" dur="1.6s" repeatCount="indefinite" />
              </path>

              {/* ── 1. the generated report: full_content ── */}
              <Panel x={28} y={26} w={306} h={232} accent={R.color} strong />
              <Eyebrow x={48} y={54}>
                1 · COMMUNITY REPORT
              </Eyebrow>
              <text x={314} y={54} fontSize="7" fontFamily="var(--mono)" fill={DIM} textAnchor="end">
                full_content
              </text>
              {wrap(R.title, 32).map((l, i) => (
                <text key={i} x={48} y={78 + i * 15} fontSize="11.5" fontFamily="var(--serif)" fontWeight="600" fill={INK}>
                  {l}
                </text>
              ))}
              <text x={48} y={120} fontSize="7.4" fontFamily="var(--mono)" fill={R.color}>
                impact severity {R.rank.toFixed(1)} / 10
              </text>
              <rect x={48} y={127} width={266} height={5} rx="2.5" fill="#efece6" />
              <rect x={48} y={127} width={(R.rank / 10) * 266} height={5} rx="2.5" fill={R.color} />
              <line x1={48} y1={146} x2={314} y2={146} stroke={LINE} />
              <Eyebrow x={48} y={162}>
                DETAILED FINDINGS
              </Eyebrow>
              {R.findings.slice(0, 2).map((f, i) => (
                <g key={i}>
                  <circle cx={51} cy={177 + i * 32} r="2.2" fill={R.color} />
                  {wrap(f, 48).slice(0, 2).map((l, k) => (
                    <text key={k} x={62} y={180 + i * 32 + k * 11} fontSize="7.4" fontFamily="var(--serif)" fill="#6f6960">
                      {l}
                    </text>
                  ))}
                </g>
              ))}
              <text x={48} y={248} fontSize="6.8" fontFamily="var(--mono)" fill={DIM}>
                [Data: Entities (206); Relationships (281, 326)]
              </text>

              {/* summarise */}
              <path d="M 90 258 v 20" stroke="#b6b0a8" strokeWidth="1.4" />
              <path d="M 85 271 l 5 7 l 5 -7" fill="none" stroke="#b6b0a8" strokeWidth="1.4" />
              <text x={104} y={274} fontSize="7.4" fontFamily="var(--mono)" fill={ACCENT}>
                summarised again by the LLM
              </text>

              {/* ── 2. the community summary ── */}
              <Panel x={28} y={284} w={306} h={106} accent={R.color} />
              <Eyebrow x={48} y={306}>
                2 · COMMUNITY SUMMARY
              </Eyebrow>
              <text x={314} y={306} fontSize="7" fontFamily="var(--mono)" fill={DIM} textAnchor="end">
                summary
              </text>
              {wrap(R.summary, 52).slice(0, 5).map((l, i) => (
                <text key={i} x={48} y={324 + i * 11.5} fontSize="7.6" fontFamily="var(--serif)" fill="#6f6960">
                  {l}
                </text>
              ))}
              <text x={48} y={382} fontSize="7" fontFamily="var(--mono)" fill={ACCENT}>
                this is what global search reads
              </text>

              {/* embed */}
              <path d="M 90 390 v 20" stroke="#b6b0a8" strokeWidth="1.4" />
              <path d="M 85 403 l 5 7 l 5 -7" fill="none" stroke="#b6b0a8" strokeWidth="1.4" />
              <text x={104} y={406} fontSize="7.4" fontFamily="var(--mono)" fill={DIM}>
                text-embedding-3-small
              </text>

              {/* ── 3. the summary embedding ── */}
              <Eyebrow x={28} y={432}>
                3 · COMMUNITY EMBEDDING
              </Eyebrow>
              {Array.from({ length: 30 }).map((_, k) => {
                const v = (Math.sin((sub + 1) * 1.7 + k * 0.8) + 1) / 2
                return (
                  <rect
                    key={k}
                    x={28 + k * 9.4}
                    y={440}
                    width="7.4"
                    height="10"
                    rx="1.8"
                    fill={R.color}
                    fillOpacity={0.16 + v * 0.74}
                    style={{ transition: 'fill 600ms, fill-opacity 600ms' }}
                  />
                )
              })}
              <text x={314} y={432} fontSize="7" fontFamily="var(--mono)" fill={DIM} textAnchor="end">
                → LanceDB
              </text>
            </g>
          )
        })()}

      {/* ═══════════════ STAGE 7: local search ═══════════════ */}
      {stage === 'local' && (
        <g>
          <Panel x={28} y={40} w={300} h={96} accent={ACCENT} strong />
          <Eyebrow x={48} y={70} fill={ACCENT}>
            LOCAL QUERY
          </Eyebrow>
          {wrap('What is LoRA and how does it relate to hyperparameters?', 40).map((l, i) => (
            <text key={i} x={48} y={94 + i * 14} fontSize="9" fontFamily="var(--serif)" fill={INK}>
              {l}
            </text>
          ))}

          <Panel x={28} y={152} w={300} h={316} />
          <Eyebrow x={48} y={180}>
            CONTEXT ASSEMBLED
          </Eyebrow>
          <text x={308} y={180} fontSize="7.2" fontFamily="var(--mono)" fill={DIM} textAnchor="end">
            token budget
          </text>
          <line x1={48} y1={190} x2={308} y2={190} stroke={LINE} />
          {[
            { k: 'Entities', v: 'LORA, LARGE LANGUAGE MODELS, HYPERPARAMETERS, QLORA', pct: 0.3 },
            { k: 'Relationships', v: 'LORA→LLM (9), QLORA→LORA (9), LORA→HYPERPARAMS (6)', pct: 0.24 },
            { k: 'Source chunks', v: 'chunk_04, chunk_11, chunk_19 (the original prose)', pct: 0.34 },
            { k: 'Community reports', v: 'Parameter-Efficient Fine-Tuning (rank 8.0)', pct: 0.12 },
          ].map((row, i) => (
            <g key={row.k}>
              <text x={48} y={214 + i * 66} fontSize="8.4" fontFamily="var(--mono)" fontWeight="600" fill={INK}>
                {row.k}
              </text>
              <text x={308} y={214 + i * 66} fontSize="7.4" fontFamily="var(--mono)" fill={ACCENT} textAnchor="end">
                {Math.round(row.pct * 100)}%
              </text>
              {wrap(row.v, 46).slice(0, 2).map((l, k) => (
                <text key={k} x={48} y={230 + i * 66 + k * 11} fontSize="7.4" fontFamily="var(--serif)" fill="#6f6960">
                  {l}
                </text>
              ))}
              <rect x={48} y={256 + i * 66} width={260} height={5} rx="2.5" fill="#efece6" />
              <rect x={48} y={256 + i * 66} width={260 * row.pct} height={5} rx="2.5" fill={ACCENT} fillOpacity="0.7" />
            </g>
          ))}

          <path
            d={`M 334 90 C 380 90, ${pos.lora.x - 90} ${pos.lora.y}, ${pos.lora.x - 24} ${pos.lora.y}`}
            fill="none"
            stroke={ACCENT}
            strokeWidth="1.6"
            strokeDasharray="5 4"
          >
            <animate attributeName="stroke-dashoffset" values="18;0" dur="1.2s" repeatCount="indefinite" />
          </path>
          <text x={400} y={22} fontSize="7.8" fontFamily="var(--mono)" fill={ACCENT}>
            seed entity, then out to the 1-hop neighbourhood
          </text>
        </g>
      )}

      {/* ═══════════════ STAGE 8: global search — map / reduce ═══════════════ */}
      {stage === 'global' &&
        (() => {
          const keys = Object.keys(COMMUNITIES) as CommunityId[]
          const scores = [92, 85, 74, 61]
          return (
            <g>
              <Panel x={24} y={36} w={300} h={82} accent={ACCENT} strong />
              <Eyebrow x={44} y={64} fill={ACCENT}>
                GLOBAL QUERY
              </Eyebrow>
              {wrap('What are the main themes of this survey?', 40).map((l, i) => (
                <text key={i} x={44} y={88 + i * 14} fontSize="9" fontFamily="var(--serif)" fill={INK}>
                  {l}
                </text>
              ))}

              <Panel x={24} y={132} w={300} h={336} />
              <Eyebrow x={44} y={160}>
                REDUCE · KEY POINTS
              </Eyebrow>
              <text x={304} y={160} fontSize="7.2" fontFamily="var(--mono)" fill={DIM} textAnchor="end">
                score 0-100
              </text>
              <line x1={44} y1={170} x2={304} y2={170} stroke={LINE} />
              {keys.map((c, i) => (
                <g key={c}>
                  <circle cx={48} cy={191 + i * 64} r="4" fill={`url(#nodegrad-${c})`} />
                  <text x={60} y={194 + i * 64} fontSize="8.2" fontFamily="var(--mono)" fontWeight="600" fill={INK}>
                    {COMMUNITIES[c].name}
                  </text>
                  {wrap(COMMUNITIES[c].findings[0], 46).slice(0, 2).map((l, k) => (
                    <text key={k} x={60} y={209 + i * 68 + k * 11} fontSize="7.4" fontFamily="var(--serif)" fill="#6f6960">
                      {l}
                    </text>
                  ))}
                  <rect x={60} y={234 + i * 64} width={200} height={5} rx="2.5" fill="#efece6" />
                  <rect x={60} y={234 + i * 64} width={2 * scores[i]} height={5} rx="2.5" fill={COMMUNITIES[c].color} />
                  <text x={304} y={239 + i * 64} fontSize="7.6" fontFamily="var(--mono)" fill={COMMUNITIES[c].color} textAnchor="end">
                    {scores[i]}
                  </text>
                </g>
              ))}
              <line x1={44} y1={442} x2={304} y2={442} stroke={LINE} strokeDasharray="2 3" />
              <text x={44} y={458} fontSize="7" fontFamily="var(--mono)" fill={DIM}>
                low scorers dropped · duplicates merged
              </text>

              {keys.map((c, i) => {
                const h = hulls.find((x) => x.c === c)!
                return (
                  <g key={c}>
                    <path d={`M 330 ${86 + i * 8} C 380 ${h.by}, ${h.bx - 90} ${h.by}, ${h.bx - 40} ${h.by}`} fill="none" stroke={ACCENT} strokeWidth="1.1" strokeDasharray="4 4" opacity="0.5">
                      <animate attributeName="stroke-dashoffset" values="16;0" dur="1.4s" repeatCount="indefinite" />
                    </path>
                    <g filter="url(#cardshadow)">
                      <rect x={h.bx - 40} y={h.by - 15} width={80} height={30} rx="8" fill="#fff" stroke={COMMUNITIES[c].color} strokeOpacity="0.6" />
                    </g>
                    <text x={h.bx - 30} y={h.by + 4} fontSize="6.8" fontFamily="var(--mono)" fill={DIM}>
                      map
                    </text>
                    <text x={h.bx + 30} y={h.by + 4} fontSize="9" fontFamily="var(--mono)" fontWeight="600" fill={COMMUNITIES[c].color} textAnchor="end">
                      {scores[i]}
                    </text>
                  </g>
                )
              })}
              <text x={400} y={22} fontSize="7.8" fontFamily="var(--mono)" fill={ACCENT}>
                map: one LLM call per community report
              </text>
            </g>
          )
        })()}

      {/* ═══════════════ STAGE 9: DRIFT — primer, then a refinement loop ═══════════════ */}
      {stage === 'drift' &&
        (() => {
          const steps = [
            { k: 'HyDE', t: 'Write a hypothetical answer, embed that', s: 'a fake passage sits closer to corpus text than a question does' },
            { k: 'PRIMER', t: 'Top-k community reports → first answer', s: 'a lightweight global search, and a set of follow-up questions' },
            { k: 'EXPAND', t: 'One local search per follow-up', s: 'entities, relationships and source chunks, plus the reports' },
            { k: 'LOOP', t: 'Each answer raises new follow-ups', s: 'two iterations, a fixed stopping rule' },
            { k: 'REDUCE', t: 'Map-reduce the whole Q/A tree', s: 'every intermediate answer weighted equally, one final call' },
          ]
          const active = sub % steps.length
          return (
            <g>
              <Panel x={24} y={30} w={318} h={438} accent={ACCENT} strong />
              <Eyebrow x={44} y={58} fill={ACCENT}>
                DRIFT
              </Eyebrow>
              <text x={322} y={58} fontSize="7" fontFamily="var(--mono)" fill={DIM} textAnchor="end">
                global ▸ local ▸ loop
              </text>
              <line x1={44} y1={68} x2={322} y2={68} stroke={LINE} />

              {/* the spine the steps hang off */}
              <line x1={56} y1={92} x2={56} y2={92 + 4 * 78} stroke="#e0dbd2" strokeWidth="1.5" />
              {steps.map((st, i) => {
                const y = 92 + i * 78
                const on = i === active
                return (
                  <g key={st.k}>
                    <circle cx={56} cy={y} r={on ? 9 : 7} fill={on ? ACCENT : '#fff'} stroke={on ? ACCENT : '#c9c3ba'} strokeWidth="1.6" style={{ transition: 'all 400ms' }} />
                    <text x={56} y={y + 3} fontSize="7.6" fontFamily="var(--mono)" fontWeight="600" fill={on ? '#fff' : DIM} textAnchor="middle">
                      {i + 1}
                    </text>
                    <text x={76} y={y - 6} fontSize="7.4" fontFamily="var(--mono)" fontWeight="600" fill={on ? ACCENT : DIM} letterSpacing="0.08em">
                      {st.k}
                    </text>
                    {wrap(st.t, 38).map((l, k) => (
                      <text key={k} x={76} y={y + 8 + k * 11} fontSize="8.4" fontFamily="var(--serif)" fill={INK}>
                        {l}
                      </text>
                    ))}
                    {wrap(st.s, 44).map((l, k) => (
                      <text key={k} x={76} y={y + 30 + k * 10} fontSize="7.2" fontFamily="var(--serif)" fill="#8b857c">
                        {l}
                      </text>
                    ))}
                  </g>
                )
              })}
              {/* the loop arrow from step 4 back to step 3 */}
              <path d="M 46 326 C 34 326, 34 248, 46 248" fill="none" stroke={ACCENT} strokeWidth="1.3" strokeDasharray="4 3" opacity="0.75">
                <animate attributeName="stroke-dashoffset" values="14;0" dur="1.2s" repeatCount="indefinite" />
              </path>
              <path d="M 42 253 l 4 -6 l 5 5" fill="none" stroke={ACCENT} strokeWidth="1.3" />
              <text x={31} y={288} fontSize="6.8" fontFamily="var(--mono)" fill={ACCENT} textAnchor="middle" transform="rotate(-90 31 288)">
                ×2
              </text>

              {/* which level of the graph each phase reads */}
              <text x={400} y={22} fontSize="7.8" fontFamily="var(--mono)" fill={DIM}>
                DRIFT reads both levels at once: community reports (boxes) and the entity neighbourhood (red)
              </text>
              {hulls.map((h) => (
                <g key={`d-${h.c}`}>
                  <rect x={h.bx - 40} y={h.by - 13} width={80} height={24} rx="7" fill="#fff" stroke={COMMUNITIES[h.c].color} strokeOpacity="0.55" filter="url(#cardshadow)" />
                  <text x={h.bx} y={h.by + 3} fontSize="7" fontFamily="var(--mono)" fill={COMMUNITIES[h.c].color} textAnchor="middle">
                    report
                  </text>
                </g>
              ))}
            </g>
          )
        })()}

      {/* legend */}
      {coloured && (
        <g transform={`translate(392, ${H - 16})`}>
          {(Object.keys(COMMUNITIES) as CommunityId[]).map((c, i) => (
            <g key={c} transform={`translate(${i * 182}, 0)`}>
              <circle cx="0" cy="0" r="5" fill={`url(#nodegrad-${c})`} stroke="#fff" strokeWidth="1.5" filter="url(#soft)" />
              <text x="11" y="3.5" fontSize="8.6" fontFamily="var(--mono)" fill="#6f6960">
                {COMMUNITIES[c].name}
              </text>
            </g>
          ))}
        </g>
      )}
    </svg>
  )
}
