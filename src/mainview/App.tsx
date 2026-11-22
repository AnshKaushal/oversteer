import { photoState, setPhotoFov, requestPhoto } from "./game/photoMode"
import { useMapSelection } from "./app/useMapSelection"
import { setDynoCoverHook } from "./systems/garageFocus"
import { useGarage } from "./app/useGarage"
import { ClockHud } from "./ui/ClockHud"
import { configureSky, restoreClock, skyClock } from "./systems/sky/SkyClock"
import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { onLoadProgress } from "./systems/loadProgress"
import { LiveDashboard } from "./ui/LiveHud"
import { SpeedTimerHud } from "./ui/SpeedTimerHud"
import { listMaps, getMap, randomSeed, type MapWorld } from "./maps"
import {
  type TimeOfDayMode,
  normalizeMode,
} from "./constants/timeOfDay"
import { CarVisual } from "./systems/CarVisual"
import { AirplaneFlyby } from "./systems/AirplaneFlyby"
import { InputManager } from "./systems/InputManager"
import {
  RACE_COUNTS,
  RACE_DISTANCES_KM,
  emptyRace,
  type RaceSetup,
  type RaceSnapshot,
  type TrafficLevel,
} from "./systems/RaceTypes"
import { EASE, Screen, usePresence, Wipe } from "./ui/anim"
import { RaceHud, RaceLiveBoard, RaceResults } from "./ui/RaceOverlay"
import { LapHud, type LapSnapshot } from "./ui/LapHud"
import { MapPicker } from "./ui/MapPicker"
import { RainEffect } from "./systems/RainEffect"
import { SettingsScreen } from "./ui/screens/SettingsScreen"
import { currentDisplayId } from "./ui/DisplayPicker"
import { getDisplays, moveToDisplay } from "./systems/updater"
import { ControllerToast } from "./ui/ControllerToast"
import {
  loadSettings,
  saveSettings,
  applyRendererResolution,
  type AppSettings,
} from "./systems/settings"
import { SpeedLines } from "./ui/SpeedLines"
import { MultiplayerManager } from "./systems/net/MultiplayerManager"
import { MultiplayerLobby, MultiplayerHudBadge } from "./ui/MultiplayerLobby"
import { NetDiagPanel } from "./ui/NetDiagPanel"
import { setPausedFlag } from "./app/pauseState"
import { netDiagEnabled } from "./systems/net/NetDiagnostics"
import type { PeerPlayer } from "./systems/net/types"
import { CARS } from "./data/cars"

import { startSession } from "./game/session"
import type { SessionCtx } from "./game/sessionCtx"
import { PauseScreen } from "./ui/screens/PauseScreen"
import { LoadingScreen } from "./ui/screens/LoadingScreen"
import { ErrorScreen } from "./ui/screens/ErrorScreen"
import { IntroScreen } from "./ui/screens/IntroScreen"
import { GarageScene } from "./ui/garage/GarageScene"
import {
  initialTele,
  applyFog,
  _qNpc,
  _vNpcFront,
  _vNpcTarget,
  _vNpcPos,
} from "./app/helpers"

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const [freeCam, setFreeCam] = useState(false)
  const freeCamRef = useRef(false)
  const [hideUi, setHideUi] = useState(false)
  const [fov, setFov] = useState(photoState.fov)
  const [flash, setFlash] = useState(false)
  const [photoMsg, setPhotoMsg] = useState<string | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat && e.code !== "KeyZ") return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return
      if (e.code === "KeyU") setHideUi((h) => !h)
      if (!freeCamRef.current) return
      if (e.code === "KeyZ")
        setPhotoFov(photoState.fov + (e.shiftKey ? 2 : -2))
      else if (e.code === "Space") {
        e.preventDefault()
        requestPhoto()
        setFlash(true)
        setTimeout(() => setFlash(false), 140)
      }
    }
    const onWheel = (e: WheelEvent) => {
      if (!freeCamRef.current) return
      setPhotoFov(photoState.fov + Math.sign(e.deltaY) * 3)
    }
    let msgT: ReturnType<typeof setTimeout> | undefined
    const onSaved = (e: Event) => {
      const d = (e as CustomEvent<{ ok: boolean; where: string }>).detail
      setPhotoMsg(d.ok ? `Photo saved · ${d.where}` : "Could not save the photo. Try again.")
      clearTimeout(msgT)
      msgT = setTimeout(() => setPhotoMsg(null), 3500)
    }
    const onFov = (e: Event) => setFov((e as CustomEvent<number>).detail)
    window.addEventListener("keydown", onKey)
    window.addEventListener("wheel", onWheel, { passive: true })
    window.addEventListener("photo-saved", onSaved)
    window.addEventListener("freecam-fov", onFov)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("wheel", onWheel)
      window.removeEventListener("photo-saved", onSaved)
      window.removeEventListener("freecam-fov", onFov)
      clearTimeout(msgT)
    }
  }, [])
  const [paused, setPaused] = useState(false)
  const [lockHint, setLockHint] = useState(false)
  const speedLinesRef = useRef<HTMLDivElement | null>(null)
  const speedLinesOn = useRef(false)
  const setSpeedLines = (v: number, strength: number) => {
    const el = speedLinesRef.current
    if (!el) return
    if (v <= 0.001) {
      if (speedLinesOn.current) {
        speedLinesOn.current = false
        el.style.opacity = "0"
        el.classList.add("sl-off")
      }
      return
    }
    if (!speedLinesOn.current) {
      speedLinesOn.current = true
      el.classList.remove("sl-off")
    }
    el.style.opacity = String(Math.min(1, v) * strength)
  }
  const startedRef = useRef(false)
  const pausedRef = useRef(false)
  useEffect(() => {
    setPausedFlag(paused)
    return () => setPausedFlag(false)
  }, [paused])
  const errorRef = useRef(false)
  useEffect(() => {
    errorRef.current = !!error
    if (!error) return
    document.documentElement.style.cursor = ""
    document.body.style.cursor = ""
    if (document.pointerLockElement) document.exitPointerLock?.()
  }, [error])
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const showSettingsRef = useRef(false)
  showSettingsRef.current = showSettings
  const raceFinishedRef = useRef(false)
  const [padNotice, setPadNotice] = useState<string | null>(null)
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayMode>(
    () => normalizeMode(settings.timeOfDay),
  )
  const timeOfDayRef = useRef<TimeOfDayMode>(timeOfDay)
  timeOfDayRef.current = timeOfDay
  useState(() => {
    restoreClock()
    configureSky(settings, timeOfDay)
  })
  const wmRef = useRef<MapWorld | null>(null)
  const flybyRef = useRef<AirplaneFlyby | null>(null)
  const rainRef = useRef<RainEffect | null>(null)
  const playerVisualRef = useRef<CarVisual | null>(null)
  const activeRivalsRef = useRef<{ visual: CarVisual }[]>([])
  const activeTrafficRef = useRef<{ visual: CarVisual }[]>([])

  const applyLamps = (on: boolean) => {
    playerVisualRef.current?.setHeadlights(on)
    for (const r of activeRivalsRef.current) r.visual.setHeadlights(on)
    for (const t of activeTrafficRef.current) t.visual.setHeadlights(on)
    multiplayerRef.current?.setHeadlights(on)
  }
  const hazardsShownRef = useRef(false)
  const applyStormHazards = (on: boolean) => {
    if (hazardsShownRef.current === on) return
    hazardsShownRef.current = on
    const set = (v: CarVisual | null | undefined) => {
      if (!v) return
      if (on) v.setIndicator("hazard")
      else if (v.indicatorMode === "hazard") v.setIndicator("off")
    }
    set(playerVisualRef.current)
    for (const r of activeRivalsRef.current) set(r.visual)
    for (const t of activeTrafficRef.current) set(t.visual)
  }
  const lampsShownRef = useRef<boolean | null>(null)
  const applySky = (force = false) => {
    const st = skyClock.state
    wmRef.current?.setSkyPreset(st.preset, st.lamps)
    flybyRef.current?.setLamps(st.lamps)
    rainRef.current?.setConditions(st.rain, st.preset.lightning)
    applyStormHazards(st.preset.lightning)
    if (force || lampsShownRef.current !== st.lamps) {
      lampsShownRef.current = st.lamps
      applyLamps(st.lamps)
    }
  }
  const applySkyRef = useRef(applySky)
  applySkyRef.current = applySky

  const applyTimeOfDay = (mode: TimeOfDayMode) => {
    setTimeOfDay(mode)
    timeOfDayRef.current = mode
    setSettings((prev) => {
      const next = { ...prev, timeOfDay: mode }
      saveSettings(next)
      return next
    })
    configureSky(settingsRef.current, mode)
    applySky(true)
  }

  useEffect(() => {
    void getDisplays().then((list) => {
      if (list.length < 2) return
      const saved = settingsRef.current.displayId
      if (saved !== undefined && list.some((d) => d.id === saved)) {
        if (currentDisplayId(list) !== saved) void moveToDisplay(saved)
        return
      }
    })
  }, [])

  const handleUpdateSettingsRef = useRef<
    (s: AppSettings, auto?: boolean) => void
  >(() => {})
  handleUpdateSettingsRef.current = (next, auto) =>
    handleUpdateSettings(next, auto)
  const autoOrigRef = useRef<Partial<AppSettings>>({})
  const handleUpdateSettings = (next: AppSettings, auto = false) => {
    const orig = autoOrigRef.current as Record<string, unknown>
    const cur = settingsRef.current as unknown as Record<string, unknown>
    const nx = next as unknown as Record<string, unknown>
    if (auto) {
      for (const k of Object.keys(nx))
        if (nx[k] !== cur[k] && !(k in orig)) orig[k] = cur[k]
    } else {
      for (const k of Object.keys(orig)) if (nx[k] !== cur[k]) delete orig[k]
      if (!next.autoQuality && Object.keys(orig).length) {
        next = { ...next, ...(orig as Partial<AppSettings>) }
        autoOrigRef.current = {}
      }
    }
    setSettings(next)
    saveSettings({ ...next, ...autoOrigRef.current })
    if (rendererRef.current && cameraRef.current && mountRef.current) {
      applyRendererResolution(
        rendererRef.current,
        cameraRef.current,
        mountRef.current,
        next,
      )
    }
    if (wmRef.current) applyFog(wmRef.current, next)
    if (next.timeOfDay && next.timeOfDay !== timeOfDayRef.current) {
      applyTimeOfDay(next.timeOfDay)
    } else {
      configureSky(next, timeOfDayRef.current)
      applySky(true)
    }
  }

  const inputRef = useRef<InputManager | null>(null)
  const pauseFnRef = useRef(() => {})
  const resumeFnRef = useRef(() => {})
  const raceSetupRef = useRef<RaceSetup | null>(null)
  const lastRaceRef = useRef<RaceSetup | null>(null)
  const prevOrderRef = useRef<number[] | null>(null)
  const [race, setRace] = useState<RaceSnapshot>(emptyRace)
  const [rivals, setRivals] = useState<(typeof RACE_COUNTS)[number]>(3)
  const [distanceKm, setDistanceKm] =
    useState<(typeof RACE_DISTANCES_KM)[number]>(5)
  const [session, setSession] = useState(0)
  const multiplayerRef = useRef<MultiplayerManager | null>(null)
  const {
    carId,
    carIdRef,
    garageApiRef,
    stepCar,
    paintFor,
    pushNetColor,
    setPaintFor,
    pool,
    poolRef,
    togglePool,
  } = useGarage(multiplayerRef)
  const [trafficLevel, setTrafficLevel] = useState<TrafficLevel>(() => {
    try {
      const raw = localStorage.getItem("oversteer_traffic")
      if (raw === "low" || raw === "medium" || raw === "high") return raw
    } catch {}
    return "off"
  })
  const trafficRef = useRef(trafficLevel)
  const selectTraffic = (level: TrafficLevel) => {
    trafficRef.current = level
    setTrafficLevel(level)
    try {
      localStorage.setItem("oversteer_traffic", level)
    } catch {}
  }

  const [lap, setLap] = useState<LapSnapshot | null>(null)

  const [showMultiplayerLobby, setShowMultiplayerLobby] = useState(false)
  const [wipe, setWipe] = useState<{
    token: number
    label: string
    red: boolean
  } | null>(null)
  const [wipeBusy, setWipeBusy] = useState(false)
  const coverFn = useRef<(() => void) | null>(null)
  const PLAY_COVER_MS = 2000
  const coverMinMs = useRef(0)
  const coverUntil = useRef(0)
  const startingPlayRef = useRef(false)
  const releaseWipe = () => {
    const done = () => {
      startingPlayRef.current = false
      setWipeBusy(false)
    }
    const wait = coverUntil.current - performance.now()
    if (wait > 0) window.setTimeout(done, wait)
    else done()
  }
  const cover = (
    label: string,
    red: boolean,
    fn: () => void,
    minCover = 0,
  ) => {
    if (import.meta.env.DEV)
      console.debug(`[cover] "${label}" min=${minCover}ms`, new Error().stack)
    coverFn.current = fn
    coverMinMs.current = minCover
    setWipeBusy(true)
    setWipe((w) => ({ token: (w?.token ?? 0) + 1, label, red }))
  }
  const coverRef = useRef(cover)
  coverRef.current = cover
  useEffect(() => {
    setDynoCoverHook((apply) => {
      if (startedRef.current) return apply()
      coverRef.current("", false, apply)
    })
    return () => setDynoCoverHook(null)
  }, [])
  const onCovered = () => {
    const fn = coverFn.current
    coverFn.current = null
    coverUntil.current = performance.now() + coverMinMs.current
    fn?.()
  }
  const sessionTimer = useRef(0)
  const raceLiveRef = useRef(false)
  raceLiveRef.current = race.active && !race.finished
  const rebuildSession = (delay = 300) => {
    if (delay > 0 && raceLiveRef.current) return
    window.clearTimeout(sessionTimer.current)
    sessionTimer.current = window.setTimeout(() => {
      setSession((n) => n + 1)
    }, delay)
  }
  useEffect(() => () => window.clearTimeout(sessionTimer.current), [])
  const {
    mapId,
    setMapId,
    mapIdRef,
    circuitOpts,
    setCircuitOpts,
    circuitOptsRef,
    updateCircuitOpts,
    selectMap,
    rerollTrack,
  } = useMapSelection(rebuildSession)
  const mapFeatures = getMap(mapId).features
  const [showIntro, setShowIntro] = useState(true)
  const showIntroRef = useRef(true)
  showIntroRef.current = showIntro
  const showLobbyRef = useRef(false)
  showLobbyRef.current = showMultiplayerLobby
  const [loadPct, setLoadPct] = useState(0)
  useEffect(() => onLoadProgress(setLoadPct), [])
  const loadingRef = useRef(true)
  loadingRef.current = loading
  const [netPeers, setNetPeers] = useState<PeerPlayer[]>([])
  const [netConnected, setNetConnected] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [netRoomId, setNetRoomId] = useState("")
  const [driverName, setDriverName] = useState(
    () => localStorage.getItem("oversteer_name") || "Racer",
  )
  const [driverColor, setDriverColor] = useState<number>(0x1f6feb)
  const [showNetDiag] = useState(() => netDiagEnabled())
  if (!multiplayerRef.current) {
    multiplayerRef.current = new MultiplayerManager(driverName, driverColor)
  }

  useEffect(() => {
    const net = multiplayerRef.current
    if (!net) return
    net.setCallbacks({
      onPeersUpdated: (peers) => {
        setNetPeers([...peers])
        setNetConnected(!!net.roomId)
      },
      onJoinError: (msg) => {
        setJoinError(`${msg} Check the room code and your connection, then try again.`)
        setNetConnected(false)
      },
      onRaceStartSignal: (startTimeMs, distanceM, rivals = 0, mapSpec) => {
        if (raceLiveRef.current || startingPlayRef.current) return
        startingPlayRef.current = true
        if (mapSpec && getMap(mapSpec.id).features.multiplayer) {
          mapIdRef.current = mapSpec.id
          setMapId(mapSpec.id)
          if (mapSpec.id === "circuit") {
            circuitOptsRef.current = {
              ...circuitOptsRef.current,
              lengthKm: mapSpec.lengthKm ?? circuitOptsRef.current.lengthKm,
              twistiness:
                mapSpec.twistiness ?? circuitOptsRef.current.twistiness,
              widthM: mapSpec.widthM ?? circuitOptsRef.current.widthM,
              barriers: mapSpec.barriers ?? circuitOptsRef.current.barriers,
              lockSeed: true,
              seed: Math.floor(startTimeMs),
            }
            setCircuitOpts(circuitOptsRef.current)
          }
        }
        const next = {
          rivals,
          distanceM,
          seed: Math.floor(startTimeMs),
        }
        lockCanvas()
        cover("ON THE GRID", true, () => {
          lastRaceRef.current = next
          raceSetupRef.current = next
          startedRef.current = true
          pausedRef.current = false
          setStarted(true)
          setPaused(false)
          setShowMultiplayerLobby(false)
          setRace(emptyRace)
          rebuildSession(0)
        }, PLAY_COVER_MS)
      },
    })
  }, [])

  const handleStartMultiplayerRace = (distKm: number, aiCount: number) => {
    const distM = distKm * 1000
    const o = circuitOptsRef.current
    const spec =
      mapIdRef.current === "circuit"
        ? {
            id: "circuit",
            lengthKm: o.lengthKm,
            twistiness: o.twistiness,
            widthM: o.widthM,
            barriers: o.barriers,
          }
        : { id: mapIdRef.current }
    multiplayerRef.current?.startMultiplayerRace(distM, aiCount, spec)
  }

  const handleStartFreeDrive = () => {
    setShowMultiplayerLobby(false)
    startGame()
  }

  const handleLeaveRoom = () => {
    multiplayerRef.current?.leave()
    setNetConnected(false)
    setNetRoomId("")
    setNetPeers([])
    setJoinError(null)
  }

  useEffect(() => {
    raceFinishedRef.current = race.finished
    if (race.finished) {
      document.documentElement.style.cursor = ""
      document.body.style.cursor = ""
      unlockEscapeKey()
      if (document.pointerLockElement) document.exitPointerLock?.()
    }
  }, [race.finished])

  const lockEscapeKey = () => {
    try {
      ;(navigator as any).keyboard?.lock?.(["Escape"])?.catch?.(() => {})
    } catch {}
  }
  const unlockEscapeKey = () => {}
  useEffect(() => {
    lockEscapeKey()
  }, [])

  const lockCanvas = () => {
    document.documentElement.style.cursor = "none"
    document.body.style.cursor = "none"
    lockEscapeKey()
    const el = rendererRef.current?.domElement as any
    try {
      try {
        const p = el?.requestPointerLock?.({ unadjustedMovement: true })
        if (p?.catch) p.catch(() => {})
      } catch {
        el?.requestPointerLock?.()
      }
    } catch {}
  }

  const startGame = () => {
    if (startingPlayRef.current || startedRef.current) return
    startingPlayRef.current = true
    lockCanvas()
    cover("FREE ROAM", false, () => {
      if (!startedRef.current && !loadingRef.current && !error) {
        startedRef.current = true
        if (garageApiRef.current?.enterFreeRoam(mapIdRef.current)) {
          raceSetupRef.current = null
          pausedRef.current = false
          setStarted(true)
          setPaused(false)
          setLockHint(false)
          setRace(emptyRace)
          releaseWipe()
          return
        }
        startedRef.current = false
      }
      rerollTrack()
      raceSetupRef.current = null
      startedRef.current = true
      pausedRef.current = false
      setStarted(true)
      setPaused(false)
      setLockHint(false)
      setRace(emptyRace)
      rebuildSession(0)
    }, PLAY_COVER_MS)
  }

  const racePendingRef = useRef(false)
  const startRace = () => {
    if (racePendingRef.current || startingPlayRef.current || startedRef.current)
      return
    startingPlayRef.current = true
    lockCanvas()
    cover(
      "ON THE GRID",
      true,
      () => {
        const next = { rivals, distanceM: distanceKm * 1000 }
        const rebuild = () => {
          rerollTrack()
          lastRaceRef.current = next
          raceSetupRef.current = next
          startedRef.current = true
          pausedRef.current = false
          setStarted(true)
          setPaused(false)
          setLockHint(false)
          setRace(emptyRace)
          rebuildSession(0)
        }
        if (
          startedRef.current ||
          loadingRef.current ||
          error ||
          mapIdRef.current !== "highway" ||
          !garageApiRef.current
        )
          return rebuild()
        const prev = raceSetupRef.current
        raceSetupRef.current = next
        racePendingRef.current = true
        void garageApiRef.current.enterRace(mapIdRef.current).then((ok) => {
          racePendingRef.current = false
          if (ok) {
            lastRaceRef.current = next
            pausedRef.current = false
            setStarted(true)
            setPaused(false)
            setLockHint(false)
            setRace(emptyRace)
            releaseWipe()
            return
          }
          raceSetupRef.current = prev
          rebuild()
        })
      },
      PLAY_COVER_MS,
    )
  }

  const pauseGame = () => {
    if (!startedRef.current || pausedRef.current) return
    pausedRef.current = true
    setPaused(true)
    inputRef.current?.clear()
    unlockEscapeKey()
    document.documentElement.style.cursor = ""
    document.body.style.cursor = ""
    if (document.pointerLockElement) document.exitPointerLock?.()
  }

  const resumeGame = () => {
    if (!startedRef.current || !pausedRef.current) return
    pausedRef.current = false
    setPaused(false)
    setLockHint(false)
    inputRef.current?.clear()
    lockCanvas()
  }

  const raceAgain = () => {
    const last = lastRaceRef.current
    if (!last || startingPlayRef.current) return
    startingPlayRef.current = true
    const net = multiplayerRef.current
    if (net && net.roomId) {
      net.setLocalReady(true, last.distanceM)
    }
    cover("ON THE GRID", true, () => {
      pausedRef.current = false
      startedRef.current = true
      setPaused(false)
      setRace(emptyRace)
      inputRef.current?.clear()
      document.documentElement.style.cursor = ""
      document.body.style.cursor = ""
      if (document.pointerLockElement) document.exitPointerLock?.()
      raceSetupRef.current = last
      rebuildSession(0)
    })
  }

  const restart = () => {
    if (raceSetupRef.current && lastRaceRef.current) {
      raceAgain()
    } else if (!startingPlayRef.current) {
      startingPlayRef.current = true
      cover("FREE ROAM", false, () => {
        pausedRef.current = false
        startedRef.current = true
        setPaused(false)
        setRace(emptyRace)
        inputRef.current?.clear()
        rebuildSession(0)
      })
    }
    lockCanvas()
  }

  const quitToMenu = () => {
    if (startingPlayRef.current) return
    startingPlayRef.current = true
    const net = multiplayerRef.current
    if (net && net.roomId && net.localReady) net.setLocalReady(false)
    cover("GARAGE", false, () => {
      pausedRef.current = false
      startedRef.current = false
      raceSetupRef.current = null
      freeCamRef.current = false
      setFreeCam(false)
      setPaused(false)
      setStarted(false)
      setLockHint(false)
      setRace(emptyRace)
      inputRef.current?.clear()
      unlockEscapeKey()
      document.documentElement.style.cursor = ""
      document.body.style.cursor = ""
      if (document.pointerLockElement) document.exitPointerLock?.()
      rebuildSession(0)
    })
  }

  pauseFnRef.current = pauseGame
  resumeFnRef.current = resumeGame

  useEffect(() => {
    if (started || loading || showMultiplayerLobby) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft") stepCar(-1)
      else if (e.code === "ArrowRight") stepCar(1)
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [started, loading, showMultiplayerLobby])

  const sessionCtx = (): SessionCtx => ({
    activeRivalsRef,
    activeTrafficRef,
    applyTimeOfDay,
    applySkyRef,
    cameraRef,
    carIdRef,
    circuitOptsRef,
    errorRef,
    flybyRef,
    freeCamRef,
    garageApiRef,
    handleUpdateSettingsRef,
    inputRef,
    loadingRef,
    mapIdRef,
    mountRef,
    multiplayerRef,
    paintFor,
    pauseFnRef,
    pausedRef,
    playerVisualRef,
    poolRef,
    prevOrderRef,
    raceFinishedRef,
    raceSetupRef,
    rainRef,
    rendererRef,
    resumeFnRef,
    setError,
    setFreeCam,
    setLap,
    setLoading: (v) => {
      if (import.meta.env.DEV) console.debug(`[loading] set ${v}`)
      setLoading(v)
      if (v === false) releaseWipe()
    },
    setLockHint,
    setPadNotice,
    setRace,
    setSpeedLines,
    settingsRef,
    showIntroRef,
    showLobbyRef,
    showSettingsRef,
    startGame,
    startedRef,
    timeOfDayRef,
    trafficRef,
    wmRef,
  })

  useEffect(() => startSession(sessionCtx()), [session])

  const menuOn =
    !loading &&
    !error &&
    !started &&
    !showMultiplayerLobby &&
    !showIntro &&
    !showSettings
  const pauseOn =
    !loading && !error && started && paused && !race.finished && !showSettings
  const introOn = showIntro && !started && !showSettings
  const resultsOn =
    !loading && !error && started && race.finished && !showSettings
  const dashOn = !loading && !error && started && !race.finished
  const hudOn = !loading && !error && started && !paused && !race.finished
  const badgeOn = netConnected && started && !race.finished
  const menuVisible = usePresence(menuOn, 300)
  const pauseVisible = usePresence(pauseOn, 240)
  const introVisible = usePresence(introOn, 480)
  const loadingVisible = usePresence(loading, 320)
  const lobbyOn = showMultiplayerLobby && !showSettings
  const lobbyVisible = usePresence(lobbyOn, 300)
  const resultsVisible = usePresence(resultsOn, 340)
  const dashVisible = usePresence(dashOn, 260)
  const hudVisible = usePresence(hudOn, 260)
  const badgeVisible = usePresence(badgeOn, 220)
  const finishedRaceRef = useRef<RaceSnapshot>(emptyRace)
  useEffect(() => {
    if (race.finished) finishedRaceRef.current = race
  }, [race])

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden bg-black ${started && !paused && !race.finished ? "cursor-none" : ""} ${hideUi && started && !paused ? "[&>*:not([data-game-mount])]:!hidden" : ""}`}
    >
      {}
      <div
        id="garage-boards"
        className="pointer-events-none absolute inset-0 isolate z-0 overflow-hidden"
      />
      <div
        ref={mountRef}
        data-game-mount
        className="pointer-events-none absolute inset-0"
      />
      {}
      <SpeedLines ref={speedLinesRef} />
      {showNetDiag && <NetDiagPanel />}
      {freeCam && started && !paused && !race.finished && (
        <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 border border-white/20 bg-black/70 px-4 py-1.5 text-[12px] tracking-wide text-white backdrop-blur">
          FREE CAMERA · WASD move · mouse look · Q/E up/down · Shift sprint ·
          wheel / Z FOV ({Math.round(fov)}°) · Space photo · U hide UI · F exit
        </div>
      )}
      {flash && (
        <div className="pointer-events-none absolute inset-0 z-50 bg-white/80" />
      )}
      {photoMsg && (
        <div
          role="status"
          className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#0a0a0a] px-4 py-2 text-[12px] font-bold uppercase tracking-[0.1em] text-[#efefef]"
        >
          {photoMsg}
        </div>
      )}
      {dashVisible && (
        <Screen
          open={dashOn}
          className="pointer-events-none absolute inset-0"
          from={{ autoAlpha: 0 }}
          to={{ duration: 0.6, delay: 0.12 }}
          exit={{ duration: 0.26, ease: EASE.in }}
        >
          <LiveDashboard
            initial={initialTele}
            dashStyle={settings.dashStyle ?? "modern"}
          />
          {settings.speedTimer !== false && !race.active && <SpeedTimerHud />}
        </Screen>
      )}
      {hudVisible && (
        <Screen
          open={hudOn}
          className="pointer-events-none absolute inset-0"
          from={{ autoAlpha: 0 }}
          to={{ duration: 0.35, delay: 0.25 }}
          exit={{ duration: 0.24, ease: EASE.in }}
        >
          <RaceHud race={race} />
          {mapId === "circuit" && lap && !race.active && <LapHud lap={lap} />}
        </Screen>
      )}
      {hudVisible && (
        <Screen
          open={hudOn}
          className="pointer-events-none absolute inset-0"
          from={{ autoAlpha: 0 }}
          to={{ duration: 0.4, delay: 0.35 }}
          exit={{ duration: 0.24, ease: EASE.in }}
        >
          <RaceLiveBoard race={race} gapM={getMap(mapId).gapM} />
        </Screen>
      )}
      {hudVisible &&
        !loading &&
        !error &&
        started &&
        !paused &&
        !race.finished &&
        lockHint && (
          <Screen open from={{ autoAlpha: 0 }} to={{ duration: 0.3 }}>
            <div className="pointer-events-none absolute bottom-32 left-1/2 -translate-x-1/2 border border-white/15 bg-black/70 px-5 py-2 text-[12px] tracking-wide text-gray-200 backdrop-blur">
              Click anywhere to get the mouse back
            </div>
          </Screen>
        )}
      {badgeVisible && (
        <Screen
          open={badgeOn}
          from={{ autoAlpha: 0 }}
          to={{ duration: 0.4 }}
          exit={{ duration: 0.2, ease: EASE.in }}
        >
          <MultiplayerHudBadge
            playerCount={netPeers.length + 1}
            pingMs={netPeers[0]?.pingMs ?? 0}
            onLeave={handleLeaveRoom}
          />
        </Screen>
      )}
      {menuVisible && (
        <GarageScene
          open={menuOn}
          rivals={rivals}
          distanceKm={distanceKm}
          onRivals={setRivals}
          onDistance={setDistanceKm}
          lapMode={mapId === "circuit"}
          paint={paintFor(carId) ?? null}
          onPaint={(color) => setPaintFor(carId, color)}
          cars={CARS}
          carId={carId}
          onPrevCar={() => stepCar(-1)}
          onNextCar={() => stepCar(1)}
          pool={pool}
          onTogglePool={togglePool}
          traffic={trafficLevel}
          onTraffic={selectTraffic}
          racesEnabled={mapFeatures.races}
          trafficEnabled={mapFeatures.traffic}
          mapPicker={
            <MapPicker
              maps={listMaps()}
              mapId={mapId}
              onMap={selectMap}
              circuit={circuitOpts}
              onCircuit={(patch) => updateCircuitOpts(patch)}
              onReroll={() => updateCircuitOpts({ seed: randomSeed() })}
            />
          }
          onFreeDrive={startGame}
          onStartRace={startRace}
          onOpenMultiplayer={() => setShowMultiplayerLobby(true)}
          onOpenSettings={() => setShowSettings(true)}
          onBack={() => setShowIntro(true)}
          gamepadNav={!showSettings && !showMultiplayerLobby}
          timeOfDay={timeOfDay}
          onTimeOfDay={applyTimeOfDay}
        />
      )}
      <ControllerToast message={padNotice} />
      <ClockHud active={hudOn && settings.clockHud !== false} />
      <SettingsScreen
        open={showSettings}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onClose={() => setShowSettings(false)}
      />
      {lobbyVisible && (
        <MultiplayerLobby
          open={lobbyOn}
          playerName={driverName}
          carColor={driverColor}
          roomId={netRoomId}
          isConnected={netConnected}
          peers={netPeers}
          onUpdateProfile={(name, col) => {
            setDriverName(name)
            setDriverColor(col)
            try {
              localStorage.setItem("oversteer_name", name)
            } catch {}
            if (multiplayerRef.current) {
              multiplayerRef.current.localName = name
              multiplayerRef.current.localColor = col
              multiplayerRef.current.announceIdentitySoon()
            }
          }}
          onJoinRoom={(target, mode, password) => {
            setJoinError(null)
            setNetRoomId(target)
            pushNetColor()
            const ok =
              multiplayerRef.current?.join(
                target,
                mode,
                driverName,
                paintFor(carIdRef.current) ?? driverColor,
                password,
              ) ?? false
            setNetConnected(ok)
          }}
          onLeaveRoom={handleLeaveRoom}
          onStartMultiplayerRace={handleStartMultiplayerRace}
          onStartFreeDrive={handleStartFreeDrive}
          lapMode={mapId === "circuit"}
          mapPicker={
            <MapPicker
              maps={listMaps().filter((m) => m.features.multiplayer)}
              mapId={mapId}
              onMap={selectMap}
              circuit={circuitOpts}
              onCircuit={(patch) => updateCircuitOpts(patch)}
              onReroll={() => updateCircuitOpts({ seed: randomSeed() })}
            />
          }
          traffic={trafficLevel}
          onTraffic={selectTraffic}
          joinError={joinError}
          onBack={() => {
            setJoinError(null)
            setShowMultiplayerLobby(false)
          }}
        />
      )}
      {resultsVisible && (
        <RaceResults
          open={resultsOn}
          race={finishedRaceRef.current}
          onAgain={raceAgain}
          onMenu={quitToMenu}
          readyNotice={(() => {
            if (!multiplayerRef.current?.roomId) return null
            const ready = netPeers.filter((p) => p.ready).map((p) => p.name)
            if (ready.length === 0) return null
            return ready.length === 1
              ? `${ready[0]} is ready. Hit Race again to join them!`
              : `${ready.join(", ")} are ready. Hit Race again to join them!`
          })()}
        />
      )}
      {pauseVisible && (
        <PauseScreen
          open={pauseOn}
          gamepadNav={!showSettings}
          race={race}
          netConnected={netConnected}
          netPeers={netPeers}
          trafficLevel={trafficLevel}
          resumeGame={resumeGame}
          restart={restart}
          quitToMenu={quitToMenu}
          setShowSettings={setShowSettings}
        />
      )}
      {loadingVisible && <LoadingScreen open={loading} loadPct={loadPct} />}
      {error && <ErrorScreen error={error} />}
      {introVisible && (
        <IntroScreen
          open={introOn}
          gamepadNav={!showSettings}
          onEnter={() => setShowIntro(false)}
          onOptions={() => setShowSettings(true)}
        />
      )}
      <Wipe
        token={wipe?.token ?? 0}
        busy={wipeBusy}
        onCovered={onCovered}
        label={wipe?.label ?? ""}
        tone={wipe?.red ? "red" : "blue"}
      />
    </div>
  )
}
