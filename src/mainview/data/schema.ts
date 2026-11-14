import type { PaintTextureRule } from "../systems/carTint"
import type { WheelDef } from "../physics/vehicle/components/Suspension"

export interface Dimensions {
  width: number
  height: number
  length: number
  groundClearance: number
  centerOfMassHeight: number
  centerOfMassOffsetZ: number
}

export interface Mass {
  chassis: number
  frontWheel: number
  rearWheel: number
}

export interface EngineConfig {
  layout: "inline" | "v" | "flat"
  cylinders: number
  displacementL: number
  flywheel: "road" | "sport" | "race"
}

export interface Engine {
  config: EngineConfig
  maxTorqueNm: number
  redlineRPM: number
  idleRPM: number
  revLimiterRPM: number
  torqueCurve: [number, number][]
  engineInertia: number
  throttleMap: [number, number][]
  engineBrakeBase: number
  engineBrakeRPMFactor: number
  frictionTorqueBase: number
  frictionTorqueRPMFactor: number
  dynamics: EngineDynamicsSpec
  turbo?: TurboSpec
}

export interface TurboSpec {
  boostCurve: [number, number][]
  boostTorqueShare: number
  spoolUpRate: number
  spoolDownRate: number
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
  autoUpshiftRPM?: number
  autoDownshiftRPM: number
}

export interface Differential {
  type: "open" | "lsd" | "locked"
  lsdAccelLock: number
  lsdDecelLock: number
  preloadTorque: number
  lockStiffness: number
}

export interface CenterDiffSpec {
  type: "viscous" | "active"
  lockStiffness: number
  minFrontShare: number
  maxFrontShare: number
  responseRate: number
}

export interface Drivetrain {
  type: string
  frontTorqueSplit: number
  centerDiff?: CenterDiffSpec
  efficiency: number
  feedThrottle: number
  feedSpeedKmh: number
  feedHoldThrottle: number
  feedBase: number
  feedRamp: number
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

export interface AxleSuspension {
  springRate: number
  bumpDamping: number
  reboundDamping: number
  rideHeight: number
}

export interface SuspensionSpec {
  front: AxleSuspension
  rear: AxleSuspension
  travel: number
  antiRollBarFront: number
  antiRollBarRear: number
  rayLift: number
  reachMargin: number
  droopLimit: number
  bumpStart: number
  bumpGain: number
  arbForceLimit: number
  maxCornerForce: number
  minContactToi: number
  travelMargin: number
  minUpY: number
}

export interface TireSpec {
  rollingV0: number
  maxSlip: number
  /** Fraction of peak grip lost once the contact patch is fully sliding. */
  slideLoss: number
}

export interface AxleAlignment {
  camberDeg: number
  toeDeg: number
}

export interface AlignmentSpec {
  front: AxleAlignment
  rear: AxleAlignment
  camberGainDegPerM: number
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
    falloffGain: number
    gripCapAccel: number
    gripCapMinSpeedSq: number
    ratePerSec: number
    pneumaticTrail: number
    ackermannFactor: number
  }
}

export interface ActiveAero {
  minSpeed: number
  maxSteer: number
  dragScale: number
  downforceScale: number
  blendRate: number
}

export interface Aero {
  dragCoefficient: number
  frontalArea: number
  liftCoefficient: number
  downforceAt100kmh: number
  airDensity: number
  downforceRefSpeed: number
  minSpeed: number
  yawDragGain: number
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
  brakeMin: number
  minSpeed: number
  slipTarget: number
  reapplyFraction: number
  releaseRate: number
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
  brakeSlipStart: number
  brakeGain: number
  brakeMaxFraction: number
  slipSpeedFloor: number
  brakeDriveShare: number
}

export interface StabilitySpec {
  minSpeed: number
  minGroundedWheels: number
  understeerDegPerG: number
  gripFraction: number
  yawDeadzone: number
  betaDeadzone: number
  yawGain: number
  betaGain: number
  understeerScale: number
  maxBrakeFraction: number
  indicateFraction: number
  wheelSlipLimit: number
  pressureRiseRate: number
  pressureFallRate: number
  engineCutGain: number
  maxEngineCut: number
}

export interface BodyStabilitySpec {
  authority: number
  countersteer: number
  sideSlipGain: number
  yawDamp: number
  maxTorque: number
  deadzone: number
  deadzoneSteering: number
  steeringThreshold: number
  minSpeed: number
  minGrounded: number
  speedRef: number
  steeringAuthorityLow: number
  steeringAuthorityHigh: number
  baseAuthority: number
  powerOnThrottle: number
  liftBoost: number
  countersteerRange: number
  /**
   * Extra slip-correction authority per speedRef of speed above speedRef, so
   * a slide at motorway speed is pulled straight instead of settling into a
   * steady drift. Defaults to DEFAULT_HIGH_SPEED_GAIN when omitted.
   */
  highSpeedGain?: number
  /** Drift tuning (1 = stock): scales the slip-angle deadzone while steering. */
  driftDeadzoneScale?: number
  /** Drift tuning (1 = stock): scales how hard the assist pulls back. */
  driftAuthorityScale?: number
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

export interface CrashSpec {
  detectDeltaV: number
  severeDeltaV: number
  maxLaunchSpeed: number
  maxSpin: number
  gripLoss: number
  gripRecovery: number
}

export interface Chassis {
  linearDamping: number
  angularDamping: number
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
  remote: { friction: number; restitution: number }
}

export interface BrakesSpec {
  parkingTorque: number
  parkingReleaseThrottle: number
  parkToggleMaxKmh: number
  fade?: BrakeFadeSpec
}

export interface BrakeFadeSpec {
  heatCapacity: number
  ambientC: number
  coolBase: number
  coolPerKmh: number
  fadeStartC: number
  fadeEndC: number
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
  realisticAggression: number
  upMargin: number
  firstGearHold?: number
  slipShiftHoldMax?: number
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
  afterShiftCeilingMargin: number
  frictionShare: number
  shiftCutFraction: number
  clutchLockStart: number
  clutchHoldMargin: number
  idleHoldFraction: number
  stallMinAccel: number
  stallDelay: number
  restartTime: number
}

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
  tailLampMeshes?: string[]
  flatTailLamps?: boolean
  /** Lamps are painted into the body's emissive map, not separate meshes. */
  emissiveLampMap?: boolean
  paintTexture?: PaintTextureRule
}

export type CarDefinition = CarSpec
