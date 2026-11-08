import * as THREE from "three"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"

export const USE_CUSTOM_PROPS = true

type RGB = [number, number, number]

function part(
  g: THREE.BufferGeometry,
  y: number,
  [r, gr, b]: RGB,
  sy = 1,
): THREE.BufferGeometry {
  if (sy !== 1) g.scale(1, sy, 1)
  g.translate(0, y, 0)
  const out = g.index ? g.toNonIndexed() : g
  out.deleteAttribute("uv")
  const n = out.attributes.position.count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    col[i * 3] = r
    col[i * 3 + 1] = gr
    col[i * 3 + 2] = b
  }
  out.setAttribute("color", new THREE.BufferAttribute(col, 3))
  return out
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts)!
  g.computeVertexNormals()
  return g
}

const BARK: RGB = [0.3, 0.2, 0.12]

export function makeTreeGeometries(): THREE.BufferGeometry[] {
  const pine = (greens: RGB[], h: number) =>
    merge([
      part(new THREE.CylinderGeometry(0.2, 0.3, 1.4, 5), 0.7, BARK),
      part(new THREE.ConeGeometry(1.7, 2.6, 6), 2.4 * h, greens[0]),
      part(new THREE.ConeGeometry(1.3, 2.4, 6), 3.8 * h, greens[1]),
      part(new THREE.ConeGeometry(0.9, 2.1, 6), 5.3 * h, greens[2]),
    ])
  const round = (g1: RGB, g2: RGB) =>
    merge([
      part(new THREE.CylinderGeometry(0.22, 0.32, 2.6, 5), 1.3, BARK),
      part(new THREE.IcosahedronGeometry(1.9, 0), 3.9, g1, 0.9),
      part(new THREE.IcosahedronGeometry(1.3, 0), 5.3, g2),
    ])
  return [
    pine(
      [
        [0.1, 0.32, 0.16],
        [0.13, 0.38, 0.18],
        [0.16, 0.44, 0.2],
      ],
      1,
    ),
    pine(
      [
        [0.08, 0.26, 0.13],
        [0.1, 0.3, 0.15],
        [0.12, 0.35, 0.17],
      ],
      0.95,
    ),
    round([0.2, 0.45, 0.16], [0.28, 0.55, 0.2]),
    round([0.3, 0.42, 0.12], [0.38, 0.5, 0.15]),
  ]
}

export function makeTreeFarGeometry(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(1.8, 6.2, 3, 1, true)
  g.translate(0, 3.2, 0)
  const out = g.toNonIndexed()
  out.deleteAttribute("uv")
  const n = out.attributes.position.count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    col[i * 3] = 0.14
    col[i * 3 + 1] = 0.36
    col[i * 3 + 2] = 0.16
  }
  out.setAttribute("color", new THREE.BufferAttribute(col, 3))
  out.computeVertexNormals()
  return out
}

function jitter(g: THREE.IcosahedronGeometry, seed: number, amount: number) {
  const p = g.attributes.position
  const key = new Map<string, THREE.Vector3>()
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`
    let d = key.get(k)
    if (!d)
      key.set(
        k,
        (d = new THREE.Vector3(rnd(), rnd(), rnd()).multiplyScalar(amount)),
      )
    p.setXYZ(i, p.getX(i) + d.x, p.getY(i) + d.y, p.getZ(i) + d.z)
  }
}

export function makeRockGeometries(): THREE.BufferGeometry[] {
  return [0, 1, 2, 3].map((i) => {
    const ico = new THREE.IcosahedronGeometry(0.55 + i * 0.05, 0)
    const flat = ico as THREE.IcosahedronGeometry
    jitter(flat, 17 + i * 31, 0.12)
    flat.scale(1.2 - i * 0.08, 0.75, 1)
    flat.computeBoundingBox()
    const g = part(flat, -flat.boundingBox!.min.y, [
      0.42 + i * 0.03,
      0.42 + i * 0.03,
      0.45 + i * 0.03,
    ])
    g.computeVertexNormals()
    return g
  })
}

export function makeCloudGeometries(): THREE.BufferGeometry[] {
  const white: RGB = [0.97, 0.98, 1]
  const shade: RGB = [0.86, 0.9, 0.96]
  return [0, 1, 2, 3, 4].map((i) => {
    const blobs: THREE.BufferGeometry[] = []
    const n = 3 + (i % 3)
    for (let k = 0; k < n; k++) {
      const r = 6 + ((k * 7 + i * 3) % 5)
      const x = (k - (n - 1) / 2) * 9
      const y = 5 + ((k * 5 + i) % 3)
      const ico = new THREE.IcosahedronGeometry(r, 1)
      ico.scale(1.3, 0.85, 1)
      ico.translate(x, 0, ((k * 11 + i * 5) % 7) - 3)
      blobs.push(part(ico, y, k % 2 ? shade : white))
    }
    const cloud = merge(blobs)
    cloud.computeBoundingBox()
    cloud.translate(0, -cloud.boundingBox!.min.y, 0)
    return cloud
  })
}

export function propMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    flatShading: true,
  })
}

export function cloudMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    emissive: new THREE.Color(0x9aa4b4),
  })
}
