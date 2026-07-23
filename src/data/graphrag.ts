/*
 * Content for the GraphRAG walkthrough.
 *
 * Grounded in the worked example from ALucek/GraphRAG-Breakdown, which indexes
 * the survey paper "The Ultimate Guide to Fine-Tuning LLMs from Basics to
 * Breakthroughs". Entity names, types, relationship strengths, the extraction
 * output format and the community-report shape follow Microsoft GraphRAG.
 */

export type CommunityId = 'eval' | 'privacy' | 'safety' | 'peft'

export const COMMUNITIES: Record<
  CommunityId,
  { name: string; color: string; light: string; rank: number; title: string; summary: string; findings: string[] }
> = {
  eval: {
    name: 'Evaluation & Metrics',
    color: '#2f6f4e',
    light: '#d8e8de',
    rank: 8.5,
    title: 'Evaluation Metrics for Fine-Tuned Models',
    summary:
      'This community covers the metrics used to judge a fine-tuned model, centred on cross-entropy and perplexity, and how hyperparameter choices are driven by them.',
    findings: [
      'Cross-entropy is the core training objective and doubles as an evaluation metric.',
      'Perplexity is the exponentiated cross-entropy, so the two move together.',
      'Hyperparameters such as learning rate and batch size are tuned against these metrics.',
    ],
  },
  peft: {
    name: 'Parameter-Efficient Fine-Tuning',
    color: '#8a6a3c',
    light: '#ece0cd',
    rank: 8.0,
    title: 'LoRA and Parameter-Efficient Adaptation',
    summary:
      'Low-rank adaptation methods let large language models be fine-tuned by training a small number of added parameters instead of the full weight matrix.',
    findings: [
      'LoRA injects trainable low-rank matrices while freezing base weights.',
      'QLoRA adds 4-bit quantisation, cutting memory further.',
      'These methods make single-GPU fine-tuning of large models practical.',
    ],
  },
  privacy: {
    name: 'Privacy & Federated Learning',
    color: '#41708c',
    light: '#d5e3ec',
    rank: 7.5,
    title: 'Differential Privacy in Federated Fine-Tuning',
    summary:
      'Federated learning combined with differential privacy allows models to be adapted on sensitive data, notably in healthcare, without centralising it.',
    findings: [
      'LLMs generate synthetic samples mimicking private client distributions under differential privacy.',
      'This boosts small language model performance by roughly 5%.',
      'Healthcare is the recurring application domain for this pattern.',
    ],
  },
  safety: {
    name: 'Safety & Moderation',
    color: '#96565f',
    light: '#eddadd',
    rank: 8.2,
    title: 'Adversarial Robustness and Content Moderation',
    summary:
      'A cluster of tooling and datasets aimed at making model interactions safe, built around the ARD moderation tool and the WildGuard Mix3 dataset.',
    findings: [
      'ARD addresses three critical moderation tasks for LLM interactions.',
      'WildGuard Mix3 contains 92,000 labelled examples of benign prompts and adversarial attempts.',
      'Adversarial training hardens models against those attempts.',
    ],
  },
}

export interface Entity {
  id: string
  label: string
  type: string
  description: string
  community: CommunityId
  /** degree-ish weight, drives node size */
  weight: number
}

export const ENTITIES: Entity[] = [
  { id: 'evalmetrics', label: 'EVALUATION METRICS', type: 'evaluation metrics', description: 'Criteria used to assess the performance of AI models.', community: 'eval', weight: 9 },
  { id: 'crossentropy', label: 'CROSS-ENTROPY', type: 'evaluation metrics', description: 'A key metric quantifying the difference between predicted and actual distributions.', community: 'eval', weight: 8 },
  { id: 'perplexity', label: 'PERPLEXITY', type: 'evaluation metrics', description: 'Exponentiated cross-entropy; measures how well a model predicts a sample.', community: 'eval', weight: 6 },
  { id: 'hyperparams', label: 'HYPERPARAMETERS', type: 'hyperparameters', description: 'Key settings such as learning rate and batch size.', community: 'eval', weight: 7 },

  { id: 'lora', label: 'LORA', type: 'technique', description: 'Low-rank adaptation; trains small injected matrices instead of full weights.', community: 'peft', weight: 9 },
  { id: 'qlora', label: 'QLORA', type: 'technique', description: 'LoRA combined with 4-bit quantisation of the frozen base model.', community: 'peft', weight: 6 },
  { id: 'llm', label: 'LARGE LANGUAGE MODELS', type: 'large language model', description: 'The models being fine-tuned throughout the survey.', community: 'peft', weight: 10 },

  { id: 'dp', label: 'DIFFERENTIAL PRIVACY', type: 'privacy', description: 'Formal guarantee limiting what can be inferred about any individual record.', community: 'privacy', weight: 8 },
  { id: 'federated', label: 'FEDERATED LEARNING', type: 'federated learning', description: 'Training across decentralised clients without centralising their data.', community: 'privacy', weight: 8 },
  { id: 'healthcare', label: 'HEALTHCARE', type: 'healthcare', description: 'Primary domain where privacy-preserving fine-tuning is applied.', community: 'privacy', weight: 6 },

  { id: 'ard', label: 'ARD', type: 'open-source tool', description: 'Tool addressing three critical moderation tasks.', community: 'safety', weight: 7 },
  { id: 'wildguard', label: 'WILDGUARD MIX3', type: 'dataset', description: '92,000 labelled examples including benign prompts and adversarial attempts.', community: 'safety', weight: 7 },
  { id: 'advtrain', label: 'ADVERSARIAL TRAINING', type: 'adversarial training', description: 'Training on adversarial examples to harden model behaviour.', community: 'safety', weight: 6 },
]

export interface Rel {
  source: string
  target: string
  description: string
  strength: number
}

export const RELATIONSHIPS: Rel[] = [
  { source: 'crossentropy', target: 'perplexity', description: 'Both metrics evaluate LLM performance.', strength: 7 },
  { source: 'hyperparams', target: 'evalmetrics', description: 'Adjusted based on metrics to optimize performance.', strength: 8 },
  { source: 'crossentropy', target: 'evalmetrics', description: 'Cross-entropy is a core evaluation metric.', strength: 9 },
  { source: 'perplexity', target: 'llm', description: 'Perplexity is reported when benchmarking language models.', strength: 6 },
  { source: 'ard', target: 'llm', description: 'Designed to enhance safety of interactions.', strength: 8 },
  { source: 'ard', target: 'wildguard', description: 'ARD is trained and evaluated on the WildGuard Mix3 dataset.', strength: 9 },
  { source: 'wildguard', target: 'advtrain', description: 'The dataset supplies adversarial examples used in training.', strength: 7 },
  { source: 'advtrain', target: 'llm', description: 'Adversarial training hardens language models.', strength: 6 },
  { source: 'dp', target: 'federated', description: 'Differential privacy is applied within federated pipelines.', strength: 9 },
  { source: 'federated', target: 'healthcare', description: 'Federated learning is used on distributed clinical data.', strength: 8 },
  { source: 'dp', target: 'llm', description: 'LLMs generate synthetic samples under differential privacy.', strength: 7 },
  { source: 'lora', target: 'llm', description: 'LoRA is the dominant method for adapting large models.', strength: 9 },
  { source: 'qlora', target: 'lora', description: 'QLoRA extends LoRA with quantisation.', strength: 9 },
  { source: 'lora', target: 'hyperparams', description: 'Rank and alpha are LoRA-specific hyperparameters.', strength: 6 },
]

/* ── the source document, rendered as a real page ───────────────────────── */

export const PAPER = {
  title: 'The Ultimate Guide to Fine-Tuning LLMs',
  subtitle: 'From Basics to Breakthroughs: An Exhaustive Review of Technologies, Research, Best Practices, and Applied Research Challenges',
  section: '6.4  Privacy-Preserving Adaptation',
  paragraphs: [
    'Recent work explores using LLMs to create synthetic samples that mimic clients’ private data distribution using differential privacy. This approach significantly boosts SLMs’ performance by approximately 5% while never exposing the underlying records.',
    'In the federated setting each client holds a disjoint shard. Updates are aggregated centrally, so the raw text never leaves the institution, which is what makes the pattern viable in healthcare.',
    'Evaluation follows the usual objectives. Cross-entropy remains the training loss, and perplexity, its exponentiated form, is reported for comparability across model sizes.',
    'Hyperparameters, in particular learning rate and batch size, are tuned against these metrics rather than chosen a priori.',
  ],
}

export const CHUNKING = {
  splitter: 'TokenTextSplitter',
  size: 1200,
  overlap: 100,
}

/* ── prompts and model output, shown in the bottom card ─────────────────── */

export const EXTRACTION_PROMPT = `-Goal-
Given a text document and a list of entity types, identify all entities of
those types and all relationships among the identified entities.

-Steps-
1. Identify all entities. For each, extract:
   - entity_name: capitalized name of the entity
   - entity_type: one of [large language model, evaluation metrics,
     hyperparameters, dataset, open-source tool, federated learning,
     differential privacy, healthcare, adversarial training, technique, ...]
   - entity_description: comprehensive description of attributes and activities
   Format: ("entity"{tuple_delimiter}<name>{tuple_delimiter}<type>{tuple_delimiter}<description>)

2. From the entities in step 1, identify all pairs that are *clearly related*.
   For each pair extract:
   - source_entity, target_entity
   - relationship_description: why they are related
   - relationship_strength: an integer score 1-10
   Format: ("relationship"{tuple_delimiter}<source>{tuple_delimiter}<target>{tuple_delimiter}<description>{tuple_delimiter}<strength>)

3. Return output as a single list, delimited by {record_delimiter}.
4. When finished, output {completion_delimiter}

######################
-Real Data-
Entity_types: {entity_types}
Text: {input_text}
######################
Output:`

export const EXTRACTION_OUTPUT = `("entity"<|>EVALUATION METRICS<|>evaluation metrics<|>Criteria used to
assess the performance of AI models)
##
("entity"<|>CROSS-ENTROPY<|>evaluation metrics<|>A key metric quantifying
the difference between predicted and actual distributions)
##
("entity"<|>PERPLEXITY<|>evaluation metrics<|>Exponentiated cross-entropy;
measures how well a model predicts a sample)
##
("entity"<|>HYPERPARAMETERS<|>hyperparameters<|>Key settings like learning
rate and batch size)
##
("entity"<|>DIFFERENTIAL PRIVACY<|>differential privacy<|>Formal guarantee
limiting what can be inferred about any individual record)
##
("relationship"<|>CROSS-ENTROPY<|>PERPLEXITY<|>Both metrics evaluate LLM
performance<|>7)
##
("relationship"<|>HYPERPARAMETERS<|>EVALUATION METRICS<|>Adjusted based on
metrics to optimize performance<|>8)
##
("relationship"<|>DIFFERENTIAL PRIVACY<|>LARGE LANGUAGE MODELS<|>LLMs
generate synthetic samples under differential privacy<|>7)
<|COMPLETE|>`

export const MERGE_EXAMPLE = `# CROSS-ENTROPY appeared in 3 chunks with 3 descriptions:

chunk_04  "A key metric quantifying the difference between predicted
           and actual distributions"
chunk_11  "The standard training loss for language modelling"
chunk_19  "Loss whose exponentiated form gives perplexity"

# The LLM summarises them into one canonical description, and the
# duplicate nodes collapse into a single graph node:

CROSS-ENTROPY (evaluation metrics)
  "The standard language-modelling training loss, quantifying the
   difference between predicted and actual token distributions; its
   exponentiated form is perplexity."
  degree: 3   source_chunks: [04, 11, 19]`

export const NODE2VEC_CODE = `# Random walks over the graph, then skip-gram over the walks.
from node2vec import Node2Vec

n2v = Node2Vec(
    graph,
    dimensions=1536,   # embedding width
    walk_length=40,    # steps per random walk
    num_walks=10,      # walks started per node
    p=1.0, q=1.0,      # return / in-out bias
)
model = n2v.fit(window=10, min_count=1)

model.wv["CROSS-ENTROPY"]
# array([ 0.0412, -0.1180,  0.0733, ... ])  # 1536-d`

export const REPORT_PROMPT = `-Goal-
Write a comprehensive report of a community, given a list of entities that
belong to the community as well as their relationships.

The report will be used to inform decision-makers about information
associated with the community and their potential impact.

-Report Structure-
  - TITLE: short specific name representing the community's key entities
  - SUMMARY: an executive summary of the community's overall structure
  - IMPACT SEVERITY RATING: a float 0-10 representing importance
  - RATING EXPLANATION: a single sentence explaining the rating
  - DETAILED FINDINGS: 5-10 key insights, each with a summary and
    several paragraphs of grounded explanation

Return output as a well-formed JSON string.`

export const REPORT_OUTPUT = `{
  "title": "Evaluation Metrics for Fine-Tuned Models",
  "summary": "This community covers the metrics used to judge a
    fine-tuned model, centred on cross-entropy and perplexity, and
    how hyperparameter choices are driven by them.",
  "rating": 8.5,
  "rating_explanation": "These metrics gate every training decision,
    so their impact on outcomes is high.",
  "findings": [
    {
      "summary": "Cross-entropy is both objective and metric",
      "explanation": "Cross-entropy is the core training objective
        and doubles as an evaluation metric [Data: Entities (12);
        Relationships (7, 9)]..."
    },
    {
      "summary": "Perplexity moves with cross-entropy",
      "explanation": "Perplexity is the exponentiated cross-entropy,
        so the two are monotonically related [Data: Relationships (7)]..."
    }
  ],
  "level": 0,
  "size": 4
}`

export const LOCAL_PROMPT = `---Role---
You are a helpful assistant responding about data in the tables provided.

---Goal---
Generate a response that responds to the user's question, summarizing all
information in the input data tables appropriate for the response length,
and incorporating any relevant general knowledge.

---Data tables---
Entities:      id | entity | description | number of relationships
Relationships: id | source | target | description | weight
Sources:       id | text                      <- original chunks
Reports:       id | title | content           <- community reports`

export const GLOBAL_PROMPT = `---Role--- (MAP step, run once per community report batch)
Generate a response consisting of a list of key points, each with a
description and an integer importance score 0-100.

Return JSON: {"points": [{"description": "...", "score": 85}, ...]}

---Role--- (REDUCE step)
Given the analysts' key points from every community, remove irrelevant
points, merge duplicates, and synthesise a single response, preserving
the data references [Data: Reports (2, 7, 34)].`

/* ── DRIFT search ───────────────────────────────────────────────────────
 * Dynamic Reasoning and Inference with Flexible Traversal. Microsoft's third
 * search mode: a global-flavoured primer over community reports, then a
 * refinement loop of local searches over the follow-up questions it raised.
 */

export const DRIFT_FLOW = `# 1. Retrieve the primer's community reports
#    The query is embedded and looked up against the embedded community
#    reports; the top-k most similar come back. Microsoft's announcement
#    describes expanding the query with HyDE first, writing a hypothetical
#    answer, on the reasoning that a written passage sits closer in vector
#    space to real corpus text than a bare question does. The docs site
#    describes only the embed-and-look-up half.

q_vec   = embed(hyde_expand(query))
reports = community_vectors.search(q_vec, k=drift_k_followups)

# 2. Primer
#    Those reports produce a broad initial answer plus a set of follow-up
#    questions. This is global-STYLE, not a run of global search: it reads
#    a handful of reports rather than mapping over all of them, which is
#    exactly why it costs a fraction of the price.

primer     = llm.invoke(PRIMER_PROMPT, reports=reports)
answer_0   = primer["answer"]
follow_ups = primer["follow_up_questions"]
# e.g. ["What are the memory costs of QLoRA vs LoRA?",
#       "Which evaluation metrics distinguish the two?", ...]

# 3. Refinement loop
#    Each follow-up drives a local-STYLE retrieval: entity and relationship
#    detail augmented with community context, carrying state between rounds
#    rather than re-invoking standalone local search. Each returns an
#    intermediate answer and its own new follow-ups.

for _ in range(n_depth):                 # configurable, not fixed at two
    for q in follow_ups:
        node        = drift_local_step(q, state)
        answers    += [node.answer]
        next_round += node.follow_up_questions
    follow_ups = next_round

# 4. Synthesis
#    The result is a hierarchy of question/answer nodes ranked by relevance
#    to the original query, reduced into one response. This is a final
#    synthesis over that hierarchy, not the map-reduce global search runs.
#    (Microsoft describe a naive map-reduce over equally weighted answers
#    during benchmark testing.)

final = llm.invoke(REDUCE_PROMPT, answers=answers)

# Depth is a config value: n_depth, with drift_k_followups and
# primer_folds alongside it. The original announcement said the loop was
# "currently configured for two iterations"; the shipped library exposes
# the setting, and Microsoft's own example notebook uses n_depth=3.
# A learned reward function for smarter termination is still future work.`

export const DRIFT_OUTPUT = `SUCCESS: DRIFT Search Response:

# Understanding the Choice Between RAG, Fine-Tuning, and PEFT Approaches

When a company is faced with the decision to choose between
Retrieval-Augmented Generation (RAG), fine-tuning, and various
Parameter-Efficient Fine-Tuning (PEFT) approaches, several factors must be
taken into account, determined by the specific application requirements and
resource availability.

## Retrieving Capabilities with RAG

RAG is particularly advantageous in scenarios where it is crucial to
integrate external information into language models for enhanced accuracy
and relevance. It is highly recommended for applications like question and
answer systems, customer support, and summarization tasks, where real-time
context retrieval from large datasets improves response precision without
needing extensive and expensive model retraining. The strength of RAG lies
in its ability to quickly adapt to various knowledge domains by leveraging
existing data without modifying the underlying language model
significantly.

## The Focus and Depth of Fine-Tuning

Traditional fine-tuning is the go-to choice when a clear, defined
improvement in task performance is needed using domain-specific datasets.
It involves re-calibrating a pre-trained model's parameters to cater
precisely to industry-specific or task-specific requirements. This approach
can enhance performance metrics significantly but incurs high computational
costs and demands substantial amounts of fine-tuning data, making it ideal
for well-funded projects aiming for precise task ...`

/* ── report vs summary ──────────────────────────────────────────────────
 * GraphRAG writes two artifacts per community. `full_content` is the long
 * structured report; `summary` is a short summary *of that report*, and the
 * summary is the one that gets embedded and read back by global search.
 */

export const REPORT_VS_SUMMARY = `# Both live in the same frame, as two columns:

list(community_reports.columns)
# ['id', 'human_readable_id', 'community', 'parent', 'level', 'title',
#  'summary', 'full_content', 'rank', 'rating_explanation', 'findings', ...]


# ── full_content: the generated report, several hundred words ───────────

print(community_reports["full_content"][0])

  # Amazon Bedrock and AI Model Providers

  The community is centered around Amazon Bedrock, a service by AWS that
  facilitates access to foundation models from various AI innovators...

  ## Amazon Bedrock as a central service

  Amazon Bedrock is a pivotal service within the AWS ecosystem, designed
  to simplify access to high-performing foundation models for generative
  AI applications. It integrates seamlessly with other AWS services...
  [Data: Entities (206); Relationships (281, 326, 327)].

  ## AI21 Labs contribution to Amazon Bedrock
  ...one section per finding, each with its own grounded explanation...


# ── summary: a summary *of that report*, one paragraph ──────────────────

print(community_reports["summary"][0])

  The community is centered around Amazon Bedrock, a service by AWS that
  facilitates access to foundation models from various AI innovators. Key
  entities include AI21 Labs, Anthropic, Cohere, Mistral AI, and
  Stability AI, all of which provide models accessible through Amazon
  Bedrock. The service integrates with AWS infrastructure, including AWS
  Lambda and AWS SageMaker, to support scalable AI model deployment.


# The summary is what gets embedded and stored in LanceDB. Global search
# maps over summaries, not over full_content, which is what keeps the
# number of map calls affordable. full_content is pulled in only when a
# report is actually selected.`
