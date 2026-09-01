import { create } from 'zustand'

import type { PhotoScore, PhotoSnapshot } from './scoring/types'

/**
 * Discrete game state.
 *
 * Only things the UI needs to *see* live here — phase changes, film count, the
 * photo list. Per-frame values (route progress, look angles, fov) live in
 * `runtime.ts` as plain mutable fields so they never touch React's render path.
 */

export type Phase = 'menu' | 'riding' | 'review' | 'results'

export interface Photo {
  id: string
  /** Object URL for the captured image. Revoked when the photo is discarded. */
  /**
   * Object URL for the JPEG, or null while it is still being encoded.
   *
   * The photo is recorded the instant the shutter fires — that is when the
   * world was frozen and the score decided — and the picture is attached when
   * the GPU readback and the encode finish. Waiting for the image before
   * admitting the shot had happened meant the film counter and the shutter
   * flash lagged the button by most of a second on a busy street, which reads
   * as the camera being slow rather than as the file being written.
   */
  url: string | null
  snapshot: PhotoSnapshot
  score: PhotoScore
  /** Whether the player kept this one at the review screen. */
  selected: boolean
}

export interface AlbumEntry {
  species: string
  displayName: string
  best: number
  grade: string
  stars: number
  /** Data URL — object URLs don't survive a reload. */
  thumbnail: string | null
  capturedAt: number
}

const ALBUM_KEY = 'snap.album.v1'

function loadAlbum(): Record<string, AlbumEntry> {
  try {
    const raw = localStorage.getItem(ALBUM_KEY)
    return raw ? (JSON.parse(raw) as Record<string, AlbumEntry>) : {}
  } catch {
    // A corrupt or unavailable album should never stop the game booting.
    return {}
  }
}

function saveAlbum(album: Record<string, AlbumEntry>): void {
  try {
    localStorage.setItem(ALBUM_KEY, JSON.stringify(album))
  } catch {
    // Quota exceeded or private mode — the run still works, it just won't persist.
  }
}

interface GameStore {
  phase: Phase
  routeId: string
  filmRemaining: number
  photos: Photo[]
  album: Record<string, AlbumEntry>
  /** Bumped on every shutter press so the HUD can flash without a per-frame sub. */
  shutterTick: number

  startRun: (routeId: string, film: number) => void
  addPhoto: (photo: Omit<Photo, 'selected'>) => void
  /** Attach the encoded image to a photo already recorded. */
  attachImage: (id: string, url: string) => void
  endRun: () => void
  toggleSelected: (id: string) => void
  submit: () => void
  backToMenu: () => void
}

export const useGame = create<GameStore>((set, get) => ({
  phase: 'menu',
  routeId: 'goldcoast',
  filmRemaining: 0,
  photos: [],
  album: loadAlbum(),
  shutterTick: 0,

  startRun: (routeId, film) => {
    // Release the previous run's images before dropping the references.
    get().photos.forEach((p) => { if (p.url) URL.revokeObjectURL(p.url) })
    set({ phase: 'riding', routeId, filmRemaining: film, photos: [], shutterTick: 0 })
  },

  addPhoto: (photo) =>
    set((s) => ({
      photos: [...s.photos, { ...photo, selected: true }],
      filmRemaining: Math.max(0, s.filmRemaining - 1),
      shutterTick: s.shutterTick + 1,
    })),

  attachImage: (id, url) =>
    set((s) => ({
      photos: s.photos.map((p) => (p.id === id ? { ...p, url } : p)),
    })),

  endRun: () => set({ phase: 'review' }),

  toggleSelected: (id) =>
    set((s) => ({
      photos: s.photos.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p)),
    })),

  submit: () => {
    const { photos, album } = get()
    const next = { ...album }

    for (const photo of photos) {
      if (!photo.selected || !photo.score.primary) continue
      const { species, displayName } = photo.score.primary
      const current = next[species]
      if (current && current.best >= photo.score.total) continue

      next[species] = {
        species,
        displayName,
        best: photo.score.total,
        grade: photo.score.grade,
        stars: photo.score.stars,
        // Object URLs die on reload; the thumbnail is filled in by the results
        // screen, which has the canvas needed to downscale it.
        thumbnail: current?.thumbnail ?? null,
        capturedAt: Date.now(),
      }
    }

    saveAlbum(next)
    set({ album: next, phase: 'results' })
  },

  backToMenu: () => set({ phase: 'menu' }),
}))

/** Total of every kept photo — the run score shown on the results screen. */
export function runTotal(photos: Photo[]): number {
  return photos.reduce((sum, p) => (p.selected ? sum + p.score.total : sum), 0)
}
