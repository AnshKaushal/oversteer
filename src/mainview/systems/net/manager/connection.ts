import { setLanRelay } from "../../updater"
import { colorHex } from "../../carTint"
import { netDiagInvalid } from "../NetDiagnostics"
import { newSessionId } from "../stateProtocol"
import type { NetworkEventPacket } from "../types"
import { roomPasswordHash, MultiplayerMode } from "../manager/types"
import type { MultiplayerManager } from "../MultiplayerManager"

export function join(
  this: MultiplayerManager,
  target: string,
  mode: MultiplayerMode = "p2p",
  playerName?: string,
  carColor?: number,
  password?: string,
): boolean {
  const passHash = password ? roomPasswordHash(target.trim(), password) : null
  const cleanTarget = (target || "").trim()
  if (mode === "p2p") {
    if (!cleanTarget) {
      this.failJoin("P2P", new Error("enter a room code or create a new room"))
      return false
    }
    if (
      this.mode === "p2p" &&
      this.roomId === cleanTarget &&
      this.roomPasswordHashV === passHash
    ) {
      console.log(
        `[Multiplayer P2P] Already in room "${cleanTarget}" — ignoring duplicate join`,
      )
      this.applyProfile(playerName, carColor)
      this.notifyPeersChanged()
      return true
    }
    try {
      this.joinP2P(cleanTarget, playerName, carColor, passHash)
      return true
    } catch (e) {
      return this.failJoin("P2P", e)
    }
  } else {
    const key = cleanTarget || "localhost:9876"
    if (this.mode === "lan" && this.roomId === key) {
      console.log(
        `[Multiplayer LAN] Already connected to "${key}" — ignoring duplicate join`,
      )
      this.applyProfile(playerName, carColor)
      this.notifyPeersChanged()
      return true
    }
    const hosting = /^(ws:\/\/)?(localhost|127\.|\[?::1)/i.test(key)
    const connect = () => {
      try {
        // joinLAN() calls leave(), which stops a relay we own. When hosting, the relay was
        // just (re)started for this join, so hide the flag from leave() and restore it after.
        const ownedBefore = this.lanRelayHosted
        this.lanRelayHosted = false
        this.joinLAN(key, playerName, carColor, passHash)
        this.lanRelayHosted = hosting
        if (!hosting && ownedBefore) void setLanRelay(false)
      } catch (e) {
        this.failJoin("LAN", e)
      }
    }
    if (hosting) {
      // Hosting: start the relay only now, then connect to it.
      void setLanRelay(true).then(connect)
    } else connect()
    return true
  }
}

export function failJoin(
  this: MultiplayerManager,
  kind: string,
  e: unknown,
): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  console.warn(`[Multiplayer ${kind}] Join failed:`, msg)
  try {
    this.leave()
  } catch {}
  this.callbacks.onJoinError?.(
    `Could not start ${kind} connection (${msg}). Check your internet and try again.`,
  )
  return false
}

export function joinLAN(
  this: MultiplayerManager,
  serverAddress: string,
  playerName?: string,
  carColor?: number,
  passHash: string | null = null,
) {
  this.leave()
  this.mode = "lan"
  this.roomPasswordHashV = passHash
  this.applyProfile(playerName, carColor)
  this.packetSeq = 0
  this.localSession = newSessionId()

  let url = serverAddress.trim() || "localhost:9876"
  if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
    url = `ws://${url}`
  }
  try {
    const parsed = new URL(url)
    if (!parsed.port) {
      url = `${parsed.protocol}//${parsed.hostname}:9876`
    }
  } catch {}

  this.roomId = serverAddress || "localhost:9876"
  console.log(`[Multiplayer LAN] Connecting to ${url} as ${this.localName}`)

  const ws = new WebSocket(url)
  this.lanWs = ws
  let opened = false

  ws.binaryType = "arraybuffer"
  const idBytes = new TextEncoder().encode(this.localId)
  this.sendStateAction = (pkt: Uint8Array) => {
    if (ws.readyState !== WebSocket.OPEN) return
    const frame = new Uint8Array(1 + idBytes.length + pkt.length)
    frame[0] = idBytes.length
    frame.set(idBytes, 1)
    frame.set(pkt, 1 + idBytes.length)
    ws.send(frame)
  }

  this.sendEventAction = (evt: NetworkEventPacket) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "event", senderId: this.localId, evt }))
    }
  }

  ws.onopen = () => {
    opened = true
    console.log(`[Multiplayer LAN] Connected to ${url}`)
    this.sendEvent({
      type: "HELLO",
      senderId: this.localId,
      t: Date.now(),
      payload: this.helloPayload(),
    })
    this.notifyPeersChanged()
  }

  ws.onmessage = (event) => {
    try {
      if (typeof event.data !== "string") {
        const u8 = new Uint8Array(event.data as ArrayBuffer)
        const n = u8[0]
        const sid = new TextDecoder().decode(u8.subarray(1, 1 + n))
        if (!sid || sid === this.localId) return
        if (!this.peers.has(sid)) {
          this.registerPeer(sid)
          this.sendEvent({
            type: "HELLO",
            senderId: this.localId,
            t: Date.now(),
            payload: this.helloPayload(),
          })
        }
        this.handleBinaryState(u8.subarray(1 + n), sid)
        return
      }
      const msg = JSON.parse(event.data)
      const senderId = msg.senderId
      if (!senderId || senderId === this.localId) return

      if (!this.peers.has(senderId)) {
        this.registerPeer(senderId)
        this.sendEvent({
          type: "HELLO",
          senderId: this.localId,
          t: Date.now(),
          payload: this.helloPayload(),
        })
      }

      if (msg.type === "event" && msg.evt) {
        this.handleNetworkEvent(msg.evt, senderId)
      }
    } catch (err) {
      netDiagInvalid("lan", "parse-error")
      console.warn("[Multiplayer LAN] Parse error:", err)
    }
  }

  ws.onclose = () => {
    if (!opened && this.lanWs === ws) {
      console.warn(`[Multiplayer LAN] Could not reach ${url}`)
      const addr = url.replace(/^wss?:\/\//, "")
      try {
        this.leave()
      } catch {}
      this.callbacks.onJoinError?.(
        `Could not reach ${addr}. Is the host running and the address correct?`,
      )
      return
    }
    console.log("[Multiplayer LAN] Connection closed")
    if (this.lanWs === ws) this.leave()
  }

  ws.onerror = (e) => {
    console.warn("[Multiplayer LAN] WebSocket error:", e)
  }
}

export function applyProfile(
  this: MultiplayerManager,
  playerName?: string,
  carColor?: number,
) {
  if (playerName) this.localName = playerName
  if (carColor !== undefined) {
    this.localColor = carColor
    this.localColorHex = colorHex(carColor)
  }
}
