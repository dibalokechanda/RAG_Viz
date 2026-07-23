import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { highlight } from './Code'
import { NOTEBOOK_REPO, NOTEBOOK_TOTAL, type NotebookCell } from '../data/notebook'

/*
 * The notebook overlay. The cells are a slice of one continuous session, so
 * "running" a cell also runs everything before it in this stage: that keeps the
 * displayed kernel state honest without forcing the reader to click in order.
 * Execution is simulated against the captured output; nothing is evaluated.
 */

type CellState = 'idle' | 'running' | 'done'

const RUN_MS = 520

export default function NotebookModal({
  cells,
  stageTitle,
  onClose,
}: {
  cells: NotebookCell[]
  stageTitle: string
  onClose: () => void
}) {
  const [state, setState] = useState<Record<number, CellState>>({})
  const timers = useRef<number[]>([])
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      timers.current.forEach(clearTimeout)
    }
  }, [onClose])

  /* run every cell up to and including `n`, staggered so the order is visible */
  const runThrough = useCallback(
    (n: number) => {
      const pending = cells.filter((c) => c.n <= n && state[c.n] !== 'done')
      pending.forEach((c, i) => {
        setState((s) => ({ ...s, [c.n]: 'running' }))
        timers.current.push(
          window.setTimeout(() => setState((s) => ({ ...s, [c.n]: 'done' })), RUN_MS * (i + 1)),
        )
      })
    },
    [cells, state],
  )

  const runAll = () => runThrough(cells[cells.length - 1].n)
  const reset = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setState({})
  }

  const allDone = cells.every((c) => state[c.n] === 'done')
  const range =
    cells.length === 1 ? `cell ${cells[0].n}` : `cells ${cells[0].n}–${cells[cells.length - 1].n}`

  return (
    <div className="nbm-backdrop" onMouseDown={onClose}>
      <div
        className="nbm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Notebook, ${stageTitle}`}
        tabIndex={-1}
        ref={dialogRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="nbm-head">
          <div className="nbm-head-text">
            <h4>{stageTitle}</h4>
            <p>
              {range} of {NOTEBOOK_TOTAL} in one continuous kernel · <span className="nbm-repo">{NOTEBOOK_REPO}</span>
            </p>
          </div>
          <button className="nbm-run-all" onClick={allDone ? reset : runAll}>
            {allDone ? 'Reset' : `Run ${cells.length > 1 ? 'all' : 'cell'}`}
          </button>
          <button className="nbm-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="nbm-body">
          {cells.map((c) => {
            const st = state[c.n] ?? 'idle'
            return (
              <article className={`nbm-cell ${st}`} key={c.n}>
                <div className="nbm-cell-bar">
                  <span className="nbm-in">In [{st === 'done' ? c.n : ' '}]:</span>
                  {c.needs && (
                    <span className="nbm-needs">
                      needs <code>{c.needs}</code>
                    </span>
                  )}
                  <button className="nbm-run" onClick={() => runThrough(c.n)} disabled={st !== 'idle'}>
                    {st === 'idle' ? '▶ Run' : st === 'running' ? 'Running…' : '✓ Ran'}
                  </button>
                </div>

                <pre className="nbm-code">
                  <code>{highlight(c.code, 'python')}</code>
                </pre>

                {st === 'running' && (
                  <div className="nbm-busy">
                    <span className="nbm-dot" />
                    <span className="nbm-dot" />
                    <span className="nbm-dot" />
                    executing
                  </div>
                )}

                {st === 'done' && (
                  <div className="nbm-result">
                    <div className="nbm-outcol">
                      <span className="nbm-outlabel">{c.out !== undefined ? `Out[${c.n}]:` : 'no output'}</span>
                      {c.out !== undefined ? (
                        <pre className="nbm-out">{c.out}</pre>
                      ) : (
                        <div className="nbm-noout markdown-content">
                          <ReactMarkdown>{c.note ?? ''}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                    <aside className="nbm-explain">
                      <span className="nbm-explain-eyebrow">What this shows</span>
                      <div className="markdown-content">
                        <ReactMarkdown>{c.explain}</ReactMarkdown>
                      </div>
                    </aside>
                  </div>
                )}
              </article>
            )
          })}

          <p className="nbm-foot">
            Code and captured output are taken from {NOTEBOOK_REPO}. Long outputs are abridged, marked with a trailing
            ellipsis. Running here replays the captured result; no Python is evaluated in the browser.
          </p>
        </div>
      </div>
    </div>
  )
}
