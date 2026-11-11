import { useMapSelection } from "./app/useMapSelection"
import { useGarage } from "./app/useGarage"
import { conditions } from "./physics/core/Conditions"
import { DEFAULT_WEATHER } from "./data/surfaces"
import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { onLoadProgress } from "./systems/loadProgress"
import { LiveDashboard } from "./ui/LiveHud"
import { listMaps, getMap, randomSeed, type MapWorld } from "./maps"
import {
  type TimeOfDayMode,
  TIME_OF_DAY_PRESETS,
  effectiveWeather,
  isLowLight,
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
import { SettingsModal } from "./ui/SettingsModal"
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyU" || e.repeat || e.metaKey || e.ctrlKey || e.altKey)
        return
      if (!freeCamRef.current) return
      setHideUi((h) => !h)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  useEffect(() => {
    if (!freeCam) setHideUi(false)
  }, [freeCam])
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
    () => settings.timeOfDay ?? "day",
  )
  const timeOfDayRef = useRef<TimeOfDayMode>(timeOfDay)
  timeOfDayRef.current = timeOfDay
  conditions.weather = effectiveWeather(DEFAULT_WEATHER, timeOfDay)
  conditions.timeOfDay = timeOfDay
  const wmRef = useRef<MapWorld | null>(null)
  const flybyRef = useRef<AirplaneFlyby | null>(null)
  const rainRef = useRef<RainEffect | null>(null)
  const playerVisualRef = useRef<CarVisual | null>(null)
  const activeRivalsRef = useRef<{ visual: CarVisual }[]>([])
  const activeTrafficRef = useRef<{ visual: CarVisual }[]>([])

  const applyTimeOfDay = (mode: TimeOfDayMode) => {
    setTimeOfDay(mode)
    timeOfDayRef.current = mode
    setSettings((prev) => {
      const next = { ...prev, timeOfDay: mode }
      saveSettings(next)
      return next
    })
    wmRef.current?.setTimeOfDay(mode)
    flybyRef.current?.setTimeOfDay(mode)
    rainRef.current?.setConditions(
      TIME_OF_DAY_PRESETS[mode].rain,
      TIME_OF_DAY_PRESETS[mode].lightning,
    )
    const lowLight = isLowLight(mode)
    playerVisualRef.current?.setHeadlights(lowLight)
    for (const r of activeRivalsRef.current) {
      r.visual.setHeadlights(lowLight)
    }
    for (const t of activeTrafficRef.current) {
      t.visual.setHeadlights(lowLight)
    }
    multiplayerRef.current?.setHeadlights(lowLight)
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

  const handleUpdateSettingsRef = useRef<(s: AppSettings) => void>(() => {})
  handleUpdateSettingsRef.current = (next) => handleUpdateSettings(next)
  const handleUpdateSettings = (next: AppSettings) => {
    setSettings(next)
    saveSettings(next)
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
  const fireWipe = (label: string, red = false) =>
    setWipe((w) => ({ token: (w?.token ?? 0) + 1, label, red }))
  const sessionTimer = useRef(0)
  const rebuildSession = (delay = 300) => {
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
        setJoinError(msg)
        setNetConnected(false)
      },
      onRaceStartSignal: (startTimeMs, distanceM, rivals = 0, mapSpec) => {
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
        lastRaceRef.current = next
        raceSetupRef.current = next
        startedRef.current = true
        pausedRef.current = false
        setStarted(true)
        setPaused(false)
        setShowMultiplayerLobby(false)
        setRace(emptyRace)
        fireWipe("ON THE GRID", true)
        lockCanvas()
        rebuildSession()
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
    rerollTrack()
    raceSetupRef.current = null
    startedRef.current = true
    pausedRef.current = false
    setStarted(true)
    setPaused(false)
    setLockHint(false)
    setRace(emptyRace)
    fireWipe("FREE ROAM")
    lockCanvas()
    rebuildSession()
  }

  const startRace = () => {
    rerollTrack()
    const next = {
      rivals,
      distanceM: distanceKm * 1000,
    }
    lastRaceRef.current = next
    raceSetupRef.current = next
    startedRef.current = true
    pausedRef.current = false
    setStarted(true)
    setPaused(false)
    setLockHint(false)
    setRace(emptyRace)
    fireWipe("ON THE GRID", true)
    lockCanvas()
    rebuildSession()
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
    if (!last) return
    const net = multiplayerRef.current
    if (net && net.roomId) {
      net.setLocalReady(true, last.distanceM)
    }
    pausedRef.current = false
    startedRef.current = true
    setPaused(false)
    setRace(emptyRace)
    inputRef.current?.clear()
    document.documentElement.style.cursor = ""
    document.body.style.cursor = ""
    if (document.pointerLockElement) document.exitPointerLock?.()
    raceSetupRef.current = last
    fireWipe("ON THE GRID", true)
    rebuildSession()
  }

  const restart = () => {
    if (raceSetupRef.current && lastRaceRef.current) {
      raceAgain()
    } else {
      pausedRef.current = false
      startedRef.current = true
      setPaused(false)
      setRace(emptyRace)
      inputRef.current?.clear()
      fireWipe("FREE ROAM")
      rebuildSession()
    }
    lockCanvas()
  }

  const quitToMenu = () => {
    const net = multiplayerRef.current
    if (net && net.roomId && net.localReady) net.setLocalReady(false)
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
    fireWipe("GARAGE")
    rebuildSession()
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
    setLoading,
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
    !loading && !error && !started && !showMultiplayerLobby && !showIntro
  const pauseOn =
    !loading && !error && started && paused && !race.finished && !showSettings
  const introOn = showIntro && !started
  const resultsOn = !loading && !error && started && race.finished
  const dashOn = !loading && !error && started && !race.finished
  const hudOn = !loading && !error && started && !paused && !race.finished
  const badgeOn = netConnected && started && !race.finished
  const menuVisible = usePresence(menuOn, 300)
  const pauseVisible = usePresence(pauseOn, 240)
  const introVisible = usePresence(introOn, 480)
  const loadingVisible = usePresence(loading, 320)
  const lobbyVisible = usePresence(showMultiplayerLobby, 300)
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
      className={`relative w-screen h-screen overflow-hidden bg-black ${started && !paused && !race.finished ? "cursor-none" : ""} ${hideUi && freeCam ? "[&>*:not([data-game-mount])]:!hidden" : ""}`}
    >
      {/* In-world garage screens live under the (partly transparent) canvas. */}
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
        <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 rounded-full border border-white/20 bg-black/70 px-4 py-1.5 text-[12px] tracking-wide text-white backdrop-blur">
          FREE CAMERA · WASD move · mouse look · Q/E up/down · Shift sprint · U
          hide UI · F exit
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
            <div className="pointer-events-none absolute bottom-32 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-black/70 px-5 py-2 text-[12px] tracking-wide text-gray-200 backdrop-blur">
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
          timeOfDay={timeOfDay}
          onTimeOfDay={applyTimeOfDay}
        />
      )}
      <ControllerToast message={padNotice} />
      <SettingsModal
        open={showSettings}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onClose={() => setShowSettings(false)}
      />
      {lobbyVisible && (
        <MultiplayerLobby
          open={showMultiplayerLobby}
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
          carId={carId}
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
          onEnter={() => setShowIntro(false)}
          onOptions={() => setShowSettings(true)}
        />
      )}
      <Wipe
        token={wipe?.token ?? 0}
        label={wipe?.label ?? ""}
        tone={wipe?.red ? "red" : "blue"}
      />
    </div>
  )
}
