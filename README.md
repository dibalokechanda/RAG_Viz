# RAG Pipeline — Interactive Map

A React Flow visualisation of a vanilla RAG pipeline. Click any stage to read what it does, the equations behind it, and what it costs. Swap implementation variants to watch the graph rewire. Open a stage's concept map to drill into sub-topics. Or press play to walk a single query through the whole thing.

```bash
npm install
npm run dev
```

## What it shows

Twenty-five stages across four columns:

| Column | Contents |
| --- | --- |
| **Offline** | `documents → loading → metadata → cleaning → chunking → embedding → index structure → compression → index` |
| **Online · Query Processing** | `user query → understanding → classification → rewriting → expansion → [multi-query / decomposition / HyDE] → query embedding` |
| **Online · Retrieve & Rank** | `retrieval → [RRF] → [merge] → [dedup] → [rerank] → [retrieval metrics]` |
| **Online · Answer** | `prompt → generation → post-processing → [generation evaluation] → response` |

The two halves meet at exactly one point — the vector index, written offline and read online. That's the dashed green edge routed over the top of the canvas.

### Indexing and compression are orthogonal axes

This is deliberate, and it is the correction that drove the current structure. Product Quantisation is **not** an index type sitting alongside IVF and HNSW — it is a *storage* scheme.

- **Index structure** (Flat / IVF / HNSW) decides **which vectors get compared**.
- **Compression** (None / SQ8 / PQ / Binary) decides **how each vector is stored** and how its distance is approximated.

They compose freely. "IVF-PQ" is just IVF partitioning holding PQ-encoded vectors — named as a unit only because it is the most common pairing at scale. HNSW+PQ, HNSW+SQ8 and Flat+Binary are equally valid points on the memory/recall curve, and the rail lets you pick any combination.

### Stages are not all the same shape

Each kind gets its own visual treatment:

- **sequential** — always runs, in order
- **choice** — always runs, but you pick one variant (chunking, index structure, compression, retrieval, decoding)
- **optional** — can be switched off entirely (dedup, rerank, both evaluation stages, HyDE)
- **fan-out** — optional *and* multiplies the query into parallel branches (multi-query, decomposition). Downstream stages get a `×N parallel` badge until a merge node pools them back
- **store** — the index; the handoff between the two halves

Toggling a fan-out genuinely changes the graph: nodes are added, a merge node appears before reranking, and the stages in between are marked parallel. Switching retrieval away from hybrid removes the RRF node, because with one retriever there is nothing to fuse.

### Two evaluation stages, deliberately separate

**Retrieval metrics** (Precision@K, Recall@K, MRR, nDCG, MAP) score the *ranked list*. **Generation evaluation** (grounding, faithfulness, relevance, completeness) scores the *answer*.

Keeping them apart is what lets you localise a failure. High recall with low faithfulness means the evidence was there and the model ignored it — a prompting problem. Low recall with high faithfulness means the model faithfully used the wrong context — a retrieval problem. A single end-to-end quality score cannot tell these apart, and they have nothing in common as far as the fix is concerned.

### Deduplication

Its own stage, with four escalating levels: exact hashing → MinHash/SimHash over shingles → embedding cosine → MMR for diversity-aware selection. Retrieved sets are redundant structurally, not accidentally — overlapping chunks share text by construction, fan-out branches retrieve the same chunks, and corpora repeat passages. Duplicates both consume top-K slots and make a single-source claim look corroborated.

### Figures

Sixteen inline diagrams, declared as data in the stage files and rendered as monochrome SVG by `Figure.tsx`. Five chart kinds cover everything:

| Kind | Used for |
| --- | --- |
| `bars` | Temperature panels, top-P nucleus cutoff, bytes-per-vector |
| `curve` | BM25 saturation and IDF, RRF rank weighting, nDCG discount, LSH S-curve, lost-in-the-middle, semantic-chunk similarity, multi-query recall |
| `segments` | Why chunk overlap exists — a fact severed at a boundary, then captured |
| `ranked` | The graded result strip the metrics are computed from |
| `blocks` | PQ decomposition, bi-encoder vs cross-encoder architecture |

The temperature figure is the clearest example of why these earn their place: three panels sharing a y-scale, same logits throughout, only the divisor changing — the sharpening and flattening is obvious in a way the softmax formula alone is not.

Declaring figures as data rather than hand-written SVG means they all inherit the same styling and stay in step with the theme.

### Equations

Every stage carries worked maths rendered with KaTeX: BM25 with its IDF and saturation terms, cosine similarity, RRF, the nDCG/DCG/IDCG chain, MMR, MinHash's LSH S-curve, PQ decomposition and ADC scoring, HNSW layer assignment, IVF scan cost, softmax temperature, top-p, beam length penalty, speculative decoding acceptance.

Each block shows the formula, a legend for every symbol, and a numeric substitution. The worked values are independently verified — for example nDCG@6 for grades `[3,2,3,0,1,2]` computes DCG 13.848, IDCG 14.595, nDCG 0.949.

### Concept maps

Stages with sub-topics show a **Concept map** button. It opens a radial mind map with the stage at the centre and concepts around it, colour-coded by kind (idea, formula, method, metric, pitfall, tradeoff). Nodes marked `+` expand into a further ring. Clicking any node shows its full detail, equations included, in the side panel.

### The walkthrough

Press play and one query — `"How is it different?"`, asked right after `"Explain FAISS"` — travels the pipeline, showing the payload after each stage: the pronoun resolved, vocabulary expanded, the vector, two disagreeing ranked lists, the RRF fusion, dedup counts, cross-encoder reordering, retrieval scores, the assembled prompt, the cited answer, faithfulness scores. It follows whatever configuration is currently set.

## Structure

```
src/
  data/
    types.ts           Stage / variant / concept / math / trace types
    stages.offline.ts  Offline content
    stages.online.ts   Online content
    stages.ts          Combines both, builds id lookups
    graph.ts           PipelineConfig → React Flow nodes + edges
  components/
    StageNode.tsx      Custom node; renders each kind differently
    LaneLabel.tsx      Column headers
    edges.tsx          PipelineEdge, plus the hand-routed JoinEdge
    Math.tsx           KaTeX block: formula + symbol legend + worked values
    Figure.tsx         Monochrome SVG diagrams: bars, curve, segments, ranked, blocks
    ConceptMap.tsx     Radial drill-down mind map overlay
    DetailPanel.tsx    Right panel
    ControlRail.tsx    Left panel: variant pickers and toggles
    Player.tsx         Transport controls
  App.tsx              State, graph assembly, camera, playback
```

Everything derives from the two stage files. Adding a stage means adding one object — graph, panel, concept map and walkthrough all pick it up. Layout is computed by packing stages into columns in `graph.ts`, so inserting or removing a stage reflows automatically.

## Design

Monochrome, but not flat. Six rules the stylesheet holds to:

0. **Real type, self-hosted.** Inter Variable and JetBrains Mono Variable via `@fontsource-variable`. The stylesheet named these for a long time without ever bundling them, so the app silently rendered in the OS UI font — the single largest reason it read as undesigned.
1. **Nothing below 11px, body copy at 15–16px.** Micro-caps are for labels only, never for anything you actually have to read.
2. **Warm neutrals.** Pure grey is cold; the palette is stone-tinted so white surfaces sit on something rather than floating.
3. **Depth through soft layered shadow**, never through colour. Two shadows per level — a tight contact shadow plus a wider ambient one. That pairing is what stops it looking like a drop box.

1. **No colour at all.** Black is the only accent. Verified rather than assumed — a DOM sweep of every element's `color`, `background` and border finds zero values with any chroma (max channel spread ≤ 12).
2. **Almost no boxes.** Sections are a hairline rule plus a micro-caps label, not a nested bordered card. Equations, examples, tradeoffs, distinctions and the trace card were all de-boxed — most now hang off a single left rule or sit between two hairlines.
3. **No shadows** except on things that genuinely float: the player pill and the concept-map modal. Nodes are flat white with a 1px border.
4. **Meaning that used to be colour is now shape.** Dashed border = optional stage. Solid 2px left rule = primary ("buys you"); 1px = secondary ("costs you"). Lane identity is weight, not hue — a grey rule for offline, black for online. The join edge stays dashed and labelled.

The one deliberate inversion is the concept map's centre node — black with white text, to anchor the radial layout.

Text greys clear WCAG AA on white: body 17.7:1, dim 8.0:1, faint 5.4:1.

### Sections

The panel carries a lot of material, so it is split into **numbered, collapsible sections** — Overview, Illustrated, The maths, Example, Variants, In depth, Trade-offs, Commonly conflated. Numbering is contiguous per stage: sections that are empty for a given stage are skipped rather than left as gaps.

Only Overview, Illustrated and Commonly conflated open by default. The rest stay closed with a count badge, so **the collapsed headers act as a table of contents** — you can see what exists and how much of it there is without scrolling past all of it. That takes a typical stage from 4–5 screens down to 2.5–3.4, with everything one click away.

Anything specific to the selected variant is merged into a single **"In depth — {variant}"** section rather than fragmenting into four near-empty ones.

### Canvas vs. panel type

Two ramps, not one. The graph sits at ~0.75 zoom, so anything drawn on it loses a quarter of its size before it reaches the eye. Canvas tokens (`--fs-canvas-title` 18px, `--fs-canvas-body` 14.5px, `--fs-canvas-label` 12.5px) are pre-multiplied to land at the same optical size as the panel ramp. Edge strokes are scaled the same way — 2.2px base, 3px travelled, 2.4px for the join — and every edge now carries an arrowhead marker.

> **Gotcha:** `BaseEdge` merges a custom edge's `className` onto the `<path>` itself (`cc(['react-flow__edge-path', props.className])`), whereas an `edge.className` set on the edge *object* lands on the wrapper `<g>`. Style the former with compound selectors (`.react-flow__edge-path.edge-join`) and the latter with descendants (`.cm-edge .react-flow__edge-path`). Getting this wrong fails silently — the rules simply never match.

### Type ramp

Driven by CSS custom properties so the whole app scales from one place:

| Token | Size | Used for |
| --- | --- | --- |
| `--fs-micro` | 11px | Micro-caps labels only |
| `--fs-xs` | 12.5px | Captions, chips, mono payloads |
| `--fs-sm` | 13.5px | Node taglines, list items, figure captions |
| `--fs-base` | 15px | Body copy, panel prose |
| `--fs-md` | 16px | Node titles, topbar |
| `--fs-lg` | 20px | Concept-map headings |
| `--fs-xl` | 27px | Panel title |

### Icons

29 stroke icons on a 24×24 grid, 1.6px stroke, inheriting `currentColor` — so a selected card inverts its icon along with everything else. Every stage gets one (documents, tag, filter, chunks, graph, compress, database, search, merge, layers, sort, chart, sparkle, gauge…), and the six concept kinds get their own (bulb, ƒx, steps, chart, warning, scale).

### Card sizing

Cards went 300→380px (400 for online), padding 11→16px, with a 40px icon well. Column spacing and the graph's per-kind height table were widened to match.

The initial fit-view now has a **zoom floor of 0.75**. Fitting all four columns on a laptop shrank cards to ~8px effective type — technically "everything visible", practically unreadable. It now opens legible and you pan; on a wide monitor fit-view computes above the floor anyway and shows the whole map.

## Notes

- `JoinEdge` uses a hand-written SVG path rather than `getSmoothStepPath`. A direct route from the index to retrieval would cut through two intervening columns, so it goes up and over, clearing the lane headers by 66px.
- Node positions have a CSS transition, so toggling a stage reflows the column visibly rather than snapping.
- The bundle is ~246 kB gzipped, mostly KaTeX. KaTeX fonts are emitted as separate assets and fetched on demand, so actual transfer is lower than the `dist/` total suggests.
- Designed for a wide window. Below ~1180px the detail panel floats over the canvas, empty panels are dropped rather than reserving width, and the control rail collapses via the ☰ button.
