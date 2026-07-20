import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { buildGraph, traceOrder, variantFor, STAGE_CONFIG_KEY, type FlowNode } from './data/graph'
import ConceptMap from './components/ConceptMap'
import { stageById } from './data/stages'
import { defaultConfig, type PipelineConfig } from './data/types'
import { PipelineContext } from './PipelineContext'
import StageNode from './components/StageNode'
import LaneLabel from './components/LaneLabel'
import { JoinEdge, PipelineEdge } from './components/edges'
import DetailPanel from './components/DetailPanel'
import ControlRail from './components/ControlRail'
import Player from './components/Player'

const nodeTypes = { stage: StageNode, lane: LaneLabel }
const edgeTypes = { pipeline: PipelineEdge, join: JoinEdge }
const SPEEDS = [1, 1.5, 2, 0.5]

function Canvas() {
  const [config, setConfig] = useState<PipelineConfig>(defaultConfig)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [step, setStep] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [speedIdx, setSpeedIdx] = useState(0)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const { setCenter, fitView } = useReactFlow()
  const speed = SPEEDS[speedIdx]

  const trace = useMemo(() => traceOrder(config), [config])
  const activeStage = step >= 0 && step < trace.length ? trace[step] : null

  const visitedIds = useMemo(
    () => new Set(trace.slice(0, Math.max(0, step + 1)).map((s) => s.id)),
    [trace, step],
  )

  const { nodes, edges } = useMemo(
    () => buildGraph({ config, activeStageId: activeStage?.id ?? null, visitedIds, selectedId }),
    [config, activeStage, visitedIds, selectedId],
  )

  // Keep a ref to node positions so the camera can follow the walkthrough
  // without making the pan effect depend on the whole nodes array.
  const posRef = useRef<Map<string, FlowNode>>(new Map())
  posRef.current = new Map(nodes.map((n) => [n.id, n]))

  const setVariant = useCallback((stageId: string, variantId: string) => {
    const key = STAGE_CONFIG_KEY[stageId]
    if (!key) return
    setConfig((c) => ({ ...c, [key]: variantId }))
    setSelectedId(stageId)
  }, [])

  const toggle = useCallback((key: keyof PipelineConfig) => {
    setConfig((c) => ({ ...c, [key]: !c[key] }))
  }, [])

  /**
   * Jump to a stage by id — the `governs` chips use this in place of the edges
   * we deliberately don't draw. If the target is toggled off it still selects,
   * so the panel explains it; there is just nothing to pan to.
   */
  const focusStage = useCallback(
    (stageId: string) => {
      setSelectedId(stageId)
      const node = posRef.current.get(stageId)
      if (node) setCenter(node.position.x + 195, node.position.y + 62, { zoom: 0.9, duration: 620 })
    },
    [setCenter],
  )

  // Advance the walkthrough.
  useEffect(() => {
    if (!playing) return
    if (step >= trace.length - 1) {
      setPlaying(false)
      return
    }
    const t = setTimeout(() => setStep((s) => s + 1), 2600 / speed)
    return () => clearTimeout(t)
  }, [playing, step, trace.length, speed])

  // Follow the active stage with the camera, and mirror it into the panel.
  useEffect(() => {
    if (!activeStage) return
    setSelectedId(activeStage.id)
    const node = posRef.current.get(activeStage.id)
    if (node) {
      // Offsets are half the card, so the camera lands on its centre.
      setCenter(node.position.x + 195, node.position.y + 62, { zoom: 0.95, duration: 620 })
    }
  }, [activeStage, setCenter])

  // Esc closes the concept map.
  useEffect(() => {
    if (!mapOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMapOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mapOpen])

  // Collapsing the rail changes the canvas width, so re-fit to use it.
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.15, minZoom: 0.75, duration: 400 }), 240)
    return () => clearTimeout(t)
  }, [railCollapsed, fitView])

  // If a config change removes the stage the walkthrough was sitting on, clamp.
  useEffect(() => {
    if (step > trace.length - 1) setStep(trace.length - 1)
  }, [trace.length, step])

  const onNodeClick: NodeMouseHandler = useCallback((_e, node) => {
    if (node.type === 'lane') return
    setSelectedId((cur) => (cur === node.id ? null : node.id))
  }, [])

  const selectedStage = useMemo(
    () => (selectedId ? (stageById.get(selectedId) ?? null) : null),
    [selectedId],
  )
  const selectedVariant = useMemo(
    () => (selectedStage ? variantFor(selectedStage, config) : undefined),
    [selectedStage, config],
  )

  const traceForPanel =
    activeStage && selectedId === activeStage.id && activeStage.trace
      ? { frame: activeStage.trace, step: step + 1, total: trace.length }
      : null

  const reset = useCallback(() => {
    setPlaying(false)
    setStep(-1)
    setSelectedId(null)
  }, [])

  const ctx = useMemo(
    () => ({ config, setVariant, toggle, select: setSelectedId, focusStage, playing }),
    [config, setVariant, toggle, focusStage, playing],
  )

  return (
    <PipelineContext.Provider value={ctx}>
      <div className="app">
        <header className="topbar">
          <button
            className="rail-toggle"
            onClick={() => setRailCollapsed((c) => !c)}
            title={railCollapsed ? 'Show controls' : 'Hide controls'}
            aria-expanded={!railCollapsed}
          >
            ☰
          </button>
          <h1>RAG Pipeline</h1>
          <span className="sub">Interactive map. Click any stage, or play a query through it</span>
          <div className="topbar-spacer" />
          <div className="lane-key">
            <span>
              <i /> Offline · build the index
            </span>
            <span>
              <i className="key-online" /> Online · per query
            </span>
            <span>
              <i className="key-join" /> The join
            </span>
          </div>
        </header>

        <div className="workspace">
          <ControlRail collapsed={railCollapsed} />

          <div className="canvas-wrap">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodeClick={onNodeClick}
              onPaneClick={() => setSelectedId(null)}
              fitView
              // Floor the initial zoom: fitting all four columns on a laptop
              // shrinks the cards past readability. Better to open legible and
              // let the user pan than to show everything too small to read.
              fitViewOptions={{ padding: 0.15, minZoom: 0.75 }}
              minZoom={0.2}
              maxZoom={1.6}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
              nodesConnectable={false}
            >
              <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="var(--bg-grid)" />
              <Controls showInteractive={false} position="bottom-right" />
            </ReactFlow>

            <Player
              playing={playing}
              step={step}
              total={trace.length}
              label={activeStage?.trace?.headline ?? ''}
              speed={speed}
              onToggle={() => {
                if (step >= trace.length - 1) setStep(-1)
                setPlaying((p) => !p)
                if (step < 0) setStep(0)
              }}
              onStep={(d) => {
                setPlaying(false)
                setStep((s) => Math.min(trace.length - 1, Math.max(0, s + d)))
              }}
              onReset={reset}
              onSpeed={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
            />
          </div>

          <DetailPanel
            stage={selectedStage}
            variantId={selectedVariant}
            trace={traceForPanel}
            onOpenMap={() => setMapOpen(true)}
          />
        </div>

        {mapOpen && selectedStage && (
          <ConceptMap stage={selectedStage} onClose={() => setMapOpen(false)} />
        )}
      </div>
    </PipelineContext.Provider>
  )
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  )
}
