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

import { buildGraph, variantFor, STAGE_CONFIG_KEY, type FlowNode } from './data/graph'
import ConceptMap from './components/ConceptMap'
import { stageById } from './data/stages'
import { defaultConfig, type PipelineConfig } from './data/types'
import { PipelineContext } from './PipelineContext'
import StageNode from './components/StageNode'
import LaneLabel from './components/LaneLabel'
import { JoinEdge, PipelineEdge } from './components/edges'
import DetailPanel from './components/DetailPanel'
import ControlRail from './components/ControlRail'
import GraphRAGView from './components/GraphRAGView'

const nodeTypes = { stage: StageNode, lane: LaneLabel }
const edgeTypes = { pipeline: PipelineEdge, join: JoinEdge }

function Canvas() {
  const [config, setConfig] = useState<PipelineConfig>(defaultConfig)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // On a phone the rail is a full-screen sheet, so leaving it open on load
  // would hide the diagram behind it. The topbar toggle brings it back.
  const [railCollapsed, setRailCollapsed] = useState(
    () => window.matchMedia('(max-width: 860px)').matches,
  )

  // Read once: this only feeds fitView, which runs at mount and on rail
  // toggles, so tracking resize buys nothing.
  const [narrow] = useState(() => window.matchMedia('(max-width: 860px)').matches)
  const [mapOpen, setMapOpen] = useState(false)
  const [view, setView] = useState<'rag' | 'graphrag'>('rag')
  const { setCenter, fitView } = useReactFlow()

  const { nodes, edges } = useMemo(
    () => buildGraph({ config, activeStageId: null, visitedIds: new Set(), selectedId }),
    [config, selectedId],
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



  // Esc closes the concept map.
  useEffect(() => {
    if (!mapOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMapOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mapOpen])

  // Collapsing the rail changes the canvas width, so re-fit to use it. Same
  // zoom floor as the initial fit, phone included.
  useEffect(() => {
    const t = setTimeout(
      () =>
        fitView({
          padding: narrow ? 0.06 : 0.15,
          minZoom: narrow ? 0.3 : 0.75,
          duration: 400,
        }),
      240,
    )
    return () => clearTimeout(t)
  }, [railCollapsed, fitView, narrow])



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

  const ctx = useMemo(
    () => ({ config, setVariant, toggle, select: setSelectedId, focusStage, playing: false }),
    [config, setVariant, toggle, focusStage],
  )

  return (
    <PipelineContext.Provider value={ctx}>
      <div className="app">
        <header className="topbar">
          {view === 'rag' && (
            <button
              className="rail-toggle"
              onClick={() => setRailCollapsed((c) => !c)}
              title={railCollapsed ? 'Show controls' : 'Hide controls'}
              aria-expanded={!railCollapsed}
            >
              ☰
            </button>
          )}
          <h1>RAG Pipeline</h1>
          <div className="view-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={view === 'rag'}
              className={view === 'rag' ? 'on' : ''}
              onClick={() => setView('rag')}
            >
              Vanilla RAG
            </button>
            <button
              role="tab"
              aria-selected={view === 'graphrag'}
              className={view === 'graphrag' ? 'on' : ''}
              onClick={() => setView('graphrag')}
            >
              GraphRAG
            </button>
          </div>
          <div className="topbar-spacer" />
          {view === 'rag' && (
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
          )}
        </header>

        {view === 'graphrag' ? (
          <GraphRAGView />
        ) : (
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
                // On a phone that trade flips: 0.75 shows a single card, so let
                // the overall shape win there and leave reading to pinch-zoom.
                fitViewOptions={{ padding: narrow ? 0.06 : 0.15, minZoom: narrow ? 0.3 : 0.75 }}
                minZoom={0.2}
                maxZoom={1.6}
                proOptions={{ hideAttribution: true }}
                nodesDraggable={false}
                nodesConnectable={false}
              >
                <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="var(--bg-grid)" />
                <Controls showInteractive={false} position="bottom-right" />
              </ReactFlow>
            </div>

            <DetailPanel
              stage={selectedStage}
              variantId={selectedVariant}
              onOpenMap={() => setMapOpen(true)}
            />
          </div>
        )}

        {mapOpen && selectedStage && view === 'rag' && (
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
