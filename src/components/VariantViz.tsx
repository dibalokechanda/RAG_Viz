import { useEffect, useState } from 'react'
import {
  ACCENT,
  DIM,
  Eyebrow,
  GraphBody,
  H,
  INK,
  LINE,
  Legend,
  Panel,
  SceneDefs,
  W,
  useGraphLayout,
  wrap,
} from './sceneKit'
import { COMMUNITIES, RELATIONSHIPS } from '../data/graphrag'

/*
 * Scenes for the three GraphRAG variants. They share the layout and material
 * from sceneKit so the four tracks read as one artifact, and each scene is
 * built around the single mechanism that distinguishes its method.
 */

const GREEN = COMMUNITIES.eval.color
const GOLD = COMMUNITIES.peft.color
const BLUE = COMMUNITIES.privacy.color

/** the chunk of paper text used across scenes */
const PHRASE_LINES: { text: string }[] = [
  { text: 'Recent work explores using LLMs to create' },
  { text: 'synthetic samples that mimic clients’ private' },
  { text: 'data distribution using differential privacy.' },
  { text: 'This approach significantly boosts SLMs’' },
  { text: 'performance by approximately 5%.' },
]

/* The noun phrases the extractor pulls out of that text. Shown as chips
   rather than as highlights over the prose: the body is set in a
   proportional serif, so index-based highlight rectangles never line up
   with the words they are meant to mark. */
const NOUN_PHRASES = ['LLMs', 'synthetic samples', 'private data distribution', 'differential privacy', 'SLMs’ performance']

export type VariantStage = string

export default function VariantViz({ stage }: { stage: VariantStage }) {
  const layout = useGraphLayout(430)
  // scenes with a wider left column push the graph further right
  const wideLayout = useGraphLayout(600)
  const { pos, hulls } = layout

  const [sub, setSub] = useState(0)
  useEffect(() => {
    setSub(0)
    const t = window.setInterval(() => setSub((s) => s + 1), 2200)
    return () => clearInterval(t)
  }, [stage])

  const anchors = new Set(['lora', 'llm', 'hyperparams'])
  const pathNodes = ['qlora', 'lora', 'llm', 'dp']

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="gr-svg">
      <SceneDefs />

      {/* ═══════════ LazyGraphRAG 1: concept graph, no LLM ═══════════ */}
      {stage === 'lz-index' && (
        <g>
          <Panel x={24} y={34} w={320} h={216} />
          <Eyebrow x={44} y={60}>
            NOUN PHRASES = CONCEPTS
          </Eyebrow>
          <text x={324} y={60} fontSize="7" fontFamily="var(--mono)" fill={DIM} textAnchor="end">
            chunk_04
          </text>
          <line x1={44} y1={70} x2={324} y2={70} stroke={LINE} />
          {PHRASE_LINES.map((l, i) => (
            <text key={i} x={44} y={90 + i * 13} fontSize="7.6" fontFamily="var(--serif)" fill="#6f6960">
              {l.text}
            </text>
          ))}
          <line x1={44} y1={164} x2={324} y2={164} stroke={LINE} strokeDasharray="2 3" />
          {NOUN_PHRASES.map((ph, i) => (
            <g key={ph}>
              <rect x={44} y={176 + i * 15} width={ph.length * 4.3 + 12} height={12} rx="6" fill={GREEN} fillOpacity="0.16" />
              <text x={50} y={185 + i * 15} fontSize="7.2" fontFamily="var(--mono)" fill={GREEN}>
                {ph}
              </text>
            </g>
          ))}
          <text x={200} y={200} fontSize="7.2" fontFamily="var(--mono)" fill={DIM}>
            each becomes a node
          </text>
          <text x={200} y={212} fontSize="7.2" fontFamily="var(--mono)" fill={DIM}>
            each pair becomes an edge
          </text>
          <text x={200} y={232} fontSize="7.8" fontFamily="var(--mono)" fontWeight="600" fill={ACCENT}>
            0 LLM calls
          </text>

          {/* cost comparison */}
          <Panel x={24} y={268} w={320} h={192} />
          <Eyebrow x={44} y={294}>
            INDEXING COST
          </Eyebrow>
          <line x1={44} y1={304} x2={324} y2={304} stroke={LINE} />
          {[
            { k: 'Full GraphRAG', v: 1, c: GOLD, note: 'extraction, merge, reports' },
            { k: 'Vector RAG', v: 0.001, c: BLUE, note: 'embeddings only' },
            { k: 'LazyGraphRAG', v: 0.001, c: GREEN, note: 'identical to vector RAG' },
          ].map((row, i) => (
            <g key={row.k}>
              <text x={44} y={330 + i * 44} fontSize="8.4" fontFamily="var(--mono)" fontWeight="600" fill={INK}>
                {row.k}
              </text>
              <rect x={44} y={338 + i * 44} width={280} height={7} rx="3.5" fill="#efece6" />
              <rect x={44} y={338 + i * 44} width={Math.max(280 * row.v, 3)} height={7} rx="3.5" fill={row.c} />
              <text x={44} y={358 + i * 44} fontSize="7" fontFamily="var(--serif)" fill={DIM}>
                {row.note}
              </text>
            </g>
          ))}
          <text x={44} y={452} fontSize="7" fontFamily="var(--mono)" fill={ACCENT}>
            0.1% of full GraphRAG, per Microsoft
          </text>

          <text x={430} y={22} fontSize="7.8" fontFamily="var(--mono)" fill={DIM}>
            concept graph: co-occurrence edges, communities from graph statistics alone
          </text>
          <GraphBody layout={layout} showHulls coloured={false} />
          <Legend x={430} />
        </g>
      )}

      {/* ═══════════ LazyGraphRAG 2: best-first ranking ═══════════ */}
      {stage === 'lz-rank' && (
        <g>
          <Panel x={24} y={34} w={330} h={130} accent={GREEN} strong />
          <Eyebrow x={44} y={62} fill={GREEN}>
            QUERY, EMBEDDED
          </Eyebrow>
          {wrap('How do teams trade compute against accuracy when adapting a model?', 44).map((l, i) => (
            <text key={i} x={44} y={86 + i * 14} fontSize="9" fontFamily="var(--serif)" fill={INK}>
              {l}
            </text>
          ))}
          <text x={44} y={146} fontSize="7.2" fontFamily="var(--mono)" fill={DIM}>
            no model call yet, this is embedding arithmetic
          </text>

          <Panel x={24} y={182} w={330} h={278} />
          <Eyebrow x={44} y={208}>
            CHUNKS BY SIMILARITY
          </Eyebrow>
          <text x={334} y={208} fontSize="7" fontFamily="var(--mono)" fill={DIM} textAnchor="end">
            best-first
          </text>
          <line x1={44} y1={218} x2={334} y2={218} stroke={LINE} />
          {[
            ['chunk_11', 0.86],
            ['chunk_04', 0.81],
            ['chunk_27', 0.74],
            ['chunk_19', 0.68],
            ['chunk_33', 0.55],
            ['chunk_02', 0.41],
          ].map(([id, score], i) => (
            <g key={id as string}>
              <text x={44} y={242 + i * 38} fontSize="8" fontFamily="var(--mono)" fill={INK}>
                {id}
              </text>
              <text x={334} y={242 + i * 38} fontSize="7.6" fontFamily="var(--mono)" fill={GREEN} textAnchor="end">
                {(score as number).toFixed(2)}
              </text>
              <rect x={44} y={248 + i * 38} width={290} height={6} rx="3" fill="#efece6" />
              <rect x={44} y={248 + i * 38} width={290 * (score as number)} height={6} rx="3" fill={GREEN} fillOpacity="0.8" />
            </g>
          ))}

          <text x={430} y={22} fontSize="7.8" fontFamily="var(--mono)" fill={DIM}>
            each community inherits a score from its top-k chunks
          </text>
          <GraphBody layout={layout} showHulls />
          {hulls.map((h, i) => (
            <g key={h.c}>
              <g filter="url(#cardshadow)">
                <rect x={h.bx - 42} y={h.by - 15} width={84} height={30} rx="8" fill="#fff" stroke={COMMUNITIES[h.c].color} strokeOpacity="0.6" />
              </g>
              <text x={h.bx - 32} y={h.by + 4} fontSize="6.8" fontFamily="var(--mono)" fill={DIM}>
                rank
              </text>
              <text x={h.bx + 32} y={h.by + 4} fontSize="9" fontFamily="var(--mono)" fontWeight="600" fill={COMMUNITIES[h.c].color} textAnchor="end">
                {['1', '2', '3', '4'][i]}
              </text>
            </g>
          ))}
          <Legend x={430} />
        </g>
      )}

      {/* ═══════════ LazyGraphRAG 3: relevance test budget ═══════════ */}
      {stage === 'lz-test' &&
        (() => {
          const spent = [180, 620, 1180, 1500][sub % 4]
          return (
            <g>
              <Panel x={24} y={34} w={330} h={150} accent={ACCENT} strong />
              <Eyebrow x={44} y={62} fill={ACCENT}>
                RELEVANCE TEST BUDGET
              </Eyebrow>
              <text x={334} y={62} fontSize="7" fontFamily="var(--mono)" fill={DIM} textAnchor="end">
                the only dial
              </text>
              <text x={44} y={98} fontSize="21" fontFamily="var(--serif)" fontWeight="600" fill={INK}>
                {spent}
              </text>
              <text x={104} y={98} fontSize="10" fontFamily="var(--mono)" fill={DIM}>
                / 1500 tests spent
              </text>
              <rect x={44} y={110} width={290} height={9} rx="4.5" fill="#efece6" />
              <rect x={44} y={110} width={290 * (spent / 1500)} height={9} rx="4.5" fill={ACCENT} style={{ transition: 'width 700ms' }} />
              {[100, 500, 1500].map((b) => (
                <g key={b}>
                  <line x1={44 + 290 * (b / 1500)} y1={122} x2={44 + 290 * (b / 1500)} y2={128} stroke="#c9c3ba" />
                  <text x={44 + 290 * (b / 1500)} y={139} fontSize="6.8" fontFamily="var(--mono)" fill={DIM} textAnchor="middle">
                    {b}
                  </text>
                </g>
              ))}
              <text x={44} y={166} fontSize="7.2" fontFamily="var(--serif)" fill={DIM}>
                Microsoft tested all three; the budget controls the
              </text>
              <text x={44} y={177} fontSize="7.2" fontFamily="var(--serif)" fill={DIM}>
                cost/quality trade-off consistently.
              </text>

              <Panel x={24} y={202} w={330} h={258} />
              <Eyebrow x={44} y={228}>
                SENTENCE-LEVEL ASSESSOR
              </Eyebrow>
              <line x1={44} y1={238} x2={334} y2={238} stroke={LINE} />
              {[
                { t: 'LoRA cuts trainable parameters by orders of magnitude.', ok: true },
                { t: 'Table 3 lists the hyperparameter grid used.', ok: false },
                { t: 'QLoRA adds 4-bit quantisation on top of LoRA.', ok: true },
                { t: 'See Appendix B for the full ablation.', ok: false },
              ].map((row, i) => (
                <g key={i} opacity={sub % 4 >= i ? 1 : 0.2} style={{ transition: 'opacity 600ms' }}>
                  <circle cx={50} cy={261 + i * 52} r="5.5" fill={row.ok ? GREEN : '#e6e1d9'} />
                  <text x={50} y={264 + i * 52} fontSize="7" fontFamily="var(--mono)" fill={row.ok ? '#fff' : DIM} textAnchor="middle">
                    {row.ok ? '✓' : '×'}
                  </text>
                  {wrap(row.t, 44).map((l, k) => (
                    <text key={k} x={64} y={258 + i * 52 + k * 11} fontSize="7.4" fontFamily="var(--serif)" fill={row.ok ? '#4a453f' : '#b3ada3'}>
                      {l}
                    </text>
                  ))}
                  <text x={64} y={284 + i * 52} fontSize="6.6" fontFamily="var(--mono)" fill={row.ok ? GREEN : DIM}>
                    {row.ok ? 'kept' : 'discarded, still costs a test'}
                  </text>
                </g>
              ))}

              <text x={430} y={22} fontSize="7.8" fontFamily="var(--mono)" fill={DIM}>
                breadth-first over communities; a dry streak triggers recursion into sub-communities
              </text>
              <GraphBody layout={layout} showHulls />
              {hulls.map((h, i) => {
                const state = ['hit', 'hit', 'dry', 'recurse'][i]
                const col = state === 'dry' ? '#b6b0a8' : state === 'recurse' ? ACCENT : GREEN
                return (
                  <g key={h.c}>
                    <g filter="url(#cardshadow)">
                      <rect x={h.bx - 46} y={h.by - 15} width={92} height={30} rx="8" fill="#fff" stroke={col} strokeOpacity="0.65" />
                    </g>
                    <text x={h.bx} y={h.by + 3} fontSize="7.2" fontFamily="var(--mono)" fill={col} textAnchor="middle">
                      {state === 'dry' ? '0 relevant' : state === 'recurse' ? 'recurse ↓' : 'relevant ✓'}
                    </text>
                  </g>
                )
              })}
              <Legend x={430} />
            </g>
          )
        })()}

      {/* ═══════════ LazyGraphRAG 4: answer ═══════════ */}
      {stage === 'lz-answer' && (
        <g>
          <Panel x={24} y={40} w={280} h={230} />
          <Eyebrow x={44} y={66}>
            WHAT SURVIVED
          </Eyebrow>
          <line x1={44} y1={76} x2={284} y2={76} stroke={LINE} />
          {[
            'LoRA cuts trainable parameters by orders of magnitude.',
            'QLoRA adds 4-bit quantisation on top of LoRA.',
            'Hyperparameters are tuned against cross-entropy.',
          ].map((t, i) => (
            <g key={i}>
              <circle cx={49} cy={97 + i * 56} r="2.4" fill={GREEN} />
              {wrap(t, 38).map((l, k) => (
                <text key={k} x={60} y={100 + i * 56 + k * 11} fontSize="7.6" fontFamily="var(--serif)" fill="#4a453f">
                  {l}
                </text>
              ))}
            </g>
          ))}
          <text x={44} y={252} fontSize="7" fontFamily="var(--mono)" fill={DIM}>
            sentences, not whole chunks
          </text>

          <path d="M 312 155 L 356 155" stroke="#b6b0a8" strokeWidth="1.6" />
          <path d="M 348 150 l 8 5 l -8 5" fill="none" stroke="#b6b0a8" strokeWidth="1.6" />
          <rect x={366} y={118} width={140} height={74} rx="13" fill="url(#ink-sheen)" filter="url(#cardshadow)" />
          <text x={436} y={150} fontSize="12.5" fontFamily="var(--serif)" fill="#fff" textAnchor="middle">
            LLM
          </text>
          <text x={436} y={168} fontSize="7.2" fontFamily="var(--mono)" fill="#9fb3a6" textAnchor="middle">
            one synthesis call
          </text>
          <path d="M 514 155 L 558 155" stroke="#b6b0a8" strokeWidth="1.6" />
          <path d="M 550 150 l 8 5 l -8 5" fill="none" stroke="#b6b0a8" strokeWidth="1.6" />

          <Panel x={568} y={40} w={330} h={230} accent={GREEN} strong />
          <Eyebrow x={588} y={68} fill={GREEN}>
            ANSWER
          </Eyebrow>
          {wrap(
            'A small team should reach for LoRA first: it holds base weights frozen and trains a low-rank adapter, so a single GPU is enough. QLoRA cuts memory further with 4-bit quantisation.',
            48,
          ).map((l, i) => (
            <text key={i} x={588} y={94 + i * 13} fontSize="8.2" fontFamily="var(--serif)" fill="#4a453f">
              {l}
            </text>
          ))}

          <Panel x={24} y={300} w={874} h={160} />
          <Eyebrow x={48} y={328}>
            WHERE THE COST LANDS
          </Eyebrow>
          <line x1={48} y1={338} x2={874} y2={338} stroke={LINE} />
          {[
            { k: 'GraphRAG', a: 'index', b: 'heavy: extraction, merge, community reports', c: 'query', d: 'cheap: reads pre-written reports', col: GOLD },
            { k: 'LazyGraphRAG', a: 'index', b: 'near zero: NLP and embeddings only', c: 'query', d: 'pays per query, capped by the test budget', col: GREEN },
          ].map((row, i) => (
            <g key={row.k}>
              <text x={48} y={364 + i * 42} fontSize="8.6" fontFamily="var(--mono)" fontWeight="600" fill={row.col}>
                {row.k}
              </text>
              <text x={160} y={364 + i * 42} fontSize="7.4" fontFamily="var(--mono)" fill={DIM}>
                {row.a}
              </text>
              <text x={200} y={364 + i * 42} fontSize="7.8" fontFamily="var(--serif)" fill="#4a453f">
                {row.b}
              </text>
              <text x={520} y={364 + i * 42} fontSize="7.4" fontFamily="var(--mono)" fill={DIM}>
                {row.c}
              </text>
              <text x={560} y={364 + i * 42} fontSize="7.8" fontFamily="var(--serif)" fill="#4a453f">
                {row.d}
              </text>
            </g>
          ))}
          <text x={48} y={442} fontSize="7.4" fontFamily="var(--mono)" fill={ACCENT}>
            comparable quality to GraphRAG global search at more than 700× lower query cost
          </text>
        </g>
      )}

      {/* ═══════════ LightRAG 1: extract ═══════════ */}
      {stage === 'lr-extract' && (
        <g>
          <Panel x={28} y={130} w={240} h={240} />
          <text x={48} y={158} fontSize="9.6" fontFamily="var(--mono)" fontWeight="600" fill={INK}>
            chunk_04
          </text>
          <line x1={48} y1={168} x2={248} y2={168} stroke={LINE} />
          {PHRASE_LINES.concat(PHRASE_LINES.slice(0, 4)).map((l, i) => (
            <text key={i} x={48} y={188 + i * 13} fontSize="7.4" fontFamily="var(--serif)" fill="#6f6960">
              {l.text.slice(0, 40)}
            </text>
          ))}

          <path d="M 278 250 L 322 250" stroke="#b6b0a8" strokeWidth="1.6" />
          <path d="M 314 245 l 8 5 l -8 5" fill="none" stroke="#b6b0a8" strokeWidth="1.6" />
          <rect x={332} y={212} width={140} height={76} rx="13" fill="url(#ink-sheen)" filter="url(#cardshadow)" />
          <text x={402} y={244} fontSize="12.5" fontFamily="var(--serif)" fill="#fff" textAnchor="middle">
            LLM
          </text>
          <text x={402} y={262} fontSize="7.2" fontFamily="var(--mono)" fill="#9fb3a6" textAnchor="middle">
            entities + relations
          </text>
          <path d="M 482 250 L 526 250" stroke="#b6b0a8" strokeWidth="1.6" />
          <path d="M 518 245 l 8 5 l -8 5" fill="none" stroke="#b6b0a8" strokeWidth="1.6" />

          <Panel x={540} y={70} w={280} h={360} />
          <Eyebrow x={560} y={96}>
            NODES
          </Eyebrow>
          <line x1={560} y1={106} x2={800} y2={106} stroke={LINE} />
          {['LORA', 'QLORA', 'LARGE LANGUAGE MODELS', 'HYPERPARAMETERS', 'CROSS-ENTROPY'].map((e, i) => (
            <g key={e} opacity={sub % 5 >= i ? 1 : 0.18} style={{ transition: 'opacity 600ms' }}>
              <circle cx={566} cy={128 + i * 28} r="4.5" fill={`url(#nodegrad-${i < 3 ? 'peft' : 'eval'})`} />
              <text x={578} y={131 + i * 28} fontSize="8.4" fontFamily="var(--mono)" fill={INK}>
                {e}
              </text>
            </g>
          ))}
          <line x1={560} y1={276} x2={800} y2={276} stroke={LINE} strokeDasharray="2 3" />
          <Eyebrow x={560} y={296}>
            EDGES
          </Eyebrow>
          {[
            ['QLORA', 'LORA'],
            ['LORA', 'LARGE LANGUAGE MODELS'],
            ['LORA', 'HYPERPARAMETERS'],
          ].map(([a, b], i) => (
            <g key={a + b} opacity={sub % 5 >= i + 2 ? 1 : 0.18} style={{ transition: 'opacity 600ms' }}>
              <text x={560} y={320 + i * 32} fontSize="7.8" fontFamily="var(--mono)" fill={INK}>
                {a}
              </text>
              <text x={560} y={332 + i * 32} fontSize="7.8" fontFamily="var(--mono)" fill={DIM}>
                → {b.length > 22 ? b.slice(0, 21) + '…' : b}
              </text>
            </g>
          ))}

          <Panel x={846} y={70} w={286} h={360} />
          <Eyebrow x={866} y={96}>
            SAME AS GRAPHRAG, SO FAR
          </Eyebrow>
          <line x1={866} y1={106} x2={1112} y2={106} stroke={LINE} />
          {wrap(
            'Both methods chunk the text and have an LLM name the nodes and edges. The divergence is what happens next: GraphRAG spends its remaining budget on community detection and community reports, LightRAG spends its on making each node and edge directly retrievable.',
            42,
          ).map((l, i) => (
            <text key={i} x={866} y={128 + i * 13} fontSize="8" fontFamily="var(--serif)" fill="#4a453f">
              {l}
            </text>
          ))}
          <text x={866} y={402} fontSize="7.4" fontFamily="var(--mono)" fill={ACCENT}>
            no community hierarchy is built
          </text>
        </g>
      )}

      {/* ═══════════ LightRAG 2: key-value profiles ═══════════ */}
      {stage === 'lr-profile' && (
        <g>
          <text x={28} y={26} fontSize="7.8" fontFamily="var(--mono)" fill={DIM}>
            every node and edge carries its own retrieval key and summarising value
          </text>
          {[
            { t: 'entity', n: 'LORA', k: 'LoRA, low-rank adaptation, adapter', v: 'Low-rank adaptation injects trainable rank-decomposition matrices into each layer while pretrained weights stay frozen.', c: GOLD },
            { t: 'relation', n: 'LORA → LLM', k: 'parameter-efficient fine-tuning', v: 'LoRA is the dominant technique for adapting large language models without a full fine-tune.', c: BLUE },
          ].map((row, i) => (
            <g key={row.n}>
              <Panel x={28} y={44 + i * 150} w={520} h={132} accent={row.c} />
              <Eyebrow x={48} y={70 + i * 150}>
                {row.t.toUpperCase()}
              </Eyebrow>
              <text x={528} y={70 + i * 150} fontSize="8.4" fontFamily="var(--mono)" fontWeight="600" fill={row.c} textAnchor="end">
                {row.n}
              </text>
              <line x1={48} y1={80 + i * 150} x2={528} y2={80 + i * 150} stroke={LINE} />
              <text x={48} y={98 + i * 150} fontSize="7" fontFamily="var(--mono)" fill={DIM}>
                key
              </text>
              <text x={78} y={98 + i * 150} fontSize="8" fontFamily="var(--mono)" fill={INK}>
                {row.k}
              </text>
              <text x={48} y={116 + i * 150} fontSize="7" fontFamily="var(--mono)" fill={DIM}>
                value
              </text>
              {wrap(row.v, 58).map((l, k) => (
                <text key={k} x={78} y={116 + i * 150 + k * 11} fontSize="7.6" fontFamily="var(--serif)" fill="#4a453f">
                  {l}
                </text>
              ))}
            </g>
          ))}

          {/* dedup */}
          <Panel x={28} y={344} w={520} h={124} />
          <Eyebrow x={48} y={370}>
            DEDUPLICATION
          </Eyebrow>
          <line x1={48} y1={380} x2={528} y2={380} stroke={LINE} />
          {['chunk_04', 'chunk_11', 'chunk_19'].map((c, i) => (
            <g key={c}>
              <rect x={48 + i * 92} y={394} width={82} height={26} rx="7" fill="#f2efe9" />
              <text x={89 + i * 92} y={410} fontSize="7.4" fontFamily="var(--mono)" fill={DIM} textAnchor="middle">
                {c}: LORA
              </text>
              <path d={`M ${89 + i * 92} 424 L 380 440`} stroke="#c9c3ba" strokeWidth="1" strokeDasharray="3 3" />
            </g>
          ))}
          <rect x={330} y={430} width={100} height={26} rx="7" fill={GOLD} fillOpacity="0.16" stroke={GOLD} strokeOpacity="0.5" />
          <text x={380} y={447} fontSize="7.6" fontFamily="var(--mono)" fontWeight="600" fill={GOLD} textAnchor="middle">
            one LORA node
          </text>
          <text x={448} y={447} fontSize="7" fontFamily="var(--mono)" fill={DIM}>
            union, not duplicates
          </text>

          <text x={576} y={26} fontSize="7.8" fontFamily="var(--mono)" fill={DIM}>
            the retrievable unit is a node or an edge, never a summary of a summary
          </text>
          <GraphBody layout={wideLayout} />
        </g>
      )}

      {/* ═══════════ LightRAG 3: incremental update ═══════════ */}
      {stage === 'lr-update' && (
        <g>
          <Panel x={24} y={40} w={310} h={128} accent={GREEN} strong />
          <Eyebrow x={44} y={68} fill={GREEN}>
            NEW DOCUMENT ARRIVES
          </Eyebrow>
          <line x1={44} y1={78} x2={314} y2={78} stroke={LINE} />
          {wrap('A follow-up paper on 4-bit quantisation lands three weeks after indexing.', 44).map((l, i) => (
            <text key={i} x={44} y={100 + i * 13} fontSize="8.2" fontFamily="var(--serif)" fill="#4a453f">
              {l}
            </text>
          ))}
          <text x={44} y={152} fontSize="7.2" fontFamily="var(--mono)" fill={DIM}>
            chunk → extract → profile, exactly as before
          </text>

          <Panel x={24} y={196} w={310} h={264} />
          <Eyebrow x={44} y={222}>
            MERGE BY UNION
          </Eyebrow>
          <line x1={44} y1={232} x2={314} y2={232} stroke={LINE} />
          {[
            { k: 'nodes', a: 'V  ∪  V_new', n: '+3 new, 2 merged' },
            { k: 'edges', a: 'E  ∪  E_new', n: '+5 new' },
          ].map((row, i) => (
            <g key={row.k}>
              <text x={44} y={258 + i * 54} fontSize="8.4" fontFamily="var(--mono)" fontWeight="600" fill={INK}>
                {row.a}
              </text>
              <text x={314} y={258 + i * 54} fontSize="7.4" fontFamily="var(--mono)" fill={GREEN} textAnchor="end">
                {row.n}
              </text>
              <rect x={44} y={268 + i * 54} width={270} height={6} rx="3" fill="#efece6" />
              <rect x={44} y={268 + i * 54} width={270 * (i === 0 ? 0.22 : 0.31)} height={6} rx="3" fill={GREEN} />
            </g>
          ))}
          <line x1={44} y1={352} x2={314} y2={352} stroke={LINE} strokeDasharray="2 3" />
          <Eyebrow x={44} y={372}>
            WHAT IS NOT RE-RUN
          </Eyebrow>
          {['community detection', 'community report generation', 'report summarisation', 'report embedding'].map((t, i) => (
            <g key={t}>
              <text x={44} y={394 + i * 17} fontSize="7.6" fontFamily="var(--serif)" fill="#b3ada3" textDecoration="line-through">
                {t}
              </text>
            </g>
          ))}

          <text x={430} y={22} fontSize="7.8" fontFamily="var(--mono)" fill={DIM}>
            the existing graph is untouched; new structure is simply added to it
          </text>
          <GraphBody layout={layout} />
          {['qlora', 'crossentropy', 'wildguard'].map((id) => (
            <circle key={id} cx={pos[id].x} cy={pos[id].y} r={20} fill="none" stroke={GREEN} strokeWidth="1.6">
              <animate attributeName="r" values="12;24;12" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.9;0;0.9" dur="2.4s" repeatCount="indefinite" />
            </circle>
          ))}
          <text x={430} y={H - 34} fontSize="7.4" fontFamily="var(--mono)" fill={GREEN}>
            pulsing nodes are what the new document touched
          </text>
          <Legend x={430} />
        </g>
      )}

      {/* ═══════════ LightRAG 4: dual-level retrieval ═══════════ */}
      {stage === 'lr-dual' && (
        <g>
          <Panel x={24} y={34} w={340} h={104} accent={ACCENT} strong />
          <Eyebrow x={44} y={62} fill={ACCENT}>
            ONE QUERY
          </Eyebrow>
          {wrap('How does LoRA compare with full fine-tuning for a small team?', 46).map((l, i) => (
            <text key={i} x={44} y={88 + i * 14} fontSize="9" fontFamily="var(--serif)" fill={INK}>
              {l}
            </text>
          ))}

          {[
            {
              t: 'LOW-LEVEL KEYWORDS',
              s: 'specific · matches ENTITIES',
              c: GOLD,
              y: 158,
              words: ['LoRA', 'full fine-tuning', 'trainable parameters'],
              note: 'precise information about particular nodes or edges',
            },
            {
              t: 'HIGH-LEVEL KEYWORDS',
              s: 'abstract · matches RELATIONS',
              c: BLUE,
              y: 310,
              words: ['parameter efficiency', 'compute budget', 'adaptation strategy'],
              note: 'aggregates across many entities and relationships',
            },
          ].map((g) => (
            <g key={g.t}>
              <Panel x={24} y={g.y} w={340} h={140} accent={g.c} />
              <Eyebrow x={44} y={g.y + 26}>
                {g.t}
              </Eyebrow>
              <text x={344} y={g.y + 26} fontSize="6.8" fontFamily="var(--mono)" fill={g.c} textAnchor="end">
                {g.s}
              </text>
              <line x1={44} y1={g.y + 36} x2={344} y2={g.y + 36} stroke={LINE} />
              {g.words.map((w, i) => (
                <g key={w}>
                  <rect x={44} y={g.y + 48 + i * 24} width={w.length * 5.2 + 16} height={18} rx="9" fill={g.c} fillOpacity="0.14" />
                  <text x={52} y={g.y + 61 + i * 24} fontSize="8" fontFamily="var(--mono)" fill={g.c}>
                    {w}
                  </text>
                </g>
              ))}
              {wrap(g.note, 42).map((l, i) => (
                <text key={i} x={44} y={g.y + 118 + i * 11} fontSize="7.2" fontFamily="var(--serif)" fill={DIM}>
                  {l}
                </text>
              ))}
            </g>
          ))}

          <text x={430} y={22} fontSize="7.8" fontFamily="var(--mono)" fill={DIM}>
            entities lit gold, relations lit blue: both levels run for every query
          </text>
          <GraphBody layout={layout} />
          {['lora', 'llm', 'qlora'].map((id) => (
            <circle key={id} cx={pos[id].x} cy={pos[id].y} r="17" fill="none" stroke={GOLD} strokeWidth="2.4" opacity="0.85" />
          ))}
          {RELATIONSHIPS.filter((r) => ['lora', 'llm', 'hyperparams', 'qlora'].includes(r.source) && ['lora', 'llm', 'hyperparams', 'qlora'].includes(r.target)).map((r) => (
            <line
              key={`${r.source}-${r.target}`}
              x1={pos[r.source].x}
              y1={pos[r.source].y}
              x2={pos[r.target].x}
              y2={pos[r.target].y}
              stroke={BLUE}
              strokeWidth="3"
              opacity="0.75"
            />
          ))}
          <Legend x={430} />
        </g>
      )}

      {/* ═══════════ PathRAG 1: indexing graph ═══════════ */}
      {stage === 'pr-index' && (
        <g>
          <Panel x={24} y={60} w={340} h={200} />
          <Eyebrow x={44} y={86}>
            A CONVENTIONAL INDEXING GRAPH
          </Eyebrow>
          <line x1={44} y1={96} x2={344} y2={96} stroke={LINE} />
          {['chunk the documents', 'extract entities and relations', 'merge duplicates', 'store nodes, edges and their text'].map((t, i) => (
            <g key={t}>
              <circle cx={51} cy={119 + i * 30} r="2.6" fill={DIM} />
              <text x={64} y={122 + i * 30} fontSize="8.4" fontFamily="var(--serif)" fill="#4a453f">
                {t}
              </text>
            </g>
          ))}
          <text x={44} y={244} fontSize="7.2" fontFamily="var(--mono)" fill={DIM}>
            reference implementation builds on the LightRAG codebase
          </text>

          <Panel x={24} y={290} w={340} h={170} accent={ACCENT} />
          <Eyebrow x={44} y={316} fill={ACCENT}>
            THE PROBLEM BEING ATTACKED
          </Eyebrow>
          <line x1={44} y1={326} x2={344} y2={326} stroke={LINE} />
          {wrap(
            'The limitation of current graph-based RAG methods lies in the redundancy of the retrieved information, rather than its insufficiency. Flat prompt structure makes it worse.',
            46,
          ).map((l, i) => (
            <text key={i} x={44} y={348 + i * 13} fontSize="8.2" fontFamily="var(--serif)" fill="#4a453f">
              {l}
            </text>
          ))}
          <text x={44} y={438} fontSize="7.2" fontFamily="var(--mono)" fill={ACCENT}>
            both are retrieval problems, not indexing problems
          </text>

          <text x={430} y={22} fontSize="7.8" fontFamily="var(--mono)" fill={DIM}>
            no community hierarchy: retrieval will navigate this graph directly
          </text>
          <GraphBody layout={layout} />
          <Legend x={430} />
        </g>
      )}

      {/* ═══════════ PathRAG 2: anchor nodes ═══════════ */}
      {stage === 'pr-nodes' && (
        <g>
          <Panel x={24} y={40} w={340} h={110} accent={ACCENT} strong />
          <Eyebrow x={44} y={68} fill={ACCENT}>
            QUERY
          </Eyebrow>
          {wrap('How does a small team choose between LoRA and a full fine-tune?', 46).map((l, i) => (
            <text key={i} x={44} y={94 + i * 14} fontSize="9" fontFamily="var(--serif)" fill={INK}>
              {l}
            </text>
          ))}

          <Panel x={24} y={182} w={340} h={278} />
          <Eyebrow x={44} y={208}>
            KEYWORDS → NODES
          </Eyebrow>
          <text x={344} y={208} fontSize="7" fontFamily="var(--mono)" fill={DIM} textAnchor="end">
            cosine similarity
          </text>
          <line x1={44} y1={218} x2={344} y2={218} stroke={LINE} />
          {[
            ['LoRA', 'LORA', 0.91],
            ['fine-tune', 'LARGE LANGUAGE MODELS', 0.78],
            ['small team', 'HYPERPARAMETERS', 0.64],
            ['quantisation', 'QLORA', 0.59],
          ].map(([kw, node, score], i) => (
            <g key={kw as string}>
              <rect x={44} y={236 + i * 56} width={(kw as string).length * 5.4 + 14} height={17} rx="8.5" fill={ACCENT} fillOpacity="0.12" />
              <text x={51} y={248 + i * 56} fontSize="7.8" fontFamily="var(--mono)" fill={ACCENT}>
                {kw}
              </text>
              <text x={44} y={270 + i * 56} fontSize="8" fontFamily="var(--mono)" fontWeight="600" fill={INK}>
                → {node}
              </text>
              <text x={344} y={270 + i * 56} fontSize="7.4" fontFamily="var(--mono)" fill={DIM} textAnchor="end">
                {(score as number).toFixed(2)}
              </text>
            </g>
          ))}
          <text x={44} y={452} fontSize="7.2" fontFamily="var(--mono)" fill={DIM}>
            paper retrieves N = 40 candidate nodes
          </text>

          <text x={430} y={22} fontSize="7.8" fontFamily="var(--mono)" fill={DIM}>
            these are endpoints of paths not yet found, not the context itself
          </text>
          <GraphBody layout={layout} highlight={anchors} />
          {[...anchors].map((id) => (
            <circle key={id} cx={pos[id].x} cy={pos[id].y} r="18" fill="none" stroke={ACCENT} strokeWidth="1.8">
              <animate attributeName="r" values="14;24;14" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.9;0;0.9" dur="2s" repeatCount="indefinite" />
            </circle>
          ))}
          <Legend x={430} />
        </g>
      )}

      {/* ═══════════ PathRAG 3: flow pruning ═══════════ */}
      {stage === 'pr-flow' && (
        <g>
          <Panel x={24} y={34} w={340} h={196} />
          <Eyebrow x={44} y={60}>
            RESOURCE PROPAGATION
          </Eyebrow>
          <text x={344} y={60} fontSize="7" fontFamily="var(--mono)" fill={ACCENT} textAnchor="end">
            α = 0.7
          </text>
          <line x1={44} y1={70} x2={344} y2={70} stroke={LINE} />
          <text x={44} y={92} fontSize="9" fontFamily="var(--mono)" fill={INK}>
            S(v_start) = 1.0
          </text>
          <text x={44} y={116} fontSize="8.4" fontFamily="var(--mono)" fill={INK}>
            S(v_i) = Σ α · S(v_j) / |N(v_j)|
          </text>
          {wrap('Decayed by α, then split across the neighbour’s out-edges. A hub passes only a thin share along each edge, so hubs fade instead of dominating.', 46).map((l, i) => (
            <text key={i} x={44} y={140 + i * 12} fontSize="7.6" fontFamily="var(--serif)" fill={DIM}>
              {l}
            </text>
          ))}
          <line x1={44} y1={192} x2={344} y2={192} stroke={LINE} strokeDasharray="2 3" />
          <text x={44} y={212} fontSize="8.4" fontFamily="var(--mono)" fill={ACCENT}>
            stop when S(v_i) / |N(v_i)| &lt; θ
          </text>

          <Panel x={24} y={258} w={340} h={202} />
          <Eyebrow x={44} y={284}>
            DECAY BY HOP
          </Eyebrow>
          <line x1={44} y1={294} x2={344} y2={294} stroke={LINE} />
          {[0, 1, 2, 3, 4].map((hop) => {
            const v = Math.pow(0.7, hop) / (hop === 0 ? 1 : 2)
            return (
              <g key={hop}>
                <text x={44} y={318 + hop * 30} fontSize="7.6" fontFamily="var(--mono)" fill={DIM}>
                  hop {hop}
                </text>
                <rect x={90} y={310 + hop * 30} width={220} height={9} rx="4.5" fill="#efece6" />
                <rect x={90} y={310 + hop * 30} width={Math.max(220 * v, 2)} height={9} rx="4.5" fill={hop > 2 ? '#c9c3ba' : ACCENT} fillOpacity={hop > 2 ? 0.5 : 0.85} />
                <text x={344} y={318 + hop * 30} fontSize="7.2" fontFamily="var(--mono)" fill={hop > 2 ? '#c9c3ba' : DIM} textAnchor="end">
                  {v.toFixed(3)}
                </text>
              </g>
            )
          })}
          <text x={44} y={452} fontSize="7" fontFamily="var(--mono)" fill={DIM}>
            distance awareness falls out of the decay, no fixed hop limit
          </text>

          <text x={430} y={22} fontSize="7.8" fontFamily="var(--mono)" fill={DIM}>
            flow spreading from the anchors, fading with distance and branching
          </text>
          <GraphBody layout={layout} />
          {RELATIONSHIPS.map((r) => {
            const inPath = pathNodes.includes(r.source) && pathNodes.includes(r.target)
            if (!inPath) return null
            return (
              <line
                key={`f-${r.source}-${r.target}`}
                x1={pos[r.source].x}
                y1={pos[r.source].y}
                x2={pos[r.target].x}
                y2={pos[r.target].y}
                stroke={ACCENT}
                strokeWidth="3.4"
                opacity="0.85"
                strokeDasharray="7 5"
              >
                <animate attributeName="stroke-dashoffset" values="24;0" dur="1.3s" repeatCount="indefinite" />
              </line>
            )
          })}
          {pathNodes.map((id, i) => (
            <g key={id}>
              <rect x={pos[id].x - 20} y={pos[id].y + 14} width={40} height={15} rx="7" fill="#fff" stroke={ACCENT} strokeOpacity="0.5" />
              <text x={pos[id].x} y={pos[id].y + 25} fontSize="7.2" fontFamily="var(--mono)" fill={ACCENT} textAnchor="middle">
                {(Math.pow(0.7, i) / (i === 0 ? 1 : 2)).toFixed(2)}
              </text>
            </g>
          ))}
          <Legend x={430} />
        </g>
      )}

      {/* ═══════════ PathRAG 4: score paths ═══════════ */}
      {stage === 'pr-score' && (
        <g>
          <text x={28} y={26} fontSize="7.8" fontFamily="var(--mono)" fill={DIM}>
            the retrieved unit is a path: an ordered chain of entities and the relations joining them
          </text>
          {[
            { n: 1, p: ['LORA', 'LARGE LANGUAGE MODELS'], r: 0.74 },
            { n: 2, p: ['QLORA', 'LORA', 'HYPERPARAMETERS'], r: 0.68 },
            { n: 3, p: ['LORA', 'HYPERPARAMETERS', 'EVALUATION METRICS'], r: 0.52 },
            { n: 15, p: ['HEALTHCARE', 'FEDERATED LEARNING', 'DIFFERENTIAL PRIVACY'], r: 0.11 },
          ].map((row, i) => (
            <g key={row.n} opacity={i === 3 ? 0.55 : 1}>
              <Panel x={28} y={44 + i * 108} w={560} h={92} accent={i === 3 ? undefined : ACCENT} />
              <text x={48} y={70 + i * 108} fontSize="7.4" fontFamily="var(--mono)" fill={DIM}>
                path {row.n}
              </text>
              <text x={568} y={70 + i * 108} fontSize="8.6" fontFamily="var(--mono)" fontWeight="600" fill={i === 3 ? DIM : ACCENT} textAnchor="end">
                {row.r.toFixed(2)}
              </text>
              <rect x={48} y={78 + i * 108} width={520} height={5} rx="2.5" fill="#efece6" />
              <rect x={48} y={78 + i * 108} width={520 * row.r} height={5} rx="2.5" fill={i === 3 ? '#c9c3ba' : ACCENT} />
              {row.p.map((n, k) => (
                <g key={n}>
                  <text x={48 + k * 0} y={102 + i * 108 + k * 13} fontSize="8" fontFamily="var(--mono)" fill={INK}>
                    {k > 0 ? '  → ' : ''}
                    {n}
                  </text>
                </g>
              ))}
            </g>
          ))}
          <text x={28} y={480} fontSize="7.4" fontFamily="var(--mono)" fill={DIM}>
            reliability = average resource across the path’s edges · paper keeps K = 15
          </text>

          <Panel x={616} y={44} w={516} h={200} />
          <Eyebrow x={636} y={70}>
            WHY AVERAGE, NOT SUM
          </Eyebrow>
          <line x1={636} y1={80} x2={1112} y2={80} stroke={LINE} />
          {wrap(
            'Summing would reward a path purely for being long, which is precisely the redundancy the method exists to cut. Averaging asks how concentrated the flow stayed, so a short direct route beats a rambling one through a hub.',
            64,
          ).map((l, i) => (
            <text key={i} x={636} y={102 + i * 14} fontSize="8.4" fontFamily="var(--serif)" fill="#4a453f">
              {l}
            </text>
          ))}
          <text x={636} y={222} fontSize="7.4" fontFamily="var(--mono)" fill={ACCENT}>
            two paths through the same hub score alike, so only the better survives
          </text>

          <Panel x={616} y={268} w={516} h={192} />
          <Eyebrow x={636} y={294}>
            PATH AS TEXT
          </Eyebrow>
          <line x1={636} y1={304} x2={1112} y2={304} stroke={LINE} />
          <text x={636} y={326} fontSize="8.4" fontFamily="var(--mono)" fontWeight="600" fill={INK}>
            QLORA → LORA → HYPERPARAMETERS
          </text>
          {['"QLoRA extends LoRA with quantisation."', '"Rank and alpha are LoRA-specific hyperparameters."'].map((t, i) => (
            <text key={i} x={636} y={350 + i * 16} fontSize="8" fontFamily="var(--serif)" fill="#4a453f">
              {t}
            </text>
          ))}
          {wrap('Rendered in order, the path carries an explicit chain of reasoning a bag of chunks cannot.', 62).map((l, i) => (
            <text key={i} x={636} y={396 + i * 13} fontSize="7.8" fontFamily="var(--serif)" fill={DIM}>
              {l}
            </text>
          ))}
        </g>
      )}

      {/* ═══════════ PathRAG 5: path prompting ═══════════ */}
      {stage === 'pr-prompt' && (
        <g>
          {/* the prompt template */}
          <rect x={24} y={34} width={520} height={426} rx="11" fill="url(#ink-sheen)" filter="url(#cardshadow)" />
          <text x={44} y={62} fontSize="7.6" fontFamily="var(--mono)" fontWeight="600" fill="#8ea297" letterSpacing="0.1em">
            PROMPT TEMPLATE
          </text>
          <text x={524} y={62} fontSize="7" fontFamily="var(--mono)" fill="#6d8177" textAnchor="end">
            reliability ascending
          </text>
          <line x1={44} y1={72} x2={524} y2={72} stroke="#2b4034" />
          {[
            { n: 15, r: 0.11, p: 'HEALTHCARE → FEDERATED LEARNING → DP' },
            { n: 9, r: 0.28, p: 'ARD → WILDGUARD MIX3 → ADVERSARIAL TRAINING' },
            { n: 3, r: 0.52, p: 'LORA → HYPERPARAMETERS → EVALUATION METRICS' },
            { n: 2, r: 0.68, p: 'QLORA → LORA → HYPERPARAMETERS' },
            { n: 1, r: 0.74, p: 'LORA → LARGE LANGUAGE MODELS' },
          ].map((row, i) => (
            <g key={row.n}>
              <rect x={44} y={90 + i * 56} width={480} height={44} rx="6" fill="#ffffff" fillOpacity={0.04 + i * 0.03} />
              <text x={56} y={108 + i * 56} fontSize="7.2" fontFamily="var(--mono)" fill="#6d8177">
                path {row.n}
              </text>
              <text x={512} y={108 + i * 56} fontSize="7.4" fontFamily="var(--mono)" fill={i === 4 ? '#e8b4b4' : '#8ea297'} textAnchor="end">
                {row.r.toFixed(2)}
              </text>
              <text x={56} y={124 + i * 56} fontSize="7.8" fontFamily="var(--mono)" fill={i >= 3 ? '#e3ede7' : '#a8bcb1'}>
                {row.p}
              </text>
            </g>
          ))}
          <line x1={44} y1={378} x2={524} y2={378} stroke="#2b4034" />
          <text x={44} y={398} fontSize="7.6" fontFamily="var(--mono)" fill="#8ea297">
            --- Question ---
          </text>
          {wrap('How does a small team choose between LoRA and a full fine-tune?', 58).map((l, i) => (
            <text key={i} x={44} y={416 + i * 13} fontSize="8" fontFamily="var(--serif)" fill="#d3e0d9">
              {l}
            </text>
          ))}

          {/* attention curve */}
          <Panel x={578} y={34} w={554} h={224} />
          <Eyebrow x={598} y={60}>
            LOST IN THE MIDDLE
          </Eyebrow>
          <line x1={598} y1={70} x2={1112} y2={70} stroke={LINE} />
          {(() => {
            const x0 = 610
            const x1 = 1100
            const yb = 214
            const yt = 96
            const pts: string[] = []
            for (let i = 0; i <= 40; i++) {
              const t = i / 40
              const att = 0.35 + 0.65 * Math.pow(Math.abs(t - 0.5) * 2, 1.7)
              pts.push(`${x0 + t * (x1 - x0)},${yb - att * (yb - yt)}`)
            }
            return (
              <g>
                <line x1={x0} y1={yb} x2={x1} y2={yb} stroke="#ddd8d0" />
                <polyline points={pts.join(' ')} fill="none" stroke={ACCENT} strokeWidth="2" opacity="0.8" />
                <text x={x0} y={yb + 14} fontSize="7" fontFamily="var(--mono)" fill={DIM}>
                  start of prompt
                </text>
                <text x={x1} y={yb + 14} fontSize="7" fontFamily="var(--mono)" fill={DIM} textAnchor="end">
                  end of prompt
                </text>
                <text x={(x0 + x1) / 2} y={yb + 14} fontSize="7" fontFamily="var(--mono)" fill={DIM} textAnchor="middle">
                  middle
                </text>
                <text x={598} y={90} fontSize="7" fontFamily="var(--mono)" fill={DIM}>
                  attention
                </text>
                <circle cx={x1 - 6} cy={yt + 4} r="4.5" fill={ACCENT} />
                <text x={x1 - 16} y={yt + 7} fontSize="7.4" fontFamily="var(--mono)" fill={ACCENT} textAnchor="end">
                  most reliable path sits here
                </text>
              </g>
            )
          })()}

          <Panel x={578} y={286} w={554} h={174} accent={ACCENT} />
          <Eyebrow x={598} y={312} fill={ACCENT}>
            THE ORDERING DECISION
          </Eyebrow>
          <line x1={598} y1={322} x2={1112} y2={322} stroke={LINE} />
          {wrap(
            'Paths are organised in a reliability ascending order, ensuring that the most reliable relational path is positioned at the end of the template. The stated aim is to put the most critical information at the two ends, where models attend most.',
            70,
          ).map((l, i) => (
            <text key={i} x={598} y={344 + i * 14} fontSize="8.4" fontFamily="var(--serif)" fill="#4a453f">
              {l}
            </text>
          ))}
          <text x={598} y={438} fontSize="7.4" fontFamily="var(--mono)" fill={DIM}>
            flow pruning and prompt ordering are portable to any graph-RAG stack
          </text>
        </g>
      )}
    </svg>
  )
}
