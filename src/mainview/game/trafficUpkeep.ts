import type { SessionCtx } from "./sessionCtx"
import * as THREE from "three"
import { spike } from "../diagnostics/SpikeLog"
import { Vehicle } from "../physics/vehicle/Vehicle"
import { type LinearRoad } from "../maps"
import { CarVisual } from "../systems/CarVisual"
import { AIDriver, makeTrafficProfile } from "../systems/AIDriver"
import { shadowRange2 } from "../app/helpers"
import type { Rival } from "./spawnField"

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface TrafficEnv {
  trafficCars: Rival[]
  wm: any
  lin: LinearRoad
  settingsRef: SessionCtx["settingsRef"]
  syncVisual: (vis: CarVisual, c: Vehicle, dt: number) => void
  behind: number
  ahead: number
}

/** Keeps NPC traffic alive: recycles cars that fall behind / get stuck and sets per-car LOD + shadows. */
export class TrafficUpkeep {
  private shadowAcc = 0
  constructor(private env: TrafficEnv) {}

  update(dt: number, bp: { x: number; y: number; z: number }) {
    const { trafficCars, wm, lin, settingsRef, syncVisual } = this.env
    const TRAFFIC_BEHIND = this.env.behind
    const TRAFFIC_AHEAD = this.env.ahead
    const playerS = -bp.z
    for (const tc of trafficCars) {
      const tp = tc.car.body.translation()
      const tS = -tp.z
      const tdir = tc.ai.profile.dir ?? 1
      const trsp = tc.car.forwardSpeed
      if (Math.abs(trsp) < 1.0) tc.stuckT += dt
      else tc.stuckT = Math.max(0, tc.stuckT - dt * 3)
      if (
        tp.y < -3 ||
        tc.stuckT > 12 ||
        tS < playerS - TRAFFIC_BEHIND ||
        tS > playerS + TRAFFIC_AHEAD
      ) {
        tc.stuckT = 0
        spike.event("traffic respawn")
        const travelDir = wm.travelDir
        let aheadS = playerS + travelDir * 900
        const myHalf = tdir
        for (let a2 = 0; a2 < 8; a2++) {
          const base = tdir === 1 ? 900 : 500
          const cand = playerS + travelDir * (base + Math.random() * 400)
          aheadS = cand
          const clear = trafficCars.every((o) => {
            if (o === tc) return true
            const op = o.car.body.translation()
            const os = -op.z
            if ((o.ai.profile.dir ?? 1) !== myHalf) return true
            return Math.abs(os - cand) >= 35
          })
          if (clear) break
        }
        const ntprof = makeTrafficProfile(Math.random, tdir)
        const nyaw = lin.dirYaw(aheadS) + (tdir === 1 ? 0 : Math.PI)
        const nnx = Math.cos(lin.yaw(aheadS))
        const nnz = Math.sin(lin.yaw(aheadS))
        tc.car.reset(
          new THREE.Vector3(
            lin.centerX(aheadS) + nnx * ntprof.laneBias,
            0.72,
            -aheadS + nnz * ntprof.laneBias,
          ),
          nyaw,
        )
        const nv0 =
          ((ntprof.cruiseKmh ?? 100) / 3.6) * (0.9 + Math.random() * 0.15)
        const nslope = (lin.centerX(aheadS + 4) - lin.centerX(aheadS - 4)) / 8
        const ninv = 1 / Math.hypot(nslope, 1)
        tc.car.body.setLinvel(
          {
            x: nslope * ninv * nv0 * tdir,
            y: 0,
            z: -ninv * nv0 * tdir,
          },
          true,
        )
        tc.ai = new AIDriver(ntprof, lin)
        tc.visual.group.visible = true
      }
      if (tc.visual.group.visible) {
        syncVisual(tc.visual, tc.car, dt)
        tc.visual.setBrake(tc.brake)
      }
    }
    this.shadowAcc += dt
    if (this.shadowAcc > 0.25) {
      this.shadowAcc = 0
      const tranked = trafficCars
        .map((r, i) => {
          const rp = r.car.body.translation()
          const dx = rp.x - bp.x
          const dz = rp.z - bp.z
          return { i, d: dx * dx + dz * dz }
        })
        .sort((a, b) => a.d - b.d)
      for (const { i, d } of tranked) {
        const tc = trafficCars[i]
        tc.visual.setCastShadow(d < shadowRange2(settingsRef.current))

        if (d > 193600) {
          tc.visual.group.visible = false
        } else {
          tc.visual.group.visible = true
          const shouldBeHi = d < 36100
          if (tc.hi !== shouldBeHi) {
            tc.hi = shouldBeHi
            tc.visual.setDetail(shouldBeHi)
          }
        }
      }
    }
  }
}
