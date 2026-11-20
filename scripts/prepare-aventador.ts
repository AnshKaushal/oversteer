import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import * as zlib from "node:zlib"
import { Document, NodeIO } from "@gltf-transform/core"

const SRC =
  process.argv.find((a) => a.endsWith(".glb")) ??
  "scripts/sources/lamborghini_aventador_low_poly.glb"
const OUT = ["src/mainview/models", "src/mainview/public/models"].map((d) =>
  path.join(d, "lamborghini_aventador.glb"),
)
const LENGTH_CM = 478

if (!process.env.FORCE) {
  console.error(
    "lamborghini_aventador.glb is hand-edited now; set FORCE=1 to regenerate it from scripts/sources",
  )
  process.exit(1)
}


function decodePng(png: Buffer) {
  let p = 8
  let w = 0
  let h = 0
  let ch = 4
  const idat: Buffer[] = []
  while (p < png.length) {
    const len = png.readUInt32BE(p)
    const type = png.toString("ascii", p + 4, p + 8)
    const data = png.subarray(p + 8, p + 8 + len)
    if (type === "IHDR") {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      if (data[8] !== 8) throw new Error("png: 8-bit only")
      ch = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0
      if (!ch) throw new Error("png: need RGB or RGBA")
    } else if (type === "IDAT") idat.push(data)
    p += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const px = Buffer.alloc(h * stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[y * stride + x - ch] : 0
      const b = y > 0 ? px[(y - 1) * stride + x] : 0
      const c = x >= ch && y > 0 ? px[(y - 1) * stride + x - ch] : 0
      let v = src[x]
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
      px[y * stride + x] = v & 255
    }
  }
  return { w, h, ch, px }
}

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(b: Buffer) {
  let c = 0xffffffff
  for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function encodePng(w: number, h: number, ch: number, px: Buffer): Buffer {
  const stride = w * ch
  const raw = Buffer.alloc(h * (stride + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0
    px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(data.length, 0)
    head.write(type, 4, "ascii")
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
    return Buffer.concat([head, data, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = ch === 4 ? 6 : 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ])
}


type Kind = "yellow" | "white" | "red" | "dark"
function kindOf(r: number, g: number, b: number): Kind {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  if (mn > 165) return "white"
  if (r > 120 && g < 0.45 * r && b < 0.45 * r) return "red"
  if (r > 70 && r > b * 2.2 && g > b * 1.5 && g > 0.35 * r && mx - mn > 50)
    return "yellow"
  return "dark"
}
const isOrange = (r: number, g: number, b: number) =>
  Math.max(r, g, b) - Math.min(r, g, b) > 25 && r >= g && g >= b * 1.2


const src = await new NodeIO().read(SRC)
const meshNodes = src
  .getRoot()
  .listNodes()
  .filter((n) => n.getMesh())
const meshNode = (re: RegExp) => {
  const n = meshNodes.find((x) => re.test(x.getName()))
  if (!n) throw new Error(`no mesh node ${re}`)
  return n
}
interface Geo {
  pos: number[]
  nrm: number[]
  uv: number[]
  idx: number[]
}
function readGeo(node: ReturnType<typeof meshNode>): Geo {
  const prim = node.getMesh()!.listPrimitives()[0]
  const m = node.getWorldMatrix()
  const [a, b, c, d, e, f, g, h, i] = [
    m[0],
    m[4],
    m[8],
    m[1],
    m[5],
    m[9],
    m[2],
    m[6],
    m[10],
  ]
  const A = e * i - f * h,
    B = f * g - d * i,
    C = d * h - e * g
  const det = a * A + b * B + c * C
  const nm = [
    A,
    B,
    C,
    c * h - b * i,
    a * i - c * g,
    b * g - a * h,
    b * f - c * e,
    c * d - a * f,
    a * e - b * d,
  ].map((v) => v / det)
  const P = prim.getAttribute("POSITION")!.getArray()!
  const N = prim.getAttribute("NORMAL")!.getArray()!
  const pos: number[] = []
  const nrm: number[] = []
  for (let v = 0; v < P.length; v += 3) {
    for (let r = 0; r < 3; r++)
      pos.push(
        m[r] * P[v] + m[4 + r] * P[v + 1] + m[8 + r] * P[v + 2] + m[12 + r],
      )
    const n = [0, 1, 2].map(
      (r) =>
        nm[r * 3] * N[v] + nm[r * 3 + 1] * N[v + 1] + nm[r * 3 + 2] * N[v + 2],
    )
    const l = Math.hypot(n[0], n[1], n[2]) || 1
    nrm.push(n[0] / l, n[1] / l, n[2] / l)
  }
  return {
    pos,
    nrm,
    uv: Array.from(prim.getAttribute("TEXCOORD_0")!.getArray()!),
    idx: Array.from(prim.getIndices()!.getArray()!),
  }
}

const atlasPng = Buffer.from(src.getRoot().listTextures()[0].getImage()!)
const tex = decodePng(atlasPng)
const texelRgb = (u: number, v: number) => {
  const x = Math.min(
    tex.w - 1,
    Math.max(0, Math.floor((u - Math.floor(u)) * tex.w)),
  )
  const y = Math.min(
    tex.h - 1,
    Math.max(0, Math.floor((v - Math.floor(v)) * tex.h)),
  )
  const i = (y * tex.w + x) * tex.ch
  return [tex.px[i], tex.px[i + 1], tex.px[i + 2]]
}

const body = readGeo(meshNode(/_Body__/))
const glass = readGeo(meshNode(/_Glass__/))
const wheels: Record<string, Geo> = {
  FL: readGeo(meshNode(/Wheel_FL__/)),
  FR: readGeo(meshNode(/Wheel_FR__/)),
  RL: readGeo(meshNode(/Wheel_RL__/)),
  RR: readGeo(meshNode(/Wheel_RR__/)),
}
const all = [body, glass, ...Object.values(wheels)]

const lo = [Infinity, Infinity, Infinity]
const hi = [-Infinity, -Infinity, -Infinity]
for (const g of all)
  for (let i = 0; i < g.pos.length; i += 3)
    for (let c = 0; c < 3; c++) {
      lo[c] = Math.min(lo[c], g.pos[i + c])
      hi[c] = Math.max(hi[c], g.pos[i + c])
    }
const k = LENGTH_CM / (hi[2] - lo[2])
const mid = (g: Geo, a: number) => {
  let mn = Infinity
  let mx = -Infinity
  for (let i = a; i < g.pos.length; i += 3) {
    mn = Math.min(mn, g.pos[i])
    mx = Math.max(mx, g.pos[i])
  }
  return (mn + mx) / 2
}
const cx = (mid(wheels.FL, 0) + mid(wheels.FR, 0)) / 2
for (const g of all)
  for (let i = 0; i < g.pos.length; i += 3) {
    g.pos[i] = (g.pos[i] - cx) * k
    g.pos[i + 1] = (g.pos[i + 1] - lo[1]) * k
    g.pos[i + 2] = g.pos[i + 2] * k
  }


const BARY = (() => {
  const out: number[][] = []
  const n = 5
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n - i; j++) out.push([i / n, j / n, (n - i - j) / n])
  return out
})()
const tris = body.idx.length / 3
const frac: Record<Kind, number>[] = []
const cen: number[][] = []
const whiteUv: number[][] = []
for (let t = 0; t < tris; t++) {
  const ids = [body.idx[t * 3], body.idx[t * 3 + 1], body.idx[t * 3 + 2]]
  const f: Record<Kind, number> = { yellow: 0, white: 0, red: 0, dark: 0 }
  const wu = [0, 0, 0]
  for (const [a, b, c] of BARY) {
    const u =
      a * body.uv[ids[0] * 2] +
      b * body.uv[ids[1] * 2] +
      c * body.uv[ids[2] * 2]
    const v =
      a * body.uv[ids[0] * 2 + 1] +
      b * body.uv[ids[1] * 2 + 1] +
      c * body.uv[ids[2] * 2 + 1]
    const kd = kindOf(...(texelRgb(u, v) as [number, number, number]))
    f[kd] += 1 / BARY.length
    if (kd === "white") {
      wu[0] += u
      wu[1] += v
      wu[2]++
    }
  }
  frac.push(f)
  whiteUv.push(wu[2] ? [wu[0] / wu[2], wu[1] / wu[2]] : [0, 0])
  const c = [0, 0, 0]
  for (const id of ids)
    for (let j = 0; j < 3; j++) c[j] += body.pos[id * 3 + j] / 3
  cen.push([Math.abs(c[0]), c[1], c[2]])
}

type Part = "paint" | "lights" | "fill" | "tail" | "ampF" | "base"
const part: Part[] = []
for (let t = 0; t < tris; t++) {
  const f = frac[t]
  const z = cen[t][2]
  part.push(
    z > 0 && f.white >= 0.3
      ? "lights"
      : z < 0 && f.red >= 0.15
        ? "tail"
        : f.yellow >= 0.5
          ? "paint"
          : "base",
  )
}

const vert = (t: number, j: number) => {
  const i = body.idx[t * 3 + j]
  return [Math.abs(body.pos[i * 3]), body.pos[i * 3 + 1], body.pos[i * 3 + 2]]
}
function grow(from: Part, to: Part, front: boolean, reach: number) {
  const lv: number[][] = []
  for (let t = 0; t < tris; t++)
    if (part[t] === from) for (let j = 0; j < 3; j++) lv.push(vert(t, j))
  const r2 = reach * reach
  const hit: number[] = []
  for (let t = 0; t < tris; t++) {
    if (part[t] !== "base" || frac[t].yellow > 0.2 || front !== cen[t][2] > 0)
      continue
    const near = (c: number[]) =>
      lv.some(
        (v) =>
          (v[0] - c[0]) ** 2 + (v[1] - c[1]) ** 2 + (v[2] - c[2]) ** 2 <= r2,
      )
    if ([0, 1, 2].every((j) => near(vert(t, j)))) hit.push(t)
  }
  for (const t of hit) part[t] = to
}
grow("lights", "fill", true, 0.8)
grow("lights", "ampF", true, 2.8)
for (let t = 0; t < tris; t++) {
  const [x, y, z] = cen[t]
  if (
    part[t] === "base" &&
    frac[t].yellow <= 0.2 &&
    z > 140 &&
    x >= 50 &&
    x <= 72 &&
    y >= 48 &&
    y <= 70
  )
    part[t] = "fill"
}
grow("tail", "tail", false, 3)

if (process.env.SVG) {
  const front = process.env.VIEW !== "rear"
  const col: Record<string, string> = {
    paint: "#d9a400",
    lights: "#ffffff",
    tail: "#ff2020",
    ampF: "#00c0ff",
    base: "#555",
  }
  const order = Array.from({ length: tris }, (_, t) => t)
    .filter((t) => front === cen[t][2] > 0)
    .sort((a, b) => (front ? cen[a][2] - cen[b][2] : cen[b][2] - cen[a][2]))
  let svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-110 -125 220 135" width="1500"><rect x="-110" y="-125" width="220" height="135" fill="#222"/>'
  for (const t of order) {
    const pts = [0, 1, 2].map((j) => {
      const i = body.idx[t * 3 + j]
      return `${(front ? -1 : 1) * body.pos[i * 3]},${-body.pos[i * 3 + 1]}`
    })
    svg += `<polygon points="${pts.join(" ")}" fill="${col[part[t]]}" stroke="${col[part[t]]}" stroke-width="0.1"/>`
  }
  fs.writeFileSync(process.env.SVG, svg + "</svg>")
  process.exit(0)
}
if (process.env.ANALYZE) {
  const stat = (name: string, test: (t: number) => boolean) => {
    const sel = Array.from({ length: tris }, (_, t) => t).filter(test)
    const mn = [Infinity, Infinity, Infinity]
    const mx = [-Infinity, -Infinity, -Infinity]
    for (const t of sel)
      for (let c = 0; c < 3; c++) {
        mn[c] = Math.min(mn[c], cen[t][c])
        mx[c] = Math.max(mx[c], cen[t][c])
      }
    console.log(
      name.padEnd(7),
      String(sel.length).padStart(5),
      "|x|",
      mn[0].toFixed(0),
      mx[0].toFixed(0),
      "y",
      mn[1].toFixed(0),
      mx[1].toFixed(0),
      "z",
      mn[2].toFixed(0),
      mx[2].toFixed(0),
    )
  }
  for (const p of ["paint", "lights", "tail", "ampF", "base"])
    stat(p, (t) => part[t] === p)
  console.log(
    "height",
    ((hi[1] - lo[1]) * k).toFixed(0),
    "half width",
    (((hi[0] - lo[0]) * k) / 2).toFixed(0),
  )
  process.exit(0)
}


const luma = (r: number, g: number, b: number) =>
  0.299 * r + 0.587 * g + 0.114 * b
const ys: number[] = []
for (let i = 0; i < tex.px.length; i += tex.ch)
  if (kindOf(tex.px[i], tex.px[i + 1], tex.px[i + 2]) === "yellow")
    ys.push(luma(tex.px[i], tex.px[i + 1], tex.px[i + 2]))
ys.sort((a, b) => a - b)
const refY = ys[Math.floor(ys.length * 0.9)]
const neutral = Buffer.from(tex.px)
for (let i = 0; i < neutral.length; i += tex.ch) {
  const [r, g, b] = [tex.px[i], tex.px[i + 1], tex.px[i + 2]]
  if (!isOrange(r, g, b) || kindOf(r, g, b) === "red") continue
  const v = Math.min(255, Math.round((luma(r, g, b) / refY) * 240))
  neutral[i] = neutral[i + 1] = neutral[i + 2] = v
}
const neutralPng = encodePng(tex.w, tex.h, tex.ch, neutral)


const doc = new Document()
const buffer = doc.createBuffer()
const scene = doc.createScene("Scene")
const atlas = doc
  .createTexture("atlas")
  .setImage(atlasPng)
  .setMimeType("image/png")
const paintAtlas = doc
  .createTexture("atlas_paint")
  .setImage(neutralPng)
  .setMimeType("image/png")

const mColor = doc
  .createMaterial("CARS_Color_1_Material")
  .setBaseColorTexture(atlas)
  .setMetallicFactor(0.288)
  .setRoughnessFactor(0.52)
const mLights = doc
  .createMaterial("CARS_Lights_Material")
  .setDoubleSided(true)
  .setBaseColorFactor([1, 1, 1, 1])
  .setEmissiveFactor([1, 1, 1])
  .setMetallicFactor(0)
  .setRoughnessFactor(0.3)
const mFill = doc
  .createMaterial("CARS_Lights_Fill")
  .setDoubleSided(true)
  .setBaseColorFactor([0.95, 0.96, 1, 1])
  .setEmissiveFactor([1, 0.97, 0.9])
  .setMetallicFactor(0)
  .setRoughnessFactor(0.3)
const mTail = doc
  .createMaterial("Tail_Lamp")
  .setBaseColorTexture(atlas)
  .setEmissiveTexture(atlas)
  .setEmissiveFactor([1, 0.12, 0.12])
  .setMetallicFactor(0)
  .setRoughnessFactor(0.35)
const flat = (name: string, c: number[]) =>
  doc
    .createMaterial(name)
    .setBaseColorFactor([c[0], c[1], c[2], 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(0.35)
const mAmpF = flat(
  "Indicator_Amber_Front",
  [0.008, 0.008, 0.008],
).setDoubleSided(true)
const mPaint = doc
  .createMaterial("Body_Paint")
  .setBaseColorTexture(paintAtlas)
  .setBaseColorFactor([1, 0.51, 0, 1])
  .setMetallicFactor(0.45)
  .setRoughnessFactor(0.3)
const mGlass = doc
  .createMaterial("Glass")
  .setBaseColorFactor([0.01, 0.012, 0.016, 1])
  .setMetallicFactor(0.6)
  .setRoughnessFactor(0.08)

function prim(g: Geo, tl: number[], mat: any, uvOf?: (t: number) => number[]) {
  const pos: number[] = []
  const nrm: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const remap = new Map<number, number>()
  for (const t of tl)
    for (let j = 0; j < 3; j++) {
      const v = g.idx[t * 3 + j]
      let o = uvOf ? undefined : remap.get(v)
      if (o === undefined) {
        o = pos.length / 3
        if (!uvOf) remap.set(v, o)
        pos.push(g.pos[v * 3], g.pos[v * 3 + 1], g.pos[v * 3 + 2])
        nrm.push(g.nrm[v * 3], g.nrm[v * 3 + 1], g.nrm[v * 3 + 2])
        const u = uvOf ? uvOf(t) : [g.uv[v * 2], g.uv[v * 2 + 1]]
        uv.push(u[0], u[1])
      }
      idx.push(o)
    }
  const acc = (type: "VEC3" | "VEC2", arr: ArrayLike<number>, ctor: any) =>
    doc
      .createAccessor()
      .setType(type)
      .setArray(ctor.from(arr))
      .setBuffer(buffer)
  return doc
    .createPrimitive()
    .setAttribute("POSITION", acc("VEC3", pos, Float32Array))
    .setAttribute("NORMAL", acc("VEC3", nrm, Float32Array))
    .setAttribute("TEXCOORD_0", acc("VEC2", uv, Float32Array))
    .setIndices(
      doc
        .createAccessor()
        .setType("SCALAR")
        .setArray(
          pos.length / 3 < 65536
            ? Uint16Array.from(idx)
            : Uint32Array.from(idx),
        )
        .setBuffer(buffer),
    )
    .setMaterial(mat)
}

const byPart = (p: Part) =>
  Array.from({ length: tris }, (_, t) => t).filter((t) => part[t] === p)
const bodyMesh = doc.createMesh("Mesh_3")
const counts: Record<string, number> = {}
for (const [p, mat] of [
  ["base", mColor],
  ["paint", mPaint],
  ["lights", mLights],
  ["fill", mFill],
  ["tail", mTail],
  ["ampF", mAmpF],
] as const) {
  const tl = byPart(p)
  counts[mat.getName()] = tl.length
  if (!tl.length) continue
  bodyMesh.addPrimitive(prim(body, tl, mat))
}
const allTris = (g: Geo) =>
  Array.from({ length: g.idx.length / 3 }, (_, t) => t)
const addNode = (name: string, mesh: any, parent?: any) => {
  const n = doc.createNode(name).setMesh(mesh)
  ;(parent ?? scene).addChild(n)
  return n
}
addNode("Body", bodyMesh)
addNode(
  "Glass",
  doc.createMesh("Glass").addPrimitive(prim(glass, allTris(glass), mGlass)),
)
for (const [w, g] of Object.entries(wheels)) {
  const pivot = doc.createNode(`Wheel_${w}`)
  scene.addChild(pivot)
  addNode(
    `${w}W_mesh`,
    doc.createMesh(`${w}W`).addPrimitive(prim(g, allTris(g), mColor)),
    pivot,
  )
}

const out = await new NodeIO().writeBinary(doc)
for (const f of OUT) fs.writeFileSync(f, out)
console.log(
  "wrote",
  OUT.join(", "),
  (out.length / 1024).toFixed(0),
  "KB",
  JSON.stringify(counts),
)
