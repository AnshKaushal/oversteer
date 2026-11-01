import type { PaintTextureRule } from "../systems/carTint"
import type { WheelDef } from "../physics/vehicle/components/Suspension"

/** Wheelbase and track are derived from `CarSpec.wheels`, not stored. */
export interface Dimensions {
  width: number
  height: number
  length: number
  groundClearance: number
  /** Centre of mass above flat ground at rest (m). */
  centerOfMassHeight: number
  /** Centre of mass offset along the body z axis (front is -z) from the body origin (m). */
  centerOfMassOffsetZ: number
}

export interface Mass {
  chassis: number
  frontWheel: number
  rearWheel: number
}

/** What the engine is: sets its rotating inertia, so revving speed follows the build. */
export interface EngineConfig {
  layout: "inline" | "v" | "flat"
  cylinders: number
  displacementL: number
  /** Flywheel build: road (heavy), sport, or race (very light). */
  flywheel: "road" | "sport" | "race"
}

export interface Engine {
  config: EngineConfig
  /** Peak torque (Nm) the curve fractions scale. Peak power and the rpm of both peaks are derived: see `enginePeaks`. */
  maxTorqueNm: number
  redlineRPM: number
  idleRPM: number
  revLimiterRPM: number
  /** [rpm, fraction of maxTorqueNm], ascending rpm. */
  torqueCurve: [number, number][]
  /** Rotating inertia (kg m^2), derived from `config` by `engineBuild`; limits how fast a free engine revs. */
  engineInertia: number
  /** [throttle pedal 0..1, fraction of full torque], ascending. */
  throttleMap: [number, number][]
  /** Engine braking: pumping loss at closed throttle (Nm), before the rpm term. */
  engineBrakeBase: number
  /** Pumping loss growth with rpm (Nm per rpm). */
  engineBrakeRPMFactor: number
  frictionTorqueBase: number
  frictionTorqueRPMFactor: number
  dynamics: EngineDynamicsSpec
  /** Present only on turbocharged engines. The torque curve is the fully boosted one. */
  turbo?: TurboSpec
}

export interface TurboSpec {
  /** [rpm, steady-state boost 0..1 at full throttle], ascending rpm. */
  boostCurve: [number, number][]
  /** Share of the curve torque that comes from boost (0..1). */
  boostTorqueShare: number
  /** Approach rate toward a higher boost target (1/s). */
  spoolUpRate: number
  /** Approach rate toward a lower boost target (1/s). */
  spoolDownRate: number
  /** Throttle below which the turbo stops spooling. */
  minThrottle: number
}

export interface Transmission {
  gearRatios: number[]
  finalDriveRatio: number
  reverseRatio: number
  shiftTimeAuto: number
  shiftTimeManual: number
  clutchEngagementRPM: number
  clutchSlipTime: number
  launchControlRPM: number
  launchControlActive: boolean
  torqueConverter: {
    stallMultiplication: number
    lockupSpeedKmh: number
  }
  /** Upshift rpm override for every gear. Leave out to compute it per gear from the torque curve. */
  autoUpshiftRPM?: number
  autoDownshiftRPM: number
}

/** Left/right split of each driven axle's torque. */
export interface Differential {
  type: "open" | "lsd" | "locked"
  /** Max torque moved to the slower wheel, as a fraction of axle torque under power. */
  lsdAccelLock: number
  /** The same fraction when off power. */
  lsdDecelLock: number
  /** Transfer cap that exists at zero torque (Nm). */
  preloadTorque: number
  /** Torque moved per rad/s of left/right speed difference (Nm per rad/s). */
  lockStiffness: number
}

/** Present on AWD cars with a speed-sensitive centre coupling. Without it the split is fixed. */
export interface CenterDiffSpec {
  type: "viscous" | "active"
  /** Front share moved per rad/s that the rear axle runs faster than the front. */
  lockStiffness: number
  minFrontShare: number
  maxFrontShare: number
  /** Actuator response for the active type (1/s). */
  responseRate: number
}

export interface Drivetrain {
  type: string
  /** Front share of drive torque; the base share when a centre diff is present. */
  frontTorqueSplit: number
  centerDiff?: CenterDiffSpec
  /** Fraction of engine torque that reaches the wheels. */
  efficiency: number
  /** Throttle that starts a launch torque ramp. */
  feedThrottle: number
  /** Speed below which a launch ramp may start (km/h). */
  feedSpeedKmh: number
  /** Throttle that holds the ramp on in gear 1. */
  feedHoldThrottle: number
  /** Torque fraction at the start of the ramp. */
  feedBase: number
  /** Fraction added over `feedTime`. */
  feedRamp: number
  /** Ramp duration (s). */
  feedTime: number
}

export interface PacejkaCurve {
  B: number
  C: number
  D: number
  E: number
  Sh: number
  Sv: number
}

export interface LoadedPacejkaCurve extends PacejkaCurve {
  loadSensitivity: number
}

/** One axle's spring, damper and ride height. */
export interface AxleSuspension {
  /** Wheel rate (N/m). */
  springRate: number
  /** Damping while compressing (N s/m). */
  bumpDamping: number
  /** Damping while extending (N s/m); normally higher than bump. */
  reboundDamping: number
  /** Height of the suspension anchor above flat ground at rest (m). The spring free length is derived from it. */
  rideHeight: number
}

export interface SuspensionSpec {
  front: AxleSuspension
  rear: AxleSuspension
  travel: number
  antiRollBarFront: number
  antiRollBarRear: number
  /** Ray origin lift above the anchor (m). */
  rayLift: number
  /** Extra ray reach beyond the spring free length (m). */
  reachMargin: number
  /** Most negative compression before the wheel hangs (m). */
  droopLimit: number
  /** Compression where the bump stop starts (m). */
  bumpStart: number
  bumpGain: number
  arbForceLimit: number
  maxCornerForce: number
  /** Rays hitting closer than this time of impact count as no contact. */
  minContactToi: number
  /** Added to travel to get the hard compression limit (m). */
  travelMargin: number
  /** Body up.y below this disables suspension forces (flipped car). */
  minUpY: number
}

export interface TireSpec {
  /** Speed scale of rolling-resistance fade-in (m/s). */
  rollingV0: number
  /** How strongly slip on one axis weakens the force on the other (1 / hypot(1, weight * slip)). */
  combinedWeight: number
  /** Largest slip the contact patch can hold: deflection is clamped to this many relaxation lengths. */
  maxSlip: number
}

/** Static alignment of one axle, degrees. Camber negative = top leaning in; toe positive = pointing in. */
export interface AxleAlignment {
  camberDeg: number
  toeDeg: number
}

export interface AlignmentSpec {
  front: AxleAlignment
  rear: AxleAlignment
  /** Extra negative camber per metre of suspension compression (deg/m). */
  camberGainDegPerM: number
  /** Lateral force from camber as an equivalent slip angle per radian of camber. */
  camberThrust: number
}

export interface Wheels {
  radius: number
  width: number
  frictionMu: number
  referenceLoad: number
  rollingResist: number
  relaxationLength: number
  slipDampRate: number
  tire: TireSpec
  pacejka: {
    longitudinal: LoadedPacejkaCurve
    lateral: LoadedPacejkaCurve
    aligning: PacejkaCurve
  }
  alignment: AlignmentSpec
  suspension: SuspensionSpec
  brakeForce: { front: number; rear: number }
  handbrakeForce: number
  steering: {
    maxAngle: number
    speedSensitivity: number
    speedFalloffKmh: number
    minAngleAtSpeed: number
    /** Steering-lock falloff gain: 1 / (1 + (v/falloff)^2 * sensitivity * gain). */
    falloffGain: number
    /** Lateral acceleration used to cap the steer angle at speed (m/s^2). */
    gripCapAccel: number
    /** Floor of v^2 in the grip cap (m^2/s^2). */
    gripCapMinSpeedSq: number
    /** Steering wheel slew rate (rad/s). */
    ratePerSec: number
    /** Distance behind the contact centre where a front tyre's side force acts at small slip (m); sets the self-aligning torque. */
    pneumaticTrail: number
    /** 0 = parallel steering, 1 = full Ackermann geometry. */
    ackermannFactor: number
  }
}

/** Movable aero (a DRS-style flap): trades downforce for drag on a straight, closed again in corners. */
export interface ActiveAero {
  /** Opens above this speed (m/s). */
  minSpeed: number
  /** Stays closed while steering input exceeds this (0..1). */
  maxSteer: number
  /** Drag and downforce multipliers when fully open. */
  dragScale: number
  downforceScale: number
  /** How fast the flap opens and closes (1/s). */
  blendRate: number
}

export interface Aero {
  dragCoefficient: number
  frontalArea: number
  liftCoefficient: number
  downforceAt100kmh: number
  airDensity: number
  /** Speed at which `downforceAt100kmh` applies (m/s). */
  downforceRefSpeed: number
  /** Below this speed no aero force is applied (m/s). */
  minSpeed: number
  /** Extra drag as a multiple of sin^2(yaw angle to the airflow). */
  yawDragGain: number
  /** Downforce lost as a multiple of sin^2(yaw angle to the airflow). */
  yawDownforceLoss: number
  active?: ActiveAero
}

export interface SpeedFeel {
  fovBase: number
  fovMax: number
  fovAtMaxSpeedKmh: number
  linesStrength: number
  linesFromKmh: number
  shakeAmp: number
  shakeFromKmh: number
}

export interface AbsSpec {
  /** Brake input above which the wheel is watched for lock-up. */
  brakeMin: number
  /** Below this ground speed the wheels may lock (m/s). */
  minSpeed: number
  /** Wheel lock slip, 1 - wheelSpeed / groundSpeed, the controller holds the wheel near. */
  slipTarget: number
  /** Pressure is reapplied once the lock slip falls below slipTarget times this. */
  reapplyFraction: number
  /** Brake pressure fraction released per second while the wheel is past the target. */
  releaseRate: number
  /** Brake pressure fraction regained per second once the wheel has recovered. */
  applyRate: number
}

export interface TractionSpec {
  slipStart: number
  slipRange: number
  maxCutLaunching: number
  maxCutDumping: number
  maxCutNormal: number
  gainMultiplier: number
  gainLaunching: number
  gainDumping: number
  /** Driven-wheel slip ratio past which that wheel is braked. */
  brakeSlipStart: number
  /** Brake fraction per unit of slip beyond brakeSlipStart. */
  brakeGain: number
  /** Most of the axle's brake torque traction control may use on one wheel. */
  brakeMaxFraction: number
  /** Floor of the ground speed in the slip ratio (m/s). */
  slipSpeedFloor: number
  /** The brake on a spinning wheel may reach this multiple of the drive torque there. */
  brakeDriveShare: number
}

/** Electronic stability control: brakes single wheels to steer the yaw rate toward what the driver asked for. */
export interface StabilitySpec {
  minSpeed: number
  minGroundedWheels: number
  /** The car's own understeer gradient (deg per g); sets the yaw rate it should follow. */
  understeerDegPerG: number
  /** Share of the tyres' friction limit the reference yaw rate may ask for. */
  gripFraction: number
  /** Yaw rate error (rad/s) and body side slip (rad) that are tolerated. */
  yawDeadzone: number
  betaDeadzone: number
  /** Brake fraction per rad/s of yaw rate error and per rad of side slip. */
  yawGain: number
  betaGain: number
  /** Understeer is corrected at this share of the oversteer authority. */
  understeerScale: number
  /** Most of the axle's brake torque one wheel may get. */
  maxBrakeFraction: number
  /** Brake fraction on one wheel above which the dash light comes on. */
  indicateFraction: number
  /** Brake slip ratio past which the stability brake on a wheel is backed off, so it keeps its cornering grip. */
  wheelSlipLimit: number
  /** Brake fraction per second the modulator builds and releases. */
  pressureRiseRate: number
  pressureFallRate: number
  /** Engine torque cut per unit of brake fraction, and its limit. */
  engineCutGain: number
  maxEngineCut: number
}

/** Always-on yaw torque that pulls the nose back toward the velocity direction (sideslip) and helps countersteer. */
export interface BodyStabilitySpec {
  /** Added to baseAuthority to scale the torque. */
  authority: number
  /** Torque per unit of countersteer input (N·m). */
  countersteer: number
  /** N·m per rad of sideslip beyond the deadzone. */
  sideSlipGain: number
  /** N·m per rad/s of yaw rate while correcting. */
  yawDamp: number
  maxTorque: number
  /** Sideslip (rad) ignored with no steering / while steering. */
  deadzone: number
  deadzoneSteering: number
  /** Steer input above which the driver counts as steering. */
  steeringThreshold: number
  minSpeed: number
  minGrounded: number
  /** Speed (m/s) where steering authority reaches its high-speed value. */
  speedRef: number
  steeringAuthorityLow: number
  steeringAuthorityHigh: number
  baseAuthority: number
  /** Throttle above which the car counts as power-on. */
  powerOnThrottle: number
  /** Authority multiplier off the throttle. */
  liftBoost: number
  /** Sideslip beyond the deadzone (rad) at which countersteer help is full. */
  countersteerRange: number
}

export interface Assists {
  tractionControl: number
  bodyStability: BodyStabilitySpec
  abs: AbsSpec
  traction: TractionSpec
  stability: StabilitySpec
  speedFeel: SpeedFeel
  absEnabled: boolean
}

/** Rigid body and collider shape. Ratios are of the car's own dimensions. */
/** How a hit may throw the car and how long it upsets the tyres (see `data/crash.ts`). */
export interface CrashSpec {
  /** A velocity change in one step above this (m/s) is a hit. */
  detectDeltaV: number
  /** Extra velocity change (m/s) over `detectDeltaV` at which a hit counts as full severity. */
  severeDeltaV: number
  /** Most upward speed (m/s) a hit may add. */
  maxLaunchSpeed: number
  /** Most spin (rad/s) a hit may add on any axis. */
  maxSpin: number
  /** Share of tyre grip lost at full severity (0..1). */
  gripLoss: number
  /** Seconds for the lost grip to come back. */
  gripRecovery: number
}

export interface Chassis {
  linearDamping: number
  angularDamping: number
  /** Yaw torque per rad/s of yaw rate (N·m·s): the damping the contact patches do not resolve. */
  yawDamping: number
  crash: CrashSpec
  lower: {
    halfHeightRatio: number
    offsetY: number
    friction: number
    restitution: number
  }
  cabin: {
    halfWidthRatio: number
    halfHeightRatio: number
    halfLengthRatio: number
    offsetYRatio: number
    offsetZRatio: number
    friction: number
    restitution: number
  }
  /** Kinematic collider that stands in for a networked peer's car. */
  remote: { friction: number; restitution: number }
}

export interface BrakesSpec {
  parkingTorque: number
  parkingReleaseThrottle: number
  /** The parking brake only toggles below this speed (km/h), so a handbrake tap in a slide stays a handbrake. */
  parkToggleMaxKmh: number
  /** Present only on cars whose brakes fade when hot. */
  fade?: BrakeFadeSpec
}

export interface BrakeFadeSpec {
  /** Heat capacity of one rotor (J per deg C). */
  heatCapacity: number
  ambientC: number
  /** Cooling rate toward ambient at standstill (1/s). */
  coolBase: number
  /** Extra cooling per km/h of airflow (1/s per km/h). */
  coolPerKmh: number
  /** Rotor temperature where torque starts to drop (deg C). */
  fadeStartC: number
  /** Rotor temperature where torque reaches `minFraction` (deg C). */
  fadeEndC: number
  /** Share of full brake torque left when fully faded. */
  minFraction: number
}

export interface KinematicsSpec {
  speedFilterRate: number
  betaMinSpeed: number
  betaMax: number
  driftLateralSpeed: number
  driftMinKmh: number
}

export interface CruiseSpec {
  pauseBrake: number
  pauseMinKmh: number
  pauseReverseSpeed: number
  minSetKmh: number
  throttleGain: number
  throttleMax: number
  trimGain: number
  trimMin: number
  trimMax: number
  brakeDeadband: number
  brakeGain: number
  brakeOffset: number
  brakeMax: number
  overrideThrottle: number
  resumeError: number
}

export interface AutoDirectionSpec {
  standstillSpeed: number
  brakePress: number
  throttlePress: number
  pedalRelease: number
  holdTime: number
  neutralTime: number
  reverseExitSpeed: number
}

export interface LaunchSpec {
  armThrottle: number
  armBrake: number
  activeThrottle: number
  syncFraction: number
  holdTime: number
  bogDuration: number
  bogDepth: number
  dumpTime: number
  dumpTriggerRpmFactor: number
  dumpBiteMax: number
  dumpBiteFraction: number
  dumpMinRpmFactor: number
  dumpSpinFraction: number
  wobbleFrequency: number
  wobbleAmplitude: number
}

export interface ShiftLogicSpec {
  /** Driver aggression the realistic shift mode shifts at, 0..1; arcade follows the pedals instead. */
  realisticAggression: number
  upMargin: number
  /** Seconds rpm must stay over the shift point before 1st→2nd (default 0.45); lets launches rev out and stutter. */
  firstGearHold?: number
  /** Max seconds an upshift is held back while the wheels are slipping, in any gear (default 1). */
  slipShiftHoldMax?: number
  /** Rpm step when scanning the torque curve for the best shift point. */
  optimalScanStepRpm: number
  lowUpFraction: number
  lowDownIdleFactor: number
  lowDownIdleAdd: number
  highDownFraction: number
  decisionRateUp: number
  decisionRateDown: number
  tipInRate: number
  tipInBonus: number
  brakeBonusThreshold: number
  brakeBonus: number
  aggressionRise: number
  aggressionHold: number
  aggressionDecay: number
  hysteresis: number
  slipLimit: number
  slideLimit: number
  antiStallRpmFactor: number
  antiStallKmh: number
  upshiftMinKmh: number
  kickdownRpmMargin: number
  kickdownThrottleAggressive: number
  kickdownAggression: number
  kickdownThrottleFull: number
  kickdownHeadroomMin: number
  kickdownHeadroomFraction: number
  kickdownMinRpmFactor: number
  kickdownDelay: number
  /** Seconds after an upshift before a kickdown may drop the gear again, so a shift does not hunt. */
  kickdownAfterUpshift: number
  downPreferredMargin: number
  downPreferredLow: number
  changeDelay: number
  changeDelayMulti: number
  overRevMargin: number
  minDt: number
  cancelThrottle: number
  cancelBrake: number
  manualReverseMaxSpeed: number
  manualNeutralMaxSpeed: number
}

export interface EngineDynamicsSpec {
  neutralRevFraction: number
  neutralRiseRate: number
  neutralDecayBase: number
  neutralDecayExtra: number
  neutralDecayRefRpm: number
  /** Engine speed at full pedal while the clutch or converter slips, before the car moves (rpm). */
  launchFlareRPM: number
  dumpRevFraction: number
  idleFloorFraction: number
  airborneThrottle: number
  airborneMarginRpm: number
  kickSurgeBase: number
  kickSurgeRamp: number
  kickSurgeDuration: number
  rateNormal: number
  rateLaunch: number
  rateDump: number
  rateKickdown: number
  limiterHysteresis: number
  /** After a shift rpm is clamped to redline minus this (rpm). */
  afterShiftCeilingMargin: number
  frictionShare: number
  shiftCutFraction: number
  /** Wheel-to-engine speed ratio (0..1) where a slipping clutch or converter starts to bite. */
  clutchLockStart: number
  /** Torque a locked clutch holds, as a multiple of peak engine torque. */
  clutchHoldMargin: number
  /** Torque the idle governor can add to hold idle against clutch or converter drag, as a fraction of peak torque. */
  idleHoldFraction: number
  /** Least acceleration (m/s^2) the drivetrain must give from rest at full-pedal converter torque; a gear that cannot stalls the engine. */
  stallMinAccel: number
  /** Seconds the engine struggles in such a gear before it dies. */
  stallDelay: number
  /** Seconds the starter takes to bring a stalled engine back to idle. */
  restartTime: number
}

/** Low-speed creep, standstill hold and engine-braking forces. */
/** Engine braking off the throttle (creep itself comes from the clutch / converter model). */
export interface CreepSpec {
  idleThrottle: number
  coastMinSlipSpeed: number
  coastLockupStartKmh: number
  coastLockupRangeKmh: number
  coastShare: number
  coastMax: number
}

export interface ContactSpec {
  applyHeightFraction: number
  relaxationSpeedFloor: number
  slipAverageRate: number
}

export interface SelfRightSpec {
  maxUpY: number
  maxSpeed: number
  minVerticalSpeed: number
  maxRollRate: number
  throttleTorque: number
  steerTorque: number
}

export interface LimitsSpec {
  maxSpeed: number
  maxAngularSpeed: number
}

export interface CarPhysicsConfig {
  dimensions: Dimensions
  mass: Mass
  chassis: Chassis
  engine: Engine
  transmission: Transmission
  differential: Differential
  drivetrain: Drivetrain
  wheels: Wheels
  aero: Aero
  assists: Assists
  brakes: BrakesSpec
  kinematics: KinematicsSpec
  cruise: CruiseSpec
  autoDirection: AutoDirectionSpec
  launch: LaunchSpec
  shiftLogic: ShiftLogicSpec
  creep: CreepSpec
  contact: ContactSpec
  selfRight: SelfRightSpec
  limits: LimitsSpec
}

export interface CarDashConfig {
  maxRpm: number
  redFromRpm: number
  maxKmh: number
}

export interface CarTested {
  zeroToHundredS: number
  topSpeedKmh: number
}

export interface CarSpec {
  id: string
  name: string
  shortName: string
  modelFile: string
  physics: CarPhysicsConfig
  wheels: [WheelDef, WheelDef, WheelDef, WheelDef]
  pivots: { pattern?: string; names?: string[] }
  dash: CarDashConfig
  tested: CarTested
  defaultTint: number | null
  paintMatch?: string[]
  paintTexture?: PaintTextureRule
}

export type CarDefinition = CarSpec
