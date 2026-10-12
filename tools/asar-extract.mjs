/**
 * Minimal asar extractor for research.
 *
 * The DSH checkout ships packed inside app.asar, which native tools cannot read
 * as a directory. This parses the archive header and extracts selected members
 * so the official UI implementation can be read as ordinary files.
 *
 * Usage: node tools/asar-extract.mjs <asar> <outDir> [pathPrefix ...]
 */

import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'

const [, , asarPath, outDir, ...prefixes] = process.argv

if (!asarPath || !outDir) {
  console.error('usage: node tools/asar-extract.mjs <asar> <outDir> [prefix ...]')
  process.exit(2)
}

const buf = readFileSync(asarPath)

// asar header layout (Chromium Pickle):
//   u32 @0  = 4                (size of the first pickle field)
//   u32 @4  = headerSize       (JSON header block size)
//   u32 @8  = jsonSize + 4     (aligned)
//   u32 @12 = jsonSize
//   JSON    @16 .. 16+jsonSize
//   file data starts at 8 + headerSize
// Getting the JSON origin wrong by 4 bytes yields a parse error, not a silently
// wrong tree, so this offset is the one thing worth pinning.
const headerSize = buf.readUInt32LE(4)
const jsonSize = buf.readUInt32LE(12)
const headerJson = buf.subarray(16, 16 + jsonSize).toString('utf8')
const header = JSON.parse(headerJson)
const dataStart = 8 + headerSize

/** Walk the header tree, yielding { path, size, offset } for files. */
function* walk(node, prefix = '') {
  for (const [name, entry] of Object.entries(node.files ?? {})) {
    const full = prefix === '' ? name : posix.join(prefix, name)
    if (entry.files !== undefined) {
      yield* walk(entry, full)
    } else if (entry.unpacked !== true) {
      yield { path: full, size: Number(entry.size ?? 0), offset: Number(entry.offset ?? 0) }
    }
  }
}

const all = [...walk(header)]
console.log(`archive members: ${all.length}`)

const selected = prefixes.length === 0
  ? all
  : all.filter(entry => prefixes.some(prefix => entry.path.startsWith(prefix)))

console.log(`selected: ${selected.length}`)
let written = 0
let bytes = 0
for (const entry of selected) {
  const target = join(outDir, entry.path)
  mkdirSync(dirname(target), { recursive: true })
  const start = dataStart + entry.offset
  writeFileSync(target, buf.subarray(start, start + entry.size))
  written += 1
  bytes += entry.size
}
console.log(`wrote ${written} files (${(bytes / 1024 / 1024).toFixed(1)} MB) to ${outDir}`)
