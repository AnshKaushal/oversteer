import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { SimplifyModifier } from "three/addons/modifiers/SimplifyModifier.js"
import type * as RAPIER from "@dimforge/rapier3d-compat"
import {
  CLOUD_NODES,
  TREE_NODES,
  bakeInstanced,
} from "../../systems/WorldManager"
import { makeHillGeometry, sampleSurface } from "../../systems/Hills"
import {
  USE_CUSTOM_PROPS,
  cloudMaterial,
  makeCloudGeometries,
  makeTreeFarGeometry,
  makeTreeGeometries,
  propMaterial,
} from "../../systems/lowPolyProps"
import { mulberry32 } from "./config"
import type { Track } from "./Track"

export interface Proto {
  geometry: THREE.BufferGeometry
  material: THREE.Material | THREE.Material[]
  lod?: THREE.BufferGeometry
  far?: THREE.BufferGeometry
}

export interface PropKit {
  trees: Proto[]
  clouds: Proto[]
}

const kitCache = new Map<string, Promise<PropKit | null>>()

export function loadPropKit(baseUrl: string): Promise<PropKit | null> {
  let p = kitCache.get(baseUrl)
  if (!p) {
    p = bakePropKit(baseUrl)
    kitCache.set(baseUrl, p)
  }
  return p
}

async function bakePropKit(baseUrl: string): Promise<PropKit | null> {
  if (USE_CUSTOM_PROPS) {
    const mat = propMaterial()
    const wrap = (gs: THREE.BufferGeometry[]): Proto[] =>
      gs.map((geometry) => ({
        geometry,
        material: mat,
        far: makeTreeFarGeometry(),
      }))
    return {
      trees: wrap(makeTreeGeometries()),
      clouds: makeCloudGeometries().map((geometry) => ({
        geometry,
        material: cloudMaterial(),
      })),
    }
  }
  try {
    const glb = await new GLTFLoader().loadAsync(
      `${baseUrl}models/low_poly_tree_pack.glb`,
    )
    const root = glb.scene
    root.updateMatrixWorld(true)
    const byName = new Map<string, THREE.Object3D>()
    root.traverse((o) => byName.set(o.name, o))
    const simplifier = new SimplifyModifier()
    const bake = async (
      names: string[],
      targetH: number,
      lod = false,
    ): Promise<Proto[]> => {
      const out: Proto[] = []
      for (const n of names) {
        const node = byName.get(n)
        if (!node) continue
        node.updateMatrixWorld(true)
        const im = bakeInstanced(node, 1, targetH)
        if (im) {
          const g = im.geometry
          const tris =
            (g.index ? g.index.count : g.attributes.position.count) / 3
          let low: THREE.BufferGeometry | undefined
          if (lod && tris > 1500) {
            try {
              low = await simplifier.modify(
                g,
                Math.floor(g.attributes.position.count * 0.88),
              )
            } catch (e) {
              console.warn("tree LOD failed", e)
            }
          }
          out.push({ geometry: g, material: im.material, lod: low })
        }
      }
      return out
    }
    const trees = await bake(TREE_NODES, 6.5, true)
    const clouds = await bake(CLOUD_NODES, 14)
    return trees.length ? { trees, clouds } : null
  } catch (e) {
    console.warn("low_poly_tree_pack.glb failed to load", e)
    return null
  }
}

export interface HillPlacement {
  mesh: THREE.Mesh
  radius: number
  height: number
}

const hillMaterial = () =>
  new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    flatShading: true,
  })

function trackDist(track: Track, x: number, z: number): number {
  let best = Infinity
  for (let i = 0; i < track.xs.length; i++) {
    const d = (track.xs[i] - x) ** 2 + (track.zs[i] - z) ** 2
    if (d < best) best = d
  }
  return Math.sqrt(best)
}

export function buildHills(
  group: THREE.Group,
  track: Track,
  kit: PropKit | null,
  count: number,
): { hills: HillPlacement[]; dress: THREE.Mesh[] } {
  const cfg = track.config
  const rng = mulberry32(cfg.seed * 31 + 5)
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity
  for (let i = 0; i < track.xs.length; i++) {
    minX = Math.min(minX, track.xs[i])
    maxX = Math.max(maxX, track.xs[i])
    minZ = Math.min(minZ, track.zs[i])
    maxZ = Math.max(maxZ, track.zs[i])
  }
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const reach = Math.hypot(maxX - minX, maxZ - minZ) / 2
  const base = cfg.widthM / 2 + cfg.runoffM + cfg.treeBandM + 30
  const mat = hillMaterial()
  const hills: HillPlacement[] = []
  const dress: THREE.Mesh[] = []
  for (let i = 0; i < count; i++) {
    const far = i % 3 === 2
    const radius = far ? 120 + rng() * 100 : 35 + rng() * 35
    const height = Math.min(
      far ? 80 + rng() * 80 : 15 + rng() * 30,
      radius * 0.32,
    )
    const ang = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.5
    const dx = Math.cos(ang)
    const dz = Math.sin(ang)
    const need = base + radius * 1.15
    const clearAt = (r: number) => {
      const x = cx + dx * r
      const z = cz + dz * r
      return trackDist(track, x, z) > need
    }
    let r = 40
    while (r < reach + 6000 && !clearAt(r)) r += 25
    r += far ? 60 + rng() * 150 : rng() * 80
    while (r < reach + 6000 && !clearAt(r)) r += 25
    const x = cx + dx * r
    const z = cz + dz * r
    const seed = i * 311 + 3 + cfg.seed
    const mesh = new THREE.Mesh(makeHillGeometry(radius, height, seed), mat)
    mesh.rotation.y = rng() * Math.PI * 2
    mesh.position.set(x, 0, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    hills.push({ mesh, radius, height })
    if (kit && kit.trees.length) {
      const n = radius > 90 ? 10 : 20
      const spots = sampleSurface(mesh.geometry, seed, n)
      const up = new THREE.Vector3(0, 1, 0)
      const q = new THREE.Quaternion()
      const qy = new THREE.Quaternion()
      spots.forEach((s, k) => {
        if (s.nrm.y < 0.55 || rng() < 0.4) return
        const pv = kit.trees[Math.floor(rng() * kit.trees.length)]
        const m = new THREE.Mesh(pv.geometry, pv.material)
        m.castShadow = true
        q.setFromUnitVectors(up, s.nrm)
        qy.setFromAxisAngle(up, rng() * Math.PI * 2)
        q.premultiply(qy)
        m.quaternion.copy(q)
        m.position.copy(s.pos).addScaledVector(s.nrm, -0.15)
        m.scale.setScalar(1.6 + rng() * 1.2)
        m.userData.vegRank = rng()
        m.userData.k = k
        mesh.add(m)
        dress.push(m)
      })
    }
  }
  return { hills, dress }
}

export function hillColliders(
  R: typeof RAPIER,
  world: RAPIER.World,
  hills: HillPlacement[],
) {
  const body = world.createRigidBody(R.RigidBodyDesc.fixed())
  for (const h of hills) {
    h.mesh.updateMatrixWorld(true)
    const g = h.mesh.geometry
    const pos = g.getAttribute("position") as THREE.BufferAttribute
    const idx = g.getIndex()
    if (!idx) continue
    const v = new THREE.Vector3()
    const verts = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(h.mesh.matrixWorld)
      verts[i * 3] = v.x
      verts[i * 3 + 1] = v.y
      verts[i * 3 + 2] = v.z
    }
    const indices = new Uint32Array(idx.array as ArrayLike<number>)
    world.createCollider(
      R.ColliderDesc.trimesh(verts, indices).setFriction(0.9).setRestitution(0),
      body,
    )
  }
}

export function buildClouds(
  group: THREE.Group,
  track: Track,
  kit: PropKit,
  count: number,
): THREE.InstancedMesh[] {
  if (!kit.clouds.length) return []
  const rng = mulberry32(track.config.seed * 17 + 9)
  let sx = 0,
    sz = 0
  for (let i = 0; i < track.xs.length; i++) {
    sx += track.xs[i]
    sz += track.zs[i]
  }
  sx /= track.xs.length
  sz /= track.xs.length
  const spread = track.lengthM / 4 + 700
  const per = kit.clouds.map(() => [] as THREE.Matrix4[])
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2
    const d = Math.sqrt(rng()) * spread
    const sc = 2.5 + rng() * 3.5
    e.set(0, rng() * Math.PI * 2, 0)
    q.setFromEuler(e)
    per[i % per.length].push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(
          sx + Math.cos(a) * d,
          110 + rng() * 70,
          sz + Math.sin(a) * d,
        ),
        q,
        new THREE.Vector3(sc, sc * 0.8, sc),
      ),
    )
  }
  const out: THREE.InstancedMesh[] = []
  kit.clouds.forEach((p, i) => {
    const ms = per[i]
    if (!ms.length) return
    const im = new THREE.InstancedMesh(p.geometry, p.material, ms.length)
    ms.forEach((m, k) => im.setMatrixAt(k, m))
    im.instanceMatrix.needsUpdate = true
    im.frustumCulled = false
    group.add(im)
    out.push(im)
  })
  return out
}
