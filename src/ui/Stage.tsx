import { useEffect, useRef, type ReactNode } from 'react'

import { fitAspect, formatAspect, type CameraBody } from '@/content/cameras'

/**
 * The whole game, locked to the film's aspect.
 *
 * Framing is the mechanic here, so the amount you can see cannot be a property
 * of the player's monitor. On an ultrawide you would fit a building in a frame a
 * phone could not, and every structure in the game would be a different
 * difficulty for different people. Locking the view makes everyone shoot the
 * same game — the same reason a competitive shooter pins its field of view.
 *
 * It is also just what a camera is. The picture is 3:2 because the film is, and
 * the surround is a viewfinder rather than more world.
 *
 * Sized in JavaScript rather than with `aspect-ratio`, because that with a max
 * on the other axis does not clamp back through the ratio — it will hand you a
 * box larger than its container — and because this and the finder's frame have
 * to be the same arithmetic. Both come from `fitAspect`.
 */
export function Stage({ body, children }: { body: CameraBody; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = outer.current
    const el = inner.current
    if (!host || !el) return

    const fit = () => {
      const { width, height } = host.getBoundingClientRect()
      if (width <= 0 || height <= 0) return
      const box = fitAspect(width / height, formatAspect(body.format))
      el.style.width = `${Math.round(width * box.width)}px`
      el.style.height = `${Math.round(height * box.height)}px`
    }

    // Fires once on observe, so this is right at startup as well as on rotation.
    const observer = new ResizeObserver(fit)
    observer.observe(host)
    return () => observer.disconnect()
  }, [body.format])

  return (
    <div className="stage" ref={outer}>
      <div className="stage__view" ref={inner}>
        {children}
      </div>
    </div>
  )
}
