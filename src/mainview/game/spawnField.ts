import type { RaceDriver } from "../systems/AIDriver"
import type { DriveInput } from "../systems/InputManager"
import * as THREE from "three"
import { createChassisBody } from "../physics/core/PhysicsSystem"
import { Vehicle } from "../physics/vehicle/Vehicle"
import { isLowLight } from "../constants/timeOfDay"
import { CarVisual } from "../systems/CarVisual"
import {
  AIDriver,
  holdInput,
  makeProfile,
  makeTrafficProfile,
} from "../systems/AIDriver"
import { colorHex, rivalColor } from "../systems/carTint"
import { trafficCountFor } from "../systems/RaceTypes"
import { CARS } from "../data/cars"

export interface Rival {
  car: Vehicle
  visual: CarVisual
  ai: RaceDriver
  name: string
  color: string
  progress: number
  finished: boolean
  finishTime: number | null
  stuckT: number
  cached: DriveInput
  stride: number
  edgeArmed: boolean
  brake: number
  hi: boolean
}

export interface SpawnEnv {
  R: any
  setup: any
  activeRivalsRef: any
  activeTrafficRef: any
  aiSlotOf: any
  baseUrl: any
  gridCount: any
  gridSlot: any
  isNetRace: any
  lin: any
  map: any
  placeAt: any
  poolRef: any
  raceActiveInit: any
  rivalCount: any
  scene: any
  startedRef: any
  timeOfDayRef: any
  trafficRef: any
  world: any
}

export async function spawnField(env: SpawnEnv) {
  const {
    R,
    setup,
    activeRivalsRef,
    activeTrafficRef,
    aiSlotOf,
    baseUrl,
    gridCount,
    gridSlot,
    isNetRace,
    lin,
    map,
    placeAt,
    poolRef,
    raceActiveInit,
    rivalCount,
    scene,
    startedRef,
    timeOfDayRef,
    trafficRef,
    world,
  } = env
  const rivals: Rival[] = []
  const useSharedField = isNetRace && setup?.seed != null
  const poolIds = useSharedField
    ? CARS.map((c) => c.id)
    : poolRef.current.length
      ? poolRef.current
      : CARS.map((c) => c.id)
  const poolDefs = CARS.filter((c) => poolIds.includes(c.id))
  const gridPool = poolDefs.length > 0 ? poolDefs : [...CARS]
  let rand: () => number = Math.random
  if (useSharedField) {
    let s = setup!.seed! | 0 || 1
    rand = () => {
      s |= 0
      s = (s + 0x6d2b79f5) | 0
      let t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  for (let i = gridPool.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0
    const tmp = gridPool[i]
    gridPool[i] = gridPool[j]
    gridPool[j] = tmp
  }
  const rivalCounts = new Map<string, number>()
  for (let i = 0; i < rivalCount; i++) {
    const rivalDef = gridPool[i % gridPool.length]
    const seen = (rivalCounts.get(rivalDef.id) ?? 0) + 1
    rivalCounts.set(rivalDef.id, seen)
    const slot = aiSlotOf(i)
    const g = gridSlot(slot, gridCount)
    const s0 = g.s
    const rpl = map.circuit
      ? placeAt(s0, g.lateral)
      : (() => {
          const nx = Math.cos(lin.yaw(s0))
          const nz = Math.sin(lin.yaw(s0))
          return {
            x: lin.centerX(s0) + nx * g.lateral,
            z: -s0 + nz * g.lateral,
            yaw: lin.dirYaw(s0),
          }
        })()
    const yaw = rpl.yaw
    const rb = createChassisBody(world, rpl.x, 0.72, rpl.z, rivalDef.physics)
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0))
    rb.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
    const rc = new Vehicle(
      world,
      rb,
      R,
      rivalDef.physics,
      rivalDef.wheels,
      rivalDef.dash,
    )
    rc.tractionControlOn = true
    rc.stabilityControlOn = true
    rc.abs.enabled = true
    const color = rivalColor(i)
    const vis = new CarVisual()
    vis.castShadow = true
    try {
      await vis.load(baseUrl, color, {
        modelFile: rivalDef.modelFile,
        targetLength: rivalDef.physics.dimensions.length,
        pivots: rivalDef.pivots,
        wheelSpots: rivalDef.wheels,
        wheelRadius: rivalDef.physics.wheels.radius,
        paintMatch: rivalDef.paintMatch,
        tailLampMeshes: rivalDef.tailLampMeshes,
        paintTexture: rivalDef.paintTexture,
        headBeams: true,
      })
    } catch (e) {
      console.warn("rival model failed", e)
    }
    vis.setHeadlights(isLowLight(timeOfDayRef.current))
    scene.add(vis.group)
    rivals.push({
      car: rc,
      visual: vis,
      ai: map.rivalDriver
        ? map.rivalDriver(makeProfile(i))
        : new AIDriver(makeProfile(i), lin),
      name: `${rivalDef.shortName} ${seen}`,
      color: colorHex(color),
      progress: map.circuit ? -12 + s0 : s0,
      finished: false,
      finishTime: null,
      stuckT: 0,
      cached: holdInput(),
      stride: 1,
      edgeArmed: false,
      brake: 0,
      hi: true,
    })
  }
  activeRivalsRef.current = rivals
  const trafficCars: Rival[] = []
  const trafficTarget =
    startedRef.current && !raceActiveInit && map.map.features.traffic
      ? trafficCountFor(trafficRef.current)
      : 0
  const placed: { s: number; half: 1 | -1 }[] = [
    { s: 0, half: 1 },
    { s: 0, half: -1 },
  ]
  for (let i = 0; i < trafficTarget; i++) {
    const def = CARS[(Math.random() * CARS.length) | 0]
    const tdir: 1 | -1 = Math.random() < 0.55 ? 1 : -1
    const thalf: 1 | -1 = tdir === 1 ? 1 : -1
    let ts0 = 0
    for (let attempt = 0; attempt < 8; attempt++) {
      const cand = (Math.random() < 0.5 ? -1 : 1) * (250 + Math.random() * 600)
      ts0 = cand
      const clash = placed.some(
        (q) => q.half === thalf && Math.abs(q.s - cand) < 18,
      )
      if (!clash) break
    }
    placed.push({ s: ts0, half: thalf })
    const tprof = makeTrafficProfile(Math.random, tdir)
    const tyaw = lin.dirYaw(ts0) + (tdir === 1 ? 0 : Math.PI)
    const tnx = Math.cos(lin.yaw(ts0))
    const tnz = Math.sin(lin.yaw(ts0))
    const tb = createChassisBody(
      world,
      lin.centerX(ts0) + tnx * tprof.laneBias,
      0.72,
      -ts0 + tnz * tprof.laneBias,
      def.physics,
    )
    const tq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, tyaw, 0))
    tb.setRotation({ x: tq.x, y: tq.y, z: tq.z, w: tq.w }, true)
    const tv0 = ((tprof.cruiseKmh ?? 100) / 3.6) * (0.9 + Math.random() * 0.15)
    const tslope = (lin.centerX(ts0 + 4) - lin.centerX(ts0 - 4)) / 8
    const tinv = 1 / Math.hypot(tslope, 1)
    tb.setLinvel(
      { x: tslope * tinv * tv0 * tdir, y: 0, z: -tinv * tv0 * tdir },
      true,
    )
    const tc = new Vehicle(world, tb, R, def.physics, def.wheels, def.dash)
    tc.tractionControlOn = true
    tc.stabilityControlOn = true
    tc.abs.enabled = true
    const tcolor = rivalColor((Math.random() * 64) | 0)
    const tvis = new CarVisual()
    tvis.castShadow = true
    try {
      await tvis.load(baseUrl, tcolor, {
        modelFile: def.modelFile,
        targetLength: def.physics.dimensions.length,
        pivots: def.pivots,
        wheelSpots: def.wheels,
        wheelRadius: def.physics.wheels.radius,
        paintMatch: def.paintMatch,
        tailLampMeshes: def.tailLampMeshes,
        paintTexture: def.paintTexture,
      })
    } catch (e) {
      console.warn("traffic model failed", e)
    }
    tvis.setHeadlights(isLowLight(timeOfDayRef.current))
    scene.add(tvis.group)
    trafficCars.push({
      car: tc,
      visual: tvis,
      ai: new AIDriver(tprof, lin),
      name: def.shortName,
      color: colorHex(tcolor),
      progress: ts0,
      finished: false,
      finishTime: null,
      stuckT: 0,
      cached: holdInput(),
      stride: 1,
      edgeArmed: false,
      brake: 0,
      hi: true,
    })
  }
  activeTrafficRef.current = trafficCars
  return { rivals, trafficCars }
}
