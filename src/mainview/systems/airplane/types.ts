import * as THREE from "three"

export type FlybyMode = "takeoff" | "landing" | "cruise"

export interface AircraftSpec {
  file: string
  span: number
  spanAxis: "x" | "z"
  yaw: number
  speed: number
  modes: FlybyMode[]
  prop: "separate" | "merged" | "fan" | "none"
  gear?: boolean
  fan?: { mesh: string; zMin: number; zMax: number; radius: number }
  gearNodes?: RegExp
}

export const AIRCRAFT: AircraftSpec[] = [
  {
    file: "airplane.glb",
    span: 50,
    spanAxis: "z",
    yaw: Math.PI / 2,
    speed: 1.15,
    modes: ["takeoff", "landing", "cruise"],
    prop: "separate",
  },
  {
    file: "c17_globemaster.glb",
    span: 70,
    spanAxis: "x",
    yaw: 0,
    speed: 1.4,
    modes: ["takeoff", "cruise", "landing"],
    prop: "none",
  },
  {
    file: "cessna_172.glb",
    span: 11,
    spanAxis: "x",
    yaw: 0,
    speed: 0.6,
    modes: ["takeoff", "landing", "cruise"],
    prop: "merged",
    gear: false,
  },
  {
    file: "boeing_787_dreamliner.glb",
    span: 60,
    spanAxis: "x",
    yaw: 0,
    speed: 1.35,
    modes: ["takeoff", "landing", "cruise"],
    prop: "fan",
    gear: false,
    fan: {
      mesh: "Engines_Material001_0",
      zMin: 240,
      zMax: 320,
      radius: 225,
    },
    gearNodes: /^(FRONT_LG|REAR_(LEFT|RIGHT)_LG_strut|Wheel_)/,
  },
]

export interface PropDisc {
  node: THREE.Object3D
  axis: THREE.Vector3
}

export interface LoadedAircraft {
  spec: AircraftSpec
  root: THREE.Group
  body: THREE.Group
  props: PropDisc[]
  modelGear: THREE.Object3D[]
  mats: THREE.MeshStandardMaterial[]
  span: number
  clearance: number
  gearDrop: number
  gearAft: number
  gear: THREE.Group
  gearGeoms: THREE.BufferGeometry[]
  wheels: THREE.Mesh[]
  lightsRoot: THREE.Group
  strobes: THREE.Mesh[]
  beacons: THREE.Mesh[]
  lightGeoms: THREE.BufferGeometry[]
  lightMats: THREE.Material[]
}

export type TerrainAt = (x: number, z: number) => number

export interface FlightPath {
  x: number
  z: number
  dx: number
  dz: number
  length: number
  theta: number
}

export interface Flight {
  mode: FlybyMode
  ac: LoadedAircraft
  path: FlightPath
  traveled: number
  u: number
  speed: number
  age: number
  stopped: number
}

export interface Profile {
  y: number
  speed: number
  pitch: number
}
