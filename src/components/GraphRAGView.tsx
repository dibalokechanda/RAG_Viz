import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import GraphRAGViz, { type StageKey } from './GraphRAGViz'
import {
  CHUNKING,
  EXTRACTION_OUTPUT,
  EXTRACTION_PROMPT,
  GLOBAL_PROMPT,
  LOCAL_PROMPT,
  MERGE_EXAMPLE,
  NODE2VEC_CODE,
  PAPER,
  REPORT_OUTPUT,
  REPORT_PROMPT,
  REPORT_VS_SUMMARY,
  DRIFT_FLOW,
  DRIFT_OUTPUT,
} from '../data/graphrag'
import { NOTEBOOK, NOTEBOOK_REPO, NOTEBOOK_TOTAL } from '../data/notebook'
import NotebookModal from './NotebookModal'

interface Card {
  label: string
  /** right-aligned note in the card header, saying what this text actually is */
  hint: string
  body: string
}
interface Stage {
  key: StageKey
  group: 'index' | 'search'
  chip: string
  title: string
  caption: string
  panel: string[]
  cards?: Card[]
}

const STAGES: Stage[] = [
  {
    key: 'load',
    group: 'index',
    chip: '1 · Load & split',
    title: 'Loading and splitting text into chunks',
    caption: `The source PDF is tokenised and cut into ${CHUNKING.size}-token windows with a ${CHUNKING.overlap}-token overlap.`,
    panel: [
      `The corpus here is the survey paper *${PAPER.title}*. It is loaded, stripped to plain text, and split with LangChain's **${CHUNKING.splitter}**.`,
      `**Why token-based, not character-based.** Everything downstream is billed and bounded in tokens, so the splitter counts what the model counts. Size **${CHUNKING.size}**, overlap **${CHUNKING.overlap}**.`,
      '**Why the overlap matters more here than in vanilla RAG.** A relationship stated across a chunk boundary is a relationship the extractor never sees, and a missing edge is invisible: the graph simply comes out sparser, with no error anywhere.',
      '**This is the only stage GraphRAG shares with vanilla RAG.** From the next step on, the two diverge completely.',
    ],
    cards: [
      {
        label: 'Chunk text',
        hint: 'one chunk, verbatim',
        body: `# chunk_04  (1200 tokens, overlaps chunk_03 by 100)\n\n${PAPER.paragraphs[0]}\n\n${PAPER.paragraphs[1]}`,
      },
    ],
  },
  {
    key: 'extract',
    group: 'index',
    chip: '2 · Extract',
    title: 'Extracting entities & relationships with an LLM',
    caption: 'Every chunk goes to the LLM with the extraction prompt; the model returns delimited entity and relationship tuples.',
    panel: [
      '**One LLM call per chunk.** This is the expensive step, and the reason GraphRAG indexing costs orders of magnitude more than embedding the same corpus.',
      '**Entities** come back with a name, a type drawn from a configured list, and a description written from that chunk’s wording.',
      '**Relationships** come back as source, target, a description of *why* they are related, and a **strength score 1-10**. That score is what later weights the graph.',
      '**The output is plain delimited text**, not JSON, using `<|>` between fields and `##` between records, ending with `<|COMPLETE|>`. It is parsed rather than deserialised.',
      '**Gleaning.** GraphRAG can re-ask the model ("did you miss any?") for a configurable number of extra rounds, trading cost for recall.',
    ],
    cards: [
      { label: 'Extraction prompt', hint: 'sent to the model', body: EXTRACTION_PROMPT },
      { label: 'LLM output', hint: 'raw model response', body: EXTRACTION_OUTPUT },
    ],
  },
  {
    key: 'merge',
    group: 'index',
    chip: '3 · Merge',
    title: 'Merging and summarising per-chunk sub-graphs',
    caption: 'Each chunk produced its own little graph. Identical entities are collapsed and their competing descriptions summarised.',
    panel: [
      '**Each chunk yields a disconnected sub-graph.** On their own they are useless; the value appears when they are merged into one graph of the whole corpus.',
      '**Entity resolution is by normalised name.** `CROSS-ENTROPY` extracted from three different chunks is one node with degree three, not three nodes.',
      '**Descriptions are summarised, not concatenated.** When a node accumulates several descriptions the LLM writes one canonical description covering all of them. The same applies to duplicate relationships.',
      '**Provenance is kept.** Every node and edge remembers which chunks it came from, which is what lets local search return the original source text later.',
    ],
    cards: [{ label: 'Merge & summarise', hint: 'before and after', body: MERGE_EXAMPLE }],
  },
  {
    key: 'communities',
    group: 'index',
    chip: '4 · Communities',
    title: 'Community detection via hierarchical Leiden',
    caption: 'Leiden partitions the graph into clusters of densely-connected entities, recursively, producing a hierarchy of levels.',
    panel: [
      '**Leiden is a modularity-optimising clustering algorithm.** It groups nodes that are more densely connected to each other than to the rest of the graph. It is the successor to Louvain and fixes its badly-connected-community defect.',
      '**Hierarchical means recursive.** Level 0 is a coarse partition of the whole graph; each community is then clustered again to give level 1, and so on. Higher levels are smaller, more specific communities.',
      '**Edge weight is the relationship strength** the extractor assigned, so strongly-stated relationships pull entities into the same community.',
      '**This is what makes global search possible.** Without a partition there is nothing to summarise; you would be back to summarising the entire corpus in one call.',
    ],
  },
  {
    key: 'embed',
    group: 'index',
    chip: '5 · Node2Vec',
    title: 'Individual node embedding via Node2Vec',
    caption: 'Random walks over the graph are fed to skip-gram, giving each entity a vector that encodes its structural position.',
    panel: [
      '**Node2Vec embeds graph structure, not text.** Two entities end up close if they sit in similar neighbourhoods, even when their names and descriptions share nothing.',
      '**How it works.** Run many short random walks from each node, treat each walk as a "sentence" of node ids, and train skip-gram over them exactly as word2vec does over text.',
      '**The p and q parameters bias the walk.** Low `q` explores outward (structural roles); low `p` keeps walks local (communities). Defaults of 1.0 sit between the two.',
      '**What it is used for.** Seeding entity lookup at query time, and driving the graph layout in the visualiser. It is optional: search still works without it.',
    ],
    cards: [{ label: 'Node2Vec', hint: 'python', body: NODE2VEC_CODE }],
  },
  {
    key: 'reports',
    group: 'index',
    chip: '6 · Community reports',
    title: 'Community report generation, summarisation & embedding',
    caption: 'Each community is written up as a full report, that report is summarised into one paragraph, and the summary is embedded.',
    panel: [
      '**One LLM call per community, bottom-up.** Leaf communities are summarised from their entities and relationships. Higher levels are summarised from their *children’s reports*, not from raw text, so the cost stays bounded.',
      '**Step 1, generation.** The report is structured JSON: a title, an executive summary, an **impact severity rating 0-10** with an explanation, and a list of findings each carrying its own grounded explanation. Flattened, it lands in the `full_content` column and runs to several hundred words.',
      '**Step 2, summarisation.** That report is then summarised again into a single paragraph, stored separately as `summary`. It is a summary of a summary, and it is deliberately short.',
      '**Step 3, embedding.** It is the **`summary`** that gets embedded and written to the vector store, not `full_content`. Global search maps over those short summaries, which is what keeps the number and size of map calls affordable; the full report is pulled in only once a community has been selected.',
      '**Findings cite their evidence** with `[Data: Entities (206); Relationships (281, 326)]` markers, so a claim in a report can be traced back to the graph and then to the source chunk.',
      '**This is the artifact that makes GraphRAG different.** A set of pre-computed, hierarchical summaries of the entire corpus, written before any question is asked.',
    ],
    cards: [
      { label: 'Report prompt', hint: 'sent to the model', body: REPORT_PROMPT },
      { label: 'Report output', hint: 'raw model response', body: REPORT_OUTPUT },
      { label: 'Report vs summary', hint: 'two columns, two jobs', body: REPORT_VS_SUMMARY },
    ],
  },
  {
    key: 'local',
    group: 'search',
    chip: 'Local search',
    title: 'Local search: entity-centred retrieval',
    caption: 'Seed from the entities named in the query, expand across the graph, and assemble a mixed context of entities, relationships and source text.',
    panel: [
      '**For specific questions** about particular things: "what is LoRA and how does it relate to hyperparameters".',
      '**Step 1, seed.** The query is embedded and matched against entity descriptions to find the entities it is about.',
      '**Step 2, expand.** From those seeds it collects connected entities, the relationships between them, the **source chunks** they were extracted from, and any **community reports** those entities belong to.',
      '**Step 3, rank and fit.** The candidates are prioritised and packed into the context window, each type getting a share of the budget.',
      '**The context is heterogeneous**, which is the point: structured graph facts alongside the original prose that produced them.',
    ],
    cards: [{ label: 'Local search prompt', hint: 'sent to the model', body: LOCAL_PROMPT }],
  },
  {
    key: 'global',
    group: 'search',
    chip: 'Global search',
    title: 'Global search: map-reduce over community reports',
    caption: 'The query is mapped over every community report at a chosen level, each returns scored points, and those are reduced into one answer.',
    panel: [
      '**For broad, whole-corpus questions**: "what are the main themes", "what changed across these documents". No single chunk contains that answer, so vanilla RAG structurally cannot produce it.',
      '**Map.** Community reports at the chosen hierarchy level are batched into the context. Each batch returns a list of key points, each with an **importance score 0-100**.',
      '**Reduce.** Points are pooled, the low scorers dropped, duplicates merged, and the survivors synthesised into the final response with their data references intact.',
      '**The level is the dial.** A low level means few, broad communities: cheap and general. A higher level means many specific communities: more calls, more detail.',
      '**Cost lands at query time here**, unlike local search, because the number of map calls scales with the number of community reports.',
    ],
    cards: [{ label: 'Map & reduce prompts', hint: 'two calls, two prompts', body: GLOBAL_PROMPT }],
  },
  {
    key: 'drift',
    group: 'search',
    chip: 'DRIFT search',
    title: 'DRIFT search: a global primer, then a local refinement loop',
    caption: 'The query retrieves the top-k community reports as a primer; every follow-up question that primer raises then drives a local-style search, for n_depth rounds.',
    panel: [
      '**Dynamic Reasoning and Inference with Flexible Traversal.** Microsoft’s third search mode, and the one that stops local and global being an either/or choice. It runs a global-flavoured primer first, then local-style searches over the questions that primer raises.',
      '**Step 1, retrieve.** The query is embedded and compared against the embedded community reports, and the **top-k** most semantically similar come back. Microsoft also **expand the query with HyDE** here, writing a hypothetical answer to raise recall, on the reasoning that a written passage sits closer in vector space to real corpus text than a bare question does.',
      '**Step 2, the primer.** Those reports produce a broad initial answer plus a list of follow-up questions. It is a lightweight global-*style* primer, not a run of global search: it reads a handful of reports rather than mapping over all of them, which is exactly why it is cheap.',
      '**Step 3, the refinement loop.** Each follow-up launches a **local-style retrieval**, augmented with community context and carrying state between rounds rather than re-invoking standalone local search. Each returns an intermediate answer and new follow-ups. Being informed by **both** community-level and entity-level data is what lets DRIFT stay useful when the query diverges from the persona the index was built for.',
      '**Step 4, synthesis.** The result is a hierarchy of question and answer nodes ranked by relevance to the original query, reduced into one response. This is a final synthesis over that hierarchy, not the map-reduce global search runs.',
      '**Depth is configurable.** The original announcement described a termination criterion "currently configured for two iterations", but the shipped library exposes **`n_depth`**, alongside `drift_k_followups` and `primer_folds`. Microsoft’s own example notebook uses `n_depth=3`. A learned reward function for smarter termination is still noted as future work.',
    ],
    cards: [
      { label: 'DRIFT flow', hint: 'the algorithm', body: DRIFT_FLOW },
      { label: 'DRIFT response', hint: 'real output, same question', body: DRIFT_OUTPUT },
    ],
  },
]

export default function GraphRAGView() {
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [cardTab, setCardTab] = useState(0)
  const [nbOpen, setNbOpen] = useState(false)
  const stage = STAGES[idx]
  const cells = NOTEBOOK[stage.key] ?? []
  const barRef = useRef<HTMLDivElement>(null)

  // On mobile the stage bar is a horizontal strip, so autoplay (and any jump
  // to a later stage) would otherwise move the selection off-screen. Centre it.
  // On desktop the bar wraps instead of scrolling, so this is a no-op.
  useEffect(() => {
    const bar = barRef.current
    const chip = bar?.querySelector<HTMLElement>('.gr-chip.on')
    if (!bar || !chip) return
    // Left-align to match scroll-snap-align: start, so the programmatic
    // scroll and the snap points agree and the chip lands whole.
    bar.scrollTo({ left: Math.max(0, chip.offsetLeft - 2), behavior: 'smooth' })
  }, [idx])

  useEffect(() => {
    setCardTab(0)
    setNbOpen(false)
  }, [idx])
  useEffect(() => {
    if (!playing) return
    const t = window.setTimeout(() => setIdx((i) => (i + 1) % STAGES.length), 9000)
    return () => clearTimeout(t)
  }, [idx, playing])

  const go = (i: number) => {
    setIdx(i)
    setPlaying(false)
  }

  return (
    <div className="graphrag-view">
      <div className="gr-main">
        <div className="gr-stagebar">
          <button className="gr-play" onClick={() => setPlaying((p) => !p)} title={playing ? 'Pause' : 'Play'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <div className="gr-groups" ref={barRef}>
          {/* Each group is its own nowrap row, so the bar breaks between
              Indexing and Search rather than through the middle of one. */}
          <div className="gr-group">
            <span className="gr-grouplabel">Indexing</span>
            {STAGES.filter((s) => s.group === 'index').map((s) => (
              <button key={s.key} className={`gr-chip ${s.key === stage.key ? 'on' : ''}`} onClick={() => go(STAGES.indexOf(s))}>
                {s.chip}
              </button>
            ))}
          </div>
          <div className="gr-group">
            <span className="gr-grouplabel">Search</span>
            {STAGES.filter((s) => s.group === 'search').map((s) => (
              <button key={s.key} className={`gr-chip search ${s.key === stage.key ? 'on' : ''}`} onClick={() => go(STAGES.indexOf(s))}>
                {s.chip}
              </button>
            ))}
          </div>
          </div>
        </div>

        <div className="gr-canvas">
          <GraphRAGViz stage={stage.key} />
        </div>
        <p className="gr-swipe">Swipe the diagram sideways to see all of it</p>

        <div className="gr-caption">{stage.caption}</div>

        {stage.cards && (
          <div className="gr-card">
            <div className="gr-card-head">
              {stage.cards.map((c, i) => (
                <button key={c.label} className={`gr-card-tab ${i === cardTab ? 'on' : ''}`} onClick={() => setCardTab(i)}>
                  {c.label}
                </button>
              ))}
              <span className="gr-card-hint">{stage.cards[cardTab]?.hint}</span>
            </div>
            <pre className="gr-card-body">{stage.cards[cardTab]?.body}</pre>
          </div>
        )}
      </div>

      <aside className="gr-panel">
        <div className="gr-panel-head">
          <span className={`gr-badge ${stage.group}`}>{stage.group === 'index' ? 'Indexing · offline' : 'Query time'}</span>
          <h3>{stage.title}</h3>
        </div>
        <div className="gr-panel-body">
          {stage.panel.map((p, i) => (
            <div className="markdown-content gr-para" key={i}>
              <ReactMarkdown>{p}</ReactMarkdown>
            </div>
          ))}

          {cells.length > 0 && (
            <section className="gr-nb">
              <button className="gr-nb-open" onClick={() => setNbOpen(true)}>
                <span className="gr-nb-open-icon">{'{ }'}</span>
                <span className="gr-nb-open-text">
                  <strong>Open the notebook</strong>
                  <em>
                    {cells.length === 1 ? `Cell ${cells[0].n}` : `Cells ${cells[0].n}–${cells[cells.length - 1].n}`} of{' '}
                    {NOTEBOOK_TOTAL}, runnable, with the captured output
                  </em>
                </span>
                <span className="gr-nb-open-arrow">↗</span>
              </button>
              <p className="gr-nb-lede">
                One kernel running top to bottom across all nine stages, from {NOTEBOOK_REPO}.
              </p>
            </section>
          )}

          <div className="gr-nav">
            <button disabled={idx === 0} onClick={() => go(idx - 1)}>
              ‹ Prev
            </button>
            <span>
              {idx + 1} / {STAGES.length}
            </span>
            <button disabled={idx === STAGES.length - 1} onClick={() => go(idx + 1)}>
              Next ›
            </button>
          </div>
        </div>
      </aside>

      {nbOpen && cells.length > 0 && (
        <NotebookModal cells={cells} stageTitle={stage.title} onClose={() => setNbOpen(false)} />
      )}
    </div>
  )
}
