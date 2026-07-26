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

export interface MemoryEntry {
  id: string
  type: MemoryType
  label: string
  detail: string
  since: number
  kind?: MemoryKind
}

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
  // short-term — fills during the run
  { id: 'm-conv', type: 'short', label: 'Conversation', since: 0, detail: 'User asked whether NVIDIA should acquire Cerebras, with a recommendation backed by evidence.' },
  { id: 'm-reason', type: 'short', label: 'Intermediate reasoning', since: 2, detail: 'Query is too broad for one retrieval. Decompose into five parallel workstreams and run subagents.' },
  { id: 'm-retr', type: 'short', label: 'Retrieved context', since: 8, detail: '12 comparable AI-chip acquisitions, the NVIDIA 10-K, and 3 analyst notes are now in context.' },
  { id: 'm-scratch', type: 'short', label: 'Scratchpad', since: 10, detail: 'DCF fair value ≈ $38–44B. A $50B+ acquisition premium looks steep against that range.' },

  // long-term — mostly persistent, one entry written at the end
  { id: 'm-pref1', type: 'long', label: 'User preference', since: 0, detail: 'Prefers conservative, staged recommendations over aggressive all-or-nothing calls.' },
  { id: 'm-pref2', type: 'long', label: 'User preference', since: 0, detail: 'Always wants claims backed by cited sources.' },
  { id: 'm-fact1', type: 'long', label: 'Persistent fact', since: 0, detail: 'NVIDIA FY24: roughly $60.9B revenue, ~75% gross margin, a strong cash position.' },
  { id: 'm-fact2', type: 'long', label: 'Persistent fact', since: 0, detail: 'Cerebras builds wafer-scale CS-3 accelerators and is still privately held.' },
  { id: 'm-plan', type: 'long', label: 'Saved plan', since: 15, kind: 'note', detail: 'Saved a reusable acquisition due-diligence checklist distilled from this run, for next time.' },

  // episodic — accumulates as the run happens, failures included
  { id: 'm-prev', type: 'epi', label: 'Previous execution', since: 0, detail: 'An earlier run analysed the AMD–Xilinx merger; a similar antitrust pattern applies here.' },
  { id: 'm-ok1', type: 'epi', label: 'Successful tool call', since: 8, kind: 'success', detail: 'vector_db.search returned 12 relevant hits in 120ms.' },
  { id: 'm-fail', type: 'epi', label: 'Failure, recovered', since: 9, kind: 'failure', detail: 'web_search hit a rate limit, retried once with backoff, and then succeeded.' },
  { id: 'm-ok2', type: 'epi', label: 'Successful tool call', since: 10, kind: 'success', detail: 'sec.get("10-K") and python.dcf() both completed and fed the scratchpad.' },
  { id: 'm-docs', type: 'epi', label: 'Past retrieved documents', since: 11, detail: 'Cached the 10-K and analyst notes so a future run can reuse them without re-fetching.' },
]

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
