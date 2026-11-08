import { colorHex } from "../../carTint"
import { getCar, modelFileForCarId } from "../../../data/cars"
import { NET } from "../../../data/net"
import { decodeState, hex32, specHash } from "../codec"
import { NetClock } from "../NetClock"
import { RemoteCar } from "../RemoteCar"
import {
  netDiagInvalid,
  netDiagRecv,
  netDiagRemoteCount,
  netDiagRtt,
  netDiagSeqAccept,
  netDiagSeqReject,
} from "../NetDiagnostics"
import { isAccept, validateStatePacket } from "../stateProtocol"
import type { CarStatePacket, NetworkEventPacket } from "../types"
import type { MultiplayerManager } from "../MultiplayerManager"

export function handleBinaryState(
  this: MultiplayerManager,
  data: unknown,
  senderId: string,
) {
  if (this.deniedIds.has(senderId)) return
  const arrivalMs = performance.now()
  if (!(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) {
    netDiagInvalid(senderId, "malformed-envelope")
    return
  }
  const d = decodeState(data)
  if (!d.ok) {
    netDiagInvalid(senderId, d.reason)
    return
  }
  const w = d.state
  this.handleStatePacket(
    {
      id: senderId,
      t: w.t,
      seq: w.seq,
      sess: hex32(w.sess),
      x: w.x,
      y: w.y,
      z: w.z,
      qx: w.qx,
      qy: w.qy,
      qz: w.qz,
      qw: w.qw,
      vx: w.vx,
      vy: w.vy,
      vz: w.vz,
      wx: w.wx,
      wy: w.wy,
      wz: w.wz,
      steer: w.steer,
      speed: w.speed,
      rpm: w.rpm,
      gear: w.gear,
      throttle: w.throttle,
      brake: w.brake,
      drift: w.drift,
      smoke: w.smoke,
      handbrake: w.handbrake,
      progress: w.progress,
      wheelOmega: w.wheelOmega,
      compression: w.compression,
      smokeLevel: w.smokeLevel,
    },
    senderId,
    arrivalMs,
  )
}

export function handleStatePacket(
  this: MultiplayerManager,
  pkt: CarStatePacket,
  senderId: string,
  arrivalMs: number = performance.now(),
) {
  if (this.deniedIds.has(senderId)) return
  if (!pkt || typeof pkt !== "object") {
    netDiagInvalid(senderId, "malformed-envelope")
    return
  }
  const checked = validateStatePacket(pkt)
  if (!checked.ok) {
    netDiagInvalid(senderId, checked.reason)
    return
  }
  netDiagRecv(senderId, checked.state.senderT)
  const decision = this.sessions.evaluate(
    senderId,
    checked.state.sess,
    checked.state.seq,
  )
  if (!isAccept(decision)) {
    netDiagSeqReject(
      senderId,
      decision === "reject-duplicate"
        ? "duplicate"
        : decision === "reject-stale"
          ? "stale"
          : "stale-session",
    )
    return
  }
  netDiagSeqAccept(senderId, checked.state.seq, decision === "accept-initial")
  if (decision === "accept-initial") {
    this.remoteCars.get(senderId)?.resetInterpolation("session-start")
  }

  if (!this.peers.has(senderId)) {
    this.registerPeer(senderId)
  }
  let car = this.remoteCars.get(senderId)
  if (!car && this.activeScene && this.activeWorld) {
    const peer = this.peers.get(senderId)
    const name = peer?.name ?? `Racer-${senderId.slice(0, 4)}`
    const color = peer?.color ?? 0xffffff
    car = new RemoteCar(
      senderId,
      name,
      color,
      this.activeScene,
      this.baseUrl,
      this.activeWorld ?? undefined,
      this.activeRapier ?? undefined,
      this.remoteOptsFor(peer),
    )
    this.remoteCars.set(senderId, car)
    netDiagRemoteCount(this.remoteCars.size)
  }
  if (car) {
    let clock = this.clocks.get(senderId)
    if (!clock) {
      clock = new NetClock()
      this.clocks.set(senderId, clock)
    }
    if (clock.observe(checked.state.senderT, checked.state.seq, arrivalMs)) {
      car.resetInterpolation("clock-resync")
    }
    car.delayMs = clock.delayMs
    car.onPacket(checked.state, clock.toLocal(checked.state.senderT), arrivalMs)
  }

  const peer = this.peers.get(senderId)
  if (peer) {
    peer.progress = checked.state.progress
    peer.lastSeen = Date.now()
  }
}

export function handleNetworkEvent(
  this: MultiplayerManager,
  evt: NetworkEventPacket,
  senderId: string,
) {
  switch (evt.type) {
    case "HELLO": {
      if (evt.payload?.proto !== NET.protocolVersion) {
        console.warn(
          `[Multiplayer] Peer ${senderId} speaks protocol ${evt.payload?.proto ?? "1"}, we speak ${NET.protocolVersion}`,
        )
        this.deniedIds.add(senderId)
        if (this.peers.has(senderId)) this.unregisterPeer(senderId)
        this.sendEvent({
          type: "DENY",
          senderId: this.localId,
          t: Date.now(),
          payload: { reason: "version", proto: NET.protocolVersion },
        })
        return
      }
      if (
        this.roomPasswordHashV !== null &&
        evt.payload?.passHash !== this.roomPasswordHashV
      ) {
        console.warn(
          `[Multiplayer] Peer ${senderId} failed the room password check`,
        )
        this.deniedIds.add(senderId)
        if (this.peers.has(senderId)) this.unregisterPeer(senderId)
        this.sendEvent({
          type: "DENY",
          senderId: this.localId,
          t: Date.now(),
        })
        return
      }
      const peer = this.registerPeer(senderId)
      if (typeof evt.payload?.carId === "string") {
        const mine = specHash(getCar(evt.payload.carId).physics)
        peer.specMismatch = evt.payload?.specHash !== mine
        if (peer.specMismatch) {
          console.warn(
            `[Multiplayer] ${senderId}'s ${evt.payload.carId} data differs from ours; their car will drive differently here`,
          )
        }
      }
      this.sessions.noteSession(senderId, evt.payload?.session)
      peer.name = evt.payload?.name || peer.name
      peer.color = evt.payload?.color ?? peer.color
      peer.colorHex = colorHex(peer.color)
      if (evt.payload && "paint" in evt.payload) {
        peer.paint =
          typeof evt.payload.paint === "number" ? evt.payload.paint : null
      }
      if (typeof evt.payload?.carId === "string") {
        peer.carId = evt.payload.carId
      }
      const car = this.remoteCars.get(senderId)
      if (car) {
        car.name = peer.name
        if (peer.paint !== undefined) car.setPaint(peer.paint)
        else if (evt.payload?.color !== undefined) {
          car.setColor(evt.payload.color)
        }
        const def = getCar(peer.carId)
        car.setModel(modelFileForCarId(peer.carId), {
          paintMatch: def.paintMatch,
          paintTexture: def.paintTexture,
          pivots: def.pivots,
          wheelSpots: def.wheels,
          physics: def.physics,
        })
      }
      this.notifyPeersChanged()
      break
    }
    case "PING": {
      this.sendEvent({
        type: "PONG",
        senderId: this.localId,
        t: evt.t,
      })
      break
    }
    case "PONG": {
      const peer = this.peers.get(senderId)
      if (peer) {
        const rtt = Math.max(1, Date.now() - evt.t)
        peer.pingMs = Math.round(rtt / 2)
        netDiagRtt(senderId, rtt)
        this.notifyPeersChanged()
      }
      break
    }
    case "START_RACE": {
      console.log("[Multiplayer] Received START_RACE signal from host")
      this.markRaceStarted()
      this.callbacks.onRaceStartSignal?.(
        evt.payload?.startTimeMs ?? Date.now(),
        evt.payload?.distanceM ?? 5000,
        evt.payload?.rivals ?? 0,
        evt.payload?.map,
      )
      break
    }
    case "FINISH_RACE": {
      const peer = this.peers.get(senderId)
      if (peer) {
        peer.finished = true
        peer.finishTime = evt.payload?.time ?? null
      }
      const car = this.remoteCars.get(senderId)
      if (car) {
        car.finished = true
        car.finishTime = evt.payload?.time ?? null
      }
      this.callbacks.onRaceFinishSignal?.(senderId, evt.payload?.time)
      this.notifyPeersChanged()
      break
    }
    case "DENY": {
      const version = evt.payload?.reason === "version"
      console.warn(
        `[Multiplayer] Denied by the room (${version ? "version" : "wrong password"})`,
      )
      this.leave()
      this.callbacks.onJoinError?.(
        version
          ? "This room runs a different game version. Update OverSteer on both sides."
          : "Room is password-protected: wrong or missing password.",
      )
      break
    }
    case "READY": {
      const peer = this.peers.get(senderId) ?? this.registerPeer(senderId)
      peer.ready = !!evt.payload?.ready
      this.notifyPeersChanged()
      break
    }
  }
}
