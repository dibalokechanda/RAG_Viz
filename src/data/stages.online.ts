import type { Stage } from './types'

/**
 * ONLINE PATH, runs per query.
 */
export const onlineStages: Stage[] = [
  {
    id: 'user-query',
    icon: 'chat',
    label: 'User Query',
    phase: 'online',
    kind: 'terminal',
    ordinal: '1',
    tagline: 'Raw text, mid-conversation',
    detail: [
      'What actually arrives is rarely self-contained. It arrives with pronouns, ellipsis, and assumptions inherited from earlier turns, which is why the next few stages exist.',
    ],
    trace: {
      headline: 'Query received',
      payload: 'How is it different?',
      note: 'Previous turn: "Explain FAISS". On its own this query is unanswerable, "it" refers to nothing.',
    },
  },

  {
    id: 'understanding',
    icon: 'braces',
    label: 'Query Understanding',
    phase: 'online',
    kind: 'sequential',
    ordinal: '1a',
    tagline: 'What does the user actually want?',
    detail: [
      'Turn free text into a structured object the rest of the pipeline can branch on: **intent**, **domain**, **entities**, **constraints**, **missing context**, and **ambiguity**.',
      'The output is typically a JSON-like record, produced by classical NLP, a small classifier, or an LLM, in ascending order of cost and capability.',
    ],
    example: {
      beforeLabel: 'Input',
      before: 'How is it different?',
      afterLabel: 'Structured representation',
      after: 'Intent:   Comparison\nTopic:    HNSW vs FAISS\nContext:  Prior discussion of ANN indexes',
      mono: true,
    },
    distinctions: [
      {
        title: 'Understanding vs. Classification',
        body: 'Understanding asks "what does the user mean?". Classification asks "which retrieval strategy should we use?". Adjacent stages, different questions, and conflating them is why routing logic ends up tangled with entity extraction.',
      },
    ],
    concepts: [
      {
        id: 'und-slots',
        label: 'The extracted slots',
        kind: 'idea',
        summary: 'Intent, entities, constraints, ambiguity',
        detail: [
          'Intent is the shape of the answer wanted, definition, comparison, procedure, troubleshooting, aggregation. It determines how many chunks you need and how they must be combined.',
          'Entities are the things to match on, and they double as metadata filters. Constraints are the scoping conditions, a date range, a product version, a jurisdiction; that should become filters rather than being left for the embedding to somehow capture.',
          'Ambiguity is the slot people skip. Recording that a query is under-specified lets you ask a clarifying question instead of confidently retrieving for the wrong reading.',
        ],
        children: [
          {
            id: 'und-answerable',
            label: 'Answerability',
            kind: 'method',
            summary: 'Decide early whether to retrieve at all',
            detail: [
              '"Hello", "summarise our last conversation", and "what is 17 × 23" do not need retrieval. Running the full pipeline on them wastes latency and, worse, injects irrelevant chunks that the model may try to use.',
              'A cheap classifier at this stage routing to a no-retrieval path is one of the highest-value additions to a vanilla pipeline.',
            ],
          },
        ],
      },
      {
        id: 'und-cost',
        label: 'Cost of the extractor',
        kind: 'tradeoff',
        summary: 'Rules, classifier, or LLM',
        detail: [
          'Rules and regexes are free and instant but brittle. A small fine-tuned classifier is a few milliseconds and handles paraphrase. An LLM call handles anything but adds 200–800 ms to every query, before retrieval has even begun.',
          'Because this sits on the critical path of every single request, the usual answer is a small model for routing plus an LLM only when the small model reports low confidence.',
        ],
        math: [
          {
            title: 'Added latency',
            tex: String.raw`L_{\text{total}} = L_{\text{understand}} + L_{\text{retrieve}} + L_{\text{rerank}} + L_{\text{generate}}`,
            worked: [
              { tex: String.raw`L = 400 + 30 + 80 + 1200 = 1710\ \text{ms}`, caption: 'LLM-based understanding' },
              { tex: String.raw`L = 8 + 30 + 80 + 1200 = 1318\ \text{ms}`, caption: 'small classifier, 23% faster end to end' },
            ],
          },
        ],
      },
    ],
    trace: {
      headline: 'Intent extracted',
      payload: 'Intent:   Comparison\nTopic:    HNSW vs FAISS\nEntities: [FAISS, HNSW]\nContext:  Prior discussion of ANN indexes',
      mono: true,
    },
  },

  {
    id: 'classification',
    icon: 'branch',
    label: 'Query Classification',
    phase: 'online',
    kind: 'sequential',
    ordinal: '1b',
    tagline: 'Which retrieval strategy fits?',
    detail: [
      '- **A routing decision, not a plan:** Dense, sparse, hybrid, SQL, plain keyword search, pick the machinery that suits this class of question.',
      '- **Not an agent:** In vanilla RAG this is a single branch evaluated once. It is emphatically not an agent deliberating over a strategy; that is a different architecture.',
    ],
    example: {
      beforeLabel: 'Possible routes',
      before: 'Dense Retrieval\nSparse Retrieval\nHybrid Retrieval\nSQL\nKeyword Search',
      afterLabel: 'Chosen',
      after: 'Hybrid, conceptual comparison, but with exact product names to match',
      mono: true,
    },
    concepts: [
      {
        id: 'cls-signals',
        label: 'Routing signals',
        kind: 'method',
        summary: 'What actually predicts the right route',
        detail: [
          '- **Rare exact tokens:** Error codes, part numbers, function names, identifiers, argue for sparse. Dense retrieval is weakest precisely where a token appears a handful of times in the corpus, because a rare term contributes little to a pooled embedding.',
          '- **Conceptual or paraphrase-heavy questions:** Argue for dense. Aggregations ("how many", "average") argue for SQL against a real database, since no amount of chunk retrieval will let an LLM count reliably.',
          '- **When the signals conflict:** In a question naming two products while asking a conceptual comparison they often do conflict, which is why **hybrid** is the sane default.',
        ],
      },
      {
        id: 'cls-cost',
        label: 'Misrouting cost',
        kind: 'pitfall',
        summary: 'The failure is silent',
        detail: [
          'A misrouted query does not error. It retrieves plausible-looking chunks that do not contain the answer, and the model either hedges or invents. From the outside it looks like a generation problem.',
          'This is why retrieval metrics matter so much: without them you cannot distinguish "the model hallucinated" from "the right chunk was never retrieved", and those have completely different fixes.',
        ],
      },
    ],
    trace: { headline: 'Route selected', payload: 'Hybrid Retrieval', note: 'Conceptual question, but "FAISS" and "HNSW" are exact terms worth matching literally.' },
  },

  {
    id: 'rewriting',
    icon: 'pencil',
    label: 'Query Rewriting',
    phase: 'online',
    kind: 'sequential',
    ordinal: '1c',
    tagline: 'Resolve references, preserve meaning',
    detail: [
      'Rewrite the question so it stands alone, using conversation history to resolve pronouns and fill in what was left implicit.',
      'The constraint is that meaning must not change. Rewriting makes the question self-contained; it does not make it a different question.',
    ],
    example: {
      beforeLabel: 'Conversation',
      before: 'Explain FAISS\nHow is it different?',
      afterLabel: 'Rewritten',
      after: 'How is FAISS different from HNSW?',
      mono: true,
    },
    concepts: [
      {
        id: 'rw-coref',
        label: 'Coreference resolution',
        kind: 'method',
        summary: 'Bind pronouns to earlier entities',
        detail: [
          '- **Unresolved pronouns fail:** "It", "that one", "the second approach", and bare ellipsis all point at something in the history. Embedding them unresolved retrieves on the pronoun, which carries no information at all.',
          '- **Resolve against recent turns only:** Reaching too far back binds to stale entities and produces a fluent rewrite of a question the user did not ask. This failure mode is worse than not rewriting, because it is invisible downstream.',
        ],
      },
      {
        id: 'rw-drift',
        label: 'Meaning drift',
        kind: 'pitfall',
        summary: 'The rewrite must not answer the question',
        detail: [
          'An LLM asked to "improve" a query will happily narrow it, add assumptions, or fold in its own prior beliefs about the answer. The rewritten query then retrieves evidence for the model’s guess rather than for the user’s question, a self-fulfilling retrieval loop.',
          'Constrain the prompt to reference resolution and self-containment only, and keep the original query for the final prompt so the model answers what was actually asked.',
        ],
      },
      {
        id: 'rw-eval',
        label: 'Measuring it',
        kind: 'metric',
        summary: 'Compare recall with and without',
        detail: [
          'Rewriting is worth its latency only on conversational traffic. On single-turn queries it is a no-op at best and drift risk at worst.',
          'Measure recall@K on a set of multi-turn queries with and without the rewrite step. If your traffic is mostly first-turn, the aggregate gain will be near zero and the step belongs behind a conditional.',
        ],
      },
    ],
    trace: { headline: 'Pronoun resolved', payload: 'How is FAISS different from HNSW?', note: '"it" → FAISS, recovered from the previous turn.' },
  },

  {
    id: 'expansion',
    icon: 'expand',
    label: 'Query Expansion',
    phase: 'online',
    kind: 'sequential',
    ordinal: '1d',
    tagline: 'Add terminology to raise recall',
    detail: [
      'Add synonyms and alternate phrasings so you match documents that discuss the same thing in different words. The classic case is a corpus that uses clinical vocabulary while the user types colloquially.',
      '**This is a recall play, and it costs you precision.** Every term you add is another way to match something irrelevant.',
    ],
    example: {
      beforeLabel: 'Query',
      before: 'Heart attack',
      afterLabel: 'Expanded',
      after: 'Heart attack\nMyocardial infarction\nCardiac arrest  (if appropriate)',
      mono: true,
    },
    math: [
      {
        title: 'The precision/recall trade being made',
        tex: String.raw`P = \frac{tp}{tp + fp}, \qquad R = \frac{tp}{tp + fn}`,
        note: 'Expansion adds true positives (raising R) and false positives (lowering P). It is worth it whenever a reranker downstream can discard the false positives, which is exactly why expansion and reranking are usually deployed together.',
      },
      {
        title: 'Weighting expanded terms below the original',
        tex: String.raw`q' = q + \beta \sum_{t \in E} w_t \cdot t, \qquad \beta < 1`,
        where: [
          { sym: String.raw`E`, means: 'the expansion terms' },
          { sym: String.raw`\beta`, means: 'how much the expansion is allowed to move the query' },
        ],
        note: 'Related to Rocchio relevance feedback. Giving expansions equal weight to the original lets three loose synonyms outvote the term the user actually typed.',
      },
    ],
    tradeoffs: { gains: ['Higher recall', 'Bridges vocabulary mismatch between user and corpus'], costs: ['Lower precision', 'Bad synonyms actively poison results'] },
    concepts: [
      {
        id: 'exp-sources',
        label: 'Where synonyms come from',
        kind: 'method',
        summary: 'Ontology, corpus statistics, or LLM',
        detail: [
          '- **Curated ontology:** SNOMED, MeSH, or an internal glossary. Precise and auditable, and in regulated domains often the only acceptable option.',
          '- **Corpus-derived:** Mines co-occurrence from your own data, learning house jargon no public ontology contains. (e.g. Pseudo-relevance feedback).',
          '- **LLM expansion:** The most flexible but least controllable. It invents plausible synonyms that may not appear anywhere in your corpus, adding cost with no recall benefit.',
        ],
        children: [
          {
            id: 'exp-prf',
            label: 'Pseudo-relevance feedback',
            kind: 'formula',
            summary: 'Assume the top-k are relevant, mine their terms',
            math: [
              {
                title: 'Rocchio, without explicit judgements',
                tex: String.raw`q' = \alpha q + \frac{\beta}{|D_r|}\sum_{d \in D_r} d`,
                where: [
                  { sym: String.raw`D_r`, means: 'the top-k documents from a first retrieval pass, assumed relevant' },
                  { sym: String.raw`\alpha, \beta`, means: 'weights on the original query and the feedback centroid' },
                ],
                note: 'Doubles retrieval cost and amplifies whatever the first pass got wrong, if the top-k were off-topic, the expanded query is confidently off-topic.',
              },
            ],
          },
        ],
      },
      {
        id: 'exp-dense',
        label: 'Do dense retrievers need it?',
        kind: 'idea',
        summary: 'Mostly not, sparse retrieval does',
        detail: [
          '- **Dense retrieval handles paraphrase natively:** "heart attack" and "myocardial infarction" sit close together in embedding space. Expanding often adds nothing and blurs the vector.',
          '- **Sparse retrieval needs it:** BM25 matches strings. Expansion is close to mandatory there, which means in a hybrid system you should often **expand only the sparse branch**.',
        ],
      },
    ],
    trace: { headline: 'Vocabulary broadened', payload: 'How is FAISS different from HNSW?\n+ vector index\n+ ANN library\n+ similarity search', mono: true },
  },

  {
    id: 'multi-query',
    icon: 'fanout',
    label: 'Multi-Query Retrieval',
    phase: 'online',
    kind: 'fanout',
    ordinal: '1e',
    tagline: 'One question becomes several searches',
    code: [
      {
        title: 'LangChain',
        language: 'python',
        code: `from langchain.retrievers import MultiQueryRetriever
from langchain_openai import ChatOpenAI

retriever = MultiQueryRetriever.from_llm(
    retriever=store.as_retriever(search_kwargs={"k": 10}),
    llm=ChatOpenAI(model="gpt-4o-mini", temperature=0),
)  # generates several query variants, retrieves each, unions the results`,
      },
    ],
    detail: [
      'Rather than searching once, generate several semantically distinct queries covering different facets of the question. Each retrieves independently, and the result sets are merged before reranking.',
      '**When to use:** It helps most when one phrasing simply cannot reach all the relevant material (e.g. a broad question whose answer is scattered across sub-topics).',
    ],
    example: {
      beforeLabel: 'Query',
      before: 'Explain Transformers',
      afterLabel: 'Generated queries',
      after: 'Transformer architecture\nSelf-attention\nPositional encoding\nEncoder-decoder architecture',
      mono: true,
    },
    math: [
      {
        title: 'Why independent queries raise recall',
        tex: String.raw`R_{\text{union}} = 1 - \prod_{i=1}^{q}(1 - R_i)`,
        where: [
          { sym: String.raw`R_i`, means: 'recall of the i-th query variant' },
          { sym: String.raw`q`, means: 'number of variants' },
        ],
        worked: [
          { tex: String.raw`R = 1 - (1 - 0.6)^1 = 0.60`, caption: 'a single query' },
          { tex: String.raw`R = 1 - (1 - 0.6)^4 = 1 - 0.0256 = 0.974`, caption: 'four fully independent variants' },
        ],
        note: 'The independence assumption is optimistic, real variants correlate heavily, so treat this as an upper bound. It does explain why the first two variants help far more than the fourth.',
      },
      {
        title: 'Cost',
        tex: String.raw`C = c_{\text{LLM}} + q \cdot (c_{\text{embed}} + c_{\text{search}})`,
        worked: [
          { tex: String.raw`C = 300 + 4 \times (10 + 25) = 440\ \text{ms}`, caption: 'against 35 ms for a single query' },
        ],
        note: 'The searches parallelise; the generation call in front of them does not.',
      },
    ],
    figures: [
      {
        kind: 'curve',
        title: 'Recall against number of query variants',
        xLabel: 'query variants',
        yLabel: 'recall',
        lines: [
          {
            points: [
              [1, 0.6],
              [2, 0.84],
              [3, 0.936],
              [4, 0.974],
              [5, 0.99],
              [6, 0.996],
            ],
          },
          {
            dashed: true,
            points: [
              [1, 0.6],
              [2, 0.72],
              [3, 0.78],
              [4, 0.81],
              [5, 0.83],
              [6, 0.84],
            ],
          },
        ],
        marks: [
          { x: 2, y: 0.84, label: 'best value' },
          { x: 6, y: 0.84, label: 'realistic' },
        ],
        xTicks: [
          { at: 1, label: '1' },
          { at: 3, label: '3' },
          { at: 6, label: '6' },
        ],
        yTicks: [
          { at: 0.5, label: '' },
          { at: 0.75, label: '' },
          { at: 1, label: '1' },
        ],
        caption:
          'The solid line assumes the variants fail independently, the formula below. The dashed line is what actually happens, because real variants correlate: they all find the easy documents and miss the same hard ones. Either way the second variant earns far more than the fifth, so the practical setting is 3–4. Beyond that you are paying linearly for a curve that has already flattened.',
      },
    ],
    fanoutInto: ['Architecture', 'Self-attention', 'Positional encoding', 'Encoder-decoder'],
    tradeoffs: { gains: ['Much broader coverage', 'Robust to unlucky phrasing'], costs: ['q× retrieval cost', 'Needs dedup on merge', 'Extra LLM call up front'] },
    distinctions: [
      {
        title: 'Multi-Query vs. Decomposition',
        body: 'Multi-query asks the same question several ways and pools the evidence, the sub-queries are redundant by design. Decomposition asks genuinely different sub-questions whose answers are each needed, the sub-queries are complementary. Same fan-out shape in the graph, opposite intent, and different merge semantics: pooling evidence versus assembling parts.',
      },
    ],
    concepts: [
      {
        id: 'mq-diversity',
        label: 'Diversity is the whole point',
        kind: 'pitfall',
        summary: 'Four paraphrases retrieve one result set',
        detail: [
          'If the generated variants are near-paraphrases, they retrieve nearly identical chunks and you have paid 4× for nothing. The value comes entirely from variants that reach *different* regions of the corpus.',
          '**Best Practice:** Prompt for facets, not rewordings (e.g. mechanism, comparison, failure modes). Then measure the pairwise Jaccard overlap of the retrieved sets; if it is high, the step is not earning its cost.',
        ],
        math: [
          {
            title: 'Overlap check',
            tex: String.raw`\text{redundancy} = \frac{2}{q(q-1)}\sum_{i<j} \frac{|D_i \cap D_j|}{|D_i \cup D_j|}`,
            note: 'Mean pairwise Jaccard over the retrieved sets. Above ~0.7 the variants are paraphrases and multi-query is pure overhead.',
          },
        ],
      },
      {
        id: 'mq-merge',
        label: 'Merging the branches',
        kind: 'method',
        summary: 'Pool, deduplicate, then rerank',
        detail: [
          'Merge before reranking, never after. Reranking each branch separately and concatenating gives you scores computed over different candidate pools, which are not comparable, the same chunk can hold rank 1 in one branch and rank 8 in another.',
          'RRF is the usual merge operator here too, since it fuses ranked lists without needing their scores to share a scale.',
        ],
      },
    ],
    trace: {
      headline: 'Fanned out into 4 queries',
      payload: 'How does FAISS index vectors?\nHow does HNSW traverse its graph?\nFAISS vs HNSW memory footprint\nWhen to choose FAISS over HNSW',
      mono: true,
      note: 'Each retrieves independently. Results merge before reranking.',
    },
  },

  {
    id: 'decomposition',
    icon: 'split',
    label: 'Query Decomposition',
    phase: 'online',
    kind: 'fanout',
    ordinal: '1f',
    tagline: 'Break a compound question apart',
    code: [
      {
        title: 'LangGraph',
        language: 'python',
        code: `from langgraph.graph import StateGraph, END

# Independent sub-questions retrieve in parallel, then a node synthesises.
g = StateGraph(State)
g.add_node("decompose", split_into_subquestions)
g.add_node("retrieve", retrieve_each_subquestion)   # fan-out
g.add_node("synthesize", combine_answers)
g.add_edge("decompose", "retrieve")
g.add_edge("retrieve", "synthesize"); g.add_edge("synthesize", END)`,
        note: 'LangGraph is the right tool once sub-questions are dependent, i.e. one must be answered before the next can be asked, which is where vanilla RAG ends.',
      },
    ],
    detail: [
      'Only worth doing for genuinely compound questions. Split into independent sub-questions, retrieve for each, then combine the answers at the end.',
      'The tell is a question containing several questions, "compare X, Y and Z" is three retrievals wearing a trenchcoat.',
    ],
    example: {
      beforeLabel: 'Compound question',
      before: 'Compare FAISS, HNSW and Product Quantization.',
      afterLabel: 'Three retrievals',
      after: 'What is FAISS?\nWhat is HNSW?\nWhat is Product Quantization?',
      mono: true,
    },
    math: [
      {
        title: 'Why one retrieval cannot serve a compound question',
        tex: String.raw`K_{\text{per part}} = \frac{K}{s}`,
        where: [
          { sym: String.raw`K`, means: 'total slots retrieved' },
          { sym: String.raw`s`, means: 'number of sub-topics in the question' },
        ],
        worked: [
          { tex: String.raw`\frac{10}{3} \approx 3.3`, caption: 'three slots per topic, if the split were even, which it will not be' },
        ],
        note: 'In practice the dominant topic takes most of the slots and one topic gets nothing, so the answer is confidently incomplete on the part that was starved.',
      },
    ],
    fanoutInto: ['What is FAISS?', 'What is HNSW?', 'What is PQ?'],
    tradeoffs: { gains: ['Each sub-question retrieved properly', 'Handles questions no single search can serve'], costs: ['s× cost', 'Answers must be recombined coherently', 'Useless, and harmful, on simple questions'] },
    concepts: [
      {
        id: 'dec-dependency',
        label: 'Independent vs. dependent parts',
        kind: 'idea',
        summary: 'Some sub-questions need the previous answer',
        detail: [
          '"Compare FAISS and HNSW" decomposes into independent parts that retrieve in parallel. "What indexing method does the library in our stack use, and how does it scale?" does not; you must answer the first part before you can even phrase the second.',
          'Dependent decomposition is sequential and is where vanilla RAG ends and agentic retrieval begins. Recognising the difference matters, because running dependent sub-questions in parallel retrieves for a question you have not yet resolved.',
        ],
      },
      {
        id: 'dec-recombine',
        label: 'Recombination',
        kind: 'method',
        summary: 'Two ways to assemble the answer',
        detail: [
          'Either pool all retrieved context and generate one answer, or answer each sub-question separately and synthesise. Pooling is cheaper and keeps the prose coherent; separate answers keep each part properly grounded but read like a list and can contradict each other.',
          'Pooling risks the context budget: three sub-questions at K = 10 each is 30 chunks, which will not fit. Deduplication and reranking across the pooled set are not optional here.',
        ],
      },
      {
        id: 'dec-overuse',
        label: 'Over-decomposition',
        kind: 'pitfall',
        summary: 'Simple questions get shredded',
        detail: [
          'An LLM asked to decompose will decompose anything. "What is HNSW?" becomes "what is a graph", "what is a small-world network", "what is hierarchical navigation", three retrievals that individually miss the actual topic.',
          'Gate the step on a compound-question classifier rather than running it unconditionally. The cost of decomposing a simple question is not just latency; it is worse retrieval.',
        ],
      },
    ],
    trace: { headline: 'Split into sub-questions', payload: 'What is FAISS?\nWhat is HNSW?\nHow do they differ?', mono: true },
  },

  {
    id: 'hyde',
    icon: 'ghostdoc',
    label: 'HyDE',
    phase: 'online',
    kind: 'optional',
    ordinal: '1g',
    tagline: 'Embed a hypothetical answer, not the question',
    code: [
      {
        title: 'LangChain',
        language: 'python',
        code: `from langchain.chains import HypotheticalDocumentEmbedder
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

# Embeds an LLM-written hypothetical answer instead of the question.
hyde = HypotheticalDocumentEmbedder.from_llm(
    ChatOpenAI(temperature=0), OpenAIEmbeddings(), prompt_key="web_search")
store = Chroma(embedding_function=hyde, persist_directory="./idx")`,
        note: 'The generated document is used only for its embedding and then discarded; its factual accuracy does not matter.',
      },
    ],
    detail: [
      'Hypothetical Document Embedding. Have the LLM write a plausible answer to the question first, then embed that instead of the question itself.',
      'The intuition is a shape mismatch: your index is full of explanatory paragraphs, but a query is a short interrogative. A written-out paragraph sits closer to real documents in embedding space than the question does.',
      'The generated text is thrown away once it has been embedded. It never reaches the user, and its factual accuracy does not matter, only its vocabulary and shape.',
    ],
    math: [
      {
        title: 'The asymmetry it exploits',
        tex: String.raw`\mathbb{E}[\cos(e_{\text{doc}}, e_{d})] > \mathbb{E}[\cos(e_{q}, e_{d})]`,
        where: [
          { sym: String.raw`e_q`, means: 'embedding of the short question' },
          { sym: String.raw`e_{\text{doc}}`, means: 'embedding of the hypothetical answer' },
          { sym: String.raw`e_d`, means: 'embedding of a real corpus chunk' },
        ],
        note: 'A document-shaped string is simply closer to documents than a question-shaped string is. HyDE converts the query into the modality the index was built from.',
      },
      {
        title: 'Averaging several hypotheticals',
        tex: String.raw`e_{\text{HyDE}} = \frac{1}{h}\sum_{i=1}^{h} \text{embed}(\text{doc}_i)`,
        note: 'Generating h hypotheticals at nonzero temperature and averaging cancels some of the hallucinated specifics while keeping the shared vocabulary. Typically h = 3–5.',
      },
    ],
    example: {
      beforeLabel: 'User asks',
      before: 'How does HNSW work?',
      afterLabel: 'LLM generates (then discarded after embedding)',
      after: 'HNSW is a hierarchical graph-based ANN algorithm...',
      mono: true,
    },
    tradeoffs: { gains: ['Strong on short or vague questions', 'Closes the question/document shape gap', 'No retraining, no index change'], costs: ['Extra LLM call before retrieval even starts', 'A confidently wrong hypothesis retrieves confidently wrong documents'] },
    concepts: [
      {
        id: 'hyde-failure',
        label: 'When it backfires',
        kind: 'pitfall',
        summary: 'Hallucinated specifics steer retrieval',
        detail: [
          'For niche or proprietary topics the model has no knowledge of, the hypothetical is invented wholesale, invented product names, invented parameters, invented API calls. Embedding that pulls retrieval toward a fiction.',
          'The tell is a domain where the base model is weak but your corpus is strong, which is exactly the situation RAG exists to serve. HyDE helps most on general topics and hurts most on the proprietary ones.',
        ],
      },
      {
        id: 'hyde-alt',
        label: 'Alternatives to the same problem',
        kind: 'idea',
        summary: 'Other ways to close the shape gap',
        detail: [
          'Instruction-prefixed embedding models take a "query:" / "passage:" marker and handle the asymmetry inside the model, at zero extra latency. If your model supports it; this is strictly better than HyDE.',
          'Doc2query attacks it from the index side instead: at ingestion time, generate the questions each chunk answers and index those alongside it. All the cost moves offline, where it is paid once rather than per query.',
        ],
        children: [
          {
            id: 'hyde-doc2query',
            label: 'Doc2query',
            kind: 'method',
            summary: 'Pre-generate questions per chunk, offline',
            detail: [
              'For each chunk, have a model write the questions it answers, and append them to the chunk before embedding. Now the index contains question-shaped text, so a real query matches directly.',
              'Cost is one generation per chunk at ingestion, substantial for a large corpus, but paid once and amortised over every future query, rather than once per query as HyDE is.',
            ],
          },
        ],
      },
    ],
    trace: {
      headline: 'Hypothetical document generated',
      payload:
        'FAISS is a library for efficient similarity search over dense\nvectors, offering multiple index types including IVF and PQ.\nHNSW is a graph-based ANN algorithm built on a hierarchical\nnavigable small-world structure...',
      mono: true,
      note: 'This paragraph is embedded. The text itself is then discarded.',
    },
  },

  {
    id: 'query-embedding',
    icon: 'vector',
    label: 'Query Embedding',
    phase: 'online',
    kind: 'sequential',
    ordinal: '6',
    tagline: 'Same model as the corpus, non-negotiable',
    detail: [
      'The query is embedded with the exact model used on the chunks. Vectors from two different models are not comparable, and nothing will warn you, you just get quietly meaningless results.',
      'If the model is instruction-prefixed, the query prefix must be applied here and the passage prefix must have been applied at ingestion. Getting this backwards is a silent, measurable recall loss.',
    ],
    math: [
      {
        title: 'What the search then computes',
        tex: String.raw`\text{top-}K = \operatorname*{arg\,max}_{d \in \mathcal{D}}{}^{K}\ \frac{q \cdot d}{\lVert q \rVert \lVert d \rVert}`,
        note: 'On normalised vectors this reduces to the inner product q·d, which is a single fused multiply-add per dimension, the reason normalisation is done once at write time.',
      },
    ],
    concepts: [
      {
        id: 'qemb-cache',
        label: 'Caching',
        kind: 'method',
        summary: 'Queries repeat far more than you expect',
        detail: [
          'Real query distributions are heavily skewed, a small set of questions accounts for a large share of traffic. Caching the embedding keyed on the normalised query string removes an entire model call from the hot path.',
          'Cache after normalisation (lowercase, collapse whitespace, strip punctuation) to raise the hit rate, and version the key on the embedding model so a model change invalidates it automatically rather than serving stale vectors from the wrong space.',
        ],
      },
      {
        id: 'qemb-prefix',
        label: 'Instruction prefixes',
        kind: 'pitfall',
        summary: 'Asymmetric models need the right marker',
        detail: [
          'Models such as E5 and BGE expect "query: " on queries and "passage: " on documents. The prefixes are not decoration; they were present during training and shift the representation meaningfully.',
          'Omitting them, or applying the same prefix to both sides, costs several points of recall and produces no error. It is worth asserting the prefix in code rather than trusting a convention.',
        ],
      },
    ],
    trace: { headline: 'Query vectorised', payload: '[ 0.0182, -0.4417,  0.2093,  0.0071, ... ]   1536-d, ‖q‖ = 1', mono: true, note: 'Same embedding model that built the index.' },
  },

  {
    id: 'semantic-cache',
    icon: 'bolt',
    label: 'Semantic Cache',
    phase: 'online',
    kind: 'optional',
    ordinal: '6a',
    tagline: 'Answer it without touching the retriever',
    code: [
      {
        title: 'LangChain',
        language: 'python',
        code: `from langchain.globals import set_llm_cache
from langchain_community.cache import RedisSemanticCache
from langchain_openai import OpenAIEmbeddings

set_llm_cache(RedisSemanticCache(
    redis_url="redis://localhost:6379",
    embedding=OpenAIEmbeddings(),
    score_threshold=0.05,   # cosine DISTANCE; smaller = stricter match
))`,
        note: 'The threshold is the safety dial: too loose and it answers a different question. Key entries on ACL scope, not user id, or answers leak across users.',
      },
    ],
    detail: [
      'Real query distributions are heavily skewed. A small set of questions accounts for a large share of traffic, which means many requests are re-deriving answers the system has already produced. Caching is usually the cheapest latency and cost win available.',
      '**There are four distinct caches, and they invalidate on different things:**',
      '- **Embedding cache:** Maps text to vector. Keyed on normalised text + embedding model version. It never goes stale for a given model (pure profit).',
      '- **Retrieval cache:** Maps a query to the chunk IDs it returned. Invalidated by any change to the index.',
      '- **Answer cache:** Maps a query to the finished response. Invalidated by changes to the index, the prompt, or the generation model.',
      '- **Provider-side prompt caching:** Caches the attention state of a shared prefix. Rewards putting the stable part of the prompt first.',
      '**The semantic part is what makes the answer cache interesting.** Instead of requiring an exact string match, you embed the incoming query and look for a stored query within some cosine distance. "How do I reset my password" then hits the entry stored for "password reset steps".',
      'This is also exactly where it becomes dangerous, because the cosine threshold is now deciding whether two questions mean the same thing.',
    ],
    stack: [
      { name: 'Redis', what: 'In-memory key-value store, widely used for fast caching', url: 'https://redis.io/' },
      { name: 'GPTCache', what: 'Purpose-built semantic cache for LLM responses', url: 'https://github.com/zilliztech/GPTCache' },
      { name: 'Momento', what: 'Serverless caching with vector search support', url: 'https://www.gomomento.com/' },
    ],
    math: [
      {
        title: 'What a cache actually saves',
        tex: String.raw`\bar{C} = h \cdot C_{\text{hit}} + (1 - h) \cdot C_{\text{miss}}`,
        where: [
          { sym: String.raw`h`, means: 'hit rate' },
          { sym: String.raw`C_{\text{hit}}`, means: 'cost of a cache lookup, roughly one embedding plus one ANN probe' },
          { sym: String.raw`C_{\text{miss}}`, means: 'full pipeline cost, dominated by generation' },
        ],
        worked: [
          { tex: String.raw`C_{\text{miss}} = 1800\text{ms},\ C_{\text{hit}} = 40\text{ms}` },
          { tex: String.raw`h = 0.30 \Rightarrow \bar{C} = 0.3(40) + 0.7(1800) = 1272\text{ms}`, caption: '29% faster on average' },
          { tex: String.raw`h = 0.60 \Rightarrow \bar{C} = 0.6(40) + 0.4(1800) = 744\text{ms}`, caption: '59% faster' },
        ],
        note: 'Because the miss cost is dominated by generation, the saving is close to linear in hit rate. That is unusual and it is why caching pays back faster here than in most systems.',
      },
      {
        title: 'The threshold is a precision decision',
        tex: String.raw`\text{serve cached} \iff \cos(q, q_{\text{cached}}) \ge \tau`,
        worked: [
          { tex: String.raw`\tau = 0.99`, caption: 'near-exact only; low hit rate, essentially no false hits' },
          { tex: String.raw`\tau = 0.95`, caption: 'the usual operating point' },
          { tex: String.raw`\tau = 0.85`, caption: 'high hit rate, and it will confidently answer a different question' },
        ],
        note: 'A false hit is worse than a miss by a wide margin. A miss costs latency; a false hit returns a fluent, confident answer to a question the user did not ask, and nothing downstream will catch it because there is no downstream.',
      },
      {
        title: 'Why hit rates are high in practice',
        tex: String.raw`f(k) \propto \frac{1}{k^{s}}`,
        where: [{ sym: String.raw`k`, means: 'rank of a query by popularity' }],
        note: 'Query popularity is roughly Zipfian, so a cache holding the top few thousand distinct questions can cover a large fraction of traffic. This is also why hit rate climbs quickly at first and then flattens.',
      },
    ],
    figures: [
      {
        kind: 'blocks',
        title: 'Four caches, four invalidation rules',
        rows: [
          {
            label: 'query arrives',
            boxes: [{ text: 'normalise + embed' }],
            arrow: 'embedding cache: keyed on text + model',
          },
          {
            boxes: [{ text: 'answer cache: nearest stored query, cosine ≥ τ' }],
            arrow: 'hit? return, and skip everything below',
          },
          {
            boxes: [{ text: 'retrieval cache: query → chunk ids' }],
            arrow: 'miss falls through',
          },
          { boxes: [{ text: 'full pipeline: retrieve → rank → generate', filled: true }] },
        ],
        caption:
          'Each layer is invalidated by something different. The embedding cache only by a model change, the retrieval cache by any index rebuild, the answer cache by the index, prompt and model together. Keying every entry on the artifact manifest version makes all three fall out automatically on promotion.',
      },
      {
        kind: 'curve',
        title: 'Hit rate and false-hit rate against the threshold',
        xLabel: 'cosine threshold τ',
        yLabel: 'rate',
        lines: [
          {
            points: [
              [0.8, 0.62],
              [0.85, 0.54],
              [0.9, 0.41],
              [0.93, 0.33],
              [0.95, 0.26],
              [0.97, 0.16],
              [0.99, 0.06],
            ],
          },
          {
            dashed: true,
            points: [
              [0.8, 0.19],
              [0.85, 0.12],
              [0.9, 0.055],
              [0.93, 0.03],
              [0.95, 0.014],
              [0.97, 0.004],
              [0.99, 0.001],
            ],
          },
        ],
        marks: [{ x: 0.95, y: 0.26, label: 'usual τ' }],
        xTicks: [
          { at: 0.8, label: '0.80' },
          { at: 0.9, label: '0.90' },
          { at: 0.99, label: '0.99' },
        ],
        yTicks: [
          { at: 0, label: '0' },
          { at: 0.3, label: '30%' },
          { at: 0.6, label: '60%' },
        ],
        caption:
          'Solid is hit rate, dashed is the share of hits that answer a materially different question. Illustrative shape, not measured values: the exact curves depend on your query mix and embedding model, which is the point. Both have to be measured on your own traffic before picking τ, and the false-hit curve is the one that decides it.',
      },
    ],
    tradeoffs: {
      gains: [
        'Large latency and cost reduction on skewed traffic',
        'Absorbs load spikes without touching the index',
        'The embedding cache is free correctness-wise',
      ],
      costs: [
        'A false hit answers the wrong question, confidently',
        'Invalidation has to be wired to the artifact manifest',
        'Cached answers can leak across users unless keyed on ACL scope',
      ],
    },
    distinctions: [
      {
        title: 'Semantic cache vs. retrieval cache',
        body: 'A retrieval cache stores which chunks a query returned, so the generation still runs and the answer is still grounded in fresh reasoning. A semantic answer cache stores the finished response and skips generation entirely. The first is conservative and mostly saves the index some work; the second is where the real latency win is, and where the real risk is. Many systems should run the retrieval cache aggressively and the answer cache narrowly.',
      },
    ],
    concepts: [
      {
        id: 'cache-acl',
        label: 'Caches leak across users',
        kind: 'pitfall',
        summary: 'The same question does not have the same answer',
        detail: [
          'Two users can ask an identical question and be entitled to different evidence. If the cache key is the query alone, the first user populates it and the second gets an answer built from documents they cannot read.',
          'The key has to include the permission scope, not the user id. Keying on the user destroys the hit rate, since nobody shares a cache entry. Keying on the resolved set of roles or tenant means everyone with the same entitlements shares one entry, which keeps the hit rate high and is safe by construction.',
        ],
      },
      {
        id: 'cache-invalidate',
        label: 'Invalidation',
        kind: 'method',
        summary: 'Version the key, do not sweep the cache',
        detail: [
          'Trying to work out which cache entries a document change invalidates is a losing game, because you would have to know which stored answers cited it.',
          'Put the artifact manifest version in the cache key instead. Promoting a new index or prompt changes the key prefix, so the entire old generation of entries becomes unreachable at once and ages out naturally. It costs one cold period after each promotion, which is a fair price for never serving a stale answer.',
        ],
      },
      {
        id: 'cache-prefix',
        label: 'Prompt and KV caching',
        kind: 'idea',
        summary: 'Order the prompt so the stable part comes first',
        detail: [
          'Provider-side prompt caching reuses the attention state of a shared prefix across requests. It only helps if the prefix is genuinely identical, which makes prompt ordering an operational decision rather than a purely stylistic one.',
          'Put the system prompt and any fixed instructions first, then the retrieved context, then the question. This conflicts slightly with the recency argument for placing the strongest chunk last, so the two have to be traded off deliberately rather than by accident.',
        ],
      },
      {
        id: 'cache-negative',
        label: 'Caching abstentions',
        kind: 'tradeoff',
        summary: 'Remember what the corpus cannot answer',
        detail: [
          'If the corpus genuinely does not cover a topic, every query about it runs the full pipeline to arrive at the same "not covered" response. Caching those is cheap and effective.',
          'It is also the entry most urgently invalidated by ingestion. The moment a document on that topic lands, the cached abstention becomes wrong, so negative entries want a much shorter time to live than positive ones.',
        ],
      },
    ],
    trace: {
      headline: 'Cache checked',
      payload: 'nearest stored query: "How does FAISS compare to HNSW?"\ncosine 0.913  <  τ 0.95   →   MISS',
      mono: true,
      note: 'Close, but below threshold. Falls through to the retriever; the answer will be written back on the way out.',
    },
  },

  {
    id: 'retrieval',
    icon: 'search',
    label: 'Retrieval',
    phase: 'online',
    kind: 'choice',
    ordinal: '6',
    tagline: 'Pull the top-K candidate chunks',
    code: [
      {
        title: 'LangChain',
        language: 'python',
        code: `# Dense: embed the query, ANN search, take the top K.
retriever = store.as_retriever(
    search_type="mmr",                     # optional diversity-aware selection
    search_kwargs={"k": 50, "fetch_k": 200},
)
docs = retriever.invoke("How is FAISS different from HNSW?")`,
        note: 'k here is the candidate pool a reranker will sort, not the number of chunks the model sees. Retrieve wide, rerank narrow.',
      },
    ],
    detail: [
      'Search the index and return the best K chunks. This is a recall stage, not a precision stage, its job is to make sure the right chunk is somewhere in the candidate set, and let reranking sort out the order.',
      'That framing determines how K is chosen. K here should be generous, because a chunk that is not retrieved can never be recovered by any downstream stage. Precision is someone else’s job.',
    ],
    stack: [
      { name: 'LangChain', what: 'Retriever abstractions for vector, BM25, and hybrid search', url: 'https://python.langchain.com/docs/how_to/#retrievers' },
      { name: 'LlamaIndex', what: 'Query engine with built-in retrieval and reranking', url: 'https://docs.llamaindex.ai/en/stable/module_guides/querying/' },
      { name: 'Elasticsearch', what: 'BM25 and hybrid vector+keyword search', url: 'https://www.elastic.co/elasticsearch' },
      { name: 'Vespa', what: 'Real-time serving engine with hybrid dense+sparse retrieval', url: 'https://vespa.ai/' },
    ],
    math: [
      {
        title: 'The funnel',
        tex: String.raw`\begin{aligned} N \xrightarrow{\ \text{ANN}\ } K &\xrightarrow{\ \text{dedup}\ } K' \\[4pt] &\xrightarrow{\ \text{rerank}\ } k \xrightarrow{\ \text{prompt}\ } k \end{aligned}`,
        worked: [
          { tex: String.raw`9{,}304 \rightarrow 50 \rightarrow 38 \rightarrow 5 \rightarrow 5`, caption: 'each stage is cheaper per item and more accurate than the last' },
        ],
        note: 'Recall is set at the first arrow and can only decrease afterwards. Precision is set at the third. Confusing which stage owns which is the most common tuning mistake in RAG.',
      },
    ],
    variants: [
      {
        id: 'dense',
        label: 'Dense',
        tagline: 'ANN search over embeddings',
        detail:
          'Embed the query, search the ANN index, take the nearest K by cosine similarity or inner product. Matches meaning rather than words; it will find "myocardial infarction" for "heart attack" with no synonym list at all.',
        example: { before: 'User Query', after: 'Embedding → ANN Search → Top-K Chunks', mono: true },
        math: [
          {
            title: 'Scoring',
            tex: String.raw`s_{\text{dense}}(q, d) = \frac{q \cdot d}{\lVert q \rVert \lVert d \rVert} \in [-1, 1]`,
          },
        ],
        tradeoffs: {
          gains: ['Semantic matching', 'Robust to paraphrase', 'No vocabulary engineering'],
          costs: ['Weak on rare exact tokens, codes, IDs, part numbers', 'Needs an embedding model in the hot path', 'Scores are not interpretable'],
        },
      },
      {
        id: 'sparse',
        label: 'Sparse (BM25)',
        tagline: 'Term statistics, no embeddings',
        detail:
          'Classical lexical scoring built from term frequency, inverse document frequency, and document length normalisation. Each of the three corrects a specific failure of naive term counting: raw counts reward repetition without limit, common words dominate by sheer frequency, and long documents win simply by containing more words. BM25 is nearly fifty years old and still competitive, on exact-match retrieval it beats most embedding models outright.',
        figures: [
          {
            kind: 'curve',
            title: 'Term frequency saturates',
            xLabel: 'occurrences of the term in the document',
            yLabel: 'score',
            lines: [
              {
                points: [
                  [0, 0],
                  [1, 1.0],
                  [2, 1.43],
                  [3, 1.67],
                  [5, 1.92],
                  [10, 2.17],
                  [20, 2.33],
                  [30, 2.38],
                  [50, 2.43],
                ],
              },
              {
                dashed: true,
                points: [
                  [0, 0],
                  [50, 2.5],
                ],
              },
            ],
            marks: [
              { x: 1, y: 1.0, label: '1st' },
              { x: 50, y: 2.43, label: '50th' },
            ],
            xTicks: [
              { at: 0, label: '0' },
              { at: 10, label: '10' },
              { at: 25, label: '25' },
              { at: 50, label: '50' },
            ],
            yTicks: [
              { at: 0, label: '0' },
              { at: 1.25, label: '' },
              { at: 2.5, label: 'k₁+1' },
            ],
            caption:
              'With k₁ = 1.5, the first occurrence of a term earns 1.00 and the fiftieth brings the total only to 2.43, fifty times the count for 2.4× the score. The dashed line is what a raw count would do. Saturation is why keyword stuffing does not work: the curve flattens toward an asymptote of k₁+1, so repetition buys almost nothing after the first few mentions.',
          },
          {
            kind: 'curve',
            title: 'IDF collapses for common terms',
            xLabel: 'documents containing the term (of 10⁶)',
            yLabel: 'IDF',
            lines: [
              {
                points: [
                  [1, 11.46],
                  [2, 9.21],
                  [3, 6.91],
                  [4, 4.61],
                  [5, 2.3],
                  [5.7, 0.69],
                  [6, 0.0],
                ],
              },
            ],
            marks: [
              { x: 1, y: 11.46, label: 'rare' },
              { x: 5.7, y: 0.69, label: 'common' },
            ],
            xTicks: [
              { at: 1, label: '10' },
              { at: 2, label: '10²' },
              { at: 3, label: '10³' },
              { at: 4, label: '10⁴' },
              { at: 5, label: '10⁵' },
              { at: 6, label: '10⁶' },
            ],
            yTicks: [
              { at: 0, label: '0' },
              { at: 6, label: '6' },
              { at: 12, label: '12' },
            ],
            caption:
              'A term in 10 of a million documents scores 11.5; one in half of them scores 0.7, a 16× difference. This is exactly the behaviour dense retrieval lacks. In a pooled embedding a rare token is averaged in with everything else and all but disappears, which is why a part number or error code is often findable by BM25 and invisible to a vector search.',
          },
        ],
        math: [
          {
            title: 'BM25',
            tex: String.raw`\text{score}(q, D) = \sum_{t \in q} \text{IDF}(t) \cdot \frac{f(t, D)\,(k_1 + 1)}{f(t, D) + k_1\left(1 - b + b \cdot \frac{|D|}{\text{avgdl}}\right)}`,
            where: [
              { sym: String.raw`f(t, D)`, means: 'how many times term t occurs in document D' },
              { sym: String.raw`|D|`, means: 'length of D in tokens' },
              { sym: String.raw`\text{avgdl}`, means: 'mean document length across the corpus' },
              { sym: String.raw`k_1`, means: 'term-frequency saturation, typically 1.2–2.0' },
              { sym: String.raw`b`, means: 'length-normalisation strength, typically 0.75' },
            ],
            note: 'The k₁ term saturates: the tenth occurrence of a word adds far less than the second. The b term stops long documents scoring highly through sheer length.',
          },
          {
            title: 'Inverse document frequency',
            tex: String.raw`\text{IDF}(t) = \ln\!\left(\frac{N - n(t) + 0.5}{n(t) + 0.5} + 1\right)`,
            where: [
              { sym: String.raw`N`, means: 'documents in the corpus' },
              { sym: String.raw`n(t)`, means: 'documents containing t' },
            ],
            worked: [
              { tex: String.raw`N = 10^6,\ n(t) = 10 \Rightarrow \text{IDF} = \ln(95238.6) \approx 11.46`, caption: 'a rare term, enormous weight' },
              { tex: String.raw`N = 10^6,\ n(t) = 5 \times 10^5 \Rightarrow \text{IDF} = \ln(2.0) \approx 0.69`, caption: 'a common term, nearly ignored' },
            ],
            note: 'This is precisely the behaviour dense retrieval lacks. A term appearing in 10 of a million documents dominates the BM25 score, while in a pooled embedding it is averaged into near-invisibility.',
          },
          {
            title: 'Saturation, illustrated',
            tex: String.raw`\frac{f(k_1+1)}{f + k_1}\Big|_{b=0,\,k_1=1.5}`,
            worked: [
              { tex: String.raw`f = 1 \Rightarrow \frac{1 \times 2.5}{1 + 1.5} = 1.00` },
              { tex: String.raw`f = 5 \Rightarrow \frac{5 \times 2.5}{5 + 1.5} = 1.92` },
              { tex: String.raw`f = 50 \Rightarrow \frac{50 \times 2.5}{50 + 1.5} = 2.43`, caption: '10× the occurrences, 1.27× the score' },
            ],
          },
        ],
        tradeoffs: {
          gains: ['Exact keyword matching', 'No embedding model, no GPU', 'Interpretable, debuggable scores', 'Excellent on rare terms'],
          costs: ['Zero semantic understanding', 'Misses every paraphrase', 'Needs tokenisation and stemming decisions per language'],
        },
      },
      {
        id: 'hybrid',
        label: 'Hybrid',
        tagline: 'Run both, fuse the rankings',
        detail:
          'Run dense and sparse retrieval side by side and combine the results. They fail in different directions, dense misses exact tokens, sparse misses paraphrases, so the union covers substantially more than either alone. Fusion is then handled by RRF.',
        math: [
          {
            title: 'Complementary failure',
            tex: String.raw`R_{\text{hybrid}} \approx 1 - (1 - R_{\text{dense}})(1 - R_{\text{sparse}})`,
            worked: [
              { tex: String.raw`1 - (1 - 0.72)(1 - 0.65) = 1 - 0.098 = 0.902`, caption: 'if the two were fully independent' },
            ],
            note: 'They are not independent, both find the easy documents, so the real gain is smaller. But the errors genuinely are complementary, which is why hybrid beats both in nearly every published benchmark.',
          },
        ],
        tradeoffs: {
          gains: ['Covers both failure modes', 'Reliably the strongest default', 'Degrades gracefully if one side fails'],
          costs: ['Two retrieval systems to run and keep in sync', 'Requires a fusion step', 'Roughly doubles retrieval latency unless parallelised'],
        },
      },
    ],
    concepts: [
      {
        id: 'ret-k',
        label: 'Choosing K',
        kind: 'tradeoff',
        summary: 'Retrieve wide, rerank narrow',
        detail: [
          'K at this stage is not the number of chunks the model sees. It is the size of the candidate pool a reranker will sort. Setting it to 5 because the prompt holds 5 chunks throws away the reranker’s entire reason for existing.',
          'Typical shape: K = 50–100 from retrieval, reranked down to 3–8 for the prompt. The ANN search cost grows sub-linearly in K, so widening the funnel is cheap; the expensive stage is reranking, and that is governed by a separate parameter.',
        ],
      },
      {
        id: 'ret-failure',
        label: 'Retrieval failure is terminal',
        kind: 'pitfall',
        summary: 'Nothing downstream can recover a missed chunk',
        detail: [
          'Reranking reorders what it is given. Prompt construction formats what it is given. Generation answers from what it is given. If the supporting chunk is not in the top-K, every subsequent stage is operating on incomplete evidence and cannot know it.',
          'This asymmetry is why recall@K at the retrieval stage is the single most diagnostic metric in the pipeline, and why it must be measured separately from end-to-end answer quality.',
        ],
      },
      {
        id: 'ret-weighted',
        label: 'Weighted score fusion',
        kind: 'formula',
        summary: 'The alternative to RRF, and why it is harder',
        math: [
          {
            title: 'Convex combination of normalised scores',
            tex: String.raw`s = \alpha \cdot \tilde{s}_{\text{dense}} + (1 - \alpha) \cdot \tilde{s}_{\text{sparse}}`,
            where: [{ sym: String.raw`\tilde{s}`, means: 'scores min-max normalised within this query’s result set' }],
            note: 'Workable, and slightly better than RRF when tuned. But α is corpus- and query-dependent, and the normalisation is computed per query over a truncated list, so a document’s normalised score depends on which other documents happened to be retrieved. RRF avoids all of this by discarding scores entirely.',
          },
        ],
      },
    ],
    trace: {
      headline: 'Candidates retrieved',
      payload: 'Dense:   A  B  C\nSparse:  B  D  A',
      mono: true,
      note: 'Two ranked lists, disagreeing, exactly what RRF exists to reconcile.',
    },
  },

  {
    id: 'rrf',
    icon: 'merge',
    label: 'Reciprocal Rank Fusion',
    phase: 'online',
    kind: 'sequential',
    ordinal: '6',
    tagline: 'Merge ranked lists, not scores',
    code: [
      {
        title: 'LangChain',
        language: 'python',
        code: `from langchain.retrievers import EnsembleRetriever
from langchain_community.retrievers import BM25Retriever

sparse = BM25Retriever.from_documents(chunks); sparse.k = 50
dense  = store.as_retriever(search_kwargs={"k": 50})

# EnsembleRetriever fuses the two ranked lists with Reciprocal Rank Fusion.
hybrid = EnsembleRetriever(retrievers=[dense, sparse], weights=[0.5, 0.5])`,
        note: 'This is hybrid retrieval and RRF in one object. Fusion is rank-based, so the dense and sparse scores never need to share a scale.',
      },
    ],
    detail: [
      'RRF combines rankings, not similarity scores, and that is the entire point. A cosine similarity of 0.82 and a BM25 score of 14.3 are not on the same scale and cannot be meaningfully averaged. Ranks are comparable; raw scores are not.',
      'Each document scores the sum of 1/(k + rank) across the lists it appears in. Appearing high in both lists beats appearing first in only one.',
      'The constant k is doing quiet but essential work. Without it the formula would be 1/rank, and rank 1 would score double rank 2, meaning whichever retriever happened to put something first would effectively decide the fused order on its own. Setting k = 60 flattens the curve near the top so that being consistently good across retrievers outweighs being first in one.',
    ],
    figures: [
      {
        kind: 'curve',
        title: 'What k does to the rank weighting',
        xLabel: 'rank',
        yLabel: 'weight',
        lines: [
          {
            points: [
              [1, 1],
              [2, 0.9839],
              [3, 0.9683],
              [4, 0.9531],
              [5, 0.9385],
              [6, 0.9242],
              [7, 0.9104],
              [8, 0.8971],
              [9, 0.8841],
              [10, 0.8714],
            ],
          },
          {
            dashed: true,
            points: [
              [1, 1],
              [2, 0.5],
              [3, 0.3333],
              [4, 0.25],
              [5, 0.2],
              [6, 0.1667],
              [7, 0.1429],
              [8, 0.125],
              [9, 0.1111],
              [10, 0.1],
            ],
          },
        ],
        marks: [{ x: 10, y: 0.8714, label: 'k = 60' }],
        xTicks: [
          { at: 1, label: '1' },
          { at: 5, label: '5' },
          { at: 10, label: '10' },
        ],
        yTicks: [
          { at: 0, label: '0' },
          { at: 0.5, label: '½' },
          { at: 1, label: '1' },
        ],
        caption:
          'Both curves normalised to their rank-1 value. The dashed line is k = 0, a cliff, where rank 2 is worth half of rank 1 and a single list dictates the outcome. With k = 60 the top ten ranks span only 1.00 to 0.87, so position still matters but gently, and agreement between retrievers becomes the dominant signal.',
      },
    ],
    math: [
      {
        title: 'Reciprocal Rank Fusion',
        tex: String.raw`\text{RRF}(d) = \sum_{r \in R} \frac{1}{k + \text{rank}_r(d)}`,
        where: [
          { sym: String.raw`R`, means: 'the set of ranked lists being fused' },
          { sym: String.raw`\text{rank}_r(d)`, means: 'position of d in list r, 1-indexed (∞ if absent)' },
          { sym: String.raw`k`, means: 'a damping constant, conventionally 60' },
        ],
        note: 'k flattens the curve near the top. Without it, rank 1 would score twice rank 2, letting a single list dictate the fused order.',
      },
      {
        title: 'Worked, the two lists from retrieval',
        tex: String.raw`\text{Dense: } A, B, C \qquad \text{Sparse: } B, D, A \qquad k = 60`,
        worked: [
          { tex: String.raw`\text{RRF}(B) = \tfrac{1}{60+2} + \tfrac{1}{60+1} = 0.01613 + 0.01639 = 0.03252` },
          { tex: String.raw`\text{RRF}(A) = \tfrac{1}{60+1} + \tfrac{1}{60+3} = 0.01639 + 0.01587 = 0.03226` },
          { tex: String.raw`\text{RRF}(D) = \tfrac{1}{60+2} = 0.01613` },
          { tex: String.raw`\text{RRF}(C) = \tfrac{1}{60+3} = 0.01587` },
          { tex: String.raw`\Rightarrow B \succ A \succ D \succ C`, caption: 'B wins despite never topping the dense list' },
        ],
        note: 'A was rank 1 in dense but only rank 3 in sparse. B was rank 2 and rank 1. Consistency across both lists beats a single first place, which is exactly the behaviour you want from a fusion rule.',
      },
      {
        title: 'Effect of k',
        tex: String.raw`k \to 0 \implies \text{rank 1 dominates}; \quad k \to \infty \implies \text{all ranks equal}`,
        worked: [
          { tex: String.raw`k = 0: \tfrac{1}{1} = 1.0 \text{ vs } \tfrac{1}{2} = 0.5`, caption: 'a 2× gap between ranks 1 and 2' },
          { tex: String.raw`k = 60: \tfrac{1}{61} = 0.01639 \text{ vs } \tfrac{1}{62} = 0.01613`, caption: 'a 1.6% gap, position matters, but gently' },
        ],
      },
    ],
    example: {
      beforeLabel: 'Input rankings',
      before: 'Dense:   A  B  C\nSparse:  B  D  A',
      afterLabel: 'Fused (k = 60)',
      after: 'B  0.03252   (ranks 2, 1)\nA  0.03226   (ranks 1, 3)\nD  0.01613   (rank 2 only)\nC  0.01587   (rank 3 only)',
      mono: true,
    },
    distinctions: [
      {
        title: 'Why not just average the scores?',
        body: 'Because the scores live in different, unnormalised spaces. Cosine is bounded in [−1,1]; BM25 is unbounded and corpus-dependent. Min-max normalising them makes a document’s score depend on which other documents happened to be retrieved alongside it. Rank position is the only signal both retrievers express comparably, which is why B, appearing near the top of both lists, edges out A, which topped one list and came third in the other.',
      },
    ],
    concepts: [
      {
        id: 'rrf-props',
        label: 'Why it works so well',
        kind: 'idea',
        summary: 'Scale-free, tuning-free, robust',
        detail: [
          'RRF needs no normalisation, no per-corpus weight, and no knowledge of what the underlying scores mean. It fuses BM25 with cosine, or three dense retrievers using different models, with the same code.',
          'It is also robust to a broken retriever. If one branch returns garbage, its documents simply appear in one list rather than two and score correspondingly low, whereas weighted score fusion would happily average in the garbage at full weight.',
        ],
      },
      {
        id: 'rrf-limits',
        label: 'What it gives up',
        kind: 'tradeoff',
        summary: 'Discarding scores discards confidence',
        detail: [
          'Rank 1 with cosine 0.95 and rank 1 with cosine 0.31 are identical to RRF. When a retriever is genuinely certain, that information is thrown away.',
          'It also cannot express that one retriever is better than another for this query. A tuned weighted fusion beats RRF when you have per-query relevance labels to tune on, which most systems do not, which is why RRF is the default.',
        ],
      },
      {
        id: 'rrf-general',
        label: 'Beyond two lists',
        kind: 'method',
        summary: 'Any number of rankers, same formula',
        detail: [
          'The sum runs over any number of lists, so RRF also merges multi-query branches, several embedding models, or per-field indexes, title, body, and summary each ranked separately.',
          'A document absent from a list contributes zero rather than a penalty, so adding a weak ranker cannot actively hurt a document that other rankers liked. This monotonicity is what makes it safe to keep adding signals.',
        ],
      },
    ],
    trace: { headline: 'Rankings fused', payload: 'B  0.03252\nA  0.03226\nD  0.01613\nC  0.01587', mono: true, note: 'B wins on consistency across both lists, not on any single score.' },
  },

  {
    id: 'merge',
    icon: 'merge',
    label: 'Merge Branches',
    phase: 'online',
    kind: 'sequential',
    tagline: 'Pool the parallel result sets',
    detail: [
      'Present only because a fan-out stage is active. Each branch retrieved independently; their result sets are pooled here, before reranking sees them.',
      'Pooling must happen before reranking, not after. Rerank scores computed within separate branches are not comparable across branches, because each was produced over a different candidate pool.',
    ],
    math: [
      {
        title: 'Pool size before deduplication',
        tex: String.raw`|P| = \sum_{i=1}^{q} K_i - |\text{overlap}|`,
        worked: [
          { tex: String.raw`4 \times 10 = 40\ \text{retrieved}, \quad 31\ \text{distinct}`, caption: 'branches overlap heavily by construction' },
        ],
        note: 'High overlap is not a bug; it is evidence the variants were on topic. It does mean the next stage has real work to do.',
      },
    ],
    trace: { headline: 'Branches pooled', payload: '4 result sets → 40 hits → 31 distinct chunks', note: 'Merged before reranking, never after.' },
  },

  {
    id: 'dedup',
    icon: 'layers',
    label: 'Deduplication',
    phase: 'online',
    kind: 'optional',
    ordinal: '6c',
    tagline: 'Remove redundancy before it eats the context budget',
    detail: [
      'Retrieved sets are redundant in ways that are structural rather than accidental. Overlapping chunks share text by construction. Fan-out branches retrieve the same chunks. Corpora contain the same passage in several documents, a policy quoted in four places, a boilerplate paragraph repeated across every contract.',
      'The cost is twofold. Duplicates occupy top-K slots that could hold new evidence, and they make a claim look corroborated when it has a single source. An LLM given the same fact three times treats it as three independent confirmations.',
      'There are four levels, in ascending order of cost and power: exact, near-duplicate by hashing, semantic by embedding, and diversity-aware selection via MMR.',
    ],
    math: [
      {
        title: 'Effective evidence after deduplication',
        tex: String.raw`K_{\text{eff}} = |\{\,d \in \text{top-}K : \nexists\, d' \prec d \text{ with } \text{sim}(d, d') > \tau \,\}|`,
        worked: [
          { tex: String.raw`K = 10,\ K_{\text{eff}} = 4`, caption: 'six slots were restating the same two passages' },
        ],
        note: 'K_eff, not K, is how much distinct evidence the model actually receives, and it is the number worth monitoring.',
      },
    ],
    concepts: [
      {
        id: 'dedup-exact',
        label: '1 · Exact duplicates',
        kind: 'method',
        summary: 'Hash the normalised text',
        detail: [
          'Normalise whitespace, case and punctuation, then hash. Anything colliding is byte-identical and can be collapsed immediately, keeping the highest-ranked copy and recording the rest as additional sources for citation.',
          'Effectively free, one hash per candidate, and it catches the genuinely common case of the same chunk indexed twice through two ingestion paths.',
        ],
        math: [
          {
            title: 'Cost',
            tex: String.raw`O(K)`,
            note: 'A single pass with a hash set. There is no reason not to do this unconditionally.',
          },
        ],
      },
      {
        id: 'dedup-near',
        label: '2 · Near-duplicates',
        kind: 'method',
        summary: 'MinHash and SimHash over shingles',
        detail: [
          'Overlapping chunks share 10–20% of their text; document revisions differ in a sentence. Exact hashing misses both. Shingle the text into overlapping k-grams and compare the sets by Jaccard similarity.',
          'Comparing every pair is O(K²), which is fine for K = 50 and impossible for a corpus. MinHash makes it near-linear by turning set similarity into a hash-collision probability.',
        ],
        figures: [
          {
            kind: 'curve',
            title: 'LSH banding approximates a threshold',
            xLabel: 'Jaccard similarity of the pair',
            yLabel: 'P(compared)',
            lines: [
              {
                points: [
                  [0, 0],
                  [0.1, 0.0002],
                  [0.2, 0.0064],
                  [0.3, 0.0475],
                  [0.4, 0.1861],
                  [0.5, 0.47],
                  [0.6, 0.8019],
                  [0.7, 0.9748],
                  [0.8, 0.9996],
                  [0.9, 1.0],
                  [1.0, 1.0],
                ],
              },
            ],
            marks: [
              { x: 0.3, y: 0.0475, label: '0.05' },
              { x: 0.8, y: 0.9996, label: '1.00' },
            ],
            xTicks: [
              { at: 0, label: '0' },
              { at: 0.5, label: '0.5' },
              { at: 1, label: '1' },
            ],
            yTicks: [
              { at: 0, label: '0' },
              { at: 0.5, label: '0.5' },
              { at: 1, label: '1' },
            ],
            caption:
              'With r = 5 rows per band and b = 20 bands. The S-curve is the whole trick: pairs above ~0.7 similarity are near-certain to be checked, pairs below ~0.3 are near-certain to be skipped, and the transition between them is sharp. You get the behaviour of a similarity threshold without ever computing similarity for the quadratic number of pairs. Moving r and b slides the knee left or right.',
          },
        ],
        math: [
          {
            title: 'Jaccard similarity',
            tex: String.raw`J(A, B) = \frac{|A \cap B|}{|A \cup B|}`,
            worked: [
              { tex: String.raw`J = \frac{188}{212} \approx 0.887`, caption: 'two chunks overlapping by 50 tokens, collapse them' },
            ],
          },
          {
            title: 'The MinHash property',
            tex: String.raw`\Pr\!\left[\,h_{\min}(A) = h_{\min}(B)\,\right] = J(A, B)`,
            note: 'The probability that two sets share a minimum hash value is exactly their Jaccard similarity. So a signature of m independent hashes estimates J to within roughly 1/√m, in constant space per document.',
          },
          {
            title: 'LSH banding, the S-curve',
            tex: String.raw`\Pr[\text{candidate pair}] = 1 - \left(1 - J^{r}\right)^{b}`,
            where: [
              { sym: String.raw`r`, means: 'rows per band' },
              { sym: String.raw`b`, means: 'number of bands (signature length = r × b)' },
            ],
            worked: [
              { tex: String.raw`J = 0.8,\ r = 5,\ b = 20 \Rightarrow 1 - (1 - 0.328)^{20} = 0.9996`, caption: 'near-certain to be caught' },
              { tex: String.raw`J = 0.3,\ r = 5,\ b = 20 \Rightarrow 1 - (1 - 0.0024)^{20} = 0.047`, caption: 'almost never a false pair' },
            ],
            note: 'The sharp transition between those two rows is the point of LSH: it approximates a threshold function, so you tune r and b to place the cutoff where you want it.',
          },
        ],
        children: [
          {
            id: 'dedup-simhash',
            label: 'SimHash',
            kind: 'formula',
            summary: 'One fingerprint, Hamming distance',
            math: [
              {
                title: 'Similarity by bit distance',
                tex: String.raw`\text{sim}(A,B) = 1 - \frac{d_H(\text{sh}(A), \text{sh}(B))}{64}`,
                note: 'Project weighted term hashes onto 64 bits and take the sign of each. Near-duplicates differ in only a few bits, a distance of ≤3 on a 64-bit fingerprint is the classic web-scale threshold. Cheaper than MinHash, slightly less accurate.',
              },
            ],
          },
        ],
      },
      {
        id: 'dedup-semantic',
        label: '3 · Semantic duplicates',
        kind: 'method',
        summary: 'Same meaning, no shared words',
        detail: [
          'Two chunks can state the same fact with almost no lexical overlap, a specification and its plain-English summary, the same policy in two house styles. Shingle-based methods see nothing; embeddings see near-identity.',
          'You already have the vectors, so this is a K×K cosine matrix. At K = 50 that is 2,500 dot products, which is nothing.',
        ],
        math: [
          {
            title: 'Greedy semantic collapse',
            tex: String.raw`\text{drop } d_j \text{ if } \exists\, i < j : \cos(e_i, e_j) > \tau`,
            where: [{ sym: String.raw`\tau`, means: 'threshold, typically 0.92–0.97' }],
            note: 'Walk the ranked list top-down and drop anything too close to something already kept. Set τ carefully: too low and you delete genuinely distinct evidence that merely shares a topic.',
          },
          {
            title: 'Cost',
            tex: String.raw`O(K^2 \cdot n)`,
            worked: [{ tex: String.raw`50^2 \times 1536 = 3.8 \times 10^6\ \text{ops} \approx 1\ \text{ms}` }],
          },
        ],
      },
      {
        id: 'dedup-mmr',
        label: '4 · MMR, diversity-aware selection',
        kind: 'formula',
        summary: 'Optimise relevance and novelty jointly',
        detail: [
          'The other three methods remove duplicates after the fact. Maximal Marginal Relevance changes the selection rule itself: build the result set greedily, at each step picking the candidate that maximises relevance to the query *minus* its similarity to everything already chosen.',
          'This handles the case thresholding cannot, five chunks that are each only 0.85 similar to one another, individually below any dedup threshold, but which collectively say one thing and crowd out every other angle.',
        ],
        math: [
          {
            title: 'Maximal Marginal Relevance',
            tex: String.raw`\text{MMR} = \operatorname*{arg\,max}_{d_i \in R \setminus S} \left[\, \lambda \cdot \text{sim}(q, d_i) - (1 - \lambda) \max_{d_j \in S} \text{sim}(d_i, d_j) \,\right]`,
            where: [
              { sym: String.raw`R`, means: 'the retrieved candidate pool' },
              { sym: String.raw`S`, means: 'documents already selected' },
              { sym: String.raw`\lambda`, means: 'relevance/diversity balance, in [0, 1]' },
            ],
            note: 'λ = 1 is pure relevance, identical to plain top-K. λ = 0 is pure diversity, which returns unrelated documents. Useful values sit at 0.5–0.8.',
          },
          {
            title: 'Worked, one selection step',
            tex: String.raw`\lambda = 0.7,\quad S = \{d_1\}`,
            worked: [
              { tex: String.raw`d_2:\ 0.7(0.88) - 0.3(0.95) = 0.616 - 0.285 = 0.331`, caption: 'highly relevant, but nearly a copy of d₁' },
              { tex: String.raw`d_3:\ 0.7(0.81) - 0.3(0.42) = 0.567 - 0.126 = 0.441`, caption: 'slightly less relevant, far more novel, selected' },
            ],
            note: 'Plain top-K would have taken d₂ on its 0.88 score and returned two chunks saying the same thing.',
          },
        ],
      },
      {
        id: 'dedup-risk',
        label: 'When dedup hurts',
        kind: 'pitfall',
        summary: 'Repetition is sometimes the signal',
        detail: [
          'If the question is "how many sources say X" or "is this the consensus", collapsing duplicates destroys exactly the evidence needed. Aggregation questions want the count, not the distinct set.',
          'Independent corroboration is also real: three separate studies reaching the same conclusion are not redundant. Deduplicate on text similarity, but preserve and surface the source count so the model can distinguish one fact repeated from three sources agreeing.',
        ],
      },
    ],
    tradeoffs: {
      gains: ['Frees top-K slots for genuinely new evidence', 'Stops false corroboration from repetition', 'Cuts prompt tokens and cost'],
      costs: ['Thresholds are corpus-specific', 'Can delete real corroborating evidence', 'MMR adds an O(K²) pass'],
    },
    trace: {
      headline: 'Redundancy removed',
      payload: '31 chunks → 3 exact → 6 near-dupes → 2 semantic\n                       = 20 distinct chunks',
      mono: true,
      note: 'Eleven of thirty-one candidates were restating passages already present.',
    },
  },

  {
    id: 'rerank',
    icon: 'sort',
    label: 'Cross-Encoder Re-ranking',
    phase: 'online',
    kind: 'optional',
    ordinal: '7',
    tagline: 'Score (query, document) jointly',
    code: [
      {
        title: 'LangChain',
        language: 'python',
        code: `from langchain.retrievers import ContextualCompressionRetriever
from langchain.retrievers.document_compressors import CrossEncoderReranker
from langchain_community.cross_encoders import HuggingFaceCrossEncoder

reranker = CrossEncoderReranker(
    model=HuggingFaceCrossEncoder(model_name="BAAI/bge-reranker-base"),
    top_n=5)   # reruns the top candidates, keeps the best 5
retriever = ContextualCompressionRetriever(
    base_compressor=reranker, base_retriever=hybrid)`,
        note: 'Cohere Rerank and Jina Reranker are hosted alternatives; the wiring is identical, only the model swaps.',
      },
    ],
    detail: [
      'Retrieval used a bi-encoder: query and document were embedded separately, and never met. That is what makes it fast, the document vectors were computed offline, but the model never got to read them together.',
      'A cross-encoder takes the pair as a single input and lets attention run across both, producing a far better relevance score. The price is that nothing can be precomputed: every (query, document) pair is a fresh forward pass.',
      'So it runs only over the top candidates from retrieval. Retrieve broadly and cheaply, then rerank narrowly and expensively.',
    ],
    stack: [
      { name: 'Cohere Rerank', what: 'Managed cross-encoder reranking API', url: 'https://cohere.com/rerank' },
      { name: 'Jina Reranker', what: 'Lightweight, fast cross-encoder models', url: 'https://jina.ai/reranker/' },
      { name: 'BAAI/bge-reranker', what: 'Open-source cross-encoder rerankers', url: 'https://huggingface.co/BAAI/bge-reranker-v2-m3' },
      { name: 'FlashRank', what: 'Ultra-lightweight reranking library', url: 'https://github.com/PrithivirajDamodaran/FlashRank' },
      { name: 'Voyage Rerank', what: 'Reranking API by Voyage AI', url: 'https://www.voyageai.com/' },
    ],
    figures: [
      {
        kind: 'blocks',
        title: 'Bi-encoder, the two sides never meet',
        rows: [
          { boxes: [{ text: 'query' }, { text: 'document' }], arrow: '' },
          {
            boxes: [{ text: 'encoder' }, { text: 'encoder · offline', dashed: true }],
            arrow: 'cosine',
          },
          { boxes: [{ text: 'similarity score', filled: true }] },
        ],
        caption:
          'Each side is encoded on its own, so the document vector never depends on the query, which is exactly why it can be computed once at ingestion and indexed. The model compares two summaries that were written without knowledge of each other.',
      },
      {
        kind: 'blocks',
        title: 'Cross-encoder, one sequence, joint attention',
        rows: [
          { boxes: [{ text: '[ query ; SEP ; document ]' }], arrow: '' },
          { boxes: [{ text: 'encoder, attention spans both' }], arrow: 'regression head' },
          { boxes: [{ text: 'relevance score', filled: true }] },
        ],
        caption:
          'The pair enters as a single sequence, so every query token can attend to every document token. That is where the accuracy comes from, and why nothing can be cached: change the query and the whole forward pass must be redone. Hence K forward passes per request, and hence top-K only.',
      },
    ],
    math: [
      {
        title: 'The two architectures',
        tex: String.raw`\begin{aligned} \text{bi-encoder:}\quad s &= \cos\big(f(q),\ f(d)\big) \\[6pt] \text{cross-encoder:}\quad s &= g\big([\,q\,;\,\text{SEP}\,;\,d\,]\big) \end{aligned}`,
        note: 'In the bi-encoder, f(d) is independent of q and computed once at ingestion. In the cross-encoder, g sees both sequences at once, so every token of the query can attend to every token of the document, and nothing can be cached.',
      },
      {
        title: 'Why one is cacheable and the other is not',
        tex: String.raw`\text{bi: } N \text{ offline} + 1 \text{ online} \quad \text{vs} \quad \text{cross: } K \text{ online passes}`,
        worked: [
          { tex: String.raw`\text{bi: } 9{,}304 \text{ offline} + 1 \text{ online}`, caption: 'only one forward pass blocks the user' },
          { tex: String.raw`\text{cross: } 50 \text{ online}`, caption: '50 forward passes per query, every query' },
        ],
      },
      {
        title: 'Latency budget',
        tex: String.raw`L_{\text{rerank}} = \left\lceil \frac{K}{B} \right\rceil \times t_{\text{batch}}`,
        where: [
          { sym: String.raw`K`, means: 'candidates reranked' },
          { sym: String.raw`B`, means: 'batch size' },
          { sym: String.raw`t_{\text{batch}}`, means: 'time per batch' },
        ],
        worked: [
          { tex: String.raw`\left\lceil \tfrac{50}{16} \right\rceil \times 25 = 4 \times 25 = 100\ \text{ms}`, caption: 'a small cross-encoder on GPU' },
          { tex: String.raw`\left\lceil \tfrac{200}{16} \right\rceil \times 25 = 13 \times 25 = 325\ \text{ms}`, caption: 'reranking 200, usually not worth it' },
        ],
        note: 'Latency is linear in K while the quality gain is strongly diminishing, so K = 50–100 is the usual sweet spot.',
      },
    ],
    example: {
      beforeLabel: 'Bi-encoder (retrieval)',
      before: 'embed(Query)  ·  embed(Document)   → cosine',
      afterLabel: 'Cross-encoder (reranking)',
      after: 'model(Query [SEP] Document)        → relevance score',
      mono: true,
    },
    tradeoffs: { gains: ['Much more accurate ordering', 'Catches near-misses retrieval mis-ranked', 'Often worth more than a better embedding model'], costs: ['Cannot be precomputed', 'Latency scales linearly with K', 'Top-K only, cannot rescue a missed chunk'] },
    distinctions: [
      {
        title: 'Bi-encoder vs. Cross-encoder',
        body: 'Bi-encoder embeds each side independently, so document vectors can be precomputed and indexed, fast, less accurate, and it scales to billions. Cross-encoder processes the pair jointly, so nothing can be cached, slow, more accurate, and it scales to about a hundred. This is the whole reason the pipeline has two ranking stages instead of one.',
      },
    ],
    concepts: [
      {
        id: 'rr-late',
        label: 'Late interaction and ColBERT',
        kind: 'method',
        summary: 'Per-token vectors, cheap interaction at query time',
        detail: [
          'The two architectures above sit at opposite extremes of when the query and the document are allowed to meet. **Late interaction takes the middle position:**',
          '- **Encode the document** once into one vector per token and store all of them.',
          '- **Encode the query** into per-token vectors at query time.',
          '- **Score** with an operator cheap enough to run at retrieval scale.',
          '**ColBERT** is the model that made this practical, using **MaxSim** as its scoring operator. Every query token finds its single best match anywhere in the document, and those maxima are summed. The effect is a soft, order-free term-matching signal.',
          '**The tradeoffs are clear:**',
          '- **Quality:** It recovers much of what a pooled single vector throws away, without the query needing to use the same words.',
          '- **Storage:** One vector per token is a two-orders-of-magnitude multiplier. This kept late interaction niche for years until ColBERTv2.',
          'Worth knowing that this is **not only a reranker**. Because MaxSim can be driven by an ANN index over the token vectors, late interaction can serve as the first-stage retriever itself.',
        ],
        math: [
          {
            title: 'MaxSim',
            tex: String.raw`s(q, d) = \sum_{i \in q} \max_{j \in d} \big( e_{q_i} \cdot e_{d_j} \big)`,
            where: [
              { sym: String.raw`e_{q_i}`, means: 'embedding of the i-th query token' },
              { sym: String.raw`e_{d_j}`, means: 'embedding of the j-th document token' },
            ],
            note: 'The max is over document tokens, so position is irrelevant and a single strongly matching span is enough. The outer sum is over query tokens, so every part of the query has to find support somewhere; a passage matching half the query scores about half as well.',
          },
          {
            title: 'Scoring cost per pair',
            tex: String.raw`O\big(|q| \cdot |d| \cdot n\big)`,
            worked: [
              { tex: String.raw`32 \times 300 \times 128 = 1.2 \times 10^{6}\ \text{multiply-adds}` },
              { tex: String.raw`\text{vs a cross-encoder forward pass} \approx 10^{9}`, caption: 'roughly three orders of magnitude cheaper' },
            ],
            note: 'Cheap because it is dot products over precomputed vectors rather than a transformer forward pass. That is the entire reason it can run at retrieval scale.',
          },
          {
            title: 'Storage, the real constraint',
            tex: String.raw`S = N_{\text{chunks}} \times \overline{|d|} \times n \times b`,
            worked: [
              { tex: String.raw`10^6 \times 300 \times 128 \times 4 = 154\ \text{GB}`, caption: 'ColBERT, 128-d token vectors' },
              { tex: String.raw`10^6 \times 1 \times 1536 \times 4 = 6.1\ \text{GB}`, caption: 'a single-vector bi-encoder, same corpus' },
            ],
            note: 'Twenty-five times the storage for the same million chunks, and that is already using narrow 128-dimensional token vectors rather than full-width ones.',
          },
        ],
        figures: [
          {
            kind: 'blocks',
            title: 'When the query and document meet',
            rows: [
              { label: 'bi-encoder', boxes: [{ text: 'doc → 1 vector, offline' }, { text: 'query → 1 vector' }], arrow: 'cosine: fast, lossy' },
              { label: 'late interaction', boxes: [{ text: 'doc → 1 vector per token, offline' }, { text: 'query → per token' }], arrow: 'MaxSim: cheap, token-level' },
              { label: 'cross-encoder', boxes: [{ text: 'query + doc together, nothing precomputed' }], arrow: 'joint attention: accurate, slow' },
            ],
            caption:
              'Reading down, the interaction gets later and richer while what can be precomputed shrinks. Late interaction is the only row that keeps documents fully precomputable and still compares at token granularity, which is why it can act as a retriever where a cross-encoder cannot.',
          },
        ],
        tradeoffs: {
          gains: [
            'Much of a cross-encoder’s quality at a fraction of the cost',
            'Documents stay precomputable, so it scales as a first-stage retriever',
            'Strong on rare exact terms that pooled embeddings wash out',
          ],
          costs: [
            'Storage is one to two orders of magnitude larger',
            'Needs its own index and query engine, not a drop-in for a standard vector store',
            'More moving parts than either neighbour',
          ],
        },
        children: [
          {
            id: 'rr-colbert-v2',
            label: 'Making the storage survivable',
            kind: 'method',
            summary: 'ColBERTv2: centroids plus residuals',
            detail: [
              'Token vectors are extremely redundant, because the same word in similar contexts lands in nearly the same place. **ColBERTv2 exploits that:**',
              '- **Clustering:** All token vectors are clustered into centroids.',
              '- **Compression:** Each token is stored as a centroid id plus a heavily quantised residual (1-2 bits per dimension).',
              'That turns a 512-byte float32 token vector into roughly 20 to 36 bytes, cutting the index by an order of magnitude and bringing it back into the deployable range.',
              'The retrieval engine built around it, **PLAID**, then prunes aggressively by centroid before ever computing a full MaxSim.',
              '**The lesson:** At scale, the interesting engineering in retrieval is almost always about making vectors smaller without making them useless.',
            ],
            math: [
              {
                title: 'Residual compression',
                tex: String.raw`e_{d_j} \approx c_{k} + r_j, \qquad r_j \ \text{quantised to 1 or 2 bits per dimension}`,
                worked: [
                  { tex: String.raw`128 \times 4 = 512\ \text{bytes uncompressed}` },
                  { tex: String.raw`\approx 36\ \text{bytes at 2 bits}`, caption: 'roughly 14x smaller' },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'rr-gain',
        label: 'What it actually buys',
        kind: 'metric',
        summary: 'Precision up, recall unchanged',
        detail: [
          'Reranking cannot change recall@K for the same K, it reorders the set it is handed. What it improves is precision at small k, which is what the prompt actually receives.',
          'The right way to see the gain is recall@5 after reranking a top-50 pool, versus recall@5 straight from retrieval. Typical improvements are 10–20 points of nDCG@5, which is larger than the gain from most embedding-model upgrades.',
        ],
      },
      {
        id: 'rr-skip',
        label: 'When to skip it',
        kind: 'tradeoff',
        summary: 'Latency-critical or already-precise retrieval',
        detail: [
          'If retrieval precision@5 is already high, a small, clean, well-separated corpus, reranking adds latency for little movement.',
          'It is also skippable when the LLM context is large enough to take the full top-50 directly. That trades reranker latency for generation cost and the risk of the model losing the relevant chunk in the middle of a long context, which is a real and measurable effect.',
        ],
      },
    ],
    trace: { headline: 'Reordered by joint scoring', payload: 'A  0.94\nB  0.71\nD  0.44\nC  0.12', mono: true, note: 'A overtakes B once the model reads query and document together.' },
  },

  {
    id: 'retrieval-metrics',
    icon: 'chart',
    label: 'Retrieval Metrics',
    phase: 'online',
    kind: 'optional',
    ordinal: '7b',
    tagline: 'Precision, Recall, MRR, nDCG, measured on the retrieved set',
    code: [
      {
        title: 'RAGAS',
        language: 'python',
        code: `from ragas import evaluate
from ragas.metrics import context_precision, context_recall

# These need ground-truth relevant chunks per query, which is exactly
# what the golden set provides. Without it, none of them can be computed.
scores = evaluate(dataset, metrics=[context_recall, context_precision])`,
        note: 'Retrieval metrics are computed against relevance labels, separately from generation quality, so a failure localises to retrieval vs. generation.',
      },
    ],
    detail: [
      'Everything so far produced a ranked list. These metrics say whether it was any good, and they are computed against relevance judgements, not against the model’s output.',
      'This separation is the important part. Generation-side evaluation tells you whether the answer was faithful to the context it was given. It cannot tell you whether the right context was ever retrieved. When answers are wrong, these metrics are what distinguish "the model hallucinated" from "the evidence was never there", two failures with completely different fixes.',
      'They divide into two families. Set metrics, precision and recall, ignore order and ask what fraction of the retrieved set was relevant. Rank metrics, MRR and nDCG, care where in the list the relevant items landed, which matters because position 1 and position 40 are not equally useful to an LLM.',
    ],
    math: [
      {
        title: 'The running example',
        tex: String.raw`|\text{Rel}| = 8, \quad K = 10, \quad \text{retrieved relevant} = 6`,
        note: 'Eight chunks in the corpus genuinely answer the query. We retrieved ten, of which six were relevant. Every metric below is computed from this scenario.',
      },
    ],
    figures: [
      {
        kind: 'ranked',
        title: 'The retrieved list, by relevance grade',
        grades: [3, 2, 0, 3, 0, 1, 2, 0, 0, 1],
        maxGrade: 3,
        markFirstRelevant: true,
        caption:
          'Ten results, graded 0–3. Six are relevant to some degree; two more relevant chunks exist in the corpus and were missed entirely. Set metrics see only how many cells are shaded, precision 6/10, recall 6/8. Rank metrics also see where the dark cells fall, which is the difference between a list an LLM can use and one it cannot.',
      },
      {
        kind: 'curve',
        title: 'The positional discount',
        xLabel: 'rank',
        yLabel: '1/log₂(i+1)',
        lines: [
          {
            points: [
              [1, 1],
              [2, 0.6309],
              [3, 0.5],
              [4, 0.4307],
              [5, 0.3869],
              [6, 0.3562],
              [7, 0.3333],
              [8, 0.3155],
              [9, 0.301],
              [10, 0.2891],
            ],
          },
        ],
        marks: [
          { x: 1, y: 1, label: '1.00' },
          { x: 4, y: 0.4307, label: '0.43' },
          { x: 10, y: 0.2891, label: '0.29' },
        ],
        xTicks: [
          { at: 1, label: '1' },
          { at: 5, label: '5' },
          { at: 10, label: '10' },
        ],
        yTicks: [
          { at: 0, label: '0' },
          { at: 0.5, label: '0.5' },
          { at: 1, label: '1' },
        ],
        caption:
          'The multiplier nDCG applies to each result by position. The drop from rank 1 to rank 2 is steeper than from rank 2 to rank 10 combined, so a mistake at the very top costs far more than a mistake further down. That matches how an LLM actually reads its context, and it is why moving one chunk from rank 3 to rank 1 can matter more than fixing five results at the bottom.',
      },
    ],
    concepts: [
      {
        id: 'met-precision',
        label: 'Precision@K',
        kind: 'metric',
        summary: 'What fraction of what you returned was relevant',
        detail: [
          'Measures noise in the result set. Low precision means the prompt is padded with irrelevant chunks, which wastes context budget and gives the model material to be distracted by.',
          'Precision@K is the metric to watch at small k, the handful of chunks that actually reach the prompt.',
        ],
        math: [
          {
            title: 'Definition',
            tex: String.raw`P@K = \frac{|\text{Rel} \cap \text{Ret}_K|}{K}`,
            worked: [
              { tex: String.raw`P@10 = \frac{6}{10} = 0.60` },
              { tex: String.raw`P@5 = \frac{3}{5} = 0.60`, caption: 'three of the top five were relevant' },
            ],
            note: 'Note the denominator is K, not the number of relevant documents. Precision cannot be improved by retrieving less unless the discarded items were the irrelevant ones.',
          },
        ],
      },
      {
        id: 'met-recall',
        label: 'Recall@K',
        kind: 'metric',
        summary: 'What fraction of everything relevant you found',
        detail: [
          'The single most diagnostic metric in RAG. A chunk missed at retrieval cannot be recovered by reranking, prompting, or a better model, the information simply is not in the pipeline.',
          'Measure it at the retrieval stage with generous K. If recall@50 is low, nothing downstream can save you and the fix belongs in chunking, embedding, or query processing.',
        ],
        math: [
          {
            title: 'Definition',
            tex: String.raw`R@K = \frac{|\text{Rel} \cap \text{Ret}_K|}{|\text{Rel}|}`,
            worked: [
              { tex: String.raw`R@10 = \frac{6}{8} = 0.75` },
              { tex: String.raw`R@5 = \frac{3}{8} = 0.375` },
            ],
            note: 'Requires knowing |Rel|, the total number of relevant chunks in the corpus, which is why building a labelled evaluation set is unavoidable. Estimating it by pooling the results of several retrievers is the standard practical approach.',
          },
          {
            title: 'F₁, the harmonic mean',
            tex: String.raw`F_1 = \frac{2 P R}{P + R}`,
            worked: [
              { tex: String.raw`F_1 = \frac{2(0.60)(0.75)}{0.60 + 0.75} = \frac{0.90}{1.35} = 0.667` },
            ],
            note: 'The harmonic mean punishes imbalance, 1.0 precision with 0.1 recall gives F₁ = 0.18, not 0.55. In RAG the two are rarely equally important, so report them separately as well.',
          },
        ],
        children: [
          {
            id: 'met-recall-stage',
            label: 'Recall is stage-specific',
            kind: 'pitfall',
            summary: 'Measure it where it is set, not where it is spent',
            detail: [
              'Recall is determined at retrieval and can only fall afterwards. Measuring recall@5 on the post-rerank set conflates two things: whether retrieval found the chunk, and whether the reranker kept it.',
              'Track recall@50 at retrieval and precision@5 after reranking. Those two numbers localise a failure to a stage; a single end-to-end number does not.',
            ],
          },
        ],
      },
      {
        id: 'met-mrr',
        label: 'MRR',
        kind: 'metric',
        summary: 'How high was the first relevant result',
        detail: [
          'Mean Reciprocal Rank looks only at the position of the *first* relevant document, averaged over queries. It fits questions with a single correct answer, a lookup, a definition, a specific fact.',
          'It is the wrong metric when a question needs several chunks to answer, because it ignores everything after the first hit. For a comparison question needing evidence about both items, MRR scores a list containing only the first item perfectly.',
        ],
        math: [
          {
            title: 'Definition',
            tex: String.raw`\text{MRR} = \frac{1}{|Q|}\sum_{i=1}^{|Q|} \frac{1}{\text{rank}_i}`,
            where: [{ sym: String.raw`\text{rank}_i`, means: 'position of the first relevant result for query i (∞ → 0 if none)' }],
            worked: [
              { tex: String.raw`\text{ranks} = 1,\ 3,\ 2` },
              { tex: String.raw`\text{MRR} = \frac{1}{3}\left(\frac{1}{1} + \frac{1}{3} + \frac{1}{2}\right) = \frac{1.8333}{3} = 0.611` },
            ],
            note: 'The reciprocal makes the top positions dominate: moving a result from rank 2 to rank 1 adds 0.5, while moving it from rank 10 to rank 9 adds 0.011.',
          },
        ],
      },
      {
        id: 'met-ndcg',
        label: 'nDCG@K',
        kind: 'metric',
        summary: 'Graded relevance, discounted by position',
        detail: [
          'Normalised Discounted Cumulative Gain is the most informative of the four, because it is the only one that handles *graded* relevance. Real judgements are not binary, a chunk can be perfect, useful, tangential, or wrong, and collapsing that to a yes/no throws away most of the signal.',
          'It has three parts. Gain converts a relevance grade to a value. Discount divides by a logarithm of the position, so later results count less. Normalisation divides by the best achievable score, putting every query on a 0–1 scale so they can be averaged.',
        ],
        math: [
          {
            title: 'Discounted Cumulative Gain',
            tex: String.raw`\text{DCG@}K = \sum_{i=1}^{K} \frac{2^{rel_i} - 1}{\log_2(i + 1)}`,
            where: [
              { sym: String.raw`rel_i`, means: 'graded relevance of the result at position i, e.g. 0–3' },
              { sym: String.raw`\log_2(i+1)`, means: 'the positional discount' },
            ],
            note: 'The 2^rel − 1 numerator is exponential, so a grade-3 result is worth 7 while a grade-1 is worth 1. Highly relevant documents dominate by design.',
          },
          {
            title: 'Ideal DCG and normalisation',
            tex: String.raw`\text{nDCG@}K = \frac{\text{DCG@}K}{\text{IDCG@}K}`,
            note: 'IDCG is the DCG of the perfect ranking, the same relevance grades sorted descending. Dividing by it makes an easy query with many relevant documents comparable to a hard one with few.',
          },
          {
            title: 'Worked, grades [3, 2, 3, 0, 1, 2]',
            tex: String.raw`\text{DCG@6} = \frac{7}{\log_2 2} + \frac{3}{\log_2 3} + \frac{7}{\log_2 4} + \frac{0}{\log_2 5} + \frac{1}{\log_2 6} + \frac{3}{\log_2 7}`,
            worked: [
              { tex: String.raw`= 7.000 + 1.893 + 3.500 + 0 + 0.387 + 1.069 = 13.848` },
              { tex: String.raw`\text{ideal order} = [3, 3, 2, 2, 1, 0]`, caption: 'the same grades, best possible ranking' },
              { tex: String.raw`\text{IDCG@6} = 7.000 + 4.416 + 1.500 + 1.292 + 0.387 + 0 = 14.595` },
              { tex: String.raw`\text{nDCG@6} = \frac{13.848}{14.595} = 0.949` },
            ],
            note: 'The ranking loses only 5% against perfect. The gap comes almost entirely from the grade-3 document sitting at position 3 instead of 2, the discount is steepest at the top, so that is where mistakes are expensive.',
          },
        ],
        children: [
          {
            id: 'met-map',
            label: 'MAP',
            kind: 'metric',
            summary: 'Mean Average Precision, binary alternative',
            math: [
              {
                title: 'Average Precision',
                tex: String.raw`\text{AP} = \frac{1}{|\text{Rel}|}\sum_{k=1}^{K} P@k \cdot \mathbb{1}[\,\text{item } k \text{ is relevant}\,]`,
                worked: [
                  { tex: String.raw`\text{relevant at ranks } 1, 2, 4, 6, 7, 10` },
                  { tex: String.raw`P@1{=}1.000,\ P@2{=}1.000,\ P@4{=}0.750,\ P@6{=}0.667,\ P@7{=}0.714,\ P@10{=}0.600` },
                  { tex: String.raw`\text{AP} = \frac{4.731}{8} = 0.591` },
                ],
                note: 'AP averages precision measured at each relevant hit, so it rewards clustering relevant results early. MAP is AP averaged over queries. It handles multiple relevant documents like nDCG but only supports binary relevance.',
              },
            ],
          },
        ],
      },
      {
        id: 'met-choose',
        label: 'Which to use',
        kind: 'tradeoff',
        summary: 'Match the metric to the question shape',
        detail: [
          'Recall@K at retrieval, always. It is the ceiling on everything downstream and the only metric that localises a fatal failure.',
          'nDCG@10 as the headline quality number, if you can afford graded judgements. It captures both ordering and degree of relevance, and it is what reranker improvements actually move.',
          'MRR when questions have one right answer. Precision@5 when you want to know what the prompt is being padded with. MAP when relevance is binary and several documents matter.',
        ],
      },
      {
        id: 'met-labels',
        label: 'Getting relevance judgements',
        kind: 'method',
        summary: 'The hard part is the labels, not the maths',
        detail: [
          'None of these can be computed without knowing which chunks are relevant. That labelled set is the real cost, and the reason retrieval metrics get skipped.',
          'Three practical sources. Synthetic: have an LLM generate a question from each chunk, then the correct answer for that question is by construction that chunk, cheap, and biased toward questions that are easy to retrieve. Pooled: run several retrievers, judge the union, treat unjudged as irrelevant. Implicit: mine click-through or thumbs from production traffic, which is realistic but noisy and only covers queries you already serve well.',
          'A few hundred labelled queries is enough to detect regressions, which is the point. The set does not need to be large; it needs to be stable, so numbers are comparable across changes.',
        ],
      },
    ],
    tradeoffs: {
      gains: ['Localises failure to retrieval vs. generation', 'Makes chunking and index changes measurable', 'Catches regressions before users do'],
      costs: ['Requires a labelled evaluation set', 'Labels go stale as the corpus changes', 'Offline metrics only approximate user satisfaction'],
    },
    trace: {
      headline: 'Retrieval scored',
      payload: 'Recall@50   0.875   (7 of 8 relevant chunks found)\nPrecision@5 0.800\nMRR         1.000   (top result relevant)\nnDCG@10     0.912',
      mono: true,
      note: 'One relevant chunk was never retrieved, a ceiling nothing downstream can lift.',
    },
  },

  {
    id: 'context-window',
    icon: 'crop',
    label: 'Context Window Management',
    phase: 'online',
    kind: 'optional',
    ordinal: '8a',
    tagline: 'Ranking says what is best; the budget says what fits',
    code: [
      {
        title: 'tiktoken',
        language: 'python',
        code: `import tiktoken
enc = tiktoken.encoding_for_model("gpt-4o")

budget, kept = 6962, []          # T_max - system - question - reserved output
for doc in reranked_docs:        # already in rank order
    n = len(enc.encode(doc.page_content))
    if budget - n < 0:
        break                    # drop the rest, from the BOTTOM of the ranking
    kept.append(doc); budget -= n`,
        note: 'Count with the serving model\'s own tokenizer. Character estimates under-count code and non-English by 2x or more, which is exactly when prompts silently overflow.',
      },
    ],
    detail: [
      'Reranking produced an ordered list. It did not produce a list that fits. Those are separate problems, and the second one is arithmetic: the system prompt, the chunks, the question and the reserved output tokens all have to sit inside the model window together.',
      'The naive approach is to take the top k for some fixed k, which quietly breaks whenever chunk sizes vary. Ten parent sections are not the same size as ten sentences, and a parent-child setup can produce a top-10 that is four times the budget. Counting tokens is not optional.',
      'The output reservation is the part most often forgotten. A prompt that fits perfectly and leaves no room to answer produces a truncated response, which looks like a model failure and is actually a budgeting failure.',
      'Worth noting that the constraint is rarely the real limit. Long-context models will accept far more than you should send, because attention degrades in the middle of a long context and irrelevant chunks actively distract. The budget is an upper bound, not a target.',
    ],
    math: [
      {
        title: 'The budget that has to balance',
        tex: String.raw`T_{\text{sys}} + \sum_{i=1}^{k} |c_i| + T_{q} + T_{\text{out}} \le T_{\max}`,
        where: [
          { sym: String.raw`T_{\text{out}}`, means: 'tokens reserved for the answer, not optional' },
          { sym: String.raw`|c_i|`, means: 'token length of the i-th chunk, counted with the model tokenizer' },
        ],
        worked: [
          { tex: String.raw`400 + 5(480) + 30 + 800 = 3630 \le 8192`, caption: 'five chunks, comfortable' },
          { tex: String.raw`400 + 20(480) + 30 + 800 = 10{,}830 > 8192`, caption: 'twenty chunks overflows by 2,638' },
        ],
      },
      {
        title: 'Greedy fill, in rank order',
        tex: String.raw`\begin{aligned} B &= T_{\max} - T_{\text{sys}} - T_{q} - T_{\text{out}} \\[6pt] k^{*} &= \max\Big\{\,k : \textstyle\sum_{i=1}^{k}|c_i| \le B \,\Big\} \end{aligned}`,
        worked: [
          { tex: String.raw`B = 8192 - 400 - 30 - 800 = 6962\ \text{tokens}` },
          { tex: String.raw`\text{chunks of } 480 \Rightarrow k^{*} = 14`, caption: 'the budget allows 14' },
        ],
        note: 'Allowing 14 does not mean sending 14. The budget sets the ceiling; retrieval quality and the lost-in-the-middle effect usually set a much lower practical k of around 3 to 8.',
      },
      {
        title: 'Characters are not tokens',
        tex: String.raw`\frac{\text{chars}}{\text{token}} \approx 4 \ \text{(English prose)}`,
        worked: [
          { tex: String.raw`\text{code, JSON} \approx 2.5`, caption: 'denser, so fewer characters per token' },
          { tex: String.raw`\text{CJK, non-Latin} \approx 1\ \text{to}\ 1.5`, caption: 'a character can cost more than a token' },
        ],
        note: 'Estimating the budget from character counts under-counts non-English and code by a factor of two or more, which is exactly the case where the prompt silently overflows and the tail is dropped by the provider rather than by you.',
      },
    ],
    figures: [
      {
        kind: 'blocks',
        title: 'Fitting the ranked list to the budget',
        rows: [
          { label: 'from reranking', boxes: [{ text: '20 chunks, ordered by relevance' }], arrow: 'count tokens with the model tokenizer' },
          { boxes: [{ text: 'running total vs. remaining budget' }], arrow: 'drop from the bottom of the ranking' },
          {
            boxes: [
              { text: 'kept: top 5' },
              { text: 'dropped: 15', dashed: true },
            ],
            arrow: 'reserve output tokens',
          },
          { boxes: [{ text: '3,630 of 8,192, with 800 held for the answer', filled: true }] },
        ],
        caption:
          'Dropping happens from the bottom of the ranking, which is why this stage has to run after reranking rather than after retrieval. Dropping by retrieval order would discard chunks the reranker had just promoted.',
      },
      {
        kind: 'bars',
        title: 'Where the budget goes (tokens)',
        categories: ['system', 'context', 'question', 'output'],
        showValues: true,
        series: [{ label: '', values: [400, 2400, 30, 800] }],
        caption:
          'Context dominates but is the only part that scales with k. Everything else is close to fixed, which is what makes the greedy fill above a one-dimensional problem: the only free variable is how many chunks to keep.',
      },
    ],
    tradeoffs: {
      gains: [
        'Prompts never overflow, so answers are never silently truncated',
        'Variable chunk sizes stop breaking a fixed top-k',
        'Cost per request becomes predictable',
      ],
      costs: [
        'Tokenizing every candidate adds latency',
        'A hard drop can discard a chunk that mattered',
        'Budget has to be re-tuned whenever the model or prompt changes',
      ],
    },
    distinctions: [
      {
        title: 'Window management vs. context compression',
        body: 'Window management selects: it keeps whole chunks and discards whole chunks, and the text that survives is byte-identical to what was retrieved. Compression rewrites: it shortens or summarises chunks so more of them fit, which buys room at the cost of putting model-generated text into the evidence. Selection cannot lose information within a chunk and cannot fit more than the budget allows. Compression can do both. They compose, and if you use both, compress first and fit second.',
      },
    ],
    concepts: [
      {
        id: 'ctx-alloc',
        label: 'Allocation strategies',
        kind: 'method',
        summary: 'Greedy is not the only option',
        detail: [
          'Greedy fill in rank order is the default and is usually right. It maximises the number of high-ranked chunks that fit.',
          'Proportional allocation reserves a share of the budget per source or per sub-question, which matters after decomposition: greedy fill would let one verbose sub-answer consume the whole budget and starve the others. A per-document cap does something similar for a single dominant document.',
          'Diversity-aware fill sits between them, applying an MMR-style penalty so the kept set is not five near-identical chunks. If deduplication already ran, most of that work is done.',
        ],
      },
      {
        id: 'ctx-parent',
        label: 'Parent expansion blows budgets',
        kind: 'pitfall',
        summary: 'You ranked children and are sending parents',
        detail: [
          'Parent-child chunking ranks small children and then substitutes their much larger parent sections. The ranking is over 200-token units and the budget is spent on 2,000-token ones, so a top-10 that looked reasonable becomes ten times the size.',
          'Deduplicate parents first, since several children commonly share one, then count tokens on the parents rather than the children. The count that matters is always the count of what you actually send.',
        ],
      },
      {
        id: 'ctx-longcontext',
        label: 'Does long context remove the problem?',
        kind: 'tradeoff',
        summary: 'It removes the limit, not the reason',
        detail: [
          'A very large window means the budget rarely binds. It does not mean filling it is a good idea. Retrieval quality still decides the answer, attention still degrades toward the middle of a long context, and every extra token costs money and latency.',
          'The useful reframing is that a large window converts a hard constraint into an economic one. You stop asking "what fits" and start asking "what earns its place", which is a better question and the one the reranker was already answering.',
        ],
      },
      {
        id: 'ctx-compression',
        label: 'Context compression',
        kind: 'method',
        summary: 'Make the chunks smaller instead of dropping them',
        detail: [
          'Selection throws away whole chunks. Compression keeps more of them by making each one shorter, which is worth doing when the useful sentence is buried in a chunk that is mostly scaffolding.',
          'It comes in three strengths. Filtering discards whole retrieved chunks that a cheap relevance check says are off-topic, which is really just a second, cheaper reranking pass. Extractive compression drops sentences or tokens within a surviving chunk, scoring each span against the query and keeping the top ones; the text that survives is still verbatim. Abstractive compression rewrites the chunk as a query-focused summary, which packs the most information per token and is the only one of the three that puts generated text into the evidence.',
          'That last point is the whole trade. Once a chunk has been rewritten, the answer is grounded in a paraphrase rather than in the source, exact-span citation stops working, and any error the compressor makes is now indistinguishable from evidence. Extractive compression avoids this entirely, which is why it is the safer default even though it saves less.',
        ],
        math: [
          {
            title: 'Does compression pay for itself?',
            tex: String.raw`\Delta = \underbrace{(1 - \rho)\sum_i |c_i| \cdot p_{\text{in}}}_{\text{prompt tokens saved}} \;-\; \underbrace{C_{\text{compress}}}_{\text{cost to compress}}`,
            where: [
              { sym: String.raw`\rho`, means: 'compression ratio, surviving tokens over original' },
              { sym: String.raw`p_{\text{in}}`, means: 'input token price' },
            ],
            note: 'An LLM-based compressor reads every candidate chunk, so it costs roughly what it saves unless the compressor is much cheaper per token than the generator. Extractive methods using a small scoring model usually clear this bar; asking a large model to summarise usually does not.',
          },
          {
            title: 'Where the budget goes after compressing',
            tex: String.raw`k_{\text{eff}} = \frac{B}{\rho \cdot \overline{|c|}}`,
            worked: [
              { tex: String.raw`B = 6962,\ \overline{|c|} = 480,\ \rho = 1.0 \Rightarrow k = 14` },
              { tex: String.raw`\rho = 0.5 \Rightarrow k = 29`, caption: 'twice the chunks in the same budget' },
            ],
            note: 'Twice the chunks is not automatically better. Compression trades depth per chunk for breadth across chunks, and past a point the extra chunks are just more middle for the model to lose things in.',
          },
        ],
        tradeoffs: {
          gains: [
            'More evidence inside a fixed budget',
            'Cuts generation cost on long contexts',
            'Filtering catches chunks reranking left in',
          ],
          costs: [
            'Abstractive compression puts model-written text into the evidence',
            'Exact-span citation breaks once text is rewritten',
            'The compressor is another model call on the hot path',
          ],
        },
      },
      {
        id: 'ctx-packing',
        label: 'Context packing',
        kind: 'method',
        summary: 'Spend the budget on signal, not on repetition',
        detail: [
          'Packing is what happens after you know which chunks are going in: how they are ordered, merged and formatted so the tokens you spend carry as much distinct information as possible.',
          'The first win is merging. Chunks retrieved from the same document are frequently adjacent or overlapping, and sending them separately repeats the shared span and repeats the heading breadcrumb on every one. Merging adjacent chunks into a single contiguous passage removes both, and reads better besides.',
          'The second is stripping the duplication that overlap chunking deliberately introduced. A 50-token overlap between neighbours is useful in the index, where it stops a fact being severed, and is pure waste in the prompt, where it is the same sentence twice.',
          'The third is ordering, which is where this meets the attention curve. Put the strongest evidence at the very start and the very end rather than in a simple descending list, and keep the stable prefix first if provider-side prompt caching is in play.',
        ],
        math: [
          {
            title: 'Packing efficiency',
            tex: String.raw`\eta = \frac{\text{distinct informative tokens}}{\text{total context tokens}}`,
            worked: [
              { tex: String.raw`\text{5 chunks, 10\% overlap, breadcrumb 12 tokens each}` },
              { tex: String.raw`\eta \approx \frac{2400 - 216 - 48}{2400} = 0.89`, caption: '11% of the context was repetition' },
            ],
            note: 'Merging adjacent chunks and de-overlapping recovers most of that at no quality cost, which makes it the cheapest win available at this stage.',
          },
        ],
        children: [
          {
            id: 'ctx-format',
            label: 'Formatting matters',
            kind: 'idea',
            summary: 'Delimiters and ids are load-bearing',
            detail: [
              'Chunks need unambiguous boundaries and stable short identifiers, otherwise the model cannot cite them and cannot tell where one piece of evidence ends and the next begins. Two chunks run together read as one contradictory passage.',
              'Keep the scaffolding cheap. Long identifiers and verbose separators are tokens spent on structure rather than evidence, and models transcribe long ids incorrectly. Short numeric labels in brackets are enough.',
            ],
          },
        ],
      },
      {
        id: 'ctx-count',
        label: 'Counting correctly',
        kind: 'method',
        summary: 'Use the tokenizer the model uses',
        detail: [
          'Token counts differ between model families, so a budget validated against one tokenizer can overflow on another. Count with the tokenizer belonging to the model that will actually serve the request, and re-validate when the model changes.',
          'Cache the count on the chunk at ingestion, keyed by tokenizer version. Chunk text does not change between requests, so counting it on every query is repeated work on the hot path.',
        ],
      },
    ],
    trace: {
      headline: 'Fitted to the budget',
      payload: '20 candidates  →  5 chunks kept, 15 dropped\n3,630 / 8,192 tokens   (800 reserved for the answer)',
      mono: true,
      note: 'Dropped from the bottom of the reranked order, so nothing the cross-encoder promoted was discarded.',
    },
  },

  {
    id: 'prompt',
    icon: 'brackets',
    label: 'Prompt Construction',
    phase: 'online',
    kind: 'sequential',
    ordinal: '8',
    tagline: 'Assemble system, context, question',
    code: [
      {
        title: 'LangChain',
        language: 'python',
        code: `from langchain_core.prompts import ChatPromptTemplate
from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain

prompt = ChatPromptTemplate.from_messages([
    ("system", "Answer only from the context. Cite [n]. "
               "If it is not covered, say so.\\n\\n{context}"),
    ("human", "{input}"),
])
chain = create_retrieval_chain(retriever,
                               create_stuff_documents_chain(llm, prompt))`,
        note: 'The licence to abstain in the system prompt is one of the highest-value lines in a RAG stack.',
      },
    ],
    detail: [
      'Assemble the final prompt: system prompt, retrieved context, the user question, and formatting instructions.',
      'Ordering and labelling are not cosmetic. Clearly delimited chunks with stable identifiers are what make citation possible downstream, and position within the context window measurably affects what the model attends to.',
    ],
    stack: [
      { name: 'LangChain', what: 'PromptTemplate and ChatPromptTemplate', url: 'https://python.langchain.com/docs/concepts/prompt_templates/' },
      { name: 'LlamaIndex', what: 'Response synthesizers and prompt abstractions', url: 'https://docs.llamaindex.ai/en/stable/module_guides/querying/response_synthesizers/' },
      { name: 'Guidance', what: 'Constrained generation with template control', url: 'https://github.com/guidance-ai/guidance' },
      { name: 'Jinja2', what: 'Python templating engine for prompt assembly', url: 'https://jinja.palletsprojects.com/' },
    ],
    math: [
      {
        title: 'Context budget',
        tex: String.raw`T_{\text{sys}} + \sum_{i=1}^{k}|c_i| + T_{\text{q}} + T_{\text{out}} \le T_{\max}`,
        worked: [
          { tex: String.raw`400 + 5(480) + 30 + 800 = 3630 \le 8192`, caption: 'five chunks, comfortable' },
          { tex: String.raw`400 + 20(480) + 30 + 800 = 10{,}830 > 8192`, caption: 'twenty chunks overflows, something must be dropped' },
        ],
        note: 'Reserve the output tokens explicitly. A prompt that fits but leaves no room to answer produces a truncated response, which looks like a model failure rather than a budgeting one.',
      },
      {
        title: 'How many chunks to include',
        tex: String.raw`k^* = \arg\max_k \big[\, \text{quality}(k) - \gamma \cdot \text{cost}(k) \,\big]`,
        note: 'Quality rises with k, plateaus, then falls as irrelevant context begins to distract. The peak is usually 3–8 chunks, far fewer than most context windows allow, because more context is not monotonically better.',
      },
    ],
    example: {
      before: 'System Prompt\n\nContext:\n  [1] Chunk 1\n  [2] Chunk 2\n  [3] Chunk 3\n\nQuestion:\n  Explain HNSW.',
      after: 'Sent to the LLM as one prompt',
      mono: true,
    },
    concepts: [
      {
        id: 'pr-lost',
        label: 'Lost in the middle',
        kind: 'pitfall',
        summary: 'Attention is U-shaped over position',
        detail: [
          'Models attend most reliably to the beginning and end of their context and least reliably to the middle. A chunk placed at position 10 of 20 is measurably less likely to be used than the same chunk at position 1 or 20.',
          'The practical response is to keep k small and to order deliberately: put the highest-ranked chunks at the very start and the very end rather than in a simple descending list. It also argues against "just use the big context window", a 100-chunk prompt buries most of its own evidence.',
          'This is the single strongest argument for taking reranking seriously. If only the first and last few positions are read reliably, then which chunks occupy them is the decision that determines the answer, and that decision is made by the reranker, not by retrieval.',
        ],
        figures: [
          {
            kind: 'curve',
            title: 'Accuracy by position of the answer in context',
            xLabel: 'position of the relevant chunk',
            yLabel: 'acc.',
            lines: [
              {
                points: [
                  [1, 0.95],
                  [3, 0.82],
                  [5, 0.72],
                  [8, 0.64],
                  [10, 0.62],
                  [12, 0.63],
                  [15, 0.7],
                  [18, 0.8],
                  [20, 0.88],
                ],
              },
            ],
            marks: [
              { x: 1, y: 0.95, label: 'start' },
              { x: 10, y: 0.62, label: 'middle' },
              { x: 20, y: 0.88, label: 'end' },
            ],
            xTicks: [
              { at: 1, label: '1' },
              { at: 10, label: '10' },
              { at: 20, label: '20' },
            ],
            yTicks: [
              { at: 0.5, label: '' },
              { at: 0.75, label: '' },
              { at: 1, label: '1' },
            ],
            caption:
              'Schematic, the U shape reproduces across models and studies, though the depth of the dip varies and shallower context windows suffer less. The same chunk, unchanged, is used far less reliably at position 10 of 20 than at either end. Nothing about the chunk changed; only where it sat.',
          },
        ],
      },
      {
        id: 'pr-cite',
        label: 'Citation scaffolding',
        kind: 'method',
        summary: 'Stable ids the model can point at',
        detail: [
          'Label each chunk with a short stable identifier and instruct the model to cite it inline. Without an explicit handle, models produce citations by paraphrasing source titles, which cannot be resolved programmatically.',
          'Keep the identifier short, [1], [2], because every token spent on scaffolding is a token not spent on evidence, and long identifiers get transcribed incorrectly.',
        ],
      },
      {
        id: 'pr-abstain',
        label: 'Licence to abstain',
        kind: 'method',
        summary: 'Say explicitly that "I don’t know" is allowed',
        detail: [
          'Without an explicit instruction, a model handed weak context will still produce a confident answer; that is what its training rewards. The single highest-value line in most RAG system prompts is permission to say the context does not contain the answer.',
          'Pair it with a grounding instruction: answer only from the provided context, and state when it is insufficient. This converts a hallucination into a detectable, honest failure.',
        ],
      },
      {
        id: 'pr-order',
        label: 'Ordering strategies',
        kind: 'tradeoff',
        summary: 'Relevance, reversed, or interleaved',
        detail: [
          'Descending relevance is the obvious default and puts the best chunk where attention is strongest.',
          'Ascending order, best chunk last, immediately before the question, exploits recency and often measures slightly better, since the strongest evidence is adjacent to the instruction.',
          'Interleaving alternates from both ends inward, so the top two chunks occupy the first and last positions. Whichever you choose, fix it and measure it; this is a cheap A/B with a real effect size.',
        ],
      },
    ],
    trace: { headline: 'Prompt assembled', payload: 'System Prompt  (answer only from context; cite [n]; may abstain)\n\nContext:\n  [1] FAISS supports IVF, PQ and HNSW indexes...\n  [2] HNSW builds a hierarchical proximity graph...\n  [3] Memory footprint comparison...\n\nQuestion:\n  How is FAISS different from HNSW?', mono: true, note: '3,630 of 8,192 tokens used.' },
  },

  {
    id: 'generation',
    icon: 'sparkle',
    label: 'LLM Generation',
    phase: 'online',
    kind: 'choice',
    ordinal: '9',
    tagline: 'Sampling and decoding are different knobs',
    code: [
      {
        title: 'LangChain',
        language: 'python',
        code: `from langchain_openai import ChatOpenAI

# RAG is extraction, not creativity: near-greedy, low temperature,
# a hard length cap. Any variance not driven by the context is invention.
llm = ChatOpenAI(model="gpt-4o", temperature=0, max_tokens=800)`,
        note: 'temperature=0 is effectively greedy decoding. Raise it only for open-ended tasks, never for grounded answers.',
      },
    ],
    detail: [
      '**Two separate mechanisms get lumped together constantly:**',
      '- **Sampling (temperature, top-K, top-P):** Shapes the probability distribution and governs how the next single token is chosen from it.',
      '- **Decoding (greedy, beam search):** The strategy for building the whole output sequence. Greedy commits to the best token at each step; beam search keeps several candidate sequences alive and picks the best complete one.',
      '**Speculative decoding is neither:** It is an inference optimisation where a small draft model proposes tokens that the large model verifies in a batch. Same output distribution, less wall-clock time.',
    ],
    stack: [
      { name: 'OpenAI', what: 'GPT-4o, GPT-4.1, o3-pro', url: 'https://platform.openai.com/docs/models' },
      { name: 'Anthropic', what: 'Claude 4 / Opus 4 / Sonnet 4', url: 'https://www.anthropic.com/' },
      { name: 'Google', what: 'Gemini 2.5 Pro / Flash', url: 'https://ai.google.dev/' },
      { name: 'Mistral', what: 'Mistral Large, open-weight models', url: 'https://mistral.ai/' },
      { name: 'Ollama', what: 'Run open models locally (Llama 3, Phi, Qwen)', url: 'https://ollama.com/' },
      { name: 'vLLM', what: 'High-throughput serving engine for open models', url: 'https://github.com/vllm-project/vllm' },
      { name: 'Together AI', what: 'Serverless inference for open-source LLMs', url: 'https://www.together.ai/' },
    ],
    math: [
      {
        title: 'The distribution being sampled from',
        tex: String.raw`P(x_i \mid x_{<t}) = \frac{\exp(z_i / T)}{\sum_{j} \exp(z_j / T)}`,
        where: [
          { sym: String.raw`z_i`, means: 'the raw logit for token i' },
          { sym: String.raw`T`, means: 'temperature' },
        ],
        worked: [
          { tex: String.raw`z = [2.0,\ 1.0,\ 0.1]` },
          { tex: String.raw`T = 1.0 \Rightarrow P = [0.659,\ 0.242,\ 0.099]`, caption: 'the unmodified distribution' },
          { tex: String.raw`T = 0.5 \Rightarrow P = [0.864,\ 0.117,\ 0.019]`, caption: 'sharpened, the top token dominates' },
          { tex: String.raw`T = 2.0 \Rightarrow P = [0.502,\ 0.304,\ 0.194]`, caption: 'flattened, unlikely tokens become plausible' },
        ],
        note: 'As T → 0 the distribution collapses onto the argmax, which is exactly greedy decoding. Temperature and decoding strategy meet at that limit, which is part of why they get confused.',
      },
    ],
    figures: [
      {
        kind: 'bars',
        title: 'Temperature reshapes the same distribution',
        categories: ['A', 'B', 'C'],
        yMax: 1,
        showValues: true,
        series: [
          { label: 'T = 0.5', values: [0.864, 0.117, 0.019] },
          { label: 'T = 1.0', values: [0.659, 0.242, 0.099] },
          { label: 'T = 2.0', values: [0.502, 0.304, 0.194] },
        ],
        caption:
          'Three tokens with logits 2.0, 1.0 and 0.1. The model has not changed and neither have the logits, only the divisor. Cooling concentrates mass on the leading token; heating lifts the tail until an unlikely token becomes a realistic draw. At T → 0 the left panel collapses to a single full bar, which is greedy decoding.',
      },
      {
        kind: 'bars',
        title: 'Top-P keeps the smallest set reaching p',
        categories: ['A', 'B', 'C'],
        yMax: 1,
        showValues: true,
        highlight: [0, 1],
        cutoff: { after: 2, label: 'p = 0.9' },
        series: [{ label: 'T = 1.0', values: [0.659, 0.242, 0.099] }],
        caption:
          'Cumulatively: 0.659, then 0.901, which clears 0.9, so the nucleus closes after two tokens and C is discarded. Because the boundary is set by accumulated probability rather than a fixed count, the candidate set narrows automatically when the model is confident and widens when it is not. Top-K would have taken a fixed number regardless.',
      },
    ],
    variants: [
      {
        id: 'greedy',
        label: 'Greedy',
        tagline: 'Always take the highest-probability token',
        detail: 'Take the argmax at every step. Deterministic, fast, and the usual choice for RAG, where you want the answer grounded in the context, not creatively phrased.',
        math: [
          { title: 'Rule', tex: String.raw`x_t = \operatorname*{arg\,max}_{x} P(x \mid x_{<t})`, note: 'Equivalent to sampling at T = 0. Reproducible given the same prompt and model, which makes regressions attributable.' },
        ],
        tradeoffs: {
          gains: ['Deterministic and reproducible', 'Fastest', 'Least likely to drift off-context'],
          costs: ['Repetitive on longer outputs', 'Can commit early to a locally-good, globally-bad path'],
        },
      },
      {
        id: 'beam',
        label: 'Beam Search',
        tagline: 'Keep B candidate sequences alive',
        detail: 'Maintain several partial sequences and expand them in parallel, scoring whole sequences rather than single tokens. Recovers from the local-optimum trap greedy falls into, at B× the compute.',
        math: [
          {
            title: 'Sequence score with length penalty',
            tex: String.raw`\begin{aligned} s(y) &= \frac{1}{\text{lp}(y)}\sum_{t=1}^{|y|} \log P(y_t \mid y_{<t}) \\[6pt] \text{lp}(y) &= \left(\frac{5 + |y|}{6}\right)^{\alpha} \end{aligned}`,
            where: [{ sym: String.raw`\alpha`, means: 'length-penalty exponent, typically 0.6–1.0' }],
            note: 'Log-probabilities are negative and accumulate, so without normalisation beam search systematically prefers short sequences. The penalty divides that bias out.',
          },
        ],
        tradeoffs: {
          gains: ['Better whole-sequence quality', 'Escapes local optima'],
          costs: ['B× compute', 'Tends toward bland, safe phrasing', 'Rarely worth it for RAG answers'],
        },
      },
      {
        id: 'sampling',
        label: 'Sampling',
        tagline: 'Temperature / top-K / top-P',
        detail:
          'Draw from the distribution rather than maximising. Useful for open-ended generation, generally a liability in RAG, where every departure from the retrieved context is a hallucination risk.',
        math: [
          {
            title: 'Top-K, fixed cutoff',
            tex: String.raw`\begin{aligned} V_K &= \text{the } K \text{ highest-probability tokens} \\[6pt] P'(x) &= \frac{P(x)\,\mathbb{1}[x \in V_K]}{\sum_{x' \in V_K} P(x')} \end{aligned}`,
            note: 'A fixed K is blunt: when the model is confident, K = 50 admits 49 bad tokens; when it is uncertain, K = 50 may cut off genuinely good ones.',
          },
          {
            title: 'Top-P (nucleus), adaptive cutoff',
            tex: String.raw`V_p = \min\Big\{ V' \subseteq V : \sum_{x \in V'} P(x) \ge p \Big\}`,
            worked: [
              { tex: String.raw`P = [0.659,\ 0.242,\ 0.099],\ p = 0.9` },
              { tex: String.raw`0.659 < 0.9;\quad 0.659 + 0.242 = 0.901 \ge 0.9 \Rightarrow |V_p| = 2`, caption: 'the third token is excluded' },
            ],
            note: 'The candidate set resizes with the model’s confidence, narrow when it is certain, wide when it is not. This is why top-P largely superseded top-K.',
          },
        ],
        tradeoffs: {
          gains: ['Varied, natural phrasing', 'Necessary for creative tasks'],
          costs: ['Non-deterministic', 'Higher hallucination rate', 'Harder to evaluate and debug'],
        },
      },
    ],
    distinctions: [
      {
        title: 'Sampling vs. Decoding',
        body: 'Sampling picks a token from a distribution (temperature, top-K, top-P). Decoding builds a sequence (greedy, beam). They compose: you can sample within a beam. Treating them as one setting is why "turn the temperature down" gets offered as a fix for problems it cannot touch, a beam-search repetition issue does not respond to temperature at all.',
      },
    ],
    concepts: [
      {
        id: 'gen-spec',
        label: 'Speculative decoding',
        kind: 'method',
        summary: 'Draft cheap, verify in parallel',
        detail: [
          'A small draft model proposes γ tokens; the large model then verifies all of them in a single forward pass, accepting the longest prefix consistent with its own distribution.',
          'The key property is that the output distribution is provably unchanged; this is a pure latency optimisation, not a quality trade. It is orthogonal to sampling and decoding, which is exactly why it belongs in neither category.',
        ],
        math: [
          {
            title: 'Expected tokens per verification step',
            tex: String.raw`\mathbb{E}[\text{accepted}] = \frac{1 - \alpha^{\gamma + 1}}{1 - \alpha}`,
            where: [
              { sym: String.raw`\alpha`, means: 'per-token acceptance rate of the draft model' },
              { sym: String.raw`\gamma`, means: 'tokens drafted per step' },
            ],
            worked: [
              { tex: String.raw`\alpha = 0.8,\ \gamma = 4 \Rightarrow \frac{1 - 0.328}{0.2} = 3.36`, caption: '3.36 tokens per large-model pass instead of 1' },
              { tex: String.raw`\alpha = 0.5,\ \gamma = 4 \Rightarrow \frac{1 - 0.031}{0.5} = 1.94`, caption: 'a poorly matched draft model halves the benefit' },
            ],
            note: 'The gain depends entirely on how well the draft model agrees with the large one. A mismatched pair can be slower than no speculation at all.',
          },
        ],
      },
      {
        id: 'gen-rag',
        label: 'Settings for RAG specifically',
        kind: 'tradeoff',
        summary: 'Low temperature, greedy, short outputs',
        detail: [
          'RAG is an extraction-and-synthesis task, not a creative one. The answer should be determined by the retrieved context, so the sampling settings that make chat feel natural are actively harmful here.',
          'Temperature 0 or near it, greedy decoding, and an explicit length cap. Any variance in the output that is not variance in the context is, by definition, the model inventing.',
        ],
      },
      {
        id: 'gen-fail',
        label: 'Generation failure modes',
        kind: 'pitfall',
        summary: 'Three distinct failures with different fixes',
        detail: [
          'Ignoring the context and answering from parametric memory, usually a prompt problem, fixed by stronger grounding instructions.',
          'Blending context with parametric knowledge, producing an answer that is partly grounded and partly invented. The hardest to detect, because the grounded parts check out. This is what faithfulness evaluation is for.',
          'Refusing despite adequate context, over-correction from an aggressive grounding instruction. Check this whenever you tighten the prompt to fix the first failure, since the two trade against each other.',
        ],
      },
    ],
    trace: { headline: 'Answer generated', payload: 'FAISS is a similarity-search library; HNSW is an\nindexing algorithm. They are not alternatives, FAISS\nimplements HNSW as one of its available index types...', mono: true, note: 'Greedy, T = 0. 187 output tokens.' },
  },

  {
    id: 'postprocess',
    icon: 'checkdoc',
    label: 'Post-processing',
    phase: 'online',
    kind: 'sequential',
    ordinal: '10',
    tagline: 'Format, validate, cite',
    code: [
      {
        title: 'LangChain',
        language: 'python',
        code: `from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI

class Answer(BaseModel):
    text: str
    citations: list[int] = Field(description="ids of the chunks used")

# Constrained decoding: the model cannot emit output off this schema,
# so there is no parse-and-retry loop.
structured = ChatOpenAI(model="gpt-4o").with_structured_output(Answer)`,
        note: 'with_structured_output uses the provider\'s constrained decoding where available, falling back to function-calling otherwise.',
      },
    ],
    detail: [
      '**Shape the raw output into what the caller expects:**',
      '- **Format** as Markdown, JSON, or XML.',
      '- **Validate** structured output against a schema (e.g., a Pydantic model).',
      '- **Attach citations** back to the chunks that supported each claim.',
      '**Validation belongs here rather than in the caller.** A schema failure is recoverable—you can retry generation with the error appended. Once the response has left the pipeline, it is not.',
    ],
    math: [
      {
        title: 'Retry budget',
        tex: String.raw`P(\text{success within } r) = 1 - (1 - p)^{r}`,
        where: [{ sym: String.raw`p`, means: 'per-attempt probability of producing valid output' }],
        worked: [
          { tex: String.raw`p = 0.85,\ r = 2 \Rightarrow 1 - 0.0225 = 0.978` },
          { tex: String.raw`p = 0.85,\ r = 3 \Rightarrow 1 - 0.0034 = 0.997` },
        ],
        note: 'Retries are independent only if you feed the validation error back in, otherwise the model tends to reproduce the same malformed output and the retries are wasted.',
      },
    ],
    concepts: [
      {
        id: 'post-verify',
        label: 'Citation verification',
        kind: 'method',
        summary: 'Check the cited chunk actually supports the claim',
        detail: [
          'Models cite plausibly and incorrectly, pointing at chunk [2] for a claim that appears in [3], or citing a chunk that supports nothing in the sentence. An unverified citation is worse than none, because it manufactures the appearance of grounding.',
          'Verify mechanically: for each cited span, check the claim is entailed by that specific chunk, either by string overlap for extractive answers or a small entailment model for paraphrased ones. Strip or flag citations that fail.',
        ],
      },
      {
        id: 'post-structured',
        label: 'Structured output',
        kind: 'method',
        summary: 'Schema validation and constrained decoding',
        detail: [
          '**Post-hoc validation** catches malformed output after paying for the full generation.',
          '**Constrained decoding** prevents it by masking tokens that would violate the grammar at each step. The model cannot emit invalid JSON because those tokens have zero probability.',
          'Constrained decoding is strictly better where supported, since it eliminates the retry loop entirely. Where it is not, validate against the schema and retry with the error message included.',
        ],
        stack: [
          { name: 'Pydantic', what: 'Data validation using Python type hints', url: 'https://docs.pydantic.dev/' },
          { name: 'Instructor', what: 'Structured extraction for LLMs', url: 'https://python.useinstructor.com/' },
          { name: 'Outlines', what: 'Generative model structured decoding', url: 'https://outlines-dev.github.io/outlines/' },
          { name: 'Zod', what: 'TypeScript-first schema validation', url: 'https://zod.dev/' },
        ],
      },
      {
        id: 'post-safety',
        label: 'Leakage checks',
        kind: 'pitfall',
        summary: 'Retrieved context can carry things the user may not see',
        detail: [
          'Retrieval respects the index, not your access-control model. If chunks were retrieved without a permission filter, the answer can surface content the user is not entitled to, and it will be fluent and well-cited.',
          'Enforce permissions at retrieval via metadata filters, then re-check at post-processing that every cited chunk is one this user may see. Defence in depth, because the retrieval filter is the kind of thing that silently breaks.',
        ],
      },
    ],
    trace: { headline: 'Formatted and cited', payload: 'FAISS is a similarity-search library [1]; HNSW is an\nindexing algorithm [2]. They are not alternatives, \nFAISS implements HNSW as an index type [1][3].', mono: true, note: 'All three citations verified against their chunks.' },
  },

  {
    id: 'evaluation',
    icon: 'gauge',
    label: 'Generation Evaluation',
    phase: 'online',
    kind: 'optional',
    ordinal: '11',
    tagline: 'Is the answer supported by what we retrieved?',
    code: [
      {
        title: 'RAGAS',
        language: 'python',
        code: `from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy

# faithfulness = fraction of answer claims entailed by the retrieved context.
scores = evaluate(dataset, metrics=[faithfulness, answer_relevancy])`,
        note: 'RAGAS and LangChain\'s evaluators wrap an LLM-as-judge. Use a different model from the generator to avoid self-preference bias.',
      },
    ],
    detail: [
      'Score the response before it ships. This is the generation-side counterpart to the retrieval metrics earlier: those asked whether the right evidence was found, these ask whether the answer actually used it.',
      'Four dimensions. Grounding and faithfulness ask whether the answer is supported by the retrieved context. Relevance asks whether it addresses the question. Completeness asks whether anything was left out.',
      'Faithfulness is the one that matters most, because an answer can be fluent, relevant and complete while being entirely unsupported by anything you retrieved, and that failure is invisible to every other check.',
    ],
    stack: [
      { name: 'Ragas', what: 'RAG evaluation framework (faithfulness, relevance, context)', url: 'https://docs.ragas.io/' },
      { name: 'DeepEval', what: 'LLM-as-judge evaluation with 14+ metrics', url: 'https://docs.confident-ai.com/' },
      { name: 'TruLens', what: 'Evaluation and tracing for LLM apps', url: 'https://www.trulens.org/' },
      { name: 'Phoenix (Arize)', what: 'LLM observability with eval traces', url: 'https://phoenix.arize.com/' },
    ],
    math: [
      {
        title: 'Faithfulness as claim-level support',
        tex: String.raw`F = \frac{|\{c \in C : \text{context} \models c\}|}{|C|}`,
        where: [
          { sym: String.raw`C`, means: 'atomic claims extracted from the generated answer' },
          { sym: String.raw`\models`, means: 'is entailed by' },
        ],
        worked: [
          { tex: String.raw`F = \frac{11}{12} = 0.917`, caption: 'one of twelve claims is unsupported' },
        ],
        note: 'Decomposing into atomic claims is what makes this actionable. A single score for a paragraph tells you it is 0.7 faithful; a claim-level score tells you exactly which sentence to remove.',
      },
      {
        title: 'Answer relevance',
        tex: String.raw`R_{\text{ans}} = \frac{1}{m}\sum_{i=1}^{m} \cos\!\big(e_{q}, e_{q_i'}\big)`,
        where: [{ sym: String.raw`q_i'`, means: 'questions reverse-generated from the answer' }],
        note: 'Generate the questions the answer would answer, then measure how close they are to the one actually asked. A high score means the answer is on target; a low one means it answered something adjacent.',
      },
      {
        title: 'Context precision, was the good evidence ranked first?',
        tex: String.raw`\text{CP@}K = \frac{\sum_{k=1}^{K} P@k \cdot v_k}{\sum_{k=1}^{K} v_k}`,
        where: [{ sym: String.raw`v_k`, means: '1 if chunk k was actually used in the answer' }],
        note: 'Bridges the two halves of evaluation: it measures whether the chunks the answer relied on were the ones ranked highest, which is a direct readout on the reranker.',
      },
    ],
    example: {
      beforeLabel: 'Judge receives',
      before: 'Original query\nRetrieved context\nGenerated answer',
      afterLabel: 'Scores',
      after: 'Grounding\nFaithfulness\nRelevance\nCompleteness',
      mono: true,
    },
    tradeoffs: { gains: ['Catches unsupported claims before the user sees them', 'Produces a quality signal you can track over time', 'Localises failure when paired with retrieval metrics'], costs: ['Another LLM call in the critical path', 'The judge has its own failure modes', 'Cost roughly doubles per query if run inline'] },
    concepts: [
      {
        id: 'ev-judge',
        label: 'LLM-as-a-judge',
        kind: 'method',
        summary: 'And where it is unreliable',
        detail: [
          'Give a model the query, the context and the answer, and ask it to score each dimension with a justification. It correlates reasonably with human judgement and costs a fraction of the price.',
          'Its biases are well documented and worth designing around. Position bias: in pairwise comparisons the first option wins more often, so randomise order. Verbosity bias: longer answers score higher regardless of quality. Self-preference: models rate their own generations above others, so the judge should ideally be a different model from the generator.',
        ],
        children: [
          {
            id: 'ev-claim',
            label: 'Claim-level entailment',
            kind: 'method',
            summary: 'Decompose, then check each piece',
            detail: [
              'Split the answer into atomic claims, then check each against the context independently. Far more reliable than asking for a holistic score, because each judgement is small and local.',
              'It also produces something you can act on: the specific unsupported sentence, which can be stripped, flagged, or used to trigger a regeneration.',
            ],
          },
        ],
      },
      {
        id: 'ev-split',
        label: 'Retrieval vs. generation failure',
        kind: 'idea',
        summary: 'Two numbers localise the bug',
        detail: [
          'High recall with low faithfulness means the evidence was there and the model ignored it, a prompting or model problem.',
          'Low recall with high faithfulness means the model faithfully used the wrong context, a retrieval problem, and no amount of prompt engineering will fix it.',
          'This is the payoff for measuring both halves separately. A single end-to-end quality score cannot distinguish these, and they have nothing in common as far as the fix is concerned.',
        ],
      },
      {
        id: 'ev-online',
        label: 'Inline or offline?',
        kind: 'tradeoff',
        summary: 'Blocking evaluation doubles latency',
        detail: [
          'Running the judge inline lets you catch a bad answer before it ships, regenerate, or fall back to an abstention. It also adds a full LLM call to every request.',
          'The common compromise: sample a few percent of traffic for offline evaluation to track quality trends, and run inline checks only on high-stakes paths where a wrong answer is expensive.',
        ],
      },
    ],
    trace: { headline: 'Answer scored', payload: 'Grounding      0.94\nFaithfulness   0.91\nRelevance      0.97\nCompleteness   0.88', mono: true, note: 'Above threshold, released to the user.' },
  },

  {
    id: 'final',
    icon: 'check',
    label: 'Final Response',
    phase: 'online',
    kind: 'terminal',
    tagline: 'Delivered to the user',
    detail: ['Everything upstream existed to make this answer both correct and attributable.'],
    trace: { headline: 'Delivered', payload: 'FAISS is a similarity-search library [1]; HNSW is an\nindexing algorithm [2]. They are not alternatives, \nFAISS implements HNSW as an index type [1][3].', mono: true },
  },
]
