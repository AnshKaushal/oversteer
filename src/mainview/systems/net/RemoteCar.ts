import * as THREE from "three"
import type * as RAPIER from "@dimforge/rapier3d-compat"
import { CarVisual, type CarVisualOptions } from "../CarVisual"
import { createCabinCollider } from "../../physics/core/PhysicsSystem"
import type { CarPhysicsConfig } from "../../data/schema"
import type { TireSmoke } from "../TireSmoke"
import type { ValidatedState } from "./stateProtocol"
import type { PaintTextureRule } from "../carTint"
import {
  CORRECTION_ACCEL_MAX,
  CorrectionState,
  IMPACT_IMPULSE_THRESHOLD,
  RECOVER_CORR_MAX,
  RECOVER_WARP_M,
  SUPPORT_DESCENT_DY,
  clampCorrectionDelta,
} from "./correction"
import { NET } from "../../data/net"
import {
  SnapshotBuffer,
  newInterpTarget,
  type InterpMode,
} from "./SnapshotBuffer"
import {
  netDiagBufferReset,
  netDiagContact,
  netDiagCorrection,
  netDiagInterpSample,
  netDiagRemoteSample,
  netDiagSnap,
} from "./NetDiagnostics"

export interface RemoteCarOptions {
  modelFile: string
  physics: CarPhysicsConfig
  paintMatch?: string[]
  paintTexture?: PaintTextureRule
  pivots?: CarVisualOptions["pivots"]
  wheelSpots?: CarVisualOptions["wheelSpots"]
  startPlaced?: boolean
  stock?: boolean
}

function ghostMass(p: CarPhysicsConfig): number {
  const m = p.mass
  return (m.chassis + 2 * (m.frontWheel + m.rearWheel)) * NET.remote.massScale
}

const SOLID_GROUPS = 0xffffffff
const GHOST_GROUPS = 0x00010000
const REMOTE_DEFAULT_MODEL = "models/bmw_m3.glb"
const POS_GAIN = NET.remote.posGain
const CORRECTION_MAX = NET.remote.correctionMax
const MAX_DRIVE_SPEED = NET.remote.maxDriveSpeed
const MAX_DRIVE_ANGVEL = NET.remote.maxDriveAngVel
const WARP_DIST_SQ = NET.remote.warpDist ** 2

const _goal = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _qe = new THREE.Quaternion()
const _axis = new THREE.Vector3()
const _pos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _cn = { x: 0, y: 0, z: 0 }

export class RemoteCar {
  id: string
  name: string
  color: number
  visual: CarVisual
  colliderBody: RAPIER.RigidBody | null = null
  private world: RAPIER.World | null = null
  private collider: RAPIER.Collider | null = null
  private cabinCollider: RAPIER.Collider | null = null
  private placed = false
  private solid = false
  private rapier: typeof RAPIER | null = null

  public nowOverride: number | null = null
  private now() {
    return this.nowOverride ?? performance.now()
  }

  targetPos = new THREE.Vector3(0, 0.72, 0)
  targetQuat = new THREE.Quaternion()
  targetVel = new THREE.Vector3(0, 0, 0)

  steerAngle = 0
  wheelOmega = 0
  speed = 0
  private brakeTarget = 0
  smoke = false
  drift = false
  progress = 0
  finished = false
  finishTime: number | null = null

  lastPacketTime = 0
  hasReceivedPacket = false

  private interp = new SnapshotBuffer()
  private interpOut = newInterpTarget()
  private interpStats = { mode: "empty" as InterpMode, extrapMs: 0 }

  private corr = new CorrectionState()
  private lastCorr = { x: 0, y: 0, z: 0 }
  private appliedCorr = { x: 0, y: 0, z: 0 }
  private prevCorrMode = "follow"
  private corrCmdMag = 0
  private corrDeltaV = 0
  private errMag = 0

  private smokePosBuf: THREE.Vector3[] = []
  private scene: THREE.Scene | null = null
  private baseUrl = ""
  private modelFile: string
  private wheelRadius: number
  private targetLength: number
  private paintMatch: string[] | undefined
  private paintTexture: PaintTextureRule | undefined
  private pivots: CarVisualOptions["pivots"]
  private wheelSpots: CarVisualOptions["wheelSpots"]
  private stock = false

  constructor(
    id: string,
    name: string,
    color: number,
    scene: THREE.Scene,
    baseUrl: string,
    world: RAPIER.World | undefined,
    rapier: typeof RAPIER | undefined,
    opts: RemoteCarOptions,
  ) {
    this.wheelRadius = opts.physics.wheels.radius
    this.targetLength = opts.physics.dimensions.length
    this.id = id
    this.name = name
    this.color = color
    this.scene = scene
    this.baseUrl = baseUrl
    this.modelFile = opts.modelFile
    this.paintMatch = opts.paintMatch
    this.paintTexture = opts.paintTexture
    this.pivots = opts.pivots
    this.wheelSpots = opts.wheelSpots
    this.stock = opts.stock ?? false
    this.placed = opts.startPlaced ?? false
    this.solid = this.placed

    this.visual = new CarVisual()
    this.visual.castShadow = true

    this.loadVisual()

    this.world = world ?? null
    this.rapier = rapier ?? null
    if (world && rapier) {
      try {
        const phys = opts.physics
        const rc = phys.chassis
        const bodyDesc = rapier.RigidBodyDesc.dynamic()
          .setTranslation(0, 0.72, 0)
          .setLinvel(0, 0, 0)
          .setAngvel({ x: 0, y: 0, z: 0 })
          .setLinearDamping(rc.linearDamping)
          .setAngularDamping(rc.angularDamping)
          .setGravityScale(0)
          .setCanSleep(false)
          .setCcdEnabled(true)
        this.colliderBody = world.createRigidBody(bodyDesc)
        this.attachColliders(phys)
      } catch (e) {
        console.warn(`[RemoteCar] Failed to create body for ${name}:`, e)
        this.colliderBody = null
      }
    }
  }

  private attachColliders(phys: CarPhysicsConfig) {
    const world = this.world
    const body = this.colliderBody
    if (!world || !body) return
    const rapier = this.rapier
    if (!rapier) return
    const rc = phys.chassis
    const d = phys.dimensions
    const colDesc = rapier.ColliderDesc.cuboid(
      d.width / 2,
      d.height * rc.lower.halfHeightRatio,
      d.length / 2,
    )
      .setTranslation(0, rc.lower.offsetY, 0)
      .setMass(ghostMass(phys))
      .setFriction(rc.remote.friction)
      .setFrictionCombineRule(rapier.CoefficientCombineRule.Min)
      .setRestitution(rc.remote.restitution)
    this.collider = world.createCollider(colDesc, body)
    this.collider.setCollisionGroups(this.solid ? SOLID_GROUPS : GHOST_GROUPS)
    this.cabinCollider = world.createCollider(
      createCabinCollider(rapier, phys)
        .setDensity(0)
        .setFriction(rc.remote.friction)
        .setFrictionCombineRule(rapier.CoefficientCombineRule.Min)
        .setRestitution(rc.remote.restitution),
      body,
    )
    this.cabinCollider.setCollisionGroups(
      this.solid ? SOLID_GROUPS : GHOST_GROUPS,
    )
  }

  private rebuildColliders(phys: CarPhysicsConfig) {
    const world = this.world
    if (!world) return
    try {
      if (this.collider) world.removeCollider(this.collider, false)
      if (this.cabinCollider) world.removeCollider(this.cabinCollider, true)
    } catch {}
    this.collider = null
    this.cabinCollider = null
    this.attachColliders(phys)
  }

  private loadVisual() {
    const scene = this.scene
    const visual = this.visual
    visual
      .load(this.baseUrl, this.stock ? undefined : this.color, {
        modelFile: this.modelFile,
        targetLength: this.targetLength,
        pivots: this.pivots,
        wheelSpots: this.wheelSpots,
        wheelRadius: this.wheelRadius,
        paintMatch: this.paintMatch,
        paintTexture: this.paintTexture,
      })
      .then(() => {
        visual.setHeadlights(this.lightsOn)
        scene?.add(visual.group)
      })
      .catch((e) => {
        console.warn(
          `[RemoteCar] Failed to load visual model for ${this.name}:`,
          e,
        )
        scene?.add(visual.group)
      })
  }

  setModel(
    modelFile: string | undefined | null,
    ghost?: {
      paintMatch?: string[]
      paintTexture?: PaintTextureRule
      pivots?: CarVisualOptions["pivots"]
      wheelSpots?: CarVisualOptions["wheelSpots"]
      physics?: CarPhysicsConfig
    },
  ) {
    const next = modelFile || REMOTE_DEFAULT_MODEL
    if (next === this.modelFile) return
    this.modelFile = next
    this.paintMatch = ghost?.paintMatch
    this.paintTexture = ghost?.paintTexture
    this.pivots = ghost?.pivots
    this.wheelSpots = ghost?.wheelSpots
    if (ghost?.physics) {
      this.wheelRadius = ghost.physics.wheels.radius
      this.targetLength = ghost.physics.dimensions.length
      this.wheelOmegaIn = null
      this.compressionIn = null
      this.rebuildColliders(ghost.physics)
    }
    try {
      this.scene?.remove(this.visual.group)
    } catch {}
    this.visual = new CarVisual()
    this.visual.castShadow = true
    this.loadVisual()
  }

  private setUnplaced() {
    this.placed = false
    this.setSolid(false)
  }

  private setSolid(on: boolean) {
    this.solid = on
    const g = on ? SOLID_GROUPS : GHOST_GROUPS
    this.collider?.setCollisionGroups(g)
    this.cabinCollider?.setCollisionGroups(g)
  }

  private overlapsOthers(): boolean {
    const w = this.world
    const b = this.colliderBody
    const r = this.rapier
    const c = this.collider
    if (!w || !b || !r || !c) return false
    let hit = false
    try {
      const he = (c.shape as RAPIER.Cuboid).halfExtents
      const m = NET.remote.clearMargin
      const shape = new r.Cuboid(he.x + m, he.y + m, he.z + m)
      w.intersectionsWithShape(
        c.translation(),
        c.rotation(),
        shape,
        () => {
          hit = true
          return false
        },
        r.QueryFilterFlags.EXCLUDE_FIXED,
        undefined,
        undefined,
        b,
      )
    } catch {}
    return hit
  }

  delayMs: number = NET.interp.minDelayMs
  throttleIn = 0
  smokeLevel = 0
  private smokeAcc = 0
  private wheelOmegaIn: number[] | null = null
  private compressionIn: number[] | null = null

  onPacket(
    state: ValidatedState,
    timelineMs: number,
    arrivalMs: number = timelineMs,
  ) {
    this.lastPacketTime = arrivalMs
    this.interp.append(state, timelineMs, state.seq)
    this.steerAngle = state.steer
    this.brakeTarget = Math.max(state.brake, state.handbrake ? 1 : 0)
    this.throttleIn = state.throttle
    this.wheelOmegaIn = state.wheelOmega
    this.compressionIn = state.compression
    this.speed = state.speed
    this.smoke = state.smoke
    this.smokeLevel = state.smokeLevel
    this.drift = state.drift
    this.progress = state.progress
    this.hasReceivedPacket = true
  }

  resetInterpolation(reason: string) {
    if (reason === "session-start") this.setUnplaced()
    this.interp.reset()
    this.corr.reset()
    this.prevCorrMode = "follow"
    this.lastCorr.x = 0
    this.lastCorr.y = 0
    this.lastCorr.z = 0
    netDiagBufferReset(this.id, reason)
  }

  sampleContacts(nowMs?: number) {
    const now = nowMs ?? this.now()
    const w = this.world
    const c = this.collider
    if (!w || !c) return
    let touching = false
    let support = false
    let impulse = 0
    try {
      w.contactPairsWith(c, (other) => {
        try {
          w.contactPair(c, other, (manifold) => {
            try {
              if (manifold.numContacts() > 0) {
                _cn.x = 0
                _cn.y = 0
                _cn.z = 0
                let ny = 0
                try {
                  manifold.normal(_cn)
                  ny = _cn.y
                } catch {
                  ny = 0
                }
                if (Math.abs(ny) <= 0.7) {
                  touching = true
                  const n = manifold.numSolverContacts()
                  for (let i = 0; i < n; i++) {
                    impulse += Math.abs(manifold.contactImpulse(i))
                  }
                } else {
                  support = true
                }
              }
            } catch {}
          })
        } catch {}
      })
    } catch {
      return
    }
    this.corr.noteContact(touching, impulse, now)
    this.corr.noteSupport(support)
    netDiagContact(this.id, touching, impulse, this.corr.mode, support)
  }

  setPaint(paint: number | null) {
    const wantStock = paint === null
    if (wantStock !== this.stock) {
      this.stock = wantStock
      if (paint !== null) this.color = paint
      try {
        this.scene?.remove(this.visual.group)
      } catch {}
      this.visual = new CarVisual()
      this.visual.castShadow = true
      this.loadVisual()
      return
    }
    if (paint !== null) this.setColor(paint)
  }

  setColor(color: number) {
    this.color = color
    try {
      this.visual.setTint(color)
    } catch (e) {
      console.warn(`[RemoteCar] Retint failed for ${this.name}:`, e)
    }
  }

  /** Desired lamp state, re-applied whenever the visual (re)loads. */
  private lightsOn = false

  setHeadlights(on: boolean) {
    this.lightsOn = on
    this.visual.setHeadlights(on)
  }

  setNpcLightActive(active: boolean, intensityScale: number = 1.0) {
    this.visual.setNpcLightActive(active, intensityScale)
  }

  drive(dt: number) {
    const b = this.colliderBody
    if (!b || !this.hasReceivedPacket || dt <= 0) return

    const now = this.now()
    const mode = this.interp.sampleInto(
      this.interpOut,
      now - this.delayMs,
      this.interpStats,
    )
    netDiagInterpSample(
      this.id,
      mode,
      this.interp.size,
      this.interpStats.extrapMs,
      this.interp.underruns,
    )
    if (mode === "empty") return
    this.targetPos.set(this.interpOut.x, this.interpOut.y, this.interpOut.z)
    this.targetQuat.set(
      this.interpOut.qx,
      this.interpOut.qy,
      this.interpOut.qz,
      this.interpOut.qw,
    )
    this.targetVel.set(this.interpOut.vx, this.interpOut.vy, this.interpOut.vz)

    if (!this.placed) {
      try {
        b.setTranslation(
          { x: this.targetPos.x, y: this.targetPos.y, z: this.targetPos.z },
          true,
        )
        b.setRotation(
          {
            x: this.targetQuat.x,
            y: this.targetQuat.y,
            z: this.targetQuat.z,
            w: this.targetQuat.w,
          },
          true,
        )
        b.setLinvel({ x: 0, y: 0, z: 0 }, true)
        b.setAngvel({ x: 0, y: 0, z: 0 }, true)
        this.placed = true
        this.setSolid(false)
      } catch {}
      return
    }

    if (!this.solid && this.placed && !this.overlapsOthers())
      this.setSolid(true)

    const ageS = Math.max(0, (now - this.lastPacketTime) / 1000)
    _goal.copy(this.targetPos)

    const authority = ageS < 0.2 ? 1 : Math.max(0, 1 - (ageS - 0.2) / 0.3)
    const cruiseScale = ageS < 0.5 ? 1 : Math.max(0, 1 - (ageS - 0.5) / 1.0)

    let contactScale = 1

    let bp: { x: number; y: number; z: number }
    try {
      bp = b.translation()
    } catch {
      return
    }
    const dx = _goal.x - bp.x
    const dy = _goal.y - bp.y
    const dz = _goal.z - bp.z
    const distSq = dx * dx + dy * dy + dz * dz
    this.errMag = Math.sqrt(distSq)
    contactScale = this.corr.factor(now, this.errMag)
    if (this.corr.mode === "recover" && this.prevCorrMode !== "recover") {
      try {
        const lv = b.linvel()
        this.lastCorr.x = lv.x - this.targetVel.x * cruiseScale
        this.lastCorr.y = lv.y - this.targetVel.y * cruiseScale
        this.lastCorr.z = lv.z - this.targetVel.z * cruiseScale
      } catch {}
    }
    this.prevCorrMode = this.corr.mode

    try {
      const explained =
        this.corr.mode !== "follow" && this.errMag < RECOVER_WARP_M
      if (distSq > WARP_DIST_SQ && !explained) {
        netDiagSnap(this.id, "warp-threshold", Math.sqrt(distSq))
        this.interp.reset()
        netDiagBufferReset(this.id, "warp-snap")
        this.corr.reset()
        this.prevCorrMode = "follow"
        this.lastCorr.x = 0
        this.lastCorr.y = 0
        this.lastCorr.z = 0
        b.setTranslation({ x: _goal.x, y: _goal.y, z: _goal.z }, true)
        this.setSolid(false)
        b.setRotation(
          {
            x: this.targetQuat.x,
            y: this.targetQuat.y,
            z: this.targetQuat.z,
            w: this.targetQuat.w,
          },
          true,
        )
        b.setLinvel({ x: 0, y: 0, z: 0 }, true)
        b.setAngvel({ x: 0, y: 0, z: 0 }, true)
        return
      }

      let cx = dx * POS_GAIN
      let cy = dy * POS_GAIN
      let cz = dz * POS_GAIN
      const corrCap =
        this.corr.mode === "recover" ? RECOVER_CORR_MAX : CORRECTION_MAX
      const chl = Math.sqrt(cx * cx + cz * cz)
      if (chl > corrCap) {
        const s = corrCap / chl
        cx *= s
        cz *= s
      }
      const vcap =
        this.corr.mode === "recover" ? RECOVER_CORR_MAX : CORRECTION_MAX
      const cl = Math.abs(cy)
      if (cl > vcap) {
        cy *= vcap / cl
      }
      let tx = cx * authority * contactScale
      let ty = cy * authority
      let tz = cz * authority * contactScale
      if (this.corr.mode === "recover") {
        const tm = Math.sqrt(tx * tx + ty * ty + tz * tz)
        if (tm > RECOVER_CORR_MAX) {
          const s = RECOVER_CORR_MAX / tm
          tx *= s
          ty *= s
          tz *= s
        }
      }
      const px = this.lastCorr.x
      const py = this.lastCorr.y
      const pz = this.lastCorr.z
      this.corrCmdMag = clampCorrectionDelta(
        px,
        py,
        pz,
        tx,
        ty,
        tz,
        CORRECTION_ACCEL_MAX * dt,
        this.appliedCorr,
      )
      this.lastCorr.x = this.appliedCorr.x
      this.lastCorr.y = this.appliedCorr.y
      this.lastCorr.z = this.appliedCorr.z
      this.corrDeltaV = Math.sqrt(
        (this.appliedCorr.x - px) * (this.appliedCorr.x - px) +
          (this.appliedCorr.y - py) * (this.appliedCorr.y - py) +
          (this.appliedCorr.z - pz) * (this.appliedCorr.z - pz),
      )
      let vx = this.targetVel.x * cruiseScale + this.appliedCorr.x
      let vy = this.targetVel.y * cruiseScale + this.appliedCorr.y
      let vz = this.targetVel.z * cruiseScale + this.appliedCorr.z
      if (this.corr.hasSupport && vy < 0 && dy > SUPPORT_DESCENT_DY) {
        vy = 0
      }
      const passive =
        this.corr.mode === "contact" &&
        this.corr.impactImpulse >= IMPACT_IMPULSE_THRESHOLD
      if (passive) {
        this.corrCmdMag = 0
        this.corrDeltaV = 0
        let spd = 0
        try {
          const lv = b.linvel()
          spd = Math.sqrt(lv.x * lv.x + lv.y * lv.y + lv.z * lv.z)
        } catch {}
        netDiagRemoteSample(this.id, Math.sqrt(distSq), spd, 0, ageS * 1000)
        netDiagCorrection(
          this.id,
          this.corr.mode,
          this.errMag,
          0,
          0,
          this.corr.suppressedSubsteps,
          this.corr.transitions,
          this.corr.recoverT(now),
        )
        return
      }
      const sp = Math.sqrt(vx * vx + vy * vy + vz * vz)
      if (sp > MAX_DRIVE_SPEED) {
        const s = MAX_DRIVE_SPEED / sp
        vx *= s
        vy *= s
        vz *= s
      }
      b.setLinvel({ x: vx, y: vy, z: vz }, true)

      const bq = b.rotation()
      _q.set(bq.x, bq.y, bq.z, bq.w)
      _qe.copy(this.targetQuat).multiply(_q.invert())
      if (_qe.w < 0) {
        _qe.x = -_qe.x
        _qe.y = -_qe.y
        _qe.z = -_qe.z
        _qe.w = -_qe.w
      }
      const sinHalf = Math.sqrt(Math.max(0, 1 - _qe.w * _qe.w))
      let wMag = 0
      if (contactScale <= 0) {
      } else if (sinHalf > 1e-4) {
        const angle = 2 * Math.atan2(sinHalf, _qe.w)
        _axis.set(_qe.x / sinHalf, _qe.y / sinHalf, _qe.z / sinHalf)
        let w = angle / dt
        if (w > MAX_DRIVE_ANGVEL) w = MAX_DRIVE_ANGVEL
        else if (w < -MAX_DRIVE_ANGVEL) w = -MAX_DRIVE_ANGVEL
        w *= authority * contactScale
        wMag = Math.abs(w)
        b.setAngvel({ x: _axis.x * w, y: _axis.y * w, z: _axis.z * w }, true)
      } else if (contactScale >= 1) {
        b.setAngvel({ x: 0, y: 0, z: 0 }, true)
      }
      netDiagRemoteSample(
        this.id,
        Math.sqrt(distSq),
        Math.sqrt(vx * vx + vy * vy + vz * vz),
        wMag,
        ageS * 1000,
      )
      netDiagCorrection(
        this.id,
        this.corr.mode,
        this.errMag,
        this.corrCmdMag,
        this.corrDeltaV,
        this.corr.suppressedSubsteps,
        this.corr.transitions,
        this.corr.recoverT(now),
      )
    } catch {}
  }

  private lodAcc = 0
  private lodFrame = 0

  update(
    dt: number,
    smokeSystem?: TireSmoke,
    viewer?: { x: number; y: number; z: number },
  ) {
    const b = this.colliderBody
    if (!b || !this.hasReceivedPacket) return

    let far = false
    if (viewer) {
      const t = b.translation()
      const dx = t.x - viewer.x
      const dz = t.z - viewer.z
      far = dx * dx + dz * dz > 300 * 300
    }
    if (far) {
      this.lodAcc += dt
      if (++this.lodFrame % 3 !== 0) return
      dt = this.lodAcc
      this.lodAcc = 0
      smokeSystem = undefined
    } else {
      this.lodAcc = 0
    }

    let bp: { x: number; y: number; z: number }
    let bq: { x: number; y: number; z: number; w: number }
    let bv: { x: number; y: number; z: number }
    try {
      bp = b.translation()
      bq = b.rotation()
      bv = b.linvel()
    } catch {
      return
    }
    _pos.set(bp.x, bp.y, bp.z)
    _quat.set(bq.x, bq.y, bq.z, bq.w)

    let omegas: number[]
    if (this.wheelOmegaIn) {
      omegas = this.wheelOmegaIn
      this.wheelOmega = (omegas[0] + omegas[1] + omegas[2] + omegas[3]) / 4
    } else {
      const vms = Math.sqrt(bv.x * bv.x + bv.y * bv.y + bv.z * bv.z)
      this.wheelOmega = vms / this.wheelRadius
      omegas = [
        this.wheelOmega,
        this.wheelOmega,
        this.wheelOmega,
        this.wheelOmega,
      ]
    }

    this.visual.syncFromPose(
      _pos,
      _quat,
      this.steerAngle,
      omegas,
      dt,
      this.compressionIn ?? undefined,
    )
    this.visual.setBrake(this.brakeTarget)

    if (smokeSystem && this.smokeLevel > 0.28) {
      this.visual.wheelContactPositions(this.drift, this.smokePosBuf)
      if (this.smokePosBuf.length === 0) {
        this.smokeAcc = 0
      } else {
        this.smokeAcc += dt * this.smokeLevel * 90
        while (this.smokeAcc >= 1) {
          this.smokeAcc -= 1
          smokeSystem.spawn(
            this.smokePosBuf[(Math.random() * this.smokePosBuf.length) | 0],
            this.smokeLevel,
          )
        }
      }
    } else {
      this.smokeAcc = 0
    }
  }

  dispose(scene: THREE.Scene, world?: RAPIER.World) {
    scene.remove(this.visual.group)
    const w = this.world ?? world ?? null
    if (this.colliderBody && w) {
      try {
        w.removeRigidBody(this.colliderBody)
      } catch {}
      this.colliderBody = null
    }
    this.collider = null
  }
}
