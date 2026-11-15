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
  /** triangles authored with this source material are indicators (z<0 = rear) */
  ampMat?: string
  /** drop indicator candidates further than this (cm) from any lamp vertex */
  ampNear?: number
  /** drop indicator candidates with an edge longer than this (cm): stray flaps */
  ampMaxEdge?: number
  /** every corner (not just one) must be within `ampNear` of a lamp vertex */
  ampTight?: boolean
  /** raise the darkest paint shades so a repaint reads as one colour */
  shadeFloor?: number
  /** unpainted-colour triangles that are really body panels: the paint hex to use */
  extraPaint?: (hex: string, x: number, y: number, z: number) => string | null
  /** triangles that stay unpainted and get a flat pure-black material */
  pureBlack?: (hex: string, x: number, y: number, z: number) => boolean
  /** keep the file's own "Body_Paint" material (single paint) on re-runs */
  keepPaint?: boolean
}

const WHITE = "#ffffff"
const RED = "#ff0000"
const near = (x: number, y: number, cx: number, cy: number) =>
  Math.hypot(x - cx, y - cy)

/** Porsche: trim that keeps the model's own dark colour (not body paint):
 *  front/rear bumper openings, diffuser, lowest edge, tail-lamp panel */
const porscheBlack = (x: number, y: number, z: number) =>
  (y < 30 && Math.abs(z) > 150) || (z < -185 && y < 52)
/** the dark tail-lamp panel: only its dark triangles, not the body-colour
 *  band between it and the lamp strip */
const porschePanel = (hex: string, x: number, y: number, z: number) =>
  hex === "#141414" && z < -195 && y >= 70 && y <= 79 && x <= 84
const porscheBlackTrim = (x: number, y: number, z: number) =>
  (z > 160 && y < 62 && x <= 77) ||
  (z < -165 && y < 62) ||
  // rear lamp band: black across the whole width, including between the two
  // lamp housings (x from the centreline)
  (z < -150 && y >= 66 && y <= 90 && x <= 84)

const RULES: Record<string, CarRule> = {
  // F-Type SVR: the round centre lens is the headlight, the rest of the white
  // housing is the front indicator; rear: red = tail lamp, and the dark-green housing
  // just inboard of each tail lamp is the indicator. Paint is the three greens.
  "jaguar_f_type.glb": {
    paint: ["#6dc71b", "#98ff39", "#45830c"],
    ref: "#6dc71b",
    ampFColor: "#ffffff",
    ampRColor: "#45830c",
    lamp: (hex, x, y, z) => {
      if (hex === WHITE && z > 0) {
        // the round lens at the centre (|x|~62, y~68, z~169) is the headlight
        if (z >= 168.5 && near(x, y, 62.3, 68.4) <= 4.5) return "lights"
        return "ampF"
      }
      if (hex === RED && z < 0) return "tail"
      if (hex === "#45830c" && z < -158 && x >= 38 && x <= 86 && y >= 70 && y <= 81)
        return "ampR"
      return null
    },
  },
  // F12: blue body. White lens on the outer headlight = headlight, the dark housing
  // round it = front indicator. Rear: red ring = tail lamp, the dark disc inside the
  // round lamp (not the ring or the body round it) = indicator. White stripes stay.
  "ferrari_f12.glb": {
    paint: ["#0063c3", "#0f89ff", "#004383"],
    ref: "#0063c3",
    ampFColor: "#141414",
    ampRColor: "#2d2d2d",
    lamp: (hex, x, y, z) => {
      if (hex === WHITE && z > 160 && x >= 50 && y >= 50) return "lights"
      if (hex === RED && z < 0) return "tail"
      if (hex === "#141414" && z > 165 && x >= 54 && x <= 75 && y >= 50 && y <= 68)
        return "ampF"
      if (hex === "#2d2d2d" && z < -192 && near(x, y, 59.5, 81.7) <= 7) return "ampR"
      return null
    },
  },
  "bugatti_chiron_pur_sport.glb": {
    paint: ["#2141a9", "#142e83", "#0a1f62", "#000b1e", "#00112d", "#000713"],
    ref: "#2141a9",
    // rear: the two upper lamps are the indicators, the low strip is only a tail lamp
    ampRColor: "#ff0000",
    lamp: (hex, _x, y, z) =>
      hex === WHITE && z > 0
        ? "lights"
        : hex === RED && z < 0
          ? y > 69
            ? "ampR"
            : "tail"
          : null,
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
  // Evo X: white strip = headlight, red strip = tail lamp; the dark (#141414)
  // housing round each lamp is the indicator, front and rear. Paint is red;
  // the silver bits (mirrors, exhaust) are not paint.
  "mitsubishi_lancer_evo_x.glb": {
    paint: ["#b80000", "#8f0000", "#620000"],
    ref: "#b80000",
    ampFColor: "#141414",
    ampRColor: "#141414",
    lamp: (hex, x, y, z) => {
      if (hex === WHITE && z > 0) return "lights"
      if (hex === RED && z < 0) return "tail"
      if (hex === "#141414") {
        if (z > 150 && x >= 41 && x <= 76 && y >= 59 && y <= 75) return "ampF"
        if (z < -170 && x >= 38 && x <= 75 && y >= 82 && y <= 97) return "ampR"
      }
      return null
    },
  },
  // DB12: white = headlight, red = tail lamp (the rear indicator stays the
  // tail strip); the dark housing right round each headlight is the front
  // indicator. Keeps the existing single green paint.
  "aston_martin_db12.glb": {
    paint: [],
    ref: "#474747",
    keepPaint: true,
    ampFColor: "#141414",
    ampNear: 3,
    lamp: (hex, x, y, z) => {
      if (hex === WHITE && z > 0) return "lights"
      if (hex === RED && z < 0) return "tail"
      if (hex === "#141414" && z > 150 && x >= 41 && x <= 81 && y >= 45 && y <= 80)
        return "ampF"
      return null
    },
  },
  // 350Z: same scheme as the Evo X. White strip = headlight, red strip = tail
  // lamp, the dark (#141414) housing round each lamp is the indicator.
  "nissan_350z.glb": {
    paint: ["#d65710", "#ff7122", "#ad3e00"],
    ref: "#d65710",
    ampFColor: "#141414",
    ampRColor: "#141414",
    ampNear: 3,
    lamp: (hex, x, y, z) => {
      if (hex === WHITE && z > 0) return "lights"
      if (hex === RED && z < 0) return "tail"
      if (hex === "#141414") {
        if (z > 120 && x >= 47 && x <= 75 && y >= 56 && y <= 79) return "ampF"
        if (z < -143 && x >= 44 && x <= 74 && y >= 61 && y <= 88) return "ampR"
      }
      return null
    },
  },
  // 911 Turbo S: white = headlight, red = tail lamp. The dark housing round
  // the headlight is the front indicator; the rear indicator is the model's
  // own "Indicator" material. Paint is the three greys.
  "porsche_911.glb": {
    paint: ["#969696", "#747474", "#525252", "#2d2d2d", "#202020"],
    ref: "#969696",
    ampFColor: "#141414",
    ampRColor: "#141414",
    shadeFloor: 1,
    // #141414 is both body panels (doors, hood, roof, arches, bumpers) and the
    // real trim: paint all of it except the trim zones above
    extraPaint: (hex, x, y, z) =>
      hex === "#141414" && !porscheBlack(x, y, z) && !porscheBlackTrim(x, y, z)
        ? "#969696"
        : null,
    notPaint: (hex, x, y, z) =>
      porscheBlack(x, y, z) || porschePanel(hex, x, y, z),
    ampMat: "Indicator_Amber_Rear", // was "Indicator" in the raw export
    ampNear: 3,
    ampMaxEdge: 15,
    ampTight: true,
    lamp: (hex, x, y, z) => {
      if (hex === WHITE && z > 0) return "lights"
      if (hex === RED && z < 0) return "tail"
      if (hex === "#141414" && z > 150 && x >= 54 && x <= 81 && y >= 60 && y <= 84)
        return "ampF"
      return null
    },
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
  const BLACK = rule.pureBlack
    ? materials.push({
        name: "Trim_Black",
        pbrMetallicRoughness: {
          baseColorFactor: [0, 0, 0, 1],
          metallicFactor: 0,
          roughnessFactor: 0.9,
        },
      }) - 1
    : -1
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
      extras: {
        paintShade: +Math.max(
          Math.pow(lum(hex) / lum(rule.ref), 0.4),
          rule.shadeFloor ?? 0,
        ).toFixed(3),
      },
    })
  })

  const keepPaint = rule.keepPaint
    ? materials.push(
        json.materials.find((m: any) => m.name === "Body_Paint"),
      ) - 1
    : -1

  // primitives per mesh: the body is split by palette colour, the rest stay
  const bodyMesh = json.nodes.find((n: any) => n.name === "Body").mesh
  const meshPrims: Prim[][] = json.meshes.map((m: any, mi: number) => {
    const prims: Prim[] = m.primitives.map((p: any) => readPrim(json, bin, p))
    const srcNames: string[] = m.primitives.map(
      (p: any) => json.materials[p.material]?.name ?? "",
    )
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
    const triSrc: string[] = prims.flatMap((p, k) =>
      Array.from({ length: p.idx.length / 3 }, () => srcNames[k]),
    )
    const groups = new Map<number, number[]>()
    const parts: (Part | null)[] = []
    const cents: number[][] = []
    const tverts: number[][][] = []
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
      const part =
        rule.ampMat && triSrc[t] === rule.ampMat
          ? z < 0
            ? "ampR"
            : "ampF"
          : rule.lamp(hex, ax, y, z, verts)
      parts.push(part)
      cents.push([ax, y, z])
      tverts.push(verts)
    }
    if (rule.ampMaxEdge) {
      parts.forEach((q, t) => {
        if (q !== "ampF" && q !== "ampR") return
        if (rule.ampMat && triSrc[t] === rule.ampMat) return
        const v = tverts[t]
        const d = (i: number, j: number) =>
          Math.hypot(v[i][0] - v[j][0], v[i][1] - v[j][1], v[i][2] - v[j][2])
        if (Math.max(d(0, 1), d(1, 2), d(0, 2)) > rule.ampMaxEdge!) parts[t] = null
      })
    }
    if (rule.ampNear) {
      const lampV: number[][] = []
      parts.forEach((q, t) => {
        if (q === "lights" || q === "tail") lampV.push(...tverts[t])
      })
      const r2 = rule.ampNear * rule.ampNear
      parts.forEach((q, t) => {
        if ((q !== "ampF" && q !== "ampR") || (rule.ampMat && triSrc[t] === rule.ampMat))
          return
        // a corner within reach is enough: the housing slivers are long and
        // thin, so their centres sit far from the lens
        const reach = (c: number[]) =>
          lampV.some(
            (v) => (v[0] - c[0]) ** 2 + (v[1] - c[1]) ** 2 + (v[2] - c[2]) ** 2 <= r2,
          )
        const ok = rule.ampTight ? tverts[t].every(reach) : tverts[t].some(reach)
        if (!ok) parts[t] = null
      })
    }
    if (rule.ampNear && process.env.DEBUG_NEAR) {
      const lampV: number[][] = []
      parts.forEach((q, t) => {
        if (q === "lights" || q === "tail") lampV.push(...tverts[t])
      })
      const left = new Map<string, number>()
      const r2 = (rule.ampNear * 2) ** 2
      for (let t = 0; t < parts.length; t++) {
        if (parts[t]) continue
        const near2 = tverts[t].some((c) =>
          lampV.some((v) => (v[0] - c[0]) ** 2 + (v[1] - c[1]) ** 2 + (v[2] - c[2]) ** 2 <= r2),
        )
        if (!near2) continue
        const h = pal.at(
          [0, 1, 2].reduce((a, k) => a + src.uv[src.idx[t * 3 + k] * 2] / 3, 0),
          [0, 1, 2].reduce((a, k) => a + src.uv[src.idx[t * 3 + k] * 2 + 1] / 3, 0),
        )
        left.set(h, (left.get(h) ?? 0) + 1)
      }
      console.log("not indicator but within 2x reach:", [...left])
    }
    for (let t = 0; t < src.idx.length / 3; t++) {
      const part = parts[t]
      const [ax, y, z] = cents[t]
      const hex = pal.at(
        [0, 1, 2].reduce((a, k) => a + src.uv[src.idx[t * 3 + k] * 2] / 3, 0),
        [0, 1, 2].reduce((a, k) => a + src.uv[src.idx[t * 3 + k] * 2 + 1] / 3, 0),
      )
      let mat = COLOR
      if (part === "lights") mat = LIGHTS
      else if (part === "tail") mat = TAIL
      else if (part === "ampF") mat = AMBER_F
      else if (part === "ampR") mat = AMBER_R
      else if (rule.extraPaint?.(hex, ax, y, z) && paintIndex.has(rule.extraPaint(hex, ax, y, z)!))
        mat = paintIndex.get(rule.extraPaint(hex, ax, y, z)!)!
      else if (keepPaint >= 0 && triSrc[t] === "Body_Paint") mat = keepPaint
      else if (paintIndex.has(hex) && !rule.notPaint?.(hex, ax, y, z))
        mat = paintIndex.get(hex)!
      else if (BLACK >= 0 && rule.pureBlack!(hex, ax, y, z)) mat = BLACK
      const g = groups.get(mat)
      if (g) g.push(t)
      else groups.set(mat, [t])
    }
    return [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([mat, tris]) => {
        const prim = subset(src, tris, mat)
        if (mat === LIGHTS) {
          // every lens vertex samples the middle of the white palette block, so
          // bilinear/mip filtering can't pull in the yellow/blue cells beside it
          let su = 0
          let sv = 0
          const n = prim.uv.length / 2
          for (let i = 0; i < n; i++) {
            su += prim.uv[i * 2]
            sv += prim.uv[i * 2 + 1]
          }
          for (let i = 0; i < n; i++) {
            prim.uv[i * 2] = su / n
            prim.uv[i * 2 + 1] = sv / n
          }
        }
        return prim
      })
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

/** `ANALYZE=<file> bun scripts/prepare-low-poly-cars.ts`: per palette colour,
 * the triangle count and |x| / y / z extents of the body, to write a rule.
 * `BOX=xmin,xmax,ymin,ymax,zmin,zmax` (|x|, cm) limits it to a region. */
function analyze(file: string) {
  const { json, bin } = readGlb(fs.readFileSync(path.join(SRC, file)))
  const img = json.images[0]
  const png = img.uri
    ? fs.readFileSync(path.join(TEX_DIR, path.basename(img.uri)))
    : Buffer.from(
        bin.subarray(
          json.bufferViews[img.bufferView].byteOffset ?? 0,
          (json.bufferViews[img.bufferView].byteOffset ?? 0) +
            json.bufferViews[img.bufferView].byteLength,
        ),
      )
  const pal = decodePng(png)
  const bodyMesh = json.nodes.find((n: any) => n.name === "Body").mesh
  const box = process.env.BOX?.split(",").map(Number)
  const stats = new Map<string, number[]>()
  for (const p of json.meshes[bodyMesh].primitives) {
    const pr = readPrim(json, bin, p)
    for (let t = 0; t < pr.idx.length / 3; t++) {
      let u = 0, v = 0, x = 0, y = 0, z = 0
      for (let k = 0; k < 3; k++) {
        const i = pr.idx[t * 3 + k]
        u += pr.uv[i * 2] / 3
        v += pr.uv[i * 2 + 1] / 3
        x += pr.pos[i * 3] / 3
        y += pr.pos[i * 3 + 1] / 3
        z += pr.pos[i * 3 + 2] / 3
      }
      const hex = pal.at(u, v)
      const ax = Math.abs(x)
      if (box && (ax < box[0] || ax > box[1] || y < box[2] || y > box[3] || z < box[4] || z > box[5])) continue
      if (process.env.DUMP === hex)
        console.log(`  tri |x|=${ax.toFixed(1)} y=${y.toFixed(1)} z=${z.toFixed(1)}`)
      const s = stats.get(hex) ?? [0, 1e9, -1e9, 1e9, -1e9, 1e9, -1e9]
      s[0]++
      s[1] = Math.min(s[1], ax); s[2] = Math.max(s[2], ax)
      s[3] = Math.min(s[3], y); s[4] = Math.max(s[4], y)
      s[5] = Math.min(s[5], z); s[6] = Math.max(s[6], z)
      stats.set(hex, s)
    }
  }
  for (const [hex, s] of [...stats.entries()].sort((a, b) => b[1][0] - a[1][0]))
    console.log(
      `${hex} n=${s[0]} |x| ${s[1].toFixed(0)}..${s[2].toFixed(0)} y ${s[3].toFixed(0)}..${s[4].toFixed(0)} z ${s[5].toFixed(0)}..${s[6].toFixed(0)}`,
    )
}

if (process.env.ANALYZE) {
  analyze(process.env.ANALYZE)
  process.exit(0)
}

// optional file names after the script restrict which models are redone
const only = process.argv.slice(2).filter((a) => a.endsWith(".glb"))
for (const f of Object.keys(RULES)) {
  if (only.length > 0 && !only.includes(f)) continue
  const out = prepare(f)
  for (const d of OUT_DIRS) fs.writeFileSync(path.join(d, f), out)
  console.log(`${f}: ${(out.length / 1024).toFixed(0)} KB`)
}
