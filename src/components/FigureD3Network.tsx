import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { Figure } from '../data/types'

export default function FigureD3Network({ f }: { f: Extract<Figure, { kind: 'network' }> }) {
  const svgRef = useRef<SVGSVGElement>(null)
  
  const [tableData, setTableData] = useState<{
    status: string;
    rows: { id: string; similarity: number; isChosen: boolean }[];
  } | null>(null)

  useEffect(() => {
    if (!svgRef.current) return

    const svg = d3.select(svgRef.current)
    let isUnmounted = false
    let timeout: number | undefined

    const wait = (ms: number) => new Promise(resolve => {
      timeout = window.setTimeout(resolve, ms)
    })

    const entry = f.nodes.find(n => n.isEntry)
    const target = f.nodes.find(n => n.isTarget)
    if (!entry || !target) return

    const maxDist = Math.hypot(400, 240)

    async function runAnimation() {
      try {
        while (!isUnmounted) {
          // Reset
          svg.selectAll('.node-circle')
             .transition().duration(200)
             .attr('fill', 'var(--surface-hover)')
             .attr('stroke', 'var(--border-strong)')
             .attr('stroke-width', '1.5')
             .attr('r', '7')
             
          svg.selectAll('.node-target')
             .transition().duration(200)
             .attr('fill', '#a32a2a')
             .attr('stroke', '#a32a2a')

          svg.selectAll('.link-line')
             .transition().duration(200)
             .attr('stroke', 'var(--border-heavy)')
             .attr('stroke-width', '1.5')
             
          svg.selectAll('.pulse-ring').remove()

          setTableData(null)
          await wait(1000)
          if (isUnmounted) break

          let curr = entry!

          while (true) {
            // Highlight current node and add pulse
            svg.select(`#node-${curr.id}`)
               .transition().duration(300)
               .attr('fill', 'var(--ink)')
               .attr('stroke', 'var(--ink)')
               
            const pulse = svg.insert('circle', `#node-${curr.id}`)
               .attr('class', 'pulse-ring')
               .attr('cx', curr.x)
               .attr('cy', curr.y)
               .attr('r', 7)
               .attr('fill', 'none')
               .attr('stroke', 'var(--ink)')
               .attr('stroke-width', 2)
               .attr('opacity', 1)
               
            pulse.transition()
               .duration(1000)
               .attr('r', 20)
               .attr('opacity', 0)
               .on('end', function() { d3.select(this).remove() })

            // Find neighbours
            const neighbourIds = f.links
              .filter(l => l.source === curr.id || l.target === curr.id)
              .map(l => l.source === curr.id ? l.target : l.source)
              
            const neighbours = neighbourIds.map(id => {
              const n = f.nodes.find(node => node.id === id)!
              const dist = Math.hypot(n.x - target!.x, n.y - target!.y)
              return { id, dist, similarity: 1 - dist / maxDist }
            })

            // Sort by similarity descending
            neighbours.sort((a, b) => b.similarity - a.similarity)
            
            const currDist = Math.hypot(curr.x - target!.x, curr.y - target!.y)
            const currSim = 1 - currDist / maxDist
            
            const best = neighbours.length > 0 ? neighbours[0] : null
            const hopsTo = best && best.similarity > currSim ? best.id : null

            setTableData({
              status: hopsTo ? `Evaluating neighbours of ${curr.label || curr.id}...` : `Local minimum reached at ${curr.label || curr.id}.`,
              rows: neighbours.map(n => ({
                id: n.id,
                similarity: n.similarity,
                isChosen: n.id === hopsTo
              }))
            })

            if (!hopsTo) break

            await wait(1500)
            if (isUnmounted) break

            // Animate link
            svg.select(`#link-${curr.id}-${hopsTo}`)
               .transition().duration(300)
               .attr('stroke', 'var(--ink)')
               .attr('stroke-width', '2.5')
            svg.select(`#link-${hopsTo}-${curr.id}`)
               .transition().duration(300)
               .attr('stroke', 'var(--ink)')
               .attr('stroke-width', '2.5')
            
            await wait(800)
            if (isUnmounted) break
            
            curr = f.nodes.find(n => n.id === hopsTo)!
          }
          
          await wait(3500)
        }
      } catch (err: any) {
        setTableData({
          status: `Error: ${err.message}`,
          rows: []
        })
      }
    }
    
    runAnimation()
    return () => {
      isUnmounted = true
      clearTimeout(timeout)
    }
  }, [f])

  return (
    <div className="net-fig">
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
                {n.label || 'entry'}
              </text>
            )}
            {n.label && !n.isEntry && (
              <text x={n.x} y={n.y - 12} fontSize="11" fontFamily="var(--mono)" fill={n.isTarget ? "#a32a2a" : "var(--text-dim)"} textAnchor="middle">
                {n.label}
              </text>
            )}
          </g>
        ))}
        {f.annotations?.map((a, i) => (
          <text key={i} x={a.x} y={a.y} fontSize="10.5" fontFamily="var(--mono)" fill="var(--text-dim)" textAnchor={a.anchor || 'start'}>
            {a.text}
          </text>
        ))}
      </svg>

      {tableData && (
        <>
          <div className="net-status">{tableData.status}</div>
          <table className="net-table">
            <thead>
              <tr>
                <th>Neighbour</th>
                <th>Similarity to query</th>
              </tr>
            </thead>
            <tbody>
              {tableData.rows.map(r => (
                <tr key={r.id} className={r.isChosen ? 'is-chosen' : ''}>
                  <td>{r.id}</td>
                  <td>
                    <div className="net-bar" style={{ width: `${Math.max(2, r.similarity * 100)}%` }}></div>
                    <div className="net-val">{(r.similarity * 100).toFixed(1)}%</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
