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

export type OverSteerRPC = ElectrobunRPCSchema & {
  bun: RPCSchema<{
    requests: {
      checkForUpdates: { params: undefined; response: UpdateResult }
      setCursorLock: { params: { locked: boolean }; response: boolean }
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
