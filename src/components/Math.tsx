import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import type { MathBlock } from '../data/types'

/** A single KaTeX expression rendered in display mode. */
export function Tex({ tex, inline = false }: { tex: string; inline?: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { displayMode: !inline, throwOnError: false, output: 'html' })
    } catch {
      // Never let a malformed expression take the panel down — show the source.
      return `<code>${tex.replace(/</g, '&lt;')}</code>`
    }
  }, [tex, inline])

  return <span className={inline ? 'tex-inline' : 'tex-display'} dangerouslySetInnerHTML={{ __html: html }} />
}

export default function MathBlockView({ block }: { block: MathBlock }) {
  return (
    <div className="mathblock">
      {block.title && <div className="mathblock-title">{block.title}</div>}

      <Tex tex={block.tex} />

      {block.where && (
        <dl className="where">
          {block.where.map((w) => (
            <div className="where-row" key={w.sym}>
              <dt>
                <Tex tex={w.sym} inline />
              </dt>
              <dd>{w.means}</dd>
            </div>
          ))}
        </dl>
      )}

      {block.worked && (
        <div className="worked">
          {block.worked.map((w, i) => (
            <div className="worked-row" key={i}>
              <Tex tex={w.tex} />
              {w.caption && <div className="worked-caption">{w.caption}</div>}
            </div>
          ))}
        </div>
      )}

      {block.note && <div className="mathblock-note">{block.note}</div>}
    </div>
  )
}
