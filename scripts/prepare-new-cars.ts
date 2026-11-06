import * as fs from "node:fs"

const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

function readGlb(buf: ArrayBuffer) {
  const dv = new DataView(buf)
  const jsonLen = dv.getUint32(12, true)
  if (dv.getUint32(16, true) !== JSON_CHUNK) throw new Error("no JSON chunk")
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)))
  const binLen = dv.getUint32(20 + jsonLen, true)
  const bin = new Uint8Array(buf, 20 + jsonLen + 8, binLen)
  return { json, bin }
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

function yaw(a: number): number[] {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]
}

function appendToBin(bin: Uint8Array, data: Uint8Array): { offset: number; nextBin: Uint8Array } {
  const pad = (4 - (data.length % 4)) % 4
  const padded = new Uint8Array(data.length + pad)
  padded.set(data)
  const offset = bin.length
  const nextBin = new Uint8Array(bin.length + padded.length)
  nextBin.set(bin)
  nextBin.set(padded, offset)
  return { offset, nextBin }
}

function reindexPrim(json: any, bin: Uint8Array, prim: any, filterFn: (cx: number, cy: number, cz: number) => boolean): { newPrim: any; nextBin: Uint8Array } | null {
  const binDv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)
  const posAcc = json.accessors[prim.attributes.POSITION]
  const posBv = json.bufferViews[posAcc.bufferView]
  const posStart = (posBv.byteOffset ?? 0) + (posAcc.byteOffset ?? 0)
  
  const normAcc = prim.attributes.NORMAL !== undefined ? json.accessors[prim.attributes.NORMAL] : null
  const normBv = normAcc ? json.bufferViews[normAcc.bufferView] : null
  const normStart = normBv ? (normBv.byteOffset ?? 0) + (normAcc.byteOffset ?? 0) : 0

  const uvAcc = prim.attributes.TEXCOORD_0 !== undefined ? json.accessors[prim.attributes.TEXCOORD_0] : null
  const uvBv = uvAcc ? json.bufferViews[uvAcc.bufferView] : null
  const uvStart = uvBv ? (uvBv.byteOffset ?? 0) + (uvAcc.byteOffset ?? 0) : 0

  const idxAcc = json.accessors[prim.indices]
  const idxBv = json.bufferViews[idxAcc.bufferView]
  const idxStart = (idxBv.byteOffset ?? 0) + (idxAcc.byteOffset ?? 0)
  const isU32 = idxAcc.componentType === 5125
  const stride = isU32 ? 4 : 2
  const tris = idxAcc.count / 3

  const oldToNew = new Map<number, number>()
  const newPositions: number[] = []
  const newNormals: number[] = []
  const newUvs: number[] = []
  const newIndices: number[] = []
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]

  for (let t = 0; t < tris; t++) {
    const o = idxStart + t * 3 * stride
    const i0 = isU32 ? binDv.getUint32(o, true) : binDv.getUint16(o, true)
    const i1 = isU32 ? binDv.getUint32(o + stride, true) : binDv.getUint16(o + stride, true)
    const i2 = isU32 ? binDv.getUint32(o + stride * 2, true) : binDv.getUint16(o + stride * 2, true)
    const x0 = binDv.getFloat32(posStart + i0 * 12, true)
    const x1 = binDv.getFloat32(posStart + i1 * 12, true)
    const x2 = binDv.getFloat32(posStart + i2 * 12, true)
    const y0 = binDv.getFloat32(posStart + i0 * 12 + 4, true)
    const y1 = binDv.getFloat32(posStart + i1 * 12 + 4, true)
    const y2 = binDv.getFloat32(posStart + i2 * 12 + 4, true)
    const z0 = binDv.getFloat32(posStart + i0 * 12 + 8, true)
    const z1 = binDv.getFloat32(posStart + i1 * 12 + 8, true)
    const z2 = binDv.getFloat32(posStart + i2 * 12 + 8, true)
    if (!filterFn((x0 + x1 + x2) / 3, (y0 + y1 + y2) / 3, (z0 + z1 + z2) / 3)) continue

    for (const oldIdx of [i0, i1, i2]) {
      let mapped = oldToNew.get(oldIdx)
      if (mapped === undefined) {
        mapped = oldToNew.size
        oldToNew.set(oldIdx, mapped)
        const px = binDv.getFloat32(posStart + oldIdx * 12, true)
        const py = binDv.getFloat32(posStart + oldIdx * 12 + 4, true)
        const pz = binDv.getFloat32(posStart + oldIdx * 12 + 8, true)
        newPositions.push(px, py, pz)
        min[0] = Math.min(min[0], px); min[1] = Math.min(min[1], py); min[2] = Math.min(min[2], pz)
        max[0] = Math.max(max[0], px); max[1] = Math.max(max[1], py); max[2] = Math.max(max[2], pz)
        if (normAcc) {
          newNormals.push(
            binDv.getFloat32(normStart + oldIdx * 12, true),
            binDv.getFloat32(normStart + oldIdx * 12 + 4, true),
            binDv.getFloat32(normStart + oldIdx * 12 + 8, true),
          )
        }
        if (uvAcc) {
          newUvs.push(
            binDv.getFloat32(uvStart + oldIdx * 8, true),
            binDv.getFloat32(uvStart + oldIdx * 8 + 4, true),
          )
        }
      }
      newIndices.push(mapped)
    }
  }

  if (!newIndices.length) return null

  // Write new position buffer
  const posBytes = new Uint8Array(new Float32Array(newPositions).buffer)
  const posRes = appendToBin(bin, posBytes)
  bin = posRes.nextBin
  const posBvIdx = json.bufferViews.length
  json.bufferViews.push({ buffer: 0, byteOffset: posRes.offset, byteLength: posBytes.length })
  const newPosAccIdx = json.accessors.length
  json.accessors.push({ bufferView: posBvIdx, byteOffset: 0, componentType: 5126, count: newPositions.length / 3, type: "VEC3", min, max })

  const newAttributes: any = { POSITION: newPosAccIdx }

  if (normAcc && newNormals.length) {
    const normBytes = new Uint8Array(new Float32Array(newNormals).buffer)
    const normRes = appendToBin(bin, normBytes)
    bin = normRes.nextBin
    const normBvIdx = json.bufferViews.length
    json.bufferViews.push({ buffer: 0, byteOffset: normRes.offset, byteLength: normBytes.length })
    const newNormAccIdx = json.accessors.length
    json.accessors.push({ bufferView: normBvIdx, byteOffset: 0, componentType: 5126, count: newNormals.length / 3, type: "VEC3" })
    newAttributes.NORMAL = newNormAccIdx
  }

  if (uvAcc && newUvs.length) {
    const uvBytes = new Uint8Array(new Float32Array(newUvs).buffer)
    const uvRes = appendToBin(bin, uvBytes)
    bin = uvRes.nextBin
    const uvBvIdx = json.bufferViews.length
    json.bufferViews.push({ buffer: 0, byteOffset: uvRes.offset, byteLength: uvBytes.length })
    const newUvAccIdx = json.accessors.length
    json.accessors.push({ bufferView: uvBvIdx, byteOffset: 0, componentType: 5126, count: newUvs.length / 2, type: "VEC2" })
    newAttributes.TEXCOORD_0 = newUvAccIdx
  }

  const idxArr = isU32 ? new Uint32Array(newIndices) : new Uint16Array(newIndices)
  const idxBytes = new Uint8Array(idxArr.buffer)
  const idxRes = appendToBin(bin, idxBytes)
  bin = idxRes.nextBin
  const idxBvIdx = json.bufferViews.length
  json.bufferViews.push({ buffer: 0, byteOffset: idxRes.offset, byteLength: idxBytes.length })
  const newIdxAccIdx = json.accessors.length
  json.accessors.push({ bufferView: idxBvIdx, byteOffset: 0, componentType: idxAcc.componentType, count: newIndices.length, type: "SCALAR" })

  return { newPrim: { attributes: newAttributes, indices: newIdxAccIdx, material: prim.material, mode: prim.mode ?? 4 }, nextBin: bin }
}

async function prepareCar(filename: string, config: {
  yawAngle?: number
  lampMat?: string
  splitRear?: "x" | "z"
  isSkyline?: boolean
}) {
  const src = `src/mainview/models/${filename}`
  const rawBuf = await Bun.file(src).arrayBuffer()
  let { json, bin } = readGlb(rawBuf)

  if (config.yawAngle) {
    const turn = yaw(config.yawAngle)
    for (const idx of json.scenes[json.scene ?? 0].nodes) {
      const node = json.nodes[idx]
      let local = node.matrix ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
      node.matrix = mul(turn, local)
      delete node.translation
      delete node.rotation
      delete node.scale
    }
  }

  if (config.splitRear) {
    const flNode = json.nodes.find((n: any) => n.name === "Front Left Wheel_0" || n.name === "Front_Left_Wheel_0" || n.name === "Wheel_FL")
    const frNode = json.nodes.find((n: any) => n.name === "Front Right Wheel_1" || n.name === "Front_Right_Wheel_1" || n.name === "Wheel_FR")
    if (flNode) flNode.name = "Wheel_FL"
    if (frNode) frNode.name = "Wheel_FR"

    const rlExisting = json.nodes.find((n: any) => n.name === "Wheel_RL")
    const rrExisting = json.nodes.find((n: any) => n.name === "Wheel_RR")
    const rwNode = json.nodes.find((n: any) => n.name === "Rear Wheels_2" || n.name === "Rear_Wheels_2")

    const sourceNodes = rwNode ? [rwNode] : (rlExisting && rrExisting ? [rlExisting, rrExisting] : [])
    
    // We want to create fresh Wheel_RL and Wheel_RR
    const rlChildren: number[] = []
    const rrChildren: number[] = []

    const childIndices = new Set<number>()
    for (const s of sourceNodes) {
      if (s.children) s.children.forEach((c: number) => childIndices.add(c))
    }

    const filterRL = config.splitRear === "x" ? (x: number) => x > 0 : (cx: number, cy: number, cz: number) => cz < 0
    const filterRR = config.splitRear === "x" ? (x: number) => x < 0 : (cx: number, cy: number, cz: number) => cz > 0

    for (const childIdx of childIndices) {
      const childNode = json.nodes[childIdx]
      const mesh = json.meshes[childNode.mesh]
      const prim = mesh.primitives[0]

      const resRL = reindexPrim(json, bin, prim, filterRL)
      if (resRL) {
        bin = resRL.nextBin
        const mIdx = json.meshes.length
        json.meshes.push({ name: `${mesh.name}_RL_clean`, primitives: [resRL.newPrim] })
        const nIdx = json.nodes.length
        json.nodes.push({ name: `${childNode.name}_RL`, mesh: mIdx })
        rlChildren.push(nIdx)
      }

      const resRR = reindexPrim(json, bin, prim, filterRR)
      if (resRR) {
        bin = resRR.nextBin
        const mIdx = json.meshes.length
        json.meshes.push({ name: `${mesh.name}_RR_clean`, primitives: [resRR.newPrim] })
        const nIdx = json.nodes.length
        json.nodes.push({ name: `${childNode.name}_RR`, mesh: mIdx })
        rrChildren.push(nIdx)
      }
    }

    const baseMatrix = sourceNodes[0]?.matrix ? [...sourceNodes[0].matrix] : undefined
    const rlIdx = json.nodes.length
    json.nodes.push({ name: "Wheel_RL", children: rlChildren, matrix: baseMatrix })
    const rrIdx = json.nodes.length
    json.nodes.push({ name: "Wheel_RR", children: rrChildren, matrix: baseMatrix })

    // Replace old source nodes in parents
    const oldIndices = sourceNodes.map((n: any) => json.nodes.indexOf(n))
    for (const p of json.nodes) {
      if (p.children) {
        const hasOld = p.children.some((c: number) => oldIndices.includes(c))
        if (hasOld) {
          p.children = p.children.filter((c: number) => !oldIndices.includes(c)).concat([rlIdx, rrIdx])
        }
      }
    }
  }

  if (config.isSkyline) {
    const parentNode = json.nodes[1]
    const wheelQuads = [
      { name: "Wheel_FL", filter: (x: number, y: number) => x > 0 && y < 0 },
      { name: "Wheel_FR", filter: (x: number, y: number) => x < 0 && y < 0 },
      { name: "Wheel_RL", filter: (x: number, y: number) => x > 0 && y > 0 },
      { name: "Wheel_RR", filter: (x: number, y: number) => x < 0 && y > 0 },
    ]

    const newWheelIndices: number[] = []
    for (const quad of wheelQuads) {
      const quadChildren: number[] = []
      for (const mIdx of [21, 22]) {
        const mesh = json.meshes[mIdx]
        const prim = mesh.primitives[0]
        const res = reindexPrim(json, bin, prim, (cx, cy) => quad.filter(cx, cy))
        if (res) {
          bin = res.nextBin
          const nextMIdx = json.meshes.length
          json.meshes.push({ name: `${mesh.name}_${quad.name}`, primitives: [res.newPrim] })
          const nextNIdx = json.nodes.length
          json.nodes.push({ name: `${quad.name}_part`, mesh: nextMIdx })
          quadChildren.push(nextNIdx)
        }
      }
      const wIdx = json.nodes.length
      json.nodes.push({ name: quad.name, children: quadChildren })
      newWheelIndices.push(wIdx)
    }

    parentNode.children = parentNode.children.filter((c: number) => {
      const name = json.nodes[c]?.name
      return name !== "Object_23" && name !== "Object_24" && !name?.startsWith("Wheel_")
    }).concat(newWheelIndices)
  }

  if (config.lampMat) {
    for (const m of json.materials ?? []) {
      if (m.name === config.lampMat || (config.isSkyline && (m.name === "red_glass" || m.name === "dark_red_glass"))) {
        m.emissiveFactor = [0.2, 0.01, 0.004]
        m.pbrMetallicRoughness = m.pbrMetallicRoughness || {}
        m.pbrMetallicRoughness.baseColorFactor = [1, 0.05, 0.02, 1]
        m.pbrMetallicRoughness.roughnessFactor = 0.4
        m.pbrMetallicRoughness.metallicFactor = 0
      }
    }
  }

  const out = writeGlb(json, bin)
  fs.writeFileSync(`src/mainview/models/${filename}`, out)
  fs.writeFileSync(`src/mainview/public/models/${filename}`, out)
  console.log(`Processed ${filename} successfully`)
}

await prepareCar("bugatti_chiron_pur_sport.glb", { splitRear: "x", lampMat: "Red_Lights" })
await prepareCar("mitsubishi_lancer_evolution_6.glb", { splitRear: "x", lampMat: "Red_Lights" })
await prepareCar("nissan_350z.glb", { splitRear: "z", lampMat: "Red_Light" })
await prepareCar("nissan_skyline_r32_gt-r.glb", { isSkyline: true, lampMat: "red_glass" })
