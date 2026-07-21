import type { Stage } from './types'

/**
 * OFFLINE PATH, runs before anyone asks a question. Its only output is the
 * vector index, which the online path then reads.
 */
export const offlineStages: Stage[] = [
  {
    id: 'documents',
    icon: 'documents',
    label: 'Documents',
    phase: 'offline',
    kind: 'terminal',
    ordinal: '2',
    tagline: 'The raw corpus',
    detail: [
      'Whatever you are making searchable: **PDFs**, **DOCX**, **Markdown**, **HTML**, **Confluence spaces**, **GitHub repos**, or **database rows**.',
      'Nothing here is RAG-specific yet, but it matters immensely. Every downstream decision is determined by what these files actually are:',
      '- **Chunking strategy** depends on document structure',
      '- **Metadata extraction** depends on available source fields',
      '- **OCR requirements** depend on whether the text is digital or scanned',
    ],
    stack: [
      { name: 'LangChain', what: 'Document loaders for 100+ formats', url: 'https://python.langchain.com/docs/how_to/#document-loaders' },
      { name: 'LlamaIndex', what: 'Data connectors and readers', url: 'https://docs.llamaindex.ai/en/stable/' },
      { name: 'Unstructured', what: 'Parse PDFs, DOCX, HTML, images into clean text', url: 'https://unstructured.io/' },
    ],
  },

  {
    id: 'loading',
    icon: 'load',
    label: 'Document Loading',
    phase: 'offline',
    kind: 'sequential',
    ordinal: '2a',
    tagline: 'Bytes → text, format by format',
    code: [
      {
        title: 'LangChain',
        language: 'python',
        code: `from langchain_community.document_loaders import (
    PyPDFLoader, UnstructuredMarkdownLoader, UnstructuredPDFLoader)

# One loader per format. The split that matters is text-layer vs. scanned.
docs = PyPDFLoader("spec.pdf").load()               # digital: reads text layer
md   = UnstructuredMarkdownLoader("guide.md").load() # keeps heading structure

# A scanned PDF has no text layer, so route it through OCR.
scan = UnstructuredPDFLoader("scan.pdf", strategy="ocr_only").load()`,
        note: 'UnstructuredPDFLoader delegates OCR to Tesseract; Docling and AWS Textract are common higher-accuracy alternatives.',
      },
    ],
    detail: [
      'You will likely need **one loader per source format**, each with its own failure modes. The most important split is not by file extension, but by whether the text is already there:',
      '- **Digital PDFs**: Carry a text layer directly, allowing the parser to read it.',
      '- **Scanned PDFs**: Images of text that require OCR first. OCR introduces errors that the cleaning stage has to undo.',
      '- **Markdown/HTML**: Preserve heading hierarchy, which is exactly what semantic chunking needs later. Losing it here means you cannot get it back.',
    ],
    stack: [
      { name: 'PyMuPDF (fitz)', what: 'High-performance PDF parsing', url: 'https://pymupdf.readthedocs.io/' },
      { name: 'Tesseract', what: 'Open-source OCR engine', url: 'https://github.com/tesseract-ocr/tesseract' },
      { name: 'BeautifulSoup', what: 'HTML parsing and extraction', url: 'https://beautiful-soup-4.readthedocs.io/' },
    ],
    example: {
      beforeLabel: 'Digital PDF',
      before: 'PDF → Parser → Text',
      afterLabel: 'Scanned PDF',
      after: 'Image PDF → OCR → Text',
      mono: true,
    },
    concepts: [
      {
        id: 'load-digital',
        label: 'Digital parsing',
        kind: 'method',
        summary: 'Text layer already present',
        detail: [
          'Formats like **PDF**, **DOCX**, and **HTML** carry the characters directly. The parser walks the document object model and emits text plus positional metadata.',
          '**The hard part is not extraction, but reading order.**',
          '- A two-column academic paper stores text in the order it was drawn, not the order it is read.',
          '- Naive extraction interleaves the columns and produces **fluent nonsense** that no downstream stage can detect.',
        ],
        children: [
          {
            id: 'load-reading-order',
            label: 'Reading-order recovery',
            kind: 'pitfall',
            summary: 'Two-column layouts interleave silently',
            detail: [
              'Sort text blocks by their bounding boxes rather than by draw order. Cluster on the x-axis to detect columns, then sort within each column by y.',
              'This failure is invisible in the extracted text; it reads as grammatical English, so it survives cleaning, chunking and embedding, and only shows up as inexplicably poor retrieval.',
            ],
          },
          {
            id: 'load-tables',
            label: 'Tables',
            kind: 'pitfall',
            summary: 'Flattening destroys row/column association',
            detail: [
              'A table flattened to prose loses the link between a cell and its header. For example, **"42"** becomes unretrievable because nothing near it says what it measures.',
              '**Best Practices:**',
              '- Serialise tables to Markdown or HTML so the header stays adjacent to each value.',
              '- Or, emit **one chunk per row** with the header repeated.',
            ],
          },
        ],
      },
      {
        id: 'load-ocr',
        label: 'OCR path',
        kind: 'method',
        summary: 'Images of text → characters',
        detail: [
          'Scanned documents need optical character recognition. Modern engines run at 98–99% character accuracy on clean scans, which sounds excellent until you count it per page.',
        ],
        math: [
          {
            title: 'Errors per page at a given character accuracy',
            tex: String.raw`E_{\text{page}} = L \times (1 - a)`,
            where: [
              { sym: String.raw`L`, means: 'characters per page (≈ 3,000 for dense text)' },
              { sym: String.raw`a`, means: 'per-character accuracy' },
            ],
            worked: [
              { tex: String.raw`E_{\text{page}} = 3000 \times (1 - 0.99) = 30`, caption: '30 wrong characters on every page' },
              { tex: String.raw`E_{\text{page}} = 3000 \times (1 - 0.995) = 15`, caption: 'even at 99.5%' },
            ],
            note: 'Those errors concentrate in exactly the tokens you most need to match exactly: proper nouns, part numbers, dosages, identifiers.',
          },
        ],
        stack: [
          { name: 'Docling', what: 'Fast, accurate document parsing with layout awareness', url: 'https://github.com/DS4SD/docling' },
          { name: 'Marker', what: 'Converts PDF to Markdown quickly and accurately', url: 'https://github.com/VikParuchuri/marker' },
          { name: 'Unstructured', what: 'Enterprise-grade OCR and document partitioning', url: 'https://unstructured.io/' },
          { name: 'AWS Textract', what: 'Managed service for extracting text and data', url: 'https://aws.amazon.com/textract/' },
        ],
      },
      {
        id: 'load-structure',
        label: 'Structure preservation',
        kind: 'idea',
        summary: 'Heading hierarchy is a downstream dependency',
        detail: [
          'Recursive chunking splits on headings; parent–child chunking needs sections to define parents. Both are impossible if loading flattened the document to a character stream.',
          'Capture the heading path for every block, for example "Chapter 3 › Indexing › HNSW", and carry it as metadata. It doubles as breadcrumb context in the prompt and as a filter at query time.',
        ],
      },
    ],
    trace: {
      headline: 'Corpus ingested',
      payload: '412 documents → 1,847 pages of text',
      note: 'Ran once, offline. The online query never touches this.',
    },
  },

  {
    id: 'metadata',
    icon: 'tag',
    label: 'Metadata Extraction',
    phase: 'offline',
    kind: 'sequential',
    ordinal: '2b',
    tagline: 'Capture provenance while you still have it',
    detail: [
      'Performed during loading, because **this is the last moment the information exists**. Once a document has been flattened into a wall of text, you cannot recover which page a sentence came from.',
      'Every chunk later inherits this metadata. That inheritance powers:',
      '- **Citations and grounding**',
      '- **Page-level filtering**',
      '- **Temporal scoping** (e.g., "only search documents from this year")',
    ],
    example: {
      beforeLabel: 'Extracted per document',
      before: 'Title\nAuthor\nSource\nPage Number\nDate\nDocument ID',
      afterLabel: 'Result',
      after: 'Each chunk carries these fields downstream',
      mono: true,
    },
    concepts: [
      {
        id: 'meta-filter',
        label: 'Filtered search',
        kind: 'method',
        summary: 'Metadata narrows the candidate set',
        detail: [
          'Filters combine with vector search in two ways, and the difference is large:',
          '- **Post-filtering:** Retrieves top-K then discards non-matching results. It is simple, but if the filter is selective you can retrieve 100 and keep 2.',
          '- **Pre-filtering:** Restricts the search to matching vectors first. This preserves K but breaks ANN index assumptions: an HNSW graph whose nodes are mostly masked out loses connectivity and recall collapses.',
        ],
        math: [
          {
            title: 'Expected survivors under post-filtering',
            tex: String.raw`K_{\text{kept}} = K \times s`,
            where: [
              { sym: String.raw`K`, means: 'documents retrieved before filtering' },
              { sym: String.raw`s`, means: 'selectivity, fraction of the corpus matching the filter' },
            ],
            worked: [
              { tex: String.raw`K_{\text{kept}} = 100 \times 0.02 = 2`, caption: 'a 2%-selective filter leaves almost nothing' },
            ],
            note: 'Below roughly 5% selectivity, post-filtering stops working and you need either pre-filtering or a separate per-tenant index.',
          },
        ],
      },
      {
        id: 'meta-citation',
        label: 'Citation chain',
        kind: 'idea',
        summary: 'Chunk → page → document → URL',
        detail: [
          'A citation is only as good as the weakest link in this chain. If page numbers were dropped at loading, the best you can offer is a document-level citation, which the user cannot verify without reading the whole thing.',
          '**Best Practice:** Store the character offset range of each chunk within its source document. That lets you highlight the exact supporting span rather than just naming the file.',
        ],
      },
      {
        id: 'meta-inherit',
        label: 'Inheritance',
        kind: 'idea',
        summary: 'Chunks copy their document metadata',
        detail: [
          'When a document is split, every chunk carries a copy of the document-level fields plus its own chunk-level fields, index, offset range, heading path, token count.',
          'Denormalising rather than joining at query time matters: a vector store returning a chunk should return everything needed to cite and filter it in the same round trip.',
        ],
      },
    ],
  },

  {
    id: 'cleaning',
    icon: 'filter',
    label: 'Cleaning',
    phase: 'offline',
    kind: 'sequential',
    ordinal: '2c',
    tagline: 'Deterministic preprocessing, no LLM',
    code: [
      {
        title: 'Python (Boilerplate Stripping)',
        language: 'python',
        code: `import re

def clean_text(text: str) -> str:
    # Remove multiple newlines
    text = re.sub(r'\\n{3,}', '\\n\\n', text)
    # Remove page numbers like "- 42 -"
    text = re.sub(r'(?m)^\\s*-\\s*\\d+\\s*-\\s*$', '', text)
    return text.strip()`,
        note: 'Keep it deterministic. Avoid LLM-based cleaners that might silently paraphrase.',
      },
    ],
    detail: [
      'Strip the artifacts of the source format so they do not become retrievable content: **running headers**, **footers**, **page numbers**, duplicated whitespace, encoding mismatches, and OCR garbage.',
      '**This stage is deliberately dumb.** It is rules and regexes, not a model. Determinism matters because you want to be able to re-run ingestion and get byte-identical output, otherwise you cannot tell whether a retrieval regression came from your data or your code.',
      '**Corpus-level near-duplicate removal** also belongs here. If the same policy document exists in four revisions, all four will be retrieved together, crowding out everything else in your top-K.',
    ],
    tradeoffs: {
      gains: ['Reproducible ingestion', 'No page furniture polluting chunks', 'Cheap and fast'],
      costs: ['Rules are corpus-specific', 'Aggressive cleaning can eat real content'],
    },
    concepts: [
      {
        id: 'clean-boilerplate',
        label: 'Boilerplate removal',
        kind: 'method',
        summary: 'Detect repetition across pages',
        detail: [
          'Rather than hand-writing patterns, find lines that repeat at the same relative position across many pages. A string appearing at the top of 90% of pages is a running header regardless of what it says.',
        ],
        math: [
          {
            title: 'Header score',
            tex: String.raw`h(\ell) = \frac{|\{p : \ell \in \text{top}_k(p)\}|}{|P|}`,
            where: [
              { sym: String.raw`\ell`, means: 'a candidate line' },
              { sym: String.raw`\text{top}_k(p)`, means: 'the first k lines of page p' },
              { sym: String.raw`|P|`, means: 'total pages' },
            ],
            note: 'Strip when h(ℓ) exceeds ~0.5. Being position-aware avoids deleting a sentence that legitimately recurs in body text.',
          },
        ],
      },
      {
        id: 'clean-nearpdupe',
        label: 'Corpus near-duplicates',
        kind: 'method',
        summary: 'Four revisions of one document crowd the top-K',
        detail: [
          'Distinct from the query-time deduplication that happens after retrieval. This one removes redundancy from the index itself, so it never competes for a top-K slot in the first place.',
          'Shingle each document into overlapping k-grams, then compare sets by Jaccard similarity. Above a threshold, keep only the most recent revision and record the others as aliases so citations to them still resolve.',
        ],
        math: [
          {
            title: 'Jaccard similarity over k-gram shingles',
            tex: String.raw`J(A, B) = \frac{|A \cap B|}{|A \cup B|}`,
            where: [
              { sym: String.raw`A, B`, means: 'the sets of k-gram shingles of two documents' },
            ],
            worked: [
              { tex: String.raw`J = \frac{940}{1060} \approx 0.887`, caption: 'two revisions of the same policy, deduplicate' },
            ],
            note: 'Computing this for every pair is O(n²). MinHash reduces it to a near-linear approximation, see the deduplication stage.',
          },
        ],
      },
      {
        id: 'clean-determinism',
        label: 'Why no LLM here',
        kind: 'idea',
        summary: 'Reproducibility is the requirement',
        detail: [
          '- **Non-deterministic:** Re-running ingestion produces a different corpus, different embeddings, and different retrieval. You lose the ability to attribute a regression to any single change.',
          '- **Unfaithful:** Asked to clean text, a model will silently paraphrase, summarise, or correct facts. Cleaning must be **lossless** with respect to meaning.',
        ],
      },
      {
        id: 'clean-ocr',
        label: 'OCR repair',
        kind: 'method',
        summary: 'Confusion pairs and broken hyphenation',
        detail: [
          'Recurring substitutions, rn→m, l→1, O→0, are correctable with a dictionary check, since the erroneous form is usually not a word.',
          'De-hyphenate line breaks: "index-\\ning" → "indexing". Left alone; this produces two junk tokens instead of one real one, and the real term becomes unmatchable.',
        ],
      },
    ],
  },

  {
    id: 'chunking',
    icon: 'chunks',
    label: 'Chunking',
    phase: 'offline',
    kind: 'choice',
    ordinal: '3',
    tagline: 'Split documents into retrievable units',
    detail: [
      'The single most consequential design decision in the offline path. A chunk is the unit of retrieval; you cannot retrieve half a chunk, and you cannot retrieve across two of them.',
      '**The core tension never goes away:**',
      '- **Large chunks** carry more context but more noise.',
      '- **Small chunks** are more precise but can sever the sentence from the fact that explains it.',
      'There is also a **dilution effect** that is easy to miss. An embedding is roughly an average of what the text is about. A single relevant sentence inside a large chunk contributes proportionally less to the vector, causing the chunk to drift away from the query in embedding space.',
      '**Worth stating plainly:** Chunking decisions are permanent. A bad prompt can be rewritten in a minute; a bad chunking strategy means re-embedding the entire corpus. Sweep it against a labelled query set before committing, not after.',
    ],
    figures: [
      {
        kind: 'segments',
        title: 'Why overlap exists',
        total: 1000,
        rows: [
          { label: 'a fact spanning tokens 470–530', spans: [{ from: 470, to: 530, ghost: true }] },
          {
            label: 'no overlap, the fact is severed',
            spans: [
              { from: 0, to: 500, label: 'chunk 1' },
              { from: 500, to: 1000, label: 'chunk 2' },
            ],
          },
          { label: '50-token overlap, chunk 1', spans: [{ from: 0, to: 500, label: '0–500' }] },
          { label: 'chunk 2 now starts earlier', spans: [{ from: 450, to: 950, label: '450–950' }] },
        ],
        caption:
          'Without overlap the boundary at 500 cuts the fact in half, and neither chunk embeds as being about it, so it is retrievable from neither. Sliding chunk 2 back to 450 means it now contains the fact whole. The cost is that tokens 450–500 are stored twice, which is the 11% index growth the formula below quantifies.',
      },
    ],
    math: [
      {
        title: 'Chunk count under fixed-size chunking with overlap',
        tex: String.raw`n = \left\lceil \frac{L - o}{c - o} \right\rceil`,
        where: [
          { sym: String.raw`L`, means: 'document length in tokens' },
          { sym: String.raw`c`, means: 'chunk size in tokens' },
          { sym: String.raw`o`, means: 'overlap in tokens' },
        ],
        worked: [
          { tex: String.raw`n = \left\lceil \frac{10000 - 0}{500 - 0} \right\rceil = 20`, caption: 'c = 500, no overlap' },
          { tex: String.raw`n = \left\lceil \frac{10000 - 50}{500 - 50} \right\rceil = \lceil 22.11 \rceil = 23`, caption: 'c = 500, o = 50, 15% more vectors to store' },
        ],
      },
      {
        title: 'Signal dilution in an oversized chunk',
        tex: String.raw`\text{signal} \approx \frac{t_{\text{rel}}}{t_{\text{chunk}}}`,
        where: [
          { sym: String.raw`t_{\text{rel}}`, means: 'tokens that actually answer the question' },
          { sym: String.raw`t_{\text{chunk}}`, means: 'total tokens in the chunk' },
        ],
        worked: [
          { tex: String.raw`\frac{40}{200} = 0.20`, caption: 'a 200-token chunk, the answer dominates' },
          { tex: String.raw`\frac{40}{2000} = 0.02`, caption: 'the same answer inside a 2000-token chunk' },
        ],
        note: 'This is why simply enlarging chunks to "include more context" degrades retrieval: the relevant sentence stops driving the embedding.',
      },
    ],
    tradeoffs: {
      gains: ['Large chunks: more surrounding context', 'Small chunks: higher precision, tighter embeddings'],
      costs: ['Large chunks: more irrelevant text per hit, diluted embeddings', 'Small chunks: context lost across boundaries'],
    },
    variants: [
      {
        id: 'fixed',
        label: 'Fixed-size',
        tagline: 'Cut every N tokens',
        detail:
          'Split at a constant token count (e.g. 500 tokens), regardless of what the text is doing at that point. **Simple, fast, and completely predictable, but utterly indifferent to meaning**. It will happily cut a definition in half.',
        example: { before: 'Document', after: '[0–500] [500–1000] [1000–1500]', mono: true },
        tradeoffs: {
          gains: ['Trivial to implement', 'Uniform chunk sizes', 'Predictable index size'],
          costs: ['Splits mid-sentence and mid-idea', 'Ignores document structure entirely'],
        },
      },
      {
        id: 'overlap',
        label: 'Overlapping',
        tagline: 'Fixed-size, with a sliding margin',
        detail:
          'Same as fixed-size, but each chunk starts before the previous one ended. A fact that straddles a boundary now appears whole in at least one chunk, instead of being split across two and retrievable in neither.',
        example: {
          beforeLabel: 'Without overlap',
          before: '0–500\n500–1000',
          afterLabel: 'With overlap',
          after: '0–500\n450–950',
          mono: true,
        },
        math: [
          {
            title: 'Storage overhead',
            tex: String.raw`\text{overhead} = \frac{o}{c - o}`,
            where: [
              { sym: String.raw`o`, means: 'overlap tokens' },
              { sym: String.raw`c`, means: 'chunk size' },
            ],
            worked: [
              { tex: String.raw`\frac{50}{500 - 50} = 0.111`, caption: '10% overlap → 11% more vectors' },
              { tex: String.raw`\frac{100}{500 - 100} = 0.25`, caption: '20% overlap → 25% more vectors' },
            ],
            note: 'Typical overlap is 10–20% of chunk size. Beyond that the duplicate hits become a dedup problem of their own.',
          },
        ],
        tradeoffs: {
          gains: ['Boundary-straddling facts survive', 'Still simple to implement'],
          costs: ['Index grows, the overlap is stored twice', 'Duplicate hits need dedup at retrieval'],
        },
      },
      {
        id: 'recursive',
        label: 'Recursive',
        tagline: 'Split hierarchically, only as far as needed',
        code: [
          {
            title: 'LangChain',
            language: 'python',
            code: `from langchain_text_splitters import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=500, chunk_overlap=50,
    separators=["\\n\\n", "\\n", ". ", " ", ""],  # tried in order, coarse first
)
chunks = splitter.split_documents(docs)`,
          },
        ],
        detail: [
          'Split on the largest structural unit first, and only descend if the piece is still too big: **heading → paragraph → sentence → token window**.',
          'A short section stays whole; a long one gets broken along seams the author already put there.'
        ],
        example: { before: 'Heading → Paragraph → Sentence', after: 'Descend only while the unit is still too large', mono: true },
        tradeoffs: {
          gains: ['Respects the structure the author wrote', 'Chunks end at natural boundaries', 'Cheap, no model required'],
          costs: ['Uneven chunk sizes', 'Needs structure to exist, useless on a wall of text'],
        },
      },
      {
        id: 'structure',
        label: 'Document Structure',
        tagline: 'Chunk along the document tree, not the text',
        code: [
          {
            title: 'LangChain',
            language: 'python',
            code: `from langchain_text_splitters import MarkdownHeaderTextSplitter

splitter = MarkdownHeaderTextSplitter(headers_to_split_on=[
    ("#", "h1"), ("##", "h2"), ("###", "h3")])
# Each chunk keeps its heading path in metadata, e.g. {"h1": "Indexing",
# "h2": "IVF"}. Prepend it before embedding so the chunk is self-describing.
chunks = splitter.split_text(markdown)`,
            note: 'HTMLHeaderTextSplitter does the same over the DOM. Layer a recursive splitter behind it to cut any oversized section.',
          },
        ],
        detail: [
          'Parse the document into its actual tree and cut on the boundaries the author already declared: **Markdown headings, HTML DOM, DOCX heading styles, notebook cells**.',
          'Each chunk then corresponds to a real section rather than to a position in a character stream, and it arrives carrying the heading path that led to it.',
        ],
        example: {
          beforeLabel: 'Markdown source',
          before: '# Indexing\n## HNSW\nHNSW builds a layered graph...\n## IVF\nIVF partitions the space...',
          afterLabel: 'Chunks, each with its heading path',
          after: 'chunk 1  path: Indexing › HNSW\nchunk 2  path: Indexing › IVF',
          mono: true,
        },
        math: [
          {
            title: 'Breadcrumb prefixing',
            tex: String.raw`\text{chunk}' = \underbrace{h_1 \;\rangle\; h_2 \;\rangle\; \dots}_{\text{heading path}} \;+\; \text{chunk}`,
            note: 'Prepending the heading path to the chunk text before embedding is the trick that makes this pay. A section that says "it partitions the space into cells" is ambiguous alone; prefixed with "Indexing › IVF" it embeds as being about IVF, and becomes retrievable by a query naming IVF.',
          },
          {
            title: 'Sections do not respect your token budget',
            tex: String.raw`|s| \sim \text{highly variable}`,
            worked: [
              { tex: String.raw`\text{a definition section} \approx 40\ \text{tokens}` },
              { tex: String.raw`\text{a tutorial section} \approx 4000\ \text{tokens}`, caption: 'far past any sensible chunk size' },
            ],
            note: 'So this is almost always layered with recursive splitting: cut on structure first, then recursively split any section that is still too large, and merge trivially small ones into their neighbour.',
          },
        ],
        figures: [
          {
            kind: 'blocks',
            title: 'Tree first, then size',
            rows: [
              { label: 'parse', boxes: [{ text: 'document tree: headings, lists, tables, code' }], arrow: 'split at section boundaries' },
              {
                boxes: [
                  { text: '§1 short' },
                  { text: '§2 oversized' },
                  { text: '§3 short' },
                ],
                arrow: 'recursively split only what is too large',
              },
              {
                boxes: [
                  { text: '§1' },
                  { text: '§2a' },
                  { text: '§2b' },
                  { text: '§3' },
                ],
                arrow: 'attach heading path to each',
              },
              { boxes: [{ text: 'chunks that know which section they came from', filled: true }] },
            ],
            caption:
              'Atomic units are never split. A table or a fenced code block is kept whole even when it pushes a chunk over the target size, because half a table retrieves as noise and half a code block does not run. That is the main practical difference from a purely size-driven splitter.',
          },
        ],
        tradeoffs: {
          gains: [
            'Chunks align with what the author considered one topic',
            'Heading path is free metadata, useful for both embedding and filtering',
            'Tables and code blocks stay intact',
          ],
          costs: [
            'Useless on documents with no structure, plain text, bad OCR, scanned PDFs',
            'Section sizes vary wildly, so it needs a recursive pass behind it',
            'Structure quality is inherited from the loader',
          ],
        },
      },
      {
        id: 'semantic',
        label: 'Semantic',
        tagline: 'Split where the topic changes',
        code: [
          {
            title: 'LangChain',
            language: 'python',
            code: `from langchain_experimental.text_splitter import SemanticChunker
from langchain_openai import OpenAIEmbeddings

# Embeds each sentence, cuts where neighbour similarity drops below a
# percentile of this document's own distribution.
splitter = SemanticChunker(
    OpenAIEmbeddings(), breakpoint_threshold_type="percentile")
chunks = splitter.split_documents(docs)`,
          },
        ],
        detail:
          'Boundaries come from meaning, not from counting.\n\n- Split into sentences or paragraphs.\n- Embed each one and walk the sequence comparing neighbours.\n- **Cut wherever similarity drops sharply**; a sharp drop is the signal that the topic moved.',
        figures: [
          {
            kind: 'curve',
            title: 'Neighbour similarity, walked along the document',
            xLabel: 'paragraph pair',
            yLabel: 'cos',
            lines: [
              {
                points: [
                  [1, 0.81],
                  [2, 0.78],
                  [3, 0.84],
                  [4, 0.76],
                  [5, 0.79],
                  [6, 0.83],
                  [7, 0.58],
                  [8, 0.8],
                  [9, 0.77],
                  [10, 0.82],
                  [11, 0.55],
                  [12, 0.79],
                ],
              },
              {
                dashed: true,
                points: [
                  [1, 0.63],
                  [12, 0.63],
                ],
              },
            ],
            marks: [
              { x: 7, y: 0.58, label: 'split' },
              { x: 11, y: 0.55, label: 'split' },
            ],
            xTicks: [
              { at: 1, label: '1' },
              { at: 6, label: '6' },
              { at: 12, label: '12' },
            ],
            yTicks: [
              { at: 0.5, label: '0.5' },
              { at: 0.75, label: '0.75' },
              { at: 1, label: '1' },
            ],
            caption:
              'The dashed line is the threshold τ = μ − ασ, computed from this document’s own distribution rather than fixed in advance, which is what makes the method portable across corpora with different baseline similarity. Two pairs fall below it, giving three chunks of unequal length. Note that the chunk boundaries land where the author changed subject, not at any token count.',
          },
        ],
        math: [
          {
            title: 'Boundary condition',
            tex: String.raw`\text{split between } i, i{+}1 \iff \cos(e_i, e_{i+1}) < \mu - \alpha\sigma`,
            where: [
              { sym: String.raw`e_i`, means: 'embedding of the i-th unit' },
              { sym: String.raw`\mu, \sigma`, means: 'mean and standard deviation of all neighbour similarities in the document' },
              { sym: String.raw`\alpha`, means: 'sensitivity, typically 0.5–1.5' },
            ],
            worked: [
              { tex: String.raw`\mu = 0.74,\ \sigma = 0.11,\ \alpha = 1.0 \Rightarrow \tau = 0.63` },
              { tex: String.raw`\cos(e_7, e_8) = 0.58 < 0.63 \Rightarrow \text{split}`, caption: 'topic shift detected between units 7 and 8' },
            ],
            note: 'Thresholding relative to the document’s own distribution rather than an absolute cutoff is what makes this portable across corpora with different baseline similarity.',
          },
          {
            title: 'Cost of building it',
            tex: String.raw`C = N_{\text{units}} \times c_{\text{embed}}`,
            note: 'Every sentence must be embedded before you know where the chunks are, then the chunks themselves are embedded. Roughly double the ingestion cost of any counting-based method.',
          },
        ],
        example: {
          beforeLabel: 'Procedure',
          before: '1. Split into sentences or paragraphs\n2. Embed each unit\n3. Compare neighbouring embeddings\n4. Similarity drops below threshold?\n5. Start a new chunk there',
          afterLabel: 'Result',
          after: 'Boundaries follow semantic transitions, not token counts',
          mono: true,
        },
        tradeoffs: {
          gains: ['Chunks are topically coherent', 'No arbitrary cuts mid-argument'],
          costs: ['Embeds the corpus twice over', 'Slowest and most expensive to build', 'α needs tuning per corpus'],
        },
      },
      {
        id: 'parent-child',
        label: 'Parent–Child',
        tagline: 'Search small, return large',
        code: [
          {
            title: 'LangChain',
            language: 'python',
            code: `from langchain.retrievers import ParentDocumentRetriever

retriever = ParentDocumentRetriever(
    vectorstore=store,          # indexes the small child chunks
    docstore=InMemoryStore(),   # holds the large parent sections
    child_splitter=RecursiveCharacterTextSplitter(chunk_size=200),
    parent_splitter=RecursiveCharacterTextSplitter(chunk_size=2000),
)  # matches on children, returns their parents to the LLM`,
          },
        ],
        detail: [
          'Keep two levels of the same document:',
          '- **Index the child:** Small child paragraphs embed precisely.',
          '- **Return the parent:** When a child matches, hand the LLM its parent section instead.',
          'This gives you the precision of small chunks with the context of large ones.',
        ],
        math: [
          {
            title: 'Context budget under parent expansion',
            tex: String.raw`T = \sum_{p \in \text{parents}(\text{top-}K)} |p|`,
            where: [
              { sym: String.raw`\text{parents}(\cdot)`, means: 'the distinct parent sections of the retrieved children' },
            ],
            worked: [
              { tex: String.raw`K = 10,\ |p| \approx 2000 \Rightarrow T \le 20{,}000\ \text{tokens}`, caption: 'worst case: ten distinct parents' },
              { tex: String.raw`\text{after deduplicating parents: } 4 \times 2000 = 8000`, caption: 'children often share a parent' },
            ],
            note: 'Deduplicating parents is mandatory, not optional, several children of the same section are the common case, and sending that section repeatedly wastes budget and double-counts the evidence.',
          },
        ],
        example: {
          beforeLabel: 'Indexed & searched',
          before: 'Child, small paragraph (≈200 tokens)',
          afterLabel: 'Retrieved & sent to the LLM',
          after: 'Parent, the whole surrounding section (≈2000 tokens)',
          mono: true,
        },
        tradeoffs: {
          gains: ['Sidesteps the precision-vs-context tradeoff', 'Strong on structured docs'],
          costs: ['Two-tier bookkeeping', 'Parents can blow the context budget fast'],
        },
      },
      {
        id: 'contextual',
        label: 'Contextual Retrieval',
        tagline: 'Prepend a document summary to every chunk',
        code: [
          {
            title: 'Prompt (Anthropic)',
            language: 'text',
            code: `<document>\n{{WHOLE_DOCUMENT}}\n</document>\nHere is the chunk we want to situate within the whole document:\n<chunk>\n{{CHUNK_CONTENT}}\n</chunk>\nPlease give a short succinct context to situate this chunk within the overall document for the purposes of improving search retrieval of the chunk. Answer only with the succinct context and nothing else.`,
            note: 'The generated context is prepended to the chunk before embedding.',
          },
        ],
        detail: [
          'A chunk isolated from its document often loses the context needed to understand it. "The revenue grew 12% in Q3" is useless if it does not mention the company name.',
          'Instead of hoping the embedding model figures it out, ask an LLM to read the whole document and write a 1-2 sentence context summary specifically for that chunk. Prepend the summary to the chunk, then embed the combined text.',
        ],
        tradeoffs: {
          gains: ['Dramatically improves retrieval', 'Works with any embedding model'],
          costs: ['Huge ingestion cost (an LLM call per chunk)'],
        },
      },
      {
        id: 'late-chunking',
        label: 'Late Chunking',
        tagline: 'Embed the whole document, then chunk the vectors',
        detail: [
          'Rather than splitting the text and embedding each piece independently, pass the entire document through a long-context embedding model. Then pool the token-level embeddings to produce vectors for each chunk.',
          'Because the embedding model saw the whole document at once, the vector for a chunk containing just the word "Apple" knows whether the surrounding document is about fruit or computers.',
        ],
        example: {
          beforeLabel: 'Traditional',
          before: 'Split → Embed pieces',
          afterLabel: 'Late Chunking',
          after: 'Embed full document → Pool token vectors',
          mono: true,
        },
        tradeoffs: {
          gains: ['Preserves global context across chunk boundaries', 'Massive improvement in retrieval quality'],
          costs: ['Requires embedding models that support late pooling (e.g. jina-embeddings-v2)'],
        },
      },
    ],
    distinctions: [
      {
        title: 'Recursive vs. document structure',
        body: 'Recursive chunking works on a string with an ordered list of separators, trying paragraph breaks, then sentences, then a token window, and descending only when a piece is still too big. It never parses the document; it just knows that blank lines usually separate paragraphs. Document-structure chunking parses the file into a real tree first and cuts on the boundaries the author declared, which is why it can carry a heading path and refuse to split a table. On clean Markdown or HTML they often produce similar chunks; on a document where the separators lie, only the parser is right. In practice they are layered rather than chosen between.',
      },
    ],
    concepts: [
      {
        id: 'chunk-tension',
        label: 'The size tension',
        kind: 'tradeoff',
        summary: 'Context vs. precision vs. dilution',
        detail: [
          'Three forces pull against each other. Bigger chunks preserve the context that makes a fact interpretable. Smaller chunks embed more precisely and waste less of the prompt budget. And embedding dilution means a big chunk containing one relevant sentence may not be retrievable at all.',
          'Parent–child chunking is the standard escape: optimise the indexed unit for retrieval and the returned unit for generation, instead of forcing one size to do both jobs.',
        ],
      },
      {
        id: 'chunk-boundary',
        label: 'Boundary loss',
        kind: 'pitfall',
        summary: 'A fact split across two chunks is in neither',
        detail: [
          'If a definition begins at the end of chunk 3 and finishes at the start of chunk 4, neither chunk embeds as being about that definition. Both are partial, and both score poorly.',
          'Overlap is the cheap mitigation; recursive and semantic chunking are the structural ones, since they place boundaries where the author already did.',
        ],
      },
      {
        id: 'chunk-eval',
        label: 'Choosing empirically',
        kind: 'method',
        summary: 'Sweep chunk size against recall@K',
        detail: [
          'There is no universal best chunk size. Build a small set of question–answer pairs where you know which chunk should be retrieved, then sweep chunk size and measure recall@K on that set.',
          'The curve is usually flat-topped with a clear falloff on both sides. Pick the middle of the plateau rather than the peak, the peak is noise on a small evaluation set.',
        ],
      },
      {
        id: 'chunk-tokenizer',
        label: 'Tokens, not characters',
        kind: 'pitfall',
        summary: 'Count with the model’s own tokenizer',
        detail: [
          'Splitting on character count produces chunks whose token count varies by a factor of three or more across languages and content types, code and non-Latin scripts are far denser per character than English prose.',
          'Since both the embedding model and the LLM have token limits, count tokens with the same tokenizer the model uses. Chunks sized in characters will silently exceed the embedding model’s window and get truncated, discarding the tail.',
        ],
      },
    ],
    stack: [
      { name: 'LangChain', what: 'RecursiveCharacterTextSplitter and others', url: 'https://python.langchain.com/docs/how_to/#text-splitters' },
      { name: 'LlamaIndex', what: 'SentenceSplitter, SemanticSplitter, node parsers', url: 'https://docs.llamaindex.ai/en/stable/module_guides/loading/node_parsers/' },
      { name: 'Unstructured', what: 'Partition-based chunking by document element', url: 'https://docs.unstructured.io/open-source/core-functionality/chunking' },
      { name: 'spaCy', what: 'Sentence-level splitting with linguistic models', url: 'https://spacy.io/' },
    ],
    trace: {
      headline: 'Corpus chunked',
      payload: '1,847 pages → 9,304 chunks (recursive, ≈480 tokens each)',
    },
  },

  {
    id: 'embedding',
    icon: 'vector',
    label: 'Embedding Generation',
    phase: 'offline',
    kind: 'sequential',
    ordinal: '4',
    tagline: 'Every chunk becomes a dense vector',
    code: [
      {
        title: 'LangChain',
        language: 'python',
        code: `from langchain_openai import OpenAIEmbeddings

embeddings = OpenAIEmbeddings(model="text-embedding-3-large")

# The SAME model must embed the corpus and the queries; mixing two
# models shares no vector space and silently returns nonsense.
vectors = embeddings.embed_documents([c.page_content for c in chunks])`,
        note: 'Swap in HuggingFaceEmbeddings for open models. Check the MTEB leaderboard before committing to one.',
      },
    ],
    detail: [
      'Each chunk goes through the embedding model and comes out as a fixed-length vector. Semantic similarity becomes geometric proximity, which is what makes approximate search possible at all.',
      '**Re-embedding has two very different costs, and confusing them is expensive:**',
      '- **Adding new documents** means embedding only the new chunks.',
      '- **Changing the embedding model** means re-embedding the *entire corpus*. Old and new vectors live in different spaces and cannot be compared.',
    ],
    math: [
      {
        title: 'Cosine similarity',
        tex: String.raw`\cos(q, d) = \frac{q \cdot d}{\lVert q \rVert \, \lVert d \rVert} = \frac{\sum_{i=1}^{n} q_i d_i}{\sqrt{\sum_{i=1}^{n} q_i^2}\ \sqrt{\sum_{i=1}^{n} d_i^2}}`,
        where: [
          { sym: String.raw`q, d`, means: 'query and document vectors' },
          { sym: String.raw`n`, means: 'embedding dimension' },
        ],
        note: 'Bounded in [−1, 1]. Because it divides out magnitude, it measures direction only, which is what you want when chunk lengths differ.',
      },
      {
        title: 'Why normalised vectors let you use inner product',
        tex: String.raw`\lVert q \rVert = \lVert d \rVert = 1 \implies \cos(q,d) = q \cdot d`,
        note: 'Normalise once at write time and the expensive division disappears from every subsequent query. Most vector databases assume this and expose inner product as the fast path.',
      },
      {
        title: 'Raw storage before any compression',
        tex: String.raw`S = N \times n \times b`,
        where: [
          { sym: String.raw`N`, means: 'number of chunks' },
          { sym: String.raw`n`, means: 'dimensions per vector' },
          { sym: String.raw`b`, means: 'bytes per component (4 for float32)' },
        ],
        worked: [
          { tex: String.raw`S = 10^6 \times 1536 \times 4 = 6.14\ \text{GB}`, caption: 'one million chunks at 1536-d' },
          { tex: String.raw`S = 10^8 \times 1536 \times 4 = 614\ \text{GB}`, caption: 'a hundred million, now compression is not optional' },
        ],
      },
    ],
    example: { before: 'Chunk', after: 'Embedding Model → Vector ∈ ℝⁿ', mono: true },
    stack: [
      { name: 'OpenAI', what: 'text-embedding-3-small / large, the default choice', url: 'https://platform.openai.com/docs/guides/embeddings' },
      { name: 'Cohere', what: 'Embed v3, multilingual, with input_type parameter', url: 'https://cohere.com/embed' },
      { name: 'Voyage AI', what: 'Code and domain-specific embedding models', url: 'https://www.voyageai.com/' },
      { name: 'Sentence Transformers', what: 'Open-source bi-encoders (E5, BGE, GTE)', url: 'https://www.sbert.net/' },
      { name: 'Ollama', what: 'Run embedding models locally (nomic-embed, mxbai)', url: 'https://ollama.com/' },
    ],
    distinctions: [
      {
        title: 'Incremental vs. full re-embedding',
        body: 'New documents → embed just those chunks, append to the index. New embedding model → re-embed everything. There is no partial migration; a half-migrated index silently returns nonsense, because vectors from two models are not comparable and nothing raises an error.',
      },
    ],
    concepts: [
      {
        id: 'emb-asymmetric',
        label: 'Asymmetric retrieval',
        kind: 'idea',
        summary: 'Queries and passages are not the same kind of text',
        detail: [
          'Embedding tasks divide by whether the two things being compared are the same kind of text:',
          '- **Symmetric tasks** compare like with like: sentence against sentence, or question against question (e.g. semantic cache, near-duplicate detection).',
          '- **Asymmetric tasks** do not: a short interrogative on one side, a long declarative passage on the other.',
          '**RAG retrieval is asymmetric**, and this is the single most common mismatch. A model tuned for sentence similarity is measuring "do these two sentences mean the same thing". The question being asked is "does this passage answer this query".',
          'Three ways this gets handled:',
          '1. **Train asymmetrically**, using query and passage pairs so the objective matches the task.',
          '2. **Mark the sides explicitly** with instruction prefixes so one encoder can serve both roles.',
          '3. **Change the shape of the input** at query time, which is what HyDE does by writing a passage-shaped hypothetical, and what doc2query does from the other end by attaching generated questions to each chunk.',
        ],
        math: [
          {
            title: 'Two objectives, two different things being learned',
            tex: String.raw`\text{symmetric: } \text{sim}(a, b) \approx \text{sim}(b, a) \ \text{over like inputs}`,
            worked: [
              { tex: String.raw`\text{asymmetric: } f_{q}(q) \cdot f_{d}(d) \ \text{where } f_q \neq f_d \ \text{in role}` },
            ],
            note: 'Even when one shared encoder is used, the prefix makes the two roles distinguishable, so the model can learn a direction rather than a symmetric distance.',
          },
        ],
        figures: [
          {
            kind: 'blocks',
            title: 'Same encoder, different roles',
            rows: [
              { label: 'symmetric task', boxes: [{ text: 'sentence A' }, { text: 'sentence B' }], arrow: 'same shape, same role' },
              { boxes: [{ text: 'are these two the same thing?', filled: true }] },
              { label: 'asymmetric task', boxes: [{ text: '"query: ..." (short)' }, { text: '"passage: ..." (long)' }], arrow: 'different shape, different role' },
              { boxes: [{ text: 'does this passage answer this query?', filled: true }] },
            ],
            caption:
              'The prefixes are not decoration. They tell the model which role the text is playing, which is what lets one encoder produce a direction-aware score rather than a symmetric distance. Applying the same prefix to both sides collapses an asymmetric model back into a symmetric one.',
          },
        ],
        children: [
          {
            id: 'emb-prefix-detail',
            label: 'Getting the prefixes right',
            kind: 'pitfall',
            summary: 'Silent recall loss, no error anywhere',
            detail: [
              'Models in the E5 and BGE families expect `"query: "` on the query side and `"passage: "` on the document side; newer instruction-tuned models take a natural-language task description instead. Whatever the convention, it was present during training and the representation shifts with it.',
              '**Every failure mode here is silent:**',
              '- Omitting the prefixes gives degraded but plausible results.',
              '- Applying `"query: "` to both sides gives degraded but plausible results.',
              '- Indexing with one convention and querying with another gives degraded but plausible results.',
              'Assert it in code rather than trusting a convention, and store the prefix convention alongside the model id in the artifact manifest so a mismatch is detectable rather than merely suspected.',
            ],
          },
          {
            id: 'emb-symmetric-uses',
            label: 'When symmetric is what you want',
            kind: 'method',
            summary: 'Not every embedding in the system is for retrieval',
            detail: [
              'Several stages here compare like with like, and those are genuinely symmetric:',
              '- **Semantic chunking** compares neighbouring paragraphs.',
              '- **Deduplication** compares chunk against chunk.',
              '- **Semantic cache** compares an incoming query against stored queries.',
              'Using an asymmetric retrieval model for those is a mild mismatch in the other direction. The case worth being deliberate about is the semantic cache, where the threshold is doing safety-critical work, so a model that is actually good at sentence similarity is the right choice.',
            ],
          },
        ],
      },
      {
        id: 'emb-dim',
        label: 'Dimensionality',
        kind: 'tradeoff',
        summary: 'More dimensions, more cost, diminishing returns',
        detail: [
          'Retrieval quality rises with dimension but flattens quickly, while **memory and search cost rise linearly forever**. Doubling from 768 to 1536 rarely doubles anything except the bill.',
          'The question is normally settled at model-selection time, because truncating an ordinary embedding destroys it. Matryoshka training changes that, and turns dimension into a runtime dial.',
        ],
        math: [
          {
            title: 'Truncation saving',
            tex: String.raw`\frac{S_{512}}{S_{1536}} = \frac{512}{1536} = 0.333`,
            note: 'A third of the memory and a third of the distance-computation work. Whether that costs you recall depends entirely on how the model was trained.',
          },
        ],
        children: [
          {
            id: 'emb-mrl',
            label: 'Matryoshka Representation Learning',
            kind: 'method',
            summary: 'Every prefix of the vector is itself a valid embedding',
            code: [
              {
                title: 'LangChain',
                language: 'python',
                code: `from langchain_openai import OpenAIEmbeddings

# text-embedding-3-* are Matryoshka-trained: ask for a shorter vector
# and every prefix is still a valid embedding.
short = OpenAIEmbeddings(model="text-embedding-3-large", dimensions=256)
full  = OpenAIEmbeddings(model="text-embedding-3-large", dimensions=3072)
# Shortlist the corpus with 'short', re-score the shortlist with 'full'.`,
                note: 'Renormalise after truncating if you slice vectors yourself; the API-side dimensions argument already returns normalised vectors.',
              },
            ],
            detail: [
              'In an ordinary embedding the information is spread across all dimensions with no particular ordering, so the first 64 numbers mean nothing on their own. Cutting the vector short does not give you a smaller embedding; it gives you a broken one.',
              'Matryoshka Representation Learning changes the training objective so that nested prefixes are each trained to work as standalone embeddings. The loss is applied at several dimensionalities at once, typically 64, 128, 256, 512, 1024 and the full width, and summed. The model is therefore pushed to put the coarsest, most discriminative structure in the earliest dimensions and to use later dimensions for progressively finer distinctions. The name is the point: each prefix is a smaller complete doll nested inside the next.',
              'The practical consequence is that one stored vector serves many budgets. You embed once at full width, then truncate at read time to whatever the situation can afford, and you renormalise after truncating because slicing changes the vector length.',
              'This enables adaptive retrieval, which is the pattern worth knowing. Shortlist over the whole corpus using a short prefix, which is cheap in both memory and distance computation, then re-score only that shortlist using the full vectors you already have. It is the same shortlist-then-refine shape as quantisation with re-scoring, except the fidelity dial is dimensions rather than bits, and unlike quantisation it needs no codebook and no training pass of your own.',
            ],
            math: [
              {
                title: 'The training objective, in outline',
                tex: String.raw`\mathcal{L} = \sum_{d \in \mathcal{D}} w_d \cdot \mathcal{L}_{\text{contrastive}}\big(x_{1:d}\big)`,
                where: [
                  { sym: String.raw`\mathcal{D}`, means: 'nested widths, e.g. {64, 128, 256, 512, 1024, 1536}' },
                  { sym: String.raw`x_{1:d}`, means: 'the first d components of the embedding' },
                ],
                note: 'One model, one forward pass, but the loss is evaluated on every prefix. Nothing at inference time is special; the structure was baked in during training.',
              },
              {
                title: 'Truncate, then renormalise',
                tex: String.raw`\hat{x}_{1:d} = \frac{x_{1:d}}{\lVert x_{1:d} \rVert}`,
                note: 'A prefix of a unit vector is not a unit vector. Skipping the renormalisation quietly biases inner-product search toward whichever vectors happened to keep more of their magnitude in the early dimensions.',
              },
              {
                title: 'Adaptive retrieval cost',
                tex: String.raw`C = \underbrace{N \cdot d_{\text{short}}}_{\text{shortlist}} + \underbrace{K' \cdot d_{\text{full}}}_{\text{re-score}}`,
                worked: [
                  { tex: String.raw`10^6 \times 128 = 1.28 \times 10^8`, caption: 'shortlist the corpus at 128-d' },
                  { tex: String.raw`200 \times 1536 = 3.07 \times 10^5`, caption: 're-score 200 candidates at full width' },
                  { tex: String.raw`\text{vs } 10^6 \times 1536 = 1.54 \times 10^9`, caption: 'roughly 12x less work than full-width search' },
                ],
              },
            ],
            figures: [
              {
                kind: 'bars',
                title: 'Recall retained after truncating to d',
                categories: ['64', '128', '256', '512', '1536'],
                showValues: true,
                yMax: 1,
                series: [
                  { label: 'Matryoshka', values: [0.87, 0.93, 0.97, 0.99, 1.0] },
                  { label: 'naive cut', values: [0.21, 0.34, 0.52, 0.71, 1.0] },
                ],
                caption:
                  'Illustrative shape rather than measured numbers, but the gap is the real finding. Truncating a Matryoshka embedding degrades gently, so 256 dimensions is often close enough to use for the first pass. Truncating a conventional embedding collapses, because nothing ever asked the early dimensions to be sufficient on their own.',
              },
            ],
            tradeoffs: {
              gains: [
                'One stored vector serves every dimension budget',
                'Shortlist cheaply, re-score at full width, no extra storage',
                'Dimension becomes a deployment decision, not a model-selection one',
              ],
              costs: [
                'Only works if the model was trained this way',
                'Prefixes must be renormalised after slicing',
                'Full-width vectors still have to be stored somewhere for the re-score pass',
              ],
            },
          },
        ],
      },
      {
        id: 'emb-metric',
        label: 'Choosing the metric',
        kind: 'formula',
        summary: 'Cosine, inner product, or L2',
        detail: [
          'Use whichever metric the model was trained with; this is not a free choice. A model trained with a cosine objective will underperform under L2 and vice versa.',
        ],
        math: [
          {
            title: 'Squared Euclidean distance',
            tex: String.raw`\lVert q - d \rVert^2 = \lVert q \rVert^2 + \lVert d \rVert^2 - 2\,q \cdot d`,
            note: 'On normalised vectors the first two terms are both 1, so ‖q − d‖² = 2 − 2·cos(q,d). L2 and cosine then rank identically, the choice only matters when vectors are not normalised.',
          },
        ],
      },
      {
        id: 'emb-reembed',
        label: 'Re-embedding migrations',
        kind: 'pitfall',
        summary: 'Mixing two models yields silent nonsense',
        detail: [
          'Vectors from different models occupy unrelated spaces. Querying an index containing both returns results that are geometrically valid and semantically meaningless, with no error raised anywhere.',
          'Migrate by building a second index alongside the first and cutting over atomically. Stamp every vector with its model identifier and version so a mixed index is detectable rather than merely suspected.',
        ],
      },
    ],
    trace: {
      headline: 'Chunks embedded',
      payload: '9,304 chunks → 9,304 × 1536-d vectors (57 MB, float32)',
    },
  },

  {
    id: 'index-structure',
    icon: 'graph',
    label: 'Index Structure',
    phase: 'offline',
    kind: 'choice',
    ordinal: '5a',
    tagline: 'Which vectors get compared at all',
    detail: [
      'Exhaustive search compares the query against every vector: exact, and linear in corpus size. An Approximate Nearest Neighbour structure trades a sliver of recall for orders of magnitude in speed by ruling out most of the corpus without looking at it.',
      'This axis answers one question only: which subset of vectors do we actually score? How those vectors are *stored* is a separate, independent decision; that is compression, the next stage.',
    ],
    math: [
      {
        title: 'Recall@K of the index itself',
        tex: String.raw`\text{recall}_{\text{ANN}} = \frac{|\text{ANN top-}K \cap \text{exact top-}K|}{K}`,
        note: 'Measured against brute-force ground truth on a sample. This is the number every ANN parameter trades against latency, and it is distinct from the retrieval recall you measure against human relevance labels.',
      },
    ],
    stack: [
      { name: 'FAISS', what: 'Meta\'s library for efficient similarity search (Flat, IVF, HNSW, PQ)', url: 'https://github.com/facebookresearch/faiss' },
      { name: 'Annoy', what: 'Spotify\'s approximate NN with random projection trees', url: 'https://github.com/spotify/annoy' },
      { name: 'ScaNN', what: 'Google\'s ANN with learned quantisation', url: 'https://github.com/google-research/google-research/tree/master/scann' },
      { name: 'hnswlib', what: 'Lightweight, header-only C++ HNSW implementation', url: 'https://github.com/nmslib/hnswlib' },
    ],
    variants: [
      {
        id: 'flat',
        label: 'Flat',
        tagline: 'Exhaustive, compare against everything',
        detail:
          'No index at all: score the query against every vector and sort. Recall is exactly 1.0 by definition, because this *is* the ground truth. Perfectly reasonable below roughly a million vectors, especially with SIMD-accelerated distance kernels.',
        math: [
          {
            title: 'Cost',
            tex: String.raw`C_{\text{flat}} = N \times n`,
            worked: [
              { tex: String.raw`C = 10^6 \times 1536 = 1.54 \times 10^9\ \text{multiply-adds}`, caption: 'a few milliseconds with SIMD' },
              { tex: String.raw`C = 10^8 \times 1536 = 1.54 \times 10^{11}`, caption: 'now it is seconds, you need a real index' },
            ],
          },
        ],
        tradeoffs: {
          gains: ['Perfect recall', 'Zero build time', 'No parameters to tune', 'Trivial deletes and updates'],
          costs: ['Latency grows linearly with corpus size', 'Impractical past a few million vectors'],
        },
      },
      {
        id: 'ivf',
        label: 'IVF',
        tagline: 'Partition into cells, search only a few',
        detail:
          'Inverted File index. Run k-means over the corpus to learn nlist centroids, and assign every vector to its nearest one. At query time, find the nprobe centroids closest to the query and search only those cells, ignoring the rest of the corpus entirely.',
        math: [
          {
            title: 'Vectors actually scanned',
            tex: String.raw`N_{\text{scan}} \approx N \times \frac{n_{\text{probe}}}{n_{\text{list}}}`,
            where: [
              { sym: String.raw`n_{\text{list}}`, means: 'number of cells (a common heuristic is √N)' },
              { sym: String.raw`n_{\text{probe}}`, means: 'cells searched per query, the recall/speed dial' },
            ],
            worked: [
              { tex: String.raw`N_{\text{scan}} = 10^7 \times \tfrac{16}{4096} \approx 39{,}063`, caption: '256× fewer comparisons than exhaustive' },
              { tex: String.raw`N_{\text{scan}} = 10^7 \times \tfrac{64}{4096} \approx 156{,}250`, caption: 'nprobe 16 → 64: 4× slower, recall perhaps 0.92 → 0.98' },
            ],
            note: 'nprobe is adjustable at query time without rebuilding, which makes it the one ANN parameter you can tune in production against live traffic.',
          },
        ],
        tradeoffs: {
          gains: ['Fast', 'Query-time recall dial via nprobe', 'Modest memory beyond the vectors', 'Pairs naturally with PQ'],
          costs: ['Needs a k-means training pass', 'Recall drops for queries near cell boundaries', 'Distribution drift degrades the partition over time'],
        },
      },
      {
        id: 'hnsw',
        label: 'HNSW',
        tagline: 'Hierarchical navigable small-world graph',
        detail: [
          '**A small-world graph.** Most links connect near neighbours, but a few are long-range shortcuts. That mix lets any node reach any other in a handful of hops, the same property social networks have.',
          '**Navigable by greedy search.** From the current node, look at its neighbours and jump to whichever is closest to the query. Repeat until no neighbour is closer. That stopping point is a *local minimum*, and on a well-built graph it is the true nearest neighbour. The first diagram below animates exactly this walk.',
          '**A hierarchy of graphs, the probability skip list.** Each vector is assigned a random maximum layer whose probability decays exponentially, so the top layer holds only a few nodes and each layer down holds roughly *e* times more. The base layer L0 holds every node.',
          '**Sparse on top, dense at the bottom.** Upper layers have few nodes and long links, for crossing the space fast. Lower layers have many nodes and short links, for fine refinement.',
          '**Search descends layer by layer.** Enter at the sparse top, greedily hop to a local minimum, then drop to the same node one layer down and hop again. Long coarse hops first, short precise hops last, which is what gives the O(log N) cost. The second diagram animates this descent.',
        ],
        math: [
          {
            title: 'Layer assignment',
            tex: String.raw`\ell = \left\lfloor -\ln(U) \cdot m_L \right\rfloor, \quad U \sim \text{Uniform}(0,1)`,
            where: [
              { sym: String.raw`m_L`, means: 'level normalisation, usually 1/ln(M)' },
            ],
            note: 'The exponential decay means each layer holds roughly 1/e of the one below, giving the logarithmic hop count.',
          },
          {
            title: 'Search complexity',
            tex: String.raw`O(\log N)`,
            note: 'Versus O(N) exhaustive and O(N·nprobe/nlist) for IVF. This is why HNSW dominates at high recall targets.',
          },
          {
            title: 'Memory, graph edges on top of the vectors',
            tex: String.raw`S_{\text{graph}} \approx N \times M \times 2 \times 4\ \text{bytes}`,
            where: [{ sym: String.raw`M`, means: 'edges per node per layer, typically 16–64' }],
            worked: [
              { tex: String.raw`10^6 \times 16 \times 2 \times 4 = 128\ \text{MB}`, caption: 'graph overhead alone, on top of 6.1 GB of vectors' },
              { tex: String.raw`10^6 \times 64 \times 2 \times 4 = 512\ \text{MB}`, caption: 'M = 64 for higher recall' },
            ],
          },
        ],
        figures: [
          {
            kind: 'network',
            title: 'Step 1 · Greedy search, scored live',
            nodes: [
              { id: 'entry', x: 38, y: 168, isEntry: true },
              { id: 'a', x: 95, y: 120 },
              { id: 'b', x: 108, y: 188 },
              { id: 'c', x: 168, y: 88 },
              { id: 'd', x: 178, y: 158 },
              { id: 'e', x: 238, y: 128 },
              { id: 'f', x: 250, y: 60 },
              { id: 'g', x: 300, y: 110 },
              { id: 'h', x: 320, y: 168 },
              { id: 'k', x: 335, y: 70 },
              { id: 'query', x: 366, y: 52, isTarget: true, label: 'query' }
            ],
            links: [
              { source: 'entry', target: 'a' },
              { source: 'entry', target: 'b' },
              { source: 'a', target: 'c' },
              { source: 'a', target: 'd' },
              { source: 'a', target: 'e' },
              { source: 'b', target: 'd' },
              { source: 'c', target: 'd' },
              { source: 'c', target: 'f' },
              { source: 'd', target: 'e' },
              { source: 'e', target: 'f' },
              { source: 'e', target: 'g' },
              { source: 'f', target: 'g' },
              { source: 'f', target: 'k' },
              { source: 'g', target: 'h' },
              { source: 'g', target: 'k' },
              { source: 'h', target: 'k' }
            ],
            steps: [
              'The pulsing ring marks the node the search is currently sitting on.',
              'The table scores every neighbour by similarity to the query (higher is closer).',
              'The best-scoring neighbour, and its node, are highlighted.',
              'The search hops there, then repeats, until no neighbour beats the current node: the local minimum, and the answer.',
            ],
            caption:
              'Similarity here is a stand-in for cosine similarity to the query vector. The walk never backtracks because each hop strictly increases similarity; a few long-range "small-world" edges are what let it cross the space in only four hops.',
          },
          {
            kind: 'layered',
            title: 'Step 2 · Descending the layer hierarchy',
            layers: [2, 1, 0],
            layerLabels: [
              { layer: 2, text: 'sparsest\nlong hops' },
              { layer: 1, text: 'denser\nshorter hops' },
              { layer: 0, text: 'all N nodes\nfinest search' },
            ],
            nodes: [
              { id: 'nA', x: 80, y: 0, maxLayer: 2, isEntry: true },
              { id: 'nB', x: 220, y: 0, maxLayer: 2 },
              { id: 'nC', x: 150, y: 0, maxLayer: 1 },
              { id: 'nD', x: 300, y: 0, maxLayer: 1 },
              { id: 'nE', x: 50, y: 0, maxLayer: 0 },
              { id: 'nF', x: 110, y: 0, maxLayer: 0 },
              { id: 'nG', x: 180, y: 0, maxLayer: 0 },
              { id: 'nH', x: 260, y: 0, maxLayer: 0 },
              { id: 'nI', x: 330, y: 0, maxLayer: 0 },
              { id: 'target', x: 355, y: 0, maxLayer: 0, isTarget: true }
            ],
            links: [
              { source: 'nA', target: 'nB', layer: 2 },
              { source: 'nA', target: 'nC', layer: 1 },
              { source: 'nC', target: 'nB', layer: 1 },
              { source: 'nB', target: 'nD', layer: 1 },
              { source: 'nA', target: 'nE', layer: 0 },
              { source: 'nE', target: 'nF', layer: 0 },
              { source: 'nF', target: 'nC', layer: 0 },
              { source: 'nC', target: 'nG', layer: 0 },
              { source: 'nG', target: 'nB', layer: 0 },
              { source: 'nB', target: 'nH', layer: 0 },
              { source: 'nH', target: 'nD', layer: 0 },
              { source: 'nD', target: 'nI', layer: 0 },
              { source: 'nI', target: 'target', layer: 0 }
            ],
            path: [
              { node: 'nA', layer: 2 },
              { node: 'nB', layer: 2 },
              { node: 'nB', layer: 1 },
              { node: 'nD', layer: 1 },
              { node: 'nD', layer: 0 },
              { node: 'nI', layer: 0 },
              { node: 'target', layer: 0 }
            ],
            steps: [
              'Enter at the top layer, which holds only a few nodes joined by long links.',
              'Greedily hop toward the query until no neighbour on this layer is closer.',
              'Drop straight down to the same node one layer below (the dashed line).',
              'Each lower layer is denser, so hops get shorter and more precise.',
              'On the base layer L0, which holds every node, the final walk reaches the query.',
            ],
            caption:
              'The same greedy search as above, run once per layer. Starting sparse and finishing dense is what turns a linear scan into a logarithmic one: the early layers throw away most of the graph in a few long hops.',
          }
        ],
        tradeoffs: {
          gains: ['Best recall-per-millisecond at high recall', 'No training pass', 'Incremental inserts', 'ef_search tunable at query time'],
          costs: ['Largest memory footprint', 'Deletes only tombstone, space reclaims on rebuild', 'Slow to build'],
        },
      },
    ],
    concepts: [
      {
        id: 'idx-params',
        label: 'The tuning dials',
        kind: 'method',
        summary: 'Build-time vs. query-time parameters',
        detail: [
          'Query-time parameters are the ones you can move in production: nprobe for IVF, ef_search for HNSW. Both trade latency for recall along a smooth curve, and both can be adjusted per request, spend more on high-value queries, less on autocomplete.',
          'Build-time parameters are commitments: nlist for IVF, M and ef_construction for HNSW. Changing them means a full rebuild, so pick them from a benchmark on representative data rather than from folklore.',
        ],
        children: [
          {
            id: 'idx-ef',
            label: 'ef_search',
            kind: 'formula',
            summary: 'Size of the HNSW candidate frontier',
            detail: [
              'The dynamic candidate list kept during the greedy walk. Larger means more of the graph explored, higher recall, more distance computations.',
              'It must be at least K. Values of 64–256 are typical; the curve flattens hard past a few hundred, so measure rather than raising it hopefully.',
            ],
          },
          {
            id: 'idx-nlist',
            label: 'nlist',
            kind: 'formula',
            summary: 'How many IVF cells to build',
            math: [
              {
                title: 'Common heuristic',
                tex: String.raw`n_{\text{list}} \approx \sqrt{N}`,
                worked: [{ tex: String.raw`N = 10^7 \Rightarrow n_{\text{list}} \approx 3162 \rightarrow 4096`, caption: 'rounded to a power of two' }],
                note: 'Too few cells and each is huge, so scanning one is expensive. Too many and vectors per cell get thin, so recall needs a larger nprobe, cancelling the benefit.',
              },
            ],
          },
        ],
      },
      {
        id: 'idx-curse',
        label: 'Why approximate at all',
        kind: 'idea',
        summary: 'High dimensions break exact methods',
        detail: [
          'Classical exact structures such as k-d trees degrade to exhaustive scan above roughly 20 dimensions. Embeddings have hundreds or thousands, so exact spatial indexing is simply off the table.',
          'ANN methods sidestep this by abandoning the guarantee. They find the true nearest neighbours *usually*, and since retrieval feeds a reranker and then an LLM, occasionally missing the 9th-best chunk costs far less than a linear scan.',
        ],
      },
      {
        id: 'idx-updates',
        label: 'Updates and deletes',
        kind: 'pitfall',
        summary: 'Every structure handles churn differently',
        detail: [
          'Flat is trivial: append and remove. IVF assigns new vectors to existing centroids, which is cheap but drifts, as the corpus evolves the learned partition stops matching the data and recall decays until you retrain.',
          'HNSW cannot truly delete. Removals are tombstoned and skipped during search, so memory is never reclaimed and the graph slowly fills with holes that lengthen every walk. A corpus with heavy churn needs periodic rebuilds regardless of which structure you chose.',
        ],
      },
    ],
    trace: {
      headline: 'Index structure built',
      payload: 'HNSW · M = 16 · ef_construction = 200 · 9,304 nodes',
      note: 'Graph overhead ≈ 1.2 MB on top of the vectors.',
    },
  },

  {
    id: 'compression',
    icon: 'compress',
    label: 'Vector Compression',
    phase: 'offline',
    kind: 'choice',
    ordinal: '5b',
    tagline: 'How each vector is stored, orthogonal to the index',
    detail: [
      '**Quantisation is not an indexing method:**',
      '- It does not decide *which* vectors to compare; it decides *how many bytes* each occupies and how its distance is approximated.',
      '- It composes with any index structure. IVF-PQ and HNSW-PQ are ordinary combinations, not distinct algorithms.',
      '**Why it matters:** Memory, not compute, is what stops vector search from scaling. A hundred million 1536-d float32 vectors is 614 GB (a fleet of machines). At 64× compression it is under 10 GB (one machine).',
      '**The tradeoff:** Every compression scheme is lossy, so distances become estimates and recall drops. The standard remedy is a **two-pass search**: shortlist on compressed vectors, then re-score that shortlist against the exact ones.',
    ],
    math: [
      {
        title: 'Compression ratio',
        tex: String.raw`\rho = \frac{n \times 4\ \text{bytes}}{\text{bytes after quantisation}}`,
        worked: [
          { tex: String.raw`\text{float32: } 1536 \times 4 = 6144\ \text{bytes}`, caption: 'the baseline, per vector' },
        ],
      },
    ],
    figures: [
      {
        kind: 'bars',
        title: 'Bytes per 1536-d vector',
        categories: ['none', 'SQ8', 'binary', 'PQ'],
        showValues: true,
        yMax: 6144,
        series: [{ label: '', values: [6144, 1536, 192, 96] }],
        caption:
          'The same vector under each scheme. SQ8 is the one most teams should be using and are not, a quarter of the memory for a recall loss usually lost in measurement noise. PQ and binary are different tools: they are so lossy that both effectively require a second pass re-scoring the shortlist against exact vectors, which is fine, because you only re-score a few hundred candidates per query.',
      },
    ],
    variants: [
      {
        id: 'none',
        label: 'None (float32)',
        tagline: 'Exact vectors, exact distances',
        detail: [
          '**How it works:** Store the raw floats.',
          '**The result:** Distances are exact, so the only recall loss in the whole system comes from the index structure.',
          '**When to use:** The right default until memory actually hurts.',
        ],
        math: [
          {
            title: 'Footprint',
            tex: String.raw`S = N \times n \times 4`,
            worked: [{ tex: String.raw`10^6 \times 1536 \times 4 = 6.14\ \text{GB}` }],
          },
        ],
        tradeoffs: {
          gains: ['No approximation error', 'No training', 'Nothing to tune'],
          costs: ['Largest possible memory footprint'],
        },
      },
      {
        id: 'sq',
        label: 'Scalar (SQ8)',
        tagline: 'float32 → int8, per dimension',
        detail: [
          '**How it works:** Map each dimension independently onto 256 levels between its observed minimum and maximum.',
          '**The tradeoff:** Four times smaller and cheap to compute, and typically costs well under 1% of recall.',
          '**When to use:** It provides the best effort-to-benefit ratio available.',
        ],
        math: [
          {
            title: 'Quantise and reconstruct',
            tex: String.raw`\begin{aligned} q(x) &= \left\lfloor \frac{x - x_{\min}}{x_{\max} - x_{\min}} \cdot 255 \right\rceil \\[6pt] \hat{x} &= x_{\min} + \frac{q(x)}{255}\,(x_{\max} - x_{\min}) \end{aligned}`,
            worked: [
              { tex: String.raw`x = 0.42,\quad x_{\min} = -1,\quad x_{\max} = 1` },
              { tex: String.raw`q = \lfloor 181.05 \rceil = 181` },
              { tex: String.raw`\hat{x} = -1 + \tfrac{181}{255}(2) = 0.4196`, caption: 'reconstruction error 0.0004' },
            ],
          },
          {
            title: 'Ratio',
            tex: String.raw`\rho = \frac{4\ \text{bytes}}{1\ \text{byte}} = 4\times`,
            worked: [{ tex: String.raw`6.14\ \text{GB} \rightarrow 1.54\ \text{GB}` }],
          },
        ],
        tradeoffs: {
          gains: ['4× smaller', 'Negligible recall loss', 'Fast, and trivial to implement'],
          costs: ['Only 4×, not enough at very large scale', 'Outlier dimensions widen the range and coarsen everything else'],
        },
      },
      {
        id: 'pq',
        label: 'Product Quantisation',
        tagline: 'Split into subvectors, replace each with a codebook id',
        detail: [
          '**How it works:** Cut the vector into `m` contiguous subvectors. Run k-means separately within each subspace to learn `2^b` centroids, and store only which centroid each subvector landed on.',
          '**The result:** A 1536-d vector becomes `m` bytes. You are no longer storing the vector at all, only a list of "which of 256 prototypes did this slice most resemble".',
        ],
        figures: [
          {
            kind: 'blocks',
            title: 'What PQ actually stores',
            rows: [
              {
                label: 'one 1536-d float32 vector',
                boxes: [{ text: '6144 bytes' }],
                arrow: 'split into m = 96 slices of 16 dims',
              },
              {
                boxes: [
                  { text: 'x¹' },
                  { text: 'x²' },
                  { text: 'x³' },
                  { text: '…' },
                  { text: 'x⁹⁶' },
                ],
                arrow: 'nearest of 256 centroids, per slice',
              },
              {
                boxes: [
                  { text: '17' },
                  { text: '204' },
                  { text: '3' },
                  { text: '…' },
                  { text: '91' },
                ],
                arrow: 'keep only the ids',
              },
              { boxes: [{ text: '96 bytes, 64× smaller', filled: true }] },
            ],
            caption:
              'Each slice is quantised by its own independent codebook, learned only over those 16 dimensions. The stored vector is 96 single-byte ids. Note what this buys at query time: precompute the distance from the query to all 256 centroids in each subspace once, and scoring any database vector becomes 96 table lookups and 96 additions, no floating-point multiplies at all.',
          },
        ],
        math: [
          {
            title: 'Decomposition',
            tex: String.raw`x = [\underbrace{x^{(1)}}_{n/m}, x^{(2)}, \dots, \underbrace{x^{(m)}}_{n/m}], \qquad x^{(j)} \in \mathbb{R}^{n/m}`,
            note: 'Each subvector is quantised by its own independent codebook, learned only over that slice of the dimensions.',
          },
          {
            title: 'Encoded size',
            tex: String.raw`S_{\text{code}} = m \times b \ \text{bits}`,
            where: [
              { sym: String.raw`m`, means: 'number of subvectors' },
              { sym: String.raw`b`, means: 'bits per code, almost always 8 → 256 centroids' },
            ],
            worked: [
              { tex: String.raw`n = 1536,\ m = 96 \Rightarrow \text{subvector dim} = 16` },
              { tex: String.raw`S_{\text{code}} = 96 \times 8\ \text{bits} = 96\ \text{bytes}` },
              { tex: String.raw`\rho = \frac{6144}{96} = 64\times`, caption: '6.14 GB → 96 MB per million vectors' },
            ],
          },
          {
            title: 'Expressive power of the codebook',
            tex: String.raw`(2^b)^m = 256^{96} \approx 10^{231}`,
            note: 'The representable set is astronomically large despite only 96 bytes; this is why PQ beats naively quantising all 1536 dimensions at once.',
          },
          {
            title: 'Asymmetric distance computation (ADC)',
            tex: String.raw`\lVert q - \hat{x} \rVert^2 = \sum_{j=1}^{m} \lVert q^{(j)} - c^{(j)}_{k_j} \rVert^2`,
            where: [
              { sym: String.raw`c^{(j)}_{k_j}`, means: 'the centroid chosen for subvector j of x' },
            ],
            note: 'The query is never quantised. Precompute a 256×m table of squared distances from each query subvector to every centroid, then scoring any database vector is m table lookups and m additions, no multiplications at all.',
          },
          {
            title: 'Training cost',
            tex: String.raw`m \text{ separate k-means runs over } \mathbb{R}^{n/m}`,
            note: 'Needs a representative sample, a common rule is at least 256 × 39 ≈ 10,000 training vectors per subspace for stable centroids.',
          },
        ],
        tradeoffs: {
          gains: ['32–64× compression', 'Billion-scale corpora fit in RAM', 'ADC scoring is lookup-and-add, no float multiplies'],
          costs: ['Lossy, real recall loss', 'Requires a training pass and retraining on drift', 'Almost always needs a re-scoring pass'],
        },
      },
      {
        id: 'binary',
        label: 'Binary',
        tagline: 'One bit per dimension',
        detail: [
          '**How it works:** Keep only the sign of each component.',
          '**The result:** Similarity becomes Hamming distance, computed with XOR and a popcount instruction. Extraordinarily fast, and 32× smaller.',
          '**When to use:** Far too lossy to be a final answer, but excellent as a first-pass filter that a re-scoring stage then cleans up.',
        ],
        math: [
          {
            title: 'Encoding and scoring',
            tex: String.raw`\hat{x}_i = \begin{cases} 1 & x_i > 0 \\ 0 & \text{otherwise} \end{cases} \qquad d_H(a,b) = \text{popcount}(a \oplus b)`,
            worked: [
              { tex: String.raw`1536\ \text{bits} = 192\ \text{bytes} \Rightarrow \rho = 32\times` },
              { tex: String.raw`\text{scoring} = 24 \times \text{64-bit XOR + popcount}`, caption: 'a handful of CPU cycles per vector' },
            ],
          },
        ],
        tradeoffs: {
          gains: ['32× smaller', 'Fastest possible scoring', 'No training required'],
          costs: ['Heavy recall loss standalone', 'Only viable as a shortlist feeding a re-score pass'],
        },
      },
    ],
    concepts: [
      {
        id: 'comp-orthogonal',
        label: 'Orthogonal to indexing',
        kind: 'idea',
        summary: 'IVF-PQ is a composition, not an algorithm',
        detail: [
          '**Index structure** decides which vectors are compared. **Compression** decides how each one is stored and how its distance is estimated. Any structure combines with any scheme.',
          '**Example:** IVF-PQ is simply IVF partitioning with PQ-encoded vectors inside the cells; it is named as a unit only because it is the most common pairing at scale.',
          'HNSW-PQ, HNSW-SQ and flat-PQ are all equally valid, and each occupies a different point on the memory/recall curve.',
        ],
        children: [
          {
            id: 'comp-combos',
            label: 'Common pairings',
            kind: 'method',
            summary: 'What each combination is actually for',
            detail: [
              'Flat + none, ground truth and small corpora. Perfect recall, no tuning.',
              'HNSW + none, the standard high-quality choice up to tens of millions of vectors, when memory allows.',
              'HNSW + SQ8, 4× less memory for well under a percent of recall. The most under-used option on this list.',
              'IVF + PQ, the billion-scale workhorse. Memory dominates every other concern, and the recall loss is bought back with re-scoring.',
              'Flat + binary → re-score, a fast brute-force shortlist over an enormous corpus, refined against exact vectors.',
            ],
          },
        ],
      },
      {
        id: 'comp-rescore',
        label: 'Re-scoring',
        kind: 'method',
        summary: 'Shortlist compressed, refine exact',
        detail: [
          'The standard fix for quantisation loss. Retrieve a larger candidate set using compressed vectors, then recompute exact distances for just those candidates and re-sort.',
          'Cheap, because you only touch a few hundred exact vectors per query, and it recovers most of the lost recall. It does require keeping the exact vectors somewhere, typically on SSD rather than in RAM, which is the whole point.',
        ],
        math: [
          {
            title: 'Two-pass cost',
            tex: String.raw`C = \underbrace{C_{\text{ANN}}(K')}_{\text{compressed}} + \underbrace{K' \times n}_{\text{exact re-score}}, \quad K' = r \cdot K`,
            where: [{ sym: String.raw`r`, means: 'over-fetch factor, typically 4–10×' }],
            worked: [
              { tex: String.raw`K = 10,\ r = 10 \Rightarrow K' = 100`, caption: 'shortlist 100 on PQ codes' },
              { tex: String.raw`100 \times 1536 = 153{,}600\ \text{multiply-adds}`, caption: 'negligible next to the ANN search itself' },
            ],
          },
        ],
      },
      {
        id: 'comp-opq',
        label: 'OPQ, rotate before splitting',
        kind: 'method',
        summary: 'PQ assumes subspaces are independent',
        detail: [
          'Splitting a vector into contiguous slices assumes each slice carries roughly equal, mutually independent information. Real embeddings violate this badly, variance is concentrated in some dimensions and correlated across others, so some codebooks do almost no work.',
          'Optimised Product Quantisation learns a rotation matrix R applied before splitting, redistributing variance evenly across subspaces. Same code size, meaningfully better recall, typically a few percent for one extra matrix multiply at query time.',
        ],
        math: [
          {
            title: 'Rotate, then quantise',
            tex: String.raw`\hat{x} = \text{PQ}(Rx), \qquad R^\top R = I`,
            note: 'R is orthonormal, so it preserves all distances, the rotation costs nothing in fidelity and only rearranges where information sits.',
          },
        ],
      },
      {
        id: 'comp-choose',
        label: 'Choosing a level',
        kind: 'tradeoff',
        summary: 'Compress only when memory actually hurts',
        detail: [
          'Under ~1M vectors, do not compress. 6 GB fits on a laptop and every byte of recall is free.',
          'From 1M to ~50M, SQ8 is nearly always right: 4× smaller, recall loss lost in the noise, no training pass.',
          'Past ~100M, PQ or IVF-PQ becomes structural, the corpus does not fit otherwise. Budget for a re-scoring pass from the start, and measure recall against a brute-force baseline before and after, because the loss is silent.',
        ],
      },
    ],
    trace: {
      headline: 'Vectors stored',
      payload: 'float32, uncompressed, 57 MB for 9,304 vectors',
      note: 'At this scale compression would cost recall and save nothing that matters.',
    },
  },

  {
    id: 'index',
    icon: 'database',
    label: 'Vector Index',
    phase: 'offline',
    kind: 'store',
    ordinal: '5',
    tagline: 'The handoff point between offline and online',
    code: [
      {
        title: 'LangChain',
        language: 'python',
        code: `from langchain_chroma import Chroma

# Built once, offline. This is the artifact the online path reads.
store = Chroma.from_documents(chunks, embeddings, persist_directory="./idx")

# FAISS, Milvus, Pinecone, LanceDB and pgvector expose the same interface.
retriever = store.as_retriever(search_kwargs={"k": 50})`,
        note: 'The vector store sits behind one interface, so the choice is swappable: Chroma, FAISS, Milvus, Pinecone, LanceDB, pgvector, Qdrant, Weaviate.',
      },
    ],
    detail: [
      'The finished artifact: a structure plus a storage format, holding every chunk vector and its metadata.',
      'This is the one thing the two halves of the system share. Everything above writes it; everything below reads it. It is also the only stage that is a persistent, stateful object rather than a transformation, which is why versioning it matters.',
    ],
    stack: [
      { name: 'Pinecone', what: 'Managed vector DB, serverless, scales automatically', url: 'https://www.pinecone.io/' },
      { name: 'Milvus', what: 'Open-source, distributed, supports IVF/HNSW/PQ natively', url: 'https://milvus.io/' },
      { name: 'Weaviate', what: 'Open-source vector DB with built-in vectorizers', url: 'https://weaviate.io/' },
      { name: 'Qdrant', what: 'High-performance vector DB with rich filtering', url: 'https://qdrant.tech/' },
      { name: 'ChromaDB', what: 'Lightweight, in-process embedding DB for prototyping', url: 'https://www.trychroma.com/' },
      { name: 'LanceDB', what: 'Serverless, built on Lance columnar format', url: 'https://lancedb.com/' },
      { name: 'pgvector', what: 'PostgreSQL extension for vector similarity search', url: 'https://github.com/pgvector/pgvector' },
      { name: 'FAISS', what: 'In-memory index library, often the engine inside managed DBs', url: 'https://github.com/facebookresearch/faiss' },
    ],
    concepts: [
      {
        id: 'store-versioning',
        label: 'Versioning',
        kind: 'method',
        summary: 'Build alongside, swap atomically',
        detail: [
          'Any change to chunking, the embedding model, or index parameters invalidates the whole index. Mutating in place leaves it inconsistent for the duration of the rebuild, and queries during that window return partial nonsense.',
          'Build the new index alongside the old, validate it against a held-out query set, then swap an alias. Keep the previous version until the new one has proven itself in production, rollback should be an alias change, not a rebuild.',
        ],
      },
      {
        id: 'store-hybrid',
        label: 'Two indexes, not one',
        kind: 'idea',
        summary: 'Hybrid retrieval needs a lexical index too',
        detail: [
          'Dense retrieval reads the vector index. Sparse retrieval reads an inverted index of term postings, a completely separate structure with its own build process and its own staleness.',
          'They must be built from the same chunks, or fusion silently compares results over different corpora. Emit both from a single ingestion run and stamp them with the same corpus version.',
        ],
      },
      {
        id: 'store-freshness',
        label: 'Freshness',
        kind: 'tradeoff',
        summary: 'Batch rebuilds vs. incremental inserts',
        detail: [
          'Incremental inserts keep the index current but degrade it over time, IVF centroids drift away from the data, HNSW accumulates tombstones, and both lose recall gradually and invisibly.',
          'Periodic full rebuilds restore quality but cost a full re-embed of the corpus and a window of staleness. The usual arrangement is both: insert continuously, rebuild on a schedule, and monitor ANN recall against a brute-force sample to decide when the schedule is wrong.',
        ],
      },
    ],
    trace: {
      headline: 'Index built and ready',
      payload: '9,304 vectors · HNSW · float32 · + BM25 inverted index',
      note: 'Offline path ends here. Everything below happens per query.',
    },
  },
]
