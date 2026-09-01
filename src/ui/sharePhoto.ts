import type { Photo } from '@/game/state'

/**
 * Hand a photograph to the phone's share sheet, with the numbers to reproduce it.
 *
 * The debugging loop is: play on the phone, spot something wrong, send it back
 * with a note. An iOS screenshot does most of that, but it arrives with no idea
 * where on the route it was taken, which way the camera was pointing, or which
 * build was running — and a phone caches hard enough that the last of those has
 * already twice meant a bug reported against a build that predated its fix.
 *
 * So it shares the game's *own* capture, which is the frame without the HUD
 * over it, and puts the rest in the message. Everything in that line is
 * something needed to stand the same frame up again on a desk.
 */
export function shareText(photo: Photo): string {
  const s = photo.snapshot
  const v = s.view
  const round = (n: number) => Math.round(n * 1000) / 1000
  const named = s.subjects.map((o) => o.species)
  return [
    `snap ${s.routeId} t=${round(s.t)}`,
    v ? `${v.focalLength}mm yaw=${round(v.yaw)} pitch=${round(v.pitch)} fov=${Math.round(v.fov)}` : null,
    v ? `build=${v.build}` : null,
    named.length ? `in frame: ${[...new Set(named)].join(', ')}` : 'nothing in frame',
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Whether this browser can share an image file at all. */
export function canSharePhoto(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false
  try {
    const probe = new File([new Uint8Array([0])], 'p.jpg', { type: 'image/jpeg' })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

/**
 * Share, or fall back to a download.
 *
 * Desktop browsers mostly cannot share a file, and a share button that silently
 * does nothing is worse than no button — so there it saves the JPEG and copies
 * the same line to the clipboard instead.
 */
export async function sharePhoto(photo: Photo): Promise<'shared' | 'saved' | 'pending'> {
  if (!photo.url) return 'pending'
  const text = shareText(photo)
  const blob = await fetch(photo.url).then((r) => r.blob())
  const file = new File([blob], `${photo.id}.jpg`, { type: 'image/jpeg' })

  if (canSharePhoto()) {
    try {
      await navigator.share({ files: [file], text })
      return 'shared'
    } catch (err) {
      // Cancelling the sheet rejects; that is not a failure worth reporting.
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared'
    }
  }

  const a = document.createElement('a')
  a.href = photo.url
  a.download = `${photo.id}.jpg`
  a.click()
  try {
    await navigator.clipboard?.writeText(text)
  } catch {
    // Clipboard is best-effort; the file is the part that matters.
  }
  return 'saved'
}
