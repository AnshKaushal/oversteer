import type {
  Dispatch,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from "react"
import type * as THREE from "three"
import type { MapWorld } from "../maps"
import type { TimeOfDayMode } from "../constants/timeOfDay"
import type { AppSettings } from "../systems/settings"
import type { CarVisual } from "../systems/CarVisual"
import type { RainEffect } from "../systems/RainEffect"
import type { AirplaneFlyby } from "../systems/AirplaneFlyby"
import type { InputManager } from "../systems/InputManager"
import type { MultiplayerManager } from "../systems/net/MultiplayerManager"
import type {
  RaceSetup,
  RaceSnapshot,
  TrafficLevel,
} from "../systems/RaceTypes"
import type { LapSnapshot } from "../ui/LapHud"
import type { CircuitMenuOptions } from "../ui/MapPicker"

type Ref<T> = MutableRefObject<T>

export interface SessionCtx {
  mountRef: RefObject<HTMLDivElement>

  startedRef: Ref<boolean>
  pausedRef: Ref<boolean>
  errorRef: Ref<boolean>
  loadingRef: Ref<boolean>
  showIntroRef: Ref<boolean>
  showSettingsRef: Ref<boolean>
  showLobbyRef: Ref<boolean>
  freeCamRef: Ref<boolean>
  raceFinishedRef: Ref<boolean>

  settingsRef: Ref<AppSettings>
  timeOfDayRef: Ref<TimeOfDayMode>
  carIdRef: Ref<string>
  poolRef: Ref<string[]>
  trafficRef: Ref<TrafficLevel>
  mapIdRef: Ref<string>
  circuitOptsRef: Ref<CircuitMenuOptions>
  raceSetupRef: Ref<RaceSetup | null>
  prevOrderRef: Ref<number[] | null>

  rendererRef: Ref<THREE.WebGLRenderer | null>
  cameraRef: Ref<THREE.PerspectiveCamera | null>
  wmRef: Ref<MapWorld | null>
  rainRef: Ref<RainEffect | null>
  flybyRef: Ref<AirplaneFlyby | null>
  inputRef: Ref<InputManager | null>
  playerVisualRef: Ref<CarVisual | null>
  activeTrafficRef: Ref<{ visual: CarVisual }[]>
  activeRivalsRef: Ref<{ visual: CarVisual }[]>
  multiplayerRef: Ref<MultiplayerManager | null>
  garageApiRef: Ref<{
    showCar: (id: string, tint?: number) => void
    paint: (color: number | null) => void
  } | null>
  pauseFnRef: Ref<() => void>
  resumeFnRef: Ref<() => void>
  handleUpdateSettingsRef: Ref<(s: AppSettings) => void>

  setLoading: Dispatch<SetStateAction<boolean>>
  setError: Dispatch<SetStateAction<string | null>>
  setRace: Dispatch<SetStateAction<RaceSnapshot>>
  setLap: Dispatch<SetStateAction<LapSnapshot | null>>
  setFreeCam: Dispatch<SetStateAction<boolean>>
  setLockHint: Dispatch<SetStateAction<boolean>>
  setPadNotice: Dispatch<SetStateAction<string | null>>
  setSpeedLines: (v: number, strength: number) => void
  paintFor: (id: string) => number | undefined
  applyTimeOfDay: (mode: TimeOfDayMode) => void
  startGame: () => void
}
