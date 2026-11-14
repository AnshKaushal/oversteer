/**
 * Makes the palette-atlas low-poly exports (Bugatti Chiron, Mercedes W124)
 * usable by the game, with the same material layout as the DB12:
 *
 *   CARS_Color_1_Material  palette, everything that is not split out below
 *   CARS_Lights_Material   white lens triangles (front), emissive: headlights
 *   Tail_Lamp              red lens triangles (rear), red emissive: brake lamps
 *   Indicator_Amber_Front  triangles that become a front indicator (zones)
 *   Indicator_Amber_Rear   triangles that become a rear indicator (zones)
 *   Body_Paint[_n]         flat-colour paint, the only thing paint changes
 *
 *   bun scripts/prepare-low-poly-cars.ts [--textures <_shared_textures dir>]
 *
 * Works on the GLBs in src/mainview/models (and rewrites the copy in
 * public/models). Safe to run again on an already-prepared file. A fresh
 * export first needs the palette PNG it points at (looked up in --textures,
 * default ~/Downloads/models-glb/_shared_textures); it is embedded.
 *
 * Triangles are classified by the palette colour under their UV centroid.
 * Each paint material carries `paintShade` (extras): its brightness relative
 * to the main paint, so a repaint keeps the model's light and dark panels.
 *
 * Also done: the wheel mesh nodes (FLW...) are wrapped in `Wheel_FL` etc.
 * pivots, which is what CarVisual spins.
 */
import * as fs from "node:fs"
import * as path from "node:path"
import * as zlib from "node:zlib"

const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

type Part = "lights" | "tail" | "ampF" | "ampR"

interface CarRule {
  /** palette colours that are body paint; `ref` is the shade-1 colour */
  paint: string[]
  ref: string
  /** lamp triangles by palette colour and position (x is |x|, cm, nose +z) */
  lamp: (hex: string, x: number, y: number, z: number, verts: number[][]) => Part | null
  /** what the indicator triangles looked like, for the unlit base material */
  ampFColor?: string
  ampRColor?: string
  /** palette colour (and test) that must never be paint */
  notPaint?: (hex: string, x: number, y: number, z: number) => boolean
}

const WHITE = "#ffffff"
const RED = "#ff0000"
const near = (x: number, y: number, cx: number, cy: number) =>
  Math.hypot(x - cx, y - cy)

const RULES: Record<string, CarRule> = {
  "bugatti_chiron_pur_sport.glb": {
    paint: ["#2141a9", "#142e83", "#0a1f62", "#000b1e", "#00112d", "#000713"],
    ref: "#2141a9",
    lamp: (hex, _x, _y, z) =>
      hex === WHITE && z > 0 ? "lights" : hex === RED && z < 0 ? "tail" : null,
  },
  // orange lenses are the indicators, front and rear
  "mercedes_benz_w124.glb": {
    paint: ["#4b4b4b", "#383838", "#222222"],
    ref: "#4b4b4b",
    ampFColor: "#ff4500",
    ampRColor: "#ff4500",
    lamp: (hex, _x, _y, z) =>
      hex === WHITE && z > 0
        ? "lights"
        : hex === RED && z < 0
          ? "tail"
          : hex === "#ff4500"
            ? z > 0
              ? "ampF"
              : "ampR"
            : null,
  },
  // headlight = white disc at |x|~68; its dark ring is the front indicator;
  // rear: three red bars, the outermost is the indicator. Paint spans white
  // to grey (hood and roof highlights are white), exhaust tips are not paint.
  "ford_mustang_1969.glb": {
    paint: ["#c7c7c7", "#ffffff", "#bababa", "#969696", "#8a8a8a"],
    ref: "#ffffff",
    ampFColor: "#2d2d2d",
    ampRColor: "#ff0000",
    lamp: (hex, x, y, z) => {
      if (z > 175) {
        const d = near(x, y, 68, 57)
        if (hex === WHITE && d <= 6.5 && z > 180) return "lights"
        // the ring is the tight cluster at d 7.4-8.7; the housing shards start at 9.6
        if (hex === "#2d2d2d" && d <= 9) return "ampF"
      }
      if (hex === RED && z < 0) return x > 59 ? "ampR" : "tail"
      return null
    },
    notPaint: (hex, _x, y, z) => hex === "#bababa" && y < 50 && z < -195,
  },
  // two lamp rings per side: the outer ring is the front indicator; rear: two
  // red bars, the lower one is the indicator
  "dodge_challenger_srt_hellcat.glb": {
    paint: ["#d24b00", "#ff650f", "#a53b00"],
    ref: "#ff650f",
    ampFColor: "#ffffff",
    ampRColor: "#ff0000",
    lamp: (hex, x, y, z, verts) => {
      if (hex === WHITE && z > 0) return x > 62 ? "ampF" : "lights"
      if (hex === RED && z < 0) return y > 86 ? "tail" : "ampR"
      return null
    },
  },
}

const texArg = process.argv.indexOf("--textures")
const TEX_DIR =
  texArg > 0
    ? process.argv[texArg + 1]
    : path.join(process.env.HOME ?? "", "Downloads/models-glb/_shared_textures")
const SRC = "src/mainview/models"
const OUT_DIRS = [SRC, "src/mainview/public/models"]

// ---- GLB io ---------------------------------------------------------------

function readGlb(buf: Buffer) {
  const jsonLen = buf.readUInt32LE(12)
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"))
  const binLen = buf.readUInt32LE(20 + jsonLen)
  return { json, bin: buf.subarray(28 + jsonLen, 28 + jsonLen + binLen) }
}

function pad4(b: Buffer, fill: number): Buffer {
  const p = (4 - (b.length % 4)) % 4
  return p ? Buffer.concat([b, Buffer.alloc(p, fill)]) : b
}

function writeGlb(json: any, bin: Buffer): Buffer {
  const jb = pad4(Buffer.from(JSON.stringify(json), "utf8"), 0x20)
  const bb = pad4(bin, 0)
  const head = Buffer.alloc(12)
  head.writeUInt32LE(0x46546c67, 0)
  head.writeUInt32LE(2, 4)
  head.writeUInt32LE(12 + 8 + jb.length + 8 + bb.length, 8)
  const jh = Buffer.alloc(8)
  jh.writeUInt32LE(jb.length, 0)
  jh.writeUInt32LE(JSON_CHUNK, 4)
  const bh = Buffer.alloc(8)
  bh.writeUInt32LE(bb.length, 0)
  bh.writeUInt32LE(BIN_CHUNK, 4)
  return Buffer.concat([head, jh, jb, bh, bb])
}

// ---- PNG (8-bit RGBA / RGB, non-interlaced) ---------------------------------

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
  const out = Buffer.alloc(h * stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[y * stride + x - ch] : 0
      const b = y > 0 ? out[(y - 1) * stride + x] : 0
      const c = x >= ch && y > 0 ? out[(y - 1) * stride + x - ch] : 0
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
      out[y * stride + x] = v & 255
    }
  }
  return {
    at(u: number, v: number): string {
      const x = Math.min(w - 1, Math.max(0, Math.floor((u - Math.floor(u)) * w)))
      const y = Math.min(h - 1, Math.max(0, Math.floor((v - Math.floor(v)) * h)))
      const i = y * stride + x * ch
      return (
        "#" +
        [0, 1, 2].map((k) => out[i + k].toString(16).padStart(2, "0")).join("")
      )
    },
  }
}

// ---- geometry -------------------------------------------------------------

interface Prim {
  pos: Float32Array
  nrm: Float32Array
  uv: Float32Array
  idx: Uint32Array
  material: number
}

const NC: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }
const SIZE: Record<number, number> = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }

function readAcc(json: any, bin: Buffer, i: number): number[] {
  const a = json.accessors[i]
  const n = NC[a.type]
  if (a.bufferView === undefined) return new Array(a.count * n).fill(0)
  const bv = json.bufferViews[a.bufferView]
  const sz = SIZE[a.componentType]
  const off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0)
  const stride = bv.byteStride ?? n * sz
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)
  const out: number[] = new Array(a.count * n)
  for (let k = 0; k < a.count; k++)
    for (let c = 0; c < n; c++) {
      const o = off + k * stride + c * sz
      out[k * n + c] =
        a.componentType === 5126
          ? dv.getFloat32(o, true)
          : a.componentType === 5125
            ? dv.getUint32(o, true)
            : a.componentType === 5123
              ? dv.getUint16(o, true)
              : dv.getUint8(o)
    }
  return out
}

function readPrim(json: any, bin: Buffer, p: any): Prim {
  const pos = Float32Array.from(readAcc(json, bin, p.attributes.POSITION))
  return {
    pos,
    nrm: Float32Array.from(readAcc(json, bin, p.attributes.NORMAL)),
    uv: Float32Array.from(readAcc(json, bin, p.attributes.TEXCOORD_0)),
    idx:
      p.indices === undefined
        ? Uint32Array.from({ length: pos.length / 3 }, (_, i) => i)
        : Uint32Array.from(readAcc(json, bin, p.indices)),
    material: p.material,
  }
}

/** The given triangles of `src`, with compacted vertices. */
function subset(src: Prim, tris: number[], material: number): Prim {
  const map = new Map<number, number>()
  const pos: number[] = []
  const nrm: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (const t of tris)
    for (let k = 0; k < 3; k++) {
      const v = src.idx[t * 3 + k]
      let n = map.get(v)
      if (n === undefined) {
        n = map.size
        map.set(v, n)
        pos.push(src.pos[v * 3], src.pos[v * 3 + 1], src.pos[v * 3 + 2])
        nrm.push(src.nrm[v * 3], src.nrm[v * 3 + 1], src.nrm[v * 3 + 2])
        uv.push(src.uv[v * 2], src.uv[v * 2 + 1])
      }
      idx.push(n)
    }
  return {
    pos: Float32Array.from(pos),
    nrm: Float32Array.from(nrm),
    uv: Float32Array.from(uv),
    idx: Uint32Array.from(idx),
    material,
  }
}

// ---- colour ---------------------------------------------------------------

const lin = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
const rgb = (hex: string) =>
  [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255))
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// ---- the work -------------------------------------------------------------

function prepare(file: string): Buffer {
  const rule = RULES[file]
  const { json, bin } = readGlb(fs.readFileSync(path.join(SRC, file)))

  // palette PNG: embedded already, or referenced by uri on a fresh export
  let png: Buffer
  const img = json.images[0]
  if (img.uri) png = fs.readFileSync(path.join(TEX_DIR, path.basename(img.uri)))
  else {
    const bv = json.bufferViews[img.bufferView]
    const o = bv.byteOffset ?? 0
    png = Buffer.from(bin.subarray(o, o + bv.byteLength))
  }
  const pal = decodePng(png)

  // wheel mesh nodes -> `Wheel_XX` pivot groups
  const root = json.scenes[0].nodes
  const top = json.nodes[root[0]]
  const list: number[] = root.length === 1 && top.children ? top.children : root
  for (let i = 0; i < list.length; i++) {
    const n = json.nodes[list[i]]
    const m = /^(F|R)(L|R)W$/.exec(n.name ?? "")
    if (!m) continue
    json.nodes.push({ name: `${n.name}_mesh`, mesh: n.mesh })
    const wrap: any = {
      name: `Wheel_${m[1]}${m[2]}`,
      children: [json.nodes.length - 1],
    }
    for (const k of ["matrix", "translation", "rotation"])
      if (n[k]) wrap[k] = n[k]
    json.nodes.push(wrap)
    list[i] = json.nodes.length - 1
  }

  // materials, in the DB12's layout
  const materials: any[] = [
    {
      name: "CARS_Color_1_Material",
      pbrMetallicRoughness: {
        metallicFactor: 0.288,
        roughnessFactor: 0.52,
        baseColorTexture: { index: 0, texCoord: 0 },
      },
      emissiveFactor: [0.039215688, 0.039215688, 0.039215688],
      emissiveTexture: { index: 1, texCoord: 0 },
    },
    {
      name: "CARS_Lights_Material",
      pbrMetallicRoughness: {
        metallicFactor: 0,
        roughnessFactor: 1,
        baseColorTexture: { index: 2, texCoord: 0 },
      },
      emissiveFactor: [1, 1, 1],
      emissiveTexture: { index: 3, texCoord: 0 },
    },
    {
      name: "Tail_Lamp",
      emissiveFactor: [1, 0.04, 0.04],
      pbrMetallicRoughness: {
        baseColorFactor: [0.2, 0.005, 0.005, 1],
        metallicFactor: 0,
        roughnessFactor: 0.35,
      },
    },
  ]
  const COLOR = 0
  const LIGHTS = 1
  const TAIL = 2
  const flat = (name: string, hex: string) => {
    materials.push({
      name,
      pbrMetallicRoughness: {
        baseColorFactor: [...rgb(hex), 1],
        metallicFactor: 0,
        roughnessFactor: 0.35,
      },
    })
    return materials.length - 1
  }
  const AMBER_F = rule.ampFColor ? flat("Indicator_Amber_Front", rule.ampFColor) : -1
  const AMBER_R = rule.ampRColor ? flat("Indicator_Amber_Rear", rule.ampRColor) : -1
  const paintIndex = new Map<string, number>()
  rule.paint.forEach((hex, k) => {
    paintIndex.set(hex, materials.length)
    materials.push({
      name: k === 0 ? "Body_Paint" : `Body_Paint_${k + 1}`,
      pbrMetallicRoughness: {
        baseColorFactor: [...rgb(hex), 1],
        metallicFactor: 0.45,
        roughnessFactor: 0.3,
      },
      extras: { paintShade: +Math.pow(lum(hex) / lum(rule.ref), 0.4).toFixed(3) },
    })
  })

  // primitives per mesh: the body is split by palette colour, the rest stay
  const bodyMesh = json.nodes.find((n: any) => n.name === "Body").mesh
  const meshPrims: Prim[][] = json.meshes.map((m: any, mi: number) => {
    const prims: Prim[] = m.primitives.map((p: any) => readPrim(json, bin, p))
    if (mi !== bodyMesh) return prims.map((p) => ({ ...p, material: COLOR }))
    // one big primitive first, so each material ends up as a single draw
    const cat = (f: (p: Prim) => ArrayLike<number>) =>
      Float32Array.from(prims.flatMap((p) => Array.from(f(p))))
    let base = 0
    const src: Prim = {
      pos: cat((p) => p.pos),
      nrm: cat((p) => p.nrm),
      uv: cat((p) => p.uv),
      idx: Uint32Array.from(
        prims.flatMap((p) => {
          const out = Array.from(p.idx, (i) => i + base)
          base += p.pos.length / 3
          return out
        }),
      ),
      material: COLOR,
    }
    const groups = new Map<number, number[]>()
    for (let t = 0; t < src.idx.length / 3; t++) {
      let u = 0
      let v = 0
      let x = 0
      let y = 0
      let z = 0
      for (let k = 0; k < 3; k++) {
        const i = src.idx[t * 3 + k]
        u += src.uv[i * 2] / 3
        v += src.uv[i * 2 + 1] / 3
        x += src.pos[i * 3] / 3
        y += src.pos[i * 3 + 1] / 3
        z += src.pos[i * 3 + 2] / 3
      }
      const hex = pal.at(u, v)
      const ax = Math.abs(x)
      const verts = [0, 1, 2].map((k) => {
        const i = src.idx[t * 3 + k]
        return [Math.abs(src.pos[i * 3]), src.pos[i * 3 + 1], src.pos[i * 3 + 2]]
      })
      const part = rule.lamp(hex, ax, y, z, verts)
      let mat = COLOR
      if (part === "lights") mat = LIGHTS
      else if (part === "tail") mat = TAIL
      else if (part === "ampF") mat = AMBER_F
      else if (part === "ampR") mat = AMBER_R
      else if (paintIndex.has(hex) && !rule.notPaint?.(hex, ax, y, z))
        mat = paintIndex.get(hex)!
      const g = groups.get(mat)
      if (g) g.push(t)
      else groups.set(mat, [t])
    }
    return [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([mat, tris]) => subset(src, tris, mat))
  })

  // rebuild the buffers from scratch: image first, then every primitive
  const chunks: Buffer[] = []
  let size = 0
  json.bufferViews = []
  json.accessors = []
  const view = (data: Buffer, target?: number) => {
    chunks.push(pad4(data, 0))
    json.bufferViews.push({
      buffer: 0,
      byteOffset: size,
      byteLength: data.length,
      ...(target ? { target } : {}),
    })
    size += chunks[chunks.length - 1].length
    return json.bufferViews.length - 1
  }
  const accessor = (
    data: ArrayBufferView,
    componentType: number,
    type: string,
    count: number,
    target: number,
    minmax?: number[][],
  ) => {
    const bv = view(
      Buffer.from(data.buffer, data.byteOffset, data.byteLength),
      target,
    )
    json.accessors.push({
      bufferView: bv,
      componentType,
      count,
      type,
      ...(minmax ? { min: minmax[0], max: minmax[1] } : {}),
    })
    return json.accessors.length - 1
  }
  json.images = [{ bufferView: view(png), mimeType: "image/png" }]
  for (const t of json.textures) t.source = 0
  json.meshes.forEach((m: any, mi: number) => {
    m.primitives = meshPrims[mi].map((p) => {
      const n = p.pos.length / 3
      const mn = [Infinity, Infinity, Infinity]
      const mx = [-Infinity, -Infinity, -Infinity]
      for (let i = 0; i < n; i++)
        for (let c = 0; c < 3; c++) {
          mn[c] = Math.min(mn[c], p.pos[i * 3 + c])
          mx[c] = Math.max(mx[c], p.pos[i * 3 + c])
        }
      return {
        attributes: {
          POSITION: accessor(p.pos, 5126, "VEC3", n, 34962, [mn, mx]),
          NORMAL: accessor(p.nrm, 5126, "VEC3", n, 34962),
          TEXCOORD_0: accessor(p.uv, 5126, "VEC2", n, 34962),
        },
        indices:
          n < 65536
            ? accessor(Uint16Array.from(p.idx), 5123, "SCALAR", p.idx.length, 34963)
            : accessor(p.idx, 5125, "SCALAR", p.idx.length, 34963),
        material: p.material,
      }
    })
  })
  json.materials = materials
  json.buffers = [{ byteLength: size }]
  return writeGlb(json, Buffer.concat(chunks))
}

for (const f of Object.keys(RULES)) {
  const out = prepare(f)
  for (const d of OUT_DIRS) fs.writeFileSync(path.join(d, f), out)
  console.log(`${f}: ${(out.length / 1024).toFixed(0)} KB`)
}
