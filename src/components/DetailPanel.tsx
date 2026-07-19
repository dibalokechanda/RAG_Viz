import type { Example, Stage, Tradeoffs, TraceFrame } from '../data/types'
import { usePipeline } from '../PipelineContext'
import MathBlockView from './Math'
import FigureView from './Figure'
import Section from './Section'
import Icon from './Icon'

function ExampleBlock({ example }: { example: Example }) {
  const cls = `example-text${example.mono ? ' mono' : ''}`
  return (
    <div className="example">
      <div className="example-half">
        {example.beforeLabel && <div className="example-label">{example.beforeLabel}</div>}
        <div className={cls}>{example.before}</div>
      </div>
      <div className="arrow-sep">↓</div>
      <div className="example-half">
        {example.afterLabel && <div className="example-label">{example.afterLabel}</div>}
        <div className={cls}>{example.after}</div>
      </div>
    </div>
  )
}

function TradeoffBlock({ tradeoffs }: { tradeoffs: Tradeoffs }) {
  return (
    <div className="tradeoffs">
      <div className="tradeoff-col gain">
        <h4>Buys you</h4>
        <ul>
          {tradeoffs.gains.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </div>
      <div className="tradeoff-col cost">
        <h4>Costs you</h4>
        <ul>
          {tradeoffs.costs.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function TraceBlock({ trace, step, total }: { trace: TraceFrame; step: number; total: number }) {
  return (
    <div className="trace-card">
      <div className="trace-head">
        <b>{trace.headline}</b>
        <span className="trace-step">
          {step} / {total}
        </span>
      </div>
      <div className="trace-payload">{trace.payload}</div>
      {trace.note && <div className="trace-note">{trace.note}</div>}
    </div>
  )
}

interface Props {
  stage: Stage | null
  variantId?: string
  /** Live trace frame, when the walkthrough is sitting on this stage. */
  trace?: { frame: TraceFrame; step: number; total: number } | null
  onOpenMap: () => void
}

export default function DetailPanel({ stage, variantId, trace, onOpenMap }: Props) {
  const { setVariant } = usePipeline()

  if (!stage) {
    return (
      <aside className="detail is-empty">
        <div className="empty-detail">
          <div className="big">
            <Icon name="search" size={30} />
          </div>
          <p>
            Select any stage to read what it does, why it exists, and what it costs.
            <br />
            <br />
            Or press <b>Play</b> to watch a single query travel the whole pipeline.
          </p>
        </div>
      </aside>
    )
  }

  const variant = stage.variants?.find((v) => v.id === variantId)

  // Sections are numbered in the order they appear, skipping any that are
  // empty for this stage — so the numbering is always contiguous.
  let n = 0
  const next = () => ++n

  return (
    <aside className="detail">
      <div className="detail-head">
        <div className="detail-eyebrow">
          <span className="detail-icon">
            <Icon name={stage.icon} size={20} />
          </span>
          <span className={`phase ${stage.phase}`}>{stage.phase}</span>
          {stage.ordinal && <span className="detail-ord">§{stage.ordinal}</span>}
        </div>
        <h3>{stage.label}</h3>
        <div className="detail-tagline">{stage.tagline}</div>
        {stage.concepts && stage.concepts.length > 0 && (
          <button className="map-btn" onClick={onOpenMap}>
            <span className="map-btn-glyph">
              <Icon name="graph" size={17} />
            </span>
            Explore the concept map
            <span className="map-btn-count">{stage.concepts.length}</span>
          </button>
        )}
      </div>

      <div className="detail-body">
        {trace && <TraceBlock trace={trace.frame} step={trace.step} total={trace.total} />}

        <Section index={next()} title="Overview" defaultOpen>
          {stage.detail.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </Section>

        {stage.figures && (
          <Section index={next()} title="Illustrated" count={stage.figures.length} defaultOpen>
            {stage.figures.map((f, i) => (
              <FigureView figure={f} key={i} />
            ))}
          </Section>
        )}

        {stage.math && (
          <Section index={next()} title="The maths" count={stage.math.length}>
            {stage.math.map((m, i) => (
              <MathBlockView block={m} key={i} />
            ))}
          </Section>
        )}

        {stage.example && (
          <Section index={next()} title="Example">
            <ExampleBlock example={stage.example} />
          </Section>
        )}

        {stage.variants && (
          <Section
            index={next()}
            title={stage.kind === 'store' ? 'Index types' : 'Variants — pick one'}
            count={stage.variants.length}
          >
            {stage.variants.map((v) => (
              <div
                key={v.id}
                className={`variant-detail ${v.id === variantId ? 'on' : ''}`}
                onClick={() => setVariant(stage.id, v.id)}
              >
                <div className="variant-detail-head">
                  <b>{v.label}</b>
                  {v.id === variantId && <span className="active-dot">ACTIVE</span>}
                </div>
                <p>{v.detail}</p>
              </div>
            ))}
          </Section>
        )}

        {/* Everything specific to the selected variant lives in one section
            rather than fragmenting into four near-empty ones. */}
        {variant && (variant.figures || variant.example || variant.math || variant.tradeoffs) && (
          <Section index={next()} title={`In depth — ${variant.label}`}>
            {variant.figures?.map((f, i) => (
              <FigureView figure={f} key={i} />
            ))}

            {variant.example && (
              <>
                <div className="sub-label">Example</div>
                <ExampleBlock example={variant.example} />
              </>
            )}

            {variant.math && (
              <>
                <div className="sub-label">The maths</div>
                {variant.math.map((m, i) => (
                  <MathBlockView block={m} key={i} />
                ))}
              </>
            )}

            {variant.tradeoffs && (
              <>
                <div className="sub-label">Trade-offs</div>
                <TradeoffBlock tradeoffs={variant.tradeoffs} />
              </>
            )}
          </Section>
        )}

        {stage.tradeoffs && (
          <Section index={next()} title="Trade-offs">
            <TradeoffBlock tradeoffs={stage.tradeoffs} />
          </Section>
        )}

        {stage.distinctions && (
          <Section
            index={next()}
            title="Commonly conflated"
            count={stage.distinctions.length}
            defaultOpen
          >
            {stage.distinctions.map((d) => (
              <div className="distinction" key={d.title}>
                <h4>{d.title}</h4>
                <p>{d.body}</p>
              </div>
            ))}
          </Section>
        )}
      </div>
    </aside>
  )
}
