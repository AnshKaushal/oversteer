import * as RAPIER from "@dimforge/rapier3d-compat"
import * as THREE from "three"
import {
  DEFAULT_PHYSICS_CONFIG,
  type CarPhysicsConfig,
} from "../constants/physics"
import type { CarDashConfig } from "../constants/cars"
import type { DriveInput } from "./InputManager"
import {
  SuspensionSystem,
  type WheelDef,
  type WheelSuspState,
} from "./Suspension"
import { WheelDynamics, estimateWheelInertia } from "./WheelDynamics"
import { TireModel, type TireResult } from "./TireModel"

export type Gear = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export interface CarTelemetry {
  speedKmh: number
  rpm: number
  gear: Gear
  gearLabel: string
  autoMode: boolean
  throttle: number
  brake: number
  steer: number
  shifting: boolean
  launchArmed: boolean
  launching: boolean
  parkingBrake: boolean
  cruiseOn: boolean
  cruiseTargetKmh: number | null
  slipRatio: number
  drift: boolean
  dash: CarDashConfig
  aggression?: number
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function torqueMult(
  curve: readonly (readonly number[])[],
  rpm: number,
): number {
  if (rpm <= curve[0][0]) return curve[0][1]
  for (let i = 1; i < curve.length; i++) {
    if (rpm <= curve[i][0]) {
      const [r0, m0] = curve[i - 1]
      const [r1, m1] = curve[i]
      const t = (rpm - r0) / Math.max(1, r1 - r0)
      return lerp(m0, m1, t)
    }
  }
  return 0
}

export const DEFAULT_WHEELS: [WheelDef, WheelDef, WheelDef, WheelDef] = [
  { x: -0.76, z: -1.51, front: true, left: true },
  { x: 0.76, z: -1.51, front: true, left: false },
  { x: -0.76, z: 1.31, front: false, left: true },
  { x: 0.76, z: 1.31, front: false, left: false },
]

export const DEFAULT_DASH: CarDashConfig = {
  maxRpm: 8000,
  redFromRpm: 6750,
  maxKmh: 340,
}

export class CarController {
  body: RAPIER.RigidBody
  world: RAPIER.World
  R: typeof RAPIER
  readonly P: CarPhysicsConfig
  readonly wheelDefs: readonly WheelDef[]
  readonly dash: CarDashConfig
  readonly wheelbase: number

  gear: Gear = 1
  autoMode = true
  autoShiftEnabled = true
  cruiseActive = false
  cruiseTargetKmh: number | null = null
  private cruiseTrim = 0
  private cruisePulling = false
  rpm: number
  aggression = 0
  private aggressionHoldTimer = 0
  private gearChangeDelayTimer = 0
  private autoReverseHoldTimer = 0
  private autoReversePending = false
  private autoReversePendingTimer = 0
  private autoForwardHoldTimer = 0
  private autoForwardPending = false
  private autoForwardPendingTimer = 0
  private decisionThrottle = 0
  private kickdownTimer = 0
  private kickdownTargetGear: Gear | null = null
  private clutchDumpTimer = 0
  private shiftTimer = 0
  private clutch = 1
  private wheelOmega = 0
  spinOmega = 0
  launchEnabled = true
  launching = false
  launchArmed = false
  private simTime = 0
  private limiterCut = false
  private launchTimer = 0
  parkingBrake = true
  private feedT = 99
  private prevThrottle = 0
  private prevLaunching = false

  steerAngle = 0
  slipRatioAvg = 0
  drifting = false
  rearSlip = 0
  lastWheelLoad = [0, 0, 0, 0]
  lastWheelLong = [0, 0, 0, 0]
  suspension: SuspensionSystem
  wheelDynamics: WheelDynamics
  tireModel: TireModel
  lastTireDiag: TireResult[] = []
  tireLag: { fx: number; fy: number }[] = [
    { fx: 0, fy: 0 },
    { fx: 0, fy: 0 },
    { fx: 0, fy: 0 },
    { fx: 0, fy: 0 },
  ]

  private filteredSpeed = 0

  constructor(
    world: RAPIER.World,
    body: RAPIER.RigidBody,
    R: typeof RAPIER,
    config: CarPhysicsConfig = DEFAULT_PHYSICS_CONFIG,
    wheels: readonly WheelDef[] = DEFAULT_WHEELS,
    dash: CarDashConfig = DEFAULT_DASH,
  ) {
    this.world = world
    this.body = body
    this.R = R
    this.P = config
    this.wheelDefs = wheels
    this.dash = dash
    this.rpm = config.engine.idleRPM
    const fronts = wheels.filter((w) => w.front)
    const rears = wheels.filter((w) => !w.front)
    const avg = (ws: readonly WheelDef[]) =>
      ws.reduce((a, w) => a + w.z, 0) / Math.max(1, ws.length)
    const wb = Math.abs(avg(rears) - avg(fronts))
    this.wheelbase = wb > 1 ? wb : 2.85
    this.body.setLinearDamping(0.001)
    this.body.setAngularDamping(0.55)
    const susp = config.wheels.suspension
    this.suspension = new SuspensionSystem(world, body, R, [...wheels], {
      springRate: susp.springRate,
      damperRate: susp.damperRate,
      travel: susp.travel,
      antiRollBarFront: susp.antiRollBarFront,
      antiRollBarRear: susp.antiRollBarRear,
    })
    const P0 = config
    const wheelMass = (P0.mass.frontWheel + P0.mass.rearWheel) / 2
    this.wheelDynamics = new WheelDynamics(
      P0.wheels.radius,
      estimateWheelInertia(wheelMass, P0.wheels.radius),
      P0.wheels.slipDampRate,
    )
    this.tireModel = new TireModel(
      {
        mu: P0.wheels.frictionMu,
        referenceLoad: P0.wheels.referenceLoad,
        loadExpLong: P0.wheels.pacejka.longitudinal.loadSensitivity,
        loadExpLat: P0.wheels.pacejka.lateral.loadSensitivity,
        rollingResist: P0.wheels.rollingResist,
        long: {
          B: P0.wheels.pacejka.longitudinal.B,
          C: P0.wheels.pacejka.longitudinal.C,
          D: P0.wheels.pacejka.longitudinal.D,
          E: P0.wheels.pacejka.longitudinal.E,
        },
        lat: {
          B: P0.wheels.pacejka.lateral.B,
          C: P0.wheels.pacejka.lateral.C,
          D: P0.wheels.pacejka.lateral.D,
          E: P0.wheels.pacejka.lateral.E,
        },
      },
      P0.wheels.radius,
    )
  }

  reset(pos: THREE.Vector3, yaw = 0) {
    this.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true)
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0))
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.gear = 1
    this.rpm = this.P.engine.idleRPM
    this.shiftTimer = 0
    this.aggression = 0
    this.aggressionHoldTimer = 0
    this.gearChangeDelayTimer = 0
    this.autoReverseHoldTimer = 0
    this.autoReversePending = false
    this.autoReversePendingTimer = 0
    this.autoForwardHoldTimer = 0
    this.autoForwardPending = false
    this.autoForwardPendingTimer = 0
    this.decisionThrottle = 0
    this.kickdownTimer = 0
    this.kickdownTargetGear = null
    this.clutchDumpTimer = 0
    this.feedT = 99
    this.prevThrottle = 0
    this.prevLaunching = false
    this.cruiseActive = false
    this.cruiseTargetKmh = null
    this.cruiseTrim = 0
    this.cruisePulling = false
    this.clutch = 1
    this.wheelOmega = 0
    this.spinOmega = 0
    this.wheelDynamics.reset()
    for (const lag of this.tireLag) {
      lag.fx = 0
      lag.fy = 0
    }
    this.steerAngle = 0
    this.slipRatioAvg = 0
    this.rearSlip = 0
    this.parkingBrake = true
    this.launchTimer = 0
    this.limiterCut = false
    for (const st of this.suspension.states) {
      st.grounded = false
      st.compression = 0
      st.suspVel = 0
      st.springF = 0
      st.damperF = 0
      st.arbF = 0
      st.force = 0
      st.load = 0
    }
  }

  get forwardSpeed(): number {
    const v = this.body.linvel()
    const q = this.body.rotation()
    const quat = new THREE.Quaternion(q.x, q.y, q.z, q.w)
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(quat)
    return v.x * fwd.x + v.y * fwd.y + v.z * fwd.z
  }

  getWheelOmegas(): [number, number, number, number] {
    return this.wheelDynamics.omegas()
  }

  private brakeTorqueFor(
    w: WheelDef,
    input: DriveInput,
    speedKmh: number,
    vLongPatch: number,
    simTime: number,
  ): number {
    const P = this.P
    const brakeMax = w.front
      ? P.wheels.brakeForce.front
      : P.wheels.brakeForce.rear
    let base: number
    if (this.gear === -1) {
      base = input.brake * brakeMax
      if (this.parkingBrake) base = Math.max(base, 3000)
    } else {
      const hbLock = input.handbrake && !w.front
      const lockF = Math.abs(input.steer)
      const hbDrag = 2600 - 1400 * lockF - 800 * clamp(speedKmh / 15, 0, 1)
      const hbForce = hbLock
        ? input.throttle > 0.5
          ? hbDrag
          : P.wheels.handbrakeForce
        : 0
      base = input.brake * brakeMax + hbForce
      if (this.parkingBrake) base = Math.max(base, 3000)
    }
    const wheelLock =
      Math.abs(vLongPatch) < 2 &&
      input.brake > 0.7 &&
      Math.abs(vLongPatch) > 0.5
    if (P.assists.absEnabled && wheelLock)
      base *= 0.6 + 0.4 * Math.sin(simTime * 90)
    return base
  }

  private wasAirborneLastStep(): boolean {
    const st = this.suspension.states
    return st.length > 0 && st.every((s) => !s.grounded)
  }

  getWheelCompressions(): [number, number, number, number] {
    const s = this.suspension.states
    return [
      s[0]?.compression ?? 0,
      s[1]?.compression ?? 0,
      s[2]?.compression ?? 0,
      s[3]?.compression ?? 0,
    ]
  }

  update(dt: number, input: DriveInput): CarTelemetry {
    const P = this.P
    dt = Math.min(dt, P.simulation.maxFrameDt)
    this.simTime += dt
    const origThrottle = input.throttle
    const origBrake = input.brake
    // In reverse gear, auto mode keeps S as throttle (per controls).
    // Manual mode: W is throttle, S is brake, even in reverse.
    if (this.gear === -1 && this.autoMode) {
      input = {
        ...input,
        throttle: input.brake,
        brake: input.throttle,
      }
    }

    if (input.toggleModePressed) this.autoMode = !this.autoMode
    if (input.toggleLaunchPressed) this.launchEnabled = !this.launchEnabled
    if (input.toggleParkPressed) this.parkingBrake = !this.parkingBrake
    if (this.shiftTimer > 0) this.shiftTimer -= dt

    if (!this.autoMode) {
      if (input.upshiftPressed) this.manualShift(1)
      if (input.downshiftPressed) this.manualShift(-1)
    }

    const linvel = this.body.linvel()
    const fwdSpeed = this.forwardSpeed
    this.filteredSpeed +=
      (Math.abs(fwdSpeed) - this.filteredSpeed) * Math.min(1, dt * 6)

    const rot = this.body.rotation()
    const quat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w)
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(quat)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat)
    fwd.y = 0
    right.y = 0
    fwd.normalize()
    right.normalize()

    const latVGlobal = linvel.x * right.x + linvel.z * right.z
    const beta = clamp(latVGlobal / Math.max(10, Math.abs(fwdSpeed)), -0.4, 0.4)

    if (input.throttle > 0.3) this.parkingBrake = false
    if (input.throttle < 0.65 || input.brake > 0.1) {
      this.kickdownTimer = 0
      this.kickdownTargetGear = null
    }

    const speedKmh = Math.abs(fwdSpeed) * 3.6

    // BeamNG-style cruise control: [/Set+Slow, ]/Resume+Up, ;/Toggle.
    // Set only locks a speed >= 30 km/h; brake/handbrake/park pause it and
    // keep the target for resume. Throttle overrides, ] resumes when off.
    if (this.cruiseActive) {
      if (
        origBrake > 0.05 ||
        input.handbrake ||
        this.parkingBrake ||
        this.gear < 1 ||
        fwdSpeed < -0.5 ||
        Math.abs(fwdSpeed) * 3.6 < 12
      ) {
        this.cruiseActive = false
      }
    }
    if (input.cruiseTogglePressed) {
      if (this.cruiseActive) this.cruiseActive = false
      else if (this.cruiseTargetKmh !== null) this.cruiseActive = true
    }
    if (input.cruiseSetPressed) {
      if (this.cruiseActive && this.cruiseTargetKmh !== null) {
        this.cruiseTargetKmh = Math.max(
          30,
          this.cruiseTargetKmh - 1,
        )
      } else if (!this.cruiseActive && speedKmh >= 30) {
        this.cruiseTargetKmh = Math.round(speedKmh)
        this.cruiseActive = true
      }
    }
    if (input.cruiseUpPressed) {
      if (this.cruiseActive && this.cruiseTargetKmh !== null) {
        this.cruiseTargetKmh = Math.min(
          this.dash.maxKmh,
          this.cruiseTargetKmh + 1,
        )
      } else if (
        !this.cruiseActive &&
        this.cruiseTargetKmh !== null &&
        speedKmh >= 30
      ) {
        this.cruiseActive = true
      }
    }

    const S = P.wheels.steering
    const steerFactor =
      1 /
      (1 + Math.pow(speedKmh / S.speedFalloffKmh, 2) * S.speedSensitivity * 3)
    const gripCap = Math.atan(
      (this.wheelbase * 32) / Math.max(40, fwdSpeed * fwdSpeed),
    )
    const steerCap = Math.max(gripCap, S.minAngleAtSpeed)
    const targetSteer = clamp(
      input.steer * S.maxAngle * steerFactor,
      -steerCap,
      steerCap,
    )
    const steerRate = 6
    this.steerAngle += clamp(
      targetSteer - this.steerAngle,
      -steerRate * dt,
      steerRate * dt,
    )

    const atStandstill = Math.abs(fwdSpeed) < 1.2

    // BeamNG-style auto: holding brake while stationary shifts 1 -> N -> R.
    if (this.autoMode && this.autoShiftEnabled) {
      if (
        atStandstill &&
        this.gear === 1 &&
        origBrake > 0.4 && !input.handbrake &&
        origThrottle < 0.1
      ) {
        this.autoReverseHoldTimer += dt
        if (
          this.autoReverseHoldTimer > 0.7 &&
          this.shiftTimer <= 0 &&
          !this.autoReversePending
        ) {
          this.gear = 0
          this.shiftTimer = 0
          this.autoReverseHoldTimer = 0
          this.autoReversePending = true
          this.autoReversePendingTimer = 0.35
        }
      } else if (!this.autoReversePending) {
        this.autoReverseHoldTimer = 0
      }
      if (this.autoReversePending) {
        if (this.gear === 0) {
          if (origThrottle > 0.4) {
            this.gear = 1
            this.autoReversePending = false
            this.autoReversePendingTimer = 0
          } else if (origBrake > 0.4 && !input.handbrake) {
            this.autoReversePendingTimer -= dt
            if (this.autoReversePendingTimer <= 0 && this.shiftTimer <= 0) {
              this.gear = -1
              this.autoReversePending = false
              this.autoReversePendingTimer = 0
            }
          } else {
            this.autoReversePending = false
            this.autoReversePendingTimer = 0
          }
        } else {
          this.autoReversePending = false
          this.autoReversePendingTimer = 0
        }
      }

      // Exit reverse: holding W (brake after swap) while stopped shifts R -> N -> 1.
      if (
        Math.abs(fwdSpeed) < 3 &&
        this.gear === -1 &&
        origThrottle > 0.4 &&
        origBrake < 0.1
      ) {
        this.autoForwardHoldTimer += dt
        if (
          this.autoForwardHoldTimer > 0.7 &&
          this.shiftTimer <= 0 &&
          !this.autoForwardPending
        ) {
          this.gear = 0
          this.shiftTimer = 0
          this.autoForwardHoldTimer = 0
          this.autoForwardPending = true
          this.autoForwardPendingTimer = 0.35
        }
      } else if (!this.autoForwardPending) {
        this.autoForwardHoldTimer = 0
      }
      if (this.autoForwardPending) {
        if (this.gear === 0) {
          if (origBrake > 0.4 && !input.handbrake) {
            this.gear = -1
            this.autoForwardPending = false
            this.autoForwardPendingTimer = 0
          } else if (origThrottle > 0.4) {
            this.autoForwardPendingTimer -= dt
            if (this.autoForwardPendingTimer <= 0 && this.shiftTimer <= 0) {
              this.gear = 1
              this.autoForwardPending = false
              this.autoForwardPendingTimer = 0
            }
          } else {
            this.autoForwardPending = false
            this.autoForwardPendingTimer = 0
          }
        } else {
          this.autoForwardPending = false
          this.autoForwardPendingTimer = 0
        }
      }

      // Neutral: pressing either pedal engages corresponding gear.
      if (
        this.gear === 0 &&
        !this.autoReversePending &&
        !this.autoForwardPending
      ) {
        if (origBrake > 0.4 && !input.handbrake && origThrottle < 0.1) {
          this.gear = -1
        } else if (origThrottle > 0.4 && origBrake < 0.1) {
          this.gear = 1
        }
      }
    }

    this.launchArmed =
      this.launchEnabled &&
      atStandstill &&
      this.gear === 1 &&
      input.throttle > 0.7 &&
      input.brake > 0.2

    // Cruise pedal injection: P-hold toward target, light retard on overspeed;
    // full driver throttle always wins until released.
    // Cruise pedal injection: PI controller — proportional term reacts
    // immediately, integral trim closes the residual drag offset so the car
    // holds the set speed exactly. Driver throttle always wins, and after the
    // pedal is released the car coasts down naturally — cruise only regulates
    // again once the speed reaches the target (or after a grace timeout).
    if (this.cruiseActive && this.cruiseTargetKmh !== null && this.gear >= 1) {
      const err = this.cruiseTargetKmh - speedKmh
      const overridden = input.throttle > 0.05
      if (overridden) this.cruisePulling = true
      if (!overridden && err >= -0.3) this.cruisePulling = false

      if (!overridden) {
        const cChrottle = err * 0.06 + this.cruiseTrim
        const u = clamp(cChrottle, 0, 0.85)
        // Anti-windup: only integrate while the output can still move.
        if ((u < 0.85 || err < 0) && (u > 0 || err > 0)) {
          this.cruiseTrim = clamp(this.cruiseTrim + err * dt * 0.09, -0.3, 0.35)
        }
        const cruiseThrottle = u
        const cruiseBrake =
          cChrottle < -0.04 && !this.cruisePulling
            ? clamp(-cChrottle * 0.8 - 0.02, 0, 0.25)
            : 0
        input = {
          ...input,
          throttle: Math.max(input.throttle, cruiseThrottle),
          brake: Math.max(input.brake, cruiseBrake),
        }
      }
    } else if (this.cruisePulling || this.cruiseTrim !== 0) {
      this.cruiseTrim = 0
      this.cruisePulling = false
    }

    const ratios = P.transmission.gearRatios
    const finalDrive = P.transmission.finalDriveRatio
    const wheelRadius = P.wheels.radius
    const rollingOmega = fwdSpeed / Math.max(0.2, wheelRadius)

    let gearRatio = 0
    if (this.gear > 0) gearRatio = ratios[this.gear - 1] * finalDrive
    else if (this.gear === -1)
      gearRatio = P.transmission.reverseRatio * finalDrive

    const launchTargetRPM = P.transmission.launchControlRPM || 4500

    if (this.launchArmed) {
      this.launchTimer = 2.5
    } else if (this.launchTimer > 0) {
      this.launchTimer -= dt
    }
    if (this.clutchDumpTimer > 0) {
      this.clutchDumpTimer -= dt
    }

    const coupled = Math.abs((rollingOmega * gearRatio * 60) / (2 * Math.PI))

    // Active launch phase: starts the instant brake is released from launchArmed,
    // and holds engine in peak powerband until drivetrain synchronizes with engine
    this.launching =
      !this.launchArmed &&
      this.launchTimer > 0 &&
      input.throttle > 0.65 &&
      this.gear === 1 &&
      coupled < launchTargetRPM * 0.98

    let targetRpm: number
    if (this.gear === 0) {
      targetRpm =
        P.engine.idleRPM +
        input.throttle * (P.engine.redlineRPM - P.engine.idleRPM) * 0.9
      if (targetRpm > this.rpm) {
        this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * 5.0)
      } else {
        const excess = Math.max(0, this.rpm - P.engine.idleRPM)
        const decay = 1.2 + 1.3 * Math.min(1, excess / 3500)
        this.rpm = P.engine.idleRPM + excess * Math.exp(-decay * dt)
      }
    } else {
      const clutchSlip =
        clamp(1 - Math.abs(fwdSpeed) / 6, 0, 1) * (1 - this.clutch * 0)
      const throttleFlare = input.throttle * clutchSlip * 2500

      if (this.launchArmed) {
        targetRpm = launchTargetRPM
      } else if (this.launching) {
        // Realistic clutch bite load: momentary 500-700 RPM bog as clutch locks into stationary tarmac
        const launchElapsed = 2.5 - this.launchTimer
        let bogDrop = 0
        if (launchElapsed < 0.38) {
          const t = launchElapsed / 0.38
          bogDrop = Math.sin(t * Math.PI) * 720
        }
        targetRpm = Math.max(launchTargetRPM - bogDrop, coupled)
      } else if (this.clutchDumpTimer > 0) {
        // High-RPM neutral drop / clutch dump: keep engine singing in peak powerband while tires spin
        targetRpm = Math.max(
          this.rpm,
          coupled,
          P.engine.idleRPM +
            input.throttle *
              (P.engine.redlineRPM - P.engine.idleRPM) *
              0.88,
        )
      } else {
        targetRpm = Math.max(P.engine.idleRPM * 0.95, coupled + throttleFlare)
        if (Math.abs(fwdSpeed) < 3 && input.throttle > 0.1 && this.gear >= 1) {
          targetRpm = Math.max(
            targetRpm,
            P.engine.idleRPM + input.throttle * 2200,
          )
        }
      }

      if (
        input.throttle > 0.1 &&
        this.gear >= 1 &&
        this.wasAirborneLastStep()
      ) {
        targetRpm = Math.max(targetRpm, P.engine.revLimiterRPM - 100)
      }

      // Pre-kickdown engine surge / torque converter & dual-clutch micro-slip (+100 to 150 RPM)
      if (this.kickdownTimer > 0) {
        const kickdownProgress = clamp(1 - this.kickdownTimer / 0.18, 0, 1)
        targetRpm += 80 + kickdownProgress * 120
      }

      const revBlendRate = this.launching
        ? 16
        : this.clutchDumpTimer > 0
          ? 16
          : this.kickdownTimer > 0
            ? 14
            : 10
      this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * revBlendRate)
    }

    if (this.launchArmed) {
      if (this.rpm > launchTargetRPM) {
        this.rpm = launchTargetRPM + Math.sin(this.simTime * 50) * 100
      }
    }

    const LIM = P.engine.revLimiterRPM
    if (this.rpm >= LIM) this.limiterCut = true
    else if (this.rpm < LIM - 400) this.limiterCut = false
    if (this.rpm > LIM) this.rpm = LIM

    // ============================================================
    // Dynamic Shift Map Calculation (BeamNG ShiftLogic Engine)
    // Fully dynamic based on the car's engine RPM limits & ratios
    // ============================================================
    const idle = P.engine.idleRPM
    const redline = P.engine.redlineRPM
    const highUp = Math.min(
      P.transmission.autoUpshiftRPM || redline - 200,
      redline - 150,
    )
    // Low-throttle upshift: early economy cruising point (22% into the powerband above idle)
    const lowUp = Math.round(idle + (highUp - idle) * 0.22)
    // Low-throttle downshift point: prevents engine lugging and stalling
    const lowDown = Math.max(Math.round(idle * 1.3), idle + 250)
    // High-throttle downshift point: aggressive kickdown to access maximum torque
    const highDown = Math.round(lowDown + (highUp - lowDown) * 0.54)

    // 1. Gearbox decision throttle smoothing (asymmetric low-pass filter)
    const decisionRate = input.throttle > this.decisionThrottle ? 2.5 : 2.0
    this.decisionThrottle +=
      (input.throttle - this.decisionThrottle) * Math.min(1, dt * decisionRate)

    // 2. Driver Aggression calculation (pedal position + tip-in speed d(throttle)/dt)
    const throttleRate =
      (input.throttle - this.prevThrottle) / Math.max(dt, 0.001)
    const tipInBonus = throttleRate > 1.8 ? 0.35 : 0
    const brakeBonus = input.brake > 0.4 ? 0.25 : 0
    const rawAggression = clamp(
      this.decisionThrottle + tipInBonus + brakeBonus,
      0,
      1,
    )

    if (rawAggression >= this.aggression) {
      // Aggression rises quickly under throttle demand
      this.aggression +=
        (rawAggression - this.aggression) * Math.min(1, dt * 1.8)
      this.aggressionHoldTimer = 1.75 // BeamNG aggressionHoldOffThrottleDelay
    } else {
      // Aggression holds during key lifts/feathering before slowly decaying
      if (this.aggressionHoldTimer > 0) {
        this.aggressionHoldTimer -= dt
      } else {
        this.aggression +=
          (rawAggression - this.aggression) * Math.min(1, dt * 0.4)
      }
    }
    this.aggression = clamp(this.aggression, 0, 1)

    // Non-linear aggression coefficient (quadratic curve)
    const aggressionCoef = this.aggression * this.aggression

    // Interpolate active shift thresholds based on driver aggression
    const targetShiftUpRPM = lerp(lowUp, highUp, aggressionCoef)
    // Apply hysteresis offset factor (1.28) to eliminate cyclical gear hunting
    const targetShiftDownRPM = Math.min(
      lerp(lowDown, highDown, aggressionCoef),
      targetShiftUpRPM / 1.28,
    )

    // Cooldown timer between shifts (transmissionGearChangeDelay)
    this.gearChangeDelayTimer = Math.max(0, this.gearChangeDelayTimer - dt)

    // Shift prevention: inhibit upshifting during wheelspin/burnouts or heavy slides
    const isSlipping = this.slipRatioAvg > 0.24
    const isHeavySlide = Math.abs(this.lateralVelocity()) > 5.5

    const isAntiStall = this.gear > 1 && (this.rpm < idle * 1.2 || speedKmh < 6)

    if (
      this.autoMode &&
      this.shiftTimer <= 0 &&
      (this.gearChangeDelayTimer <= 0 || isAntiStall) &&
      this.gear >= 1
    ) {
      // 1. Anti-stall floor: when approaching stop or RPM drops to idle, drop directly to 1st
      if (isAntiStall) {
        this.doShift(1 - this.gear)
      }
      // 2. Upshift: when RPM exceeds targetShiftUpRPM
      // Must NOT upshift if launch control is armed or vehicle is stationary (< 10 km/h)
      else if (
        this.rpm > targetShiftUpRPM &&
        this.gear < ratios.length &&
        !this.launchArmed &&
        speedKmh > 10
      ) {
        const forceLimiterShift = this.rpm >= highUp || this.limiterCut
        if ((!isSlipping || forceLimiterShift) && !isHeavySlide) {
          this.doShift(1)
        }
      }
      // 3. Direct multi-gear kickdown:
      // When stamping throttle and NOT already near upshift RPM, scan for lowest safe gear directly
      // (e.g. from 8th gear straight to 3rd in one jump without passing through 7th/5th)
      else if (
        this.gear > 1 &&
        this.rpm < targetShiftUpRPM - 300 &&
        ((input.throttle > 0.75 && aggressionCoef > 0.4) ||
          input.throttle > 0.88)
      ) {
        const safeHeadroom = Math.max(450, (redline - idle) * 0.08)
        const maxSafeRPM = redline - safeHeadroom
        let kickdownGear: Gear | null = null

        // Scan from 1st gear upwards to find the lowest gear with maximum torque that does not over-rev
        for (let g = 1; g < this.gear; g++) {
          const pred = this.predictedRpm(g as Gear)
          if (pred < maxSafeRPM && pred >= idle * 1.1) {
            kickdownGear = g as Gear
            break
          }
        }

        if (kickdownGear !== null && kickdownGear < this.gear) {
          if (this.kickdownTimer <= 0 && this.kickdownTargetGear === null) {
            this.kickdownTargetGear = kickdownGear
            this.kickdownTimer = 0.375
          }

          this.kickdownTargetGear = kickdownGear
          this.kickdownTimer -= dt

          if (this.kickdownTimer <= 0) {
            this.doShift(kickdownGear - this.gear)
            this.kickdownTargetGear = null
            this.kickdownTimer = 0
          }
        } else {
          this.kickdownTargetGear = null
          this.kickdownTimer = 0
        }
      }

      else if (this.rpm < targetShiftDownRPM && this.gear > 1) {
        let targetDownGear: Gear = (this.gear - 1) as Gear
        for (let g = (this.gear - 1) as number; g >= 1; g--) {
          const pred = this.predictedRpm(g as Gear)
          if (pred < targetShiftUpRPM - 200) {
            if (pred >= targetShiftDownRPM + 150) {
              targetDownGear = g as Gear
              break
            } else {
              targetDownGear = g as Gear
            }
          }
        }
        if (targetDownGear < this.gear) {
          this.doShift(targetDownGear - this.gear)
        }
      }
    }
    const shifting = this.shiftTimer > 0

    const torqueCurveMult = torqueMult(P.engine.torqueCurve, this.rpm)
    let engineTorque = P.engine.maxTorqueNm * torqueCurveMult * input.throttle
    const friction =
      P.engine.frictionTorqueBase + this.rpm * P.engine.frictionTorqueRPMFactor
    engineTorque -= friction * 0.25
    if (this.gear === 0) engineTorque = 0
    if (shifting) engineTorque *= 0.25
    if (this.limiterCut) engineTorque = 0

    const tcGain =
      (input.handbrake ? 0 : P.assists.tractionControl) *
      (this.launching
        ? 0.35
        : this.launchArmed
          ? 0
          : this.clutchDumpTimer > 0
            ? 0.2
            : 1)
    if (this.slipRatioAvg > 0.15) {
      let cut = clamp((this.slipRatioAvg - 0.15) / 0.35, 0, 1)
      if (
        input.throttle > 0.5 &&
        Math.abs(beta) > 0.14 &&
        !this.launching &&
        this.clutchDumpTimer <= 0
      ) {
        cut = Math.min(1, cut + clamp((Math.abs(beta) - 0.14) * 4, 0, 0.3))
      }
      if (
        !input.handbrake &&
        Math.abs(this.steerAngle) > 0.12 &&
        !this.launching &&
        this.clutchDumpTimer <= 0
      ) {
        cut = Math.min(
          1,
          cut + clamp((this.slipRatioAvg - 0.15) * 2.5, 0, 0.55),
        )
      }
      const maxCut = this.launching
        ? 0.3
        : this.clutchDumpTimer > 0
          ? 0.2
          : 0.88
      engineTorque *= lerp(1, 1 - Math.min(maxCut, tcGain * 2.2), cut)
    }
    engineTorque = Math.max(0, engineTorque)

    const tcMult =
      this.gear !== 0
        ? 1 +
          (P.transmission.torqueConverter.stallMultiplication - 1) *
            clamp(
              1 - speedKmh / P.transmission.torqueConverter.lockupSpeedKmh,
              0,
              1,
            )
        : 1
    const split = P.drivetrain.frontTorqueSplit
    const rearDriven = split < 0.999
    const frontDriven = split > 0.001
    const drivenCount = (rearDriven ? 2 : 0) + (frontDriven ? 2 : 0)
    let driveTorqueTotal = 0
    let driveDir = 1
    let feedFactor = 1
    if (this.gear !== 0) {
      const dir = this.gear === -1 ? -1 : 1
      driveDir = dir
      driveTorqueTotal = engineTorque * gearRatio * 0.9 * tcMult * dir
      if (this.launchArmed) driveTorqueTotal = 0
      if (
        input.throttle > 0.7 &&
        this.prevThrottle <= 0.7 &&
        speedKmh < 30 &&
        this.gear === 1
      ) {
        this.feedT = 0
      }
      if (this.launching && !this.prevLaunching) this.feedT = 0
      this.feedT += dt
      this.prevThrottle = input.throttle
      this.prevLaunching = this.launching
      if (dir > 0 && this.gear === 1 && input.throttle > 0.5) {
        feedFactor = this.launching || this.clutchDumpTimer > 0
          ? 1.0
          : Math.min(1, 0.4 + (0.6 * this.feedT) / 0.5)
      }
    }

    const pos = this.body.translation()
    const bodyPos = new THREE.Vector3(pos.x, pos.y, pos.z)
    let totalSlip = 0
    let rearSlipSum = 0
    let rearCount = 0

    interface WheelSolve {
      w: WheelDef
      wi: number
      grounded: boolean
      load: number
      contactY: number
      anchor: THREE.Vector3
      patchVel: THREE.Vector3
      heading: THREE.Vector3
      normal: THREE.Vector3
      driveT: number
      brakeM: number
    }
    const solves: WheelSolve[] = []
    const angvel0 = this.body.angvel()
    const linVec = new THREE.Vector3(linvel.x, linvel.y, linvel.z)
    const angVec = new THREE.Vector3(angvel0.x, angvel0.y, angvel0.z)
    const suspStates: WheelSuspState[] = this.suspension.update(
      dt,
      quat,
      bodyPos,
      linVec,
      angVec,
    )
    let groundedWheels = 0
    for (const st of suspStates) {
      this.lastWheelLoad[st.wi] = st.load
      if (!st.grounded) this.lastWheelLong[st.wi] = 0
      else groundedWheels++
    }

    for (let wi = 0; wi < this.wheelDefs.length; wi++) {
      const w = this.wheelDefs[wi]
      const st = suspStates[wi]
      const anchorWorld = st.anchorWorld

      const steer = w.front ? this.steerAngle : 0
      const wheelFwd = new THREE.Vector3(
        Math.sin(steer) * -1,
        0,
        -Math.cos(steer),
      ).applyQuaternion(quat)
      wheelFwd.y = 0
      wheelFwd.normalize()
      const driven = w.front ? frontDriven : rearDriven
      let driveT = 0
      if (driven && this.gear !== 0) {
        driveT = w.front
          ? (driveTorqueTotal * split) / 2
          : (driveTorqueTotal * (1 - split)) / 2
        if (driveDir > 0 && !input.handbrake) {
          if (this.gear === 1)
            driveT = Math.min(
              driveT,
              this.launching || this.clutchDumpTimer > 0
                ? P.drivetrain.torqueCapGear1 * 1.35
                : P.drivetrain.torqueCapGear1,
            )
          else if (this.gear === 2)
            driveT = Math.min(driveT, P.drivetrain.torqueCapGear2)
        }
        driveT *= feedFactor
      }
      const vLongPre = st.pointVel.dot(wheelFwd)
      const brakeM = this.brakeTorqueFor(
        w,
        input,
        speedKmh,
        vLongPre,
        this.simTime,
      )

      if (!st.grounded) {
        this.wheelDynamics.step(wi, dt, driveT, brakeM, 0, undefined)
        this.tireLag[wi].fx = 0
        this.tireLag[wi].fy = 0
        solves.push({
          w,
          wi,
          grounded: false,
          load: 0,
          contactY: 0,
          anchor: anchorWorld,
          patchVel: new THREE.Vector3(),
          heading: wheelFwd,
          normal: new THREE.Vector3(0, 1, 0),
          driveT,
          brakeM,
        })
        continue
      }

      const contactPoint = new THREE.Vector3(
        anchorWorld.x,
        st.contactY,
        anchorWorld.z,
      )
      const lever = contactPoint.clone().sub(bodyPos)
      const patchVel = linVec.clone().add(angVec.clone().cross(lever))
      solves.push({
        w,
        wi,
        grounded: true,
        load: st.load,
        contactY: st.contactY,
        anchor: anchorWorld,
        patchVel,
        heading: wheelFwd,
        normal: st.contactNormal.clone(),
        driveT,
        brakeM,
      })
    }

    for (const s of solves) {
      const { w, wi } = s
      const driven = w.front ? frontDriven : rearDriven
      if (!s.grounded) {
        this.lastWheelLong[wi] = 0
        this.lastTireDiag[wi] = this.tireModel.eval({
          grounded: false,
          normalLoad: 0,
          normal: { x: 0, y: 1, z: 0 },
          patchVel: { x: 0, y: 0, z: 0 },
          wheelOmega: 0,
          wheelHeading: { x: 0, y: 0, z: -1 },
          bodyForward: { x: 0, y: 0, z: -1 },
        })
        continue
      }
      const omega = this.wheelDynamics.wheels[wi].omega
      const contact = {
        grounded: true,
        normalLoad: s.load,
        normal: { x: s.normal.x, y: s.normal.y, z: s.normal.z },
        patchVel: { x: s.patchVel.x, y: s.patchVel.y, z: s.patchVel.z },
        wheelOmega: omega,
        wheelHeading: { x: s.heading.x, y: s.heading.y, z: s.heading.z },
        bodyForward: { x: fwd.x, y: 0, z: fwd.z },
      }
      const res = this.tireModel.eval(contact)

      let legacyLong = 0
      if (this.gear >= 1 && fwdSpeed < 0.05 && fwdSpeed > -2) {
        if (driven) legacyLong += clamp(-fwdSpeed * 1500, 0, 2000)
      }
      if (
        this.gear >= 1 &&
        input.throttle < 0.05 &&
        input.brake < 0.05 &&
        fwdSpeed > -0.5 &&
        fwdSpeed < 3.5
      ) {
        if (driven)
          legacyLong +=
            (P.transmission.torqueConverter.creepForce /
              Math.max(1, drivenCount)) *
            clamp(1 - fwdSpeed / 3.5, 0, 1)
      }
      if (this.gear === -1) {
        if (
          driven &&
          input.throttle < 0.05 &&
          input.brake < 0.05 &&
          fwdSpeed < 0.5 &&
          fwdSpeed > -3
        ) {
          legacyLong -=
            (P.transmission.torqueConverter.creepForceReverse /
              Math.max(1, drivenCount)) *
            clamp(1 + fwdSpeed / 3, 0, 1)
        }
      }
      if (
        driven &&
        input.throttle < 0.05 &&
        this.gear >= 1 &&
        Math.abs(res.vx) > 1
      ) {
        const lockup = clamp((speedKmh - 10) / 15, 0, 1)
        const engFric =
          P.engine.frictionTorqueBase +
          this.rpm * P.engine.frictionTorqueRPMFactor
        const coastT =
          (engFric * gearRatio * 0.9 * lockup * 0.5) / 2 / wheelRadius
        legacyLong += clamp(-Math.sign(res.vx) * coastT, -2500, 2500)
      }

      const lag = this.tireLag[wi]
      const rate = (Math.abs(res.vx) + 0.5) / P.wheels.relaxationLength
      lag.fx = (lag.fx + dt * rate * res.fx) / (1 + dt * rate)
      lag.fy = (lag.fy + dt * rate * res.fy) / (1 + dt * rate)
      this.lastTireDiag[wi] = res

      if (driven) {
        totalSlip += Math.abs(res.sx)
        rearSlipSum += res.sx
        rearCount++
      }

      this.wheelDynamics.step(
        wi,
        dt,
        s.driveT,
        s.brakeM,
        lag.fx * wheelRadius,
        res.vx,
      )

      const fxFinal = lag.fx + legacyLong
      const fyFinal = lag.fy
      this.lastWheelLong[wi] = fxFinal

      const FxLat = res.l.x * fyFinal
      const FyLat = res.l.y * fyFinal
      const FzLat = res.l.z * fyFinal

      const FxLong = res.t.x * fxFinal
      const FyLong = res.t.y * fxFinal
      const FzLong = res.t.z * fxFinal

      const applyY = s.contactY + (s.anchor.y - s.contactY) * 0.5
      // Lateral forces at roll-center height for realistic cornering body roll
      if (Math.abs(fyFinal) > 0.01) {
        this.body.applyImpulseAtPoint(
          { x: FxLat * dt, y: FyLat * dt, z: FzLat * dt },
          { x: s.anchor.x, y: applyY, z: s.anchor.z },
          true,
        )
      }
      // Longitudinal drive/brake forces applied through chassis height (anti-squat / anti-dive)
      // preventing massive pitch torque from launching high-power cars at speed
      if (Math.abs(fxFinal) > 0.01) {
        this.body.applyImpulseAtPoint(
          { x: FxLong * dt, y: FyLong * dt, z: FzLong * dt },
          { x: s.anchor.x, y: bodyPos.y, z: s.anchor.z },
          true,
        )
      }
    }

    this.slipRatioAvg +=
      ((groundedWheels > 0 ? totalSlip / 4 : 0) - this.slipRatioAvg) *
      Math.min(1, dt * 5)
    if (rearCount > 0) this.rearSlip = rearSlipSum / rearCount
    const rearOm = this.wheelDynamics.omegas()
    this.wheelOmega = (rearOm[2] + rearOm[3]) / 2
    this.spinOmega = this.wheelOmega
    this.drifting = Math.abs(this.lateralVelocity()) > 4.5 && speedKmh > 40

    const vVec = new THREE.Vector3(linvel.x, 0, linvel.z)
    const vMag = vVec.length()
    if (vMag > 0.5) {
      const dragF =
        0.5 *
        P.aero.airDensity *
        P.aero.dragCoefficient *
        P.aero.frontalArea *
        vMag *
        vMag
      const rawDownF =
        (P.aero.downforceAt100kmh / Math.pow(27.78, 2)) * vMag * vMag
      const maxDownF = Math.min(2200, (P.mass?.total ?? 1600) * 9.81 * 0.22)
      const downF = maxDownF * Math.tanh(rawDownF / maxDownF)
      const drag = vVec.clone().normalize().multiplyScalar(-dragF)
      this.body.applyImpulse(
        { x: drag.x * dt, y: -downF * dt, z: drag.z * dt },
        true,
      )
    }
    {
      const upV = new THREE.Vector3(0, 1, 0).applyQuaternion(quat)
      if (upV.y < 0.4 && vMag < 6) {
        const lv = this.body.linvel()
        if (lv.y > -8) {
          const av = this.body.angvel()
          const fwdV = new THREE.Vector3(0, 0, -1).applyQuaternion(quat)
          const wFwd = av.x * fwdV.x + av.y * fwdV.y + av.z * fwdV.z
          if (Math.abs(wFwd) < 6) {
            const rollT =
              (input.throttle - input.brake) * 16000 - input.steer * 9000
            if (rollT !== 0) {
              this.body.applyTorqueImpulse(
                {
                  x: fwdV.x * rollT * dt,
                  y: fwdV.y * rollT * dt,
                  z: fwdV.z * rollT * dt,
                },
                true,
              )
            }
          }
        }
      }
    }
    {
      const lv = this.body.linvel()
      const sp2 = lv.x * lv.x + lv.y * lv.y + lv.z * lv.z
      if (sp2 > 10000) {
        const s = 100 / Math.sqrt(sp2)
        this.body.setLinvel({ x: lv.x * s, y: lv.y * s, z: lv.z * s }, true)
      }
      const av = this.body.angvel()
      const an2 = av.x * av.x + av.y * av.y + av.z * av.z
      if (an2 > 81) {
        const s = 9 / Math.sqrt(an2)
        this.body.setAngvel({ x: av.x * s, y: av.y * s, z: av.z * s }, true)
      }
    }

    const angvel = this.body.angvel()
    this.body.applyTorqueImpulse({ x: 0, y: -angvel.y * 1800 * dt, z: 0 }, true)

    if (Math.abs(fwdSpeed) > 2.5 && groundedWheels >= 3 && !input.handbrake) {
      const steering = Math.abs(input.steer) >= 0.05
      const deadzone = steering ? 0.06 : 0.02
      const betaExcess = Math.abs(beta) - deadzone
      if (betaExcess > 0) {
        const speedF = clamp(Math.abs(fwdSpeed) / 33.3, 0, 1)
        const armed = this.launchArmed || this.launching
        const powerOn = input.throttle > 0.15 && !armed
        const authority =
          (steering ? lerp(0.9, 0.5, speedF) : 1) *
          (0.5 + P.assists.stabilityControl) *
          (powerOn ? 1.0 : 1.35)
        let esc = -Math.sign(beta) * betaExcess * 6000 - angvel.y * 1500
        const countersteering = Math.sign(input.steer) === -Math.sign(beta)
        const intent = countersteering
          ? input.steer *
            clamp(betaExcess / 0.1, 0, 1) *
            P.assists.countersteerAssist
          : 0
        esc += intent
        this.body.applyTorqueImpulse(
          { x: 0, y: clamp(esc * authority, -6000, 6000) * dt, z: 0 },
          true,
        )
      }
    }

    const gearLabel =
      this.gear === -1 ? "R" : this.gear === 0 ? "N" : String(this.gear)
    return {
      speedKmh: Math.abs(fwdSpeed) * 3.6 * Math.sign(fwdSpeed || 1),
      rpm: Math.round(this.rpm),
      gear: this.gear,
      gearLabel,
      autoMode: this.autoMode,
      throttle: input.throttle,
      brake: input.brake,
      steer: input.steer,
      shifting,
      launchArmed: this.launchArmed,
      launching: this.launching,
      parkingBrake: this.parkingBrake,
      cruiseOn: this.cruiseActive,
      cruiseTargetKmh: this.cruiseTargetKmh,
      slipRatio: this.slipRatioAvg,
      drift: this.drifting,
      dash: this.dash,
      aggression: this.aggression,
    }
  }

  private lateralVelocity(): number {
    const v = this.body.linvel()
    const q = this.body.rotation()
    const quat = new THREE.Quaternion(q.x, q.y, q.z, q.w)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat)
    return v.x * right.x + v.z * right.z
  }

  private predictedRpm(gear: Gear): number {
    if (gear <= 0) return 0
    const P = this.P
    const ratio =
      P.transmission.gearRatios[gear - 1] * P.transmission.finalDriveRatio
    return Math.abs((this.wheelOmega * ratio * 60) / (2 * Math.PI))
  }

  private manualShift(dir: 1 | -1) {
    if (this.shiftTimer > 0) return
    const n = this.P.transmission.gearRatios.length
    const order: Gear[] = [-1, 0]
    for (let g = 1; g <= n; g++) order.push(g as Gear)
    const i = order.indexOf(this.gear)
    const j = clamp(i + dir, 0, order.length - 1)
    if (j === i) return
    if (order[j] === -1 && Math.abs(this.forwardSpeed) > 3) return
    if (order[j] >= 1 && this.gear === 0 && Math.abs(this.forwardSpeed) > 60)
      return
    if (
      order[j] >= 1 &&
      dir < 0 &&
      this.predictedRpm(order[j]) > this.P.engine.redlineRPM - 200
    )
      return
    const prevGear = this.gear
    const prevRpm = this.rpm
    this.gear = order[j]
    this.shiftTimer = this.P.transmission.shiftTimeManual
    this.gearChangeDelayTimer = 0.85

    // High-RPM clutch dump / neutral drop:
    if (
      prevGear === 0 &&
      this.gear === 1 &&
      prevRpm > this.P.engine.idleRPM * 1.8
    ) {
      this.clutchDumpTimer = 0.65
      const biteDrop = Math.min(800, prevRpm * 0.12)
      this.rpm = Math.max(prevRpm - biteDrop, this.P.engine.idleRPM * 2)

      const ratio =
        this.P.transmission.gearRatios[0] *
        this.P.transmission.finalDriveRatio
      const spinOmega = ((this.rpm / 60) * (2 * Math.PI)) / ratio
      const split = this.P.drivetrain.frontTorqueSplit
      const rearDriven = split < 0.999
      const frontDriven = split > 0.001

      for (let wi = 0; wi < this.wheelDefs.length; wi++) {
        const w = this.wheelDefs[wi]
        const driven = w.front ? frontDriven : rearDriven
        if (driven && this.wheelDynamics.wheels[wi]) {
          this.wheelDynamics.wheels[wi].omega = spinOmega * 0.85
        }
      }
      this.wheelOmega = spinOmega * 0.85
      return
    }

    this.afterShift()
  }

  private doShift(dir: number) {
    const n = this.P.transmission.gearRatios.length
    const next = clamp((this.gear as number) + dir, 1, n) as Gear
    if (next === this.gear) return
    if (dir < 0 && this.predictedRpm(next) > this.P.engine.redlineRPM - 200)
      return
    this.gear = next
    this.shiftTimer = this.P.transmission.shiftTimeAuto
    this.gearChangeDelayTimer = Math.abs(dir) > 1 ? 1.1 : 0.85
    this.afterShift()
  }

  private afterShift() {
    const P = this.P
    if (this.gear === 0 || this.gear === -1) return
    const ratio =
      P.transmission.gearRatios[this.gear - 1] * P.transmission.finalDriveRatio
    const coupled = Math.abs((this.wheelOmega * ratio * 60) / (2 * Math.PI))
    this.rpm = clamp(coupled, P.engine.idleRPM, P.engine.redlineRPM - 400)
  }
}
