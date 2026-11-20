import * as THREE from "three"

export function chunkGeometry(
  src: THREE.BufferGeometry,
  cellM = 160,
): THREE.BufferGeometry[] {
  const index = src.getIndex()
  const pos = src.getAttribute("position")
  if (!index) return [src]
  const cells = new Map<string, number[]>()
  const ia = index.array
  for (let i = 0; i < ia.length; i += 3) {
    const a = ia[i],
      b = ia[i + 1],
      c = ia[i + 2]
    const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3
    const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3
    const key = `${Math.floor(cx / cellM)},${Math.floor(cz / cellM)}`
    let list = cells.get(key)
    if (!list) cells.set(key, (list = []))
    list.push(a, b, c)
  }
  if (cells.size <= 1) return [src]
  const out: THREE.BufferGeometry[] = []
  for (const tris of cells.values()) {
    const g = new THREE.BufferGeometry()
    for (const name of Object.keys(src.attributes))
      g.setAttribute(name, src.getAttribute(name))
    g.setIndex(
      new THREE.BufferAttribute(
        tris.length > 65535 ? new Uint32Array(tris) : new Uint16Array(tris),
        1,
      ),
    )
    g.computeBoundingSphere()
    g.computeBoundingBox()
    out.push(g)
  }
  return out
}

export function freezeStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  root.traverse((o) => {
    o.matrixAutoUpdate = false
  })
}
