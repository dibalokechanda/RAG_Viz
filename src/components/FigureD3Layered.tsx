import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { Figure } from '../data/types'

export default function FigureD3Layered({ f }: { f: Extract<Figure, { kind: 'layered' }> }) {
  const svgRef = useRef<SVGSVGElement>(null)

  // Layout parameters
  const getCy = (layer: number) => 210 - layer * 70
  
  useEffect(() => {
    if (!svgRef.current || !f.path || f.path.length === 0) return

    const svg = d3.select(svgRef.current)
    const path = f.path

    let isUnmounted = false
    let timeout: number | undefined

    const wait = (ms: number) => new Promise(resolve => {
      timeout = window.setTimeout(resolve, ms)
    })

    async function runAnimation() {
      while (!isUnmounted) {
        svg.selectAll('.layer-node')
           .transition().duration(200)
           .attr('fill', 'var(--surface-hover)')
           .attr('stroke', 'var(--border-strong)')
           
        svg.selectAll('.node-target')
           .transition().duration(200)
           .attr('fill', '#a32a2a')
           .attr('stroke', '#a32a2a')

        svg.selectAll('.layer-link')
           .transition().duration(200)
           .attr('stroke', 'var(--border-heavy)')
           .attr('stroke-width', '1.5')
           .attr('opacity', 0.6)

        // Reset descent lines (vertical drops)
        svg.selectAll('.descent-line').remove()

        await wait(1000)
        if (isUnmounted) break

        for (let i = 0; i < path.length; i++) {
          const curr = path[i]
          
          svg.select(`#node-${curr.layer}-${curr.node}`)
             .transition().duration(300)
             .attr('fill', 'var(--ink)')
             .attr('stroke', 'var(--ink)')
          
          if (i > 0) {
            const prev = path[i - 1]
            if (prev.layer === curr.layer) {
              // Horizontal hop
              svg.select(`#link-${curr.layer}-${prev.node}-${curr.node}`)
                 .transition().duration(300)
                 .attr('stroke', 'var(--ink)')
                 .attr('stroke-width', '2.5')
                 .attr('opacity', 1)
                 
              svg.select(`#link-${curr.layer}-${curr.node}-${prev.node}`)
                 .transition().duration(300)
                 .attr('stroke', 'var(--ink)')
                 .attr('stroke-width', '2.5')
                 .attr('opacity', 1)
            } else {
              // Vertical drop
              const sourceNode = f.nodes.find(n => n.id === prev.node)
              const targetNode = f.nodes.find(n => n.id === curr.node)
              if (sourceNode && targetNode) {
                // It's the same physical node in data, but rendered on different layers
                const x = sourceNode.x
                const y1 = getCy(prev.layer)
                const y2 = getCy(curr.layer)
                
                const line = svg.append('line')
                  .attr('class', 'descent-line')
                  .attr('x1', x)
                  .attr('y1', y1)
                  .attr('x2', x)
                  .attr('y2', y1)
                  .attr('stroke', 'var(--ink)')
                  .attr('stroke-width', '2.5')
                  .attr('stroke-dasharray', '4 4')
                  
                line.transition().duration(400)
                    .attr('y2', y2)
              }
            }
          }
          
          await wait(700)
          if (isUnmounted) break
        }
        
        await wait(3000)
      }
    }
    
    runAnimation()
    return () => {
      isUnmounted = true
      clearTimeout(timeout)
    }
  }, [f])

  return (
    <svg ref={svgRef} viewBox="0 0 400 260" width="100%" className="fig-svg">
      {/* Draw Layer Planes */}
      {f.layers.map(layer => {
        const y = getCy(layer)
        return (
          <g key={`plane-${layer}`}>
            {/* Plane background to give depth */}
            <polygon 
              points={`20,${y + 15} 380,${y + 15} 360,${y - 25} 40,${y - 25}`} 
              fill="var(--surface-hover)" 
              opacity="0.3" 
            />
            <text x="10" y={y + 5} fontSize="11" fontFamily="var(--mono)" fill="var(--text-faint)">
              L{layer}
            </text>
          </g>
        )
      })}
      
      {/* Draw Links */}
      {f.links.map(l => {
        const source = f.nodes.find(n => n.id === l.source)
        const target = f.nodes.find(n => n.id === l.target)
        if (!source || !target) return null
        return (
          <line
            key={`link-${l.layer}-${l.source}-${l.target}`}
            id={`link-${l.layer}-${l.source}-${l.target}`}
            className="layer-link"
            x1={source.x}
            y1={getCy(l.layer)}
            x2={target.x}
            y2={getCy(l.layer)}
            stroke="var(--border-heavy)"
            strokeWidth="1.5"
            opacity={0.6}
          />
        )
      })}
      
      {/* Draw Nodes */}
      {f.layers.map(layer => (
        <g key={`nodes-${layer}`}>
          {f.nodes.filter(n => n.maxLayer >= layer).map(n => (
            <g key={`node-${layer}-${n.id}`}>
              <circle
                id={`node-${layer}-${n.id}`}
                className={n.isTarget ? 'node-target' : 'layer-node'}
                cx={n.x}
                cy={getCy(layer)}
                r={n.isTarget ? "4" : "5"}
                fill={n.isTarget ? "#a32a2a" : "var(--surface-hover)"}
                stroke={n.isTarget ? "#a32a2a" : "var(--border-strong)"}
                strokeWidth="1.5"
              />
              {n.isEntry && layer === Math.max(...f.layers) && (
                <text x={n.x} y={getCy(layer) - 10} fontSize="10" fontFamily="var(--mono)" fill="var(--text-faint)" textAnchor="middle">
                  enter
                </text>
              )}
            </g>
          ))}
        </g>
      ))}
    </svg>
  )
}
