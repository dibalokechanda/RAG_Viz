import type { Stage } from './types'

/**
 * PLATFORM / CONTROL PLANE, never on the query path.
 *
 * These stages decide what enters the corpus, who may see it, which versions
 * of everything are live, and whether a change is allowed to ship. They govern
 * the pipeline rather than participating in it, which is why they get their own
 * lane and no trace frames: a query never passes through here.
 */
export const platformStages: Stage[] = [
  {
    id: 'triggers',
    icon: 'sync',
    label: 'Ingestion Triggers',
    phase: 'platform',
    kind: 'sequential',
    ordinal: 'P1',
    tagline: 'What causes new content to enter the corpus',
    governs: ['loading', 'embedding', 'index'],
    detail: [
      'A corpus is not a snapshot; it is a stream. Something has to decide when new material enters, when changed material is refreshed, and when deleted material leaves.',
      '**Four common triggers**, in ascending order of freshness and complexity:',
      '- **Scheduled crawl**: re-walks the sources on a timer. Simple, but stale by up to one interval.',
      '- **Webhook**: fires when the source system says something changed. Near-real-time, but you inherit its reliability.',
      '- **Change data capture (CDC)**: tails a database log. Exact and ordered, but only works for databases.',
      '- **Manual upload**: covers the long tail of documents nobody automated.',
      '**The deletion path is the one that bites.** If a source document is removed and nothing removes its chunks, they stay in the index and keep being retrieved, confidently citing a document that no longer exists. Deletions must propagate as tombstones.',
    ],
    math: [
      {
        title: 'Freshness lag under a scheduled crawl',
        tex: String.raw`\mathbb{E}[\text{lag}] = \frac{T}{2} + t_{\text{ingest}}`,
        where: [
          { sym: String.raw`T`, means: 'crawl interval' },
          { sym: String.raw`t_{\text{ingest}}`, means: 'time to parse, chunk, embed and index' },
        ],
        worked: [
          { tex: String.raw`T = 24\text{h} \Rightarrow \mathbb{E}[\text{lag}] = 12\text{h} + 20\text{min}`, caption: 'nightly crawl' },
          { tex: String.raw`T = 15\text{min} \Rightarrow \mathbb{E}[\text{lag}] \approx 27\text{min}`, caption: 'ingest time now dominates' },
        ],
        note: 'Below a certain interval, shortening the schedule stops helping, the pipeline itself becomes the bottleneck. That is the point to switch to event-driven triggers rather than crawling harder.',
      },
      {
        title: 'Incremental vs. full rebuild',
        tex: String.raw`C_{\text{inc}} = |\Delta| \cdot c_{\text{chunk}}, \qquad C_{\text{full}} = N \cdot c_{\text{chunk}}`,
        worked: [
          { tex: String.raw`|\Delta| = 400,\ N = 10^6 \Rightarrow \text{2500}\times \text{cheaper}` },
        ],
        note: 'Which is why content-hash change detection matters: without it every run re-embeds the entire corpus to discover that almost nothing moved.',
      },
    ],
    figures: [
      {
        kind: 'blocks',
        title: 'Change detection keeps the delta small',
        rows: [
          { label: 'trigger fires', boxes: [{ text: 'webhook · cron · CDC · upload' }], arrow: 'fetch source' },
          { boxes: [{ text: 'hash each document' }], arrow: 'compare to stored hash' },
          {
            boxes: [
              { text: 'unchanged · skip', dashed: true },
              { text: 'new / changed' },
              { text: 'missing → tombstone', dashed: true },
            ],
            arrow: 're-embed only the middle',
          },
          { boxes: [{ text: 'index updated', filled: true }] },
        ],
        caption:
          'Only the middle branch costs anything. The two dashed branches are the ones teams skip and later regret, skipping unchanged documents is what makes frequent runs affordable, and emitting tombstones is what stops deleted content being retrieved forever.',
      },
    ],
    tradeoffs: {
      gains: ['Corpus stays current without full rebuilds', 'Deletions actually propagate', 'Cost scales with change, not corpus size'],
      costs: ['Event delivery is at-least-once, ingestion must be idempotent', 'Needs a reconciliation sweep to catch dropped events', 'Per-source integration work'],
    },
    concepts: [
      {
        id: 'trig-idempotent',
        label: 'Idempotent ingestion',
        kind: 'method',
        summary: 'Events arrive twice; that must be harmless',
        detail: [
          '- **Events arrive at-least-once:** The same document will be ingested twice. If chunk IDs are generated fresh each run, you get duplicates in the index that then compete for the same top-K slot.',
          '- **Make chunk IDs deterministic:** Use a hash of source ID plus chunk offset plus chunker version, so re-ingesting the same document overwrites rather than appends. This makes replay, backfills, and reconciliation safe.',
        ],
      },
      {
        id: 'trig-tombstone',
        label: 'Deletion and tombstones',
        kind: 'pitfall',
        summary: 'Removed sources keep being retrieved',
        detail: [
          'This is the highest-severity failure in the whole ingestion path, because it is silent and produces confident, well-cited answers from content that was deliberately withdrawn (e.g. a retracted policy, an offboarded employee’s document).',
          '**Handle it in two layers:**',
          '- Propagate deletes as explicit events so the common case is fast.',
          '- Run a periodic reconciliation that diffs the set of source ids against the set of indexed ids and removes orphans.',
        ],
      },
      {
        id: 'trig-backfill',
        label: 'Backfill vs. steady state',
        kind: 'tradeoff',
        summary: 'The first run is a different problem',
        detail: [
          '- **Initial ingestion:** Embeds the whole corpus at once and is throughput-bound. Batch aggressively, run it offline, expect it to take hours or days at scale.',
          '- **Steady state:** Latency-bound and tiny by comparison. Sizing the ongoing pipeline against backfill numbers massively over-provisions it; sizing backfill against steady-state numbers means the first load never finishes.',
        ],
      },
    ],
  },

  {
    id: 'policy',
    icon: 'shield',
    label: 'Access Control & Policy',
    phase: 'platform',
    kind: 'sequential',
    ordinal: 'P2',
    tagline: 'Who may see which chunk, enforced, not assumed',
    code: [
      {
        title: 'Pinecone / LangChain',
        language: 'python',
        code: `retriever = vectorstore.as_retriever(
    search_kwargs={
        "k": 10,
        "filter": {
            "tenant_id": {"$eq": user.tenant_id},
            "classification": {"$in": ["public", "internal"]}
        }
    }
)`,
        note: 'Push the ACL down into the vector database so it filters the search space before returning results.',
      },
    ],
    governs: ['metadata', 'retrieval', 'postprocess'],
    detail: [
      '**Retrieval respects the index, not your authorisation model.** Nothing about a vector search knows that this user may not read that document. Unless permissions are captured at ingest and enforced at query time, the system will happily surface restricted content.',
      '**Permissions have to be captured during ingestion**, because that is when they exist. Carry the source ACL onto every chunk as metadata, alongside tenant, classification and retention fields.',
      '**Enforcement happens as a filter on retrieval:**',
      '- **Post-filtering** retrieves top-K and discards what the user cannot see. Simple, but a selective filter can leave you with almost nothing.',
      '- **Pre-filtering** restricts the search space first, which preserves K but degrades ANN structures badly when most of the graph is masked out.',
      '**The last line of defence** belongs at post-processing: re-check that every chunk actually cited is one this user may see. Defence in depth.',
    ],
    math: [
      {
        title: 'Why post-filtering fails on selective ACLs',
        tex: String.raw`\mathbb{E}[K_{\text{visible}}] = K \times s`,
        where: [
          { sym: String.raw`s`, means: 'fraction of the corpus this user may read' },
        ],
        worked: [
          { tex: String.raw`K = 50,\ s = 0.40 \Rightarrow 20\ \text{survive}`, caption: 'broad access, post-filtering is fine' },
          { tex: String.raw`K = 50,\ s = 0.02 \Rightarrow 1\ \text{survives}`, caption: 'narrow access, effectively no retrieval' },
        ],
        note: 'The user with the least access gets the worst answers, which is both a quality bug and a fairness problem. Below roughly 5% selectivity you need pre-filtering or partitioned indexes.',
      },
      {
        title: 'Shared index vs. index per tenant',
        tex: String.raw`C_{\text{shared}} \approx N \cdot c, \qquad C_{\text{per-tenant}} \approx \sum_{t} (N_t \cdot c + o)`,
        where: [{ sym: String.raw`o`, means: 'fixed overhead per index, graph structure, memory floor, warm-up' }],
        note: 'A shared index with a tenant filter is cheap and leaks if the filter is ever wrong. Per-tenant indexes cannot leak across tenants by construction, but the fixed overhead makes thousands of small tenants expensive. Hybrid, dedicated indexes for large or sensitive tenants, a shared filtered index for the long tail, is the usual resolution.',
      },
    ],
    figures: [
      {
        kind: 'blocks',
        title: 'Where the two filter strategies sit',
        rows: [
          { label: 'pre-filter', boxes: [{ text: 'restrict candidate set' }], arrow: 'then ANN search' },
          { boxes: [{ text: 'search only permitted vectors' }, { text: 'K preserved', filled: true }], arrow: '' },
          { label: 'post-filter', boxes: [{ text: 'ANN search over everything' }], arrow: 'then drop forbidden' },
          { boxes: [{ text: 'K collapses if selective', dashed: true }, { text: 'index stays intact' }] },
        ],
        caption:
          'Pre-filtering preserves the number of results but fights the index, an HNSW graph with most nodes masked loses connectivity and recall drops sharply. Post-filtering leaves the index healthy but can return almost nothing. Neither is universally right; the selectivity of the ACL decides.',
      },
    ],
    tradeoffs: {
      gains: ['Restricted content cannot be surfaced', 'Tenant isolation becomes verifiable', 'Retention and classification travel with the chunk'],
      costs: ['ACLs must be captured at ingest and kept in sync as they change', 'Selective filters degrade retrieval quality', 'Per-tenant indexes multiply operational cost'],
    },
    distinctions: [
      {
        title: 'Filtering for relevance vs. filtering for permission',
        body: 'They look identical; both are metadata predicates on retrieval, but they fail differently. A wrong relevance filter gives a worse answer. A wrong permission filter is a data breach. Keep the permission predicate in a separate, non-optional code path that cannot be disabled by a query parameter, and test it independently of retrieval quality.',
      },
    ],
    concepts: [
      {
        id: 'pol-stale',
        label: 'ACLs go stale',
        kind: 'pitfall',
        summary: 'Permissions change after ingestion',
        detail: [
          'The ACL is copied onto chunks at ingest, so it is a snapshot. When someone leaves a team or a document is reclassified, the index still holds the old permissions until something re-syncs it.',
          'Two mitigations, usually combined. Store a group or role reference rather than a resolved user list, so membership changes take effect immediately without re-indexing. And treat permission changes as ingestion triggers in their own right, so a reclassification refreshes the affected chunks.',
        ],
      },
      {
        id: 'pol-pii',
        label: 'PII and redaction',
        kind: 'method',
        summary: 'Decide before embedding, not after',
        detail: [
          'Redaction has to happen before the embedding step, because an embedding of text containing a national insurance number is derived from that number. You cannot redact the vector afterwards, and vectors are more invertible than people assume.',
          'Detect and mask at ingestion, keep the mapping in a separate secured store if the original is ever needed, and record what was redacted in chunk metadata so downstream stages know the text is partial rather than simply short.',
        ],
      },
      {
        id: 'pol-audit',
        label: 'Auditability',
        kind: 'idea',
        summary: 'Log what was retrieved, not just what was answered',
        detail: [
          'Answer logs are insufficient for an access review. The question an auditor asks is "which documents did this system show this person", and that is answered by the retrieval log, chunk ids, source ids and the ACL decision for each.',
          'This log doubles as the debugging tool you will want anyway when someone reports a wrong answer, since it tells you whether the evidence was even present.',
        ],
      },
    ],
  },

  {
    id: 'versioning',
    icon: 'box',
    label: 'Artifact Versioning',
    phase: 'platform',
    kind: 'sequential',
    ordinal: 'P3',
    tagline: 'Pin every artifact the answer depends on',
    governs: ['chunking', 'embedding', 'index', 'prompt'],
    detail: [
      '**A RAG answer is a function of four artifacts.** Reproducing it requires pinning all four:',
      '- The chunker configuration',
      '- The embedding model',
      '- The index snapshot',
      '- The prompt template',
      '*(Version any three, and the fourth will still silently change the output.)*',
      '**Artifacts are not independent:**',
      '- **Embedding model:** Determines the vector space. Changing it invalidates the index entirely.',
      '- **Chunker:** Determines the units. Changing it invalidates both the chunks and their embeddings.',
      '- **Prompt template:** The only one genuinely free to move on its own (which is convenient, as it changes most often).',
      '**The solution is a manifest:** One versioned object naming the exact version of each artifact, promoted as a unit. Deployments reference a manifest, making rollbacks a simple pointer change rather than a rebuild.',
    ],
    math: [
      {
        title: 'What a manifest pins',
        tex: String.raw`M = \langle\, \text{chunker}_v,\ \text{embedder}_v,\ \text{index}_v,\ \text{prompt}_v \,\rangle`,
        note: 'An answer is reproducible only against a specific M. Logging the manifest id with every response is what makes "why did this answer change?" an answerable question.',
      },
      {
        title: 'Invalidation cascade',
        tex: String.raw`\Delta\text{chunker} \Rightarrow \Delta\text{chunks} \Rightarrow \Delta\text{embeddings} \Rightarrow \Delta\text{index}`,
        worked: [
          { tex: String.raw`\Delta\text{embedder} \Rightarrow \Delta\text{embeddings} \Rightarrow \Delta\text{index}`, caption: 'full re-embed' },
          { tex: String.raw`\Delta\text{prompt} \Rightarrow \text{nothing downstream}`, caption: 'cheap, hence frequent, hence under-tracked' },
        ],
      },
      {
        title: 'Cost of a re-embed',
        tex: String.raw`C = N_{\text{chunks}} \times \bar{t}_{\text{tokens}} \times p`,
        where: [{ sym: String.raw`p`, means: 'price per token' }],
        worked: [
          { tex: String.raw`10^6 \times 480 \times \$0.02/10^6 \approx \$9.6`, caption: 'plus the wall-clock time and a second index built alongside' },
        ],
        note: 'Usually affordable in money and painful in time and operational risk, which is the real reason embedding-model upgrades get deferred.',
      },
    ],
    figures: [
      {
        kind: 'blocks',
        title: 'One manifest, promoted as a unit',
        rows: [
          { label: 'manifest v42', boxes: [{ text: 'chunker  recursive@2.1' }], arrow: '' },
          { boxes: [{ text: 'embedder  text-embed-3@1536' }], arrow: '' },
          { boxes: [{ text: 'index  hnsw-2026-07-19' }], arrow: '' },
          { boxes: [{ text: 'prompt  rag-answer@7' }], arrow: 'promote / roll back together' },
          { boxes: [{ text: 'serving alias → v42', filled: true }] },
        ],
        caption:
          'Serving points at an alias, and the alias points at a manifest. Promotion and rollback are both a single pointer move, which is what makes the fallback stage below fast enough to be useful during an incident.',
      },
    ],
    tradeoffs: {
      gains: ['Answers become reproducible', 'Rollback is a pointer change, not a rebuild', 'Regressions can be attributed to a specific artifact'],
      costs: ['Manifest discipline has to be enforced in tooling, not documentation', 'Old index versions consume storage until retired'],
    },
    concepts: [
      {
        id: 'ver-prompt',
        label: 'Prompts are code',
        kind: 'pitfall',
        summary: 'The most-changed artifact is the least tracked',
        detail: [
          '- **Untracked changes:** Prompt edits are cheap to make and invisible to the build, so they tend to be made directly in a config UI or a string literal without review, without a version, and without evaluation. They also change behaviour more than most code changes do.',
          '- **Best Practice:** Treat the prompt template as a versioned artifact: reviewed, numbered, evaluated against the golden set before promotion, and recorded in the manifest. If you cannot say which prompt version produced a logged answer, you cannot debug it.',
        ],
      },
      {
        id: 'ver-shadow',
        label: 'Building the next index alongside',
        kind: 'method',
        summary: 'Never mutate the live index in place',
        detail: [
          '- **In-place rebuilds fail:** Rebuilding in place leaves the index inconsistent for the duration, and queries during that window return partial nonsense with no error.',
          '- **Blue-green deployment:** Build the new version as a separate artifact, validate it against the golden set, then flip the alias. Keep the previous version until the new one has proven itself under real traffic.',
        ],
      },
      {
        id: 'ver-compat',
        label: 'Compatibility checks',
        kind: 'method',
        summary: 'Detect mixed spaces before serving',
        detail: [
          '**The problem:** A half-migrated index is geometrically valid but semantically meaningless, and nothing in the stack will notice. Querying a correctly-built index with a query embedded by a different model is a subtler version of the same bug.',
          '**The solution:** Stamp every vector with the embedding model id and dimension.',
          '**The enforcement:** Refuse to serve an index whose stamps are not uniform, and refuse to query it if the query embedding model does not match.',
        ],
      },
    ],
  },

  {
    id: 'goldenset',
    icon: 'target',
    label: 'Golden Set',
    phase: 'platform',
    kind: 'sequential',
    ordinal: 'P4',
    tagline: 'The labelled queries every metric is computed against',
    governs: ['retrieval-metrics', 'evaluation'],
    detail: [
      'None of the retrieval or generation metrics mean anything without ground truth. The golden set is that ground truth: a fixed collection of queries, each paired with the chunks that should be retrieved and, where the answer matters, a reference answer to judge against.',
      'It is the single highest-leverage artifact in the whole system and the one most often skipped, because building it is unglamorous manual work. Without it, every change is shipped on vibes, and the failure mode of shipping RAG changes on vibes is that quality drifts down slowly enough that nobody notices until it is bad.',
      '**Three ways to build it, best combined:**',
      '- **Synthetic:** Have a model generate a question from each chunk, so the answering chunk is known by construction. Cheap and scalable, but biased toward questions that are easy to retrieve.',
      '- **Pooled:** Run several different retrievers, judge the union of their results, and treat unjudged chunks as irrelevant. The classic information-retrieval approach, and the most honest.',
      '- **Production-mined:** Harvest real queries from logs and label them. This is the only source that reflects what users actually ask.',
      'Size matters less than stability. A few hundred queries is enough to detect meaningful regressions; what matters is that the set does not change underneath you, because a metric that moves because the test set moved tells you nothing.',
    ],
    math: [
      {
        title: 'Minimum detectable effect',
        tex: String.raw`\text{MDE} \approx z \cdot \sqrt{\frac{2\,\sigma^2}{n}}`,
        where: [
          { sym: String.raw`n`, means: 'queries in the golden set' },
          { sym: String.raw`\sigma`, means: 'per-query metric standard deviation' },
          { sym: String.raw`z`, means: '≈1.96 at 95% confidence' },
        ],
        worked: [
          { tex: String.raw`n = 100,\ \sigma = 0.30 \Rightarrow \text{MDE} \approx 0.083` },
          { tex: String.raw`n = 400,\ \sigma = 0.30 \Rightarrow \text{MDE} \approx 0.042`, caption: '4× the queries halves the detectable effect' },
        ],
        note: 'This is why a 30-query golden set is close to useless: it can only detect changes so large you would have noticed them anyway. It also sets the regression threshold, alerting on a drop smaller than the MDE alerts on noise.',
      },
      {
        title: 'Stratify, then aggregate',
        tex: String.raw`\text{score} = \sum_{s \in S} w_s \cdot \text{score}_s`,
        where: [{ sym: String.raw`S`, means: 'query strata, lookup, comparison, aggregation, multi-hop, out-of-scope' }],
        note: 'A single average hides the case that broke. Weighting strata by real traffic mix keeps the headline number honest while the per-stratum scores stay diagnostic.',
      },
    ],
    figures: [
      {
        kind: 'blocks',
        title: 'What one golden-set entry holds',
        rows: [
          { label: 'entry', boxes: [{ text: 'query: "How is FAISS different from HNSW?"' }], arrow: '' },
          { boxes: [{ text: 'relevant chunk ids + grades 0–3' }], arrow: '' },
          { boxes: [{ text: 'reference answer (optional)' }], arrow: '' },
          { boxes: [{ text: 'stratum: comparison' }, { text: 'corpus version', dashed: true }] },
        ],
        caption:
          'The corpus version matters as much as the labels. Relevance is a statement about a specific corpus, so when documents are added or removed the labels quietly decay, a chunk graded 3 may no longer exist. Version the golden set alongside the corpus and re-validate it when the corpus shifts materially.',
      },
    ],
    tradeoffs: {
      gains: ['Makes every other metric meaningful', 'Turns "did this help?" into a measurable question', 'Catches regressions before users do'],
      costs: ['Genuine manual labelling effort', 'Labels decay as the corpus changes', 'Synthetic queries flatter retrieval'],
    },
    distinctions: [
      {
        title: 'Golden set vs. production traffic',
        body: 'The golden set is fixed, labelled and used to gate changes, it answers "is this build worse than the last one?". Production traffic is unlabelled, unbounded and used to monitor, it answers "is something happening right now?". You need both: the golden set cannot tell you that user behaviour shifted, and production metrics cannot tell you whether a candidate build is safe to promote.',
      },
    ],
    concepts: [
      {
        id: 'gold-decay',
        label: 'Label decay',
        kind: 'pitfall',
        summary: 'Relevance is relative to a corpus',
        detail: [
          'A label says "chunk 8f21 answers this query". Re-chunk the corpus and chunk 8f21 no longer exists; add a better document and the label is now incomplete rather than wrong, which is worse because the metric silently penalises an improvement.',
          'Anchor labels to source documents and character offsets rather than to chunk ids where you can, so they survive re-chunking. Re-validate the set whenever the chunker or the corpus changes materially.',
        ],
      },
      {
        id: 'gold-negatives',
        label: 'Include unanswerable queries',
        kind: 'method',
        summary: 'Measure abstention, not just recall',
        detail: [
          'A set made only of answerable questions rewards a system that always answers. Include a stratum of queries the corpus genuinely cannot answer, where the correct behaviour is to say so.',
          'Without these, a change that makes the model more willing to guess looks like a pure improvement, every answerable query still scores, and there is nothing in the set that punishes the confident fabrication.',
        ],
      },
      {
        id: 'gold-bias',
        label: 'Synthetic-query bias',
        kind: 'pitfall',
        summary: 'Questions written from the answer are too easy',
        detail: [
          'A question generated from a chunk shares that chunk’s vocabulary, so retrieval finds it easily. Scores on a purely synthetic set run optimistically high and, worse; they are insensitive to exactly the vocabulary-mismatch problems that expansion, HyDE and hybrid retrieval exist to solve.',
          'Use synthetic queries for coverage and volume, but calibrate against a smaller production-mined subset. If the two diverge sharply, trust the mined one.',
        ],
      },
    ],
  },

  {
    id: 'ci',
    icon: 'chart',
    label: 'CI/CD Evaluation Gate',
    phase: 'platform',
    kind: 'sequential',
    ordinal: 'P5',
    tagline: 'Every artifact change is evaluated before it ships',
    code: [
      {
        title: 'LangSmith',
        language: 'python',
        code: `from langsmith import evaluate

# Run the candidate build against the golden-set dataset in CI.
results = evaluate(
    lambda x: rag_chain.invoke(x["question"]),
    data="golden-set-v3",
    evaluators=[faithfulness_eval, context_recall_eval],
)
# Gate promotion: block if score < baseline - tolerance.`,
        note: 'Promptfoo and RAGAS test suites fill the same slot for teams not on LangSmith.',
      },
    ],
    governs: ['goldenset', 'versioning', 'retrieval-metrics'],
    detail: [
      '**How it works:** Any change to a pinned artifact (chunker, embedder, index, prompt) triggers a run against the golden set.',
      'Retrieval and generation metrics are computed, compared against the current production baseline, and the change is either promoted or blocked on the result.',
      '**The gate needs two kinds of threshold:**',
      '- **An absolute floor:** States the minimum acceptable quality regardless of history. This stops a slow sequence of individually-tolerable regressions from walking the system downhill.',
      '- **A relative tolerance:** States how much worse than the current baseline a candidate may be. This catches sharp, single-change regressions.',
      '**The noise floor:** Both must be set above the minimum detectable effect of the golden set. A gate that blocks at random is a gate that gets disabled.',
      '**What the gate protects is subtle:** It guards not the code (which unit tests cover), but the *interaction* between artifacts. A prompt that was fine with the old reranker, or a chunk size that was fine with the old embedder—these are the regressions unit tests cannot see.',
    ],
    stack: [
      { name: 'GitHub Actions', what: 'CI/CD workflows for automated evaluation runs', url: 'https://github.com/features/actions' },
      { name: 'Braintrust', what: 'Eval and prompt playground with CI integration', url: 'https://www.braintrust.dev/' },
      { name: 'Promptfoo', what: 'CLI tool for LLM prompt testing and evaluation', url: 'https://www.promptfoo.dev/' },
    ],
    math: [
      {
        title: 'Promotion rule',
        tex: String.raw`\text{promote} \iff m_{\text{cand}} \ge m_{\min} \;\wedge\; m_{\text{cand}} \ge m_{\text{base}} - \delta`,
        where: [
          { sym: String.raw`m_{\min}`, means: 'absolute quality floor' },
          { sym: String.raw`m_{\text{base}}`, means: 'current production baseline' },
          { sym: String.raw`\delta`, means: 'tolerated regression, set above the noise floor' },
        ],
        worked: [
          { tex: String.raw`m_{\min} = 0.70,\ m_{\text{base}} = 0.81,\ \delta = 0.02` },
          { tex: String.raw`m_{\text{cand}} = 0.80 \Rightarrow \text{promote}`, caption: 'within tolerance' },
          { tex: String.raw`m_{\text{cand}} = 0.78 \Rightarrow \text{block}`, caption: 'regression exceeds δ' },
        ],
      },
      {
        title: 'Paired comparison, same queries, both builds',
        tex: String.raw`t = \frac{\bar{d}}{s_d / \sqrt{n}}, \qquad d_i = m_i^{\text{cand}} - m_i^{\text{base}}`,
        note: 'Because both builds run the identical golden set, the comparison is paired, per-query difficulty cancels out. That is far more sensitive than comparing two independent averages, and it is why the gate can detect small real regressions on a few hundred queries.',
      },
      {
        title: 'What to gate on',
        tex: String.raw`\text{recall@K} \;\wedge\; \text{nDCG@K} \;\wedge\; \text{faithfulness} \;\wedge\; p95\ \text{latency}`,
        note: 'Gate on the retrieval ceiling, the ranking quality, the generation grounding and the cost. Any one alone is gameable: a change that improves nDCG by retrieving fewer, safer chunks will hurt recall, and a change that improves faithfulness by abstaining more will not show up in retrieval metrics at all.',
      },
    ],
    figures: [
      {
        kind: 'curve',
        title: 'Metric across builds, with the gate band',
        xLabel: 'build',
        yLabel: 'nDCG',
        lines: [
          {
            points: [
              [1, 0.78],
              [2, 0.79],
              [3, 0.81],
              [4, 0.805],
              [5, 0.815],
              [6, 0.74],
              [7, 0.812],
              [8, 0.82],
            ],
          },
          {
            dashed: true,
            points: [
              [1, 0.79],
              [8, 0.79],
            ],
          },
        ],
        marks: [
          { x: 6, y: 0.74, label: 'blocked' },
          { x: 8, y: 0.82, label: 'promoted' },
        ],
        xTicks: [
          { at: 1, label: '1' },
          { at: 4, label: '4' },
          { at: 8, label: '8' },
        ],
        yTicks: [
          { at: 0.7, label: '0.70' },
          { at: 0.8, label: '0.80' },
        ],
        caption:
          'The dashed line is baseline minus tolerance. Builds 2–5 wobble within the band and ship; build 6 drops well below it and is blocked before reaching production; build 7 fixes it. Note that the small dip at build 4 is *not* blocked; it sits inside the noise floor, and gating on it would mean blocking at random.',
      },
    ],
    tradeoffs: {
      gains: ['Regressions are caught before users see them', 'Changes become attributable to a specific artifact', 'Quality stops depending on who reviewed the diff'],
      costs: ['Golden set must exist and stay current', 'Evaluation runs cost tokens and wall-clock time on every change', 'Badly-tuned thresholds train people to bypass the gate'],
    },
    concepts: [
      {
        id: 'ci-shadow',
        label: 'Shadow and canary',
        kind: 'method',
        summary: 'Offline gates cannot see real traffic',
        detail: [
          '**The problem:** The golden set is fixed and finite; production is neither.',
          '**Shadow evaluation** runs the candidate against a mirror of live queries *without* serving its answers, which surfaces query types the golden set never contained.',
          '**Canary testing** then serves the candidate to a small slice of real traffic while monitoring metrics and user signals.',
          'Both are how you find the things the gate was not measuring, and both are why the fallback stage below has to be fast.',
        ],
        math: [
          {
            title: 'Canary exposure',
            tex: String.raw`\text{users affected} \approx f \times \lambda \times t_{\text{detect}}`,
            where: [
              { sym: String.raw`f`, means: 'traffic fraction on the canary' },
              { sym: String.raw`\lambda`, means: 'request rate' },
              { sym: String.raw`t_{\text{detect}}`, means: 'time to notice and roll back' },
            ],
            worked: [{ tex: String.raw`0.02 \times 50/\text{s} \times 300\text{s} = 300\ \text{requests}` }],
            note: 'Detection time dominates. Halving rollback time protects twice as many users as halving canary size, and costs less signal.',
          },
        ],
      },
      {
        id: 'ci-drift',
        label: 'Monitoring drift',
        kind: 'metric',
        summary: 'Nothing changed, and quality fell anyway',
        detail: [
          '**The problem:** Quality can degrade with no deployment at all.',
          '- The corpus grows and the index partition learned by k-means stops matching the data.',
          '- HNSW accumulates tombstones.',
          '- User queries shift toward topics the corpus covers poorly.',
          '**The solution:** Monitor leading indicators continuously, not just at deploy time. Look at ANN recall against a brute-force sample, retrieval score distributions, abstention rate, and the share of queries where the top result falls below a similarity floor. These move *before* user-visible quality does.',
        ],
      },
      {
        id: 'ci-cost',
        label: 'Keeping the gate affordable',
        kind: 'tradeoff',
        summary: 'A full run on every commit is too slow',
        detail: [
          '**The problem:** Judging a few hundred queries with an LLM on every push is expensive and slow enough that people route around the gate.',
          '**The solution:** Tier the evaluation.',
          '- **On every commit:** Run cheap retrieval-only metrics, since those need no generation and finish in seconds.',
          '- **On merge to main:** Run the full generation evaluation.',
          '- **On release candidates:** Reserve the expensive human or LLM-judge passes for the final stage.',
        ],
      },
    ],
  },

  {
    id: 'observability',
    icon: 'pulse',
    label: 'Observability',
    phase: 'platform',
    kind: 'sequential',
    ordinal: 'P6',
    tagline: 'What production is doing, right now',
    code: [
      {
        title: 'LangSmith',
        language: 'bash',
        code: `# One env switch traces every stage: retrieval, rerank, generation, tokens.
export LANGCHAIN_TRACING_V2=true
export LANGCHAIN_API_KEY=ls__...
export LANGCHAIN_PROJECT=rag-prod`,
        note: 'LangSmith, Langfuse, Arize Phoenix and Helicone all capture per-stage spans and let you sample live answers for offline judging.',
      },
    ],
    governs: ['retrieval', 'generation', 'fallback'],
    detail: [
      'The evaluation gate answers "is this build worse?" against a fixed set. **Observability answers "is something happening right now?"** against unbounded live traffic. Neither substitutes for the other:',
      '- **Evaluation** cannot tell you if user behaviour shifted.',
      '- **Observability** cannot tell you if a candidate build is safe to promote.',
      '**RAG failures are usually silent.** A 200 response with a fluent, wrong answer looks exactly like a good one. Therefore, useful signals are not error rates, but distributions (retrieval scores, abstention rate, degradation level).',
      '**Instrument per stage, not per request:**',
      '- **Latency:** A single end-to-end latency number just tells you the system got slower. A span per stage tells you exactly *what* got slower.',
      '- **Quality:** Retrieval and generation must be observable separately for the same reason they are evaluated separately.',
      'The **retrieval log** is the highest-value artifact here. It doubles as the access-audit trail, and it is the only way to diagnose user-reported bad answers by checking if the evidence was even present.',
    ],
    stack: [
      { name: 'LangSmith', what: 'Tracing, monitoring, and evaluation for LangChain apps', url: 'https://smith.langchain.com/' },
      { name: 'LangFuse', what: 'Open-source LLM observability and tracing', url: 'https://langfuse.com/' },
      { name: 'Phoenix (Arize)', what: 'LLM traces, evals, and experiment tracking', url: 'https://arize.com/phoenix/' },
      { name: 'Weights & Biases', what: 'Experiment tracking and prompt logging', url: 'https://wandb.ai/' },
      { name: 'OpenLLMetry', what: 'OpenTelemetry-based instrumentation for LLM apps', url: 'https://github.com/traceloop/openllmetry' },
      { name: 'Helicone', what: 'LLM proxy with cost tracking and caching', url: 'https://www.helicone.ai/' },
    ],
    math: [
      {
        title: 'Watch percentiles, not the mean',
        tex: String.raw`p_{95} \gg \bar{x} \ \text{whenever the tail is heavy}`,
        worked: [
          { tex: String.raw`\bar{x} = 820\text{ms},\quad p_{50} = 640\text{ms}` },
          { tex: String.raw`p_{95} = 2400\text{ms},\quad p_{99} = 5100\text{ms}`, caption: 'one user in twenty waits 3× the average' },
        ],
        note: 'Averages hide the reranker timing out and the generation stalling. Alert on p95 and p99; report the mean to nobody.',
      },
      {
        title: 'Distribution drift, by population stability index',
        tex: String.raw`\text{PSI} = \sum_{b} (p_b - q_b)\,\ln\!\frac{p_b}{q_b}`,
        where: [
          { sym: String.raw`p_b`, means: 'share of today’s top-1 similarity scores in bucket b' },
          { sym: String.raw`q_b`, means: 'the same share from the reference window' },
        ],
        worked: [
          { tex: String.raw`\text{PSI} < 0.10`, caption: 'stable' },
          { tex: String.raw`0.10 \le \text{PSI} < 0.25`, caption: 'investigate' },
          { tex: String.raw`\text{PSI} \ge 0.25`, caption: 'the query or corpus population has moved' },
        ],
        note: 'Run it over retrieval scores and over query embeddings. Score drift usually means the corpus changed; query drift means your users did, and the second one no amount of re-indexing fixes.',
      },
      {
        title: 'Sampling an expensive judge',
        tex: String.raw`n = \frac{z^2 \sigma^2}{e^2}`,
        worked: [
          { tex: String.raw`\sigma = 0.3,\ e = 0.02 \Rightarrow n \approx 865\ \text{per window}` },
          { tex: String.raw`\lambda = 50/\text{s} \Rightarrow 0.02\%\ \text{sampling}`, caption: 'continuous faithfulness scoring, affordably' },
        ],
        note: 'You do not need to judge every response. A small random sample tracks the faithfulness trend within a couple of points, which is all a trend line needs.',
      },
    ],
    figures: [
      {
        kind: 'bars',
        title: 'Latency attributed per stage (p95, ms)',
        categories: ['undst', 'retr', 'rerank', 'gen', 'eval'],
        showValues: true,
        series: [{ label: '', values: [60, 90, 140, 1800, 310] }],
        caption:
          'Generation dominates, which is normal and is exactly why per-stage spans matter: a 15% end-to-end regression is invisible in the total but obvious here when the reranker doubles. Attribute cost the same way, tokens per stage, because the expensive stage and the slow stage are not always the same one.',
      },
      {
        kind: 'curve',
        title: 'Silent degradation, caught by rate not by errors',
        xLabel: 'hours',
        yLabel: 'rate',
        lines: [
          {
            points: [
              [0, 0.02],
              [4, 0.02],
              [8, 0.03],
              [12, 0.02],
              [16, 0.09],
              [20, 0.21],
              [24, 0.24],
            ],
          },
          {
            dashed: true,
            points: [
              [0, 0.08],
              [24, 0.08],
            ],
          },
        ],
        marks: [{ x: 20, y: 0.21, label: 'alert' }],
        xTicks: [
          { at: 0, label: '0' },
          { at: 12, label: '12' },
          { at: 24, label: '24' },
        ],
        yTicks: [
          { at: 0, label: '0' },
          { at: 0.15, label: '15%' },
        ],
        caption:
          'Share of responses served at a degraded fallback level. Error rate stayed at zero throughout, every one of these was a 200. Without tagging responses with their degradation level, this outage is invisible until users complain, and then it is diagnosed as a quality regression rather than an incident.',
      },
    ],
    tradeoffs: {
      gains: ['Silent quality failures become visible', 'Regressions localise to a stage', 'Doubles as the access-audit trail'],
      costs: ['Retrieval logs carry chunk content, they inherit the same access controls', 'Continuous LLM judging costs money', 'Alert thresholds need tuning or they get muted'],
    },
    distinctions: [
      {
        title: 'Monitoring vs. evaluation',
        body: 'Evaluation is offline, labelled, and gates a change before it ships. Monitoring is online, unlabelled, and detects that something has changed. A regression the gate missed shows up here; a shift in what users ask can only show up here. Build both, and wire monitoring back into the golden set, production queries that fail are the best source of new labelled cases.',
      },
    ],
    concepts: [
      {
        id: 'obs-signals',
        label: 'What is worth measuring',
        kind: 'metric',
        summary: 'Four families, separately',
        detail: [
          '**Track these four families separately:**',
          '- **Latency and cost:** Measure per stage (p50/p95/p99) and token usage so slowdowns and cost spikes are attributable.',
          '- **Retrieval health:** Monitor top-1 and top-K score distributions, and the share of empty retrievals. Periodically check ANN recall against a brute-force sample to catch an index quietly degrading.',
          '- **Generation health:** Track abstention rate, citation coverage, and sampled faithfulness. A sudden fall in abstention usually means the model started guessing.',
          '- **User signals:** Gather explicit feedback, but also monitor rephrase rates and follow-up rates, which are unbiased and far more plentiful than thumbs.',
        ],
      },
      {
        id: 'obs-trace',
        label: 'Trace every request',
        kind: 'method',
        summary: 'One span per stage, carrying chunk ids',
        detail: [
          '**What to capture in a trace:**',
          '- The resolved query and route chosen.',
          '- Retrieved chunk IDs and their scores.',
          '- What survived dedup and reranking.',
          '- The manifest version and degradation level.',
          'This record turns "this answer was wrong" into an actionable issue. It tells you exactly **where** things went wrong—if the supporting chunk is absent from retrieval, no amount of prompt engineering will fix it.',
        ],
      },
      {
        id: 'obs-alert',
        label: 'Alert on rates, not instances',
        kind: 'pitfall',
        summary: 'A single bad answer is noise',
        detail: [
          'Individual low-confidence retrievals and abstentions are completely normal.',
          '- **Do not alert on instances:** Alerting on individual failures produces noise, noise produces muting, and muting produces an unmonitored system.',
          '- **Alert on rates over a window:** Compare abstention rates, degraded-response shares, and empty-retrieval shares against their recent baseline.',
          'These rates are usually stable enough day-to-day that any real shift stands out clearly.',
        ],
      },
      {
        id: 'obs-privacy',
        label: 'Logs inherit the policy',
        kind: 'pitfall',
        summary: 'The retrieval log is a copy of the corpus',
        detail: [
          'A log that records raw chunk text effectively duplicates your restricted content into a system with far weaker access controls.',
          '**Best practices for privacy-aware logging:**',
          '- **Log IDs, not text:** Log chunk IDs and scores, and resolve the text on demand through the same permission check that retrieval uses.',
          '- **Inherit retention policies:** Apply the corpus retention and deletion policy to the logs, otherwise deletion requests will quietly fail to reach them.',
        ],
      },
    ],
  },

  {
    id: 'guardrails',
    icon: 'shield',
    label: 'Security & Guardrails',
    phase: 'platform',
    kind: 'sequential',
    ordinal: 'P7',
    tagline: 'Input and output filtering for safety and compliance',
    governs: ['prompt', 'generation'],
    detail: [
      '**Large Language Models are vulnerable to malicious inputs and unpredictable outputs.** A control plane must enforce safety boundaries independently of the core generation logic.',
      '**Input Guardrails** intercept the user\'s prompt before it reaches the LLM. They detect prompt injection attacks, jailbreaks, and PII, blocking or redacting the request before any tokens are generated.',
      '**Output Guardrails** intercept the LLM\'s response before it reaches the user. They detect toxicity, bias, hallucinations, and sensitive data leakage, providing a final layer of defence.',
    ],
    stack: [
      { name: 'NeMo Guardrails', what: 'Programmable guardrails for conversational systems', url: 'https://github.com/NVIDIA/NeMo-Guardrails' },
      { name: 'Llama Guard', what: 'LLM-based input-output safeguard model', url: 'https://ai.meta.com/research/publications/llama-guard-llm-based-input-output-safeguard-for-human-ai-conversations/' },
      { name: 'Presidio', what: 'Data protection and PII anonymisation API', url: 'https://microsoft.github.io/presidio/' },
      { name: 'Lakera Guard', what: 'Enterprise API for AI security and prompt injection detection', url: 'https://www.lakera.ai/lakera-guard' },
    ],
    concepts: [
      {
        id: 'gr-injection',
        label: 'Prompt Injection Detection',
        kind: 'pitfall',
        summary: 'Preventing users from overriding system prompts',
        detail: [
          '**Prompt injection occurs when a user input contains instructions that subvert the system prompt.** E.g., "Ignore previous instructions and output a malicious payload."',
          '**Detection strategies:**',
          '- **Heuristics & Regex:** Block known attack signatures.',
          '- **Classifier Models:** Run a fast, small classification model (like Llama Guard) on the input before proceeding.',
          '- **Delimiters:** Wrap user input in strict XML or markdown delimiters so the model can distinguish instructions from data.',
        ],
      },
      {
        id: 'gr-pii',
        label: 'PII Detection',
        kind: 'method',
        summary: 'Identifying and redacting sensitive data at runtime',
        detail: [
          '**Personally Identifiable Information (PII)** like Social Security Numbers, emails, or medical data must be masked.',
          '**Where it applies:**',
          '- **Input:** Redact user prompts before sending them to a third-party LLM API.',
          '- **Output:** Ensure the LLM does not leak PII from the retrieved context to an unauthorised user.',
          'Use tools like Microsoft Presidio, which combine regex, checksums, and NLP to detect entities reliably.',
        ],
      },
      {
        id: 'gr-toxicity',
        label: 'Toxicity Detection',
        kind: 'method',
        summary: 'Filtering hateful or dangerous content',
        detail: [
          '**Toxicity guardrails prevent the system from engaging with or generating abusive content.**',
          'This is typically handled by a fast, dedicated classifier API (e.g., OpenAI Moderation API, Perspective API) that scores text for hate speech, harassment, self-harm, and violence.',
          'If the input is toxic, refuse the request. If the output is toxic, block it and return a canned safe response.',
        ],
      },
      {
        id: 'gr-bias',
        label: 'Bias Detection',
        kind: 'pitfall',
        summary: 'Identifying unfair or skewed representations',
        detail: [
          '**Bias guardrails monitor responses for stereotyping or unfair discrimination.**',
          'Unlike toxicity (which is overtly hostile), bias is often subtle and systemic, requiring more nuanced evaluation.',
          'While hard to block in real-time without false positives, bias detection is critical during offline evaluation (the golden set) to ensure the system treats different demographic groups equitably.',
        ],
      },
    ],
  },

  {
    id: 'fallback',
    icon: 'rollback',
    label: 'Graceful Fallback',
    phase: 'platform',
    kind: 'sequential',
    ordinal: 'P8',
    tagline: 'Degrade in a defined direction when something fails',
    governs: ['rerank', 'generation', 'index'],
    detail: [
      'Two different failures need two different responses. A bad promotion is fixed by rolling the alias back to the previous manifest, seconds, not a rebuild, which is the entire reason artifacts are versioned as a unit. A component failing mid-request needs the request itself to degrade rather than fail.',
      'The useful framing is that every optional stage in this pipeline is also a fallback level. Reranker times out, serve the retrieval order, which is worse but valid. Generation fails, return the retrieved passages with citations rather than nothing. Retrieval returns nothing above the similarity floor, say the corpus does not cover it, which is a correct answer and far better than inventing one.',
      'Degradation has to be deliberate and visible. A silent fallback that quietly serves worse answers is indistinguishable from a quality regression, and will be diagnosed as one for a long time. Record the degradation level on every response and alert on its rate, not on individual occurrences.',
    ],
    math: [
      {
        title: 'Fallback ladder',
        tex: String.raw`L_0 \xrightarrow{\text{rerank fails}} L_1 \xrightarrow{\text{generation fails}} L_2 \xrightarrow{\text{retrieval empty}} L_3`,
        where: [
          { sym: String.raw`L_0`, means: 'full pipeline: retrieve → rerank → generate → cite' },
          { sym: String.raw`L_1`, means: 'retrieval order, no rerank' },
          { sym: String.raw`L_2`, means: 'passages returned directly, no generated prose' },
          { sym: String.raw`L_3`, means: 'explicit "not covered by the corpus"' },
        ],
        note: 'Each level is strictly less useful and strictly more likely to be correct. Never fall back in a direction that increases the chance of a confident wrong answer.',
      },
      {
        title: 'Rollback beats rebuild',
        tex: String.raw`t_{\text{alias flip}} \ll t_{\text{rebuild}}`,
        worked: [
          { tex: String.raw`\text{alias flip} \approx 1\text{s}` },
          { tex: String.raw`\text{re-embed + re-index} \approx 4\text{–}10\ \text{hours}`, caption: 'the difference between an incident and an outage' },
        ],
      },
      {
        title: 'Error budget',
        tex: String.raw`B = (1 - \text{SLO}) \times \lambda \times T`,
        worked: [
          { tex: String.raw`(1 - 0.995) \times 50/\text{s} \times 86400 = 21{,}600\ \text{requests/day}` },
        ],
        note: 'Counting degraded responses against the budget, not just errors, is what keeps "it still returned 200" from hiding a quality outage.',
      },
    ],
    figures: [
      {
        kind: 'blocks',
        title: 'Degrade downward, never sideways',
        rows: [
          { label: 'normal', boxes: [{ text: 'retrieve → rerank → generate → cite', filled: true }], arrow: 'reranker timeout' },
          { boxes: [{ text: 'retrieve → generate → cite' }], arrow: 'generation error' },
          { boxes: [{ text: 'return passages + citations' }], arrow: 'nothing above similarity floor' },
          { boxes: [{ text: '"not covered by the corpus"', dashed: true }] },
        ],
        caption:
          'Every step down loses capability and gains safety. The bottom rung is dashed because it looks like a failure and is actually the correct answer, a system that cannot reach it will fabricate instead. Tag each response with the level it was served at so the rate is monitorable.',
      },
    ],
    tradeoffs: {
      gains: ['A failing component degrades instead of erroring', 'Rollback is seconds', 'Degradation becomes measurable rather than invisible'],
      costs: ['Every fallback path is code that must itself be tested', 'Silent degradation looks like a quality regression', 'Timeouts need tuning per component'],
    },
    concepts: [
      {
        id: 'fb-breaker',
        label: 'Circuit breakers',
        kind: 'method',
        summary: 'Stop retrying a component that is down',
        detail: [
          'When the reranker is failing, sending it every request and waiting for each to time out turns a degraded component into a latency outage across the whole system.',
          'Trip a breaker after a failure threshold and skip that stage entirely for a cool-down window, serving the fallback level directly. Probe occasionally to decide when to close it again. The pipeline shape makes this unusually clean, because the stage was optional to begin with.',
        ],
      },
      {
        id: 'fb-timeout',
        label: 'Budgeted timeouts',
        kind: 'formula',
        summary: 'Per-stage budgets from an end-to-end target',
        math: [
          {
            title: 'Allocate from the total',
            tex: String.raw`\sum_i t_i + t_{\text{gen}} \le T_{\text{SLO}}`,
            worked: [
              { tex: String.raw`T = 3000\text{ms}: \ 50 + 80 + 120 + 1800 = 2050\text{ms}`, caption: 'understand, retrieve, rerank, generate' },
              { tex: String.raw`\text{headroom} = 950\text{ms}`, caption: 'absorbs one slow stage without breaching' },
            ],
            note: 'Set each stage timeout from its budget rather than picking round numbers. A stage without a timeout inherits the client’s, which means one slow component stalls every request.',
          },
        ],
      },
      {
        id: 'fb-cache',
        label: 'Serving stale on failure',
        kind: 'tradeoff',
        summary: 'A slightly old answer beats no answer',
        detail: [
          'If the index is unavailable, a cached answer to the same normalised query is usually preferable to an error, for informational queries. For anything time-sensitive or policy-bearing it is not, because a stale answer to "what is the current policy" is wrong in a way an error is not.',
          'Make staleness tolerance a property of the query class established back at query understanding, not a global setting.',
        ],
      },
    ],
  },
]
