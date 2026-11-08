import { setLanRelay } from "../updater"
import * as THREE from "three"
import type * as RAPIER from "@dimforge/rapier3d-compat"
import { joinRoom, selfId } from "@trystero-p2p/torrent"
import type { Vehicle } from "../../physics/vehicle/Vehicle"
import type { CarTelemetry } from "../../physics/vehicle/Vehicle"
import type { TireSmoke } from "../TireSmoke"
import { DEFAULT_PLAYER_COLOR, colorHex } from "../carTint"
import { DEFAULT_CAR_ID, getCar } from "../../data/cars"
import { NET } from "../../data/net"
import { WORLD } from "../../data/world"
import { encodeState, fnv1a, hex32, specHash } from "./codec"
import { NetClock } from "./NetClock"
import { RemoteCar } from "./RemoteCar"
import {
  maybeLogNetDiag,
  netDiagContactCost,
  netDiagForgetPeer,
  netDiagPeerEvent,
  netDiagRemoteCount,
  netDiagSend,
} from "./NetDiagnostics"
import { newSessionId, PeerSessionTracker } from "./stateProtocol"
import type { NetworkEventPacket, PeerPlayer } from "./types"
import {
  PING_INTERVAL_MS,
  MultiplayerMode,
  RaceMapSpec,
  MultiplayerCallbacks,
} from "./manager/types"
import { join, failJoin, joinLAN, applyProfile } from "./manager/connection"
import {
  handleBinaryState,
  handleStatePacket,
  handleNetworkEvent,
} from "./manager/incoming"
import {
  registerPeer,
  unregisterPeer,
  notifyPeersChanged,
} from "./manager/peers"

export class MultiplayerManager {
  lanRelayHosted = false
  join = join
  failJoin = failJoin
  joinLAN = joinLAN
  applyProfile = applyProfile
  handleBinaryState = handleBinaryState
  handleStatePacket = handleStatePacket
  handleNetworkEvent = handleNetworkEvent
  registerPeer = registerPeer
  unregisterPeer = unregisterPeer
  notifyPeersChanged = notifyPeersChanged
  public localId: string
  public localName: string
  public localColor: number
  public localColorHex: string
  public localPaint: number | null = null
  public localCarId: string = DEFAULT_CAR_ID
  public roomId: string | null = null
  public roomPasswordHashV: string | null = null
  public mode: MultiplayerMode = "p2p"

  room: any = null
  lanWs: WebSocket | null = null
  sendStateAction: ((data: Uint8Array) => void) | null = null
  sendEventAction: ((data: NetworkEventPacket) => void) | null = null
  deniedIds = new Set<string>()

  public peers = new Map<string, PeerPlayer>()
  public remoteCars = new Map<string, RemoteCar>()

  callbacks: MultiplayerCallbacks = {}
  tick = 0
  clocks = new Map<string, NetClock>()
  readonly sendEveryTicks = Math.max(1, Math.round(WORLD.fixedHz / NET.sendHz))
  lastPing = 0
  packetSeq = 0
  idleSkip = 0
  localSession = ""
  private get sessionHash() {
    return fnv1a(this.localSession)
  }
  sessions = new PeerSessionTracker()

  activeScene: THREE.Scene | null = null
  activeWorld: RAPIER.World | null = null
  activeRapier: typeof RAPIER | null = null
  baseUrl = ""

  constructor(name?: string, color?: number) {
    this.localId = selfId
    this.localName = name || `Racer-${selfId.slice(0, 4)}`
    this.localColor = color ?? DEFAULT_PLAYER_COLOR
    this.localColorHex = colorHex(this.localColor)
  }

  setCallbacks(cbs: MultiplayerCallbacks) {
    this.callbacks = cbs
  }

  public setLocalCarId(carId: string) {
    if (carId === this.localCarId) return
    this.localCarId = carId
    this.announceIdentitySoon()
  }

  helloPayload() {
    return {
      name: this.localName,
      color: this.localColor,
      paint: this.localPaint,
      session: hex32(this.sessionHash),
      proto: NET.protocolVersion,
      specHash: specHash(getCar(this.localCarId).physics),
      carId: this.localCarId,
      passHash: this.roomPasswordHashV,
    }
  }
  remoteOptsFor(peer: PeerPlayer | undefined) {
    const def = getCar(peer?.carId)
    return {
      modelFile: def.modelFile,
      physics: def.physics,
      paintMatch: def.paintMatch,
      paintTexture: def.paintTexture,
      pivots: def.pivots,
      wheelSpots: def.wheels,
      stock: peer?.paint === null,
    }
  }

  public localReady = false
  localReadyDistanceM: number | null = null

  public setLocalReady(ready: boolean, distanceM?: number) {
    this.localReady = ready
    if (distanceM !== undefined) this.localReadyDistanceM = distanceM
    if (!this.roomId) return
    this.sendEvent({
      type: "READY",
      senderId: this.localId,
      t: Date.now(),
      payload: { ready, distanceM: this.localReadyDistanceM ?? null },
    })
    this.notifyPeersChanged()
  }

  public areAllReady(): boolean {
    if (!this.roomId) return true
    if (!this.localReady) return false
    for (const p of this.peers.values()) {
      if (!p.ready) return false
    }
    return true
  }

  public waitingForNames(): string[] {
    if (!this.roomId || !this.localReady) return []
    const out: string[] = []
    for (const p of this.peers.values()) {
      if (!p.ready) out.push(p.name)
    }
    return out
  }

  markRaceStarted() {
    this.localReady = true
    this.localReadyDistanceM = null
    for (const p of this.peers.values()) p.ready = true
  }

  resetReadySilent() {
    this.localReady = false
    this.localReadyDistanceM = null
    for (const p of this.peers.values()) p.ready = false
  }

  attachScene(
    scene: THREE.Scene,
    baseUrl: string,
    world?: RAPIER.World,
    rapier?: typeof RAPIER,
  ) {
    this.activeScene = scene
    this.baseUrl = baseUrl
    this.activeWorld = world ?? null
    this.activeRapier = rapier ?? null

    for (const [id, peer] of this.peers.entries()) {
      if (!this.remoteCars.has(id)) {
        const remote = new RemoteCar(
          id,
          peer.name,
          peer.color,
          this.activeScene,
          this.baseUrl,
          this.activeWorld ?? undefined,
          this.activeRapier ?? undefined,
          this.remoteOptsFor(peer),
        )
        remote.setHeadlights(this.headlightsOn)
        this.remoteCars.set(id, remote)
      }
    }
  }

  detachScene() {
    this.activeScene = null
    this.activeWorld = null
    this.activeRapier = null
  }

  headlightsOn = false

  setHeadlights(on: boolean) {
    this.headlightsOn = on
    for (const car of this.remoteCars.values()) {
      car.setHeadlights(on)
    }
  }

  joinP2P(
    roomId: string,
    playerName?: string,
    carColor?: number,
    passHash: string | null = null,
  ) {
    this.leave()
    this.mode = "p2p"
    this.roomPasswordHashV = passHash
    this.applyProfile(playerName, carColor)
    this.packetSeq = 0
    this.localSession = newSessionId()

    this.roomId = roomId
    console.log(
      `[Multiplayer P2P] Joining room "${roomId}" as ${this.localName} (${this.localId})`,
    )

    this.room = joinRoom(
      {
        appId: "oversteer-racer-v1",
      },
      roomId,
    )

    const stateAction = this.room.makeAction("state")
    const eventAction = this.room.makeAction("event")

    this.sendStateAction = (pkt: Uint8Array) => {
      stateAction.send(pkt).catch((e: unknown) => {
        console.warn("[Multiplayer P2P] State send failed:", e)
      })
    }
    this.sendEventAction = (evt: NetworkEventPacket) => {
      eventAction.send(evt).catch((e: unknown) => {
        console.warn("[Multiplayer P2P] Event send failed:", e)
      })
    }

    stateAction.onMessage = (data: unknown, { peerId }: { peerId: string }) => {
      this.handleBinaryState(data, peerId)
    }

    eventAction.onMessage = (
      evt: NetworkEventPacket,
      { peerId }: { peerId: string },
    ) => {
      this.handleNetworkEvent(evt, peerId)
    }

    this.room.onPeerJoin = (peerId: string) => {
      console.log(`[Multiplayer P2P] Peer connected: ${peerId}`)
      if (this.deniedIds.has(peerId)) return
      this.registerPeer(peerId)

      this.sendEvent({
        type: "HELLO",
        senderId: this.localId,
        t: Date.now(),
        payload: this.helloPayload(),
      })
    }

    this.room.onPeerLeave = (peerId: string) => {
      console.log(`[Multiplayer P2P] Peer disconnected: ${peerId}`)
      this.unregisterPeer(peerId)
    }

    this.sendEvent({
      type: "HELLO",
      senderId: this.localId,
      t: Date.now(),
      payload: this.helloPayload(),
    })

    this.notifyPeersChanged()
  }

  public sendEvent(evt: NetworkEventPacket) {
    if (this.sendEventAction) {
      try {
        this.sendEventAction(evt)
      } catch (e) {
        console.warn("[Multiplayer] Failed to send event:", e)
      }
    }
  }

  public announceIdentity() {
    if (!this.roomId) return
    this.sendEvent({
      type: "HELLO",
      senderId: this.localId,
      t: Date.now(),
      payload: this.helloPayload(),
    })
  }

  helloTimer: ReturnType<typeof setTimeout> | null = null

  public announceIdentitySoon() {
    if (!this.roomId) return
    if (this.helloTimer) clearTimeout(this.helloTimer)
    this.helloTimer = setTimeout(() => {
      this.helloTimer = null
      this.announceIdentity()
    }, 400)
  }

  public onPhysicsTick(
    car: Vehicle,
    tele: CarTelemetry | null,
    progress: () => number,
  ) {
    this.tick++
    if (!this.sendStateAction || !tele) return
    if (this.tick % this.sendEveryTicks !== 0) return
    const idle =
      Math.abs(tele.speedKmh) < 1 && tele.throttle < 0.01 && tele.brake < 0.01
    if (idle && ++this.idleSkip < 3) return
    this.idleSkip = 0

    const body = car.body
    const p = body.translation()
    const q = body.rotation()
    const v = body.linvel()

    const w = body.angvel()
    const smokeLevel = Math.min(
      1,
      Math.max(tele.slipRatio, tele.drift ? 0.55 : 0, tele.launching ? 0.7 : 0),
    )
    const pkt = encodeState({
      seq: this.packetSeq++,
      t: (this.tick * 1000) / WORLD.fixedHz,
      sess: this.sessionHash,
      x: p.x,
      y: p.y,
      z: p.z,
      qx: q.x,
      qy: q.y,
      qz: q.z,
      qw: q.w,
      vx: v.x,
      vy: v.y,
      vz: v.z,
      wx: w.x,
      wy: w.y,
      wz: w.z,
      steer: car.steerAngle,
      speed: Number.isFinite(tele.speedKmh) ? tele.speedKmh : 0,
      rpm: tele.rpm,
      gear: tele.gear,
      throttle: tele.throttle,
      brake: tele.brake,
      drift: tele.drift,
      smoke: smokeLevel > 0.28,
      handbrake: tele.parkingBrake,
      progress: progress(),
      wheelOmega: car.getWheelOmegas(),
      compression: car.getWheelCompressions(),
      smokeLevel,
    })

    try {
      this.sendStateAction(pkt)
      netDiagSend()
    } catch {}

    const wallNow = Date.now()
    if (wallNow - this.lastPing > PING_INTERVAL_MS) {
      this.lastPing = wallNow
      this.sendEvent({
        type: "PING",
        senderId: this.localId,
        t: wallNow,
      })
    }
  }

  public startMultiplayerRace(
    distanceM: number,
    rivals = 0,
    map?: RaceMapSpec,
  ) {
    this.markRaceStarted()
    this.notifyPeersChanged()
    const startTimeMs = Date.now() + 3200
    this.sendEvent({
      type: "START_RACE",
      senderId: this.localId,
      t: Date.now(),
      payload: {
        startTimeMs,
        distanceM,
        rivals,
        map,
      },
    })
    this.callbacks.onRaceStartSignal?.(startTimeMs, distanceM, rivals, map)
  }

  public notifyFinish(timeSeconds: number) {
    this.sendEvent({
      type: "FINISH_RACE",
      senderId: this.localId,
      t: Date.now(),
      payload: { time: timeSeconds },
    })
  }

  public updateRemoteCars(
    dt: number,
    smokeSystem?: TireSmoke,
    viewer?: { x: number; y: number; z: number },
  ) {
    const cs0 = performance.now()
    for (const remote of this.remoteCars.values()) {
      remote.sampleContacts(cs0)
    }
    netDiagContactCost(performance.now() - cs0)
    for (const remote of this.remoteCars.values()) {
      remote.update(dt, smokeSystem, viewer)
    }
    netDiagRemoteCount(this.remoteCars.size)
    maybeLogNetDiag()
  }

  public driveRemoteBodies(dt: number) {
    for (const remote of this.remoteCars.values()) {
      remote.drive(dt)
    }
  }

  public getConnectedPeersList(): PeerPlayer[] {
    return Array.from(this.peers.values())
  }

  public leave() {
    this.resetReadySilent()
    if (this.room) {
      try {
        Promise.resolve(this.room.leave()).catch(() => {})
      } catch {}
      this.room = null
    }
    if (this.lanWs) {
      try {
        this.lanWs.close()
      } catch {}
      this.lanWs = null
    }
    if (this.lanRelayHosted) {
      this.lanRelayHosted = false
      void setLanRelay(false)
    }
    this.sendStateAction = null
    this.sendEventAction = null
    this.sessions.clear()
    this.clocks.clear()
    this.tick = 0
    this.localSession = ""
    for (const id of this.peers.keys()) {
      netDiagPeerEvent(id, "cleanup")
      netDiagForgetPeer(id)
    }
    this.peers.clear()

    if (this.activeScene) {
      for (const remote of this.remoteCars.values()) {
        try {
          remote.dispose(this.activeScene, this.activeWorld ?? undefined)
        } catch (e) {
          console.warn("[Multiplayer] Remote dispose failed:", e)
        }
      }
    }
    this.remoteCars.clear()
    netDiagRemoteCount(0)
    this.deniedIds.clear()
    this.detachScene()
    this.roomId = null
    this.roomPasswordHashV = null
    this.notifyPeersChanged()
  }
}
export * from "./manager/types"
