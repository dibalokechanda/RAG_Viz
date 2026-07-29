import { useEffect, useRef } from 'react'
import { SUBAGENTS, type World } from '../data/agentic'

/*
 * A live LangGraph-style view of the run, drawn as the compiled StateGraph.
 *
 * Faithful to how LangGraph executes:
 *  - __start__ and __end__ are the graph's terminal nodes.
 *  - the orchestrator is the supervisor node; it fans out to worker nodes
 *    (the LangGraph Send API / parallel branches).
 *  - each worker loops with its own ToolNode via a conditional edge
 *    (tools_condition): agent -> tools -> agent until it stops calling tools.
 *  - workers join back into the summary node, which routes to __end__.
 *  - execution advances in super-steps (the Pregel BSP model); the nodes and
 *    edges light up as the current step activates them, and nodes appear as
 *    the agent creates them.
 */

const WORKERS = ['research', 'financial', 'news', 'risk'] as const

interface N {
  x: number
  y: number
  w: number
  h: number
  label: string
  tag: string
  kind: 'term' | 'agent' | 'worker' | 'tool'
  color: string
}

const NODES: Record<string, N> = {
  __start__: { x: 500, y: 34, w: 104, h: 30, label: '__start__', tag: '', kind: 'term', color: '#8b857c' },
  orchestrator: { x: 500, y: 108, w: 172, h: 56, label: 'orchestrator', tag: 'agent', kind: 'agent', color: '#13251b' },
  research: { x: 140, y: 244, w: 150, h: 48, label: 'research', tag: 'agent', kind: 'worker', color: SUBAGENTS.research.color },
  financial: { x: 380, y: 244, w: 150, h: 48, label: 'financial', tag: 'agent', kind: 'worker', color: SUBAGENTS.financial.color },
  news: { x: 620, y: 244, w: 150, h: 48, label: 'news', tag: 'agent', kind: 'worker', color: SUBAGENTS.news.color },
  risk: { x: 860, y: 244, w: 150, h: 48, label: 'risk', tag: 'agent', kind: 'worker', color: SUBAGENTS.risk.color },
  t_research: { x: 104, y: 338, w: 92, h: 32, label: 'tools', tag: 'ToolNode', kind: 'tool', color: '#55504a' },
  t_financial: { x: 344, y: 338, w: 92, h: 32, label: 'tools', tag: 'ToolNode', kind: 'tool', color: '#55504a' },
  t_news: { x: 656, y: 338, w: 92, h: 32, label: 'tools', tag: 'ToolNode', kind: 'tool', color: '#55504a' },
  t_risk: { x: 896, y: 338, w: 92, h: 32, label: 'tools', tag: 'ToolNode', kind: 'tool', color: '#55504a' },
  summary: { x: 500, y: 452, w: 172, h: 54, label: 'summary', tag: 'agent', kind: 'agent', color: '#13251b' },
  __end__: { x: 500, y: 540, w: 104, h: 30, label: '__end__', tag: '', kind: 'term', color: '#8b857c' },
}

interface E {
  from: string
  to: string
  kind: 'main' | 'dispatch' | 'call' | 'obs' | 'join'
  /** bow direction for the two edges of a tool loop */
  bow?: number
}
const EDGES: E[] = [
  { from: '__start__', to: 'orchestrator', kind: 'main' },
  ...WORKERS.map((w) => ({ from: 'orchestrator', to: w, kind: 'dispatch' as const })),
  ...WORKERS.flatMap((w) => [
    { from: w, to: 't_' + w, kind: 'call' as const, bow: -16 },
    { from: 't_' + w, to: w, kind: 'obs' as const, bow: 16 },
  ]),
  ...WORKERS.map((w) => ({ from: w, to: 'summary', kind: 'join' as const })),
  { from: 'summary', to: '__end__', kind: 'main' },
]

const superStep = (i: number) => (i <= 2 ? 1 : i <= 7 ? 2 : i <= 11 ? 3 : i === 12 ? 4 : i <= 14 ? 5 : 6)

/** cubic between two node centres; the opaque nodes drawn on top mask the ends */
function path(a: N, b: N, bow = 0) {
  const dy = (b.y - a.y) * 0.45
  return `M ${a.x} ${a.y} C ${a.x + bow} ${a.y + dy}, ${b.x + bow} ${b.y - dy}, ${b.x} ${b.y}`
}

export default function GraphView({
  world,
  last,
  playing,
  onGo,
  onToggle,
  onClose,
}: {
  world: World
  last: number
  playing: boolean
  onGo: (i: number) => void
  onToggle: () => void
  onClose: () => void
}) {
  const { index: idx, step, subagents } = world
  const dialogRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    // on a narrow screen the wide graph scrolls; open centred on it
    const c = canvasRef.current
    if (c) c.scrollLeft = (c.scrollWidth - c.clientWidth) / 2
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  /* ── derive live graph state from the run ── */
  const present = new Set<string>(['__start__', 'orchestrator'])
  for (const s of subagents) {
    present.add(s.id)
    if (s.id !== 'summary') present.add('t_' + s.id)
  }
  if (idx >= 15) present.add('__end__')

  const active = new Set<string>()
  const flow = new Set<string>()
  const key = (f: string, t: string) => `${f}>${t}`

  if (step.state === 'done') {
    active.add('__end__')
    flow.add(key('summary', '__end__'))
  } else if (step.state === 'synthesising') {
    active.add('summary')
  } else if (step.state === 'merging') {
    active.add('summary')
    for (const w of WORKERS) if (present.has(w)) flow.add(key(w, 'summary'))
  } else if (step.spawn) {
    active.add('orchestrator')
    active.add(step.spawn)
    flow.add(key('orchestrator', step.spawn))
  } else if (step.subUpdate && step.tools?.length) {
    const w = step.subUpdate.id
    active.add(w)
    active.add('t_' + w)
    flow.add(key(w, 't_' + w))
    flow.add(key('t_' + w, w))
  } else {
    active.add('orchestrator')
    if (idx <= 1) flow.add(key('__start__', 'orchestrator'))
  }

  const justNew = new Set<string>()
  if (step.spawn) {
    justNew.add(step.spawn)
    if (step.spawn !== 'summary') justNew.add('t_' + step.spawn)
  }
  if (idx === 15) justNew.add('__end__')

  const edgePresent = (e: E) => {
    if (e.kind === 'main') return e.from === '__start__' ? true : idx >= 15
    if (e.kind === 'dispatch') return present.has(e.to)
    if (e.kind === 'call' || e.kind === 'obs') return present.has(e.from) && present.has(e.to)
    if (e.kind === 'join') return idx >= 12 && present.has(e.from)
    return false
  }

  return (
    <div className="gv-backdrop" onMouseDown={onClose}>
      <div className="gv-dialog" role="dialog" aria-modal="true" aria-label="Execution graph" tabIndex={-1} ref={dialogRef} onMouseDown={(e) => e.stopPropagation()}>
        <header className="gv-head">
          <div className="gv-head-text">
            <h4>Execution graph</h4>
            <p>The compiled LangGraph StateGraph, activating in real time</p>
          </div>
          <span className="gv-superstep">
            super-step {superStep(idx)} <span>/ 6</span>
          </span>
          <button className="gv-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="gv-canvas" ref={canvasRef}>
          <svg viewBox="0 0 1000 590" className="gv-svg">
            <defs>
              <marker id="gv-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#b6b0a8" />
              </marker>
              <marker id="gv-arrow-hot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#a32a2a" />
              </marker>
            </defs>

            {/* edges under nodes */}
            {EDGES.map((e, i) => {
              const a = NODES[e.from]
              const b = NODES[e.to]
              if (!edgePresent(e)) return null
              const hot = flow.has(key(e.from, e.to))
              return (
                <path
                  key={i}
                  d={path(a, b, e.bow ?? 0)}
                  fill="none"
                  stroke={hot ? '#a32a2a' : '#cfc9c1'}
                  strokeWidth={hot ? 2.4 : 1.3}
                  strokeDasharray={hot ? '6 5' : undefined}
                  markerEnd={`url(#gv-arrow${hot ? '-hot' : ''})`}
                  opacity={hot ? 1 : 0.7}
                  style={{ transition: 'stroke 300ms, opacity 300ms' }}
                >
                  {hot && <animate attributeName="stroke-dashoffset" values="22;0" dur="0.9s" repeatCount="indefinite" />}
                </path>
              )
            })}

            {/* nodes on top */}
            {Object.entries(NODES).map(([id, n]) => {
              const isPresent = present.has(id)
              const isActive = active.has(id)
              const rx = n.kind === 'term' ? n.h / 2 : 12
              return (
                <g
                  key={id}
                  opacity={isPresent ? 1 : 0.16}
                  style={{ transition: 'opacity 400ms' }}
                  className={justNew.has(id) ? 'gv-node-new' : undefined}
                >
                  {isActive && <rect x={n.x - n.w / 2 - 5} y={n.y - n.h / 2 - 5} width={n.w + 10} height={n.h + 10} rx={rx + 5} fill="none" stroke={n.color} strokeWidth="2" opacity="0.5" className="gv-halo" />}
                  <rect
                    x={n.x - n.w / 2}
                    y={n.y - n.h / 2}
                    width={n.w}
                    height={n.h}
                    rx={rx}
                    fill={n.kind === 'term' ? '#efece6' : n.kind === 'tool' ? '#f2efe9' : isActive ? n.color : '#fff'}
                    stroke={n.color}
                    strokeWidth={isActive ? 1.8 : 1.2}
                    strokeOpacity={n.kind === 'term' ? 0.5 : 0.9}
                    style={{ transition: 'fill 300ms' }}
                  />
                  <text x={n.x} y={n.kind === 'term' || !n.tag ? n.y + 3.5 : n.y - 2} textAnchor="middle" className={`gv-label ${n.kind}`} fill={isActive && n.kind !== 'tool' && n.kind !== 'term' ? '#fff' : n.color}>
                    {n.label}
                  </text>
                  {n.tag && (
                    <text x={n.x} y={n.y + 11} textAnchor="middle" className="gv-tag" fill={isActive && n.kind !== 'tool' ? 'rgba(255,255,255,0.6)' : '#a49c92'}>
                      {n.tag}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>

        <p className="gv-caption">
          START fans out to the worker nodes; each loops with its ToolNode via <code>tools_condition</code>, then results join at <code>summary</code> and route to END. Nodes appear as the agent creates them, and light up on the super-step that runs them.
        </p>

        <div className="gv-controls">
          <button onClick={() => onGo(idx - 1)} disabled={idx === 0} title="Previous step">
            ⏮
          </button>
          <button className="gv-play" onClick={onToggle} title={playing ? 'Pause' : 'Play'}>
            {idx >= last ? '↻' : playing ? '❚❚' : '▶'}
          </button>
          <button onClick={() => onGo(idx + 1)} disabled={idx === last} title="Next step">
            ⏭
          </button>
          <input type="range" min={0} max={last} value={idx} onChange={(e) => onGo(Number(e.target.value))} aria-label="Scrub" />
          <span className="gv-count">
            {idx + 1} / {last + 1}
          </span>
        </div>
      </div>
    </div>
  )
}
