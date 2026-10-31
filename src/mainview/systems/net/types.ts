export interface CarStatePacket {
  id: string
  t: number
  seq: number
  sess?: string
  x: number
  y: number
  z: number
  qx: number
  qy: number
  qz: number
  qw: number
  vx: number
  vy: number
  vz: number
  steer: number
  speed: number
  rpm: number
  gear: number
  drift: boolean
  smoke: boolean
  progress: number
  wx?: number
  wy?: number
  wz?: number
  throttle?: number
  brake?: number
  handbrake?: boolean
  wheelOmega?: number[]
  compression?: number[]
  smokeLevel?: number
}

export type NetworkEventType =
  "HELLO" | "READY" | "START_RACE" | "FINISH_RACE" | "PING" | "PONG" | "DENY"

export interface NetworkEventPacket {
  type: NetworkEventType
  senderId: string
  t: number
  payload?: any
}

export interface PeerPlayer {
  id: string
  name: string
  color: number
  colorHex: string
  carId?: string
  pingMs: number
  ready: boolean
  isHost: boolean
  lastSeen: number
  progress: number
  finished: boolean
  finishTime: number | null
  /** The peer's car data differs from ours, so its car feels different here. */
  specMismatch?: boolean
  /** Garage paint: a colour, null for the model's own, undefined when not announced yet. */
  paint?: number | null
}
