/*
 * The GraphRAG walkthrough as one continuous notebook session.
 *
 * Cells are numbered 1..15 in execution order across the whole walkthrough,
 * so the strip shown under each stage is a slice of a single running kernel:
 * cell 3 needs `texts` from cell 1, cell 10 needs `community_reports` from
 * cell 9, and so on.
 *
 * Code and captured output come from ALucek/GraphRAG-Breakdown. Long outputs
 * are abridged, marked with a trailing ellipsis; nothing is invented. Cells
 * that print nothing carry a `note` instead of an output block.
 */

export interface NotebookCell {
  n: number
  code: string
  /** captured stdout or repr, verbatim but abridged */
  out?: string
  /** shown instead of an output block when the cell prints nothing */
  note?: string
  /** names this cell expects to already exist in the kernel */
  needs?: string
  /** shown beside the output once the cell has been run */
  explain: string
}

const CELL_15_OUT = `SUCCESS: DRIFT Search Response:

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
needing extensive and expensive model retraining.

## The Focus and Depth of Fine-Tuning

Traditional fine-tuning is the go-to choice when a clear, defined
improvement in task performance is needed using domain-specific datasets.
It involves re-calibrating a pre-trained model's parameters to cater
precisely to industry-specific or task-specific requirements. This approach
can enhance performance metrics significantly but incurs high computational
costs and demands substantial amounts of fine-tuning data ...`

export const NOTEBOOK_REPO = 'github.com/ALucek/GraphRAG-Breakdown'
export const NOTEBOOK_TOTAL = 15

const CELL_1 = `from langchain_text_splitters import TokenTextSplitter

with open("./ragtest/input/ft_guide.txt", 'r') as file:
    content = file.read()

text_splitter = TokenTextSplitter(chunk_size=1200, chunk_overlap=100)

texts = text_splitter.split_text(content)`

const CELL_2 = `from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(temperature=0.0, model="gpt-4o")

prompt_template = """
-Goal-
Given a text document that is potentially relevant to this activity and a
list of entity types, identify all entities of those types from the text
and all relationships among the identified entities.
...
-Real Data-
entity_types: [large language model, differential privacy, federated
learning, healthcare, adversarial training, security measures, ...]
text: {input_text}
output:
"""

prompt = ChatPromptTemplate.from_template(prompt_template)
chain = prompt | llm | StrOutputParser()`

const CELL_4_OUT = `("entity"{tuple_delimiter}EVALUATION METRICS{tuple_delimiter}evaluation
metrics{tuple_delimiter}Evaluation metrics are used to measure the
performance of AI models, including metrics like cross-entropy,
perplexity, factuality, and context relevance)
{record_delimiter}
("entity"{tuple_delimiter}CROSS-ENTROPY{tuple_delimiter}evaluation
metrics{tuple_delimiter}Cross-entropy is a key metric for evaluating
large language models (LLMs) during training or fine-tuning, quantifying
the difference between predicted and actual data distributions)
{record_delimiter}
("entity"{tuple_delimiter}PERPLEXITY{tuple_delimiter}evaluation
metrics{tuple_delimiter}Perplexity measures how well a probability
distribution or model predicts a sample, indicating the model's
uncertainty about the next word in a sequence)
...`

const CELL_5_OUT = [
  '                                     id  human_readable_id  title  \\',
  '0  e3a7f24b-88b6-4481-b3a7-c35075a9671f                  0  GPT-3',
  '1  f55cae4e-dd0d-47a2-912b-f7680147dd31                  1  GPT-4',
  '2  f3e3e46b-6746-45a7-9a26-1432f14c45e4                  2   BERT',
  '',
  '           type                                        description  \\',
  '0  ORGANIZATION  GPT-3 is a large language model developed by O...',
  '1  ORGANIZATION  GPT-4 is an advanced large language model deve...',
  '2  ORGANIZATION  BERT, which stands for Bidirectional Encoder R...',
  '',
  '                                       text_unit_ids',
  '0  [ca73c495111f5cadd87e6a7a01aed66647ae6623fdf41...',
  '1  [ca73c495111f5cadd87e6a7a01aed66647ae6623fdf41...',
  '2  [ca73c495111f5cadd87e6a7a01aed66647ae6623fdf41...',
].join('\n')

const CELL_6_OUT = [
  '  source                                             target  \\',
  '0  GPT-3                                              GPT-4',
  '1  GPT-3                                            CHATGPT',
  '2  GPT-3                                               BERT',
  '3  GPT-3  REINFORCEMENT LEARNING FROM HUMAN FEEDBACK (RLHF)',
  '',
  '                                         description  weight  combined_degree',
  '0  GPT-4 is an advanced version of GPT-3, buildin...     8.0               20',
  '1  ChatGPT is based on the GPT architecture, spec...     7.0               14',
  '2  Both BERT and GPT-3 are pre-trained language m...     6.0               18',
  '3  RLHF is used in training GPT-3 to refine its o...     7.0               13',
].join('\n')

const CELL_7_OUT = [
  '   human_readable_id  title  community  level  degree         x         y',
  '0                  0  GPT-3          8      0      12 -4.875545  4.017587',
  '1                  0  GPT-3         43      1      12 -4.875545  4.017587',
  '2                  1  GPT-4          8      0       8 -4.561064  1.505724',
  '3                  1  GPT-4         46      1       8 -4.561064  1.505724',
  '4                  2   BERT          8      0       6 -5.710580  3.546957',
  '5                  2   BERT         44      1       6 -5.710580  3.546957',
  '6                  3   PALM          8      0       3 -5.309392  1.548029',
  '7                  3   PALM         46      1       3 -5.309392  1.548029',
  '8                  4  LLAMA          3      0       4 -6.644573  0.421999',
  '9                  4  LLAMA         27      1       4 -6.644573  0.421999',
].join('\n')

const CELL_8_OUT = [
  '   title  community  degree         x         y',
  '0  GPT-3          8      12 -4.875545  4.017587',
  '2  GPT-4          8       8 -4.561064  1.505724',
  '4   BERT          8       6 -5.710580  3.546957',
  '6   PALM          8       3 -5.309392  1.548029',
  '8  LLAMA          3       4 -6.644573  0.421999',
].join('\n')

const CELL_9_OUT = [
  '   community  parent  level                                       title  \\',
  '0         61      32      2       Amazon Bedrock and AI Model Providers',
  '1         62      32      2                 AWS and SageMaker JumpStart',
  '2         14       0      1  PPO for LLM Alignment and Reinforcement L...',
  '3         15       0      1          HuggingFace and Advanced NLP Tools',
  '4         16       0      1         OpenAI and AI Development Platforms',
  '',
  '                                             summary  \\',
  '0  The community is centered around Amazon Bedroc...',
  '1  The community is centered around Amazon Web Se...',
  '2  The community centers around the study \'PPO fo...',
  '3  The community is centered around HuggingFace, ...',
  '4  The community is centered around OpenAI, a lea...',
  '',
  '                                        full_content  rank',
  '0  # Amazon Bedrock and AI Model Providers\\n\\nThe...   8.5',
  '1  # AWS and SageMaker JumpStart\\n\\nThe community...   8.5',
  '2  # PPO for LLM Alignment and Reinforcement Lear...   7.5',
  '3  # HuggingFace and Advanced NLP Tools\\n\\nThe co...   8.5',
  '4  # OpenAI and AI Development Platforms\\n\\nThe c...   8.5',
].join('\n')

const CELL_10_OUT = `# Amazon Bedrock and AI Model Providers

The community is centered around Amazon Bedrock, a service by AWS that
facilitates access to foundation models from various AI innovators. Key
entities include AI21 Labs, Anthropic, Cohere, Mistral AI, and Stability
AI, all of which provide models accessible through Amazon Bedrock. The
service integrates with AWS infrastructure, including AWS Lambda and AWS
SageMaker, to support scalable AI model deployment.

## Amazon Bedrock as a central service

Amazon Bedrock is a pivotal service within the AWS ecosystem, designed to
simplify access to high-performing foundation models for generative AI
applications. It integrates seamlessly with other AWS services, such as
Amazon S3, AWS Lambda, and AWS SageMaker, to facilitate the fine-tuning
and deployment of AI models. This integration underscores its importance
in the AI landscape, providing a comprehensive suite of tools for
scalable AI model deployment
[Data: Entities (206); Relationships (281, 326, 327)].

## AI21 Labs contribution to Amazon Bedrock
...`

const CELL_11_OUT = `The community is centered around Amazon Bedrock, a service by AWS that
facilitates access to foundation models from various AI innovators. Key
entities include AI21 Labs, Anthropic, Cohere, Mistral AI, and Stability
AI, all of which provide models accessible through Amazon Bedrock. The
service integrates with AWS infrastructure, including AWS Lambda and AWS
SageMaker, to support scalable AI model deployment.`

const CELL_12 = `import subprocess, shlex
from typing import Optional

def query_graphrag(
    query: str,
    method: str = "global",
    root_path: str = "./ragtest",
    community_level: int = 2,
) -> str:
    """Wrap the GraphRAG CLI so local / global / drift are one call."""
    cmd = (f"graphrag query --root {root_path} --method {method} "
           f"--community-level {community_level} "
           f"--query {shlex.quote(query)}")
    return subprocess.run(
        shlex.split(cmd), capture_output=True, text=True).stdout`

const CELL_13_OUT = `SUCCESS: Local Search Response:

When a company is deciding between Retrieval-Augmented Generation (RAG),
fine-tuning, and various Parameter-Efficient Fine-Tuning (PEFT)
approaches, several factors must be considered, including the specific
application requirements, available resources, and desired outcomes.
Each method offers distinct advantages and is suited to different
scenarios.

### Retrieval-Augmented Generation (RAG)

RAG is particularly beneficial for applications that require integrating
external data to enhance the accuracy and relevance of generated content.
It is ideal for scenarios where the model needs to access up-to-date or
domain-specific information without extensive retraining.
...`

const CELL_14_OUT = `SUCCESS: Global Search Response:

### Choosing Between RAG, Fine-Tuning, and PEFT Approaches

When a company is deciding between Retrieval-Augmented Generation (RAG),
fine-tuning, and Parameter-Efficient Fine-Tuning (PEFT) approaches,
several key factors must be considered. ...

#### Application Requirements

... if the application requires high precision and adaptability, such as
in customer support or information retrieval systems, RAG may be the
preferred choice. RAG enhances large language models by integrating
external data, allowing for more accurate and contextually relevant
content generation without extensive fine-tuning
[Data: Reports (19, 20, 35, 21, 36, 38, 60)].

#### Computational Resources

... PEFT approaches, such as LoRA and QLoRA, are designed to enhance
memory efficiency and reduce computational costs during the fine-tuning
process [Data: Reports (19, 45, 31, 60)].`

export const NOTEBOOK: Record<string, NotebookCell[]> = {
  load: [{ n: 1, explain: "Nothing prints, but this is the only place the corpus is read. `texts` is a list of overlapping 1200-token strings, and every cell below either sends one of them to the model or reads an artifact derived from all of them. A character splitter would cut in a different place than the model counts, which is the whole reason for the token splitter.", code: CELL_1, note: 'binds `texts` and prints nothing. Every cell below runs on this list.' }],

  extract: [
    {
      n: 2, explain: "Builds a LangChain runnable: prompt into gpt-4o at temperature 0, out as a plain string. Temperature 0 matters more here than in most pipelines. The extractor has to be reproducible, because if two runs over the same chunk disagree about entity names, the graph changes shape between builds.",
      needs: 'texts',
      code: CELL_2,
      note: 'builds `chain`. The prompt body is abridged here; the full tuned prompt is in the card above.',
    },
    {
      n: 3, explain: "One HTTP round trip for one chunk, and the log line is the entire visible result. In a real index this fires once per chunk plus once more per gleaning round, which is exactly where GraphRAG's indexing cost comes from.",
      needs: 'texts, chain',
      code: 'response = chain.invoke({"input_text": texts[25]})',
      out: 'HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"',
    },
    { n: 4, explain: "The model answers in delimited plaintext, not JSON. Fields are separated by `{tuple_delimiter}` and records by `{record_delimiter}`, ending in a completion delimiter, so the result is parsed rather than deserialised. Each entity carries a name, a type drawn from the configured list, and a description written from **this chunk's** wording, which is why the same entity comes back described differently from a different chunk.", needs: 'response', code: 'print(response)', out: CELL_4_OUT },
  ],

  merge: [
    {
      n: 5, explain: "This is the merged result, after every chunk's sub-graph has been combined. `title` is the resolved entity name and `text_unit_ids` is the provenance list, the chunks this entity was extracted from. GPT-3 appearing once rather than once per chunk is entity resolution having already happened.",
      code: `import pandas as pd

entities = pd.read_parquet(
    './ragtest/output/create_final_entities.parquet')

entities.head()`,
      out: CELL_5_OUT,
    },
    {
      n: 6, explain: "`weight` is the extractor's 1 to 10 relationship strength carried straight through as the edge weight, so a strongly-stated relationship literally pulls harder during community detection. `combined_degree` sums both endpoints' degrees, and that is what ranks relationships when the context window fills up at query time.",
      needs: 'pd',
      code: `relationships = pd.read_parquet(
    './ragtest/output/create_final_relationships.parquet')

relationships.head()`,
      out: CELL_6_OUT,
    },
  ],

  communities: [
    {
      n: 7, explain: "One row per (entity, level), which is why GPT-3 appears twice: community 8 at level 0 and community 43 at level 1. That is hierarchical Leiden's output, a nesting rather than one flat partition, and `level` is the dial global search exposes as `--community-level`.",
      needs: 'pd',
      code: `nodes = pd.read_parquet('./ragtest/output/create_final_nodes.parquet')

nodes.head(10)`,
      out: CELL_7_OUT,
    },
  ],

  embed: [
    {
      n: 8, explain: "Filtering to level 0 gives one row per entity. `x` and `y` are the graph-embedding coordinates, so entities sitting in similar neighbourhoods land near each other even when their names and descriptions share nothing. These are the coordinates driving the layout in the picture above.",
      needs: 'nodes',
      code: `# One row per (entity, level). x / y are the graph-embedding
# coordinates, which is why GPT-3 appears twice at the same point.
nodes[nodes.level == 0][["title", "community", "degree", "x", "y"]].head()`,
      out: CELL_8_OUT,
    },
  ],

  reports: [
    {
      n: 9, explain: "Two text columns, and the difference between them is the point of this stage. `full_content` is the generated report and runs to several hundred words. `summary` is a summary **of that report**, one paragraph. `rank` is the impact severity the model assigned, and `parent` is what makes the hierarchy walkable.",
      needs: 'pd',
      code: `community_reports = pd.read_parquet(
    './ragtest/output/create_final_community_reports.parquet')

community_reports.head()`,
      out: CELL_9_OUT,
    },
    { n: 10, explain: "The full report: a title, an overview, then one section per finding, each carrying `[Data: Entities (...); Relationships (...)]` citations pointing back into the graph. This is what a person reads and what a final answer cites, but it is **not** what gets embedded.", needs: 'community_reports', code: 'print(community_reports["full_content"][0])', out: CELL_10_OUT },
    { n: 11, explain: "The community summary: the same content compressed into a paragraph. This is the string that goes through the embedding model and into LanceDB. Global search maps over these, so the length here sets directly how many communities fit into a single map call.", needs: 'community_reports', code: 'print(community_reports["summary"][0])', out: CELL_11_OUT },
  ],

  local: [
    {
      n: 12, explain: "Defines the wrapper, runs no query. Everything it needs is already on disk, the parquet frames above plus the LanceDB vector store, because indexing and querying are fully separate processes. That separation is what makes the expensive LLM work a one-time cost.",
      code: CELL_12,
      note: 'defines `query_graphrag`. The CLI reads the parquet and LanceDB artifacts written by indexing.',
    },
    {
      n: 13, explain: "Local search. It matched the entities the question names, walked out to their neighbours, pulled the source chunks those entities were extracted from, and answered from that mixed context. The structure in the answer came from the graph; it never needed to read the whole corpus.",
      needs: 'query_graphrag',
      code: `result = query_graphrag(
    query="How does a company choose between RAG, fine-tuning, "
          "and different PEFT approaches?",
    method="local"
)
print(result)`,
      out: CELL_13_OUT,
    },
  ],

  global: [
    {
      n: 14, explain: "Global search, same question. The `[Data: Reports (19, 20, 35, ...)]` citations point at community reports rather than chunks, and every one of those was a separate map call whose key points were pooled and reduced. This is the query vanilla RAG structurally cannot answer, because no single chunk contains the comparison.",
      needs: 'query_graphrag',
      code: `result = query_graphrag(
    query="How does a company choose between RAG, fine-tuning, "
          "and different PEFT approaches?",
    method="global"
)
print(result)`,
      out: CELL_14_OUT,
    },
  ],
  drift: [
    {
      n: 15,
      explain: "Same question a third time. DRIFT starts global-style, matching the query against the embedded community reports to retrieve a top-k primer, then drives a local-style search from each follow-up question the primer raised, for `n_depth` rounds. The answer keeps the broad framing of the global result while carrying the concrete detail of the local one, which is the whole point of combining them.",
      needs: 'query_graphrag',
      code: `result = query_graphrag(
    query="How does a company choose between RAG, fine-tuning, "
          "and different PEFT approaches?",
    method="drift"
)
print(result)`,
      out: CELL_15_OUT,
    },
  ],
}
