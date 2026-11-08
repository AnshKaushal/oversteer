import * as THREE from "three"

export function buildGear(
  model: THREE.Object3D,
  span: number,
  height: number,
  length: number,
  fitted = true,
) {
  const geoms: THREE.BufferGeometry[] = []
  const wheels: THREE.Mesh[] = []
  const tyre = new THREE.MeshStandardMaterial({
    color: 0x151515,
    roughness: 0.9,
  })
  const metal = new THREE.MeshStandardMaterial({
    color: 0x9a9fa6,
    roughness: 0.4,
    metalness: 0.6,
  })
  if (!fitted) {
    const none = new THREE.Group()
    none.visible = false
    return { group: none, geoms, wheels, mats: [tyre, metal], drop: 0, aft: 0 }
  }
  const big = span > 40
  const radius = Math.max(0.3, span * 0.012)
  const drop = radius * 2.4 + height * 0.01
  const group = new THREE.Group()
  group.position.y = -height / 2
  const aft = length * 0.06
  const track = span * (big ? 0.085 : 0.1)
  model.updateMatrixWorld(true)
  const ray = new THREE.Raycaster()
  const underside = (x: number, z: number) => {
    ray.set(new THREE.Vector3(x, -height * 2, z), new THREE.Vector3(0, 1, 0))
    const hit = ray.intersectObject(model, true)[0]
    return hit ? Math.max(0, hit.point.y + height / 2) + 0.15 : 0.3
  }
  const mainTop = underside(track, -aft)
  const bottom = mainTop - drop
  const leg = (x: number, z: number, pair: number, r: number) => {
    const top = Math.max(underside(x, z), bottom + r * 2)
    const thick = r * 0.7
    const gap = thick * 1.25
    const hubY = bottom * 1.25 + r
    const reach = top - hubY
    const strut = new THREE.CylinderGeometry(r * 0.2, r * 0.26, reach, 10)
    geoms.push(strut)
    const sm = new THREE.Mesh(strut, metal)
    sm.position.set(x, hubY + reach / 2, z)
    group.add(sm)
    if (pair > 1) {
      const ax = new THREE.CylinderGeometry(r * 0.14, r * 0.14, gap * pair, 8)
      ax.rotateZ(Math.PI / 2)
      geoms.push(ax)
      const am = new THREE.Mesh(ax, metal)
      am.position.set(x, hubY, z)
      group.add(am)
    }
    const tg = new THREE.CylinderGeometry(r, r, thick, 18)
    tg.rotateZ(Math.PI / 2)
    const hg = new THREE.CylinderGeometry(r * 0.55, r * 0.55, thick * 1.08, 12)
    hg.rotateZ(Math.PI / 2)
    geoms.push(tg, hg)
    for (let i = 0; i < pair; i++) {
      const w = new THREE.Mesh(tg, tyre)
      w.add(new THREE.Mesh(hg, metal))
      w.position.set(x + (i - (pair - 1) / 2) * gap, hubY, z)
      group.add(w)
      wheels.push(w)
    }
  }
  for (const side of [-1, 1]) leg(side * track, -aft, big ? 2 : 1, radius)
  leg(0, length * 0.32, big ? 2 : 1, radius * 0.8)
  return {
    group,
    geoms,
    wheels,
    mats: [tyre, metal],
    drop: drop - mainTop,
    aft,
  }
}
