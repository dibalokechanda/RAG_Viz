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
/* A panel entry is either a plain paragraph (framing, caveats, cost notes) or
   a numbered step. Keeping both in one ordered list lets a stage open with
   context, walk the steps, and close with the consequence. */
interface Step {
  step: number
  title: string
  body: string
}
type Note = string | Step
const isStep = (n: Note): n is Step => typeof n !== 'string'

interface Stage {
  key: StageKey
  group: 'index' | 'search'
  chip: string
  title: string
  caption: string
  panel: Note[]
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
      "GraphRAG and vanilla RAG share exactly one stage, and this is it. From the next step on the two diverge completely.",
      { step: 1, title: "Load the corpus", body: "The example indexes the survey paper *The Ultimate Guide to Fine-Tuning LLMs*, loaded as plain text with the index, glossary and references stripped out. Those sections are dense in proper nouns that the extractor would happily promote into entities carrying no real relationships, which inflates the graph without adding anything to it." },
      { step: 2, title: "Count in tokens, not characters", body: "LangChain’s **TokenTextSplitter** counts what the model counts. Everything downstream is billed and bounded in tokens, so a character splitter would cut where the model does not, and effective chunk size would drift with language and punctuation density." },
      { step: 3, title: "Cut 1200-token windows", body: "Size is a direct cost lever, and it cuts both ways. Larger chunks mean fewer extraction calls over the corpus, but each call has more text to reason about, and extractors reliably start dropping relationships stated in the middle of a long passage." },
      { step: 4, title: "Overlap by 100 tokens", body: "Every window repeats the last 100 tokens of the one before it. This matters more here than in vanilla RAG. A relationship stated across a chunk boundary is a relationship the extractor never sees, and **a missing edge is invisible**: no error, no empty result, just a graph that comes out sparser than it should be, with nothing to compare it against." },
      "**What you have at the end.** A list of overlapping strings, and nothing else. Nothing has been embedded, no model has been called. Everything expensive starts on the next stage.",
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
      "This is where GraphRAG’s indexing cost lives: one LLM call per chunk, across the entire corpus.",
      { step: 1, title: "Send one chunk with the extraction prompt", body: "The prompt carries a configured list of entity types plus two worked examples. Temperature is **0**, and that is not a stylistic choice: the extractor has to be reproducible, because if two runs over the same chunk disagree about a name, the graph changes shape between builds." },
      { step: 2, title: "The model returns entities", body: "Each carries a name (capitalised, which becomes the join key at merge time), a type drawn from the configured list, and a description written from **this chunk’s** wording. The same entity pulled from a different chunk comes back described differently. That is expected, and stage 3 resolves it." },
      { step: 3, title: "And relationships", body: "Source, target, a description of *why* they are related, and a **strength score of 1 to 10**. That score becomes the edge weight, which means it decides which entities are pulled into the same community two stages from now. It is the single most consequential number the extractor produces." },
      { step: 4, title: "Parse, do not deserialise", body: "The output is delimited plain text rather than JSON: fields separated by a tuple delimiter, records by a record delimiter, and a completion delimiter to close. Delimited text degrades more gracefully than strict JSON when a model drifts mid-response." },
      { step: 5, title: "Optionally, glean", body: "GraphRAG can re-ask the model \"did you miss any?\" for a configured number of extra rounds. Each round is another full call over the same chunk, so gleaning trades money directly for recall." },
      "**The number that matters.** Roughly one call per chunk, multiplied by gleaning rounds. Embedding the same corpus for vanilla RAG is orders of magnitude cheaper. What the extra spend buys you is the graph.",
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
      "Each chunk produced its own small, disconnected graph. Individually they are close to useless; the value appears only once they are one graph.",
      { step: 1, title: "Collect every sub-graph", body: "n chunks give n sub-graphs, and most of them mention some of the same entities under some of the same names." },
      { step: 2, title: "Resolve entities by normalised name", body: "`CROSS-ENTROPY` extracted from three different chunks becomes **one node with degree three**, not three nodes. This is why the extraction prompt insists on capitalised names: the name *is* the join key. An entity the model names inconsistently across chunks will silently fail to merge." },
      { step: 3, title: "Summarise the competing descriptions", body: "A node that accumulated three descriptions does not get them concatenated. The LLM writes one canonical description covering all of them, and the same happens to duplicate relationships. This is a second round of LLM calls, proportional to the number of duplicated entities rather than to the corpus." },
      { step: 4, title: "Keep provenance", body: "Every node and edge records the chunks it came from, in `text_unit_ids`. That thread is what lets local search hand back the original prose later, and it is the reason an answer can be audited back to a sentence in the source." },
      "**The result is one graph over the whole corpus.** Every stage after this reads the graph rather than the text, apart from local search, which follows provenance back to the chunks.",
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
      "A graph alone does not tell you what a corpus is *about*. Community detection is the step that turns structure into topics.",
      { step: 1, title: "Weight the edges by relationship strength", body: "The 1 to 10 score from extraction becomes the edge weight, so strongly-stated relationships pull harder. The partition ends up reflecting what the source text actually emphasised, not just which names happened to co-occur." },
      { step: 2, title: "Run Leiden", body: "A modularity-optimising algorithm that groups nodes more densely connected to each other than to the rest of the graph. It is the successor to Louvain and fixes its known defect of producing communities that are internally disconnected." },
      { step: 3, title: "Recurse to build a hierarchy", body: "Level 0 is a coarse partition of the whole graph. Each community is then clustered again to give level 1, and so on. Higher levels mean smaller, more specific communities." },
      { step: 4, title: "Record one row per (entity, level)", body: "Which is why a single entity appears several times in the node table with different community ids. That nesting is exactly what `--community-level` selects between at query time." },
      "**Why this stage is the pivot.** Without a partition there is nothing to summarise and global search has nothing to map over. You would be back to summarising the entire corpus in one call, which is the problem GraphRAG exists to solve.",
    ],
  },
  {
    key: 'embed',
    group: 'index',
    chip: '5 · Node2Vec',
    title: 'Individual node embedding via Node2Vec',
    caption: 'Random walks over the graph are fed to skip-gram, giving each entity a vector that encodes its structural position.',
    panel: [
      "The one optional indexing stage, and the only one that embeds **structure** rather than text.",
      { step: 1, title: "Walk the graph", body: "Run many short random walks starting from each node. `num_walks` sets how many begin at each node, `walk_length` how far each one goes." },
      { step: 2, title: "Treat each walk as a sentence", body: "A walk is a sequence of node ids, handled exactly as word2vec handles a sequence of words. The graph has been turned into a corpus." },
      { step: 3, title: "Train skip-gram over the walks", body: "Two entities end up close in the resulting space if they sit in **similar neighbourhoods**, even when their names and descriptions have nothing in common. That is the property text embeddings cannot give you." },
      { step: 4, title: "Bias the walk with p and q", body: "Low `q` pushes the walk outward and captures structural roles; low `p` keeps it local and captures communities. Defaults of 1.0 sit between the two behaviours." },
      "**What it is used for.** Seeding entity lookup at query time, and the x/y coordinates that lay a graph out in a visualiser. Search still works without it, which is why this is the one indexing step you can skip.",
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
      "This is the artifact that makes GraphRAG different: a set of pre-computed, hierarchical summaries of the whole corpus, written **before any question is asked**.",
      { step: 1, title: "Work bottom-up, one call per community", body: "Leaf communities are summarised from their entities and relationships. Higher levels are summarised from their *children’s reports*, never from raw text, which is what keeps cost bounded as the hierarchy deepens." },
      { step: 2, title: "Generate the report", body: "Structured JSON: a title, an executive summary, an **impact severity rating of 0 to 10** with an explanation, and a list of findings each carrying its own grounded explanation. Flattened into the `full_content` column it runs to several hundred words." },
      { step: 3, title: "Cite the evidence", body: "Findings carry `[Data: Entities (206); Relationships (281, 326)]` markers, so a claim in a report traces back to the graph, and from the graph back to the source chunk." },
      { step: 4, title: "Summarise the report again", body: "That report is then compressed into a single paragraph, stored separately as `summary`. A summary of a summary, and deliberately short." },
      { step: 5, title: "Embed the summary, not the report", body: "It is **`summary`** that goes through the embedding model and into the vector store, not `full_content`. Global search maps over those summaries, so the length here directly decides how many communities fit into one map call. The full report is pulled in only once a community has actually been selected." },
      "**Indexing ends here.** Everything from this point on happens at query time, against artifacts that already exist on disk.",
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
      "For specific questions about particular things: \"what is LoRA and how does it relate to hyperparameters\".",
      { step: 1, title: "Seed", body: "The query is embedded and matched against entity descriptions, returning the entities the question is actually about. If the query names nothing in the graph, local search has nothing to stand on, and that is the failure mode to watch for." },
      { step: 2, title: "Expand", body: "From those seeds it gathers connected entities, the relationships between them, the **source chunks** they were extracted from, and the **community reports** those entities belong to. Four different kinds of evidence, from one seed." },
      { step: 3, title: "Rank", body: "Candidates are prioritised before anything is packed. Relationships are ordered partly by `combined_degree`, the sum of both endpoints’ degrees, so the best-connected evidence survives the cut." },
      { step: 4, title: "Fit the context window", body: "Each evidence type gets a share of the token budget, tuned by `local_search_text_unit_prop` and `local_search_community_prop`. Nothing is truncated arbitrarily; the proportions are a deliberate configuration choice." },
      "**The context is deliberately heterogeneous**, and that is the point. The graph tells the model how things connect; the chunks tell it what was actually said. Cost sits at index time, so an individual local query is cheap.",
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
      "For broad, whole-corpus questions: \"what are the main themes\", \"what changed across these documents\". No single chunk contains that answer, which is why vanilla RAG structurally cannot serve them.",
      { step: 1, title: "Choose a level", body: "The hierarchy level decides which communities are in play. A low level means few, broad communities: cheap and general. A higher level means many specific ones: more calls, more detail. This is the main dial you have." },
      { step: 2, title: "Map", body: "Community report **summaries** at that level are batched into context. Each batch comes back with a list of key points, each carrying an **importance score of 0 to 100**. One LLM call per batch, all independent, so they parallelise." },
      { step: 3, title: "Reduce", body: "Points are pooled across every batch, low scorers dropped, duplicates merged, and the survivors synthesised into a single response with their `[Data: Reports (...)]` references intact." },
      "**Where the cost sits.** Unlike local search, the number of map calls scales with the number of community reports, so global search pays at query time rather than index time. Raising the level makes answers sharper and every query more expensive.",
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
      "**Dynamic Reasoning and Inference with Flexible Traversal.** Microsoft’s third search mode, and the one that stops local and global being an either/or choice. It runs a global-flavoured primer first, then local-style searches over the questions that primer raises.",
      { step: 1, title: "Retrieve", body: "The query is embedded and compared against the embedded community reports, and the **top-k** most semantically similar come back. Microsoft also **expand the query with HyDE** here, writing a hypothetical answer to raise recall, on the reasoning that a written passage sits closer in vector space to real corpus text than a bare question does." },
      { step: 2, title: "Prime", body: "Those reports produce a broad initial answer plus a list of follow-up questions. It is a lightweight global-*style* primer, not a run of global search: it reads a handful of reports rather than mapping over all of them, which is exactly why it is cheap." },
      { step: 3, title: "Refine", body: "Each follow-up launches a **local-style retrieval**, augmented with community context and carrying state between rounds rather than re-invoking standalone local search. Each returns an intermediate answer and new follow-ups. Being informed by **both** community-level and entity-level data is what lets DRIFT stay useful when the query diverges from the persona the index was built for." },
      { step: 4, title: "Loop", body: "The original announcement described a termination criterion \"currently configured for two iterations\", but the shipped library exposes **`n_depth`**, alongside `drift_k_followups` and `primer_folds`. Microsoft’s own example notebook uses `n_depth=3`. A learned reward function for smarter termination is still noted as future work." },
      { step: 5, title: "Synthesise", body: "The result is a hierarchy of question and answer nodes ranked by relevance to the original query, reduced into one response. This is a final synthesis over that hierarchy, not the map-reduce that global search runs." },
      "**What you get for the extra calls.** The broad framing of a global answer with the concrete detail of a local one. It is the most expensive of the three modes, and the only one that adapts its own search path as it goes.",
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
          {stage.panel.map((p, i) =>
            isStep(p) ? (
              <div className={`gr-step ${stage.group === 'search' ? 'search' : ''}`} key={i}>
                <span className="gr-step-n">{p.step}</span>
                <div className="gr-step-text">
                  <h4>{p.title}</h4>
                  <div className="markdown-content">
                    <ReactMarkdown>{p.body}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ) : (
              <div className="markdown-content gr-para" key={i}>
                <ReactMarkdown>{p}</ReactMarkdown>
              </div>
            ),
          )}

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
