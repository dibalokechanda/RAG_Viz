interface Props {
  playing: boolean
  step: number
  total: number
  label: string
  speed: number
  onToggle: () => void
  onStep: (delta: number) => void
  onReset: () => void
  onSpeed: () => void
}

export default function Player({
  playing,
  step,
  total,
  label,
  speed,
  onToggle,
  onStep,
  onReset,
  onSpeed,
}: Props) {
  const pct = total <= 1 ? 0 : (step / (total - 1)) * 100

  return (
    <div className="player">
      <div className="player-label">
        {step < 0 ? (
          <span>Walk one query through</span>
        ) : (
          <>
            <b>{label}</b>
          </>
        )}
      </div>

      <button className="pbtn" onClick={onReset} disabled={step < 0} title="Reset">
        ⟲
      </button>
      <button className="pbtn" onClick={() => onStep(-1)} disabled={step <= 0} title="Previous stage">
        ‹
      </button>
      <button className="pbtn primary" onClick={onToggle} title={playing ? 'Pause' : 'Play'}>
        {playing ? '❚❚' : '▶'}
      </button>
      <button
        className="pbtn"
        onClick={() => onStep(1)}
        disabled={step >= total - 1}
        title="Next stage"
      >
        ›
      </button>

      <div className="player-track">
        <div className="player-fill" style={{ width: `${Math.max(0, pct)}%` }} />
      </div>

      <button className="speed" onClick={onSpeed} title="Playback speed">
        {speed}×
      </button>
    </div>
  )
}
