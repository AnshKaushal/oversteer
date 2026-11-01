import { Electroview } from "electrobun/view"
import type { OverSteerRPC, UpdateResult } from "../../shared/updateRpc"

let deltaListener: ((dx: number, dy: number) => void) | null = null

export function onNativeMouseDelta(fn: ((dx: number, dy: number) => void) | null) {
  deltaListener = fn
}

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
