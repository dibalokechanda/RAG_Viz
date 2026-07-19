/**
 * The pipeline is described once, here, and everything else is derived from it:
 * the React Flow graph, the detail panel, the concept mind-maps, and the
 * animated query trace.
 */
import type { IconName } from '../components/Icon'

export type { IconName }

/** Which half of the system a stage belongs to. */
export type Phase = 'offline' | 'online'

/**
 * How a stage behaves in the graph. This distinction is the whole point of the
 * visualisation — a stage that always runs is not the same shape of thing as a
 * stage where you pick one of five variants, or one you can switch off.
 */
export type StageKind =
  /** Always runs, exactly once, in order. */
  | 'sequential'
  /** Always runs, but you choose one implementation from `variants`. */
  | 'choice'
  /** May be skipped entirely. Toggled by the user. */
  | 'optional'
  /** Optional *and* multiplies the query into several parallel branches. */
  | 'fanout'
  /** Where the two halves meet: written offline, read online. */
  | 'store'
  /** Start / end of a path. */
  | 'terminal'

export interface Variant {
  id: string
  label: string
  /** One line, shown on the node when this variant is selected. */
  tagline: string
  detail: string
  example?: Example
  math?: MathBlock[]
  figures?: Figure[]
  tradeoffs?: Tradeoffs
}

export interface Example {
  beforeLabel?: string
  before: string
  afterLabel?: string
  after: string
  /** Rendered in a monospace block rather than prose. */
  mono?: boolean
}

/** A displayed equation, with the symbols spelled out underneath. */
export interface MathBlock {
  /** Short caption above the equation. */
  title?: string
  /** KaTeX source, rendered in display mode. */
  tex: string
  /** `symbol` → what it means. Rendered as a legend below the equation. */
  where?: { sym: string; means: string }[]
  /** A worked numeric substitution, rendered as a second equation. */
  worked?: { tex: string; caption?: string }[]
  /** Prose note under the whole block. */
  note?: string
}

export interface Tradeoffs {
  /** What this buys you. */
  gains: string[]
  /** What it costs. */
  costs: string[]
}

/** A "these two are commonly conflated" callout. */
export interface Distinction {
  title: string
  body: string
}

/**
 * Small inline diagrams. Declared as data so the content files stay readable
 * and every figure inherits the same monochrome styling.
 */
export type Figure =
  /**
   * Grouped bar chart. Each series renders as its own panel side by side,
   * sharing a y-scale — which is what makes three temperature settings
   * directly comparable.
   */
  | {
      kind: 'bars'
      title?: string
      caption?: string
      categories: string[]
      series: { label: string; values: number[] }[]
      /** Draw a cutoff rule after this many bars, e.g. a top-K boundary. */
      cutoff?: { after: number; label: string }
      /** Indices to draw filled rather than outlined. */
      highlight?: number[]
      yMax?: number
      /** Print each bar's value above it. */
      showValues?: boolean
    }
  /** Line plot. Used for saturation, discount and threshold curves. */
  | {
      kind: 'curve'
      title?: string
      caption?: string
      xLabel: string
      yLabel: string
      lines: { label?: string; points: [number, number][]; dashed?: boolean }[]
      marks?: { x: number; y: number; label: string }[]
      xTicks?: { at: number; label: string }[]
      yTicks?: { at: number; label: string }[]
    }
  /** Horizontal tracks split into spans — chunking strategies. */
  | {
      kind: 'segments'
      title?: string
      caption?: string
      total: number
      rows: {
        label: string
        spans: { from: number; to: number; label?: string; ghost?: boolean }[]
      }[]
    }
  /** A ranked result strip with graded relevance shading. */
  | {
      kind: 'ranked'
      title?: string
      caption?: string
      /** 0 = irrelevant. Higher shades darker. */
      grades: number[]
      maxGrade?: number
      /** Marks the first relevant hit, for MRR. */
      markFirstRelevant?: boolean
    }
  /** Rows of labelled boxes with optional arrows between them. */
  | {
      kind: 'blocks'
      title?: string
      caption?: string
      rows: {
        label?: string
        /** `span` widens a box relative to its siblings. */
        boxes: { text: string; span?: number; filled?: boolean; dashed?: boolean }[]
        /** Arrow drawn below this row. */
        arrow?: string
      }[]
    }

/**
 * A node in a stage's concept mind-map. Concepts nest arbitrarily deep; the
 * map renders one ring per level and expands on click.
 */
export interface Concept {
  id: string
  label: string
  /** Drives the node's colour and icon in the map. */
  kind: 'idea' | 'formula' | 'method' | 'metric' | 'pitfall' | 'tradeoff'
  /** One line, shown on the map node itself. */
  summary: string
  detail?: string[]
  math?: MathBlock[]
  figures?: Figure[]
  example?: Example
  tradeoffs?: Tradeoffs
  children?: Concept[]
}

/** One frame of the animated query walkthrough. */
export interface TraceFrame {
  /** Short label for what happened, e.g. "Pronoun resolved". */
  headline: string
  /** The payload as it exists *after* this stage runs. */
  payload: string
  /** Renders `payload` as preformatted text. */
  mono?: boolean
  /** Optional annotation shown under the payload. */
  note?: string
}

export interface Stage {
  id: string
  label: string
  phase: Phase
  kind: StageKind
  /** Name from the icon set — see components/Icon.tsx. */
  icon: IconName
  /** Section number from the reference outline, e.g. "1c". Purely for orientation. */
  ordinal?: string
  /** One short line, always visible on the node. */
  tagline: string
  /** Panel body. Each string is a paragraph. */
  detail: string[]
  example?: Example
  math?: MathBlock[]
  figures?: Figure[]
  tradeoffs?: Tradeoffs
  distinctions?: Distinction[]
  /** For `choice` stages. */
  variants?: Variant[]
  /** For `fanout` stages: what the query is multiplied into. */
  fanoutInto?: string[]
  /** Root concepts for this stage's mind-map. */
  concepts?: Concept[]
  /** Frame shown when the animated query passes through this stage. */
  trace?: TraceFrame
}

/** Everything the user can switch on, off, or swap. */
export interface PipelineConfig {
  chunking: string
  /** Which vectors get compared — Flat, IVF, or HNSW. */
  indexStructure: string
  /** How each vector is stored — none, scalar, product, or binary quantisation. */
  compression: string
  retrieval: string
  decoding: string
  multiQuery: boolean
  decomposition: boolean
  hyde: boolean
  dedup: boolean
  rerank: boolean
  retrievalMetrics: boolean
  evaluation: boolean
}

export const defaultConfig: PipelineConfig = {
  chunking: 'recursive',
  indexStructure: 'hnsw',
  compression: 'none',
  retrieval: 'hybrid',
  decoding: 'greedy',
  multiQuery: false,
  decomposition: false,
  hyde: false,
  dedup: true,
  rerank: true,
  retrievalMetrics: true,
  evaluation: true,
}
