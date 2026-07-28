import { useEffect, useRef, useState } from 'react'
import { highlight } from './Code'
import type { Tool, ToolDetail } from '../data/agentic'

/*
 * Tool inspector. Mirrors the agent modal's shell (shared .agm-* styles) but
 * three different tabs: the schema the model sees, the raw Python that
 * implements the tool plus its LangGraph wiring, and a step-filtered call log.
 */

type Tab = 'schema' | 'python' | 'calls'

export default function ToolModal({
  tool,
  detail,
  stepIndex,
  timeLabel,
  playing,
  onClose,
}: {
  tool: Tool
  detail: ToolDetail
  stepIndex: number
  timeLabel: string
  playing: boolean
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>('schema')
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

  const calls = detail.calls.filter((c) => c.since <= stepIndex)

  return (
    <div className="agm-backdrop" onMouseDown={onClose}>
      <div
        className="agm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${tool.label} tool inspector`}
        tabIndex={-1}
        ref={dialogRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="agm-head" style={{ ['--agent' as string]: '#12211a' }}>
          <span className="agm-swatch tool">{'{ }'}</span>
          <div className="agm-head-text">
            <h4>{tool.label}</h4>
            <p>{detail.summary}</p>
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
          {(['schema', 'python', 'calls'] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`agm-tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
              {t === 'schema' ? 'Schema' : t === 'python' ? 'Python' : 'Calls'}
              {t === 'calls' && calls.length > 0 && <span className="agm-tab-badge">{calls.length}</span>}
            </button>
          ))}
        </div>

        <div className="agm-body">
          {/* ── schema the model sees ── */}
          {tab === 'schema' && (
            <div className="agm-schema">
              <p className="agm-note">What the model is shown for this tool. The docstring becomes the description; the type hints become the parameter schema.</p>
              <div className="agm-schema-card">
                <div className="agm-schema-row">
                  <span className="agm-schema-k">name</span>
                  <code>{tool.id}</code>
                </div>
                <div className="agm-schema-row">
                  <span className="agm-schema-k">description</span>
                  <span className="agm-schema-desc">{detail.description}</span>
                </div>
                <div className="agm-schema-params">
                  <span className="agm-schema-k">parameters</span>
                  <ul>
                    {detail.params.map((p) => (
                      <li key={p.name}>
                        <code>{p.name}</code>
                        <span className="agm-schema-type">{p.type}</span>
                        <span className="agm-schema-pdesc">{p.desc}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="agm-schema-row">
                  <span className="agm-schema-k">returns</span>
                  <code>{detail.returns}</code>
                </div>
              </div>
              <div className="agm-schema-meta">
                <span>latency ~{tool.latency}</span>
                <span>cost {'$'.repeat(tool.cost)}</span>
              </div>
            </div>
          )}

          {/* ── implementation + LangGraph wiring ── */}
          {tab === 'python' && (
            <div className="agm-python">
              <p className="agm-note">The tool implementation, then the LangGraph wiring shared by every tool in the registry.</p>
              <pre className="agm-code">
                <code>{highlight(detail.code, 'python')}</code>
              </pre>
            </div>
          )}

          {/* ── call log for this run ── */}
          {tab === 'calls' && (
            <div className="agm-calls">
              {calls.length === 0 ? (
                <p className="agm-empty">No calls to this tool yet at t={timeLabel}.</p>
              ) : (
                <ol className="agm-call-list">
                  {calls.map((c, i) => (
                    <li className={`agm-call ${c.status} ${c.since === stepIndex ? 'fresh' : ''}`} key={i}>
                      <div className="agm-call-top">
                        <code className="agm-call-req">{c.call}</code>
                        <span className={`agm-call-status ${c.status}`}>{c.status === 'retry' ? `retry ×${c.retries ?? 1}` : c.status}</span>
                      </div>
                      <div className="agm-call-foot">
                        <span className="agm-call-resp">
                          <span className="agm-call-agent">{c.agent}</span>
                          {c.response}
                        </span>
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
