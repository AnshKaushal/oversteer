import * as fs from "node:fs"

const SRC = "src/mainview/models/dodge_charger_69.glb"
const OUTS = [
  "src/mainview/models/dodge_charger_69.glb",
  "src/mainview/public/models/dodge_charger_69.glb",
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
    padded.fill(0x20, jsonBytes.length)
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

const raw = new Uint8Array(await Bun.file(SRC).arrayBuffer())
const { json, bin } = readGlb(raw.buffer as ArrayBuffer)

if (json.nodes.some((n) => n.name === "Wheel_FL")) {
  console.log("already prepared — nothing to do")
  process.exit(0)
}

// 1. Turn the model around so nose is at +Z and length is along Z (yaw -90 deg)
const turn = yaw(-Math.PI / 2)
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

// 2. Rename wheel pivots to standard Wheel_FL, Wheel_FR, Wheel_RL, Wheel_RR
for (const node of json.nodes) {
  if (!node.name) continue
  if (node.name === "Duke69_WhellStock_FL") node.name = "Wheel_FL"
  else if (node.name === "Duke69_WhellStock_FR") node.name = "Wheel_FR"
  else if (node.name === "Duke69_WhellStock_RL") node.name = "Wheel_RL"
  else if (node.name === "Duke69_WhellStock_RR") node.name = "Wheel_RR"
}

// 3. Separate brake light material from shared UCB_Lights_and_Glass
const origMat = json.materials[4] // UCB_Lights_and_Glass
const brakeMat = JSON.parse(JSON.stringify(origMat))
brakeMat.name = "Duke69_Brakelights_Mat"
brakeMat.pbrMetallicRoughness = brakeMat.pbrMetallicRoughness || {}
brakeMat.pbrMetallicRoughness.baseColorFactor = [1, 0.12, 0.06, 1]
brakeMat.emissiveFactor = [1, 0.05, 0.02]
if (brakeMat.pbrMetallicRoughness.baseColorTexture) {
  brakeMat.emissiveTexture = { index: brakeMat.pbrMetallicRoughness.baseColorTexture.index }
}
const newMatIdx = json.materials.length
json.materials.push(brakeMat)

// Assign brakeMat to mesh 5 (Duke69_Brakelights_UCB_Lights_and_Glass_0)
const brakeMesh = json.meshes[5]
for (const prim of brakeMesh.primitives) {
  prim.material = newMatIdx
}

const out = writeGlb(json, bin)
for (const path of OUTS) {
  fs.writeFileSync(path, out)
  console.log(`wrote ${path} (${out.length} bytes)`)
}
