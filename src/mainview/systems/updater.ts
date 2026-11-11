import { Electroview } from "electrobun/view"
import { setDisplayModes, setNativePanel } from "./settings"
import type {
  DisplayInfo,
  OverSteerRPC,
  UpdateResult,
} from "../../shared/updateRpc"

let deltaListener: ((dx: number, dy: number) => void) | null = null

export function onNativeMouseDelta(
  fn: ((dx: number, dy: number) => void) | null,
) {
  deltaListener = fn
}

export async function setNativeCursorLock(locked: boolean): Promise<boolean> {
  try {
    return await getBridge().request.setCursorLock({ locked })
  } catch {
    return false
  }
}

export async function quitApp(): Promise<void> {
  try {
    if (await getBridge().request.quitApp()) return
  } catch {}
  window.close()
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

export function sendPerfLog(text: string) {
  try {
    ;(getBridge() as any).send?.perfLog({ text })
  } catch {}
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

let knownDisplays: DisplayInfo[] = []

function applyPanel(id?: number) {
  const cx = window.screenX + window.innerWidth / 2
  const cy = window.screenY + window.innerHeight / 2
  const d =
    knownDisplays.find((x) => x.id === id) ??
    knownDisplays.find(
      (x) =>
        cx >= x.x && cx < x.x + x.width && cy >= x.y && cy < x.y + x.height,
    ) ??
    knownDisplays.find((x) => x.isPrimary)
  setNativePanel(d ? { width: d.nativeWidth, height: d.nativeHeight } : null)
  setDisplayModes(d?.modes ?? [])
  window.dispatchEvent(new Event("resize"))
}

export async function getDisplays(): Promise<DisplayInfo[]> {
  try {
    knownDisplays = await getBridge().request.getDisplays()
    applyPanel()
    return knownDisplays
  } catch {
    return []
  }
}

export async function moveToDisplay(id: number): Promise<boolean> {
  try {
    const ok = await getBridge().request.moveToDisplay({ id })
    if (ok) {
      applyPanel(id)
      setTimeout(() => applyPanel(id), 800)
    }
    return ok
  } catch {
    return false
  }
}

/** Start/stop the LAN relay server in the host process. Resolves true if it is running. */
export async function setLanRelay(on: boolean): Promise<boolean> {
  try {
    return await getBridge().request.setLanRelay({ on })
  } catch {
    return false
  }
}
