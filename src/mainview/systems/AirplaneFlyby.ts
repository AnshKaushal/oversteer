import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { roadCenterX } from "./WorldManager"
import {
  AirportView,
  airportBlocked,
  layoutAirport,
  type ClearZone,
  warmAirportTextures,
} from "./Airport"
import { warmStructureTextures } from "./AirportStructures"
import type { TireSmoke } from "./TireSmoke"
import { type TimeOfDayMode } from "../constants/timeOfDay"
import {
  CROSS_LEAD,
  PASS_HALF,
  exitLen,
  TAKEOFF_START_D,
  LANDING_START_D,
  TAKEOFF_LIFTOFF_D,
  TAKEOFF_HOLD,
  FADE_TIME,
  LANDING_DWELL,
  AIRPORT_STAY_DIST,
  AIRPORT_VIEW_DIST,
  AIRPORT_MIN_ANGLE,
  MAX_LEAD,
  MIN_GAP,
  MAX_GAP,
  FIRST_GAP_MIN,
  FIRST_GAP_MAX,
  MIN_ANGLE,
  MAX_ANGLE,
  CRUISE_LEAD,
  SHADOW_MAP_NEAR,
  SHADOW_MAP_FAR,
  DEG,
  LANDING_TOUCH_D,
  TOUCH_SMOKE_LEN,
  TOUCH_SMOKE_RATE,
  TOUCH_SMOKE_BURST,
  LANDING_STOP_DIST,
} from "./airplane/constants"
import {
  FlybyMode,
  AIRCRAFT,
  LoadedAircraft,
  TerrainAt,
  FlightPath,
  Flight,
} from "./airplane/types"
import {
  profileFor,
  makePath,
  PassState,
  passState,
  shadowState,
  pathBlocked,
  pickCrossing,
} from "./airplane/path"
import { buildGear } from "./airplane/gear"
import { prepareAircraft } from "./airplane/props"
import { makeShadowTexture, buildAircraftLights } from "./airplane/effects"

export class AirplaneFlyby {
  private terrainAt: TerrainAt

  private aircraft: LoadedAircraft[] = []
  private shadowRoot = new THREE.Group()
  private shadow: THREE.Mesh
  private shadowMat: THREE.MeshBasicMaterial
  private geoms: THREE.BufferGeometry[] = []
  private flight: Flight | null = null
  private scene: THREE.Scene | null = null
  private airport: {
    view: AirportView
    landing: FlightPath
    takeoff: FlightPath
  } | null = null
  private retiring: AirportView[] = []
  private lastAirportMode: FlybyMode = "takeoff"
  private lampsLit = false
  private onClearZones: ((zones: ClearZone[]) => void) | null = null
  private timer = 0
  private nextIn = 0
  private ready = false
  private disposed = false

  setClearZonesHandler(fn: (zones: ClearZone[]) => void) {
    this.onClearZones = fn
  }

  private pushClearZones() {
    const views = [
      ...(this.airport ? [this.airport.view] : []),
      ...this.retiring,
    ]
    this.onClearZones?.(views.flatMap((v) => v.layout.zones))
  }

  private retireAirport() {
    if (!this.airport) return
    this.airport.view.target = 0
    this.retiring.push(this.airport.view)
    this.airport = null
  }

  constructor(terrainAt: TerrainAt) {
    this.terrainAt = terrainAt
    const geo = new THREE.PlaneGeometry(1, 1)
    this.shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      map: makeShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0,
    })
    this.shadow = new THREE.Mesh(geo, this.shadowMat)
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.frustumCulled = false
    this.shadowRoot.add(this.shadow)
    this.shadowRoot.visible = false
  }

  async init(scene: THREE.Scene, baseUrl: string): Promise<boolean> {
    for (const spec of AIRCRAFT) {
      try {
        const glb = await new GLTFLoader().loadAsync(
          `${baseUrl}models/${spec.file}`,
        )
        const model = glb.scene
        model.updateMatrixWorld(true)

        const { props, span, height, length } = prepareAircraft(model, spec)
        const mats = this.prepareFade(model)
        model.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (mesh.isMesh) mesh.castShadow = true
        })

        if (this.disposed) return false

        const body = new THREE.Group()
        const root = new THREE.Group()
        body.add(model)
        root.add(body)
        root.visible = false
        scene.add(root)

        const {
          lightsRoot,
          strobes,
          beacons,
          geoms: lightGeoms,
          mats: lightMats,
        } = buildAircraftLights(model, span)
        lightsRoot.visible = true
        body.add(lightsRoot)

        const gear = buildGear(model, span, height, length, spec.gear !== false)
        body.add(gear.group)
        mats.push(...gear.mats)

        const modelGear: THREE.Object3D[] = []
        if (spec.gearNodes) {
          model.traverse((o) => {
            if (spec.gearNodes!.test(o.name)) modelGear.push(o)
          })
        }

        this.aircraft.push({
          spec,
          modelGear,
          root,
          body,
          props,
          mats,
          span,
          clearance: height / 2 + 1,
          gearDrop: gear.drop,
          gearAft: gear.aft,
          gear: gear.group,
          gearGeoms: gear.geoms,
          wheels: gear.wheels,
          lightsRoot,
          strobes,
          beacons,
          lightGeoms,
          lightMats,
        })
      } catch (e) {
        console.warn(`${spec.file} failed to load, no flyby for it`, e)
      }
    }

    warmAirportTextures()
    warmStructureTextures()

    if (this.disposed) return false
    if (this.aircraft.length === 0) return false
    scene.add(this.shadowRoot)
    this.scene = scene

    this.ready = true
    this.nextIn =
      FIRST_GAP_MIN + Math.random() * (FIRST_GAP_MAX - FIRST_GAP_MIN)
    return true
  }

  private prepareFade(model: THREE.Object3D): THREE.MeshStandardMaterial[] {
    const clones = new Map<THREE.Material, THREE.MeshStandardMaterial>()
    const mats: THREE.MeshStandardMaterial[] = []
    const cloneOf = (m: THREE.Material) => {
      let c = clones.get(m)
      if (!c) {
        c = (m as THREE.MeshStandardMaterial).clone()
        c.transparent = false
        c.fog = true
        clones.set(m, c)
        mats.push(c)
      }
      return c
    }
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(cloneOf)
        : cloneOf(mesh.material)
      const g = mesh.geometry as THREE.BufferGeometry
      if (g && !this.geoms.includes(g)) this.geoms.push(g)
    })
    return mats
  }

  update(
    dt: number,
    carS: number,
    carSpeed: number,
    active: boolean,
    carXWorld?: number,
  ) {
    const carX = carXWorld ?? roadCenterX(carS)
    this.carPos.set(carX, 0, -carS)
    if (!this.ready) return
    if (!active) {
      this.endFlight()
      this.retireAirport()
      this.tickAirports(dt)
      this.timer = 0
      return
    }

    this.tickAirports(dt)
    if (this.airport && !this.flight) {
      const l = this.airport.view.layout
      const d = Math.hypot(l.cx - carX, l.cz + carS)
      if (d > AIRPORT_VIEW_DIST) this.retireAirport()
    }

    this.timer += dt
    if (!this.flight && this.timer >= this.nextIn) {
      this.startFlight(carS, carSpeed, carX)
    }

    const f = this.flight
    if (!f) {
      this.shadowRoot.visible = false
      return
    }

    const ac = f.ac
    const holding = f.mode === "takeoff" && f.age < TAKEOFF_HOLD
    if (!holding) f.traveled += f.speed * dt
    f.age += dt
    f.u = Math.max(0, Math.min(1, f.traveled / f.path.length))
    const rolled = f.traveled - LANDING_TOUCH_D
    const pr = profileFor(f.mode, f.u, rolled, f.traveled)
    f.speed = holding ? 0 : pr.speed * ac.spec.speed
    if (f.mode === "landing" && rolled >= LANDING_STOP_DIST - 1) f.stopped += dt

    let alpha = 1
    if (f.mode === "takeoff") alpha = Math.min(1, f.age / FADE_TIME)
    if (f.mode === "landing" && f.stopped > LANDING_DWELL) {
      alpha = Math.max(0, 1 - (f.stopped - LANDING_DWELL) / FADE_TIME)
    }
    this.setAircraftAlpha(ac, alpha)

    const st = passState(
      f.mode,
      f.traveled,
      f.path,
      f.age,
      ac.spec.speed,
      ac.clearance - 1 + ac.gearDrop,
    )
    const lifting = f.mode !== "cruise" ? st.pitch : 0
    const pivotLift =
      f.mode === "cruise"
        ? 0
        : ac.gearAft * Math.sin(lifting) -
          (ac.clearance - 1 + ac.gearDrop) * (1 - Math.cos(lifting))
    ac.root.position.set(st.x, st.y + pivotLift, st.z)
    ac.root.rotation.y = st.heading
    this.hazeAircraft(ac)

    const sway = Math.sin(f.age * 0.55) * 0.6 + Math.sin(f.age * 1.3) * 0.25
    const level =
      f.mode === "landing" ||
      (f.mode === "takeoff" && f.traveled < TAKEOFF_LIFTOFF_D + 30)
    ac.body.rotation.x = -st.pitch
    ac.body.rotation.z = f.mode !== "cruise" ? 0 : (sway * 2.2 - 2) * DEG
    ac.body.rotation.y = 0
    void level

    let down = 1
    if (f.mode === "cruise") down = 0
    else if (f.mode === "takeoff") {
      const x = f.traveled - f.path.length / 2
      const q = Math.min(1, Math.max(0, x / 90))
      down = 1 - q * q * (3 - 2 * q)
    }
    ac.gear.visible = down > 0.02 && ac.wheels.length > 0
    ac.gear.scale.set(1, Math.max(0.01, down), 1)
    for (const n of ac.modelGear) n.visible = down > 0.02
    const spin = (f.speed / 0.6) * dt
    for (const w of ac.wheels) w.rotation.x += spin
    if (f.mode === "landing") this.touchdownSmoke(ac, rolled, dt)

    this.updateShadow(st, ac.span, carX, carS)

    const turn = (16 + f.speed * 0.2) * dt
    for (const p of ac.props) {
      p.node.quaternion.multiply(
        new THREE.Quaternion().setFromAxisAngle(p.axis, turn),
      )
    }

    const strobeCycle = f.age % 1.0
    const strobeActive =
      strobeCycle < 0.08 || (strobeCycle > 0.16 && strobeCycle < 0.24)
    for (let i = 0; i < ac.strobes.length; i++) {
      ac.strobes[i].visible = strobeActive
    }

    const beaconCycle = (f.age + 0.3) % 1.2
    const beaconActive = beaconCycle < 0.14
    for (let i = 0; i < ac.beacons.length; i++) {
      ac.beacons[i].visible = beaconActive
    }

    if (f.mode === "landing") {
      if (f.stopped >= LANDING_DWELL + FADE_TIME) this.endFlight()
    } else if (f.traveled >= f.path.length + exitLen(f.mode)) {
      this.endFlight()
    }
  }

  private smoke: TireSmoke | null = null
  private lastRolled = -1e9
  private smokeAcc = 0
  private readonly wheelPos = new THREE.Vector3()

  setSmoke(smoke: TireSmoke) {
    this.smoke = smoke
  }

  private touchdownSmoke(ac: LoadedAircraft, rolled: number, dt: number) {
    const prev = this.lastRolled
    this.lastRolled = rolled
    const smoke = this.smoke
    if (!smoke || rolled < 0 || rolled > TOUCH_SMOKE_LEN) return
    const fade = 1 - rolled / TOUCH_SMOKE_LEN
    this.smokeAcc += dt * TOUCH_SMOKE_RATE * fade
    const burst = prev < 0 ? TOUCH_SMOKE_BURST : 0
    const main = ac.wheels.filter((w) => w.position.z < 0)
    if (main.length === 0) return
    let n = burst
    while (this.smokeAcc >= 1) {
      this.smokeAcc -= 1
      n++
    }
    for (let i = 0; i < n; i++) {
      const w =
        i < burst
          ? main[i % main.length]
          : main[(Math.random() * main.length) | 0]
      w.updateWorldMatrix(true, false)
      w.getWorldPosition(this.wheelPos)
      const r =
        (w.geometry as THREE.CylinderGeometry).parameters?.radiusTop ?? 0.5
      this.wheelPos.y -= r * 0.9
      this.wheelPos.x += (Math.random() - 0.5) * r
      this.wheelPos.z += (Math.random() - 0.5) * r
      smoke.spawn(this.wheelPos, Math.min(1, 0.7 + 0.3 * fade))
    }
  }

  private sunSource: (() => { x: number; y: number; z: number }) | null = null

  setSunSource(fn: () => { x: number; y: number; z: number }) {
    this.sunSource = fn
  }

  private updateShadow(
    st: PassState,
    span: number,
    carX: number,
    carS: number,
  ) {
    let slope: { x: number; z: number } | undefined
    const sun = this.sunSource?.()
    if (sun) {
      const up = Math.max(sun.y, 20)
      slope = { x: -sun.x / up, z: -sun.z / up }
    }
    const sh = shadowState(st, this.terrainAt, span, slope)
    this.shadowRoot.visible = true
    this.shadowRoot.position.set(sh.x, sh.y, sh.z)
    this.shadowRoot.rotation.y = sh.heading
    this.shadow.scale.set(sh.span, sh.length, 1)
    const d = Math.hypot(sh.x - carX, sh.z + carS)
    const k = Math.min(
      1,
      Math.max(0, (d - SHADOW_MAP_NEAR) / (SHADOW_MAP_FAR - SHADOW_MAP_NEAR)),
    )
    this.shadowMat.opacity = sh.alpha * k * k * (3 - 2 * k)
  }

  private startFlight(carS: number, carSpeed: number, carX: number) {
    if (this.aircraft.length === 0) return

    const ap = this.airport
    if (ap) {
      const l = ap.view.layout
      const d = Math.hypot(l.cx - carX, l.cz + carS)
      if (d < AIRPORT_STAY_DIST) {
        const want: FlybyMode =
          this.lastAirportMode === "landing" ? "takeoff" : "landing"
        const pool = this.aircraft.filter((a) => a.spec.modes.includes(want))
        if (pool.length > 0) {
          const ac = pool[Math.floor(Math.random() * pool.length)]
          this.lastAirportMode = want
          this.beginFlight(
            want,
            ac,
            want === "landing" ? ap.landing : ap.takeoff,
          )
          return
        }
      }
    }

    const ac = this.aircraft[Math.floor(Math.random() * this.aircraft.length)]
    const modes = ac.spec.modes
    const mode = modes[Math.floor(Math.random() * modes.length)]
    const atAirport = mode !== "cruise"
    const minAngle = atAirport ? AIRPORT_MIN_ANGLE : MIN_ANGLE
    const theta = (minAngle + Math.random() * (MAX_ANGLE - minAngle)) * DEG
    const side: 1 | -1 = Math.random() < 0.5 ? 1 : -1
    const drift: 1 | -1 = Math.random() < 0.5 ? 1 : -1
    const landingFor = (s: number) => makePath(s, theta, side, drift)
    const takeoffFor = (s: number) => makePath(s, theta, -side as 1 | -1, drift)
    const pathFor = mode === "takeoff" ? takeoffFor : landingFor

    const flightTime =
      mode === "takeoff" ? 22 : mode === "landing" ? 17 : PASS_HALF / 52
    const baseLead = mode === "cruise" ? CRUISE_LEAD : CROSS_LEAD
    const lead = Math.max(
      -MAX_LEAD,
      Math.min(baseLead + carSpeed * flightTime, MAX_LEAD),
    )
    const base = carS + lead

    const span = atAirport
      ? Math.max(...this.aircraft.map((a) => a.span))
      : ac.span
    const clearance = atAirport
      ? Math.max(...this.aircraft.map((a) => a.clearance))
      : ac.clearance
    const other: FlybyMode = mode === "landing" ? "takeoff" : "landing"
    const otherFor = mode === "landing" ? takeoffFor : landingFor
    const airfieldBlocked = (s: number) =>
      airportBlocked(layoutAirport(landingFor(s)), this.terrainAt) ||
      pathBlocked(
        otherFor(s),
        other,
        this.terrainAt,
        span,
        clearance,
        exitLen(other),
      )

    const sCross = pickCrossing(
      base,
      mode,
      pathFor,
      this.terrainAt,
      carS,
      lead * 0.35,
      span,
      clearance,
      exitLen(mode),
      atAirport ? airfieldBlocked : undefined,
    )
    if (sCross < 0) {
      this.timer = 0
      this.nextIn = 2 + Math.random() * 3
      return
    }

    this.retireAirport()
    if (atAirport && this.scene) {
      const landing = landingFor(sCross)
      const view = new AirportView(layoutAirport(landing))
      this.scene.add(view.group)
      view.lit = this.lampsLit
      this.airport = { view, landing, takeoff: takeoffFor(sCross) }
      this.lastAirportMode = mode
    }
    this.pushClearZones()
    this.beginFlight(mode, ac, pathFor(sCross))
  }

  private beginFlight(mode: FlybyMode, ac: LoadedAircraft, path: FlightPath) {
    for (const other of this.aircraft) other.root.visible = false
    ac.root.visible = true
    const start =
      mode === "takeoff"
        ? TAKEOFF_START_D
        : mode === "landing"
          ? LANDING_START_D
          : 0
    this.flight = {
      mode,
      ac,
      path,
      traveled: start,
      u: 0,
      speed: profileFor(mode, 0, 0, start).speed * ac.spec.speed,
      age: 0,
      stopped: 0,
    }
  }

  private setAircraftAlpha(ac: LoadedAircraft, a: number) {
    const fading = a < 0.999
    for (const m of ac.mats) {
      const base = (m.userData.baseOpacity ??= m.opacity) as number
      m.transparent = fading
      m.opacity = base * a
    }
    ac.lightsRoot.visible = a > 0.6
  }

  private hazeAircraft(ac: LoadedAircraft) {
    for (const m of ac.mats) {
      m.emissive.setScalar(0)
    }
  }

  private readonly carPos = new THREE.Vector3()

  private tickAirports(dt: number) {
    this.airport?.view.step(dt, this.carPos)
    let changed = false
    this.retiring = this.retiring.filter((v) => {
      if (!v.step(dt)) return true
      v.dispose()
      changed = true
      return false
    })
    if (changed) this.pushClearZones()
  }

  private endFlight() {
    if (!this.flight) return
    this.setAircraftAlpha(this.flight.ac, 1)
    this.flight.ac.root.visible = false
    this.flight = null
    this.shadowRoot.visible = false
    this.shadowMat.opacity = 0
    this.timer = 0
    this.nextIn = MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP)
  }

  setTimeOfDay(mode: TimeOfDayMode) {
    this.lampsLit = mode !== "day"
    if (this.airport) this.airport.view.lit = this.lampsLit
    for (const v of this.retiring) v.lit = this.lampsLit
    for (const ac of this.aircraft) {
      ac.lightsRoot.visible = true
    }
  }

  dispose() {
    this.disposed = true
    this.retireAirport()
    for (const v of this.retiring) v.dispose()
    this.retiring.length = 0
    this.pushClearZones()
    for (const ac of this.aircraft) {
      ac.root.removeFromParent()
      for (const m of ac.mats) m.dispose()
      ac.mats.length = 0
      ac.props.length = 0
      ac.lightsRoot.removeFromParent()
      for (const g of ac.gearGeoms) g.dispose()
      ac.gearGeoms.length = 0
      ac.wheels.length = 0
      for (const g of ac.lightGeoms) g.dispose()
      for (const m of ac.lightMats) m.dispose()
      ac.lightGeoms.length = 0
      ac.lightMats.length = 0
      ac.strobes.length = 0
      ac.beacons.length = 0
    }
    this.aircraft.length = 0
    this.shadowRoot.removeFromParent()
    this.shadow.geometry.dispose()
    this.shadowMat.map?.dispose()
    this.shadowMat.dispose()
    for (const g of this.geoms) g.dispose()
    this.geoms.length = 0
    this.ready = false
  }
}
export * from "./airplane/constants"
export * from "./airplane/types"
export * from "./airplane/path"
export * from "./airplane/props"
