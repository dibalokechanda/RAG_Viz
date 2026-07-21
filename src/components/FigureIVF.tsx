import { useEffect, useMemo, useState } from 'react'
import * as d3 from 'd3'
import type { Figure } from '../data/types'

type IVF = Extract<Figure, { kind: 'ivf' }>

const ACCENT = '#a32a2a' // query
const PATH = '#1f7a4d' // found / searched
const VB_W = 400
const VB_H = 300
// plot rect
const X0 = 22
const Y0 = 14
const X1 = 378
const Y1 = 246

const sx = (x: number) => X0 + x * (X1 - X0)
const sy = (y: number) => Y0 + y * (Y1 - Y0)
const d2 = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

export default function FigureIVF({ f }: { f: IVF }) {
  // Voronoi cells around the centroids, clipped to the plot rect.
  const cellPaths = useMemo(() => {
    const pts = f.centroids.map((c) => [sx(c.x), sy(c.y)] as [number, number])
    const del = d3.Delaunay.from(pts)
    const vor = del.voronoi([X0, Y0, X1, Y1])
    return f.centroids.map((_, i) => vor.renderCell(i))
  }, [f.centroids])

  // Cell membership: each point joins its nearest centroid.
  const cellOf = useMemo(
    () =>
      f.points.map((p) => {
        let best = 0
        for (let i = 1; i < f.centroids.length; i++) if (d2(p, f.centroids[i]) < d2(p, f.centroids[best])) best = i
        return best
      }),
    [f.points, f.centroids],
  )

  // Nearest nprobe centroids to the query → the cells that get searched.
  const probed = useMemo(() => {
    const order = f.centroids
      .map((c, i) => ({ i, d: d2(c, f.query) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, f.nprobe)
      .map((o) => o.i)
    return new Set(order)
  }, [f.centroids, f.query, f.nprobe])

  const found = useMemo(() => {
    let best = -1
    f.points.forEach((p, idx) => {
      if (!probed.has(cellOf[idx])) return
      if (best === -1 || d2(p, f.query) < d2(f.points[best], f.query)) best = idx
    })
    return best
  }, [f.points, f.query, probed, cellOf])

  const trueNN = useMemo(() => {
    let best = 0
    f.points.forEach((p, idx) => {
      if (d2(p, f.query) < d2(f.points[best], f.query)) best = idx
    })
    return best
  }, [f.points, f.query])

  const missed = trueNN !== found && !probed.has(cellOf[trueNN])

  const captions = useMemo(
    () => [
      'k-means learns nlist centroids; every vector joins the cell of its nearest centroid.',
      'A query arrives, somewhere in the partitioned space.',
      `Find the nprobe nearest centroids to the query. Here nprobe = ${f.nprobe}.`,
      'Scan only the vectors inside those cells. The rest of the corpus is never touched.',
      missed
        ? 'Nearest found in the probed cells, but the true nearest sits one cell over: raise nprobe to catch it. That is the recall dial.'
        : 'Nearest neighbour found, having scanned only a fraction of the vectors.',
    ],
    [f.nprobe, missed],
  )

  const [step, setStep] = useState(0)
  useEffect(() => {
    const isLast = step === captions.length - 1
    const t = window.setTimeout(() => setStep((p) => (p + 1) % captions.length), isLast ? 4000 : 1700)
    return () => clearTimeout(t)
  }, [step, captions.length])

  const showQuery = step >= 1
  const showProbe = step >= 2
  const showScan = step >= 3
  const showFound = step >= 4

  const qx = sx(f.query.x)
  const qy = sy(f.query.y)

  return (
    <div className="net-fig">
      {/* small top margin so a cell edge or point at the plot top doesn't graze the frame */}
      <svg viewBox={`0 -10 ${VB_W} ${VB_H + 12}`} width="100%" className="fig-svg">
        {/* cells */}
        {cellPaths.map((d, i) => {
          const isProbed = probed.has(i)
          const fill = showProbe
            ? isProbed
              ? 'var(--accent-mint, #e4f0e8)'
              : 'var(--surface-sunken)'
            : 'var(--surface-hover)'
          return (
            <path
              key={`cell-${i}`}
              d={d ?? undefined}
              fill={fill}
              fillOpacity={showProbe && !isProbed ? 0.5 : 0.85}
              stroke={showProbe && isProbed ? PATH : 'var(--border-strong)'}
              strokeWidth={showProbe && isProbed ? 1.6 : 1}
            />
          )
        })}

        {/* points (vectors) */}
        {f.points.map((p, idx) => {
          const inProbed = probed.has(cellOf[idx])
          const isFound = showFound && idx === found
          const isTrueMiss = showFound && missed && idx === trueNN
          const lit = showScan && inProbed
          return (
            <g key={`p-${idx}`}>
              {isFound && <circle cx={sx(p.x)} cy={sy(p.y)} r="6" fill="none" stroke={PATH} strokeWidth="1.8" />}
              {isTrueMiss && (
                <circle cx={sx(p.x)} cy={sy(p.y)} r="6" fill="none" stroke={ACCENT} strokeWidth="1.6" strokeDasharray="2.5 2" />
              )}
              <circle
                cx={sx(p.x)}
                cy={sy(p.y)}
                r={2.6}
                fill={isFound ? PATH : lit ? 'var(--ink)' : 'var(--text-faint)'}
                opacity={showScan && !inProbed ? 0.35 : 1}
              />
            </g>
          )
        })}

        {/* centroids (diamonds) */}
        {f.centroids.map((c, i) => {
          const cx = sx(c.x)
          const cy = sy(c.y)
          const isProbed = showProbe && probed.has(i)
          return (
            <path
              key={`c-${i}`}
              d={`M ${cx} ${cy - 6} L ${cx + 6} ${cy} L ${cx} ${cy + 6} L ${cx - 6} ${cy} Z`}
              fill={isProbed ? PATH : 'var(--ink)'}
              stroke="#fff"
              strokeWidth="1"
            />
          )
        })}

        {/* found → query connector */}
        {showFound && found >= 0 && (
          <line x1={sx(f.points[found].x)} y1={sy(f.points[found].y)} x2={qx} y2={qy} stroke={PATH} strokeWidth="1.4" strokeDasharray="3 2" />
        )}

        {/* query cross */}
        {showQuery && (
          <g>
            <path
              d={`M ${qx - 6} ${qy - 6} L ${qx + 6} ${qy + 6} M ${qx + 6} ${qy - 6} L ${qx - 6} ${qy + 6}`}
              stroke={ACCENT}
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <text x={qx + 9} y={qy - 6} fontSize="10.5" fontFamily="var(--mono)" fill={ACCENT}>
              query
            </text>
          </g>
        )}

        {/* legend */}
        <g transform="translate(12, 284)">
          <path d="M 4 0 L 8 -4 L 12 0 L 8 4 Z" fill="var(--ink)" />
          <text x="18" y="3.5" fontSize="9.5" fontFamily="var(--mono)" fill="var(--text-dim)">centroid</text>
          <circle cx="92" cy="0" r="2.6" fill="var(--text-faint)" />
          <text x="99" y="3.5" fontSize="9.5" fontFamily="var(--mono)" fill="var(--text-dim)">vector</text>
          <rect x="150" y="-5" width="10" height="10" rx="1.5" fill="var(--accent-mint, #e4f0e8)" stroke={PATH} strokeWidth="1" />
          <text x="166" y="3.5" fontSize="9.5" fontFamily="var(--mono)" fill="var(--text-dim)">searched cell</text>
          <path d="M 268 -4 L 276 4 M 276 -4 L 268 4" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
          <text x="284" y="3.5" fontSize="9.5" fontFamily="var(--mono)" fill="var(--text-dim)">query</text>
        </g>
      </svg>

      <div className="net-status">{captions[step]}</div>
    </div>
  )
}
