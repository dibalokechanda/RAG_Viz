import type { PipelineConfig } from '../data/types'
import { usePipeline } from '../PipelineContext'

const CHUNKING = [
  ['fixed', 'Fixed'],
  ['overlap', 'Overlap'],
  ['recursive', 'Recursive'],
  ['semantic', 'Semantic'],
  ['parent-child', 'Parent–Child'],
]

const INDEX_STRUCTURE = [
  ['flat', 'Flat'],
  ['ivf', 'IVF'],
  ['hnsw', 'HNSW'],
]

const COMPRESSION = [
  ['none', 'None'],
  ['sq', 'SQ8'],
  ['pq', 'PQ'],
  ['binary', 'Binary'],
]

const RETRIEVAL = [
  ['dense', 'Dense'],
  ['sparse', 'Sparse'],
  ['hybrid', 'Hybrid'],
]

const DECODING = [
  ['greedy', 'Greedy'],
  ['beam', 'Beam'],
  ['sampling', 'Sampling'],
]

const TOGGLES: { key: keyof PipelineConfig; label: string; hint: string }[] = [
  { key: 'multiQuery', label: 'Multi-Query', hint: 'One question → several searches' },
  { key: 'decomposition', label: 'Decomposition', hint: 'Split a compound question' },
  { key: 'hyde', label: 'HyDE', hint: 'Embed a hypothetical answer' },
  { key: 'dedup', label: 'Deduplication', hint: 'Exact → MinHash → cosine → MMR' },
  { key: 'rerank', label: 'Cross-Encoder Rerank', hint: 'Rescore the top candidates' },
  { key: 'retrievalMetrics', label: 'Retrieval Metrics', hint: 'Precision, Recall, MRR, nDCG' },
  { key: 'evaluation', label: 'Generation Evaluation', hint: 'Grounding & faithfulness checks' },
]

function Segmented({
  options,
  value,
  onChange,
}: {
  options: string[][]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="seg">
      {options.map(([id, label]) => (
        <button key={id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  )
}

export default function ControlRail({ collapsed }: { collapsed: boolean }) {
  const { config, setVariant, toggle } = usePipeline()

  const bothFanouts = config.multiQuery && config.decomposition
  const indexLabel = INDEX_STRUCTURE.find(([id]) => id === config.indexStructure)?.[1] ?? ''
  const compLabel = COMPRESSION.find(([id]) => id === config.compression)?.[1] ?? ''

  return (
    <div className={`rail ${collapsed ? 'collapsed' : ''}`}>
      <div className="rail-group">
        <h2>Offline — build the index</h2>

        <div className="field">
          <div className="field-label">
            Chunking strategy <b>§3</b>
          </div>
          <Segmented options={CHUNKING} value={config.chunking} onChange={(v) => setVariant('chunking', v)} />
        </div>

        <div className="field">
          <div className="field-label">
            Index structure <b>§5a</b>
          </div>
          <Segmented
            options={INDEX_STRUCTURE}
            value={config.indexStructure}
            onChange={(v) => setVariant('index-structure', v)}
          />
        </div>

        <div className="field">
          <div className="field-label">
            Compression <b>§5b</b>
          </div>
          <Segmented
            options={COMPRESSION}
            value={config.compression}
            onChange={(v) => setVariant('compression', v)}
          />
          <div className="field-note">
            Orthogonal axes — <b>{indexLabel} + {compLabel}</b>
            {config.indexStructure === 'ivf' && config.compression === 'pq' && ' is what people mean by IVF-PQ'}
          </div>
        </div>
      </div>

      <div className="rail-group">
        <h2>Online — answer a query</h2>

        <div className="field">
          <div className="field-label">
            Retrieval mode <b>§6</b>
          </div>
          <Segmented options={RETRIEVAL} value={config.retrieval} onChange={(v) => setVariant('retrieval', v)} />
        </div>

        <div className="field">
          <div className="field-label">
            Decoding strategy <b>§9</b>
          </div>
          <Segmented options={DECODING} value={config.decoding} onChange={(v) => setVariant('generation', v)} />
        </div>
      </div>

      <div className="rail-group">
        <h2>Optional stages</h2>
        {TOGGLES.map((t) => (
          <div
            key={t.key}
            className={`toggle ${config[t.key] ? 'on' : ''}`}
            onClick={() => toggle(t.key)}
            role="switch"
            aria-checked={Boolean(config[t.key])}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggle(t.key)
              }
            }}
          >
            <div className="switch" />
            <div className="toggle-text">
              <b>{t.label}</b>
              <span>{t.hint}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="rail-group">
        {config.retrieval === 'hybrid' ? (
          <div className="rail-note">
            Hybrid retrieval runs dense and sparse side by side, so <b>Reciprocal Rank Fusion</b> appears
            in the graph to reconcile the two ranked lists.
          </div>
        ) : (
          <div className="rail-note">
            With a single retriever there is nothing to fuse, so RRF drops out of the graph. Switch to{' '}
            <b>Hybrid</b> to bring it back.
          </div>
        )}
        {bothFanouts && (
          <div className="rail-note" style={{ marginTop: 14, borderLeftColor: 'var(--ink)' }}>
            Multi-query and decomposition are both on. In practice you would pick one — they solve
            different problems with the same fan-out shape.
          </div>
        )}
      </div>
    </div>
  )
}
