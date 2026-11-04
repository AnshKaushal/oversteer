import type { ElectrobunRPCSchema, RPCSchema } from "electrobun/main"

export type UpdateOutcome =
  | "up-to-date"
  | "updating"
  | "busy"
  | "dev-build"
  | "error"

export interface UpdateResult {
  outcome: UpdateOutcome
  message: string
}

export interface DisplayInfo {
  id: number
  isPrimary: boolean
  x: number
  y: number
  width: number
  height: number
  scaleFactor: number
  nativeWidth: number
  nativeHeight: number
  modes: { width: number; height: number }[]
}

export type OverSteerRPC = ElectrobunRPCSchema & {
  bun: RPCSchema<{
    requests: {
      checkForUpdates: { params: undefined; response: UpdateResult }
      setCursorLock: { params: { locked: boolean }; response: boolean }
      getDisplays: { params: undefined; response: DisplayInfo[] }
      moveToDisplay: { params: { id: number }; response: boolean }
    }
    messages: {}
  }>
  webview: RPCSchema<{
    requests: {}
    messages: {
      mouseDelta: { dx: number; dy: number }
    }
  }>
}
