import { createMap, type LinearRoad } from "../maps"
import type { CarDefinition } from "../data/schema"
import type { MultiplayerManager } from "../systems/net/MultiplayerManager"
import type { SessionCtx } from "./sessionCtx"
import * as THREE from "three"
import { createChassisBody } from "../physics/core/PhysicsSystem"
import { Vehicle } from "../physics/vehicle/Vehicle"
import { carProgress } from "../systems/AIDriver"
import type * as RAPIER from "@dimforge/rapier3d-compat"
import { WORLD_CONFIG } from "../constants/world"

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface buildRaceSetupEnv {
  R: typeof RAPIER
  lin: LinearRoad
  map: ReturnType<typeof createMap>
  net: MultiplayerManager | null
  playerDef: CarDefinition
  prevOrderRef: SessionCtx["prevOrderRef"]
  raceSetupRef: SessionCtx["raceSetupRef"]
  scene: THREE.Scene
  world: RAPIER.World
}

export function buildRaceSetup(env: buildRaceSetupEnv) {
  const {
    R,
    lin,
    map,
    net,
    playerDef,
    prevOrderRef,
    raceSetupRef,
    scene,
    world,
  } = env
  const setup = raceSetupRef.current
  const racesOk = map.map.features.races
  const rivalCount = racesOk ? (setup?.rivals ?? 0) : 0
  const circuitLen = map.circuit?.lengthM ?? 0
  const raceDistance = !racesOk
    ? 0
    : map.circuit && (setup?.distanceM ?? 0) > 0
      ? Math.max(1, Math.round(setup!.distanceM / 1000)) * circuitLen
      : (setup?.distanceM ?? 0)
  const progressMap = new Map<unknown, (x: number, z: number) => number>()
  const progressOf = (b: RAPIER.RigidBody): number => {
    if (!map.circuit) return carProgress(b)
    let f = progressMap.get(b)
    if (!f) {
      f = map.circuit.progressTracker()
      progressMap.set(b, f)
    }
    const tr = b.translation()
    return f(tr.x, tr.z)
  }
  const placeAt = (s: number, lateral: number) => {
    if (map.circuit) {
      const pz = map.road.spawnPose(-12 + s, lateral)
      return { x: pz.x, z: pz.z, yaw: pz.yaw }
    }
    const nx = Math.cos(lin.yaw(s))
    const nz = Math.sin(lin.yaw(s))
    return {
      x: lin.centerX(s) + nx * lateral,
      z: -s + nz * lateral,
      yaw: lin.dirYaw(s),
    }
  }
  const isNetRace = !!(net && net.roomId && raceDistance > 0)
  const netPeerCount = net?.peers.size ?? 0
  const netIds =
    racesOk && net && net.roomId
      ? [net.localId, ...Array.from(net.peers.keys())].sort()
      : null
  const netIndex = net && netIds ? Math.max(0, netIds.indexOf(net.localId)) : 0
  const netTotal = netIds ? netIds.length : 1
  const gridCount = 1 + rivalCount + (isNetRace ? netPeerCount : 0)
  const raceActiveInit = rivalCount > 0 || isNetRace
  if (raceActiveInit && !map.circuit) {
    const fc = document.createElement("canvas")
    fc.width = 128
    fc.height = 32
    const fg = fc.getContext("2d")!
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 8; x++) {
        fg.fillStyle = (x + y) % 2 === 0 ? "#141414" : "#f2f2f2"
        fg.fillRect(x * 16, y * 16, 16, 16)
      }
    }
    const finishTex = new THREE.CanvasTexture(fc)
    finishTex.colorSpace = THREE.SRGBColorSpace
    finishTex.anisotropy = 4
    const stripGeo = new THREE.PlaneGeometry(WORLD_CONFIG.road.width, 3)
    stripGeo.rotateX(-Math.PI / 2)
    const strip = new THREE.Mesh(
      stripGeo,
      new THREE.MeshBasicMaterial({ map: finishTex }),
    )
    strip.position.set(lin.centerX(raceDistance), 0.04, -raceDistance)
    strip.rotation.y = lin.dirYaw(raceDistance)
    scene.add(strip)
  }
  const gridSlot = (slot: number, total: number) => {
    const row = Math.floor(slot / 2)
    const loneLast = total % 2 === 1 && slot === total - 1
    const left = slot % 2 === 0
    return { s: -row * 7.5, lateral: loneLast ? 0 : left ? -3.0 : 3.0 }
  }
  const prev = prevOrderRef.current
  let playerSlotIdx = 0
  let aiSlotOf: (ai: number) => number = (ai) => ai + 1
  if (isNetRace && net) {
    playerSlotIdx = netIndex
    aiSlotOf = (ai) => netTotal + ai
  } else if (raceActiveInit && prev && prev.length > 0) {
    const pos = new Map<number, number>()
    prev.forEach((ai, i) => pos.set(ai, i))
    const aiByMerit = [...Array(rivalCount).keys()].sort(
      (a, b) => (pos.get(a) ?? 1e9) - (pos.get(b) ?? 1e9),
    )
    playerSlotIdx = Math.floor(Math.random() * gridCount)
    const free = [...Array(gridCount).keys()].filter((s) => s !== playerSlotIdx)
    const slotMap = new Map<number, number>()
    aiByMerit.forEach((ai, i) => slotMap.set(ai, free[i]))
    aiSlotOf = (ai) => slotMap.get(ai) ?? ai + 1
  }
  const playerSlot = raceActiveInit
    ? gridSlot(playerSlotIdx, gridCount)
    : netIds
      ? gridSlot(netIndex, Math.max(netTotal, 2))
      : { s: 0, lateral: 0 }
  const spawned = raceActiveInit || !!netIds
  const spawnP = map.circuit
    ? placeAt(spawned ? playerSlot.s : 0, spawned ? playerSlot.lateral : 0)
    : null
  const yaw0 = spawnP ? spawnP.yaw : lin.dirYaw(0)
  const nx0 = spawnP ? 0 : Math.cos(lin.yaw(0))
  const nz0 = spawnP ? 0 : Math.sin(lin.yaw(0))
  const playerX = spawnP
    ? spawnP.x
    : spawned
      ? lin.centerX(playerSlot.s) + nx0 * playerSlot.lateral
      : lin.centerX(0)
  const playerZ = spawnP
    ? spawnP.z
    : spawned
      ? -playerSlot.s + nz0 * playerSlot.lateral
      : 0
  const startX = playerX
  const body = createChassisBody(
    world,
    playerX,
    0.72,
    playerZ,
    playerDef.physics,
  )
  const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw0, 0))
  body.setRotation({ x: q0.x, y: q0.y, z: q0.z, w: q0.w }, true)
  const car = new Vehicle(
    world,
    body,
    R,
    playerDef.physics,
    playerDef.wheels,
    playerDef.dash,
  )

  return {
    setup,
    rivalCount,
    raceDistance,
    progressOf,
    placeAt,
    isNetRace,
    gridCount,
    raceActiveInit,
    gridSlot,
    aiSlotOf,
    playerX,
    playerZ,
    startX,
    body,
    car,
  }
}
