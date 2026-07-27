import { useEffect, useRef, useState } from 'react'
import { AGENT_PROFILES, LOOP, MEMORY_GROUPS, QUERY, STEPS, TIPS, TOOLS, deriveWorld } from '../data/agentic'
import AgentModal from './AgentModal'

/*
 * Agentic RAG dashboard. A single step index drives everything: deriveWorld
 * folds the trace up to that step into a snapshot, and every region reads from
 * it. Playback is autoplay over the index; stepping backward just recomputes.
 *
 * First pass covers the central loop — agent, loop ring, tool registry,
 * subagents, timeline — in the app's warm theme rather than a dark dashboard.
 */

const SPEEDS = [0.5, 1, 2]

export default function AgenticRAGView() {
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [showThoughts, setShowThoughts] = useState(true)
  const [openMem, setOpenMem] = useState<Set<string>>(new Set())
  const [openAgent, setOpenAgent] = useState<string | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  const world = deriveWorld(idx)
  const { step, subagents, toolCalls, activeTools, memory, final } = world

  const toggleMem = (id: string) =>
    setOpenMem((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const last = STEPS.length - 1

  useEffect(() => {
    if (!playing) return
    if (idx >= last) {
      setPlaying(false)
      return
    }
    const t = window.setTimeout(() => setIdx((i) => Math.min(i + 1, last)), 2100 / speed)
    return () => clearTimeout(t)
  }, [idx, playing, speed, last])

  // keep the active timeline event in view as it advances
  useEffect(() => {
    const bar = timelineRef.current
    const dot = bar?.querySelector<HTMLElement>('.ag-tl-item.on')
    if (bar && dot) bar.scrollTo({ left: Math.max(0, dot.offsetLeft - bar.clientWidth / 2 + dot.offsetWidth / 2), behavior: 'smooth' })
  }, [idx])

  const go = (i: number) => {
    setIdx(Math.max(0, Math.min(i, last)))
    setPlaying(false)
  }
  const replay = () => {
    setIdx(0)
    setPlaying(true)
  }
  const toolActive = (id: string) => activeTools.has(id)
  const toolUsed = (id: string) => (toolCalls[id] ?? 0) > 0
  const anySubWorking = subagents.some((s) => s.status === 'working' || s.status === 'spawning')

  return (
    <div className="ag-view">
      {/* ── query ── */}
      <div className="ag-query">
        <span className="ag-eyebrow">User query</span>
        <p>{QUERY}</p>
      </div>

      {/* ── tool registry ── */}
      <section className="ag-tools" aria-label="Tool registry">
        <header className="ag-region-head">
          <span className="ag-eyebrow">Tool registry</span>
          <span className="ag-tip" data-tip={TIPS.tools}>
            ⓘ
          </span>
        </header>
        <div className="ag-tool-row">
          {TOOLS.map((t) => (
            <div key={t.id} className={`ag-tool ${toolActive(t.id) ? 'active' : toolUsed(t.id) ? 'used' : ''}`}>
              <div className="ag-tool-top">
                <span className="ag-tool-name">{t.label}</span>
                <span className={`ag-dot ${toolActive(t.id) ? 'on' : toolUsed(t.id) ? 'done' : ''}`} />
              </div>
              <div className="ag-tool-meta">
                <span>{t.latency}</span>
                <span className="ag-cost">{'$'.repeat(t.cost)}</span>
              </div>
              <div className="ag-tool-calls">{toolCalls[t.id] ?? 0} calls</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── beam: tools ↔ agent ── */}
      <div className={`ag-beam ${activeTools.size ? 'live' : ''}`} aria-hidden>
        <span />
        <span />
        <span />
      </div>

      {/* ── agent row: memory · agent · planner ── */}
      <div className="ag-core">
        {/* memory */}
        <div className="ag-memory">
          <header className="ag-region-head">
            <span className="ag-eyebrow">Memory</span>
            <span className="ag-tip" data-tip={TIPS.memory}>
              ⓘ
            </span>
          </header>
          <div className="ag-mem-scroll">
            {MEMORY_GROUPS.map((g) => {
              const entries = memory.filter((m) => m.type === g.type)
              return (
                <div className="ag-mem-group" key={g.type}>
                  <div className="ag-mem-gh">
                    <span className={`ag-mem-gname ${g.type}`}>{g.name}</span>
                    <span className="ag-tip" data-tip={g.tip}>
                      ⓘ
                    </span>
                    <span className="ag-mem-gcount">{entries.length}</span>
                  </div>
                  {entries.map((m) => {
                    const open = openMem.has(m.id)
                    return (
                      <button
                        key={m.id}
                        className={`ag-mem-entry ${m.type} ${open ? 'open' : ''} ${m.since === idx && idx > 0 ? 'fresh' : ''}`}
                        onClick={() => toggleMem(m.id)}
                      >
                        <span className="ag-mem-row">
                          <span className={`ag-mem-mark ${m.kind ?? ''}`}>
                            {m.kind === 'success' ? '✓' : m.kind === 'failure' ? '!' : m.kind === 'note' ? '+' : '•'}
                          </span>
                          <span className="ag-mem-label">{m.label}</span>
                          <span className="ag-mem-caret">{open ? '−' : '+'}</span>
                        </span>
                        {open && <span className="ag-mem-detail">{m.detail}</span>}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        {/* the agent */}
        <div className={`ag-agent ${step.state === 'done' ? 'done' : ''}`}>
          <header className="ag-agent-head">
            <span className="ag-eyebrow light">Agent · orchestrator</span>
            <button className="ag-inspect" onClick={() => setOpenAgent('main')} title="Inspect prompt, context and tool calls">
              inspect ⤢
            </button>
            <span className="ag-tip light" data-tip={TIPS.agent}>
              ⓘ
            </span>
          </header>
          {showThoughts && (
            <div className="ag-thought" key={idx}>
              <span className="ag-thought-label">thinking</span>
              <p>{step.thought}</p>
            </div>
          )}
          <div className="ag-agent-lines">
            {step.plan && (
              <div className="ag-line">
                <span>plan</span>
                <code>{step.plan}</code>
              </div>
            )}
            {step.action && (
              <div className="ag-line">
                <span>action</span>
                <code>{step.action}</code>
              </div>
            )}
          </div>
          <div className="ag-stats">
            <div className="ag-stat">
              <span>state</span>
              <strong>{step.state}</strong>
            </div>
            <div className="ag-stat">
              <span>confidence</span>
              <strong>{step.confidence != null ? `${step.confidence}%` : '—'}</strong>
            </div>
            <div className="ag-stat">
              <span>tokens</span>
              <strong>{step.tokens.toLocaleString()}</strong>
            </div>
          </div>
        </div>

        {/* planner (compact, in this pass) */}
        <div className="ag-planner">
          <header className="ag-region-head">
            <span className="ag-eyebrow">Planner</span>
            <span className="ag-tip" data-tip="Breaks the goal into parallel tasks, one per subagent.">
              ⓘ
            </span>
          </header>
          <div className="ag-plan-goal">Should NVIDIA acquire Cerebras?</div>
          <ul className="ag-plan-tasks">
            {[
              { id: 'financial', label: 'Financial analysis' },
              { id: 'news', label: 'Recent news' },
              { id: 'research', label: 'SEC filings & comps' },
              { id: 'risk', label: 'Market & risk' },
              { id: 'summary', label: 'Merge & recommend' },
            ].map((task) => {
              const sub = subagents.find((s) => s.id === task.id)
              const stateCls = !sub ? '' : sub.status === 'done' ? 'done' : 'active'
              return (
                <li key={task.id} className={stateCls}>
                  <span className="ag-check">{sub?.status === 'done' ? '✓' : stateCls === 'active' ? '◐' : '○'}</span>
                  {task.label}
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {/* ── agent loop, as a horizontal stepper ── */}
      <div className="ag-loopbar">
        <span className="ag-eyebrow">Agent loop</span>
        <span className="ag-tip" data-tip={TIPS.loop}>
          ⓘ
        </span>
        <div className="ag-loopbar-track">
          {LOOP.map((s, i) => (
            <div key={s} className={`ag-loopstage ${s === step.loop ? 'on' : ''}`}>
              <span className="ag-loopstage-n">{i + 1}</span>
              {s}
            </div>
          ))}
        </div>
        <span className="ag-loopbar-iter">iteration {step.iter}</span>
      </div>

      {/* ── beam: agent ↔ subagents ── */}
      <div className={`ag-beam down ${anySubWorking ? 'live' : ''}`} aria-hidden>
        <span />
        <span />
        <span />
      </div>

      {/* ── subagents ── */}
      <section className="ag-subs" aria-label="Active subagents">
        <header className="ag-region-head">
          <span className="ag-eyebrow">Active subagents</span>
          <span className="ag-count">{subagents.length}</span>
          <span className="ag-tip" data-tip={TIPS.subagents}>
            ⓘ
          </span>
        </header>
        {subagents.length === 0 ? (
          <p className="ag-empty">The agent has not spawned any workers yet.</p>
        ) : (
          <div className="ag-sub-grid">
            {subagents.map((s) => (
              <button
                key={s.id}
                className={`ag-sub ${s.status}`}
                style={{ ['--sub' as string]: s.color }}
                onClick={() => setOpenAgent(s.id)}
                title="Inspect prompt, context and tool calls"
              >
                <div className="ag-sub-top">
                  <span className="ag-sub-name">{s.name}</span>
                  <span className={`ag-sub-status ${s.status}`}>{s.status}</span>
                </div>
                <p className="ag-sub-task">{s.task}</p>
                <div className="ag-sub-foot">
                  <span className="ag-sub-tool">{s.tool ?? 'idle'}</span>
                  <span className="ag-sub-pct">{s.progress}%</span>
                </div>
                <div className="ag-sub-bar">
                  <span style={{ width: `${s.progress}%` }} />
                </div>
                <span className="ag-sub-inspect">inspect ⤢</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── final answer ── */}
      {final && (
        <section className="ag-final" aria-label="Final answer">
          <header className="ag-region-head">
            <span className="ag-eyebrow">Recommendation</span>
            <span className="ag-final-conf">{final.confidence}% confidence</span>
          </header>
          <p className="ag-final-rec">{final.recommendation}</p>
          <div className="ag-final-cols">
            <div>
              <span className="ag-final-h pro">Pros</span>
              <ul>
                {final.pros.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
            <div>
              <span className="ag-final-h con">Cons</span>
              <ul>
                {final.cons.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* ── timeline ── */}
      <section className="ag-timeline" aria-label="Execution timeline">
        <header className="ag-region-head">
          <span className="ag-eyebrow">Execution timeline</span>
          <span className="ag-tip" data-tip={TIPS.timeline}>
            ⓘ
          </span>
        </header>
        <div className="ag-tl-track" ref={timelineRef}>
          {STEPS.map((s, i) => (
            <button
              key={i}
              className={`ag-tl-item ${i === idx ? 'on' : ''} ${i < idx ? 'past' : ''}`}
              onClick={() => go(i)}
            >
              <span className="ag-tl-t">{s.t}</span>
              <span className="ag-tl-node" />
              <span className="ag-tl-label">{s.event}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── controls ── */}
      <div className="ag-controls">
        <div className="ag-ctrl-group">
          <button onClick={() => go(idx - 1)} disabled={idx === 0} title="Previous step">
            ⏮
          </button>
          <button className="ag-ctrl-play" onClick={() => (idx >= last ? replay() : setPlaying((p) => !p))} title={playing ? 'Pause' : 'Play'}>
            {idx >= last ? '↻' : playing ? '❚❚' : '▶'}
          </button>
          <button onClick={() => go(idx + 1)} disabled={idx === last} title="Next step">
            ⏭
          </button>
        </div>
        <div className="ag-ctrl-progress">
          <input type="range" min={0} max={last} value={idx} onChange={(e) => go(Number(e.target.value))} aria-label="Scrub timeline" />
          <span>
            {idx + 1} / {STEPS.length}
          </span>
        </div>
        <div className="ag-ctrl-group">
          <button className="ag-speed" onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])} title="Animation speed">
            {speed}×
          </button>
          <button className={`ag-toggle ${showThoughts ? 'on' : ''}`} onClick={() => setShowThoughts((v) => !v)} title="Show or hide the agent's thoughts">
            thoughts
          </button>
        </div>
      </div>

      {openAgent && AGENT_PROFILES[openAgent] && (
        <AgentModal
          profile={AGENT_PROFILES[openAgent]}
          stepIndex={idx}
          timeLabel={step.t}
          playing={playing}
          onClose={() => setOpenAgent(null)}
        />
      )}
    </div>
  )
}
