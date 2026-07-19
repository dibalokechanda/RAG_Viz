import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { StageNodeData } from '../data/graph'
import { usePipeline } from '../PipelineContext'
import Icon from './Icon'

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
  const { setVariant, playing } = usePipeline()

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
      {stage.id !== 'documents' && stage.id !== 'user-query' && (
        <Handle type="target" position={Position.Top} />
      )}
      {stage.id === 'retrieval' && <Handle type="target" position={Position.Left} id="left" />}

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

      {stage.fanoutInto && (
        <div className="fanout-row">
          {stage.fanoutInto.map((b) => (
            <span key={b} className="branch-chip">
              {b}
            </span>
          ))}
        </div>
      )}

      {stage.id !== 'final' && stage.id !== 'index' && (
        <Handle type="source" position={Position.Bottom} />
      )}
      {stage.id === 'index' && <Handle type="source" position={Position.Right} id="right" />}
    </div>
  )
}
