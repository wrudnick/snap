import { create } from 'zustand'

import { saleValue } from '@/game/economy'
import type { Rarity } from '@/game/scoring/types'

import type { WorldState } from '@/game/capture/world'

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
  /**
   * Everything in the world when the shutter fired, for reading afterwards.
   *
   * Not used by scoring or by the game — this is the record you open when
   * something in the picture is standing somewhere it should not be.
   */
  world?: WorldState
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

/**
 * One postcard on the rack.
 *
 * Keyed by slot rather than by species, because "taxi driver, yelling" and
 * "taxi driver, parked" are different postcards, and so are the same tower
 * square-on and three-quarter.
 *
 * Two numbers, doing different jobs. `paid` is a ratchet on the best grade ever
 * sold in this slot and is what the money follows; `points` belongs to the card
 * currently displayed and is what the portfolio follows. They come apart on
 * purpose: an S with a dull background has already banked its money, and an A
 * with a beautiful one pays nothing but scores higher — so which one hangs on
 * the rack is a real choice, and it is the one a photographer would have.
 */
export interface AlbumEntry {
  slot: string
  kind: 'actor' | 'structure'
  species: string
  displayName: string
  /** What it was doing, or which face was shot. */
  sublabel: string
  rarity: Rarity
  /** Points of the card currently on the rack. The portfolio is their sum. */
  best: number
  grade: string
  stars: number
  /** Ladder value already paid out for this slot, in money. */
  paid: number
  /** Data URL — object URLs don't survive a reload. */
  thumbnail: string | null
  capturedAt: number
}

const ALBUM_KEY = 'snap.album.v2'
const MONEY_KEY = 'snap.money.v1'

const OWNED_KEY = 'snap.owned.v1'

function loadOwned(): string[] {
  try {
    const raw = localStorage.getItem(OWNED_KEY)
    const list = raw ? (JSON.parse(raw) as string[]) : []
    // The starting camera is never not owned, however the save got here.
    return list.includes('compact') ? list : ['compact', ...list]
  } catch {
    return ['compact']
  }
}

function loadMoney(): number {
  try {
    const raw = localStorage.getItem(MONEY_KEY)
    const n = raw ? Number(raw) : 0
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

function loadAlbum(): Record<string, AlbumEntry> {
  try {
    const raw = localStorage.getItem(ALBUM_KEY)
    return raw ? (JSON.parse(raw) as Record<string, AlbumEntry>) : {}
  } catch {
    // A corrupt or unavailable album should never stop the game booting.
    return {}
  }
}

function saveAlbum(album: Record<string, AlbumEntry>, money?: number): void {
  try {
    localStorage.setItem(ALBUM_KEY, JSON.stringify(album))
    if (money !== undefined) localStorage.setItem(MONEY_KEY, String(money))
  } catch {
    // Quota exceeded or private mode — the run still works, it just won't persist.
  }
}

interface GameStore {
  phase: Phase
  routeId: string
  cameraBody: string
  filmRemaining: number
  photos: Photo[]
  album: Record<string, AlbumEntry>
  /**
   * Money, and what the last run earned.
   *
   * One currency. It buys equipment and it buys locations, and that single
   * choice — better glass, or somewhere new to point it — is the spine of the
   * economy. Persisted with the rack, because a rack without the money it
   * earned is a save file that has forgotten half of itself.
   */
  money: number
  lastEarned: number
  /** Bodies owned. The one you start with is always among them. */
  owned: string[]
  buy: (id: string, price: number) => void
  equip: (id: string) => void
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
  /**
   * The camera you own. One for now; the shop replaces this.
   *
   * Lives in the store rather than in a route or a component because it is a
   * property of the player, and it decides the frame every photograph is
   * composed in, captured at and scored against.
   */
  cameraBody: 'compact',
  filmRemaining: 0,
  photos: [],
  album: loadAlbum(),
  money: loadMoney(),
  lastEarned: 0,
  owned: loadOwned(),
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

  buy: (id, price) => {
    const { money, owned } = get()
    if (owned.includes(id) || money < price) return
    const next = [...owned, id]
    try {
      localStorage.setItem(OWNED_KEY, JSON.stringify(next))
      localStorage.setItem(MONEY_KEY, String(money - price))
    } catch {
      // A save that cannot be written should not stop the purchase working
      // for this session.
    }
    set({ owned: next, money: money - price, cameraBody: id })
  },

  equip: (id) => {
    if (!get().owned.includes(id)) return
    set({ cameraBody: id })
  },

  submit: () => {
    const { photos, album, money } = get()
    const next = { ...album }
    let earned = 0

    for (const photo of photos) {
      const lead = photo.score.scene[0]
      if (!photo.selected || !lead) continue

      const current = next[lead.slot]
      const paid = current?.paid ?? 0

      /**
       * Money and the rack move independently.
       *
       * The sale is a ratchet on the best grade ever sold in this slot, so
       * bringing back the same grade again earns nothing. The card on display
       * is whichever scores highest, which is not always the one that paid —
       * a scene-rich A can take the slot from an S that has already banked.
       */
      const sale = saleValue(photo.score.grade, lead.rarity, paid)
      earned += sale

      const displaces = !current || photo.score.total > current.best
      if (!displaces && sale === 0) continue

      next[lead.slot] = {
        slot: lead.slot,
        kind: lead.kind,
        species: lead.id,
        displayName: lead.label,
        sublabel: lead.sublabel,
        rarity: lead.rarity,
        best: displaces ? photo.score.total : current!.best,
        grade: displaces ? photo.score.grade : current!.grade,
        stars: displaces ? photo.score.stars : current!.stars,
        paid: paid + sale,
        // Object URLs die on reload; the thumbnail is filled in by the results
        // screen, which has the canvas needed to downscale it.
        thumbnail: current?.thumbnail ?? null,
        capturedAt: Date.now(),
      }
    }

    saveAlbum(next, money + earned)
    set({ album: next, money: money + earned, lastEarned: earned, phase: 'results' })
  },

  backToMenu: () => set({ phase: 'menu' }),
}))

/** Total of every kept photo — the run score shown on the results screen. */
export function runTotal(photos: Photo[]): number {
  return photos.reduce((sum, p) => (p.selected ? sum + p.score.total : sum), 0)
}
