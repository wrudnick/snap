import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, URL } from 'node:url'

import type { Plugin } from 'vite'

/**
 * Lets the in-browser route editor save its work to disk.
 *
 * The route is authored as a hand-written array of waypoints, which is fine to
 * read and miserable to *place* — deciding which block a turn belongs on by
 * typing coordinates has been wrong three times now. The map editor fixes that,
 * but only if what it produces survives the page reload, and a phone is the
 * worst possible device for copying a hundred numbers out of a text box.
 *
 * So the editor POSTs here and this writes the draft next to the route it
 * describes. Dev only: it never reaches a build, and it writes exactly one
 * known path.
 */

const DRAFT = fileURLToPath(new URL('../content/routes/goldcoast.draft.json', import.meta.url))

export function routeDraft(): Plugin {
  return {
    name: 'snap-route-draft',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__route', (req, res) => {
        if (req.method === 'GET') {
          readFile(DRAFT, 'utf8')
            .then((body) => {
              res.setHeader('content-type', 'application/json')
              res.end(body)
            })
            .catch(() => {
              res.statusCode = 404
              res.end('{}')
            })
          return
        }

        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }

        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          try {
            // Parse before writing, so a truncated request can't leave the
            // draft unreadable.
            const parsed: unknown = JSON.parse(body)
            void writeFile(DRAFT, `${JSON.stringify(parsed, null, 2)}\n`).then(() => {
              server.config.logger.info(`[route] draft saved (${body.length} bytes)`)
              res.setHeader('content-type', 'application/json')
              res.end('{"ok":true}')
            })
          } catch {
            res.statusCode = 400
            res.end('{"ok":false}')
          }
        })
      })
    },
  }
}
