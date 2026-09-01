import type { Photo } from '@/game/state'

/**
 * A photo with its score broken down.
 *
 * The breakdown is the whole reason the scoring is deterministic. A number on
 * its own reads as arbitrary; four labelled bars plus a named pose tell the
 * player exactly which lever to pull next time — which is what makes the system
 * something you can learn to play against.
 */

function Metric({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="metric">
      <span className="k">{label}</span>
      <span className="track">
        <span className="fill" style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className="v">{note ?? `${Math.round(value * 100)}`}</span>
    </div>
  )
}

const BAND_LABEL: Record<string, string> = {
  facing: 'facing',
  profile: 'profile',
  away: 'away',
}

export function PhotoCard({
  photo,
  onToggle,
  showBreakdown = true,
}: {
  photo: Photo
  onToggle?: (id: string) => void
  showBreakdown?: boolean
}) {
  const { score } = photo
  const primary = score.primary

  return (
    <div
      className={`shot ${photo.selected ? 'kept' : 'dropped'}`}
      onClick={onToggle ? () => onToggle(photo.id) : undefined}
      style={{ cursor: onToggle ? 'pointer' : 'default' }}
    >
      {/*
        The frame is drawn whether or not the picture has arrived.

        A photo exists from the moment the shutter fires; the JPEG turns up a
        beat later. Rendering nothing until then would make the review grid pop
        as images land, which is a worse tell than a briefly empty frame.
      */}
      {photo.url ? (
        <img src={photo.url} alt={primary ? `Photo of ${primary.displayName}` : 'Empty photo'} />
      ) : (
        <div className="shot__developing" aria-label="Developing" />
      )}

      <div className="meta">
        <div>
          <div className="name">{primary ? primary.displayName : 'Nothing in frame'}</div>
          <div className="sub">
            {primary
              ? `${primary.poseLabel}${primary.hitPeak ? ' ✦' : ''} · ${BAND_LABEL[primary.directionBand]}`
              : 'No points'}
          </div>
        </div>
        <div className="row" style={{ gap: '0.5rem' }}>
          <span className="pts">{score.total.toLocaleString()}</span>
          <span className={`grade ${score.grade === 'D' ? 'd' : ''}`}>{score.grade}</span>
        </div>
      </div>

      {showBreakdown && primary && (
        <div className="breakdown">
          <Metric label="Size" value={primary.size} />
          <Metric label="Placement" value={primary.placement} />
          <Metric label="Direction" value={primary.direction} />
          <Metric label="Pose" value={primary.pose} />
          {score.sameSpeciesBonus > 0 && (
            <div className="metric">
              <span className="k">Flock</span>
              <span className="track" />
              <span className="v">+{score.sameSpeciesBonus}</span>
            </div>
          )}
          {score.distinctSpeciesBonus > 0 && (
            <div className="metric">
              <span className="k">Variety</span>
              <span className="track" />
              <span className="v">+{score.distinctSpeciesBonus}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
