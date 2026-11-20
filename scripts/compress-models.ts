import { NodeIO } from "@gltf-transform/core"
import {
  EXTMeshoptCompression,
  KHRONOS_EXTENSIONS,
} from "@gltf-transform/extensions"
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer"
import { readdirSync, statSync, copyFileSync } from "node:fs"

const SRC = "src/mainview/models"
const OUT = "src/mainview/public/models"
const verify = process.argv.includes("--verify")

await MeshoptEncoder.ready
await MeshoptDecoder.ready
const io = new NodeIO()
  .registerExtensions([...KHRONOS_EXTENSIONS, EXTMeshoptCompression])
  .registerDependencies({
    "meshopt.encoder": MeshoptEncoder,
    "meshopt.decoder": MeshoptDecoder,
  })

let before = 0
let after = 0
for (const f of readdirSync(SRC).filter((n) => n.endsWith(".glb"))) {
  const src = `${SRC}/${f}`
  const out = `${OUT}/${f}`
  const doc = await io.read(src)
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER })
  await io.write(out, doc)
  const a = statSync(src).size
  let b = statSync(out).size
  if (b >= a) {
    copyFileSync(src, out)
    b = a
  }
  before += a
  after += b
  console.log(`${f}: ${(a / 1e6).toFixed(2)}MB -> ${(b / 1e6).toFixed(2)}MB`)
}
console.log(`total ${(before / 1e6).toFixed(1)}MB -> ${(after / 1e6).toFixed(1)}MB`)
void verify
