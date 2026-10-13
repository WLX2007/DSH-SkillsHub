// List asar header entries under a prefix.
import { readFileSync } from 'node:fs'
const buf = readFileSync('D:/Soft/Other/DeepSeek Harness/resources/app.asar')
const jsonSize = buf.readUInt32LE(12)
const header = JSON.parse(buf.subarray(16, 16 + jsonSize).toString('utf8'))
const prefix = process.argv[2] ?? ''
let node = header
for (const part of prefix.split('/').filter(Boolean)) {
  node = node?.files?.[part]
  if (node === undefined) { console.log(`not found: ${prefix}`); process.exit(0) }
}
console.log(Object.keys(node.files ?? {}).join('\n'))
