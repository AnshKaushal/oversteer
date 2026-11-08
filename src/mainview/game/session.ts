import { conditions } from "../physics/core/Conditions"
import { NPC_HEADLIGHT_CONE } from "../systems/headlightCutoff"
import { WEATHER_WETNESS } from "../data/surfaces"
import * as THREE from "three"
import { CameraRig } from "./cameraRig"
import { createPointerLock } from "./pointerLock"
import { createPerfHud } from "./perfHud"
import { spawnField } from "./spawnField"
import { LapTimer } from "./lapTimer"
import { TrafficUpkeep } from "./trafficUpkeep"
import { buildRaceSetup } from "./raceSetup"
import { spike } from "../diagnostics/SpikeLog"
import { AntiAlias } from "../systems/antialias"
import {
  initPhysics,
  createWorld,
  moveGroundBody,
  FIXED_DT,
  pushFrameTime,
  consumeSubstep,
  createFixedStepper,
  stepperAlpha,
  dropBacklog,
} from "../physics/core/PhysicsSystem"
import { PoseHistory } from "../physics/core/PoseHistory"
import { teleStore } from "../ui/LiveHud"
import { Skidmarks } from "../systems/Skidmarks"
import { applyTuning, loadTuning } from "../data/tuning"
import { Vehicle } from "../physics/vehicle/Vehicle"
import { createMap, type LinearRoad } from "../maps"
import {
  TIME_OF_DAY_MODES,
  TIME_OF_DAY_PRESETS,
  isLowLight,
} from "../constants/timeOfDay"
import { CarVisual } from "../systems/CarVisual"
import { electricalPower } from "../systems/carLights"
import { AirplaneFlyby } from "../systems/AirplaneFlyby"
import { TireSmoke } from "../systems/TireSmoke"
import { InputManager, type DriveInput } from "../systems/InputManager"
import {
  holdInput,
  ZERO_EDGES,
  stripEdges,
  type TrafficEntry,
} from "../systems/AIDriver"
import { DEFAULT_PLAYER_COLOR, colorHex } from "../systems/carTint"
import { type RaceStanding } from "../systems/RaceTypes"
import { circuitOptionsFor } from "../ui/MapPicker"
import { RainEffect } from "../systems/RainEffect"
import { applyRendererResolution } from "../systems/settings"
import { netDiagPhysicsTick } from "../systems/net/NetDiagnostics"
import type {} from "../systems/net/types"
import type * as RAPIER from "@dimforge/rapier3d-compat"
import { WORLD } from "../data/world"
import { getCar } from "../data/cars"

import {
  grassTargetFor,
  shadowRange2,
  applyFog,
  _qNpc,
  _vNpcFront,
  _vNpcTarget,
  _vNpcPos,
} from "../app/helpers"

import type { SessionCtx } from "./sessionCtx"
export function startSession(ctx: SessionCtx): () => void {
  const {
    activeRivalsRef,
    activeTrafficRef,
    applyTimeOfDay,
    cameraRef,
    carIdRef,
    circuitOptsRef,
    errorRef,
    flybyRef,
    freeCamRef,
    garageApiRef,
    inputRef,
    mapIdRef,
    mountRef,
    multiplayerRef,
    paintFor,
    pauseFnRef,
    pausedRef,
    playerVisualRef,
    poolRef,
    prevOrderRef,
    raceSetupRef,
    rainRef,
    rendererRef,
    resumeFnRef,
    setError,
    setFreeCam,
    setLap,
    setLoading,
    setPadNotice,
    setRace,
    setSpeedLines,
    settingsRef,
    showIntroRef,
    startGame,
    startedRef,
    timeOfDayRef,
    trafficRef,
    wmRef,
  } = ctx
  let disposed = false
  let renderer: THREE.WebGLRenderer | null = null
  let raf = 0
  let aa: AntiAlias | null = null
  const teleRef = { last: 0 }

  ;(async () => {
    try {
      const mount = mountRef.current!
      if (disposed) return
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        powerPreference: "high-performance",
        failIfMajorPerformanceCaveat: false,
      })
      renderer.info.autoReset = false
      renderer.shadowMap.enabled = settingsRef.current.shadows
      renderer.shadowMap.type = THREE.PCFShadowMap
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.0
      mount.appendChild(renderer.domElement)
      rendererRef.current = renderer

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x87ceeb)
      const camera = new THREE.PerspectiveCamera(
        68,
        mount.clientWidth / mount.clientHeight,
        0.1,
        5200,
      )
      cameraRef.current = camera

      applyRendererResolution(renderer, camera, mount, settingsRef.current)

      const R = await initPhysics()
      const world = createWorld()

      const map = createMap(
        mapIdRef.current,
        circuitOptionsFor(circuitOptsRef.current),
      )
      const lin = map.linear as LinearRoad
      const wm = map.world
      wmRef.current = wm
      const base = import.meta.env.BASE_URL || "./"
      const baseUrl = base.endsWith("/") ? base : base + "/"
      await wm.init(scene, baseUrl)
      wm.setTimeOfDay(timeOfDayRef.current)
      applyFog(wm, settingsRef.current)
      const rain = new RainEffect(scene)
      rainRef.current = rain
      rain.setConditions(
        TIME_OF_DAY_PRESETS[timeOfDayRef.current].rain,
        TIME_OF_DAY_PRESETS[timeOfDayRef.current].lightning,
      )
      if (disposed) {
        try {
          world.free()
        } catch {}
        return
      }
      const groundBody = wm.createPhysicsGround(R, world)

      const flyby = map.map.features.airport
        ? new AirplaneFlyby((x, z) => wm.terrainHeightAt(x, z))
        : null
      flybyRef.current = flyby
      if (flyby) {
        flyby.setClearZonesHandler((zones) => wm.setClearZones(zones))
        flyby.setSunSource(() => wm.sunDirection())
        flyby.setTimeOfDay(timeOfDayRef.current)
        await flyby.init(scene, baseUrl)
      }

      const net = multiplayerRef.current
      if (net) {
        net.setLocalCarId(carIdRef.current)
        net.setHeadlights(isLowLight(timeOfDayRef.current))
        net.attachScene(scene, baseUrl, world, R)
      }

      const playerDef = applyTuning(
        getCar(carIdRef.current),
        loadTuning(carIdRef.current),
      )

      const {
        setup,
        rivalCount,
        raceDistance,
        progressOf,
        placeAt,
        isNetRace,
        gridCount,
        raceActiveInit,
        gridSlot,
        aiSlotOf,
        playerX,
        playerZ,
        startX,
        body,
        car,
      } = buildRaceSetup({
        R,
        lin,
        map,
        net,
        playerDef,
        prevOrderRef,
        raceSetupRef,
        scene,
        world,
      })
      const { rivals, trafficCars } = await spawnField({
        setup,
        R,
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
      })
      if (disposed) {
        try {
          world.free()
        } catch {}
        return
      }

      {
        const zeroInput = {
          throttle: 0,
          brake: 0,
          steer: 0,
          handbrake: false,
          upshiftPressed: false,
          downshiftPressed: false,
          toggleModePressed: false,
          toggleLaunchPressed: false,
          toggleParkPressed: false,
          toggleTractionPressed: false,
          toggleStabilityPressed: false,
          toggleSafetyPressed: false,
          toggleIgnitionPressed: false,
          toggleHandbrakePressed: false,
          toggleAbsPressed: false,
          resetPressed: false,
          toggleCameraPressed: false,
          startPressed: false,
          pausePressed: false,
          cruiseSetPressed: false,
          cruiseUpPressed: false,
          cruiseTogglePressed: false,
          toggleTimeOfDayPressed: false,
          toggleHeadlightsPressed: false,
          indicatorLeftPressed: false,
          indicatorRightPressed: false,
          hazardPressed: false,
          toggleFreeCameraPressed: false,
        }
        const allCars = [car, ...rivals.map((r) => r.car)]
        for (let i = 0; i < 120; i++) {
          for (const c of allCars) c.update(FIXED_DT, zeroInput)
          world.step()
        }
      }

      const allBodies = [
        body,
        ...rivals.map((r) => r.car.body),
        ...trafficCars.map((r) => r.car.body),
      ]

      let visual = new CarVisual()
      playerVisualRef.current = visual
      const playerPaint = (id: string): number | undefined => {
        return paintFor(id) ?? (net?.roomId ? net.localColor : undefined)
      }
      try {
        await visual.load(baseUrl, playerPaint(playerDef.id), {
          modelFile: playerDef.modelFile,
          targetLength: playerDef.physics.dimensions.length,
          pivots: playerDef.pivots,
          wheelSpots: playerDef.wheels,
          wheelRadius: playerDef.physics.wheels.radius,
          paintMatch: playerDef.paintMatch,
          tailLampMeshes: playerDef.tailLampMeshes,
          paintTexture: playerDef.paintTexture,
          isPlayer: true,
        })
      } catch (e) {
        console.warn("player model failed, continuing with fallback wheels", e)
      }
      visual.setHeadlights(isLowLight(timeOfDayRef.current))
      if (disposed) {
        try {
          world.free()
        } catch {}
        return
      }
      scene.add(visual.group)
      {
        let showToken = 0
        garageApiRef.current = {
          showCar: (id: string, tint?: number) => {
            const my = ++showToken
            if (startedRef.current) return
            const def = getCar(id)
            const next = new CarVisual()
            next
              .load(baseUrl, tint ?? playerPaint(id), {
                modelFile: def.modelFile,
                targetLength: def.physics.dimensions.length,
                pivots: def.pivots,
                wheelSpots: def.wheels,
                wheelRadius: def.physics.wheels.radius,
                paintMatch: def.paintMatch,
                tailLampMeshes: def.tailLampMeshes,
                paintTexture: def.paintTexture,
                isPlayer: true,
              })
              .then(() => {
                if (my !== showToken || disposed || startedRef.current) return
                scene.remove(visual.group)
                visual = next
                playerVisualRef.current = next
                next.setHeadlights(isLowLight(timeOfDayRef.current))
                scene.add(visual.group)
              })
              .catch((e) => {
                console.warn("garage preview failed", e)
              })
          },
          paint: (color: number | null) => {
            if (startedRef.current || disposed) return
            if (color === null || !visual.hasTint()) {
              garageApiRef.current?.showCar(
                carIdRef.current,
                color ?? undefined,
              )
              return
            }
            try {
              visual.setTint(color)
            } catch (e) {
              console.warn("garage paint failed", e)
            }
          },
        }
      }

      let raceActive = rivalCount > 0 || isNetRace
      let raceFinished = false
      let raceElapsed = 0
      let headsUp = raceActive ? 2.6 : 0
      let countdown = raceActive ? 3.0 : 0
      let released = !isNetRace || (net ? net.areAllReady() : true)
      let staged = isNetRace && !released
      let pausedTick = 0
      let playerFinished = false
      let playerFinishTime: number | null = null
      let playerProgress = 0
      let raceUiAcc = 0
      let shadowAcc = 0
      const TRAFFIC_BEHIND = 700
      const TRAFFIC_AHEAD = 1500
      const DETAIL_FAR = 280
      const DETAIL_NEAR = 220
      let playerDoneT = 0

      const smoke = new TireSmoke()
      scene.add(smoke.points)
      flyby?.setSmoke(smoke)
      smoke.wetnessAt = (x, z) =>
        Math.max(WEATHER_WETNESS[conditions.weather], wm.puddleAt(x, z))
      smoke.grassAt = (x, z) =>
        wm.surfaceAt(x, z) === "grass" && wm.puddleAt(x, z) < 0.3
      const skid = new Skidmarks()
      scene.add(skid.mesh)
      const skidP = new THREE.Vector3()
      const smokeSpots: THREE.Vector3[] = []
      let smokeAcc = 0
      let smokeHeat = 0

      const npcSpotPool: THREE.SpotLight[] = []
      for (let sIdx = 0; sIdx < 4; sIdx++) {
        const s = new THREE.SpotLight(
          0xfffaee,
          0,
          85,
          NPC_HEADLIGHT_CONE,
          0.9,
          1.2,
        )
        s.castShadow = false
        s.visible = true
        scene.add(s.target)
        scene.add(s)
        npcSpotPool.push(s)
      }

      const input = new InputManager()
      input.attach()
      inputRef.current = input
      let padNoticeTimer: ReturnType<typeof setTimeout> | undefined
      input.onPadChange = (connected, name) => {
        setPadNotice(
          connected ? `${name} connected` : "Controller disconnected",
        )
        clearTimeout(padNoticeTimer)
        padNoticeTimer = setTimeout(() => setPadNotice(null), 3000)
      }

      const onResize = () => {
        applyRendererResolution(renderer!, camera, mount, settingsRef.current)
      }
      window.addEventListener("resize", onResize)

      let last = performance.now()
      let buriedTimer = 0
      let buriedFrames = 0
      let playerIgnOn = true
      const stepper = createFixedStepper()
      let substepTick = 0
      const hud = createPerfHud(scene, ctx)
      let prevImpactGrip = 1
      let jolt = 0
      const poses = new WeakMap<object, PoseHistory>()
      const poseOf = (c: Vehicle) => {
        let h = poses.get(c)
        if (!h) poses.set(c, (h = new PoseHistory()))
        return h
      }
      const capturePose = (c: Vehicle) =>
        poseOf(c).capture(
          c.body.translation(),
          c.body.rotation(),
          c.getWheelCompressions(),
        )
      let renderAlpha = 0
      const _bPos = new THREE.Vector3()
      const _bRot = new THREE.Quaternion()
      const _bComp: number[] = []
      const syncVisual = (vis: CarVisual, c: Vehicle, dtv: number) => {
        const h = poseOf(c)
        if (!h.ready) {
          vis.syncFromBody(
            c.body,
            c.steerAngle,
            c.getWheelOmegas(),
            dtv,
            c.getWheelCompressions(),
          )
          return
        }
        vis.syncFromPose(
          h.blendPos(renderAlpha, _bPos),
          h.blendRot(renderAlpha, _bRot),
          c.steerAngle,
          c.getWheelOmegas(),
          dtv,
          h.blendCompressions(renderAlpha, _bComp),
        )
      }
      let frameStepMs = 0
      let frameSteps = 0
      const _cp = new THREE.Vector3()
      const _cq = new THREE.Quaternion()
      const _fw = new THREE.Vector3()

      let lightningWasOn = false
      let padAbsApplied = false
      const e0 = { lastMovementX: 0, lastMovementY: 0 }
      const rig = new CameraRig(
        { camera, input, wm, playerDef, e0, ctx },
        startX,
      )
      const lock = createPointerLock({
        ctx,
        dom: renderer!.domElement,
        input,
        rig,
        e0,
      })

      if (disposed) return
      renderer!.compile(scene, camera)
      {
        const revealed: THREE.Object3D[] = []
        const unculled: THREE.Object3D[] = []
        scene.traverse((o) => {
          if ((o as THREE.Light).isLight) return
          if (!o.visible) {
            o.visible = true
            revealed.push(o)
          }
          if (o.frustumCulled) {
            o.frustumCulled = false
            unculled.push(o)
          }
        })
        try {
          aa = new AntiAlias(renderer!, scene, camera)
          aa.render(
            settingsRef.current.antiAliasing ?? "fxaa",
            settingsRef.current.motionBlur ?? 0,
            playerVisualRef.current?.group ?? null,
          )
        } catch (e) {
          console.warn("warm-up render failed", e)
        }
        for (const o of revealed) o.visible = false
        for (const o of unculled) o.frustumCulled = true
      }
      setLoading(false)

      const circuit = map.circuit
      const lapTimer = circuit
        ? new LapTimer(circuit, playerX, playerZ, setLap)
        : null

      const trafficUpkeep = new TrafficUpkeep({
        trafficCars,
        wm,
        lin,
        settingsRef,
        syncVisual,
        behind: TRAFFIC_BEHIND,
        ahead: TRAFFIC_AHEAD,
      })
      const loop = (now: number) => {
        if (disposed) return
        raf = requestAnimationFrame(loop)
        const loopT0 = performance.now()
        spike.enabled = hud.shown()
        spike.begin(now - last, () =>
          hud.spikeExtra(frameSteps, Math.abs(car.forwardSpeed) * 3.6),
        )
        renderer!.info.reset()
        let dt = (now - last) / 1000
        last = now
        dt = Math.min(dt, WORLD.maxFrameDt)

        lock.syncNative()

        const inp = input.update(dt)
        if (input.padConnected) {
          if (!padAbsApplied) {
            car.abs.enabled = true
            padAbsApplied = true
          }
        } else padAbsApplied = false
        if (!startedRef.current && !showIntroRef.current && inp.startPressed)
          startGame()
        if (startedRef.current && inp.pausePressed) {
          if (pausedRef.current) resumeFnRef.current()
          else pauseFnRef.current()
        }
        if (pausedRef.current && inp.startPressed) resumeFnRef.current()
        if (inp.toggleCameraPressed) {
          rig.camMode = (rig.camMode + 1) % 4
          rig.chaseFar = rig.camMode === 1
        }
        if (!startedRef.current && rig.freeCamActive) {
          rig.freeCamActive = false
          freeCamRef.current = false
          setFreeCam(false)
        }
        if (inp.toggleFreeCameraPressed && startedRef.current) {
          rig.freeCamActive = !rig.freeCamActive
          freeCamRef.current = rig.freeCamActive
          setFreeCam(rig.freeCamActive)
          if (rig.freeCamActive) {
            rig.freeCamPos.copy(camera.position)
            rig.freeCamCamPos.copy(camera.position)
            const dir = new THREE.Vector3()
            camera.getWorldDirection(dir)
            rig.freeCamPitch = Math.asin(Math.max(-1, Math.min(1, dir.y)))
            rig.freeCamYaw = Math.atan2(dir.x, -dir.z)
            rig.freeCamLook.copy(camera.position).add(dir)
          }
        }
        if (inp.toggleTimeOfDayPressed) {
          const cur = timeOfDayRef.current
          const nextIdx =
            (TIME_OF_DAY_MODES.indexOf(cur) + 1) % TIME_OF_DAY_MODES.length
          applyTimeOfDay(TIME_OF_DAY_MODES[nextIdx])
        }
        if (inp.toggleHeadlightsPressed) {
          const vis = playerVisualRef.current
          if (vis && playerIgnOn) {
            vis.setHeadlights(!vis.hasHeadlights())
          }
        }
        {
          const vis = playerVisualRef.current
          if (vis) {
            if (inp.indicatorLeftPressed) vis.toggleIndicator("left")
            if (inp.indicatorRightPressed) vis.toggleIndicator("right")
            if (inp.hazardPressed) vis.toggleIndicator("hazard")
            vis.updateIndicators(dt)
          }
        }
        const doReset = inp.resetPressed
        const fellOut = body.translation().y < -3
        const bq0 = body.rotation()
        const upY0 = 1 - 2 * (bq0.x * bq0.x + bq0.z * bq0.z)
        if (
          startedRef.current &&
          !pausedRef.current &&
          body.translation().y < 0.1 &&
          upY0 < 0.3
        ) {
          buriedTimer += dt
        } else {
          buriedTimer = 0
        }
        if (doReset || fellOut || buriedTimer > 5) {
          buriedTimer = 0
          const p = body.translation()
          const rp = map.road.nearestPose(p.x, p.z)
          car.reset(new THREE.Vector3(rp.x, 0.72, rp.z), rp.yaw)
          lapTimer?.cancelLap()
          stepper.acc = 0
        }

        if (pausedRef.current) {
          stepper.acc = 0
          setSpeedLines(0, 0)
          smoke.update(dt)
          pausedTick = (pausedTick + 1) % 3
          if (pausedTick !== 0) return
          ;(aa = aa ?? new AntiAlias(renderer!, scene, camera)).render(
            settingsRef.current.antiAliasing ?? "fxaa",
            settingsRef.current.motionBlur ?? 0,
            playerVisualRef.current?.group ?? null,
          )
          return
        }

        let t = null as null | ReturnType<typeof car.update>
        if (startedRef.current) {
          if (isNetRace && !released && !raceFinished) {
            if (net && net.areAllReady()) {
              released = true
              staged = false
            } else {
              staged = true
            }
          }
          if (raceActive && headsUp > 0 && !staged)
            headsUp = Math.max(0, headsUp - dt)
          else if (raceActive && countdown > 0 && !staged)
            countdown = Math.max(0, countdown - dt)
          const racing =
            !raceActive || (released && headsUp <= 0 && countdown <= 0)
          if (raceActive && racing && !raceFinished) raceElapsed += dt
          const steps = pushFrameTime(stepper, dt)
          if (steps === 0) input.requeue(inp)
          netDiagPhysicsTick(steps, stepper.droppedTotal)
          if (raceActive) {
            const pp = body.translation()
            const traffic: TrafficEntry[] = allBodies.map((b) => {
              const p = b.translation()
              return { body: b, x: p.x, z: p.z }
            })
            for (const rival of rivals) {
              rival.car.autoShiftEnabled = racing
              rival.cached =
                racing && !rival.finished
                  ? rival.ai.drive(rival.car, traffic, dt)
                  : holdInput()
              rival.edgeArmed = true
              if (rival.ai.recovering) {
                rival.stride = 1
              } else {
                const rp0 = rival.car.body.translation()
                const dx0 = rp0.x - pp.x
                const dz0 = rp0.z - pp.z
                const d2 = dx0 * dx0 + dz0 * dz0
                rival.stride = d2 < 6400 ? 1 : d2 < 40000 ? 2 : 4
              }
            }
          }
          if (trafficCars.length > 0) {
            const tpp = body.translation()
            const tEntries: TrafficEntry[] = allBodies.map((b) => {
              const p = b.translation()
              return { body: b, x: p.x, z: p.z }
            })
            for (let ti = 0; ti < trafficCars.length; ti++) {
              const tc = trafficCars[ti]
              tc.car.autoShiftEnabled = true
              if (!tc.ai.recovering) {
                const rp0 = tc.car.body.translation()
                const dx0 = rp0.x - tpp.x
                const dz0 = rp0.z - tpp.z
                const d2 = dx0 * dx0 + dz0 * dz0
                tc.stride = d2 < 6400 ? 1 : d2 < 40000 ? 2 : 4
              } else {
                tc.stride = 1
              }
              if (tc.ai.recovering || (substepTick + ti) % tc.stride === 0) {
                tc.cached = tc.ai.drive(tc.car, tEntries, dt)
                tc.edgeArmed = true
              }
            }
          }
          const stepT0 = performance.now()
          frameSteps = steps
          for (let i = 0; i < steps; i++) {
            if (performance.now() - stepT0 > WORLD.stepBudgetMs) {
              frameSteps = i
              dropBacklog(stepper)
              break
            }
            substepTick++
            const subInp: DriveInput =
              i === 0
                ? inp
                : {
                    ...inp,
                    upshiftPressed: false,
                    downshiftPressed: false,
                    toggleModePressed: false,
                    toggleLaunchPressed: false,
                    toggleParkPressed: false,
                    toggleTractionPressed: false,
                    toggleStabilityPressed: false,
                    toggleSafetyPressed: false,
                    toggleIgnitionPressed: false,
                    toggleHandbrakePressed: false,
                    toggleAbsPressed: false,
                    resetPressed: false,
                    toggleCameraPressed: false,
                    startPressed: false,
                    pausePressed: false,
                    cruiseSetPressed: false,
                    cruiseUpPressed: false,
                    cruiseTogglePressed: false,
                  }
            const postFinishFree =
              playerFinished && !raceFinished && playerDoneT > 4
            const preGreen = raceActive && !racing && !playerFinished
            car.autoShiftEnabled = !preGreen
            const playerInp = rig.freeCamActive
              ? {
                  throttle: 0,
                  brake: 0,
                  steer: 0,
                  handbrake: false,
                  ...ZERO_EDGES,
                }
              : !playerFinished || postFinishFree
                ? subInp
                : holdInput()
            let lockT: { x: number; y: number; z: number } | null = null
            let lockR: { x: number; y: number; z: number; w: number } | null =
              null
            let lockLv: { x: number; y: number; z: number } | null = null
            let lockAv: { x: number; y: number; z: number } | null = null
            if (preGreen) {
              lockT = body.translation()
              lockR = body.rotation()
              lockLv = body.linvel()
              lockAv = body.angvel()
            }
            t = car.update(FIXED_DT, playerInp)
            if (raceActive) {
              for (let ri = 0; ri < rivals.length; ri++) {
                const rival = rivals[ri]
                if ((substepTick + ri) % rival.stride !== 0) continue
                let aiInp = rival.cached
                if (rival.edgeArmed) {
                  rival.edgeArmed = false
                } else {
                  aiInp = stripEdges(aiInp)
                }
                const rt = rival.car.update(FIXED_DT, aiInp)
                rival.brake = Math.max(rt.brake, rt.parkingBrake ? 1 : 0)
              }
            }
            for (let ti = 0; ti < trafficCars.length; ti++) {
              const tc = trafficCars[ti]
              if ((substepTick + ti) % tc.stride !== 0) continue
              let taiInp = tc.cached
              if (tc.edgeArmed) {
                tc.edgeArmed = false
              } else {
                taiInp = stripEdges(taiInp)
              }
              const tt = tc.car.update(FIXED_DT, taiInp)
              tc.brake = Math.max(tt.brake, tt.parkingBrake ? 1 : 0)
            }
            if (net && net.roomId) net.driveRemoteBodies(FIXED_DT)
            world.step()
            if (preGreen && lockT && lockR && lockLv && lockAv) {
              body.setTranslation(lockT, true)
              body.setRotation(lockR, true)
              body.setLinvel(lockLv, true)
              body.setAngvel(lockAv, true)
            }
            if (net && net.roomId)
              net.onPhysicsTick(car, t, () => progressOf(body))
            consumeSubstep(stepper)
            capturePose(car)
            if (raceActive) for (const rv of rivals) capturePose(rv.car)
            for (const tcar of trafficCars)
              if (tcar.visual.group.visible) capturePose(tcar.car)
          }
          frameStepMs = performance.now() - stepT0
          renderAlpha = stepperAlpha(stepper)
          hud.stats.dropped = stepper.droppedTotal
          if (stepper.droppedTotal > 0) {
            ;(window as any).__physicsDroppedTotal = stepper.droppedTotal
          }
        }

        spike.ph("input+physics+car")
        const bp = body.translation()
        const hp = poseOf(car)
        const carPos = hp.ready
          ? hp.blendPos(renderAlpha, _cp)
          : _cp.set(bp.x, bp.y, bp.z)
        moveGroundBody(groundBody, bp.x, bp.z)
        {
          const bray = new R.Ray(
            { x: bp.x, y: bp.y, z: bp.z },
            { x: 0, y: -1, z: 0 },
          )
          const bhit = world.castRay(
            bray as any,
            2.0,
            true,
            undefined,
            undefined,
            undefined,
            body as any,
          )
          const inside =
            !!bhit &&
            (bhit as unknown as { timeOfImpact: number }).timeOfImpact < 0.05
          if (inside) {
            buriedFrames++
          } else {
            buriedFrames = 0
          }
          if (buriedFrames >= 3) {
            const lv = body.linvel()
            body.setTranslation({ x: bp.x, y: bp.y + 0.8, z: bp.z }, true)
            body.setLinvel({ x: lv.x, y: Math.max(lv.y, 0), z: lv.z }, true)
          }
        }
        syncVisual(visual, car, dt)
        playerIgnOn = t?.ignitionOn ?? true
        visual.setPower(
          electricalPower(
            t?.ignitionOn ?? true,
            t?.cranking ?? false,
            t?.crankTime ?? 0,
            t?.sinceStart ?? 99,
          ),
        )
        visual.setBrake(Math.max(t?.brake ?? 0, t?.parkingBrake ? 1 : 0))
        if (net && net.roomId) {
          playerProgress = progressOf(body)
          net.updateRemoteCars(dt, smoke, camera.position)
        }
        if (raceActive) {
          playerProgress = progressOf(body)
          if (!playerFinished && playerProgress >= raceDistance) {
            playerFinished = true
            playerFinishTime = raceElapsed
            net?.notifyFinish(playerFinishTime)
          }
          if (playerFinished && !raceFinished) {
            playerDoneT += dt
            if (playerDoneT > 45) {
              for (const r of rivals) {
                if (!r.finished) {
                  r.finished = true
                  r.finishTime = null
                }
              }
            }
          }
          for (const rival of rivals) {
            const rp = rival.car.body.translation()
            rival.progress = progressOf(rival.car.body)
            if (!rival.finished && rival.progress >= raceDistance) {
              rival.finished = true
              rival.finishTime = raceElapsed
            }
            const rsp = rival.car.forwardSpeed
            const greenNow = headsUp <= 0 && countdown <= 0
            if (greenNow && !rival.finished && Math.abs(rsp) < 1.0) {
              rival.stuckT += dt
            } else {
              rival.stuckT = Math.max(0, rival.stuckT - dt * 3)
            }
            if (rp.y < -3 || rival.stuckT > 8) {
              rival.stuckT = 0
              if (map.circuit) {
                const np = map.road.nearestPose(rp.x, rp.z)
                rival.car.reset(new THREE.Vector3(np.x, 0.72, np.z), np.yaw)
              } else {
                const rs = -rp.z
                rival.car.reset(
                  new THREE.Vector3(lin.centerX(rs), 0.72, rp.z),
                  lin.dirYaw(rs),
                )
              }
            }
            syncVisual(rival.visual, rival.car, dt)
            rival.visual.setBrake(rival.brake)
          }
          if (!raceFinished) {
            const netOrders = Array.from(net?.remoteCars.values() ?? []).map(
              (rc) => ({
                ai: -2,
                finished: rc.finished,
                time: rc.finishTime,
                progress: rc.progress,
              }),
            )
            const order = [
              {
                ai: -1,
                finished: playerFinished,
                time: playerFinishTime,
                progress: playerProgress,
              },
              ...netOrders,
              ...rivals.map((r, i) => ({
                ai: i,
                finished: r.finished,
                time: r.finishTime,
                progress: r.progress,
              })),
            ].sort((a, b) => {
              if (a.finished !== b.finished) return a.finished ? -1 : 1
              if (a.finished && b.finished)
                return (a.time ?? Infinity) - (b.time ?? Infinity)
              return b.progress - a.progress
            })
            if (order.every((p) => p.finished)) {
              raceFinished = true
              prevOrderRef.current = order.map((o) => o.ai)
              if (net && net.roomId && net.localReady) {
                net.setLocalReady(false)
              }
            }
          }
          shadowAcc += dt
          if (shadowAcc > 0.25) {
            shadowAcc = 0
            const ranked = rivals
              .map((r, i) => {
                const rp = r.car.body.translation()
                const dx = rp.x - bp.x
                const dz = rp.z - bp.z
                return { i, d: dx * dx + dz * dz }
              })
              .sort((a, b) => a.d - b.d)
            for (const { i, d } of ranked) {
              rivals[i].visual.setCastShadow(
                d < shadowRange2(settingsRef.current),
              )
            }
            let upgrades = 0
            for (const { i, d } of ranked) {
              const r = rivals[i]
              if (r.hi && d > DETAIL_FAR * DETAIL_FAR) {
                r.hi = false
                r.visual.setDetail(false)
              } else if (
                !r.hi &&
                d < DETAIL_NEAR * DETAIL_NEAR &&
                upgrades < 2
              ) {
                upgrades++
                r.hi = true
                r.visual.setDetail(true)
              }
            }
          }
          raceUiAcc += dt
          if (
            raceUiAcc > 0.05 ||
            raceFinished ||
            headsUp > 0 ||
            countdown > 0
          ) {
            raceUiAcc = 0
            const netStandings: RaceStanding[] = Array.from(
              net?.remoteCars.values() ?? [],
            ).map((rc) => ({
              id: rc.id,
              name: rc.name,
              color: colorHex(rc.color),
              isPlayer: false,
              progressM: rc.progress,
              finished: rc.finished,
              finishTime: rc.finishTime,
            }))
            const standings: RaceStanding[] = [
              {
                id: "you",
                name: net?.roomId ? net.localName : "You",
                color: colorHex(
                  net?.roomId ? net.localColor : DEFAULT_PLAYER_COLOR,
                ),
                isPlayer: true,
                progressM: playerProgress,
                finished: playerFinished,
                finishTime: playerFinishTime,
              },
              ...netStandings,
              ...rivals.map((r, i) => ({
                id: `ai-${i}`,
                name: r.name,
                color: r.color,
                isPlayer: false,
                progressM: r.progress,
                finished: r.finished,
                finishTime: r.finishTime,
              })),
            ].sort((a, b) => {
              if (a.finished !== b.finished) return a.finished ? -1 : 1
              if (a.finished && b.finished)
                return (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity)
              return b.progressM - a.progressM
            })
            const playerPlace = standings.findIndex((s) => s.isPlayer) + 1
            setRace({
              active: true,
              finished: raceFinished,
              distanceM: raceDistance,
              elapsed: raceElapsed,
              playerPlace,
              total: gridCount,
              standings,
              countdown: Math.ceil(countdown),
              phase: headsUp > 0 ? "heads" : countdown > 0 ? "count" : "go",
              readyIn: headsUp,
              staged,
              waitingFor: staged && net ? net.waitingForNames() : [],
            })
          }
        }
        if (trafficCars.length > 0) trafficUpkeep.update(dt, bp)

        spike.ph("race+traffic")
        const lowLightNow = isLowLight(timeOfDayRef.current)
        if (lowLightNow && npcSpotPool.length > 0) {
          const nearCandidates: { body: RAPIER.RigidBody; d: number }[] = []
          for (const r of rivals) {
            const rp = r.car.body.translation()
            const dx = rp.x - bp.x
            const dz = rp.z - bp.z
            const d = dx * dx + dz * dz
            if (d < 36100) {
              nearCandidates.push({ body: r.car.body, d })
            }
          }
          for (const t of trafficCars) {
            if (!t.visual.group.visible) continue
            const rp = t.car.body.translation()
            const dx = rp.x - bp.x
            const dz = rp.z - bp.z
            const d = dx * dx + dz * dz
            if (d < 36100) {
              nearCandidates.push({ body: t.car.body, d })
            }
          }
          nearCandidates.sort((a, b) => a.d - b.d)

          for (let sIdx = 0; sIdx < npcSpotPool.length; sIdx++) {
            const spot = npcSpotPool[sIdx]
            const cand = nearCandidates[sIdx]
            if (cand) {
              const dist = Math.sqrt(cand.d)
              const scale = dist > 180 ? 0 : dist < 90 ? 1 : (180 - dist) / 90
              const targetIntensity = 54 * scale
              if (targetIntensity > 0.05) {
                const bpos = cand.body.translation()
                const bquat = cand.body.rotation()
                _qNpc.set(bquat.x, bquat.y, bquat.z, bquat.w)
                _vNpcPos.set(bpos.x, bpos.y, bpos.z)

                _vNpcFront
                  .set(0, -0.07, -2.4)
                  .applyQuaternion(_qNpc)
                  .add(_vNpcPos)
                _vNpcTarget
                  .set(0, -0.27, -30.0)
                  .applyQuaternion(_qNpc)
                  .add(_vNpcPos)

                spot.position.copy(_vNpcFront)
                spot.target.position.copy(_vNpcTarget)
                spot.target.updateMatrixWorld(true)
                spot.intensity = targetIntensity
              } else {
                spot.intensity = 0
              }
            } else {
              spot.intensity = 0
            }
          }
        } else {
          for (const spot of npcSpotPool) {
            if (spot.intensity > 0) spot.intensity = 0
          }
        }
        spike.ph("npcLights")
        wm.update(-bp.z, carPos, grassTargetFor(car.forwardSpeed, raceActive))
        spike.ph("world")
        lapTimer?.update(
          dt,
          bp.x,
          bp.z,
          startedRef.current && !pausedRef.current,
        )
        spike.ph("world-post")
        if (TIME_OF_DAY_PRESETS[timeOfDayRef.current].rain > 0) {
          const flash = rain.update(dt, camera.position)
          if (flash > 0 || lightningWasOn) wm.setLightning(flash)
          lightningWasOn = flash > 0
        }
        const kmhNow = Math.abs(car.forwardSpeed) * 3.6
        const fullShadows = (settingsRef.current.shadowQuality ?? 100) >= 100
        if (!fullShadows && raceActive && kmhNow > 210) wm.setPropShadows(false)
        else if (fullShadows || !raceActive || kmhNow < 190)
          wm.setPropShadows(true)

        if (startedRef.current) {
          const intensity = Math.max(
            car.slipRatioAvg,
            car.drifting ? 0.55 : 0,
            car.launching ? 0.7 : 0,
          )
          const slipping = intensity > 0.28
          {
            const braking = car.lastWheelLong.some((f) => f < -9000)
            const sk = Math.min(1, intensity)
            visual.wheels.forEach((w, wi) => {
              w.mesh.getWorldPosition(skidP)
              const onRoad =
                wm.surfaceAt(skidP.x, skidP.z) !== "grass" &&
                wm.puddleAt(skidP.x, skidP.z) < 0.3
              const marking =
                onRoad && sk > 0.3 && (!w.front || car.drifting || braking)
              skid.mark(
                wi,
                skidP.x,
                wm.terrainHeightAt(skidP.x, skidP.z),
                skidP.z,
                marking ? sk : null,
              )
            })
          }
          smokeHeat = slipping
            ? Math.min(1, smokeHeat + dt / 1.4)
            : Math.max(0, smokeHeat - dt / 0.7)
          const heat = smokeHeat * smokeHeat * (3 - 2 * smokeHeat)
          if (slipping && heat > 0.02) {
            const smokeStrength = intensity * heat
            visual.wheelContactPositions(car.drifting, smokeSpots)
            if (smokeSpots.length === 0) {
              smokeAcc = 0
            } else {
              smokeAcc += dt * smokeStrength * 90
              while (smokeAcc >= 1) {
                smokeAcc -= 1
                smoke.spawn(
                  smokeSpots[(Math.random() * smokeSpots.length) | 0],
                  Math.min(1, smokeStrength),
                )
              }
            }
          }
        } else {
          smokeHeat = 0
        }
        smoke.update(dt)

        const nowS = now / 1000
        const bq = body.rotation()
        const quat = hp.ready
          ? hp.blendRot(renderAlpha, _cq)
          : _cq.set(bq.x, bq.y, bq.z, bq.w)
        const fwd = _fw.set(0, 0, -1).applyQuaternion(quat)
        rig.smoothFwd.lerp(fwd, 1 - Math.exp(-dt * 10)).normalize()
        rig.update({ dt, nowS, carPos, quat, car, raceActive, headsUp })

        flyby?.update(
          dt,
          -bp.z,
          car.forwardSpeed,
          startedRef.current && !raceActive,
          bp.x,
        )

        spike.ph("camera+misc")
        const renderT0 = performance.now()
        wm.renderReflections?.(renderer!, scene, camera, (on) =>
          rain.setReflectionPass(on),
        )
        ;(aa = aa ?? new AntiAlias(renderer!, scene, camera)).render(
          settingsRef.current.antiAliasing ?? "fxaa",
          settingsRef.current.motionBlur ?? 0,
          playerVisualRef.current?.group ?? null,
        )
        const renderT1 = performance.now()
        spike.ph("render")
        hud.frame(
          now,
          dt * 1000,
          frameSteps,
          frameStepMs,
          loopT0,
          renderT0,
          renderT1,
        )
        spike.ph("overlay")
        frameSteps = 0
        frameStepMs = 0

        if (t && startedRef.current && !pausedRef.current) {
          const ig = car.impactGrip
          jolt = Math.max(
            jolt * Math.exp(-dt * 6),
            Math.min(1, Math.max(0, (prevImpactGrip - ig) * 4)),
          )
          prevImpactGrip = ig
          if (settingsRef.current.rumble !== false) {
            const slip = Math.min(1, Math.abs(t.slipRatio))
            input.rumble(jolt, Math.max(slip * 0.6, t.drift ? 0.35 : 0))
          }
        }

        if (t && now - teleRef.last > 50) {
          teleRef.last = now
          teleStore.set({ ...t })
        }
      }
      raf = requestAnimationFrame(loop)
      ;(mount as any)._cleanup = () => {
        garageApiRef.current = null
        window.removeEventListener("resize", onResize)
        hud.dispose()
        lock.dispose()
        input.detach()
        try {
          skid.dispose()
        } catch {}
        rainRef.current = null
        try {
          rain.dispose()
        } catch {}
        flybyRef.current = null
        try {
          flyby?.dispose()
        } catch (e) {
          console.warn("[Teardown] flyby dispose failed:", e)
        }
        if (net) {
          try {
            net.remoteCars.forEach((rc) => {
              try {
                rc.dispose(scene, world)
              } catch (e) {
                console.warn("[Teardown] Remote dispose failed:", e)
              }
            })
          } finally {
            net.remoteCars.clear()
            net.detachScene()
          }
        }
        try {
          world.free()
        } catch (e) {
          console.warn("[Teardown] world.free failed:", e)
        }
      }
    } catch (e: any) {
      console.error(e)
      if (!disposed) {
        errorRef.current = true
        setError(e?.message ?? String(e))
        setLoading(false)
        document.documentElement.style.cursor = ""
        document.body.style.cursor = ""
        if (document.pointerLockElement) document.exitPointerLock?.()
      }
    }
  })()

  return () => {
    disposed = true
    cancelAnimationFrame(raf)
    const mount: any = mountRef.current
    mount?._cleanup?.()
    if (renderer) {
      aa?.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
    cameraRef.current = null
    rendererRef.current = null
  }
}
