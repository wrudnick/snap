import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, URL } from 'node:url'

import type { Plugin } from 'vite'

/**
 * Lets the in-browser editors save their work to disk.
 *
 * The route is a hand-written array of waypoints and the models are hand-written
 * calls to `part()`. Both are fine to read and miserable to *place*: deciding
 * which block a turn belongs on, or whether a rider sits two centimetres too
 * high, by typing numbers and rebuilding is a terrible loop, and both have
 * needed many rounds of it.
 *
 * The editors fix that, but only if what they produce survives the page reload,
 * and a phone is the worst possible device for copying a hundred numbers out of
 * a textarea. So they POST here and this writes the file.
 *
 * Dev only, and each route writes exactly one known path — nothing about the
 * request chooses where anything lands.
 */

const FILES = {
  route: fileURLToPath(new URL('../content/routes/goldcoast.draft.json', import.meta.url)),
  parts: fileURLToPath(new URL('../content/models/partOverrides.json', import.meta.url)),
}

export function routeDraft(): Plugin {
  return {
    name: 'snap-editor-save',
    apply: 'serve',
    configureServer(server) {
      for (const [label, file] of Object.entries(FILES)) {
        server.middlewares.use(`/__${label}`, (req, res) => {
          save(req, res, file, label, (message) => server.config.logger.info(message))
        })
      }
    },
  }
}

function save(
  req: IncomingMessage,
  res: ServerResponse,
  file: string,
  label: string,
  log: (message: string) => void,
): void {
  if (req.method === 'GET') {
    readFile(file, 'utf8')
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
      // Parsed before writing, so a truncated request cannot leave the file
      // unreadable — which would break the game, not just the editor.
      const parsed: unknown = JSON.parse(body)
      void writeFile(file, `${JSON.stringify(parsed, null, 2)}\n`).then(() => {
        log(`[${label}] saved (${body.length} bytes)`)
        res.setHeader('content-type', 'application/json')
        res.end('{"ok":true}')
      })
    } catch {
      res.statusCode = 400
      res.end('{"ok":false}')
    }
  })
}
