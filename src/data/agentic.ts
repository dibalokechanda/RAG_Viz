/*
 * Agentic RAG execution, as a state-driven trace.
 *
 * The dashboard folds STEPS[0..i] into a world snapshot, so playback is just an
 * index and stepping backward is a recompute rather than an undo. This first
 * pass covers the central loop: the agent's reasoning, the tool registry
 * lighting up, subagents spawning, and the timeline. Memory, the full planner,
 * the retrieval pipeline and the DAG are deliberately left as later regions.
 *
 * The worked example is the enterprise question from the brief:
 *   "Should NVIDIA acquire Cerebras?"
 */

export interface Tool {
  id: string
  label: string
  /** typical round-trip, shown on the card */
  latency: string
  /** relative cost dot, 1 (cheap) to 3 (pricey) */
  cost: number
}

/* A curated registry rather than all seventeen: enough to tell the story
   without a wall of cards. */
export const TOOLS: Tool[] = [
  { id: 'vectordb', label: 'Vector DB', latency: '120ms', cost: 1 },
  { id: 'websearch', label: 'Web Search', latency: '900ms', cost: 2 },
  { id: 'sec', label: 'SEC Database', latency: '640ms', cost: 2 },
  { id: 'python', label: 'Python', latency: '80ms', cost: 1 },
  { id: 'calculator', label: 'Calculator', latency: '12ms', cost: 1 },
  { id: 'sql', label: 'SQL Database', latency: '210ms', cost: 1 },
  { id: 'kg', label: 'Knowledge Graph', latency: '180ms', cost: 1 },
  { id: 'browser', label: 'Browser', latency: '1.4s', cost: 3 },
]

/* The classic agent loop. One entry glows per step. */
export const LOOP = ['Observe', 'Think', 'Plan', 'Act', 'Receive', 'Update'] as const
export type LoopStage = (typeof LOOP)[number]

export interface SubagentDef {
  id: string
  name: string
  task: string
  /** ties into the community palette so the five read as distinct workers */
  color: string
}

export const SUBAGENTS: Record<string, SubagentDef> = {
  research: { id: 'research', name: 'Research Agent', task: 'Company reports, market analysis, prior acquisitions', color: '#2f6f4e' },
  financial: { id: 'financial', name: 'Financial Agent', task: 'Revenue, margin, cash, P/E, DCF estimate', color: '#8a6a3c' },
  news: { id: 'news', name: 'News Agent', task: 'Latest articles, press releases, market reactions', color: '#41708c' },
  risk: { id: 'risk', name: 'Risk Agent', task: 'Antitrust, competitors, AI-chip market, geopolitics', color: '#96565f' },
  summary: { id: 'summary', name: 'Summary Agent', task: 'Merge evidence, score confidence, recommend', color: '#13251b' },
}

export interface FinalAnswer {
  recommendation: string
  pros: string[]
  cons: string[]
  confidence: number
}

export interface Step {
  /** timeline timestamp, seconds */
  t: string
  /** timeline label */
  event: string
  loop: LoopStage
  /** agent loop iteration this step belongs to */
  iter: number
  /** the animated "current thought" line */
  thought: string
  /** short state chip on the agent */
  state: string
  plan?: string
  action?: string
  /** cumulative token usage at this step */
  tokens: number
  confidence?: number
  /** tools invoked this step (flash + increment call count) */
  tools?: string[]
  /** a subagent spawned this step */
  spawn?: string
  /** updates to an already-spawned subagent */
  subUpdate?: { id: string; status?: SubStatus; progress?: number; tool?: string }
  final?: FinalAnswer
}

export type SubStatus = 'spawning' | 'working' | 'done'

export const STEPS: Step[] = [
  {
    t: '00.0',
    event: 'User query received',
    loop: 'Observe',
    iter: 1,
    state: 'reading',
    thought: 'Need multiple evidence sources: financials, recent news, SEC filings, and market risks.',
    tokens: 320,
  },
  {
    t: '00.4',
    event: 'Assessing the question',
    loop: 'Think',
    iter: 1,
    state: 'thinking',
    thought: 'This is too broad for a single retrieval. It has to be decomposed.',
    tokens: 780,
  },
  {
    t: '00.9',
    event: 'Planning',
    loop: 'Plan',
    iter: 1,
    state: 'planning',
    thought: 'Five independent workstreams. Run them in parallel with subagents.',
    plan: 'Financial · News · SEC filings · Competition · Risk',
    tokens: 1240,
  },
  {
    t: '01.3',
    event: 'Spawn Research Agent',
    loop: 'Act',
    iter: 1,
    state: 'spawning',
    thought: 'Spawning a Research Agent for comparable acquisitions.',
    action: 'spawn(research)',
    spawn: 'research',
    tokens: 1520,
  },
  {
    t: '01.7',
    event: 'Spawn Financial Agent',
    loop: 'Act',
    iter: 1,
    state: 'spawning',
    thought: 'Financial Agent to model the numbers.',
    action: 'spawn(financial)',
    spawn: 'financial',
    tokens: 1810,
  },
  {
    t: '02.1',
    event: 'Spawn News Agent',
    loop: 'Act',
    iter: 1,
    state: 'spawning',
    thought: 'News Agent to read the room.',
    action: 'spawn(news)',
    spawn: 'news',
    tokens: 2090,
  },
  {
    t: '02.5',
    event: 'Spawn Risk Agent',
    loop: 'Act',
    iter: 1,
    state: 'spawning',
    thought: 'Risk Agent for the antitrust and competition picture.',
    action: 'spawn(risk)',
    spawn: 'risk',
    tokens: 2360,
  },
  {
    t: '02.9',
    event: 'Spawn Summary Agent',
    loop: 'Act',
    iter: 1,
    state: 'spawning',
    thought: 'Summary Agent will merge everyone’s findings at the end.',
    action: 'spawn(summary)',
    spawn: 'summary',
    tokens: 2600,
  },
  {
    t: '03.6',
    event: 'Research Agent → Vector DB',
    loop: 'Receive',
    iter: 2,
    state: 'retrieving',
    thought: 'Research Agent querying the vector DB for past chip acquisitions.',
    action: 'vectordb.search("AI accelerator acquisitions")',
    tools: ['vectordb'],
    subUpdate: { id: 'research', status: 'working', progress: 62, tool: 'Vector DB' },
    tokens: 3400,
  },
  {
    t: '04.4',
    event: 'News Agent → Web Search',
    loop: 'Receive',
    iter: 2,
    state: 'retrieving',
    thought: 'News Agent scanning the last quarter of coverage and reactions.',
    action: 'websearch("NVIDIA Cerebras acquisition")',
    tools: ['websearch', 'browser'],
    subUpdate: { id: 'news', status: 'working', progress: 55, tool: 'Web Search' },
    tokens: 4200,
  },
  {
    t: '05.3',
    event: 'Financial Agent → SEC · Python',
    loop: 'Receive',
    iter: 2,
    state: 'computing',
    thought: 'Financial Agent pulling the 10-K and running a DCF in Python.',
    action: 'sec.get("10-K") | python.dcf()',
    tools: ['sec', 'python', 'calculator'],
    subUpdate: { id: 'financial', status: 'working', progress: 71, tool: 'SEC · Python' },
    tokens: 5600,
  },
  {
    t: '06.1',
    event: 'Risk Agent → Knowledge Graph',
    loop: 'Receive',
    iter: 2,
    state: 'retrieving',
    thought: 'Risk Agent mapping antitrust exposure across the AI-chip market.',
    action: 'kg.query("antitrust AI accelerators")',
    tools: ['kg', 'sql'],
    subUpdate: { id: 'risk', status: 'working', progress: 58, tool: 'Knowledge Graph' },
    tokens: 6400,
  },
  {
    t: '06.9',
    event: 'Subagents report back',
    loop: 'Update',
    iter: 2,
    state: 'merging',
    thought: 'All four workers have returned. Writing their findings to memory.',
    tokens: 7200,
  },
  {
    t: '07.6',
    event: 'Summary Agent merges',
    loop: 'Think',
    iter: 3,
    state: 'synthesising',
    thought: 'Summary Agent building the evidence graph and scoring confidence.',
    action: 'summary.merge(evidence)',
    subUpdate: { id: 'summary', status: 'working', progress: 84, tool: 'Evidence graph' },
    tokens: 8100,
    confidence: 78,
  },
  {
    t: '08.4',
    event: 'Final synthesis',
    loop: 'Act',
    iter: 3,
    state: 'synthesising',
    thought: 'Combining every strand into a single recommendation.',
    tokens: 8900,
    confidence: 88,
  },
  {
    t: '09.1',
    event: 'Response',
    loop: 'Update',
    iter: 3,
    state: 'done',
    thought: 'Recommendation ready, with the evidence that backs it.',
    tokens: 9400,
    confidence: 92,
    final: {
      recommendation: 'Do not acquire immediately. Pursue a partnership or staged investment first.',
      pros: ['Strong wafer-scale technology', 'Accelerates NVIDIA’s AI roadmap', 'Complementary product lines'],
      cons: ['High acquisition premium', 'Serious antitrust exposure', 'Competitive and product overlap'],
      confidence: 92,
    },
  },
]

export const QUERY = 'Should NVIDIA acquire Cerebras? Give a recommendation backed by financial data, recent news, SEC filings, and market risks.'

/* ── memory ─────────────────────────────────────────────────────────────
 * Three memory types, and the teaching point is that they behave differently
 * over a run: short-term fills up as scratch for this run and is cleared
 * after; episodic logs what happened, successes and failures alike; long-term
 * persists across runs and is mostly read, occasionally written to.
 *
 * `since` is the step an entry appears. Entries that pre-date the run (user
 * preferences, durable facts, prior executions) use 0, so they are present
 * from the first frame; everything else animates in as the run reaches it.
 */
export type MemoryType = 'short' | 'long' | 'epi'
export type MemoryKind = 'success' | 'failure' | 'note'

export interface MemoryRead {
  step: number
  agent: string
}
export interface MemoryEntry {
  id: string
  type: MemoryType
  label: string
  detail: string
  since: number
  /** who wrote it */
  source: string
  /** rough size, drives the working-memory meter */
  tokens: number
  /** when it was read back into an agent's context, and by whom */
  reads?: MemoryRead[]
  kind?: MemoryKind
}

/** Short-term is working memory under a fixed budget; the meter shows pressure. */
export const SHORT_TERM_BUDGET = 8000

export const MEMORY_GROUPS: { type: MemoryType; name: string; tip: string }[] = [
  {
    type: 'short',
    name: 'Short-term',
    tip: 'Working memory for this run only: the conversation, intermediate reasoning, retrieved context and a scratchpad. Cleared once the run ends.',
  },
  {
    type: 'long',
    name: 'Long-term',
    tip: 'Persists across runs: user preferences, durable facts and saved plans. Mostly read, occasionally written to.',
  },
  {
    type: 'epi',
    name: 'Episodic',
    tip: 'A log of what actually happened: successful tool calls, retrieved documents, prior executions and failures. What the agent can learn from next time.',
  },
]

export const MEMORY: MemoryEntry[] = [
  // short-term — fills during the run, written by whoever produced it
  { id: 'm-conv', type: 'short', label: 'Conversation', since: 0, source: 'User', tokens: 60, reads: [{ step: 2, agent: 'Main Agent' }], detail: 'User asked whether NVIDIA should acquire Cerebras, with a recommendation backed by evidence.' },
  { id: 'm-reason', type: 'short', label: 'Intermediate reasoning', since: 2, source: 'Main Agent', tokens: 120, reads: [{ step: 3, agent: 'Main Agent' }], detail: 'Query is too broad for one retrieval. Decompose into five parallel workstreams and run subagents.' },
  { id: 'm-retr', type: 'short', label: 'Retrieved context', since: 8, source: 'Research Agent', tokens: 1400, reads: [{ step: 13, agent: 'Summary Agent' }], detail: '12 comparable AI-chip acquisitions, the NVIDIA 10-K, and 3 analyst notes are now in context.' },
  { id: 'm-scratch', type: 'short', label: 'Scratchpad', since: 10, source: 'Financial Agent', tokens: 160, reads: [{ step: 13, agent: 'Summary Agent' }], detail: 'DCF fair value ≈ $38–44B. A $50B+ acquisition premium looks steep against that range.' },

  // long-term — mostly persistent, mostly read, one entry written at the end
  { id: 'm-pref1', type: 'long', label: 'User preference', since: 0, source: 'persisted', tokens: 40, reads: [{ step: 0, agent: 'Main Agent' }, { step: 14, agent: 'Summary Agent' }], detail: 'Prefers conservative, staged recommendations over aggressive all-or-nothing calls.' },
  { id: 'm-pref2', type: 'long', label: 'User preference', since: 0, source: 'persisted', tokens: 30, reads: [{ step: 0, agent: 'Main Agent' }], detail: 'Always wants claims backed by cited sources.' },
  { id: 'm-fact1', type: 'long', label: 'Persistent fact', since: 0, source: 'persisted', tokens: 70, reads: [{ step: 10, agent: 'Financial Agent' }], detail: 'NVIDIA FY24: roughly $60.9B revenue, ~75% gross margin, a strong cash position.' },
  { id: 'm-fact2', type: 'long', label: 'Persistent fact', since: 0, source: 'persisted', tokens: 50, reads: [{ step: 8, agent: 'Research Agent' }, { step: 9, agent: 'News Agent' }], detail: 'Cerebras builds wafer-scale CS-3 accelerators and is still privately held.' },
  { id: 'm-plan', type: 'long', label: 'Saved plan', since: 15, source: 'Main Agent', tokens: 90, kind: 'note', detail: 'Saved a reusable acquisition due-diligence checklist distilled from this run, for next time.' },

  // episodic — accumulates as the run happens, failures included
  { id: 'm-prev', type: 'epi', label: 'Previous execution', since: 0, source: 'persisted', tokens: 80, reads: [{ step: 8, agent: 'Research Agent' }], detail: 'An earlier run analysed the AMD–Xilinx merger; a similar antitrust pattern applies here.' },
  { id: 'm-ok1', type: 'epi', label: 'Successful tool call', since: 8, source: 'Research Agent', tokens: 30, kind: 'success', detail: 'vector_db.search returned 12 relevant hits in 120ms.' },
  { id: 'm-fail', type: 'epi', label: 'Failure, recovered', since: 9, source: 'News Agent', tokens: 40, kind: 'failure', detail: 'web_search hit a rate limit, retried once with backoff, and then succeeded.' },
  { id: 'm-ok2', type: 'epi', label: 'Successful tool call', since: 10, source: 'Financial Agent', tokens: 36, kind: 'success', detail: 'sec.get("10-K") and python.dcf() both completed and fed the scratchpad.' },
  { id: 'm-docs', type: 'epi', label: 'Past retrieved documents', since: 11, source: 'Financial Agent', tokens: 60, detail: 'Cached the 10-K and analyst notes so a future run can reuse them without re-fetching.' },
]

/* ── memory as a stream of operations ───────────────────────────────────
 * The teaching point the flat list misses: memory is written and read
 * continuously. This flattens the entries into a chronological op log, so
 * the panel can show what was written or read at each step, and by whom.
 */
export interface MemoryOp {
  step: number
  t: string
  op: 'write' | 'read'
  type: MemoryType
  label: string
  agent: string
  entryId: string
}

export function memoryOps(index: number): MemoryOp[] {
  const ops: MemoryOp[] = []
  for (const m of MEMORY) {
    if (m.since <= index) {
      ops.push({ step: m.since, t: STEPS[m.since].t, op: 'write', type: m.type, label: m.label, agent: m.source, entryId: m.id })
    }
    for (const r of m.reads ?? []) {
      if (r.step <= index) {
        ops.push({ step: r.step, t: STEPS[r.step].t, op: 'read', type: m.type, label: m.label, agent: r.agent, entryId: m.id })
      }
    }
  }
  // chronological; writes before reads within the same step
  ops.sort((a, b) => a.step - b.step || (a.op === b.op ? 0 : a.op === 'write' ? -1 : 1))
  return ops
}

/* ── per-agent detail: prompt, live context, tool trace ─────────────────
 * Clicking an agent opens a modal with three tabs. The Prompt tab is static
 * structure; the Context and Tool-call tabs are time-aware, filtered by the
 * current step, so they fill in as the run proceeds and teach that an agent's
 * context window is assembled live rather than fixed up front.
 */
export interface PromptSection {
  label: string
  body: string
}
export type ContextKind = 'system' | 'task' | 'memory' | 'retrieved' | 'observation' | 'note'
export interface ContextBlock {
  id: string
  since: number
  kind: ContextKind
  label: string
  body: string
  tokens: number
}
export type CallStatus = 'ok' | 'retry' | 'error'
export interface ToolCall {
  id: string
  since: number
  call: string
  latency: string
  status: CallStatus
  response: string
  retries?: number
}
export interface AgentProfile {
  id: string
  name: string
  role: string
  color: string
  prompt: PromptSection[]
  task: string
  context: ContextBlock[]
  calls: ToolCall[]
}

/* Every agent shares the same house rules; only the role, tools and task
   differ. Keeping the shared part in one place mirrors how a real system
   templates its system prompts. */
const HOUSE_RULES =
  'Ground every claim in retrieved evidence and cite the source. State uncertainty explicitly. Do not fabricate figures. Return only the requested output format.'

export const AGENT_PROFILES: Record<string, AgentProfile> = {
  main: {
    id: 'main',
    name: 'Main Agent',
    role: 'Orchestrator',
    color: '#13251b',
    prompt: [
      { label: 'Role', body: 'You are the orchestrator. Decompose the user goal, delegate to specialised subagents, and synthesise one grounded recommendation.' },
      { label: 'Tools', body: 'spawn_subagent(role, task), plus the full tool registry by delegation. You rarely call tools directly; you route work to subagents.' },
      { label: 'Constraints', body: HOUSE_RULES + ' Prefer parallel subagents over a single long chain. Reconcile conflicting evidence before answering.' },
      { label: 'Output format', body: 'A recommendation, a pros list, a cons list, and a calibrated confidence score with the data references behind it.' },
    ],
    task: 'Should NVIDIA acquire Cerebras? Provide a recommendation backed by financial data, recent news, SEC filings, and market risks.',
    context: [
      { id: 'c-sys', since: 0, kind: 'system', label: 'System prompt', body: 'Orchestrator role, tool registry, house rules.', tokens: 480 },
      { id: 'c-task', since: 0, kind: 'task', label: 'User query', body: QUERY, tokens: 60 },
      { id: 'c-mem', since: 0, kind: 'memory', label: 'Long-term memory', body: 'User prefers conservative, staged recommendations; wants cited sources. NVIDIA FY24 facts loaded.', tokens: 180 },
      { id: 'c-plan', since: 2, kind: 'observation', label: 'Plan', body: 'Five workstreams: financial, news, SEC filings, competition, risk. Spawn one subagent each.', tokens: 120 },
      { id: 'c-merge', since: 12, kind: 'observation', label: 'Subagent reports', body: 'Research, Financial, News and Risk have returned. Findings and confidence collected.', tokens: 2600 },
      { id: 'c-final', since: 15, kind: 'observation', label: 'Synthesis', body: 'Reconciled evidence into a staged-investment recommendation at 92% confidence.', tokens: 340 },
    ],
    calls: [
      { id: 'k-sp1', since: 3, call: 'spawn_subagent("research", …)', latency: '—', status: 'ok', response: 'Research Agent started' },
      { id: 'k-sp2', since: 4, call: 'spawn_subagent("financial", …)', latency: '—', status: 'ok', response: 'Financial Agent started' },
      { id: 'k-sp3', since: 5, call: 'spawn_subagent("news", …)', latency: '—', status: 'ok', response: 'News Agent started' },
      { id: 'k-sp4', since: 6, call: 'spawn_subagent("risk", …)', latency: '—', status: 'ok', response: 'Risk Agent started' },
      { id: 'k-sp5', since: 7, call: 'spawn_subagent("summary", …)', latency: '—', status: 'ok', response: 'Summary Agent started' },
    ],
  },
  research: {
    id: 'research',
    name: 'Research Agent',
    role: 'Comparable deals & market analysis',
    color: '#2f6f4e',
    prompt: [
      { label: 'Role', body: 'You research comparable AI-chip acquisitions and market analysis relevant to a possible NVIDIA–Cerebras deal.' },
      { label: 'Tools', body: 'vector_db.search(query, k) over the internal corpus of reports and prior deals.' },
      { label: 'Constraints', body: HOUSE_RULES + ' Prefer primary reports over commentary.' },
      { label: 'Output format', body: 'A short list of comparable deals with sizes and outcomes, and two or three market observations.' },
    ],
    task: 'Find comparable AI-accelerator acquisitions and summarise how the market treated them.',
    context: [
      { id: 'c-sys', since: 3, kind: 'system', label: 'System prompt', body: 'Research role, vector_db tool, house rules.', tokens: 320 },
      { id: 'c-task', since: 3, kind: 'task', label: 'Task from planner', body: 'Find comparable AI-accelerator acquisitions and market treatment.', tokens: 40 },
      { id: 'c-mem', since: 3, kind: 'memory', label: 'Injected fact', body: 'Prior run analysed AMD–Xilinx; reuse that framing.', tokens: 60 },
      { id: 'c-ret', since: 8, kind: 'retrieved', label: 'vector_db → 12 hits', body: 'AMD–Xilinx ($49B), Intel–Habana ($2B), NVIDIA–Mellanox ($6.9B), and 9 more, with outcomes.', tokens: 1400 },
      { id: 'c-obs', since: 12, kind: 'observation', label: 'Drafted finding', body: 'Large accelerator deals clear, but wafer-scale is unproven at NVIDIA’s scale.', tokens: 220 },
    ],
    calls: [{ id: 'k1', since: 8, call: 'vector_db.search("AI accelerator acquisitions", k=12)', latency: '120ms', status: 'ok', response: '12 documents, top score 0.86' }],
  },
  financial: {
    id: 'financial',
    name: 'Financial Agent',
    role: 'Valuation & financial modelling',
    color: '#8a6a3c',
    prompt: [
      { label: 'Role', body: 'You model the financials of the target and acquirer and estimate a fair value for the deal.' },
      { label: 'Tools', body: 'sec.get(filing), python.run(code), calculator.eval(expr).' },
      { label: 'Constraints', body: HOUSE_RULES + ' Show the assumptions behind any DCF. Flag when inputs are estimates.' },
      { label: 'Output format', body: 'Key metrics (revenue, margin, cash, P/E, debt) and a DCF fair-value range with assumptions.' },
    ],
    task: 'Model NVIDIA and Cerebras financials and estimate a fair acquisition value.',
    context: [
      { id: 'c-sys', since: 4, kind: 'system', label: 'System prompt', body: 'Financial role, SEC + Python + calculator, house rules.', tokens: 340 },
      { id: 'c-task', since: 4, kind: 'task', label: 'Task from planner', body: 'Model financials and estimate fair value.', tokens: 36 },
      { id: 'c-mem', since: 4, kind: 'memory', label: 'Injected fact', body: 'NVIDIA FY24: ~$60.9B revenue, ~75% gross margin, strong cash.', tokens: 70 },
      { id: 'c-ret', since: 10, kind: 'retrieved', label: 'sec → 10-K extract', body: 'Balance sheet, cash flow statement and segment revenue pulled from the latest 10-K.', tokens: 1800 },
      { id: 'c-obs', since: 10, kind: 'observation', label: 'DCF result', body: 'Fair value ≈ $38–44B under base assumptions; a $50B+ premium looks steep.', tokens: 160 },
    ],
    calls: [
      { id: 'k1', since: 10, call: 'sec.get("NVDA 10-K FY24")', latency: '640ms', status: 'ok', response: 'Filing retrieved, 214 pages' },
      { id: 'k2', since: 10, call: 'python.run("dcf(cf, wacc=0.11, g=0.03)")', latency: '80ms', status: 'ok', response: '{ fair_value: [38.2, 43.9] }  # $B' },
      { id: 'k3', since: 10, call: 'calculator.eval("50 / 41")', latency: '12ms', status: 'ok', response: '1.22  # ~22% over midpoint' },
    ],
  },
  news: {
    id: 'news',
    name: 'News Agent',
    role: 'Recent coverage & market reaction',
    color: '#41708c',
    prompt: [
      { label: 'Role', body: 'You gather the most recent news, press releases and market reactions relevant to the deal.' },
      { label: 'Tools', body: 'web_search(query), browser.open(url) for full articles.' },
      { label: 'Constraints', body: HOUSE_RULES + ' Prefer the last 90 days. Note the date and outlet of each item.' },
      { label: 'Output format', body: 'A dated list of the most relevant items with a one-line takeaway each.' },
    ],
    task: 'Summarise the latest coverage and market reaction to an NVIDIA–Cerebras deal.',
    context: [
      { id: 'c-sys', since: 5, kind: 'system', label: 'System prompt', body: 'News role, web_search + browser, house rules.', tokens: 300 },
      { id: 'c-task', since: 5, kind: 'task', label: 'Task from planner', body: 'Summarise recent coverage and market reaction.', tokens: 34 },
      { id: 'c-note', since: 9, kind: 'note', label: 'Recovered failure', body: 'web_search returned 429 (rate limited). Backed off and retried once; the retry succeeded.', tokens: 40 },
      { id: 'c-ret', since: 9, kind: 'retrieved', label: 'web_search → 8 articles', body: 'Coverage of Cerebras funding, wafer-scale benchmarks, and analyst scepticism about integration.', tokens: 1100 },
      { id: 'c-obs', since: 12, kind: 'observation', label: 'Drafted finding', body: 'Sentiment mixed: strong tech interest, real doubt about antitrust and integration.', tokens: 180 },
    ],
    calls: [
      { id: 'k1', since: 9, call: 'web_search("NVIDIA Cerebras acquisition")', latency: '2.1s', status: 'retry', response: '429 Too Many Requests → retried → 200 OK', retries: 1 },
      { id: 'k2', since: 9, call: 'browser.open("techwire.com/cerebras-cs3")', latency: '1.4s', status: 'ok', response: 'Article body extracted, 1,900 words' },
    ],
  },
  risk: {
    id: 'risk',
    name: 'Risk Agent',
    role: 'Antitrust, competition & geopolitics',
    color: '#96565f',
    prompt: [
      { label: 'Role', body: 'You assess regulatory, competitive and geopolitical risk for the proposed acquisition.' },
      { label: 'Tools', body: 'knowledge_graph.query(entity), sql.query(sql) over the regulatory case database.' },
      { label: 'Constraints', body: HOUSE_RULES + ' Distinguish likelihood from severity for each risk.' },
      { label: 'Output format', body: 'A ranked risk list, each with likelihood, severity and a supporting precedent.' },
    ],
    task: 'Assess antitrust, competition and geopolitical risk for the deal.',
    context: [
      { id: 'c-sys', since: 6, kind: 'system', label: 'System prompt', body: 'Risk role, knowledge_graph + sql, house rules.', tokens: 320 },
      { id: 'c-task', since: 6, kind: 'task', label: 'Task from planner', body: 'Assess antitrust, competition and geopolitical risk.', tokens: 36 },
      { id: 'c-ret', since: 11, kind: 'retrieved', label: 'kg → antitrust precedents', body: 'Regulators scrutinise accelerator consolidation; NVIDIA already dominant in AI training silicon.', tokens: 1200 },
      { id: 'c-obs', since: 12, kind: 'observation', label: 'Drafted finding', body: 'Antitrust is the dominant risk: high likelihood of a lengthy review, moderate-to-high severity.', tokens: 200 },
    ],
    calls: [
      { id: 'k1', since: 11, call: 'knowledge_graph.query("antitrust AI accelerators")', latency: '180ms', status: 'ok', response: '9 precedents, 3 highly relevant' },
      { id: 'k2', since: 11, call: 'sql.query("SELECT * FROM reviews WHERE sector=\'semiconductors\'")', latency: '210ms', status: 'ok', response: '31 rows' },
    ],
  },
  summary: {
    id: 'summary',
    name: 'Summary Agent',
    role: 'Evidence merge & recommendation',
    color: '#13251b',
    prompt: [
      { label: 'Role', body: 'You merge the other agents’ findings into one recommendation with a calibrated confidence score.' },
      { label: 'Tools', body: 'None. You reason over the collected subagent outputs; you do not call external tools.' },
      { label: 'Constraints', body: HOUSE_RULES + ' Weight evidence by source reliability. Surface disagreements rather than averaging them away.' },
      { label: 'Output format', body: 'Recommendation, pros, cons, and a confidence score, each tied to the evidence behind it.' },
    ],
    task: 'Merge all findings, score confidence, and produce the final recommendation.',
    context: [
      { id: 'c-sys', since: 7, kind: 'system', label: 'System prompt', body: 'Summary role, no tools, house rules.', tokens: 280 },
      { id: 'c-task', since: 7, kind: 'task', label: 'Task from planner', body: 'Merge findings, score confidence, recommend.', tokens: 34 },
      { id: 'c-in', since: 13, kind: 'observation', label: 'All subagent reports', body: 'Research, Financial, News and Risk findings assembled into one evidence set.', tokens: 2800 },
      { id: 'c-obs', since: 14, kind: 'observation', label: 'Evidence graph', body: 'Built an evidence graph; the antitrust and premium cons outweigh an immediate buy.', tokens: 360 },
    ],
    calls: [],
  },
}

/* ── per-tool detail: schema, implementation, call log ──────────────────
 * Clicking a tool opens a modal with the schema the model sees, the raw
 * Python that implements it, and the same LangGraph wiring every tool shares
 * (bind_tools + a ToolNode in the agent loop). The Calls tab is step-filtered
 * so it fills in live, like the agent inspector.
 */
export interface ToolParam {
  name: string
  type: string
  desc: string
}
export interface ToolCallLog {
  agent: string
  since: number
  call: string
  latency: string
  status: CallStatus
  response: string
  retries?: number
}
export interface ToolDetail {
  summary: string
  description: string
  params: ToolParam[]
  returns: string
  code: string
  calls: ToolCallLog[]
}

/* The wiring is identical for every tool: bind the whole set to the model and
   run them from a ToolNode inside the agent loop. Shown per tool with that
   tool featured, so the shared pattern is obvious. */
const wiring = (fn: string) => `# ── Register with a LangGraph agent ──
from langgraph.graph import StateGraph, MessagesState, START
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_openai import ChatOpenAI

tools = [${fn}, ...]                       # every @tool in the registry
llm   = ChatOpenAI(model="gpt-4o").bind_tools(tools)

def agent(state: MessagesState):
    return {"messages": [llm.invoke(state["messages"])]}

graph = StateGraph(MessagesState)
graph.add_node("agent", agent)
graph.add_node("tools", ToolNode(tools))   # calls ${fn} when the model asks
graph.add_edge(START, "agent")
graph.add_conditional_edges("agent", tools_condition)  # agent <-> tools loop
graph.add_edge("tools", "agent")
app = graph.compile()`

export const TOOL_DETAILS: Record<string, ToolDetail> = {
  vectordb: {
    summary: 'Semantic search over the internal report corpus.',
    description: 'Semantic search over the internal corpus of reports and prior deals. Returns the top-k chunks with similarity scores.',
    params: [
      { name: 'query', type: 'str', desc: 'Natural-language search query.' },
      { name: 'k', type: 'int = 8', desc: 'How many chunks to return.' },
    ],
    returns: 'list[dict] — {text, score} per hit',
    code: `from langchain_core.tools import tool

@tool
def search_documents(query: str, k: int = 8) -> list[dict]:
    """Semantic search over the internal report corpus.
    Returns the top-k chunks with their similarity scores."""
    q = embed(query)                       # text-embedding-3-large
    hits = vector_store.similarity_search_by_vector(q, k=k)
    return [{"text": h.page_content, "score": h.score} for h in hits]

${wiring('search_documents')}`,
    calls: [{ agent: 'Research Agent', since: 8, call: 'search_documents("AI accelerator acquisitions", k=12)', latency: '120ms', status: 'ok', response: '12 documents, top score 0.86' }],
  },
  websearch: {
    summary: 'Recent public-web articles and press releases.',
    description: 'Search the public web for recent articles, press releases and market reactions. Biased to the last 90 days.',
    params: [
      { name: 'query', type: 'str', desc: 'Search query.' },
      { name: 'recency_days', type: 'int = 90', desc: 'Only return items newer than this.' },
    ],
    returns: 'list[dict] — {title, url, snippet}',
    code: `from langchain_core.tools import tool

@tool
def web_search(query: str, recency_days: int = 90) -> list[dict]:
    """Search the public web for recent articles and press releases."""
    resp = tavily.search(query, days=recency_days, max_results=8)
    return [
        {"title": r["title"], "url": r["url"], "snippet": r["content"]}
        for r in resp["results"]
    ]

${wiring('web_search')}`,
    calls: [
      { agent: 'News Agent', since: 9, call: 'web_search("NVIDIA Cerebras acquisition")', latency: '2.1s', status: 'retry', response: '429 Too Many Requests -> retried -> 200 OK', retries: 1 },
    ],
  },
  sec: {
    summary: 'Fetch the latest SEC filing text.',
    description: 'Fetch and extract the text of the latest SEC filing for a ticker (10-K, 10-Q, 8-K).',
    params: [
      { name: 'ticker', type: 'str', desc: 'e.g. "NVDA".' },
      { name: 'form', type: 'str = "10-K"', desc: 'Filing type.' },
    ],
    returns: 'str — extracted filing text',
    code: `from langchain_core.tools import tool

@tool
def get_filing(ticker: str, form: str = "10-K") -> str:
    """Fetch the latest SEC filing text for a ticker (10-K, 10-Q, 8-K)."""
    url = edgar.latest(ticker, form)
    return edgar.extract_text(url)

${wiring('get_filing')}`,
    calls: [{ agent: 'Financial Agent', since: 10, call: 'get_filing("NVDA", "10-K")', latency: '640ms', status: 'ok', response: 'Filing retrieved, 214 pages' }],
  },
  python: {
    summary: 'Run Python in a sandbox.',
    description: 'Execute Python in an isolated sandbox and return stdout. Used for financial modelling such as a DCF.',
    params: [{ name: 'code', type: 'str', desc: 'Python source to execute.' }],
    returns: 'str — captured stdout',
    code: `from langchain_core.tools import tool

@tool
def run_python(code: str) -> str:
    """Execute Python in a sandbox and return stdout. Use for DCF and modelling."""
    return sandbox.exec(code, timeout=30)   # no network, 512MB, 30s cap

${wiring('run_python')}`,
    calls: [{ agent: 'Financial Agent', since: 10, call: 'run_python("dcf(cf, wacc=0.11, g=0.03)")', latency: '80ms', status: 'ok', response: '{ fair_value: [38.2, 43.9] }  # $B' }],
  },
  calculator: {
    summary: 'Evaluate an arithmetic expression.',
    description: 'Safely evaluate a single arithmetic expression. No variables, no side effects.',
    params: [{ name: 'expression', type: 'str', desc: 'e.g. "50 / 41".' }],
    returns: 'float',
    code: `from langchain_core.tools import tool
import numexpr

@tool
def calculator(expression: str) -> float:
    """Evaluate an arithmetic expression safely."""
    return float(numexpr.evaluate(expression).item())

${wiring('calculator')}`,
    calls: [{ agent: 'Financial Agent', since: 10, call: 'calculator("50 / 41")', latency: '12ms', status: 'ok', response: '1.22  # ~22% over midpoint' }],
  },
  sql: {
    summary: 'Read-only SQL over the case database.',
    description: 'Run a read-only SQL query against the regulatory case database. Writes are rejected.',
    params: [{ name: 'query', type: 'str', desc: 'A SELECT statement.' }],
    returns: 'list[dict] — rows',
    code: `from langchain_core.tools import tool
from sqlalchemy import text

@tool
def sql_query(query: str) -> list[dict]:
    """Run a read-only SQL query against the regulatory case database."""
    assert query.strip().lower().startswith("select"), "read-only"
    with engine.connect() as c:
        return [dict(r) for r in c.execute(text(query))]

${wiring('sql_query')}`,
    calls: [{ agent: 'Risk Agent', since: 11, call: 'sql_query("SELECT * FROM reviews WHERE sector=\'semiconductors\'")', latency: '210ms', status: 'ok', response: '31 rows' }],
  },
  kg: {
    summary: 'Query the knowledge graph.',
    description: 'Look up entities and their related precedents in the regulatory knowledge graph.',
    params: [{ name: 'entity', type: 'str', desc: 'Entity name to expand from.' }],
    returns: 'list[dict] — neighbours and edges',
    code: `from langchain_core.tools import tool

@tool
def kg_query(entity: str) -> list[dict]:
    """Look up related precedents and edges for an entity in the knowledge graph."""
    cypher = "MATCH (e {name: $n})-[r]-(m) RETURN m, r LIMIT 25"
    return graph.run(cypher, n=entity).data()

${wiring('kg_query')}`,
    calls: [{ agent: 'Risk Agent', since: 11, call: 'kg_query("antitrust AI accelerators")', latency: '180ms', status: 'ok', response: '9 precedents, 3 highly relevant' }],
  },
  browser: {
    summary: 'Open a URL and extract article text.',
    description: 'Open a URL in a headless browser and return the readable article text. Used to read full articles found by web search.',
    params: [{ name: 'url', type: 'str', desc: 'The page to open.' }],
    returns: 'str — extracted article text',
    code: `from langchain_core.tools import tool

@tool
def open_url(url: str) -> str:
    """Open a URL in a headless browser and return the extracted article text."""
    page = browser.new_page()
    page.goto(url, wait_until="networkidle")
    return readability(page.content())      # strips nav, ads, boilerplate

${wiring('open_url')}`,
    calls: [{ agent: 'News Agent', since: 9, call: 'open_url("techwire.com/cerebras-cs3")', latency: '1.4s', status: 'ok', response: 'Article body extracted, 1,900 words' }],
  },
}

/* short tooltips for each region, per the brief's educational requirement */
export const TIPS = {
  agent: 'The orchestrator. It reasons, plans, calls tools, spawns subagents, and synthesises the final answer.',
  memory: 'What the agent keeps. Short-term is scratch for this run, long-term persists across runs, episodic logs what happened. Click any entry to read it.',
  planner: 'Breaks the goal into parallel tasks, one per subagent.',
  loop: 'The agent runs a loop: observe, think, plan, act, receive an observation, update memory, repeat.',
  tools: 'External capabilities the agent can invoke. Each call has a latency and a cost.',
  subagents: 'Specialised workers the main agent spawns to solve one focused subproblem in parallel.',
  timeline: 'Every event in the run, in order. Click any event to jump the whole dashboard to that moment.',
  final: 'The synthesised recommendation, with the pros, cons and a confidence score behind it.',
}

/* ── folding STEPS into a snapshot ──────────────────────────────────────── */

export interface Subagent extends SubagentDef {
  status: SubStatus
  progress: number
  tool?: string
}

export interface World {
  step: Step
  index: number
  subagents: Subagent[]
  toolCalls: Record<string, number>
  activeTools: Set<string>
  /** memory entries visible at this step, in declaration order */
  memory: MemoryEntry[]
  final?: FinalAnswer
}

export function deriveWorld(index: number): World {
  const upto = STEPS.slice(0, index + 1)
  const subMap = new Map<string, Subagent>()
  const toolCalls: Record<string, number> = {}
  let final: FinalAnswer | undefined

  for (const s of upto) {
    if (s.spawn) {
      const def = SUBAGENTS[s.spawn]
      subMap.set(def.id, { ...def, status: 'spawning', progress: 8 })
    }
    if (s.subUpdate) {
      const cur = subMap.get(s.subUpdate.id)
      if (cur) {
        if (s.subUpdate.status) cur.status = s.subUpdate.status
        if (s.subUpdate.progress != null) cur.progress = s.subUpdate.progress
        if (s.subUpdate.tool) cur.tool = s.subUpdate.tool
      }
    }
    for (const t of s.tools ?? []) toolCalls[t] = (toolCalls[t] ?? 0) + 1
    if (s.final) final = s.final
  }

  // Once merging begins, any still-working subagent is finished reporting.
  const cur = STEPS[index]
  if (cur.loop === 'Update' || cur.state === 'synthesising' || cur.state === 'done') {
    for (const sub of subMap.values()) {
      if (sub.id !== 'summary' && sub.status !== 'done') {
        sub.status = 'done'
        sub.progress = 100
      }
    }
  }
  if (cur.state === 'done') {
    const s = subMap.get('summary')
    if (s) {
      s.status = 'done'
      s.progress = 100
    }
  }

  return {
    step: cur,
    index,
    subagents: [...subMap.values()],
    toolCalls,
    activeTools: new Set(cur.tools ?? []),
    memory: MEMORY.filter((m) => m.since <= index),
    final,
  }
}
