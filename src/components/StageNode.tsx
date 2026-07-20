import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { StageNodeData } from '../data/graph'
import { usePipeline } from '../PipelineContext'
import { stageById } from '../data/stages'
import Icon from './Icon'

/** First node in a column — nothing flows into it from above. */
const COLUMN_HEADS = new Set(['documents', 'user-query', 'triggers'])
/** Last node in a column — nothing flows out of it downward. */
const COLUMN_TAILS = new Set(['final', 'index', 'fallback'])
/** Nodes that receive a cross-lane edge on their left edge. */
const SIDE_TARGETS = new Set(['retrieval', 'loading'])
/** Nodes that emit a cross-lane edge from their right edge. */
const SIDE_SOURCES = new Set(['index', 'triggers'])

const KIND_LABEL: Record<string, string> = {
  sequential: 'step',
  choice: 'choose one',
  optional: 'optional',
  fanout: 'fan-out',
  store: 'index',
  terminal: '',
}

export default function StageNode({ data }: NodeProps<Node<StageNodeData>>) {
  const { stage, variantId, active, done, selected, multiplier } = data
  const { setVariant, playing, focusStage } = usePipeline()

  const variant = stage.variants?.find((v) => v.id === variantId)
  const tagline = variant ? variant.tagline : stage.tagline

  // While the walkthrough runs, everything the query hasn't reached yet recedes.
  const dimmed = playing && !active && !done

  const classes = [
    'node',
    stage.phase,
    // Drives the dashed border on optional/fan-out stages and the store accent.
    stage.kind,
    active && 'is-active',
    selected && 'is-selected',
    dimmed && 'is-dimmed',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      {!COLUMN_HEADS.has(stage.id) && <Handle type="target" position={Position.Top} />}
      {SIDE_TARGETS.has(stage.id) && <Handle type="target" position={Position.Left} id="left" />}

      {multiplier && multiplier > 1 && <div className="multiplier-badge">×{multiplier} parallel</div>}
      {done && !active && <div className="node-check">✓</div>}

      <div className="node-head">
        <span className="node-icon">
          <Icon name={stage.icon} size={22} />
        </span>
        <span className="node-heading">
          <span className="node-title">{stage.label}</span>
          <span className="node-meta">
            {stage.ordinal && <span className="node-ordinal">§{stage.ordinal}</span>}
            {KIND_LABEL[stage.kind] && (
              <span className={`kind-tag ${stage.kind}`}>{KIND_LABEL[stage.kind]}</span>
            )}
          </span>
        </span>
      </div>

      <div className="node-tagline">{tagline}</div>

      {stage.variants && (
        <div className="variant-row">
          {stage.variants.map((v) => (
            <button
              key={v.id}
              className={`variant-chip ${v.id === variantId ? 'on' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setVariant(stage.id, v.id)
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      {stage.governs && (
        <div className="governs-row">
          <span className="governs-label">governs</span>
          {stage.governs.map((id) => (
            <button
              key={id}
              className="governs-chip"
              title={`Go to ${stageById.get(id)?.label ?? id}`}
              onClick={(e) => {
                e.stopPropagation()
                focusStage(id)
              }}
            >
              {stageById.get(id)?.label ?? id}
            </button>
          ))}
        </div>
      )}

      {stage.fanoutInto && (
        <div className="fanout-row">
          {stage.fanoutInto.map((b) => (
            <span key={b} className="branch-chip">
              {b}
            </span>
          ))}
        </div>
      )}

      {!COLUMN_TAILS.has(stage.id) && <Handle type="source" position={Position.Bottom} />}
      {SIDE_SOURCES.has(stage.id) && <Handle type="source" position={Position.Right} id="right" />}
    </div>
  )
}
