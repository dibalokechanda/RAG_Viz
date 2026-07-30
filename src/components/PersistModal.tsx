import { useEffect, useRef, useState } from 'react'
import {
  CHECKPOINT_WRITES,
  STATE_EVIDENCE,
  STATE_MESSAGES,
  STATE_PLAN,
  STEPS,
  STORE_NAMESPACES,
  memoryOps,
  storeItems,
} from '../data/agentic'

/*
 * Inspector for the persistence layer, opened from the graph view's state and
 * store panels. Reuses the .agm-* modal shell (with a higher z-index so it
 * sits above the graph overlay). Everything is filtered by the current step,
 * so the checkpointed channels and the store fill in as the run proceeds.
 *
 * State tabs: the channel values (messages / plan / evidence) and the
 * checkpoint history. Store tabs: the namespaced items and the access log.
 */

type Kind = 'state' | 'store'

const superStep = (i: number) => (i <= 2 ? 1 : i <= 7 ? 2 : i <= 11 ? 3 : i === 12 ? 4 : i <= 14 ? 5 : 6)

export default function PersistModal({
  kind,
  stepIndex,
  timeLabel,
  playing,
  onClose,
}: {
  kind: Kind
  stepIndex: number
  timeLabel: string
  playing: boolean
  onClose: () => void
}) {
  const stateTabs = ['channels', 'checkpoints'] as const
  const storeTabs = ['items', 'access'] as const
  const [tab, setTab] = useState<string>(kind === 'state' ? 'channels' : 'items')
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    dialogRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const messages = STATE_MESSAGES.filter((m) => m.since <= stepIndex)
  const evidence = STATE_EVIDENCE.filter((e) => e.since <= stepIndex)
  const cps = superStep(stepIndex)
  const items = storeItems(stepIndex)
  const accessLog = memoryOps(stepIndex).filter((o) => o.type === 'long' && o.step <= stepIndex)

  const accent = kind === 'state' ? '#2f6f4e' : '#41708c'
  const tabs = kind === 'state' ? stateTabs : storeTabs
  const tabLabel = (t: string) =>
    ({ channels: 'Channels', checkpoints: 'Checkpoints', items: 'Items', access: 'Access log' })[t] ?? t

  return (
    <div className="agm-backdrop psm-over" onMouseDown={onClose}>
      <div className="agm-dialog" role="dialog" aria-modal="true" aria-label={`${kind} inspector`} tabIndex={-1} ref={dialogRef} onMouseDown={(e) => e.stopPropagation()}>
        <header className="agm-head" style={{ ['--agent' as string]: accent }}>
          <span className="agm-swatch" />
          <div className="agm-head-text">
            <h4>{kind === 'state' ? 'State channel' : 'Long-term store'}</h4>
            <p>{kind === 'state' ? 'MessagesState · checkpointed per super-step' : 'BaseStore · cross-thread, namespaced'}</p>
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
          {tabs.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`agm-tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
              {tabLabel(t)}
              {t === 'channels' && <span className="agm-tab-badge">{messages.length}</span>}
              {t === 'checkpoints' && <span className="agm-tab-badge">{cps}</span>}
              {t === 'access' && accessLog.length > 0 && <span className="agm-tab-badge">{accessLog.length}</span>}
            </button>
          ))}
        </div>

        <div className="agm-body">
          {/* ── state · channels ── */}
          {tab === 'channels' && (
            <div>
              <p className="agm-note">The channel values held in this checkpoint at t={timeLabel}. Each node returns a partial update; the reducer decides how it merges.</p>

              <div className="psm-channel">
                <div className="psm-channel-h">
                  <span className="psm-ch-name">messages</span>
                  <span className="psm-ch-red">reducer · add_messages (append)</span>
                  <span className="psm-ch-count">{messages.length}</span>
                </div>
                <ol className="psm-msgs">
                  {messages.map((m, i) => (
                    <li key={i} className={`psm-msg ${m.since === stepIndex ? 'fresh' : ''}`}>
                      <span className={`psm-role ${m.role}`}>{m.role}</span>
                      {m.name && <span className="psm-msg-name">{m.name}</span>}
                      <span className="psm-msg-body">{m.content}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="psm-channel">
                <div className="psm-channel-h">
                  <span className="psm-ch-name">plan</span>
                  <span className="psm-ch-red">reducer · last write wins</span>
                </div>
                <p className="psm-plain">{stepIndex >= 2 ? STATE_PLAN : <span className="psm-null">— not set yet</span>}</p>
              </div>

              <div className="psm-channel">
                <div className="psm-channel-h">
                  <span className="psm-ch-name">evidence</span>
                  <span className="psm-ch-red">reducer · merge (extend)</span>
                  <span className="psm-ch-count">{evidence.length}</span>
                </div>
                {evidence.length === 0 ? (
                  <p className="psm-plain psm-null">— empty until workers report</p>
                ) : (
                  <ul className="psm-evidence">
                    {evidence.map((e, i) => (
                      <li key={i} className={e.since === stepIndex ? 'fresh' : ''}>
                        <span className="psm-ev-from">{e.from}</span>
                        {e.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* ── state · checkpoints ── */}
          {tab === 'checkpoints' && (
            <div>
              <p className="agm-note">The checkpointer snapshots the channels after every super-step, keyed by a thread_id. This run has committed {cps} of 6.</p>
              <div className="psm-thread">thread_id · a1f0-nvda-cerebras · checkpointer · InMemorySaver</div>
              <ol className="psm-cps">
                {Array.from({ length: cps }).map((_, i) => {
                  const s = cps - 1 - i // newest first
                  return (
                    <li key={s} className={`psm-cp ${s === cps - 1 ? 'latest' : ''}`}>
                      <div className="psm-cp-top">
                        <span className="psm-cp-id">ckpt_{String(s + 1).padStart(2, '0')}·{(0x1ef8a20 + s * 7).toString(16)}</span>
                        <span className="psm-cp-ss">super-step {s + 1}</span>
                      </div>
                      <span className="psm-cp-wrote">{CHECKPOINT_WRITES[s]}</span>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}

          {/* ── store · items ── */}
          {tab === 'items' && (
            <div>
              <p className="agm-note">What is actually persisted long-term, by namespace. Nodes reach it with <code>store.get(ns, key)</code> and <code>store.put(ns, key, value)</code>; it survives across threads.</p>
              {STORE_NAMESPACES.map((ns) => (
                <div className="psm-ns" key={ns}>
                  <div className="psm-ns-h">
                    <span className="psm-ns-name">{ns}</span>
                    <span className="psm-ns-count">{items[ns].length} item{items[ns].length === 1 ? '' : 's'}</span>
                  </div>
                  {items[ns].length === 0 ? (
                    <p className="psm-plain psm-null">— empty (written later in the run)</p>
                  ) : (
                    items[ns].map((it) => (
                      <div className={`psm-item ${it.since === stepIndex ? 'fresh' : ''}`} key={it.key}>
                        <div className="psm-item-top">
                          <code className="psm-item-key">{it.key}</code>
                          <span className="psm-item-meta">{it.source === 'persisted' ? 'pre-existing' : `written t=${STEPS[it.since].t} · ${it.source}`}</span>
                        </div>
                        <p className="psm-item-val">{it.value}</p>
                        {it.reads.length > 0 && <span className="psm-item-reads">read by {it.reads.map((r) => r.agent).join(', ')}</span>}
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── store · access log ── */}
          {tab === 'access' && (
            <div>
              <p className="agm-note">Every long-term read and write so far, in order. The store is read far more than it is written.</p>
              {accessLog.length === 0 ? (
                <p className="agm-empty">No store access yet at t={timeLabel}.</p>
              ) : (
                <ol className="psm-access">
                  {accessLog.map((o, i) => (
                    <li key={i} className={`psm-acc ${o.op} ${o.step === stepIndex ? 'fresh' : ''}`}>
                      <span className="psm-acc-t">t={o.t}</span>
                      <span className={`psm-acc-op ${o.op}`}>{o.op}</span>
                      <span className="psm-acc-label">{o.label}</span>
                      <span className="psm-acc-agent">{o.op === 'read' ? `→ ${o.agent}` : o.agent}</span>
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
