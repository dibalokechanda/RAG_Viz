import type { Stage, Track } from './walkthrough'

/*
 * Three graph-RAG variants, each grounded in its primary source rather than
 * in summaries of it:
 *
 *   LazyGraphRAG  Microsoft Research announcement, Nov 2024
 *   LightRAG      Guo, Xia, Yu, Ao, Huang, arXiv:2410.05779
 *   PathRAG       Chen et al., arXiv:2502.14902 (AAAI)
 *
 * Figures quoted in the notes (0.1% indexing cost, 700x cheaper queries,
 * alpha = 0.7, N = 40, K = 15) are taken from those sources verbatim.
 */

const S = (step: number, title: string, body: string): Stage['panel'][number] => ({ step, title, body })

/* ═══════════════════════════ LazyGraphRAG ═══════════════════════════ */

const LAZY_CONCEPT_GRAPH = `# No LLM runs at index time. The concept graph is built with classical NLP.

import spacy, itertools
from collections import Counter

nlp = spacy.load("en_core_web_sm")

concepts, cooccurrence = Counter(), Counter()

for chunk in texts:
    # 1. noun phrases are the concepts
    phrases = {np.lemma_.lower() for np in nlp(chunk).noun_chunks}
    concepts.update(phrases)

    # 2. an edge for every pair that co-occurs inside one chunk
    for a, b in itertools.combinations(sorted(phrases), 2):
        cooccurrence[(a, b)] += 1

# 3. graph statistics prune the graph and extract a community hierarchy.
#    No entity descriptions, no relationship descriptions, no community
#    reports: none of that exists until a query asks for it.

G = build_graph(concepts, cooccurrence)
communities = hierarchical_communities(G)

# Microsoft: "LazyGraphRAG data indexing costs are identical to vector RAG
# and 0.1% of the costs of full GraphRAG."`

const LAZY_QUERY_LOOP = `# Query time is where the deferred work happens.

# best-first: rank by similarity
chunk_scores     = rank_by_similarity(embed(query), chunk_embeddings)
community_scores = rank_communities_by_top_k_chunks(chunk_scores)

tested, relevant, zero_streak = 0, [], 0

# breadth-first: walk communities, spending the budget on relevance tests
for community in community_scores:
    candidates = top_k_untested_chunks(community, chunk_scores)

    # the one LLM call in the loop: a sentence-level relevance assessor
    hits = llm_relevance_test(query, candidates)
    tested += len(candidates)
    relevant += hits

    zero_streak = 0 if hits else zero_streak + 1
    if zero_streak >= z:
        recurse_into_sub_communities(community)

    if tested >= relevance_test_budget:
        break            # the budget IS the cost/quality dial

answer = generate(query, relevant)`

const LAZY: Stage[] = [
  {
    key: 'lz-index',
    group: 'index',
    chip: '1 · Concept graph',
    title: 'Indexing with no LLM at all',
    caption: 'Noun-phrase extraction gives concepts, co-occurrence gives edges, and graph statistics give the community hierarchy. Zero LLM calls.',
    panel: [
      'The whole idea is in the name. GraphRAG front-loads a great deal of LLM work into indexing; LazyGraphRAG **defers all of it to query time**, and builds its index with classical NLP instead.',
      S(1, 'Extract noun phrases as concepts', 'Standard NLP noun-phrase extraction over each chunk. A concept is a noun phrase, not an LLM-authored entity with a type and a written description. Nothing is summarised and nothing is named by a model.'),
      S(2, 'Add an edge for every co-occurrence', 'Concepts that appear together inside a chunk get an edge. The graph is built from statistical co-occurrence rather than from a model asserting that two things are related, which means there is no strength score to reason about either.'),
      S(3, 'Optimise the graph and cut communities', 'Graph statistics prune the concept graph and extract a **hierarchical community structure**, the same structural idea GraphRAG uses, arrived at without a single model call.'),
      S(4, 'Stop', 'That is the entire index. No entity descriptions, no relationship descriptions, and critically **no community reports**. Every artifact GraphRAG spends its indexing budget producing simply does not exist yet.'),
      '**The headline number.** Microsoft state that "LazyGraphRAG data indexing costs are identical to vector RAG and 0.1% of the costs of full GraphRAG". You are paying for embeddings and some CPU, and nothing else.',
    ],
    cards: [{ label: 'Building the concept graph', hint: 'no model calls', body: LAZY_CONCEPT_GRAPH }],
  },
  {
    key: 'lz-rank',
    group: 'search',
    chip: '2 · Rank',
    title: 'Best-first: rank chunks, then communities',
    caption: 'The query is embedded, chunks are ranked by similarity, and each community inherits a score from its top-k chunks.',
    panel: [
      'Query time opens the way vector RAG does, because at this point the index is not much more than vector RAG plus a community structure.',
      S(1, 'Rank text chunks by similarity', 'Embed the query and rank chunks against it. This is the "best-first" half of the search: the most promising material surfaces first, exactly as in ordinary retrieval.'),
      S(2, 'Score communities from their chunks', 'A community is ranked by how its **top-k chunks** score. The community structure is being used as an index over the corpus rather than as a set of pre-written summaries, which is why it did not need an LLM to build.'),
      S(3, 'Order the frontier', 'That ranking becomes the order in which communities will be visited. Nothing has been sent to a model yet; this is all embedding arithmetic.'),
      '**The contrast with global search.** GraphRAG global search maps over pre-written community reports. There are no reports here, so LazyGraphRAG has to earn the same coverage by testing raw chunks, one community at a time, and it pays for that in the next stage.',
    ],
  },
  {
    key: 'lz-test',
    group: 'search',
    chip: '3 · Relevance test',
    title: 'Breadth-first, under a relevance test budget',
    caption: 'An LLM rates the relevance of top-k untested chunks per community, recursing into sub-communities when a community yields nothing.',
    panel: [
      'This is where the deferred LLM work finally lands, and where the method spends its money.',
      S(1, 'Test the top-k untested chunks', 'Microsoft use "an LLM-based sentence-level relevance assessor to rate the relevance of the top-k untested text chunks". Sentence level, so the assessor can keep part of a chunk and discard the rest.'),
      S(2, 'Walk communities breadth-first', 'Visit communities in the order the previous stage produced. Each visit costs relevance tests, so the walk order directly determines how well the budget is spent.'),
      S(3, 'Recurse when a branch goes cold', 'The search "recurses into relevant sub-communities after z successive communities yield zero relevant text chunks". A dry streak is the signal to go deeper rather than wider.'),
      S(4, 'Stop on budget or exhaustion', 'Termination is when "no relevant communities remain or relevance test budget / q is reached". The budget is a hard ceiling, not a suggestion.'),
      '**The budget is the whole dial.** Microsoft tested 100, 500 and 1,500 relevance tests and report that it "controls the cost-quality trade-off in a consistent manner". One number, turned up or down per query.',
    ],
    cards: [{ label: 'The query loop', hint: 'where the LLM cost lands', body: LAZY_QUERY_LOOP }],
  },
  {
    key: 'lz-answer',
    group: 'search',
    chip: '4 · Answer',
    title: 'Answer from what survived the test',
    caption: 'Only chunks the assessor kept reach the generator, so context is small, and cost tracks the budget rather than the corpus.',
    panel: [
      'The generation step is unremarkable, and that is the point: all the interesting behaviour happened in how the context was chosen.',
      S(1, 'Assemble the surviving material', 'Only sentences and chunks the relevance assessor kept go into the prompt. Because filtering happened before generation rather than after retrieval, the context is small and dense.'),
      S(2, 'Generate', 'One synthesis call over that context, the same shape as any RAG answer.'),
      '**Where it lands on cost.** Microsoft report answer quality "comparable to GraphRAG Global Search for global queries, but more than 700 times lower query cost", and that at 4% of global search\'s query cost it "significantly outperforms all competing methods" on both local and global queries.',
      '**The trade you are making.** GraphRAG pays once at index time and answers cheaply forever. LazyGraphRAG pays almost nothing to index and pays per query. Which is better depends entirely on your query volume against a fixed corpus, and on whether the corpus changes faster than you can afford to re-index it.',
    ],
  },
]

/* ═══════════════════════════ LightRAG ═══════════════════════════ */

const LIGHT_KV = `# Every node and edge carries a retrievable key-value profile.

# key   -> a word or short phrase, what the retriever matches against
# value -> a paragraph summarising the relevant snippets from the source

entity("LORA") = {
  "key":   "LoRA, low-rank adaptation, adapter",
  "value": "Low-rank adaptation injects trainable rank-decomposition
            matrices into each transformer layer while the pretrained
            weights stay frozen, cutting the number of trainable
            parameters by orders of magnitude ...",
}

relation("LORA", "LARGE LANGUAGE MODELS") = {
  "key":   "parameter-efficient fine-tuning, adapting LLMs",
  "value": "LoRA is the dominant technique for adapting large language
            models without a full fine-tune ...",
}

# Deduplication then merges identical entities and relations extracted
# from different chunks, taking the union rather than keeping duplicates.`

const LIGHT_DUAL = `# One query, two kinds of keyword, two kinds of retrieval.

query = "How does LoRA compare with full fine-tuning for a small team?"

keywords = llm_extract_keywords(query)
# low-level  (specific)  -> ["LoRA", "full fine-tuning", "trainable parameters"]
# high-level (abstract)  -> ["parameter efficiency", "compute budget",
#                            "adaptation strategy"]

# low-level keywords match ENTITIES: precise facts about particular nodes
local_ctx  = match_entities(keywords.low)

# high-level keywords match RELATIONS: themes spanning many entities
global_ctx = match_relations(keywords.high)

# both then pull in neighbouring nodes for coverage
context = expand_neighbours(local_ctx + global_ctx)

# Exposed as modes: local, global, hybrid, naive, mix.
rag.query(query, param=QueryParam(mode="hybrid"))`

const LIGHT: Stage[] = [
  {
    key: 'lr-extract',
    group: 'index',
    chip: '1 · Extract',
    title: 'Entities and relations, chunk by chunk',
    caption: 'The same opening move as GraphRAG: segment the text, then have an LLM name the nodes and edges.',
    panel: [
      'LightRAG starts where GraphRAG starts, and the paper is explicit that graph structure is what fixes "reliance on flat data representations and inadequate contextual awareness".',
      S(1, 'Segment the documents', 'Raw text is chunked before anything else, "for efficiency", so each extraction call sees a bounded amount of text.'),
      S(2, 'Extract nodes and edges', 'The paper uses LLMs to "identify entities (nodes) and their relationships (edges) within the text data". Structurally this is the same step GraphRAG performs, and it costs the same kind of money.'),
      '**Where the divergence begins.** GraphRAG spends its next tranche of LLM budget on community detection and community reports. LightRAG spends its on making every individual node and edge directly retrievable, which is the next stage.',
    ],
  },
  {
    key: 'lr-profile',
    group: 'index',
    chip: '2 · Profile',
    title: 'Key-value profiling, then deduplication',
    caption: 'Each node and edge gets a short retrieval key and a summarising paragraph, and identical ones extracted from different chunks are merged.',
    panel: [
      'This is the step that makes LightRAG light: the graph is made searchable directly, so there is no summarisation hierarchy to build or maintain.',
      S(1, 'Profile every node and edge', 'A profiling function generates text key-value pairs. The paper: "Each index key is a word or short phrase that enables efficient retrieval, while the corresponding value is a text paragraph summarizing relevant snippets from external data."'),
      S(2, 'Deduplicate', 'The system "identifies and merges identical entities and relations from different segments of the raw text", which the paper notes reduces overhead by shrinking the graph.'),
      S(3, 'Store graph and vectors together', 'Graph structure alongside vector representations, which the abstract credits with "efficient retrieval of related entities and their relationships, significantly improving response times while maintaining contextual relevance".'),
      '**No community reports, and that is deliberate.** Nothing here is a summary of a summary. The retrievable unit is a node or an edge, which is why an update can touch one part of the graph without invalidating anything else.',
    ],
    cards: [{ label: 'Key-value profiles', hint: 'the retrievable unit', body: LIGHT_KV }],
  },
  {
    key: 'lr-update',
    group: 'index',
    chip: '3 · Incremental update',
    title: 'New documents by union, not rebuild',
    caption: 'A new document is processed the same way, then merged into the existing graph by taking the union of the node and edge sets.',
    panel: [
      'This is the capability the abstract leads with, and the one GraphRAG most conspicuously lacks: staying current "in rapidly changing data environments".',
      S(1, 'Process the new document identically', 'Chunk, extract, profile. Nothing special happens because it arrived late.'),
      S(2, 'Take the union', 'New graph components are combined with the existing ones "by taking the union of the node sets and edge sets". Existing structure is untouched.'),
      S(3, 'Skip the rebuild', 'No re-clustering, no re-summarising. Contrast GraphRAG, where a partition shift can invalidate community reports above it, which is a cascade of LLM calls.'),
      '**Why this matters more than it sounds.** For a corpus that changes daily, indexing cost is not a one-time payment; it is a recurring bill. A method that can absorb a document without touching the rest of the index changes the economics entirely.',
    ],
  },
  {
    key: 'lr-dual',
    group: 'search',
    chip: 'Dual-level retrieval',
    title: 'Dual-level retrieval: specific and abstract at once',
    caption: 'Low-level keywords retrieve precise facts about particular entities; high-level keywords retrieve themes spanning many of them.',
    panel: [
      'One query produces two kinds of keyword, and each drives a different kind of lookup. This is the framework\'s central mechanism.',
      S(1, 'Extract keywords at both levels', 'The LLM produces low-level keywords (concrete, entity-shaped) and high-level keywords (abstract, theme-shaped) from the same query.'),
      S(2, 'Low-level retrieval matches entities', 'Focused on specific entities, this level retrieves "precise information about particular nodes or edges within the graph". This is the question "what is LoRA".'),
      S(3, 'High-level retrieval matches relations', 'This addresses "broader topics and overarching themes" by "aggregating information across multiple related entities and relationships". This is the question "how do adaptation strategies compare".'),
      S(4, 'Expand into the neighbourhood', 'Both sets then pull in neighbouring nodes for comprehensiveness, so the context has structural reach beyond the exact matches.'),
      '**How this compares.** GraphRAG makes you choose the tool up front: local search for specific questions, global search for broad ones. LightRAG runs both levels for every query and merges the result. The library exposes that as modes: `local`, `global`, `hybrid`, `naive`, `mix`.',
    ],
    cards: [{ label: 'Dual-level retrieval', hint: 'two keyword sets, one query', body: LIGHT_DUAL }],
  },
]

/* ═══════════════════════════ PathRAG ═══════════════════════════ */

const PATH_FLOW = `# Flow-based pruning. A unit of resource is pushed from each start node
# and decays as it spreads, so distant and over-branching routes fade out.

alpha     = 0.7     # decay rate, per the paper's experimental setting
threshold = theta   # early-stopping cutoff

S = {v_start: 1.0}                       # unit resource at the source

def propagate(v_i):
    # every incoming neighbour contributes a decayed, degree-split share
    return sum(alpha * S[v_j] / len(out_neighbours(v_j))
               for v_j in in_neighbours(v_i))

# Early stop: once a node's per-edge share falls below theta, stop
# pushing through it. Highly connected hub nodes dilute fast, which is
# exactly the intent, since they are the main source of redundancy.
if S[v_i] / len(out_neighbours(v_i)) < threshold:
    stop()

# Reliability of a path = the average resource flowing through its edges,
# i.e. the summed node resources divided by the path's edge count.
def reliability(path):
    return sum(S[v] for v in path) / len(path.edges)

# Paper settings: alpha = 0.7, N = 40 candidate nodes, K = 15 kept paths.`

const PATH_PROMPT = `# Path-based prompting. Paths are laid out in ASCENDING reliability,
# so the single most reliable path is the LAST thing the model reads.

--- Retrieved relational paths (least to most reliable) ---

Path 15  (reliability 0.11)
  HEALTHCARE -> FEDERATED LEARNING -> DIFFERENTIAL PRIVACY
  "Federated learning is used on distributed clinical data."
  "Differential privacy is applied within federated pipelines."

...

Path 2   (reliability 0.68)
  QLORA -> LORA -> HYPERPARAMETERS
  "QLoRA extends LoRA with quantisation."
  "Rank and alpha are LoRA-specific hyperparameters."

Path 1   (reliability 0.74)
  LORA -> LARGE LANGUAGE MODELS
  "LoRA is the dominant method for adapting large models."

--- Question ---
How does a small team choose between LoRA and a full fine-tune?

# The paper places paths "in a reliability ascending order, ensuring that
# the most reliable relational path is positioned at the end of the
# template", addressing the "lost in the middle" problem by putting the
# most critical information at the two ends.`

const PATH: Stage[] = [
  {
    key: 'pr-index',
    group: 'index',
    chip: '1 · Indexing graph',
    title: 'A conventional indexing graph',
    caption: 'PathRAG builds a standard entity-and-relation graph. Its contribution is entirely at retrieval time.',
    panel: [
      'Worth stating plainly, because it sets up everything else: **PathRAG does not propose a new way to index.** It builds an indexing graph the way graph-RAG methods generally do, and then changes what happens when a question arrives.',
      S(1, 'Build the graph', 'Chunk, extract entities and relations, merge. Familiar territory, and the reference implementation is built on the LightRAG codebase, so the indexing path is close to it.'),
      S(2, 'Note what is being kept', 'Nodes, edges, and the text attached to each. No community hierarchy is required, because retrieval will navigate the graph directly rather than reading pre-written summaries of it.'),
      '**The problem PathRAG is aimed at.** The paper argues that "the limitation of current graph-based RAG methods lies in the redundancy of the retrieved information, rather than its insufficiency", and that organising retrieved material in a flat structure inside the prompt "leads to suboptimal performance". Both of those are retrieval and prompting problems, not indexing problems.',
    ],
  },
  {
    key: 'pr-nodes',
    group: 'search',
    chip: '2 · Anchor nodes',
    title: 'Find the nodes the query is about',
    caption: 'Keywords are extracted from the query, then matched to nodes by cosine similarity between keyword and node embeddings.',
    panel: [
      'Retrieval starts by picking anchors. Everything after this is about what connects them.',
      S(1, 'Extract keywords', 'An LLM pulls keywords out of the query, the same opening move LightRAG makes.'),
      S(2, 'Match nodes by dense vectors', 'Keywords are matched to graph nodes by cosine similarity between keyword embeddings and node embeddings. The paper\'s experiments retrieve **N = 40** candidate nodes.'),
      S(3, 'Treat them as endpoints, not as the answer', 'This is the key difference in framing. Other methods would now gather these nodes and their neighbourhoods and call that the context. PathRAG treats them as the endpoints of paths it has not found yet.'),
    ],
  },
  {
    key: 'pr-flow',
    group: 'search',
    chip: '3 · Flow pruning',
    title: 'Flow-based pruning with a decay rate',
    caption: 'A unit of resource starts at each anchor and decays as it spreads, splitting across out-edges, so distant and over-branching routes fade.',
    panel: [
      'This is the mechanism the paper is named for, and it is a resource-propagation scheme rather than a graph traversal heuristic.',
      S(1, 'Seed a unit of resource', 'Each starting node begins with resource 1.0.'),
      S(2, 'Propagate with decay, split by degree', 'Resource flowing into a node is the sum over its incoming neighbours of **α × S(v) / |N(v)|**: decayed by the rate α, and divided by how many out-edges the neighbour has. Experiments use **α = 0.7**.'),
      S(3, 'Let hubs dilute themselves', 'Dividing by out-degree means a highly connected hub passes only a thin share along each edge. That is deliberate: hubs are the main source of the redundancy the paper is attacking, and this makes them fade rather than dominate.'),
      S(4, 'Stop early below the threshold', 'When a node\'s per-edge share **S(v) / |N(v)|** falls below the pruning threshold θ, propagation through it stops. Distance awareness comes out of the decay rather than from a fixed hop limit.'),
      '**Why this beats a hop limit.** "Everything within two hops" pulls in a hub\'s entire neighbourhood regardless of whether it is on the way to anything. Decay-with-splitting scores a route by how *concentrated* the flow along it stays, which is much closer to what you actually want.',
    ],
    cards: [{ label: 'Flow-based pruning', hint: 'the algorithm', body: PATH_FLOW }],
  },
  {
    key: 'pr-score',
    group: 'search',
    chip: '4 · Score paths',
    title: 'Score each path by its average flow',
    caption: 'A path\'s reliability is the average resource flowing through its edges, and the top-K paths are kept.',
    panel: [
      'Now the retrieved unit stops being a node or a chunk and becomes a **path**: an ordered chain of entities and the relations between them.',
      S(1, 'Score each candidate path', 'Reliability is the average of the resource values flowing through the path\'s edges, that is, the summed node resources divided by the path\'s edge count. Averaging rather than summing stops a long path from scoring well purely by being long.'),
      S(2, 'Keep the top K', 'The paper\'s experiments keep **K = 15** paths.'),
      S(3, 'Convert paths to text', 'Each kept path is rendered into textual form: the entities in order, with the relation descriptions that join them.'),
      '**What this buys.** A path carries something a bag of chunks cannot: an explicit chain of reasoning the model can follow. It also cuts redundancy directly, because two paths through the same hub score similarly and only the better one survives the cut.',
    ],
  },
  {
    key: 'pr-prompt',
    group: 'search',
    chip: '5 · Path prompting',
    title: 'Path-based prompting, most reliable last',
    caption: 'Paths are ordered by ascending reliability so the strongest one sits at the end of the prompt, next to the question.',
    panel: [
      'The final stage is a prompt-layout decision, and it is the most counterintuitive part of the method.',
      S(1, 'Order paths ascending by reliability', 'Paths are "organized in a reliability ascending order, ensuring that the most reliable relational path is positioned at the end of the template". Weakest first, strongest last.'),
      S(2, 'Aim at "lost in the middle"', 'The stated reason is the well-documented finding that models attend least to material buried in the middle of a long context. Ordering ascending puts "the most critical information at the two ends of the template".'),
      S(3, 'Give the model chains, not fragments', 'Because each block is a path rather than a passage, the prompt presents explicit reasoning chains. The paper credits this with more logical and coherent answers, not just more accurate ones.'),
      '**The claim.** PathRAG reports consistently outperforming state-of-the-art baselines across six datasets and five evaluation dimensions. Note that two of the three ideas here, flow pruning and prompt ordering, are independent of how you built the graph, so they are portable to other graph-RAG stacks.',
    ],
    cards: [{ label: 'Path-based prompting', hint: 'ascending reliability', body: PATH_PROMPT }],
  },
]

/* ═══════════════════════════ tracks ═══════════════════════════ */

export const LAZY_TRACK: Track = {
  label: 'LazyGraphRAG',
  tagline: 'Defers every LLM call to query time, and indexes for the price of vector RAG.',
  stages: LAZY,
  source: {
    name: 'Microsoft Research, Nov 2024',
    url: 'https://www.microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost/',
  },
}

export const LIGHT_TRACK: Track = {
  label: 'LightRAG',
  tagline: 'Retrieves at two levels at once, and absorbs new documents without a rebuild.',
  stages: LIGHT,
  source: { name: 'Guo et al., arXiv:2410.05779', url: 'https://arxiv.org/abs/2410.05779' },
}

export const PATH_TRACK: Track = {
  label: 'PathRAG',
  tagline: 'Retrieves relational paths, prunes them by flow, and orders them to beat lost-in-the-middle.',
  stages: PATH,
  source: { name: 'Chen et al., arXiv:2502.14902', url: 'https://arxiv.org/abs/2502.14902' },
}
