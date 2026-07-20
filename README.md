# 🗺️ RAG Pipeline — Interactive Map

A beautiful, interactive React Flow visualisation of a RAG (Retrieval-Augmented Generation) pipeline! 🚀

Click any stage to read what it does, the equations behind it, and what it costs. Swap implementation variants to watch the graph rewire! 🔄

## ✨ Features

- **🌐 31 Interactive Stages:** Covers Offline (Chunking, Embedding, Indexing), Online (Retrieval, Reranking, Generation) — and a Platform control plane.
- **🛡️ Governance & Ops Lane:** Ingestion triggers, access control, artifact versioning, the golden set, a CI/CD evaluation gate, and graceful fallback. Toggle the whole lane on or off.
- **🎛️ Dynamic Graph:** Toggling features like HyDE or Multi-Query actually changes the graph structure on the fly!
- **📊 Detailed Metrics:** Two separate evaluation stages to isolate retrieval vs generation performance.
- **🎨 Built-in Figures:** 16 inline SVG diagrams dynamically rendered for metrics like BM25 saturation, top-P, and PQ decomposition.
- **🧮 Interactive Math:** Every stage carries worked maths rendered with KaTeX. See the formulas in action!
- **🧠 Concept Maps:** Drill down into sub-topics with radial mind maps for deep learning.
- **▶️ Walkthrough Player:** Press play to walk a single query step-by-step through the whole pipeline!

## 🛡️ The Control Plane

Six stages that **govern** the pipeline without ever sitting on the query path — so a query never passes through them, and the walkthrough player skips them.

| Stage | What it answers |
| --- | --- |
| **Ingestion Triggers** | What causes new content to enter — cron, webhook, CDC, upload. Plus change detection and the tombstone path for deletes. |
| **Access Control & Policy** | Who may see which chunk. ACL capture at ingest, pre- vs post-filter enforcement, tenant isolation, PII redaction. |
| **Artifact Versioning** | Pin the four things an answer depends on — chunker, embedder, index, prompt — in one manifest, promoted as a unit. |
| **Golden Set** | The labelled queries every metric is computed against. Synthetic vs pooled vs production-mined, and why size matters less than stability. |
| **CI/CD Evaluation Gate** | Run the golden set on every artifact change; promote or block against an absolute floor and a relative tolerance. |
| **Graceful Fallback** | Roll the alias back in seconds, and degrade a live request down a defined ladder instead of erroring. |

Because these relate to *half the pipeline at once*, drawing an edge for each would turn the canvas into spaghetti. Only one real data flow is drawn — **triggers → ingestion**. Every other relationship becomes a **clickable `governs` pill**: click one to select that stage and pan straight to it. The pills carry the relationship *and* do the navigation the edges would have done.

## 🚀 Quick Start

```bash
npm install
npm run dev
```

> **Note:** `vite.config.ts` sets `base: '/RAG_Viz/'` for GitHub Pages, so a production preview serves at `http://localhost:4173/RAG_Viz/` — not the root. `npm run dev` is unaffected.

Enjoy exploring the anatomy of RAG! 🧩
