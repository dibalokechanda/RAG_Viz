import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { Figure } from '../data/types'

export default function FigureD3Network({ f }: { f: Extract<Figure, { kind: 'network' }> }) {
  const svgRef = useRef<SVGSVGElement>(null)

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
        // Reset all nodes and edges
        svg.selectAll('.node-circle')
           .transition().duration(200)
           .attr('fill', 'var(--surface-hover)')
           .attr('stroke', 'var(--border-strong)')
           
        // Target is special
        svg.selectAll('.node-target')
           .transition().duration(200)
           .attr('fill', '#a32a2a') // Warm accent for query
           .attr('stroke', '#a32a2a')

        svg.selectAll('.link-line')
           .transition().duration(200)
           .attr('stroke', 'var(--border-heavy)')
           .attr('stroke-width', '1.5')

        await wait(1000)
        if (isUnmounted) break

        for (let i = 0; i < path.length; i++) {
          const curr = path[i]
          
          svg.select(`#node-${curr}`)
             .transition().duration(300)
             .attr('fill', 'var(--ink)')
             .attr('stroke', 'var(--ink)')
          
          if (i > 0) {
            const prev = path[i - 1]
            // We select both directions because links might be defined in either order
            svg.select(`#link-${prev}-${curr}`)
               .transition().duration(300)
               .attr('stroke', 'var(--ink)')
               .attr('stroke-width', '2.5')
               
            svg.select(`#link-${curr}-${prev}`)
               .transition().duration(300)
               .attr('stroke', 'var(--ink)')
               .attr('stroke-width', '2.5')
          }
          
          await wait(800)
          if (isUnmounted) break
        }
        
        await wait(2500)
      }
    }
    
    runAnimation()
    return () => {
      isUnmounted = true
      clearTimeout(timeout)
    }
  }, [f])

  return (
    <svg ref={svgRef} viewBox="0 0 400 240" width="100%" className="fig-svg">
      {f.links.map(l => {
        const source = f.nodes.find(n => n.id === l.source)
        const target = f.nodes.find(n => n.id === l.target)
        if (!source || !target) return null
        return (
          <line
            key={`${l.source}-${l.target}`}
            id={`link-${l.source}-${l.target}`}
            className="link-line"
            x1={source.x}
            y1={source.y}
            x2={target.x}
            y2={target.y}
            stroke="var(--border-heavy)"
            strokeWidth="1.5"
          />
        )
      })}
      {f.nodes.map(n => (
        <g key={n.id}>
          <circle
            id={`node-${n.id}`}
            className={n.isTarget ? 'node-target' : 'node-circle'}
            cx={n.x}
            cy={n.y}
            r={n.isTarget ? "5" : "7"}
            fill={n.isTarget ? "#a32a2a" : "var(--surface-hover)"}
            stroke={n.isTarget ? "#a32a2a" : "var(--border-strong)"}
            strokeWidth="1.5"
          />
          {n.isEntry && (
            <text x={n.x} y={n.y - 12} fontSize="11" fontFamily="var(--mono)" fill="var(--text-faint)" textAnchor="middle">
              entry
            </text>
          )}
          {n.label && !n.isEntry && (
            <text x={n.x} y={n.y - 12} fontSize="11" fontFamily="var(--mono)" fill={n.isTarget ? "#a32a2a" : "var(--text-dim)"} textAnchor="middle">
              {n.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}
