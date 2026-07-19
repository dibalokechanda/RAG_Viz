import type { Node, NodeProps } from '@xyflow/react'
import type { LaneNodeData } from '../data/graph'

export default function LaneLabel({ data }: NodeProps<Node<LaneNodeData, 'lane'>>) {
  return (
    <div className={`lane-head ${data.phase}`}>
      <div className="lane-head-title">{data.title}</div>
      <div className="lane-head-sub">{data.subtitle}</div>
    </div>
  )
}
