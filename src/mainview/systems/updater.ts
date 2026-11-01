import { Electroview } from "electrobun/view"
import type { OverSteerRPC, UpdateResult } from "../../shared/updateRpc"

let deltaListener: ((dx: number, dy: number) => void) | null = null

/** Receives raw mouse movement while the main process holds the cursor. */
export function onNativeMouseDelta(fn: ((dx: number, dy: number) => void) | null) {
  deltaListener = fn
}

/** Asks the main process to grab (or release) the cursor. False where it can't, e.g. off macOS. */
export async function setNativeCursorLock(locked: boolean): Promise<boolean> {
  try {
    return await getBridge().request.setCursorLock({ locked })
  } catch {
    return false
  }
}

let bridge: ReturnType<typeof Electroview.defineRPC<OverSteerRPC>> | null = null

function getBridge() {
  if (bridge) return bridge

  const rpc = Electroview.defineRPC<OverSteerRPC>({
    handlers: {
      requests: {},
      messages: {
        mouseDelta: ({ dx, dy }) => deltaListener?.(dx, dy),
      },
    },
  })

  new Electroview({ rpc })
  bridge = rpc

  return rpc
}

// Asks the main process to run an update check. Resolves quickly: a found
// update is downloaded and applied by the main process, which shows its own
// update window and relaunches the app.
export async function checkForUpdates(): Promise<UpdateResult> {
  try {
    return await getBridge().request.checkForUpdates()
  } catch {
    return {
      outcome: "error",
      message: "Updates are only available in the installed app.",
    }
  }
}
