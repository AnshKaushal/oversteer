import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js"
import * as THREE from "three"
import { readdirSync } from "node:fs"

const load = async (p: string) => {
  const l = new GLTFLoader()
  l.setMeshoptDecoder(MeshoptDecoder)
  return l.parseAsync(await Bun.file(p).arrayBuffer(), "")
}
let bad = 0
for (const f of readdirSync("src/mainview/models").filter((n) => n.endsWith(".glb"))) {
  const [a, b] = await Promise.all([
    load(`src/mainview/models/${f}`),
    load(`src/mainview/public/models/${f}`),
  ])
  const names = (g: any) => {
    const n: string[] = []
    g.scene.traverse((o: any) => n.push(o.name + ":" + (o.isMesh ? o.material.name : "")))
    return n.join("|")
  }
  const box = (g: any) => new THREE.Box3().setFromObject(g.scene)
  const ba = box(a), bb = box(b)
  const size = ba.getSize(new THREE.Vector3()).length()
  const err = Math.max(ba.min.distanceTo(bb.min), ba.max.distanceTo(bb.max)) / size
  const ok = names(a) === names(b) && err < 0.002
  if (!ok) bad++
  console.log(`${ok ? "ok " : "BAD"} ${f} boundsErr=${(err * 100).toFixed(4)}%`)
}
process.exit(bad ? 1 : 0)
