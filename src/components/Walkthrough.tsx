import { useEffect, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import { isStep, type Stage, type Track } from '../data/walkthrough'
import type { NotebookCell } from '../data/notebook'
import NotebookModal from './NotebookModal'

/*
 * The shell every method walkthrough shares: stage chips, canvas, caption,
 * a tabbed source card, and a right panel of stepped notes.
 *
 * Only the scene renderer and the stage content differ per track, so a new
 * method is a data file plus a set of scenes rather than a new screen.
 */

export interface WalkthroughProps {
  track: Track
  /** draws the canvas for a given stage key */
  renderScene: (key: string) => ReactNode
  /** optional runnable notebook, keyed by stage */
  notebook?: {
    cells: Record<string, NotebookCell[]>
    repo: string
    total: number
    /** how many stages the kernel spans, for the lede */
    stageCount: number
  }
}

export default function Walkthrough({ track, renderScene, notebook }: WalkthroughProps) {
  const { stages } = track
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [cardTab, setCardTab] = useState(0)
  const [nbOpen, setNbOpen] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  // A track switch remounts this component, but guard anyway: a stale index
  // from a longer track would read past the end of a shorter one.
  const stage: Stage = stages[Math.min(idx, stages.length - 1)]
  const cells = notebook?.cells[stage.key] ?? []

  const indexStages = stages.filter((s) => s.group === 'index')
  const searchStages = stages.filter((s) => s.group === 'search')

  // On mobile the stage bar is a horizontal strip, so autoplay (and any jump
  // to a later stage) would otherwise move the selection off-screen. On
  // desktop the bar wraps instead of scrolling, so this is a no-op.
  useEffect(() => {
    const bar = barRef.current
    const chip = bar?.querySelector<HTMLElement>('.gr-chip.on')
    if (!bar || !chip) return
    // Left-align to match scroll-snap-align: start, so the programmatic
    // scroll and the snap points agree and the chip lands whole.
    bar.scrollTo({ left: Math.max(0, chip.offsetLeft - 2), behavior: 'smooth' })
  }, [idx])

  useEffect(() => {
    setCardTab(0)
    setNbOpen(false)
  }, [idx])

  useEffect(() => {
    if (!playing) return
    const t = window.setTimeout(() => setIdx((i) => (i + 1) % stages.length), 9000)
    return () => clearTimeout(t)
  }, [idx, playing, stages.length])

  const go = (i: number) => {
    setIdx(i)
    setPlaying(false)
  }

  const chipGroup = (list: Stage[], label: string, search: boolean) =>
    list.length > 0 && (
      <div className="gr-group">
        <span className="gr-grouplabel">{label}</span>
        {list.map((s) => (
          <button
            key={s.key}
            className={`gr-chip ${search ? 'search ' : ''}${s.key === stage.key ? 'on' : ''}`}
            onClick={() => go(stages.indexOf(s))}
          >
            {s.chip}
          </button>
        ))}
      </div>
    )

  return (
    <div className="graphrag-view">
      <div className="gr-main">
        <div className="gr-stagebar">
          <button className="gr-play" onClick={() => setPlaying((p) => !p)} title={playing ? 'Pause' : 'Play'}>
            {playing ? '❚❚' : '▶'}
          </button>
          {/* Each group is its own nowrap row, so the bar breaks between
              Indexing and Search rather than through the middle of one. */}
          <div className="gr-groups" ref={barRef}>
            {chipGroup(indexStages, 'Indexing', false)}
            {chipGroup(searchStages, 'Search', true)}
          </div>
        </div>

        <div className="gr-canvas">{renderScene(stage.key)}</div>
        <p className="gr-swipe">Swipe the diagram sideways to see all of it</p>

        <div className="gr-caption">{stage.caption}</div>

        {stage.cards && (
          <div className="gr-card">
            <div className="gr-card-head">
              {stage.cards.map((c, i) => (
                <button key={c.label} className={`gr-card-tab ${i === cardTab ? 'on' : ''}`} onClick={() => setCardTab(i)}>
                  {c.label}
                </button>
              ))}
              <span className="gr-card-hint">{stage.cards[cardTab]?.hint}</span>
            </div>
            <pre className="gr-card-body">{stage.cards[cardTab]?.body}</pre>
          </div>
        )}
      </div>

      <aside className="gr-panel">
        <div className="gr-panel-head">
          <span className={`gr-badge ${stage.group}`}>{stage.group === 'index' ? 'Indexing · offline' : 'Query time'}</span>
          <h3>{stage.title}</h3>
        </div>
        <div className="gr-panel-body">
          {stage.panel.map((p, i) =>
            isStep(p) ? (
              <div className={`gr-step ${stage.group === 'search' ? 'search' : ''}`} key={i}>
                <span className="gr-step-n">{p.step}</span>
                <div className="gr-step-text">
                  <h4>{p.title}</h4>
                  <div className="markdown-content">
                    <ReactMarkdown>{p.body}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ) : (
              <div className="markdown-content gr-para" key={i}>
                <ReactMarkdown>{p}</ReactMarkdown>
              </div>
            ),
          )}

          {notebook && cells.length > 0 && (
            <section className="gr-nb">
              <button className="gr-nb-open" onClick={() => setNbOpen(true)}>
                <span className="gr-nb-open-icon">{'{ }'}</span>
                <span className="gr-nb-open-text">
                  <strong>Open the notebook</strong>
                  <em>
                    {cells.length === 1 ? `Cell ${cells[0].n}` : `Cells ${cells[0].n}–${cells[cells.length - 1].n}`} of{' '}
                    {notebook.total}, runnable, with the captured output
                  </em>
                </span>
                <span className="gr-nb-open-arrow">↗</span>
              </button>
              <p className="gr-nb-lede">
                One kernel running top to bottom across all {notebook.stageCount} stages, from {notebook.repo}.
              </p>
            </section>
          )}

          <p className="gr-source">
            Source ·{' '}
            <a href={track.source.url} target="_blank" rel="noreferrer">
              {track.source.name}
            </a>
          </p>

          <div className="gr-nav">
            <button disabled={idx === 0} onClick={() => go(idx - 1)}>
              ‹ Prev
            </button>
            <span>
              {idx + 1} / {stages.length}
            </span>
            <button disabled={idx === stages.length - 1} onClick={() => go(idx + 1)}>
              Next ›
            </button>
          </div>
        </div>
      </aside>

      {nbOpen && cells.length > 0 && (
        <NotebookModal cells={cells} stageTitle={stage.title} onClose={() => setNbOpen(false)} />
      )}
    </div>
  )
}
