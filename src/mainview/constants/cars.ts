import {
  CAR_PHYSICS,
  createPhysicsConfig,
  type CarPhysicsConfig,
} from "./physics"
import type { PaintTextureRule } from "../systems/carTint"
import type { WheelDef } from "../systems/Suspension"

export interface CarDashConfig {
  maxRpm: number
  redFromRpm: number
  maxKmh: number
}

export interface CarTested {
  zeroToHundredS: number
  topSpeedKmh: number
}

export interface CarDefinition {
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

const M3_WHEELS: CarDefinition["wheels"] = [
  { x: -0.76, z: -1.51, front: true, left: true },
  { x: 0.76, z: -1.51, front: true, left: false },
  { x: -0.76, z: 1.31, front: false, left: true },
  { x: 0.76, z: 1.31, front: false, left: false },
]

const M3_DASH: CarDashConfig = { maxRpm: 8000, redFromRpm: 6750, maxKmh: 340 }

const m3: CarDefinition = {
  id: "bmw-m3",
  name: "BMW M3",
  shortName: "M3",
  modelFile: "models/bmw_m3.glb",
  physics: createPhysicsConfig({}),
  wheels: M3_WHEELS,
  pivots: { pattern: "^Plane00[3-6]$" },
  dash: M3_DASH,
  defaultTint: 0x000000,
  tested: { zeroToHundredS: 4.3, topSpeedKmh: 360 },
}

const r8: CarDefinition = {
  id: "audi-r8",
  name: "Audi R8 V10",
  shortName: "R8",
  modelFile: "models/audi_r8.glb",
  physics: createPhysicsConfig({
    mass: { chassis: 1595, frontWheel: 25, rearWheel: 25, total: 1695 },
    dimensions: {
      width: 1.94,
      height: 1.21,
      length: 4.43,
      wheelbase: 2.65,
      trackWidth: 1.65,
      groundClearance: 0.11,
      centerOfMassHeight: 0.45,
    },
    engine: {
      ...CAR_PHYSICS.engine,
      maxPowerHP: 640,
      maxTorqueNm: 600,
      maxPowerRPM: 8200,
      maxTorqueRPM: 6500,
      redlineRPM: 8700,
      revLimiterRPM: 8700,
      idleRPM: 900,
      torqueCurve: [
        [0, 0.25],
        [1000, 0.4],
        [2000, 0.6],
        [3500, 0.78],
        [5000, 0.9],
        [6500, 1.0],
        [7500, 0.98],
        [8200, 0.93],
        [8700, 0.78],
        [8900, 0.0],
      ],
    },
    transmission: {
      ...CAR_PHYSICS.transmission,
      gearRatios: [3.893, 2.588, 1.88, 1.416, 1.115, 0.884, 0.653],
      finalDriveRatio: 3.588,
      reverseRatio: 2.647,
      launchControlRPM: 5000,
      autoUpshiftRPM: 8500,
      torqueConverter: {
        ...CAR_PHYSICS.transmission.torqueConverter,
        creepForce: 1400,
      },
    },
    drivetrain: {
      type: "awd",
      frontTorqueSplit: 0.3,
      torqueCapGear1: 2500,
      torqueCapGear2: 4000,
    },
    wheels: {
      ...CAR_PHYSICS.wheels,
      radius: 0.345,
      frictionMu: 1.5,
      referenceLoad: 3950,
      suspension: {
        ...CAR_PHYSICS.wheels.suspension,
        springRate: 68000,
        damperRate: 4800,
        travel: 0.11,
        antiRollBarFront: 17000,
        antiRollBarRear: 15000,
      },
      brakeForce: { front: 1800, rear: 1400 },
      steering: {
        ...CAR_PHYSICS.wheels.steering,
        maxAngle: 0.58,
        speedFalloffKmh: 200,
      },
    },
    aero: {
      ...CAR_PHYSICS.aero,
      dragCoefficient: 0.32,
      frontalArea: 1.95,
      downforceAt100kmh: 260,
    },
    assists: { ...CAR_PHYSICS.assists, tractionControl: 0.35 },
  }),
  wheels: [
    { x: -0.82, z: -1.22, front: true, left: true },
    { x: 0.82, z: -1.22, front: true, left: false },
    { x: -0.82, z: 1.42, front: false, left: true },
    { x: 0.82, z: 1.42, front: false, left: false },
  ],
  pivots: { names: ["Plane003", "Plane006", "Plane009", "Plane012"] },
  dash: { maxRpm: 9000, redFromRpm: 8000, maxKmh: 360 },
  defaultTint: null,
  paintMatch: ["^body$"],
  tested: { zeroToHundredS: 3.4, topSpeedKmh: 342 },
}

const rs7: CarDefinition = {
  id: "audi-rs7",
  name: "Audi RS 7 Performance",
  shortName: "RS 7",
  modelFile: "models/audi_rs7.glb",
  physics: createPhysicsConfig({
    mass: { chassis: 2040, frontWheel: 30, rearWheel: 30, total: 2100 },
    dimensions: {
      width: 1.911,
      height: 1.419,
      length: 5.012,
      wheelbase: 2.915,
      trackWidth: 1.63,
      groundClearance: 0.12,
      centerOfMassHeight: 0.48,
    },
    engine: {
      ...CAR_PHYSICS.engine,
      maxPowerHP: 605, // 445 kW @ 6,100-6,800 rpm
      // The car is a game tune, not a spec sheet: the overboost torque is
      // lifted to 850 Nm and the drag trimmed to 0.28 so the thing can
      // actually reach its 345 km/h dash limit. The real car makes
      // 750 Nm and 305 km/h.
      maxTorqueNm: 850,
      maxPowerRPM: 6100,
      maxTorqueRPM: 2500,
      redlineRPM: 7000,
      revLimiterRPM: 7000,
      idleRPM: 750,
      // 4.0 TFSI twin-turbo V8: overboost peaks at 2,500 rpm and holds a
      // near-flat plateau to 6,000 rpm before the power peak at 6,100 rpm.
      torqueCurve: [
        [0, 0.3],
        [800, 0.48],
        [1500, 0.68],
        [2000, 0.8],
        [2500, 1.0],
        [3500, 0.99],
        [4500, 0.97],
        [5500, 0.94],
        [6100, 0.92],
        [7000, 0.8],
        [7200, 0.0],
      ],
    },
    transmission: {
      ...CAR_PHYSICS.transmission,
      // 8-speed Tiptronic (S tronic), final drive 3.08
      gearRatios: [3.157, 1.905, 1.512, 1.16, 0.903, 0.716, 0.633, 0.521],
      finalDriveRatio: 3.08,
      reverseRatio: 2.85,
      launchControlRPM: 3000,
      autoUpshiftRPM: 6800,
      torqueConverter: {
        ...CAR_PHYSICS.transmission.torqueConverter,
        creepForce: 2000,
      },
    },
    drivetrain: {
      type: "awd",
      // quattro with a sport rear differential — rear biased
      frontTorqueSplit: 0.4,
      torqueCapGear1: 3000,
      torqueCapGear2: 4500,
    },
    wheels: {
      ...CAR_PHYSICS.wheels,
      // From model: tyre 0.716 m across → radius 0.358 m (275/30 R21)
      radius: 0.358,
      width: 0.3,
      frictionMu: 1.5,
      referenceLoad: 5000, // 2040 kg * 9.81 / 4
      suspension: {
        ...CAR_PHYSICS.wheels.suspension,
        // RS sports air suspension — softer than a pure sports car, but
        // still a lot stiffer than the stock car it replaced
        springRate: 75000,
        damperRate: 5000,
        travel: 0.13,
        antiRollBarFront: 16000,
        antiRollBarRear: 14000,
      },
      // 390 mm six-piston front discs, carbon-ceramic optional
      brakeForce: { front: 2100, rear: 1650 },
      handbrakeForce: 3500,
      steering: {
        ...CAR_PHYSICS.wheels.steering,
        maxAngle: 0.58,
        speedFalloffKmh: 200,
      },
    },
    aero: {
      ...CAR_PHYSICS.aero,
      dragCoefficient: 0.28, // 0.30 on the road — trimmed for the top end
      frontalArea: 2.3,
      downforceAt100kmh: 120,
    },
    assists: {
      ...CAR_PHYSICS.assists,
      tractionControl: 0.4,
      countersteerAssist: 5000,
    },
  }),
  wheels: [
    { x: -0.761, z: -1.546, front: true, left: true },
    { x: 0.761, z: -1.546, front: true, left: false },
    { x: -0.758, z: 1.362, front: false, left: true },
    { x: 0.758, z: 1.362, front: false, left: false },
  ],
  pivots: { pattern: "^Wheel_[FLR][LR]$" },
  dash: { maxRpm: 7000, redFromRpm: 6200, maxKmh: 350 },
  defaultTint: null,
  // Only the painted body shell takes the colour — the bumpers, sills and
  // glass are separate materials on this model and stay black.
  paintMatch: ["^body$"],
  tested: { zeroToHundredS: 3.7, topSpeedKmh: 345 },
}

const gt2: CarDefinition = {
  id: "porsche-997-gt2",
  name: "Porsche 911 GT2 (997)",
  shortName: "GT2",
  modelFile: "models/porsche_997.1_gt2.glb",
  physics: createPhysicsConfig({
    mass: { chassis: 1390, frontWheel: 25, rearWheel: 25, total: 1440 },
    dimensions: {
      width: 1.852,
      height: 1.285,
      length: 4.469,
      wheelbase: 2.35,
      trackWidth: 1.53,
      groundClearance: 0.1,
      centerOfMassHeight: 0.42,
    },
    engine: {
      ...CAR_PHYSICS.engine,
      // 3.6 l twin-turbo flat-six (M97/70S): 390 kW (530 PS) at 6,500 rpm,
      // 680 Nm held from 2,200 to 4,500 rpm. The max engine speed is
      // 6,750 rpm, so that is the limiter.
      maxPowerHP: 530,
      maxTorqueNm: 680,
      maxPowerRPM: 6500,
      maxTorqueRPM: 2200,
      redlineRPM: 6750,
      revLimiterRPM: 6750,
      idleRPM: 850,
      // Turbo plateau: full boost torque from 2,200 rpm, held to 4,500,
      // then tapering to the power peak at 6,500 (573 Nm there, 84 %).
      torqueCurve: [
        [0, 0.34],
        [1000, 0.52],
        [1500, 0.7],
        [2200, 1.0],
        [3200, 1.0],
        [4500, 1.0],
        [5500, 0.95],
        [6000, 0.9],
        [6500, 0.84],
        [6750, 0.76],
        [6900, 0.0],
      ],
    },
    transmission: {
      ...CAR_PHYSICS.transmission,
      // Six-speed manual (G97/88), same box as the GT3, 3.44 final drive.
      // The ratios put 6th at 6,750 rpm = 327 km/h with the 0.327 m tyre.
      gearRatios: [3.82, 2.2, 1.52, 1.16, 0.92, 0.74],
      finalDriveRatio: 3.44,
      reverseRatio: 3.0,
      launchControlRPM: 4500,
      autoUpshiftRPM: 6600,
    },
    drivetrain: {
      type: "rwd",
      frontTorqueSplit: 0,
      torqueCapGear1: 2600,
      torqueCapGear2: 4000,
    },
    wheels: {
      ...CAR_PHYSICS.wheels,
      // 235/35 ZR19 front, 325/30 ZR19 rear — radius 0.327 m
      radius: 0.327,
      width: 0.3,
      frictionMu: 1.55,
      referenceLoad: 3530, // 1440 kg * 9.81 / 4
      suspension: {
        ...CAR_PHYSICS.wheels.suspension,
        // Race-tuned PASM: stiffer than a Carrera, short travel
        springRate: 88000,
        damperRate: 5600,
        travel: 0.1,
        antiRollBarFront: 19000,
        antiRollBarRear: 16000,
      },
      // PCCB: 6-piston front, 4-piston rear
      brakeForce: { front: 2200, rear: 1800 },
      handbrakeForce: 3200,
      steering: {
        ...CAR_PHYSICS.wheels.steering,
        maxAngle: 0.55,
        speedFalloffKmh: 210,
      },
    },
    aero: {
      ...CAR_PHYSICS.aero,
      dragCoefficient: 0.32, // official Cd
      frontalArea: 2.0,
      // Big GT-style rear wing on swan-neck mounts
      downforceAt100kmh: 250,
    },
    assists: {
      ...CAR_PHYSICS.assists,
      tractionControl: 0.3,
      countersteerAssist: 5000,
    },
  }),
  wheels: [
    { x: -0.742, z: -1.173, front: true, left: true },
    { x: 0.742, z: -1.173, front: true, left: false },
    { x: -0.768, z: 1.185, front: false, left: true },
    { x: 0.768, z: 1.185, front: false, left: false },
  ],
  pivots: { pattern: "^Wheel_[FLR][LR]$" },
  dash: { maxRpm: 7000, redFromRpm: 6000, maxKmh: 340 },
  defaultTint: null,
  // Only the painted body shell takes the colour. The chassis, bumpers and
  // light cluster are separate materials on this model and stay black.
  paintMatch: ["^New_Material$"],
  // Measured in car-matrix: 3.83 s to 100 km/h, 318 km/h on the limiter
  // (the real car does 3.7 s and 329 km/h).
  tested: { zeroToHundredS: 3.8, topSpeedKmh: 318 },
}

const gwagon: CarDefinition = {
  id: "g-wagon",
  name: "Mercedes G 63",
  shortName: "G 63",
  modelFile: "models/g_wagon.glb",
  physics: createPhysicsConfig({
    mass: { chassis: 2570, frontWheel: 32, rearWheel: 32, total: 2700 },
    dimensions: {
      width: 1.98,
      height: 1.97,
      length: 4.87,
      wheelbase: 2.89,
      trackWidth: 1.68,
      groundClearance: 0.22,
      centerOfMassHeight: 0.75,
    },
    engine: {
      ...CAR_PHYSICS.engine,
      maxPowerHP: 850,
      maxTorqueNm: 1000,
      maxPowerRPM: 6000,
      maxTorqueRPM: 3000,
      redlineRPM: 6500,
      revLimiterRPM: 6800,
      idleRPM: 700,
      torqueCurve: [
        [0, 0.35],
        [700, 0.5],
        [1500, 0.8],
        [2500, 1.0],
        [3500, 0.97],
        [4500, 0.96],
        [5500, 0.95],
        [6000, 0.95],
        [6500, 0.78],
        [6700, 0.0],
      ],
    },
    transmission: {
      ...CAR_PHYSICS.transmission,
      gearRatios: [5.354, 3.243, 2.252, 1.636, 1.211, 1.0, 0.865, 0.717, 0.601],
      finalDriveRatio: 4.5,
      reverseRatio: 4.798,
      launchControlRPM: 3500,
      autoUpshiftRPM: 6000,
      torqueConverter: {
        ...CAR_PHYSICS.transmission.torqueConverter,
        creepForce: 2200,
      },
    },
    drivetrain: {
      type: "awd",
      frontTorqueSplit: 0.4,
      torqueCapGear1: 3200,
      torqueCapGear2: 5000,
    },
    wheels: {
      ...CAR_PHYSICS.wheels,
      radius: 0.39,
      frictionMu: 1.25,
      referenceLoad: 6300,
      suspension: {
        ...CAR_PHYSICS.wheels.suspension,
        springRate: 98000,
        damperRate: 5600,
        travel: 0.16,
        antiRollBarFront: 9000,
        antiRollBarRear: 7000,
      },
      brakeForce: { front: 2600, rear: 2100 },
      handbrakeForce: 4500,
      steering: {
        ...CAR_PHYSICS.wheels.steering,
        maxAngle: 0.55,
        speedFalloffKmh: 170,
        minAngleAtSpeed: 0.06,
      },
    },
    aero: {
      ...CAR_PHYSICS.aero,
      dragCoefficient: 0.38,
      frontalArea: 2.6,
      downforceAt100kmh: 60,
    },
    assists: {
      ...CAR_PHYSICS.assists,
      tractionControl: 0.55,
      countersteerAssist: 5500,
    },
  }),
  wheels: [
    { x: -0.81, z: -1.41, front: true, left: true },
    { x: 0.81, z: -1.41, front: true, left: false },
    { x: -0.81, z: 1.45, front: false, left: true },
    { x: 0.81, z: 1.45, front: false, left: false },
  ],
  pivots: { pattern: "^wheel[FB][LR]$" },
  dash: { maxRpm: 7000, redFromRpm: 6000, maxKmh: 260 },
  defaultTint: null,
  paintMatch: ["^body$"],
  paintTexture: { keepMap: true, neutralize: { color: [255, 0, 0], tol: 60 } },
  tested: { zeroToHundredS: 4.3, topSpeedKmh: 319 },
}

const urus: CarDefinition = {
  id: "lambo-urus",
  name: "Lamborghini Urus",
  shortName: "Urus",
  modelFile: "models/lamborghini_urus.glb",
  physics: createPhysicsConfig({
    mass: { chassis: 2200, frontWheel: 30, rearWheel: 30, total: 2320 },
    dimensions: {
      width: 2.02,
      height: 1.64,
      length: 5.11,
      wheelbase: 3.0,
      trackWidth: 1.7,
      groundClearance: 0.18,
      centerOfMassHeight: 0.65,
    },
    engine: {
      ...CAR_PHYSICS.engine,
      maxPowerHP: 700,
      maxTorqueNm: 1000,
      maxPowerRPM: 6200,
      maxTorqueRPM: 3500,
      redlineRPM: 6800,
      revLimiterRPM: 6800,
      idleRPM: 750,
      torqueCurve: [
        [0, 0.32],
        [800, 0.48],
        [1500, 0.75],
        [2250, 0.92],
        [3500, 1.0],
        [4500, 0.96],
        [5500, 0.94],
        [6200, 0.9],
        [6800, 0.72],
        [7000, 0.0],
      ],
    },
    transmission: {
      ...CAR_PHYSICS.transmission,
      gearRatios: [5.0, 3.2, 2.143, 1.72, 1.313, 1.0, 0.823, 0.64],
      finalDriveRatio: 3.5,
      reverseRatio: 3.478,
      launchControlRPM: 4000,
      autoUpshiftRPM: 6700,
      torqueConverter: {
        ...CAR_PHYSICS.transmission.torqueConverter,
        creepForce: 1900,
      },
    },
    drivetrain: {
      type: "awd",
      frontTorqueSplit: 0.38,
      torqueCapGear1: 3000,
      torqueCapGear2: 4600,
    },
    wheels: {
      ...CAR_PHYSICS.wheels,
      radius: 0.41,
      frictionMu: 1.35,
      referenceLoad: 5400,
      suspension: {
        ...CAR_PHYSICS.wheels.suspension,
        springRate: 88000,
        damperRate: 5300,
        travel: 0.14,
        antiRollBarFront: 13000,
        antiRollBarRear: 11000,
      },
      brakeForce: { front: 2300, rear: 1800 },
      handbrakeForce: 4000,
      steering: {
        ...CAR_PHYSICS.wheels.steering,
        maxAngle: 0.57,
        speedFalloffKmh: 185,
      },
    },
    aero: {
      ...CAR_PHYSICS.aero,
      dragCoefficient: 0.33,
      frontalArea: 2.7,
      downforceAt100kmh: 180,
    },
    assists: {
      ...CAR_PHYSICS.assists,
      tractionControl: 0.45,
      countersteerAssist: 5000,
    },
  }),
  wheels: [
    { x: -0.82, z: -1.51, front: true, left: true },
    { x: 0.82, z: -1.51, front: true, left: false },
    { x: -0.82, z: 1.52, front: false, left: true },
    { x: 0.82, z: 1.52, front: false, left: false },
  ],
  pivots: { names: ["Plane030", "Plane031", "Plane032", "Plane035"] },
  dash: { maxRpm: 8000, redFromRpm: 6200, maxKmh: 320 },
  defaultTint: null,
  paintMatch: ["^Material\\.001$"],
  tested: { zeroToHundredS: 3.9, topSpeedKmh: 316 },
}

const aventador: CarDefinition = {
  id: "lambo-aventador",
  name: "Lamborghini Aventador LP 700-4",
  shortName: "Aventador",
  modelFile: "models/lamborghini_aventador.glb",
  physics: createPhysicsConfig({
    mass: { chassis: 1500, frontWheel: 22, rearWheel: 25, total: 1650 },
    dimensions: {
      width: 2.03,
      height: 1.136,
      length: 4.78,
      wheelbase: 2.7,
      trackWidth: 1.72,
      groundClearance: 0.11,
      centerOfMassHeight: 0.38,
    },
    engine: {
      ...CAR_PHYSICS.engine,
      maxPowerHP: 700,
      maxTorqueNm: 690,
      maxPowerRPM: 8250,
      maxTorqueRPM: 5500,
      redlineRPM: 8500,
      revLimiterRPM: 8500,
      idleRPM: 950,
      // V12 naturally aspirated — broad torque, rises steadily to peak at 5500 rpm,
      // stays high through the rev range then falls into the limiter
      torqueCurve: [
        [0, 0.28],
        [1000, 0.42],
        [2000, 0.62],
        [3000, 0.78],
        [4000, 0.9],
        [5500, 1.0],
        [6500, 0.97],
        [7500, 0.93],
        [8250, 0.87],
        [8500, 0.65],
        [8700, 0.0],
      ],
    },
    transmission: {
      ...CAR_PHYSICS.transmission,
      // ISR 7-speed (Car and Driver / Motormatchup confirmed)
      gearRatios: [3.91, 2.44, 1.81, 1.46, 1.19, 0.97, 0.89],
      finalDriveRatio: 2.86,
      reverseRatio: 2.93,
      launchControlRPM: 5500,
      autoUpshiftRPM: 8300,
      torqueConverter: {
        ...CAR_PHYSICS.transmission.torqueConverter,
        creepForce: 1200,
      },
    },
    drivetrain: {
      type: "awd",
      // Haldex gen IV — nominally rear-biased (43/57 weight distribution)
      frontTorqueSplit: 0.3,
      torqueCapGear1: 2200,
      torqueCapGear2: 3500,
    },
    wheels: {
      ...CAR_PHYSICS.wheels,
      // From model: front tyres 0.67 m dia, rear 0.73 m dia → average radius 0.35 m
      radius: 0.35,
      frictionMu: 1.55,
      referenceLoad: 3850, // 1650 kg * 9.81 / 4
      suspension: {
        ...CAR_PHYSICS.wheels.suspension,
        // Push-rod horizontal damper setup — stiff, low CoM sports car
        springRate: 62000,
        damperRate: 4200,
        travel: 0.09,
        antiRollBarFront: 18000,
        antiRollBarRear: 16000,
      },
      brakeForce: { front: 1900, rear: 1500 },
      // CCB: Ø400×38 mm front, Ø380×38 mm rear — strong stopping
      steering: {
        ...CAR_PHYSICS.wheels.steering,
        maxAngle: 0.52,
        speedFalloffKmh: 220,
      },
    },
    aero: {
      ...CAR_PHYSICS.aero,
      // Cd ~0.33 from research; frontal area ≈ width × height × 0.85 ≈ 1.95 m²
      dragCoefficient: 0.33,
      frontalArea: 1.95,
      // Deployable rear spoiler — significant downforce at speed
      downforceAt100kmh: 320,
    },
    assists: {
      ...CAR_PHYSICS.assists,
      tractionControl: 0.3,
    },
  }),
  wheels: [
    { x: -0.86, z: -1.25, front: true, left: true },
    { x: 0.86, z: -1.25, front: true, left: false },
    { x: -0.85, z: 1.45, front: false, left: true },
    { x: 0.85, z: 1.45, front: false, left: false },
  ],
  pivots: { pattern: "^Wheel(FL|FR|BL|BR)$" },
  dash: { maxRpm: 9000, redFromRpm: 8000, maxKmh: 380 },
  defaultTint: null,
  // Explicit match: only carpaint meshes and scissor doors/bumpers carry the body colour.
  // Black plastic, chrome, detail and glass mesh names would otherwise false-positive
  // through the heuristic (chassis/bumper keywords hit PAINT_NAMES).
  paintMatch: ["carpaint", "detach_door", "detach_bumper"],
  tested: { zeroToHundredS: 2.9, topSpeedKmh: 350 },
}

const challenger: CarDefinition = {
  id: "dodge-challenger",
  name: "Dodge Challenger SRT8",
  shortName: "Challenger",
  modelFile: "models/dodge_challenger.glb",
  physics: createPhysicsConfig({
    mass: { chassis: 1790, frontWheel: 28, rearWheel: 28, total: 1878 },
    dimensions: {
      width: 1.923,
      height: 1.448,
      length: 5.023,
      wheelbase: 2.946,
      trackWidth: 1.603,
      groundClearance: 0.14,
      centerOfMassHeight: 0.52,
    },
    engine: {
      ...CAR_PHYSICS.engine,
      maxPowerHP: 425,
      maxTorqueNm: 569, // 420 lb-ft
      maxPowerRPM: 6200,
      maxTorqueRPM: 4800,
      redlineRPM: 6400,
      revLimiterRPM: 6400,
      idleRPM: 700,
      // 6.1L HEMI pushrod V8 — strong low-end, broad flat torque band, falls off near redline
      torqueCurve: [
        [0, 0.38],
        [800, 0.55],
        [1500, 0.75],
        [2500, 0.88],
        [3500, 0.96],
        [4800, 1.0],
        [5500, 0.97],
        [6000, 0.92],
        [6200, 0.86],
        [6400, 0.6],
        [6600, 0.0],
      ],
    },
    transmission: {
      ...CAR_PHYSICS.transmission,
      // W5A580 5-speed automatic (official Stellantis spec sheet)
      gearRatios: [3.59, 2.19, 1.41, 1.0, 0.83],
      finalDriveRatio: 3.06,
      reverseRatio: 3.16,
      launchControlRPM: 3000,
      autoUpshiftRPM: 6200,
      torqueConverter: {
        ...CAR_PHYSICS.transmission.torqueConverter,
        creepForce: 1600,
      },
    },
    drivetrain: {
      type: "rwd",
      frontTorqueSplit: 0,
      torqueCapGear1: 2800,
      torqueCapGear2: 4200,
    },
    wheels: {
      ...CAR_PHYSICS.wheels,
      // From model: wheel pivot y=0.452 m above ground → radius 0.452 m
      radius: 0.452,
      frictionMu: 1.3,
      referenceLoad: 4400, // 1878 kg * 9.81 / 4
      suspension: {
        ...CAR_PHYSICS.wheels.suspension,
        // SLA front coilovers, 5-link independent rear — muscle car tuning, stiffer than stock
        springRate: 52000,
        damperRate: 3800,
        travel: 0.13,
        antiRollBarFront: 14000,
        antiRollBarRear: 16000, // larger rear sway bar per SRT spec
      },
      brakeForce: { front: 2100, rear: 1600 },
      // Brembo 4-piston: 360×32 mm front, 350×26 mm rear
      handbrakeForce: 3500,
      steering: {
        ...CAR_PHYSICS.wheels.steering,
        maxAngle: 0.6,
        speedFalloffKmh: 160,
      },
    },
    aero: {
      ...CAR_PHYSICS.aero,
      // Official Cd 0.353, frontal area 2.35 m² (from Stellantis press release)
      dragCoefficient: 0.353,
      frontalArea: 2.35,
      downforceAt100kmh: 40, // muscle car — minimal aero downforce
    },
    assists: {
      ...CAR_PHYSICS.assists,
      tractionControl: 0.5,
      countersteerAssist: 4500,
    },
  }),
  wheels: [
    { x: -0.907, z: -1.325, front: true, left: true },
    { x: 0.915, z: -1.325, front: true, left: false },
    { x: -1.008, z: 2.355, front: false, left: true },
    { x: 1.017, z: 2.355, front: false, left: false },
  ],
  pivots: { pattern: "^Wheel_[1-4]$" },
  dash: { maxRpm: 7000, redFromRpm: 6000, maxKmh: 280 },
  defaultTint: null,
  // Body colour is on material named "material" (Body_Red_0, Side_Mirror_*_Red_0)
  // Body_Black/Gray/White meshes use named materials that should not be tinted
  paintMatch: ["^material$"],
  tested: { zeroToHundredS: 5.0, topSpeedKmh: 274 },
}

const f1: CarDefinition = {
  id: "f1-car",
  name: "Formula 1 Car",
  shortName: "F1",
  modelFile: "models/f1_car.glb",
  physics: createPhysicsConfig({
    mass: { chassis: 770, frontWheel: 7, rearWheel: 7, total: 798 },
    dimensions: {
      width: 1.9,
      height: 0.95,
      length: 5.0,
      wheelbase: 3.29,
      trackWidth: 1.7,
      groundClearance: 0.05,
      centerOfMassHeight: 0.35,
    },
    engine: {
      ...CAR_PHYSICS.engine,
      maxPowerHP: 950,
      maxTorqueNm: 850,
      maxPowerRPM: 12000,
      maxTorqueRPM: 4000,
      redlineRPM: 15000,
      revLimiterRPM: 15000,
      idleRPM: 4000,
      torqueCurve: [
        [0, 0.5],
        [1000, 0.6],
        [2000, 0.72],
        [3000, 0.85],
        [4000, 1.0],
        [5000, 0.98],
        [7000, 0.95],
        [9000, 0.92],
        [11000, 0.88],
        [13000, 0.82],
        [15000, 0.7],
        [15500, 0.0],
      ],
      frictionTorqueBase: 20,
      frictionTorqueRPMFactor: 0.008,
    },
    transmission: {
      ...CAR_PHYSICS.transmission,
      gearRatios: [3.8, 3.0, 2.4, 1.95, 1.6, 1.35, 1.15, 1.0],
      finalDriveRatio: 5.0,
      reverseRatio: 4.0,
      launchControlRPM: 8000,
      autoUpshiftRPM: 14500,
      autoDownshiftRPM: 5000,
      torqueConverter: {
        ...CAR_PHYSICS.transmission.torqueConverter,
        creepForce: 300,
        creepForceReverse: 300,
      },
    },
    differential: {
      ...CAR_PHYSICS.differential,
      lsdAccelLock: 0.3,
      lsdDecelLock: 0.2,
      preloadTorque: 30,
    },
    drivetrain: {
      type: "rwd",
      frontTorqueSplit: 0,
      torqueCapGear1: 2500,
      torqueCapGear2: 4000,
    },
    wheels: {
      ...CAR_PHYSICS.wheels,
      radius: 0.36,
      width: 0.33,
      frictionMu: 1.7,
      referenceLoad: 1960,
      rollingResist: 0.015,
      suspension: {
        ...CAR_PHYSICS.wheels.suspension,
        springRate: 120000,
        damperRate: 7000,
        travel: 0.08,
        antiRollBarFront: 20000,
        antiRollBarRear: 18000,
      },
      brakeForce: { front: 3500, rear: 2800 },
      handbrakeForce: 0,
      steering: {
        ...CAR_PHYSICS.wheels.steering,
        maxAngle: 0.45,
        speedFalloffKmh: 260,
        minAngleAtSpeed: 0.03,
      },
    },
    aero: {
      ...CAR_PHYSICS.aero,
      dragCoefficient: 0.7,
      frontalArea: 1.4,
      liftCoefficient: -2.5,
      downforceAt100kmh: 1000,
    },
    assists: {
      ...CAR_PHYSICS.assists,
      tractionControl: 0.2,
      stabilityControl: 0.1,
      countersteerAssist: 3000,
      speedFeel: {
        ...CAR_PHYSICS.assists.speedFeel,
        fovAtMaxSpeedKmh: 375,
      },
    },
  }),
  wheels: [
    { x: -0.851, z: -1.365, front: true, left: true },
    { x: 0.851, z: -1.365, front: true, left: false },
    { x: -0.841, z: 1.921, front: false, left: true },
    { x: 0.841, z: 1.921, front: false, left: false },
  ],
  pivots: { names: ["Cylinder", "Cylinder004", "Cylinder007", "Cylinder009"] },
  dash: { maxRpm: 15000, redFromRpm: 14000, maxKmh: 375 },
  defaultTint: null,
  paintMatch: ["Base-Color"],
  tested: { zeroToHundredS: 2.6, topSpeedKmh: 372 },
}

const cheetah: CarDefinition = {
  id: "cheetah-84",
  name: "Cheetah '84",
  shortName: "Cheetah",
  modelFile: "models/cheetah_84.glb",
  physics: createPhysicsConfig({
    mass: { chassis: 1280, frontWheel: 20, rearWheel: 22, total: 1322 },
    dimensions: {
      width: 1.94,
      height: 1.18,
      length: 4.55,
      wheelbase: 2.61,
      trackWidth: 1.65,
      groundClearance: 0.13,
      centerOfMassHeight: 0.42,
    },
    engine: {
      ...CAR_PHYSICS.engine,
      maxPowerHP: 270,
      maxTorqueNm: 304,
      maxPowerRPM: 7000,
      maxTorqueRPM: 5500,
      redlineRPM: 7700,
      revLimiterRPM: 7700,
      idleRPM: 900,
      torqueCurve: [
        [0, 0.35],
        [1000, 0.5],
        [2000, 0.68],
        [3000, 0.82],
        [4000, 0.92],
        [5500, 1.0],
        [6500, 0.95],
        [7000, 0.88],
        [7700, 0.6],
        [7900, 0.0],
      ],
    },
    transmission: {
      ...CAR_PHYSICS.transmission,
      gearRatios: [3.2, 2.15, 1.55, 1.18, 0.92],
      finalDriveRatio: 3.7,
      reverseRatio: 3.0,
      launchControlRPM: 5000,
      autoUpshiftRPM: 7500,
      autoDownshiftRPM: 2500,
    },
    drivetrain: {
      type: "rwd",
      frontTorqueSplit: 0,
      torqueCapGear1: 2000,
      torqueCapGear2: 3200,
    },
    wheels: {
      ...CAR_PHYSICS.wheels,
      radius: 0.32,
      width: 0.24,
      frictionMu: 1.3,
      referenceLoad: 3200,
      suspension: {
        ...CAR_PHYSICS.wheels.suspension,
        springRate: 55000,
        damperRate: 3800,
        travel: 0.1,
        antiRollBarFront: 13000,
        antiRollBarRear: 11000,
      },
      brakeForce: { front: 1600, rear: 1200 },
      handbrakeForce: 3800,
      steering: {
        ...CAR_PHYSICS.wheels.steering,
        maxAngle: 0.55,
        speedFalloffKmh: 190,
        minAngleAtSpeed: 0.05,
      },
    },
    aero: {
      ...CAR_PHYSICS.aero,
      dragCoefficient: 0.32,
      frontalArea: 1.8,
      liftCoefficient: 0.12,
      downforceAt100kmh: 110,
    },
    assists: {
      ...CAR_PHYSICS.assists,
      tractionControl: 0.25,
      stabilityControl: 0.1,
      countersteerAssist: 4200,
    },
  }),
  wheels: [
    { x: -0.825, z: -1.279, front: true, left: true },
    { x: 0.825, z: -1.279, front: true, left: false },
    { x: -0.802, z: 1.331, front: false, left: true },
    { x: 0.802, z: 1.331, front: false, left: false },
  ],
  pivots: { names: ["Cheetah84_WheelStock_FL", "Cheetah84_WheelStock_FR", "Cheetah84_WheelStock_RL", "Cheetah84_WheelStock_RR"] },
  dash: { maxRpm: 8000, redFromRpm: 7000, maxKmh: 280 },
  defaultTint: null,
  paintMatch: ["Cheetah84_Bodymat"],
  tested: { zeroToHundredS: 6.0, topSpeedKmh: 260 },
}

export const CARS: CarDefinition[] = [
  m3,
  r8,
  rs7,
  gt2,
  gwagon,
  urus,
  aventador,
  challenger,
  f1,
  cheetah,
]

export const DEFAULT_CAR_ID = "bmw-m3"

const byId = new Map<string, CarDefinition>(CARS.map((c) => [c.id, c]))

export function getCar(id: string | undefined | null): CarDefinition {
  if (id) {
    const found = byId.get(id)
    if (found) return found
  }
  return m3
}

export function isKnownCarId(id: string | undefined | null): boolean {
  return !!id && byId.has(id)
}

export function modelFileForCarId(id: string | undefined | null): string {
  return getCar(id).modelFile
}
