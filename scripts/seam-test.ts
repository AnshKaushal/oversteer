/**
 * Raycast cars lean on one ray per wheel, so a ray that slips through a trimesh seam or reports a
 * flipped normal at an edge shows up as a dropped wheel or a kick. This casts rays down across a
 * rolling trimesh (including exactly along its edges and through its vertices) and checks that
 * every ray hits, normals point up, and neighbouring normals never jump more than the surface's
 * own crease angle.
 */
import { initPhysics } from "../src/mainview/physics/core/PhysicsSystem"

const RAPIER = await initPhysics()
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })

const N = 24
const CELL = 1.5
const height = (x: number, z: number) => 0.35 * Math.sin(x * 0.45) * Math.cos(z * 0.38) + 0.002 * x
const verts = new Float32Array((N + 1) * (N + 1) * 3)
for (let i = 0; i <= N; i++) {
  for (let j = 0; j <= N; j++) {
    const x = i * CELL
    const z = j * CELL
    verts.set([x, height(x, z), z], (i * (N + 1) + j) * 3)
  }
}
const idx: number[] = []
for (let i = 0; i < N; i++) {
  for (let j = 0; j < N; j++) {
    const a = i * (N + 1) + j
    const b = a + 1
    const c = a + N + 1
    const d = c + 1
    idx.push(a, b, c, b, d, c)
  }
}
world.createCollider(RAPIER.ColliderDesc.trimesh(verts, new Uint32Array(idx)))
world.step()

let fails = 0
function check(name: string, ok: boolean, detail = "") {
  if (!ok) fails++
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${detail}` : ""}`)
}

function cast(x: number, z: number) {
  const ray = new RAPIER.Ray({ x, y: 5, z }, { x: 0, y: -1, z: 0 })
  return world.castRayAndGetNormal(ray, 10, true)
}

const angle = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.acos(Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z)))

// sweep lines: across cells, along a grid line (every ray on an edge), along a diagonal (every ray on an edge too)
const lines: { name: string; at: (t: number) => [number, number] }[] = [
  { name: "across cells", at: (t) => [3 + t, 7.37] },
  { name: "along a grid line", at: (t) => [3 + t, 6 * CELL] },
  { name: "along the cell diagonal", at: (t) => [3 * CELL + t, 4 * CELL + t] },
  { name: "along the other grid axis", at: (t) => [9 * CELL, 3 + t] },
]
const step = 0.002
for (const line of lines) {
  let misses = 0
  let flips = 0
  let maxJump = 0
  let prev: { x: number; y: number; z: number } | null = null
  let maxHeightErr = 0
  for (let t = 0; t < 12; t += step) {
    const [x, z] = line.at(t)
    const hit = cast(x, z) as { timeOfImpact: number; normal: { x: number; y: number; z: number } } | null
    if (!hit) {
      misses++
      continue
    }
    if (hit.normal.y < 0.5) flips++
    if (prev) maxJump = Math.max(maxJump, angle(prev, hit.normal))
    prev = hit.normal
    maxHeightErr = Math.max(maxHeightErr, Math.abs(5 - hit.timeOfImpact - height(x, z)))
  }
  check(`seam ${line.name}: every ray hits`, misses === 0, `${misses} misses`)
  check(`seam ${line.name}: normals point up`, flips === 0, `${flips} flipped`)
  check(`seam ${line.name}: normals change by no more than the crease angle`, maxJump < 0.25, `max jump ${((maxJump * 180) / Math.PI).toFixed(1)} deg`)
  check(`seam ${line.name}: height stays on the surface`, maxHeightErr < 0.05, `${maxHeightErr.toFixed(3)} m off`)
}

// rays through every vertex
let vertexMisses = 0
for (let i = 1; i < N; i++) {
  for (let j = 1; j < N; j++) {
    if (!cast(i * CELL, j * CELL)) vertexMisses++
  }
}
check("seam: rays through every vertex hit", vertexMisses === 0, `${vertexMisses} misses`)

console.log(fails === 0 ? "ALL SEAM CHECKS PASSED" : `${fails} SEAM CHECKS FAILED`)
process.exit(fails === 0 ? 0 : 1)
