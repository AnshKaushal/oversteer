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
      /** Grab or release the mouse natively (macOS). Resolves true when the grab is in effect. */
      setCursorLock: { params: { locked: boolean }; response: boolean }
    }
    messages: {}
  }>
  webview: RPCSchema<{
    requests: {}
    messages: {
      /** Raw mouse movement while the cursor is grabbed. */
      mouseDelta: { dx: number; dy: number }
    }
  }>
}
