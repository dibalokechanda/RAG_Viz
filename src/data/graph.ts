import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { Phase, PipelineConfig, Stage } from './types'
import { offlineStages, onlineStages } from './stages'

export interface LaneNodeData extends Record<string, unknown> {
  title: string
  subtitle: string
  phase: Phase
}

export type FlowNode = Node<StageNodeData, 'stage'> | Node<LaneNodeData, 'lane'>

export interface StageNodeData extends Record<string, unknown> {
  stage: Stage
  /** Selected variant id, for `choice` stages. */
  variantId?: string
  /** Highlighted because the animation is currently here. */
  active: boolean
  /** Already visited by the animation. */
  done: boolean
  /** Open in the detail panel. */
  selected: boolean
  /** Parallel branch count, when a fan-out is upstream. */
  multiplier?: number
}

/**
 * Three columns. The online path is split in two at `retrieval` — as one
 * column it is over twenty nodes tall, which forces the whole map down to an
 * unreadable zoom just to fit on screen.
 */
const COL_OFFLINE_X = 0
const COL_QUERY_X = 860
const COL_RETRIEVAL_X = 1720
const COL_ANSWER_X = 2580
const GAP = 52
/** Where the online path breaks into further columns. */
const SPLIT_RETRIEVAL = 'retrieval'
const SPLIT_ANSWER = 'prompt'

/** Approximate rendered height per node kind, used for vertical packing. */
function heightOf(stage: Stage): number {
  switch (stage.kind) {
    case 'terminal':
      return 120
    case 'choice':
      return 204
    case 'store':
      return 152
    case 'fanout':
      return 196
    default:
      return 144
  }
}

/** Which online stages are present under this configuration. */
export function activeOnlineStages(config: PipelineConfig): Stage[] {
  const fanoutActive = config.multiQuery || config.decomposition
  return onlineStages.filter((stage) => {
    switch (stage.id) {
      case 'multi-query':
        return config.multiQuery
      case 'decomposition':
        return config.decomposition
      case 'hyde':
        return config.hyde
      case 'rrf':
        return config.retrieval === 'hybrid'
      case 'merge':
        return fanoutActive
      case 'dedup':
        return config.dedup
      case 'rerank':
        return config.rerank
      case 'retrieval-metrics':
        return config.retrievalMetrics
      case 'evaluation':
        return config.evaluation
      default:
        return true
    }
  })
}

export function variantFor(stage: Stage, config: PipelineConfig): string | undefined {
  if (stage.kind !== 'choice' && stage.kind !== 'store') return undefined
  switch (stage.id) {
    case 'chunking':
      return config.chunking
    case 'index-structure':
      return config.indexStructure
    case 'compression':
      return config.compression
    case 'retrieval':
      return config.retrieval
    case 'generation':
      return config.decoding
    default:
      return stage.variants?.[0]?.id
  }
}

/** Maps a `choice` stage back onto the config key it drives. */
export const STAGE_CONFIG_KEY: Record<string, keyof PipelineConfig> = {
  chunking: 'chunking',
  'index-structure': 'indexStructure',
  compression: 'compression',
  retrieval: 'retrieval',
  generation: 'decoding',
}

export interface BuildArgs {
  config: PipelineConfig
  activeStageId: string | null
  visitedIds: Set<string>
  selectedId: string | null
}

export function buildGraph({ config, activeStageId, visitedIds, selectedId }: BuildArgs): {
  nodes: FlowNode[]
  edges: Edge[]
} {
  const online = activeOnlineStages(config)
  const offline = offlineStages

  // Parallel branches introduced by a fan-out stage. Applies from the fan-out
  // until the merge node pools the results back together.
  const branches = config.decomposition ? 3 : config.multiQuery ? 4 : 1
  const fanoutIndex = online.findIndex((s) => s.kind === 'fanout')
  const mergeIndex = online.findIndex((s) => s.id === 'merge')

  const pack = (stages: Stage[], x: number, yStart: number) => {
    let y = yStart
    return stages.map((stage) => {
      const node = { stage, x, y }
      y += heightOf(stage) + GAP
      return node
    })
  }

  const iRetrieval = online.findIndex((s) => s.id === SPLIT_RETRIEVAL)
  const iAnswer = online.findIndex((s) => s.id === SPLIT_ANSWER)
  const onlineLaid = [
    ...pack(online.slice(0, iRetrieval), COL_QUERY_X, 0),
    ...pack(online.slice(iRetrieval, iAnswer), COL_RETRIEVAL_X, 0),
    ...pack(online.slice(iAnswer), COL_ANSWER_X, 0),
  ]
  const offlineLaid = pack(offline, COL_OFFLINE_X, 0)

  const toNode = (
    { stage, x, y }: { stage: Stage; x: number; y: number },
    multiplier?: number,
  ): Node<StageNodeData, 'stage'> => ({
    id: stage.id,
    type: 'stage',
    position: { x, y },
    data: {
      stage,
      variantId: variantFor(stage, config),
      active: activeStageId === stage.id,
      done: visitedIds.has(stage.id),
      selected: selectedId === stage.id,
      multiplier,
    },
  })

  const lane = (id: string, x: number, data: LaneNodeData): Node<LaneNodeData, 'lane'> => ({
    id,
    type: 'lane',
    position: { x, y: -78 },
    data,
    draggable: false,
    selectable: false,
  })

  const nodes: FlowNode[] = [
    lane('lane-offline', COL_OFFLINE_X, {
      title: 'Offline',
      subtitle: 'Runs once, before any query',
      phase: 'offline',
    }),
    lane('lane-query', COL_QUERY_X, {
      title: 'Online · Query Processing',
      subtitle: 'Turn the question into something searchable',
      phase: 'online',
    }),
    lane('lane-retrieval', COL_RETRIEVAL_X, {
      title: 'Online · Retrieve & Rank',
      subtitle: 'Find the evidence, then order it',
      phase: 'online',
    }),
    lane('lane-answer', COL_ANSWER_X, {
      title: 'Online · Answer',
      subtitle: 'Build the prompt, generate, verify',
      phase: 'online',
    }),
    ...offlineLaid.map((n) => toNode(n)),
    ...onlineLaid.map((n, i) => {
      // A stage runs in parallel if it sits after the fan-out and before the merge.
      const parallel =
        fanoutIndex >= 0 && i > fanoutIndex && (mergeIndex < 0 || i < mergeIndex) ? branches : undefined
      return toNode(n, parallel)
    }),
  ]

  const edges: Edge[] = []

  // Marker colours are baked into <defs>, so CSS variables don't resolve here —
  // these hexes must track --border-heavy and --ink in styles.css.
  const ARROW_MUTED = '#b6b0a8'
  const ARROW_INK = '#1a1815'
  const arrow = (travelled: boolean) => ({
    type: MarkerType.ArrowClosed,
    width: 14,
    height: 14,
    color: travelled ? ARROW_INK : ARROW_MUTED,
  })

  const link = (source: string, target: string, extra: Partial<Edge> = {}) => {
    const travelled = visitedIds.has(source) && visitedIds.has(target)
    edges.push({
      id: `${source}->${target}`,
      source,
      target,
      type: 'pipeline',
      data: { travelled },
      markerEnd: arrow(travelled),
      ...extra,
    })
  }

  for (let i = 0; i < offlineLaid.length - 1; i++) {
    link(offlineLaid[i].stage.id, offlineLaid[i + 1].stage.id)
  }
  for (let i = 0; i < onlineLaid.length - 1; i++) {
    const source = onlineLaid[i].stage.id
    const target = onlineLaid[i + 1].stage.id
    const parallel = fanoutIndex >= 0 && i >= fanoutIndex && (mergeIndex < 0 || i < mergeIndex)
    link(source, target, parallel ? { label: `×${branches}`, data: { travelled: visitedIds.has(source) && visitedIds.has(target), parallel: true } } : {})
  }

  // The one edge that joins the two halves.
  link('index', 'retrieval', {
    type: 'join',
    sourceHandle: 'right',
    targetHandle: 'left',
    data: { travelled: visitedIds.has('retrieval') },
    markerEnd: arrow(true),
  })

  return { nodes, edges }
}

/** Ordered stages the animated walkthrough steps through. */
export function traceOrder(config: PipelineConfig): Stage[] {
  return [...offlineStages, ...activeOnlineStages(config)].filter((s) => s.trace)
}
