import { NET } from "../../../data/net"
import type { PeerPlayer } from "../types"

export const PING_INTERVAL_MS = NET.pingIntervalMs

export function roomPasswordHash(roomId: string, password: string): string {
  const text = `oversteer:${roomId}:${password}`
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, "0")
}

export type MultiplayerMode = "p2p" | "lan"

export interface RaceMapSpec {
  id: string
  lengthKm?: number
  twistiness?: number
  widthM?: number
  barriers?: boolean
}

export interface MultiplayerCallbacks {
  onPeersUpdated?: (peers: PeerPlayer[]) => void
  onRaceStartSignal?: (
    startTimeMs: number,
    distanceM: number,
    rivals?: number,
    map?: RaceMapSpec,
  ) => void
  onRaceFinishSignal?: (peerId: string, time: number) => void
  onPlayerJoined?: (peer: PeerPlayer) => void
  onPlayerLeft?: (peerId: string) => void
  onJoinError?: (msg: string) => void
}
