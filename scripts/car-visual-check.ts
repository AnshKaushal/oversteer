import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import * as THREE from "three"
import { MIN_PIVOT_FRAC, pivotMatches } from "../src/mainview/systems/CarVisual"
import { getCar } from "../src/mainview/data/cars"

const id = process.argv[2] ?? "porsche-911-turbo-s"
const def = getCar(id)
const file = def.modelFile.split("/").pop()!

const buf = await Bun.file(`src/mainview/models/${file}`).arrayBuffer()
const gltf: any = await new GLTFLoader().parseAsync(buf, "")
const model = gltf.scene as THREE.Object3D

const box = new THREE.Box3().setFromObject(model)
const size = box.getSize(new THREE.Vector3())
const longest = Math.max(size.x, size.y, size.z)
const targetLen = def.physics.dimensions.length
const s = targetLen / longest
model.scale.multiplyScalar(s)

let boxA = new THREE.Box3().setFromObject(model)
const sx0 = boxA.max.x - boxA.min.x
const sz0 = boxA.max.z - boxA.min.z
const alignYaw = sx0 > sz0 ? Math.PI / 2 : 0
model.rotation.y = alignYaw + Math.PI
boxA = new THREE.Box3().setFromObject(model)
model.position.x -= (boxA.min.x + boxA.max.x) / 2
model.position.z -= (boxA.min.z + boxA.max.z) / 2
model.position.y -= boxA.min.y
model.updateMatrixWorld(true)

const group = new THREE.Group()
group.add(model)
group.updateMatrixWorld(true)

const finalBox = new THREE.Box3().setFromObject(group)
const finalSize = finalBox.getSize(new THREE.Vector3())
const center = finalBox.getCenter(new THREE.Vector3())
console.log(`${def.id} (${file})`)
console.log(
  `  scaled by ${s.toFixed(4)}  bbox ${finalSize
    .toArray()
    .map((n) => n.toFixed(3))
    .join(" x ")}  min y ${finalBox.min.y.toFixed(3)}`,
)

const minPivot = longest * s * MIN_PIVOT_FRAC
const found: {
  name: string
  x: number
  z: number
  front: boolean
  left: boolean
}[] = []
model.traverse((o: any) => {
  if (o.isMesh || !o.children.length) return
  if (!pivotMatches(o.name, def.pivots)) return
  const b = new THREE.Box3().setFromObject(o)
  const ps = b.getSize(new THREE.Vector3())
  if (ps.x < minPivot || ps.y < minPivot || ps.z < minPivot) {
    return
  }
  const c = b.getCenter(new THREE.Vector3())
  group.worldToLocal(c)
  found.push({ name: o.name, x: c.x, z: c.z, front: c.z < 0, left: c.x < 0 })
})
console.log(`  pivots: ${found.length} (need exactly 4)`)
for (const f of found) {
  console.log(
    `    ${f.name.padEnd(10)} x=${f.x.toFixed(3).padStart(7)} z=${f.z.toFixed(3).padStart(7)}  ${f.front ? "front" : "rear "} ${f.left ? "left " : "right"}`,
  )
}

const reg = def.wheels
  .map((w) => `${w.front ? "F" : "R"}${w.left ? "L" : "R"}`)
  .sort()
const piv = found
  .map((f) => `${f.front ? "F" : "R"}${f.left ? "L" : "R"}`)
  .sort()
console.log(
  `  registry ${reg.join(",")} vs pivots ${piv.join(",")} — ${
    reg.join() === piv.join() ? "MATCH" : "MISMATCH"
  }`,
)
for (const w of def.wheels) {
  const near = found.find((f) => f.front === w.front && f.left === w.left)
  if (!near) continue
  const dx = near.x - w.x
  const dz = near.z - w.z
  const ok = Math.abs(dx) < 0.05 && Math.abs(dz) < 0.05
  console.log(
    `    ${w.front ? "F" : "R"}${w.left ? "L" : "R"} registry(${w.x}, ${w.z}) vs pivot(${near.x.toFixed(3)}, ${near.z.toFixed(3)}) ${ok ? "ok" : "OFF"}`,
  )
}

const nose = new THREE.Vector3(0, 0, 1).applyAxisAngle(
  new THREE.Vector3(0, 1, 0),
  model.rotation.y,
)
console.log(
  `  nose (local +Z after the runtime yaw): ${nose
    .toArray()
    .map((n) => n.toFixed(2))
    .join(", ")} — ${
    nose.z < 0 ? "faces the driving direction" : "FACES THE WRONG WAY"
  }`,
)
