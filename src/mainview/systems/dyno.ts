import { useSyncExternalStore } from "react"
import { curveLookup } from "../physics/math"
import { Engine } from "../physics/vehicle/components/Engine"
import { Gearbox } from "../physics/vehicle/components/Gearbox"
import { ShiftLogic } from "../physics/vehicle/components/ShiftLogic"
import { Aggression } from "../physics/vehicle/components/Aggression"
import { TorqueConverter } from "../physics/vehicle/components/TorqueConverter"
import { Driveline } from "../physics/vehicle/components/Driveline"
import { CreepForces } from "../physics/vehicle/components/CreepForces"
import type { Gear } from "../physics/vehicle/types"
import { getCar } from "../data/cars"
import { applyTuning, gearSpeeds, loadTuning, STOCK_TUNING } from "../data/tuning"
import type { CarSpec } from "../data/schema"

const RAD_TO_RPM = 60 / (2 * Math.PI)
const HP = 745.7
const STEP = 1 / 240
/** Same threshold normal driving uses to decide the clutch/converter can slip. */
const SLIP_MIN_RATIO_FRACTION = 0.5
const TARGET_PULL_S = 9

export interface DynoPoint {
  rpm: number
  nm: number
  hp: number
}
export interface Peak {
  v: number
  rpm: number
}
export type DynoPhase = "idle" | "pulling" | "manual" | "cooldown" | "done"

export interface DynoState {
  carId: string
  phase: DynoPhase
  gear: number
  gears: number
  /** Gearbox in automatic (the car's own shift logic) or manual. */
  auto: boolean
  rpm: number
  redline: number
  /** Crank torque (Nm) and crank power (hp) right now. */
  nm: number
  hp: number
  /** Power at the wheels after drivetrain losses. */
  whp: number
  throttle: number
  boost: number
  speedKmh: number
  t: number
  curve: DynoPoint[]
  prev: DynoPoint[] | null
  peakHp: Peak | null
  peakNm: Peak | null
  pullTime: number | null
  topKmh: number | null
  /** True when the last run used different tuning from the one before. */
  retuned: boolean
}

const blank = (): DynoState => ({
  carId: "",
  phase: "idle",
  gear: 1,
  gears: 1,
  auto: true,
  rpm: 0,
  redline: 7000,
  nm: 0,
  hp: 0,
  whp: 0,
  throttle: 0,
  boost: 0,
  speedKmh: 0,
  t: 0,
  curve: [],
  prev: null,
  peakHp: null,
  peakNm: null,
  pullTime: null,
  topKmh: null,
  retuned: false,
})

let state: DynoState = blank()
let active = false
let car: CarSpec | null = null
let eng: Engine | null = null
let omega = 0 // roller / wheel speed, rad/s
let inertia = 100
let throttle = 0
// The car's own drivetrain parts, exactly as normal driving builds them.
let gb: Gearbox | null = null
let shiftLogic: ShiftLogic | null = null
let aggression: Aggression | null = null
let converter: TorqueConverter | null = null
let driveline: Driveline | null = null
let creep: CreepForces | null = null
let autoMode = true
let simT = 0
let acc = 0
let sampleAcc = 0
let startRpm = 2000
let tuningKey = ""
// Pedals: keyboard and gamepad are tracked separately and the larger wins.
const pedals = { kThr: 0, kBrk: 0, pThr: 0, pBrk: 0 }
const manualBins = new Map<number, { nm: number; hp: number }>()
let manualAcc = 0
const prevByCar = new Map<string, { curve: DynoPoint[]; key: string }>()
const subs = new Set<() => void>()
let lastEmit = 0
const emit = (force = false) => {
  const now = performance.now()
  if (!force && now - lastEmit < 33) return
  lastEmit = now
  state = { ...state }
  subs.forEach((f) => f())
}

const ratioOf = (c: CarSpec, g: number) =>
  c.physics.transmission.gearRatios[g - 1] *
  c.physics.transmission.finalDriveRatio
const effOf = (c: CarSpec) =>
  Math.min(1, Math.max(0.5, c.physics.drivetrain.efficiency || 0.9))

/** The gear closest to 1:1 - the usual dyno gear. */
function referenceGear(c: CarSpec): number {
  const r = c.physics.transmission.gearRatios
  let best = 1
  for (let i = 0; i < r.length; i++)
    if (Math.abs(r[i] - 1) < Math.abs(r[best - 1] - 1)) best = i + 1
  return best
}

const startRpmOf = (c: CarSpec) => c.physics.engine.idleRPM * 1.12

/** Steady-state crank output at full throttle and full boost (eddy-brake style). */
function steady(rpm: number): DynoPoint {
  const e = car!.physics.engine
  const nm = e.maxTorqueNm * curveLookup(e.torqueCurve, rpm)
  return { rpm, nm, hp: (nm * rpm) / (HP * (60 / (2 * Math.PI))) }
}
let seenLo = Infinity
let seenHi = 0
const seen = (rpm: number) => {
  seenLo = Math.min(seenLo, rpm)
  seenHi = Math.max(seenHi, rpm)
}

/**
 * Roller inertia is a property of the dyno, not of the car: calibrate it so a
 * stock pull in the reference gear lasts about TARGET_PULL_S, then keep it
 * fixed. Taller gearing then genuinely makes the pull slower.
 */
function calibrate(stock: CarSpec): number {
  const p = stock.physics
  const g = referenceGear(stock)
  const ratio = ratioOf(stock, g)
  const e = new Engine(p.engine)
  const lo = startRpmOf(stock)
  const hi = p.engine.redlineRPM
  let sum = 0
  let n = 0
  for (let r = lo; r <= hi; r += 100) {
    sum += e.fullPedalTorque(r)
    n++
  }
  const avgWheelTq = (sum / Math.max(1, n)) * ratio * effOf(stock)
  const dOmega = (hi - lo) / RAD_TO_RPM / ratio || 1
  return (TARGET_PULL_S * avgWheelTq) / dOmega
}

function resetEngine() {
  if (!car) return
  const P = car.physics
  eng = new Engine(P.engine)
  eng.rpm = P.engine.idleRPM
  const gear = gb?.gear ?? 1
  gb = new Gearbox(P.transmission, P.shiftLogic, P.engine.redlineRPM)
  gb.gear = gear as Gear
  shiftLogic = new ShiftLogic(
    P.shiftLogic,
    P.engine,
    P.transmission.autoUpshiftRPM,
    P.transmission.gearRatios,
  )
  aggression = new Aggression(P.shiftLogic)
  converter = new TorqueConverter(P.transmission.torqueConverter)
  driveline = new Driveline(P.drivetrain)
  creep = new CreepForces(P.creep)
}

const effThrottle = () => Math.max(pedals.kThr, pedals.pThr)
const effBrake = () => Math.max(pedals.kBrk, pedals.pBrk)

function reload() {
  const stock = getCar(state.carId)
  const tuning = loadTuning(state.carId)
  car = applyTuning(stock, tuning)
  tuningKey = JSON.stringify(tuning)
  resetEngine()
}

/** Speed at redline in the current gear - the same formula as the tuning board. */
function redlineKmh(): number {
  if (!car) return 0
  const g = gearSpeeds(car, STOCK_TUNING)
  return g[state.gear - 1]?.kmhAtRedline ?? 0
}

export const dyno = {
  get active() {
    return active
  },
  getState: () => state,
  subscribe(f: () => void) {
    subs.add(f)
    return () => void subs.delete(f)
  },

  enter(carId: string) {
    const stock = getCar(carId)
    const tuning = loadTuning(carId)
    car = applyTuning(stock, tuning)
    tuningKey = JSON.stringify(tuning)
    inertia = calibrate(stock)
    active = true
    omega = 0
    throttle = 0
    autoMode = true
    pedals.kThr = pedals.kBrk = pedals.pThr = pedals.pBrk = 0
    gb = null
    resetEngine()
    gb!.gear = referenceGear(car) as Gear
    const prev = prevByCar.get(carId)
    state = {
      ...blank(),
      carId,
      gear: referenceGear(car),
      gears: car.physics.transmission.gearRatios.length,
      redline: car.physics.engine.redlineRPM,
      prev: prev?.curve ?? null,
    }
    emit(true)
  },

  leave() {
    if (!active) return
    active = false
    car = null
    eng = null
    omega = 0
    state = blank()
    emit(true)
  },

  /**
   * Manual gear change through the car's own gearbox: it refuses a downshift
   * that would over-rev at road speed, takes the car's shift time and cuts
   * torque while it happens. Taking over the gears turns auto off.
   */
  shift(dir: 1 | -1) {
    if (!active || !car || !gb || !eng || state.phase === "pulling") return
    if (gb.gear + dir < 1 || gb.gear + dir > gb.count) return
    const prev = gb.manualShift(
      dir,
      omega * car.physics.wheels.radius,
      omega,
    )
    if (prev === null) return
    autoMode = false
    eng.settleAfterShift(gb.coupledRpm(omega))
    state.gear = gb.gear
    state.auto = false
    emit(true)
  },

  /** Automatic gearbox on/off, the same toggle as in normal driving. */
  toggleAuto() {
    if (!active || state.phase === "pulling") return
    autoMode = !autoMode
    state.auto = autoMode
    emit(true)
  },

  setGear(g: number) {
    dyno.shift(g > state.gear ? 1 : -1)
  },

  setKeys(thr: number, brk: number) {
    pedals.kThr = thr
    pedals.kBrk = brk
  },
  setPad(thr: number, brk: number) {
    pedals.pThr = thr
    pedals.pBrk = brk
  },

  /** Scripted full-throttle pull from low revs to the limiter. */
  start() {
    if (!active || !car) return
    if (state.phase === "pulling" || state.phase === "cooldown") return
    reload()
    startRpm = startRpmOf(car)
    omega = startRpm / RAD_TO_RPM / ratioOf(car, state.gear)
    eng!.rpm = startRpm
    throttle = 0
    gb!.shiftTimer = 0
    simT = 0
    acc = 0
    sampleAcc = 0
    seenLo = Infinity
    seenHi = 0
    const keep = state.curve.length ? state.curve : state.prev
    state = {
      ...state,
      phase: "pulling",
      t: 0,
      curve: [],
      prev: keep && keep.length ? keep : null,
      peakHp: null,
      peakNm: null,
      pullTime: null,
      topKmh: null,
      retuned: false,
    }
    emit(true)
  },

  /** Hands-on mode: throttle, brake and gears are yours. */
  beginManual() {
    if (!active || !car) return
    if (state.phase === "manual" || state.phase === "pulling") return
    if (state.phase === "cooldown") return
    reload()
    startRpm = startRpmOf(car)
    // A gear the converter/clutch can slip in starts from rest and creeps like
    // the car does; a tall gear has no slip, so the rollers start turning.
    const g = gb!
    const slips =
      Math.abs(g.ratio(g.gear)) >= SLIP_MIN_RATIO_FRACTION * g.ratio(1)
    if (omega < 0.5 && !slips)
      omega = startRpm / RAD_TO_RPM / ratioOf(car, state.gear)
    eng!.rpm = Math.max(
      car.physics.engine.idleRPM,
      omega * ratioOf(car, state.gear) * RAD_TO_RPM,
    )
    throttle = 0
    g.shiftTimer = 0
    simT = 0
    acc = 0
    manualAcc = 0
    manualBins.clear()
    seenLo = Infinity
    seenHi = 0
    const keep = state.curve.length ? state.curve : state.prev
    state = {
      ...state,
      phase: "manual",
      t: 0,
      curve: [],
      prev: keep && keep.length ? keep : null,
      peakHp: null,
      peakNm: null,
      pullTime: null,
      topKmh: null,
      retuned: false,
    }
    emit(true)
  },

  /** End a manual session or abort a pull; the rollers spin down. */
  abort() {
    if (state.phase === "pulling") {
      state.phase = "cooldown"
      throttle = 0
      emit(true)
    } else if (state.phase === "manual") {
      finishManual()
      emit(true)
    }
  },

  /** Wheel/roller speed (rad/s) and what the car needs to draw itself. */
  visual() {
    const split = car?.physics.drivetrain.frontTorqueSplit ?? 0
    return {
      active,
      omega,
      rpm01: state.redline ? state.rpm / state.redline : 0,
      front: split > 0.01,
      rear: split < 0.99,
      wheelRadius: car?.physics.wheels.radius ?? 0.33,
      tyreWidth: car?.physics.wheels.width ?? 0.25,
    }
  },

  tick(dtReal: number) {
    if (!active || !car || !eng) return
    // Throttle while idle starts a hands-on session.
    if (
      (state.phase === "idle" || state.phase === "done") &&
      effThrottle() > 0.05
    )
      dyno.beginManual()
    if (state.phase === "idle" || state.phase === "done") {
      // Roller coasts to a stop; engine ticks over.
      gb?.tick(dtReal)
      omega *= Math.exp(-dtReal * 3.5)
      const idle = car.physics.engine.idleRPM
      state.rpm += (idle - state.rpm) * Math.min(1, dtReal * 4)
      state.speedKmh = omega * car.physics.wheels.radius * 3.6
      state.hp = state.nm = state.whp = state.throttle = 0
      emit()
      return
    }
    const p = car.physics
    const eff = effOf(car)
    const g = gb!
    acc += Math.min(dtReal, 0.05)
    while (acc >= STEP) {
      acc -= STEP
      simT += STEP
      const phase = state.phase
      const want =
        phase === "pulling" ? 1 : phase === "manual" ? effThrottle() : 0
      const rate = want > throttle ? (phase === "pulling" ? 2 : 4) : 7
      throttle +=
        Math.sign(want - throttle) *
        Math.min(Math.abs(want - throttle), rate * STEP)
      const brakeIn = phase === "manual" ? effBrake() : 0
      const v = omega * p.wheels.radius
      const speedKmh = v * 3.6

      // From here on this is the same drivetrain sequence as Vehicle.update:
      // gearbox timers, engine rpm (clutch/converter slip), shift logic,
      // engine torque, torque converter, driveline, creep.
      g.tick(STEP)
      shiftLogic!.cancelIfRelaxed(throttle, brakeIn)
      const ratio = g.ratio(g.gear)
      const coupled = Math.abs(omega * ratio * RAD_TO_RPM)
      const canSlip =
        Math.abs(ratio) >= SLIP_MIN_RATIO_FRACTION * g.ratio(1)
      eng.stepRpm({
        dt: STEP,
        simTime: simT,
        gear: g.gear,
        throttle,
        fwdSpeed: v,
        shifting: g.shifting,
        flareRpm: p.engine.dynamics.launchFlareRPM,
        coupledRpm: coupled,
        launchArmed: false,
        launching: false,
        launchBog: 0,
        launchRpm: 0,
        launchWobble: 0,
        clutchDumping: false,
        kickdownTimer: shiftLogic!.kickdownTimer,
        airborne: false,
        canSlip,
      })
      const driven = aggression!.step(
        STEP,
        throttle,
        brakeIn,
        driveline!.prevThrottle,
      )
      g.tickChangeDelay(STEP)
      // Only a hands-on session shifts by itself; a pull holds its gear.
      if (phase === "manual" && autoMode) {
        const delta = shiftLogic!.decide({
          dt: STEP,
          gear: g.gear,
          gearCount: g.count,
          rpm: eng.slipping ? coupled : eng.rpm,
          throttle,
          aggressionCoef: driven,
          speedKmh,
          autoMode: true,
          shifting: g.shifting,
          changeDelayActive: g.changeDelayActive,
          launchArmed: false,
          limiterCut: eng.onLimiter,
          assistCutting: false,
          slipRatioAvg: 0,
          lateralVelocity: 0,
          predictedRpm: (gear) => g.predictedRpm(gear, omega),
          groundRpm: (gear) =>
            gear > 0
              ? Math.abs((v / p.wheels.radius) * g.ratio(gear) * RAD_TO_RPM)
              : 0,
        })
        if (delta !== 0 && g.autoShift(delta, omega))
          eng.settleAfterShift(g.coupledRpm(omega))
      }
      const shifting = g.shifting
      const nm = eng.torque(throttle, g.gear, shifting)
      const driveTq = Math.min(
        Math.max(0, nm, eng.governorTorque),
        eng.clutchCapacity,
      )
      const drive = driveline!.prepare({
        dt: STEP,
        gear: g.gear,
        gearRatio: ratio,
        engineTorque: driveTq,
        converterMultiplier: converter!.multiplier(
          g.gear !== 0 && canSlip,
          speedKmh,
        ),
        throttle,
        speedKmh,
        launchArmed: false,
        launching: false,
        clutchDumping: false,
        rawPower: true,
      })
      const wheelTq = drive.total * drive.feed
      const creepF = creep!.force({
        gear: g.gear,
        driven: true,
        drivenCount: driveline!.drivenCount,
        throttle,
        brake: brakeIn,
        fwdSpeed: v,
        slipSpeed: v,
        speedKmh,
        engineFriction: eng.frictionTorque(),
        engineOn: true,
        gearRatio: ratio,
        efficiency: p.drivetrain.efficiency,
        wheelRadius: p.wheels.radius,
      })
      const creepTorque = creepF * p.wheels.radius * driveline!.drivenCount
      const brakeTq = brakeIn * inertia * 25
      // Aero drag torque at the wheels.
      const aero = p.aero
      let aeroDragF = 0
      if (aero && v > (aero.minSpeed ?? 0)) {
        aeroDragF =
          0.5 *
          aero.airDensity *
          aero.dragCoefficient *
          aero.frontalArea *
          v *
          v
      }
      const aeroTorque = aeroDragF * p.wheels.radius
      // Rolling resistance torque at the wheels.
      const rollingResist = p.wheels.rollingResist ?? 0.015
      const rollingV0 = p.wheels.tire.rollingV0 ?? 5
      const rollingTorque =
        rollingResist * p.wheels.radius * Math.tanh(v / Math.max(0.1, rollingV0))
      const load = 12 + omega * 0.04 + brakeTq + aeroTorque + rollingTorque
      const I = inertia + p.engine.engineInertia * ratio * ratio
      omega = Math.max(0, omega + ((wheelTq + creepTorque - load) / I) * STEP)
      const rpm = eng.rpm
      state.gear = g.gear
      // Crank figures: add back the internal friction the engine model
      // subtracts, so peaks equal the spec-sheet power and torque.
      const crank =
        eng.limiterCut || shifting || nm === 0
          ? 0
          : Math.max(
              0,
              nm + eng.frictionTorque() * p.engine.dynamics.frictionShare,
            )
      const hp = (crank * rpm) / (HP * (60 / (2 * Math.PI)))
      state.rpm = rpm
      state.nm = crank
      state.hp = hp
      state.whp = hp * eff
      state.throttle = throttle
      state.boost = eng.boost
      state.speedKmh = omega * p.wheels.radius * 3.6
      state.t += STEP
      if (phase === "pulling") {
        sampleAcc += STEP
        if (sampleAcc >= 0.04 && throttle >= 1 && !eng.limiterCut) {
          sampleAcc = 0
          state.curve.push(steady(rpm))
          seen(rpm)
        }
        if (
          eng.limiterCut ||
          rpm >= p.engine.redlineRPM * 0.995 ||
          state.t > 40
        )
          finishPull()
      } else if (phase === "manual") {
        if (throttle >= 0.9 && !shifting && !eng.limiterCut) {
          const k = Math.round(rpm / 50) * 50
          const pt = steady(k)
          manualBins.set(k, { nm: pt.nm, hp: pt.hp })
          seen(rpm)
        }
        manualAcc += STEP
        if (manualAcc >= 0.15) {
          manualAcc = 0
          publishManual()
        }
      } else if (phase === "cooldown") {
        omega *= Math.exp(-STEP * 3.0)
        if (rpm < p.engine.idleRPM * 1.3 || omega < 0.5) {
          state.phase = "done"
          break
        }
      }
    }
    emit()
  },
}

/** Peaks over the rpm range actually swept, at 1 rpm resolution like the spec sheet. */
function peaksSwept() {
  let ph: Peak | null = null
  let pn: Peak | null = null
  for (let r = Math.ceil(seenLo); r <= seenHi; r++) {
    const p = steady(r)
    if (!ph || p.hp > ph.v) ph = { v: p.hp, rpm: r }
    if (!pn || p.nm > pn.v) pn = { v: p.nm, rpm: r }
  }
  return { ph, pn }
}

function binned(pts: DynoPoint[]) {
  const bins = new Map<number, DynoPoint>()
  for (const p of pts) {
    const k = Math.round(p.rpm / 50) * 50
    bins.set(k, steady(k))
  }
  return [...bins.values()].sort((a, b) => a.rpm - b.rpm)
}

function publishManual() {
  if (!manualBins.size) return
  state.curve = [...manualBins.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rpm, b]) => ({ rpm, nm: b.nm, hp: b.hp }))
  const { ph, pn } = peaksSwept()
  state.peakHp = ph
  state.peakNm = pn
}

function finishManual() {
  publishManual()
  state.topKmh = redlineKmh()
  state.phase = "cooldown"
  throttle = 0
  if (state.curve.length > 1) {
    const prev = prevByCar.get(state.carId)
    state.retuned = !!prev && prev.key !== tuningKey
    prevByCar.set(state.carId, { curve: state.curve, key: tuningKey })
  }
}

function finishPull() {
  state.pullTime = state.t
  state.topKmh = redlineKmh()
  state.curve = binned(state.curve)
  const { ph, pn } = peaksSwept()
  state.peakHp = ph
  state.peakNm = pn
  state.phase = "cooldown"
  const prev = prevByCar.get(state.carId)
  state.retuned = !!prev && prev.key !== tuningKey
  prevByCar.set(state.carId, { curve: state.curve, key: tuningKey })
}

export const useDyno = () => useSyncExternalStore(dyno.subscribe, dyno.getState)
