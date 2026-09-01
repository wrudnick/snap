import type { ReactionDef, SubjectDef } from '@/content/subjects/types'

/**
 * The scripted responses a species has, as a readable sequence.
 *
 * Reactions are the one thing in this game that unfold over time *and* are
 * authored as data, which makes them the easiest thing to get wrong and the
 * hardest to see. A dog's answer to a hot dog is four beats over about six
 * seconds ending on its most valuable pose — that shape is the design, and
 * until now the only way to check it was to throw a hot dog at a beach and
 * watch numbers scroll.
 *
 * The pose value of each beat is shown because the shape that matters is where
 * the payoff sits. A sequence that peaks in the middle and trails off is a
 * worse photograph than one that builds, and that is visible here at a glance
 * and nowhere else.
 */
export function ReactionPanel({
  def,
  onPlayClip,
}: {
  def: SubjectDef
  /** Jump the model to a beat's clip, to see the pose it lands in. */
  onPlayClip: (clip: string) => void
}) {
  const reactions = def.reactions ?? []

  if (reactions.length === 0) {
    const simple = def.behaviors.filter((b) => b.trigger)
    return (
      <div className="reactions">
        <h2>Reactions</h2>
        {simple.length === 0 ? (
          <p className="reactions-none">Nothing triggered. This species ignores everything thrown at it.</p>
        ) : (
          <>
            <p className="reactions-none">Single-clip only — no scripted sequence.</p>
            {simple.map((b) => (
              <button key={`${b.trigger}:${b.clip}`} onClick={() => onPlayClip(b.clip)}>
                {b.trigger} → {b.clip}
              </button>
            ))}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="reactions">
      <h2>Reactions</h2>
      {reactions.map((reaction: ReactionDef) => {
        const total = reaction.steps.reduce(
          (sum, s) => sum + (typeof s.hold === 'number' ? s.hold : 0),
          0,
        )
        return (
          <div className="reaction" key={reaction.trigger}>
            <div className="reaction-head">
              <span className="reaction-trigger">{reaction.trigger}</span>
              <span className="reaction-meta">
                senses {reaction.senses} m · {total.toFixed(1)}s + travel
              </span>
            </div>
            {reaction.steps.map((step, i) => {
              const pose = def.poses[step.clip]
              return (
                <button
                  key={`${step.clip}:${i}`}
                  className="reaction-step"
                  onClick={() => onPlayClip(step.clip)}
                  title="Show this beat's pose"
                >
                  <span className="reaction-beat">{i + 1}</span>
                  <span className="reaction-clip">{step.clip}</span>
                  <span className="reaction-hold">
                    {step.hold === 'arrive' ? `walk ${step.speed ?? 0} m/s` : `${step.hold}s`}
                  </span>
                  {/* Worth, as a bar, so the shape of the sequence is visible
                      without reading four numbers. */}
                  <span className="reaction-worth">
                    <span
                      className="reaction-worthBar"
                      style={{ width: `${(pose?.value ?? 0) * 100}%` }}
                    />
                    <span className="reaction-worthText">
                      {pose ? pose.value.toFixed(2) : '—'}
                      {pose?.peak ? ' ✦' : ''}
                    </span>
                  </span>
                  {step.consume && <span className="reaction-eat">eats it</span>}
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
