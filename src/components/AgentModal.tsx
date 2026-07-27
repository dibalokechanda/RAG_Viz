import { useEffect, useRef, useState } from 'react'
import type { AgentProfile } from '../data/agentic'

/*
 * Per-agent inspector. Three tabs: the prompt structure (static), the context
 * window (assembled live, filtered by the current step), and the tool-call
 * trace (also live). Passing the step index in from the dashboard means the
 * Context and Tool-call tabs keep filling while the modal stays open, which is
 * the "real-time" part of the request.
 */

type Tab = 'prompt' | 'context' | 'calls'

const KIND_LABEL: Record<string, string> = {
  system: 'system',
  task: 'task',
  memory: 'memory',
  retrieved: 'retrieved',
  observation: 'observation',
  note: 'note',
}

export default function AgentModal({
  profile,
  stepIndex,
  timeLabel,
  playing,
  onClose,
}: {
  profile: AgentProfile
  stepIndex: number
  timeLabel: string
  playing: boolean
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>('prompt')
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const context = profile.context.filter((c) => c.since <= stepIndex)
  const calls = profile.calls.filter((c) => c.since <= stepIndex)
  const totalTokens = context.reduce((n, c) => n + c.tokens, 0)

  return (
    <div className="agm-backdrop" onMouseDown={onClose}>
      <div
        className="agm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${profile.name} inspector`}
        tabIndex={-1}
        ref={dialogRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="agm-head" style={{ ['--agent' as string]: profile.color }}>
          <span className="agm-swatch" />
          <div className="agm-head-text">
            <h4>{profile.name}</h4>
            <p>{profile.role}</p>
          </div>
          <span className={`agm-live ${playing ? 'on' : ''}`}>
            <span className="agm-live-dot" />
            live · t={timeLabel}
          </span>
          <button className="agm-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="agm-tabs" role="tablist">
          {(['prompt', 'context', 'calls'] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`agm-tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
              {t === 'prompt' ? 'Prompt' : t === 'context' ? 'Context' : 'Tool calls'}
              {t === 'context' && <span className="agm-tab-badge">{context.length}</span>}
              {t === 'calls' && calls.length > 0 && <span className="agm-tab-badge">{calls.length}</span>}
            </button>
          ))}
        </div>

        <div className="agm-body">
          {/* ── prompt structure ── */}
          {tab === 'prompt' && (
            <div className="agm-prompt">
              <p className="agm-note">The instructions this agent runs under. Static per role; the live context and tool calls are on the other tabs.</p>
              <div className="agm-sys">
                <span className="agm-sys-tag">system prompt</span>
                {profile.prompt.map((s) => (
                  <div className="agm-section" key={s.label}>
                    <span className="agm-section-label">{s.label}</span>
                    <p>{s.body}</p>
                  </div>
                ))}
              </div>
              <div className="agm-taskmsg">
                <span className="agm-sys-tag task">task message</span>
                <p>{profile.task}</p>
              </div>
            </div>
          )}

          {/* ── live context window ── */}
          {tab === 'context' && (
            <div className="agm-context">
              <div className="agm-context-head">
                <span className="agm-note">The context window as assembled at t={timeLabel}. Blocks append as the run reaches them.</span>
                <span className="agm-tokens">~{totalTokens.toLocaleString()} tokens</span>
              </div>
              {context.length === 0 ? (
                <p className="agm-empty">This agent has not been given any context yet.</p>
              ) : (
                <ol className="agm-ctx-list">
                  {context.map((c) => (
                    <li className={`agm-ctx ${c.kind} ${c.since === stepIndex ? 'fresh' : ''}`} key={c.id}>
                      <div className="agm-ctx-top">
                        <span className={`agm-ctx-kind ${c.kind}`}>{KIND_LABEL[c.kind]}</span>
                        <span className="agm-ctx-label">{c.label}</span>
                        <span className="agm-ctx-tok">{c.tokens.toLocaleString()} tok</span>
                      </div>
                      <p>{c.body}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {/* ── tool-call trace ── */}
          {tab === 'calls' && (
            <div className="agm-calls">
              {profile.calls.length === 0 ? (
                <p className="agm-empty">This agent calls no external tools; it reasons over the other agents’ outputs.</p>
              ) : calls.length === 0 ? (
                <p className="agm-empty">No tool calls yet at t={timeLabel}.</p>
              ) : (
                <ol className="agm-call-list">
                  {calls.map((c) => (
                    <li className={`agm-call ${c.status} ${c.since === stepIndex ? 'fresh' : ''}`} key={c.id}>
                      <div className="agm-call-top">
                        <code className="agm-call-req">{c.call}</code>
                        <span className={`agm-call-status ${c.status}`}>{c.status === 'retry' ? `retry ×${c.retries ?? 1}` : c.status}</span>
                      </div>
                      <div className="agm-call-foot">
                        <span className="agm-call-resp">{c.response}</span>
                        <span className="agm-call-lat">{c.latency}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
