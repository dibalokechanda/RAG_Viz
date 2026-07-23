# RAG Pipeline · Interactive Map

An interactive teaching resource for retrieval-augmented generation. Most RAG explanations are either a five-box diagram that hides every decision, or a paper that assumes you already know the shape. This sits in between: you can see the whole pipeline at once, then click into any single stage and read the maths, the trade-off, and the code that implements it.

Two views, reachable from the tabs at the top.

## Vanilla RAG

The classic pipeline, drawn as a graph you can rewire. Query understanding, chunking, embedding, indexing, retrieval, reranking, prompt construction, generation, post-processing, evaluation, plus a governance and ops control plane that sits beside the query path rather than on it.

Swap an implementation variant and the graph restructures: turn on HyDE or multi-query and new stages appear, switch the index from flat to IVF to HNSW and the retrieval path changes with it. Every stage carries worked maths rendered with KaTeX, an inline figure, a LangChain or LangGraph snippet, and the tools people actually reach for. Deeper topics open into their own concept maps, and the HNSW section builds up from small-world graphs through greedy search and skip lists to a 3D view of the layered graph.

## GraphRAG

Microsoft's graph-based approach, walked through in nine stages. Loading and splitting, entity and relationship extraction, sub-graph merging, hierarchical Leiden community detection, Node2Vec, community report generation and summarisation, then local, global and DRIFT search.

The content is grounded in a real worked example rather than invented: real entities, real relationship strengths, the actual extraction prompt and its raw delimited output, real community reports. Each stage also opens a notebook overlay with runnable cells and their captured output, numbered as one continuous kernel so you can see what each step actually produces.

## What it is good for

Learning the vocabulary and seeing where each piece sits. Understanding why a choice exists before memorising which option to pick. Comparing vanilla RAG against GraphRAG on the same terms, and seeing concretely which questions each one can and cannot answer.

## Run it

```bash
npm install
npm run dev
```

`vite.config.ts` sets `base: '/RAG_Viz/'` for GitHub Pages, so a production preview serves at `http://localhost:4173/RAG_Viz/` rather than the root. `npm run dev` is unaffected.
