/**
 * Prepares the Mercedes-AMG SL 65 GLB so its lamps can light.
 *
 * The Sketchfab export bakes the lamps into the one "Plane" material, which
 * also holds the grille, splitter, diffuser and mirrors, so nothing separate
 * exists for carLights/CarVisual to glow. This script splits the lamp
 * triangles out of that mesh into two primitives with their own materials:
 *
 *  - SL_Headlight: the front lamp clusters. The name is what CarVisual's
 *    headlight scan keys on; it glows warm white when the lights are on.
 *  - SL_Taillight: the rear lamp clusters, with a red emissive so carLights
 *    brightens them under braking (the same recipe as the 997 GT2 prep).
 *
 * Triangles are picked by where they sit and what the baked texture shows
 * there (lamp lens colours: light, amber, red), not by anything per-car in
 * the game code. The vertex data is shared; only index lists move. Textures
 * and everything else in the file are untouched.
 *
 * Idempotent: a file that already has SL_Headlight is left alone.
 *
 * Run: bun scripts/prepare-mercedes-sl65.ts [--debug path.json]
 */
import * as fs from "node:fs"
import { inflateSync } from "node:zlib"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"

const SRC = "src/mainview/models/mercedes_benz_sl-65_amg.glb"
const OUTS = [SRC, "src/mainview/public/models/mercedes_benz_sl-65_amg.glb"]
const BODY_MESH = "Plane_32_0"
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

/** Lamp regions in the model's own frame (nose at +Z), metres. */
const FRONT = { zMin: 1.9, yMin: 0.45, yMax: 0.95, xMin: 0.3 }
const REAR = { zMax: -2.0, yMin: 0.5, yMax: 1.0, xMin: 0.3 }

type Rgb = [number, number, number]
const lum = ([r, g, b]: Rgb) => 0.3 * r + 0.59 * g + 0.11 * b
const isRedPixel = ([r, g, b]: Rgb) => r > 140 && g < 100 && b < 100
const isAmberPixel = ([r, g, b]: Rgb) => r > 190 && g > 110 && g < 200 && b < 100
const isLightPixel = (c: Rgb) => lum(c) > 150

function readGlb(buf: ArrayBuffer) {
  const dv = new DataView(buf)
  const jsonLen = dv.getUint32(12, true)
  if (dv.getUint32(16, true) !== JSON_CHUNK) throw new Error("no JSON chunk")
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)))
  const binLen = dv.getUint32(20 + jsonLen, true)
  return { json, bin: new Uint8Array(buf, 20 + jsonLen + 8, binLen) }
}

function writeGlb(json: any, bin: Uint8Array): Uint8Array {
  let jb = new TextEncoder().encode(JSON.stringify(json))
  const jp = (4 - (jb.length % 4)) % 4
  if (jp) {
    const p = new Uint8Array(jb.length + jp)
    p.set(jb)
    p.fill(0x20, jb.length)
    jb = p
  }
  const bp = (4 - (bin.length % 4)) % 4
  const bb = new Uint8Array(bin.length + bp)
  bb.set(bin)
  const total = 12 + 8 + jb.length + 8 + bb.length
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, 0x46546c67, true)
  dv.setUint32(4, 2, true)
  dv.setUint32(8, total, true)
  dv.setUint32(12, jb.length, true)
  dv.setUint32(16, JSON_CHUNK, true)
  out.set(jb, 20)
  const h = 20 + jb.length
  dv.setUint32(h, bb.length, true)
  dv.setUint32(h + 4, BIN_CHUNK, true)
  out.set(bb, h + 8)
  return out
}

/** Minimal PNG reader: 8-bit, non-interlaced, grey/RGB/RGBA (what the model's textures are). */
function decodePng(buf: Uint8Array): { width: number; height: number; channels: number; data: Uint8Array } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let w = 0
  let h = 0
  let ch = 0
  const idat: Uint8Array[] = []
  for (let p = 8; p < buf.length; ) {
    const len = dv.getUint32(p)
    const type = String.fromCharCode(...buf.subarray(p + 4, p + 8))
    const body = buf.subarray(p + 8, p + 8 + len)
    if (type === "IHDR") {
      w = new DataView(body.buffer, body.byteOffset).getUint32(0)
      h = new DataView(body.buffer, body.byteOffset).getUint32(4)
      if (body[8] !== 8 || body[12] !== 0) throw new Error("only 8-bit non-interlaced PNG")
      ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[body[9] as 0 | 2 | 4 | 6] ?? 0
      if (!ch) throw new Error("unsupported PNG colour type")
    } else if (type === "IDAT") idat.push(body)
    p += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const out = new Uint8Array(h * stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    const src = y * (stride + 1) + 1
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[y * stride + x - ch] : 0
      const b = y > 0 ? out[(y - 1) * stride + x] : 0
      const c = x >= ch && y > 0 ? out[(y - 1) * stride + x - ch] : 0
      let v = raw[src + x]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) {
        const pp = a + b - c
        const pa = Math.abs(pp - a)
        const pb = Math.abs(pp - b)
        const pc = Math.abs(pp - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      out[y * stride + x] = v & 255
    }
  }
  return { width: w, height: h, channels: ch, data: out }
}

const rawBuf = await Bun.file(SRC).arrayBuffer()
const { json, bin } = readGlb(rawBuf)
/**
 * The source material has no metallic factor, which glTF reads as fully metal; with no
 * environment to reflect, a metal lens renders black. A red, non-metal lens reads as a lamp
 * at rest and the emissive takes over under braking.
 */
function lensFinish(mat: any) {
  const pbr = mat.pbrMetallicRoughness
  pbr.baseColorFactor = [1, 0.12, 0.06, 1]
  pbr.metallicFactor = 0
  pbr.roughnessFactor = 0.35
  delete pbr.metallicRoughnessTexture
}

function save(j: any, b: Uint8Array) {
  const out = writeGlb(j, b)
  for (const path of OUTS) {
    fs.writeFileSync(path, out)
    console.log(`wrote ${path} (${out.length} bytes)`)
  }
}

if (json.materials.some((m: any) => m.name === "SL_Headlight")) {
  const tailDone = json.materials.find((m: any) => m.name === "SL_Taillight")
  if (tailDone && tailDone.pbrMetallicRoughness.metallicFactor !== 0) {
    lensFinish(tailDone)
    save(json, bin)
  } else console.log("already prepared, nothing to do")
  process.exit(0)
}

// --- classify triangles ------------------------------------------------------
const gltf: any = await new GLTFLoader().parseAsync(rawBuf.slice(0), "")
gltf.scene.updateMatrixWorld(true)
let mesh: THREE.Mesh | null = null
gltf.scene.traverse((o: any) => {
  if (o.isMesh && o.name === BODY_MESH) mesh = o
})
if (!mesh) throw new Error(`mesh ${BODY_MESH} not found`)
const m = mesh as THREE.Mesh
const geo = m.geometry
const pos = geo.getAttribute("position")
const uv = geo.getAttribute("uv")
const index = Array.from((geo.index as THREE.BufferAttribute).array as ArrayLike<number>)

const meshDef = json.meshes.find((x: any) => x.name === BODY_MESH)
const prim = meshDef.primitives[0]
const baseMat = json.materials[prim.material]
const texIdx = baseMat.pbrMetallicRoughness.baseColorTexture.index
const imgIdx = json.textures[texIdx].source
const view = json.bufferViews[json.images[imgIdx].bufferView]
const png = bin.slice(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
const { width: TW, height: TH, data: TD, channels: TC } = decodePng(png)
const sample = (u: number, v: number): Rgb => {
  const x = Math.min(TW - 1, Math.max(0, Math.floor(u * TW)))
  const y = Math.min(TH - 1, Math.max(0, Math.floor(v * TH)))
  const i = (y * TW + x) * TC
  return [TD[i], TD[i + 1], TD[i + 2]]
}

const head: number[] = []
const tail: number[] = []
const rest: number[] = []
const v = new THREE.Vector3()
const debug: { head: number[][]; tail: number[][] } = { head: [], tail: [] }
for (let t = 0; t < index.length; t += 3) {
  const ids = [index[t], index[t + 1], index[t + 2]]
  const c = new THREE.Vector3()
  let u = 0
  let w = 0
  for (const id of ids) {
    c.add(v.fromBufferAttribute(pos, id).applyMatrix4(m.matrixWorld))
    u += uv.getX(id)
    w += uv.getY(id)
  }
  c.multiplyScalar(1 / 3)
  const col = sample(u / 3, w / 3)
  const front =
    c.z > FRONT.zMin && c.y > FRONT.yMin && c.y < FRONT.yMax && Math.abs(c.x) > FRONT.xMin &&
    (isLightPixel(col) || isAmberPixel(col))
  const rear =
    c.z < REAR.zMax && c.y > REAR.yMin && c.y < REAR.yMax && Math.abs(c.x) > REAR.xMin && (isRedPixel(col) || isLightPixel(col))
  if (front) {
    head.push(...ids)
    debug.head.push(c.toArray())
  } else if (rear) {
    tail.push(...ids)
    debug.tail.push(c.toArray())
  } else rest.push(...ids)
}
console.log(`triangles: head ${head.length / 3}, tail ${tail.length / 3}, rest ${rest.length / 3}`)
const dbg = process.argv.indexOf("--debug")
if (dbg > 0) {
  fs.writeFileSync(process.argv[dbg + 1], JSON.stringify(debug))
  process.exit(0)
}

// --- write the split ---------------------------------------------------------
const chunks: Uint8Array[] = [bin]
let binLen = bin.length
function addIndices(list: number[]): number {
  const bytes = new Uint8Array(new Uint32Array(list).buffer)
  const pad = (4 - (binLen % 4)) % 4
  if (pad) {
    chunks.push(new Uint8Array(pad))
    binLen += pad
  }
  chunks.push(bytes)
  const bv = json.bufferViews.push({ buffer: 0, byteOffset: binLen, byteLength: bytes.length, target: 34963 }) - 1
  binLen += bytes.length
  return json.accessors.push({ bufferView: bv, componentType: 5125, count: list.length, type: "SCALAR" }) - 1
}

prim.indices = addIndices(rest)

const headMat = JSON.parse(JSON.stringify(baseMat))
headMat.name = "SL_Headlight"
headMat.emissiveFactor = [1, 0.94, 0.8]
headMat.emissiveTexture = { index: texIdx }
headMat.extensions = { KHR_materials_emissive_strength: { emissiveStrength: 0.2 } }
const tailMat = JSON.parse(JSON.stringify(baseMat))
tailMat.name = "SL_Taillight"
lensFinish(tailMat)
tailMat.emissiveFactor = [1, 0.05, 0.02]
tailMat.emissiveTexture = { index: texIdx }
tailMat.extensions = { KHR_materials_emissive_strength: { emissiveStrength: 0.2 } }
const hm = json.materials.push(headMat) - 1
const tm = json.materials.push(tailMat) - 1
const clonePrim = (indices: number, material: number) => ({ ...prim, indices, material })
meshDef.primitives.push(clonePrim(addIndices(head), hm), clonePrim(addIndices(tail), tm))
json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), "KHR_materials_emissive_strength"])]
json.buffers[0].byteLength = binLen

const all = new Uint8Array(binLen)
let off = 0
for (const c of chunks) {
  all.set(c, off)
  off += c.length
}
save(json, all)
