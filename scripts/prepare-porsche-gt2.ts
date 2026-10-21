/**
 * Prepares the Porsche 997.1 GT2 GLB for the car registry.
 *
 * The Sketchfab export is authored nose-towards -Z: the number plate, the
 * rear wing and the wide 325/30 rear tyres all sit at +Z, the bonnet and
 * the narrow 245/35 front tyres at -Z. Every car in this game is stored
 * nose-at-+Z (CarVisual applies a half turn at load), so the model has to
 * be turned around in the file.
 *
 * Three things are edited:
 *  1. The scene's root node gets a 180 degree yaw about Y, baked into its
 *     matrix. The glTF binary chunk is untouched, so the nine embedded
 *     textures survive (a three.js re-export would lose them — the loader
 *     cannot decode the images outside a browser).
 *  2. The tail lamp material gets a red base colour and a red emissive,
 *     because the Sketchfab model ships the rear lenses as unlit blue-grey
 *     glass. The emissive strength is tuned so carLights' idle level comes
 *     out at 1.0 (it scales the authored intensity by 10 * 0.5).
 *  3. The wheel pivot nodes are renamed to Wheel_FL/FR/RL/RR so the
 *     registry can use the same pivot pattern as the other cars.
 *
 * Idempotent: re-running on an already prepared file does nothing.
 *
 * Run: bun scripts/prepare-porsche-gt2.ts
 */
import * as fs from "node:fs"

const SRC = "src/mainview/models/porsche_997.1_gt2.glb"
const OUTS = [
  "src/mainview/models/porsche_997.1_gt2.glb",
  "src/mainview/public/models/porsche_997.1_gt2.glb",
]

const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

interface Gltf {
  asset: { version: string; generator?: string }
  scene?: number
  scenes: { name?: string; nodes: number[] }[]
  nodes: Record<string, any>[]
  meshes: Record<string, any>[]
  materials: Record<string, any>[]
  accessors: Record<string, any>[]
  bufferViews: Record<string, any>[]
  buffers: Record<string, any>[]
  images?: Record<string, any>[]
  textures?: Record<string, any>[]
  samplers?: Record<string, any>[]
  extensionsUsed?: string[]
  extensions?: Record<string, any>
}

/** Column-major 4x4 multiply: the result applies b first, then a. */
function mul(a: number[], b: number[]): number[] {
  const out = new Array(16).fill(0)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k]
      out[col * 4 + row] = sum
    }
  }
  return out
}

/** Column-major 4x4 for a yaw of `a` radians. */
function yaw(a: number): number[] {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]
}

/** Column-major 4x4 for a quaternion [x, y, z, w]. */
function quatMatrix(q: number[]): number[] {
  const [x, y, z, w] = q
  const x2 = x + x
  const y2 = y + y
  const z2 = z + z
  const xx = x * x2
  const xy = x * y2
  const xz = x * z2
  const yy = y * y2
  const yz = y * z2
  const zz = z * z2
  const wx = w * x2
  const wy = w * y2
  const wz = w * z2
  return [
    1 - (yy + zz), xy + wz, xz - wy, 0,
    xy - wz, 1 - (xx + zz), yz + wx, 0,
    xz + wy, yz - wx, 1 - (xx + yy), 0,
    0, 0, 0, 1,
  ]
}

function readGlb(buf: ArrayBuffer): { json: Gltf; bin: Uint8Array } {
  const dv = new DataView(buf)
  const jsonLen = dv.getUint32(12, true)
  if (dv.getUint32(16, true) !== JSON_CHUNK) throw new Error("no JSON chunk")
  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)),
  ) as Gltf
  const binLen = dv.getUint32(20 + jsonLen, true)
  const bin = new Uint8Array(buf, 20 + jsonLen + 8, binLen)
  return { json, bin }
}

function writeGlb(json: Gltf, bin: Uint8Array): Uint8Array {
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4
  if (jsonPad) {
    const padded = new Uint8Array(jsonBytes.length + jsonPad)
    padded.set(jsonBytes)
    padded.fill(0x20, jsonBytes.length) // the JSON chunk pads with spaces
    jsonBytes = padded
  }
  const binPad = (4 - (bin.length % 4)) % 4
  const binBytes = new Uint8Array(bin.length + binPad)
  binBytes.set(bin)
  const total = 12 + 8 + jsonBytes.length + 8 + binBytes.length
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, 0x46546c67, true) // 'glTF'
  dv.setUint32(4, 2, true)
  dv.setUint32(8, total, true)
  dv.setUint32(12, jsonBytes.length, true)
  dv.setUint32(16, JSON_CHUNK, true)
  out.set(jsonBytes, 20)
  const binHeader = 20 + jsonBytes.length
  dv.setUint32(binHeader, binBytes.length, true)
  dv.setUint32(binHeader + 4, BIN_CHUNK, true)
  out.set(binBytes, binHeader + 8)
  return out
}

// --- read -------------------------------------------------------------------
const raw = new Uint8Array(await Bun.file(SRC).arrayBuffer())
const { json, bin } = readGlb(raw.buffer as ArrayBuffer)

if (json.nodes.some((n) => n.name === "Wheel_FL")) {
  console.log("already prepared — nothing to do")
  process.exit(0)
}

// --- 1. turn the model around ----------------------------------------------
// The scene root carries a Sketchfab rotation; the yaw goes on the
// outermost node so the whole hierarchy turns with it.
const turn = yaw(Math.PI)
for (const idx of json.scenes[json.scene ?? 0].nodes) {
  const node = json.nodes[idx]
  let local: number[]
  if (node.matrix) {
    local = node.matrix as number[]
  } else {
    const t = node.translation ?? [0, 0, 0]
    const r = node.rotation ?? [0, 0, 0, 1]
    const s = node.scale ?? [1, 1, 1]
    local = mul(
      [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t[0], t[1], t[2], 1],
      mul(quatMatrix(r as number[]), [
        s[0], 0, 0, 0, 0, s[1], 0, 0, 0, 0, s[2], 0, 0, 0, 0, 1,
      ]),
    )
  }
  node.matrix = mul(turn, local)
  delete node.translation
  delete node.rotation
  delete node.scale
}

// --- 2. rename the wheel pivots --------------------------------------------
// Sketchfab names them fl_16 / fl.001_17 / ... and the loader strips the
// dots, so the registry would have to spell them out. Rename them here
// instead. In the source file the nose is at -Z, so the narrow 245/35
// tyres (uniform scale) are the front pair and the wide 325/30 rear
// tyres (x-scaled by 1.44) are the rear pair.
const wheels = json.nodes
  .map((n, i) => ({ n, i }))
  .filter(({ n }) => typeof n.name === "string" && /^fl/i.test(n.name))
  .filter(({ n }) => n.matrix && Math.abs((n.matrix as number[])[14]) > 1)
if (wheels.length !== 4) {
  throw new Error(`expected 4 wheel nodes, found ${wheels.length}`)
}
for (const { n } of wheels) {
  const m = n.matrix as number[]
  const z = m[14]
  const x = m[12]
  const wide = Math.abs(m[0]) > 1.2
  const front = z < 0
  n.name = `Wheel_${front ? "F" : "R"}${x < 0 ? "L" : "R"}`
}

// --- 3. red tail lamps ------------------------------------------------------
const tailMat = json.materials.find(
  (m) => m.name === "Car_Porsche_911GT2_2008_Refracted_Coloroverlay",
)
if (!tailMat) throw new Error("tail lamp material not found")
tailMat.pbrMetallicRoughness.baseColorFactor = [1, 0.12, 0.06, 1]
tailMat.emissiveFactor = [1, 0.05, 0.02]
const baseTex = tailMat.pbrMetallicRoughness.baseColorTexture
if (baseTex) tailMat.emissiveTexture = { index: baseTex.index }
tailMat.extensions = {
  ...(tailMat.extensions ?? {}),
  KHR_materials_emissive_strength: { emissiveStrength: 0.2 },
}
json.extensionsUsed = [
  ...(json.extensionsUsed ?? []).filter(
    (e) => e !== "KHR_materials_emissive_strength",
  ),
  "KHR_materials_emissive_strength",
]

// --- write ------------------------------------------------------------------
const out = writeGlb(json, bin)
for (const path of OUTS) {
  fs.writeFileSync(path, out)
  console.log(`wrote ${path} (${out.length} bytes)`)
}
