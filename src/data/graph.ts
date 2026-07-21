import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { Phase, PipelineConfig, Stage } from './types'
import { offlineStages, onlineStages, platformStages, stageById } from './stages'

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
/* The control plane sits leftmost: it is what feeds ingestion, so the one
   cross-lane edge we do draw (triggers → loading) is a short hop right. */
const COL_PLATFORM_X = 0
const COL_OFFLINE_X = 860
const COL_QUERY_X = 1720
const COL_RETRIEVAL_X = 2580
const COL_ANSWER_X = 3440
const GAP = 44
/** Where the online path breaks into further columns. */
const SPLIT_RETRIEVAL = 'retrieval'
const SPLIT_ANSWER = 'prompt'

/*
 * Vertical packing needs each card's rendered height before it exists, so this
 * estimates from content. A flat per-kind constant was not enough: control-plane
 * cards carry a `governs` row that a plain `sequential` card does not, which made
 * them overflow their slot and overlap the card below.
 *
 * Constants are calibrated against measured cards. Deliberately rounds up —
 * over-estimating only adds whitespace, under-estimating overlaps.
 */
const CARD_BASE = 91 // padding + icon/title head
const TAGLINE_LINE = 22
const ROW_LEAD = 14 // margin-top on any chip row
const RULE_LEAD = 13 // extra padding above rows with a dashed rule
const CHIP_H = 30
const CHIP_GAP = 6
const SLACK = 8

function innerWidth(stage: Stage): number {
  return (stage.phase === 'online' ? 440 : 415) - 38
}

/** Greedy line-break count for a row of chips. */
function chipRowHeight(labels: string[], width: number): number {
  let rows = 1
  let x = 0
  for (const l of labels) {
    // Overestimating width slightly is safer than underestimating, which causes overlapping.
    // Base width 28 accounts for 24px padding + 2px border + slack.
    const w = l.length * 7.8 + 28
    if (x > 0 && x + w > width) {
      rows++
      x = w + CHIP_GAP
    } else {
      x += w + CHIP_GAP
    }
  }
  return rows * CHIP_H + (rows - 1) * CHIP_GAP
}

function heightOf(stage: Stage): number {
  const w = innerWidth(stage)
  let h = CARD_BASE

  // A choice node shows the selected variant's tagline, so budget for the longest.
  const taglines = [stage.tagline, ...(stage.variants?.map((v) => v.tagline) ?? [])]
  const longest = Math.max(...taglines.map((t) => t.length))
  h += Math.max(1, Math.ceil((longest * 7.35) / w)) * TAGLINE_LINE

  if (stage.variants) {
    h += ROW_LEAD + chipRowHeight(stage.variants.map((v) => v.label), w)
  }
  if (stage.governs) {
    const governLabels = stage.governs.map((id) => stageById.get(id)?.label ?? id)
    h += ROW_LEAD + RULE_LEAD + chipRowHeight(['governs', ...governLabels], w)
  }
  if (stage.fanoutInto) {
    h += ROW_LEAD + RULE_LEAD + chipRowHeight(stage.fanoutInto, w)
  }

  return h + SLACK
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
      case 'semantic-cache':
        return config.semanticCache
      case 'dedup':
        return config.dedup
      case 'rerank':
        return config.rerank
      case 'context-window':
        return config.contextWindow
      case 'contextual-compression':
        return config.contextualCompression
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
  const platformLaid = config.platform ? pack(platformStages, COL_PLATFORM_X, 0) : []

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
    ...(config.platform
      ? [
          lane('lane-platform', COL_PLATFORM_X, {
            title: 'Platform · Governance & Ops',
            subtitle: 'Governs the pipeline; never on the query path',
            phase: 'platform' as const,
          }),
        ]
      : []),
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
    ...platformLaid.map((n) => toNode(n)),
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
  for (let i = 0; i < platformLaid.length - 1; i++) {
    link(platformLaid[i].stage.id, platformLaid[i + 1].stage.id)
  }
  // The control plane relates to most of the pipeline, but only one of those
  // relationships is a real data flow worth drawing: triggers feed ingestion.
  // The rest are named on each card via `governs` rather than drawn, which
  // keeps the canvas from turning into a web of long crossing edges.
  if (config.platform) {
    link('triggers', 'loading', {
      type: 'join',
      sourceHandle: 'right',
      targetHandle: 'left',
      label: 'Feeds ingestion',
      data: { travelled: false, control: true },
    })
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
    label: 'Reads the index',
    data: { travelled: visitedIds.has('retrieval') },
    markerEnd: arrow(true),
  })

  return { nodes, edges }
}

/** Ordered stages the animated walkthrough steps through. */
export function traceOrder(config: PipelineConfig): Stage[] {
  return [...offlineStages, ...activeOnlineStages(config)].filter((s) => s.trace)
}
