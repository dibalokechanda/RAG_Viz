import { useCallback, useMemo, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import type { Concept, Stage, StackItem } from '../data/types'
import MathBlockView from './Math'
import FigureView from './Figure'
import Icon, { type IconName } from './Icon'
import ReactMarkdown from 'react-markdown'

/*
 * Radial layout, sized from the cards rather than from magic angles.
 *
 * The previous version used a fixed angular spread for children, which at the
 * child radius gave less arc than a card is wide — so any parent with two
 * children produced overlapping cards. Every separation here is derived from
 * CARD_W instead, so it holds for any number of concepts.
 */
const CARD_W = 264
const CARD_H = 112
const ROOT_W = 300
const ROOT_H = 132
/** Minimum clear space between two cards, measured along the arc. */
const ARC_GAP = 30
const PITCH = CARD_W + ARC_GAP

const R1_MIN = 400
const R2_MIN = 330
/** Fraction of a parent's angular slot its children may occupy. */
const SLOT_USE = 0.8

const KIND_ICON: Record<Concept['kind'], IconName> = {
  idea: 'bulb',
  formula: 'fx',
  method: 'steps',
  metric: 'chart',
  pitfall: 'warning',
  tradeoff: 'scale',
}

interface ConceptNodeData extends Record<string, unknown> {
  concept: Concept
  expanded: boolean
  selected: boolean
  hasChildren: boolean
}

interface RootNodeData extends Record<string, unknown> {
  stage: Stage
}

function RootNode({ data }: NodeProps<Node<RootNodeData, 'root'>>) {
  return (
    <div className="cm-root">
      <Handle type="source" position={Position.Top} style={{ opacity: 0 }} />
      <div className="cm-root-eyebrow">{data.stage.phase}</div>
      <div className="cm-root-title">{data.stage.label}</div>
      <div className="cm-root-sub">{data.stage.tagline}</div>
    </div>
  )
}

function ConceptNode({ data }: NodeProps<Node<ConceptNodeData, 'concept'>>) {
  const { concept, expanded, selected, hasChildren } = data
  return (
    <div
      className={`cm-node k-${concept.kind} ${selected ? 'is-selected' : ''} ${expanded ? 'is-expanded' : ''}`}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <div className="cm-node-head">
        <span className="cm-glyph">
          <Icon name={KIND_ICON[concept.kind]} size={16} />
        </span>
        <span className="cm-node-title">{concept.label}</span>
        {hasChildren && <span className="cm-expand">{expanded ? '−' : '+'}</span>}
      </div>
      <div className="cm-node-sum">{concept.summary}</div>
    </div>
  )
}

const nodeTypes = { root: RootNode, concept: ConceptNode }

type CmNode = Node<RootNodeData, 'root'> | Node<ConceptNodeData, 'concept'>

function buildConceptGraph(
  stage: Stage,
  expanded: Set<string>,
  selectedId: string | null,
): { nodes: CmNode[]; edges: Edge[] } {
  const nodes: CmNode[] = [
    { id: `root-${stage.id}`, type: 'root', position: { x: -ROOT_W / 2, y: -ROOT_H / 2 }, data: { stage } },
  ]
  const edges: Edge[] = []

  const roots = stage.concepts ?? []
  const n = roots.length

  // Grow the ring until every root card has a full card-width of arc to itself.
  const R1 = Math.max(R1_MIN, (n * PITCH) / (2 * Math.PI))
  /** Angular slot belonging to one root, including its children. */
  const slot = ((2 * Math.PI) / n) * SLOT_USE

  roots.forEach((c, i) => {
    // Start at the top and go clockwise, so reading order matches the eye's.
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2
    nodes.push({
      id: c.id,
      type: 'concept',
      position: { x: Math.cos(angle) * R1 - CARD_W / 2, y: Math.sin(angle) * R1 - CARD_H / 2 },
      data: {
        concept: c,
        expanded: expanded.has(c.id),
        selected: selectedId === c.id,
        hasChildren: Boolean(c.children?.length),
      },
    })
    edges.push({
      id: `root-${stage.id}->${c.id}`,
      source: `root-${stage.id}`,
      target: c.id,
      type: 'straight',
      className: 'cm-edge',
    })

    if (expanded.has(c.id) && c.children?.length) {
      const m = c.children.length
      // Push the child ring out far enough that m cards fit side by side inside
      // the parent's slot without touching — and without straying into the
      // neighbouring parent's slot.
      const childR = Math.max(R1 + R2_MIN, ((m - 1) * PITCH) / slot)
      const sep = PITCH / childR

      c.children.forEach((ch, j) => {
        // Fan the children outward along the parent's own bearing.
        const a = angle + (j - (m - 1) / 2) * sep
        nodes.push({
          id: ch.id,
          type: 'concept',
          position: { x: Math.cos(a) * childR - CARD_W / 2, y: Math.sin(a) * childR - CARD_H / 2 },
          data: {
            concept: ch,
            expanded: expanded.has(ch.id),
            selected: selectedId === ch.id,
            hasChildren: Boolean(ch.children?.length),
          },
        })
        edges.push({
          id: `${c.id}->${ch.id}`,
          source: c.id,
          target: ch.id,
          type: 'straight',
          className: 'cm-edge cm-edge-child',
        })
      })
    }
  })

  return { nodes, edges }
}

function ConceptDetail({ concept }: { concept: Concept | null }) {
  if (!concept) {
    return (
      <div className="cm-detail cm-detail-empty">
        {/* Single child: the container centres with grid, so sibling text runs
            would each become their own grid item and stack apart. */}
        <p>
          Click a concept to read it. Nodes marked <b>+</b> expand into sub-concepts.
        </p>
      </div>
    )
  }
  return (
    <div className="cm-detail">
      <div className={`cm-detail-kind k-${concept.kind}`}>
        <Icon name={KIND_ICON[concept.kind]} size={15} />
        {concept.kind}
      </div>
      <h3>{concept.label}</h3>
      <div className="cm-detail-sum">{concept.summary}</div>

      {concept.detail && concept.detail.length > 0 && (
        <div className="markdown-content">
          <ReactMarkdown>{concept.detail.join('\n\n')}</ReactMarkdown>
        </div>
      )}

      {concept.stack && concept.stack.length > 0 && (
        <div className="tradeoffs" style={{ marginTop: 14 }}>
          <div className="sub-label" style={{ marginBottom: 8 }}>Tech stack</div>
          <div className="stack-list">
            {concept.stack.map((s: StackItem) => (
              <a
                key={s.name}
                className="stack-item"
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <b>{s.name}</b>
                <span>{s.what}</span>
                {s.url && <span className="stack-arrow">↗</span>}
              </a>
            ))}
          </div>
        </div>
      )}

      {concept.figures?.map((f, i) => (
        <FigureView figure={f} key={i} />
      ))}

      {concept.math?.map((m, i) => (
        <MathBlockView block={m} key={i} />
      ))}

      {concept.example && (
        <div className="example" style={{ marginTop: 14 }}>
          <div className="example-half">
            {concept.example.beforeLabel && <div className="example-label">{concept.example.beforeLabel}</div>}
            <div className={`example-text${concept.example.mono ? ' mono' : ''}`}>{concept.example.before}</div>
          </div>
          <div className="arrow-sep">↓</div>
          <div className="example-half">
            {concept.example.afterLabel && <div className="example-label">{concept.example.afterLabel}</div>}
            <div className={`example-text${concept.example.mono ? ' mono' : ''}`}>{concept.example.after}</div>
          </div>
        </div>
      )}

      {concept.tradeoffs && (
        <div className="tradeoffs" style={{ marginTop: 14 }}>
          <div className="tradeoff-col gain">
            <h4>Buys you</h4>
            <ul>
              {concept.tradeoffs.gains.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
          <div className="tradeoff-col cost">
            <h4>Costs you</h4>
            <ul>
              {concept.tradeoffs.costs.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

function Inner({ stage, onClose }: { stage: Stage; onClose: () => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { nodes, edges } = useMemo(
    () => buildConceptGraph(stage, expanded, selectedId),
    [stage, expanded, selectedId],
  )

  const flatConcepts = useMemo(() => {
    const out = new Map<string, Concept>()
    const walk = (cs?: Concept[]) => cs?.forEach((c) => (out.set(c.id, c), walk(c.children)))
    walk(stage.concepts)
    return out
  }, [stage])

  const onNodeClick = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      if (node.type === 'root') {
        setSelectedId(null)
        return
      }
      setSelectedId(node.id)
      const c = flatConcepts.get(node.id)
      if (c?.children?.length) {
        setExpanded((prev) => {
          const next = new Set(prev)
          if (next.has(node.id)) next.delete(node.id)
          else next.add(node.id)
          return next
        })
      }
    },
    [flatConcepts],
  )

  return (
    <div className="cm-overlay" onClick={onClose}>
      <div className="cm-shell" onClick={(e) => e.stopPropagation()}>
        <div className="cm-bar">
          <span className="cm-bar-title">Concept map · {stage.label}</span>
          <span className="cm-bar-hint">Click to read · + to expand</span>
          <button className="cm-close" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </div>

        <div className="cm-body">
          <div className="cm-canvas">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodeClick={onNodeClick}
              fitView
              fitViewOptions={{ padding: 0.22 }}
              minZoom={0.2}
              maxZoom={1.5}
              nodesDraggable={false}
              nodesConnectable={false}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--bg-grid)" />
            </ReactFlow>
          </div>
          <ConceptDetail concept={selectedId ? (flatConcepts.get(selectedId) ?? null) : null} />
        </div>
      </div>
    </div>
  )
}

export default function ConceptMap({ stage, onClose }: { stage: Stage; onClose: () => void }) {
  return (
    <ReactFlowProvider>
      <Inner stage={stage} onClose={onClose} />
    </ReactFlowProvider>
  )
}
