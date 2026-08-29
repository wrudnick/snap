import type { EffectComposer } from 'postprocessing'
import * as THREE from 'three'

/**
 * The live post-processing composer, published for code that has to render
 * *through* it rather than alongside it — specifically photo capture.
 *
 * A module singleton rather than context because the consumer (`Shutter`) is a
 * sibling of `<EffectComposer>`, not a child, so React context can't reach it.
 * There is exactly one composer for exactly one canvas, so the singleton is
 * honest about the situation rather than papering over it.
 */
export const activeComposer: { current: EffectComposer | null } = { current: null }

/**
 * Render one frame through the post chain into an offscreen buffer and hand it
 * back, instead of letting it go to the canvas.
 *
 * Two pieces of the composer's internals have to be respected here:
 *
 *  1. `autoRenderToScreen` is a plain field, not a setter — assigning it does
 *     nothing on its own. The flag that actually matters is `renderToScreen` on
 *     the final pass, which has to be cleared or the result goes to the canvas
 *     and the buffers are left stale.
 *
 *  2. `render()` swaps *local* variables, never `this.inputBuffer` /
 *     `this.outputBuffer`. So which of the two holds the finished frame depends
 *     on how many passes swapped: a pass writes into the current output and then
 *     exchanges the pair, so an odd number of swaps leaves the result in
 *     `outputBuffer` and an even number leaves it in `inputBuffer`. Counting is
 *     a line of code and survives someone adding a second effect pass later;
 *     hardcoding "it's the output buffer" would break silently and show up as
 *     photos of the wrong frame.
 */
export function renderThroughComposer(composer: EffectComposer): THREE.WebGLRenderTarget | null {
  const enabled = composer.passes.filter((p) => p.enabled)
  if (enabled.length === 0) return null

  const last = enabled[enabled.length - 1]!
  const wasRenderingToScreen = last.renderToScreen
  last.renderToScreen = false

  // Zero delta: nothing in this chain is time-varying, and advancing the
  // composer's own timer would double-step any effect that later is.
  composer.render(0)

  last.renderToScreen = wasRenderingToScreen

  const swaps = enabled.filter((p) => p.needsSwap).length
  return (swaps % 2 === 1 ? composer.outputBuffer : composer.inputBuffer) as THREE.WebGLRenderTarget
}
