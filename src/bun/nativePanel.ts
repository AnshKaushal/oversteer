import { dlopen, FFIType } from "bun:ffi"

const NATIVE_MODE_FLAG = 0x2000000

type Panel = { width: number; height: number }
let api: { cg: any; cf: any } | null | undefined

function load() {
  if (api !== undefined) return api
  try {
    const cg = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", {
      CGDisplayCopyAllDisplayModes: { args: [FFIType.u32, FFIType.ptr], returns: FFIType.ptr },
      CGDisplayModeGetPixelWidth: { args: [FFIType.ptr], returns: FFIType.u64 },
      CGDisplayModeGetPixelHeight: { args: [FFIType.ptr], returns: FFIType.u64 },
      CGDisplayModeGetIOFlags: { args: [FFIType.ptr], returns: FFIType.u32 },
    })
    const cf = dlopen("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation", {
      CFArrayGetCount: { args: [FFIType.ptr], returns: FFIType.i64 },
      CFArrayGetValueAtIndex: { args: [FFIType.ptr, FFIType.i64], returns: FFIType.ptr },
    })
    api = { cg, cf }
  } catch {
    api = null
  }
  return api
}

// The panel's real pixel size on macOS. Scaled ("More Space") modes render to a
// bigger backing store than the panel, so the web view cannot tell on its own.
export function nativePanelSize(displayId: number): Panel | null {
  if (process.platform !== "darwin") return null
  const a = load()
  if (!a) return null
  try {
    const arr = a.cg.symbols.CGDisplayCopyAllDisplayModes(displayId, null)
    if (!arr) return null
    const n = Number(a.cf.symbols.CFArrayGetCount(arr))
    for (let i = 0; i < n; i++) {
      const m = a.cf.symbols.CFArrayGetValueAtIndex(arr, i)
      if (!m) continue
      if (a.cg.symbols.CGDisplayModeGetIOFlags(m) & NATIVE_MODE_FLAG) {
        return {
          width: Number(a.cg.symbols.CGDisplayModeGetPixelWidth(m)),
          height: Number(a.cg.symbols.CGDisplayModeGetPixelHeight(m)),
        }
      }
    }
  } catch {}
  return null
}

export function displayModes(displayId: number): Panel[] {
  if (process.platform !== "darwin") return []
  const a = load()
  if (!a) return []
  const out = new Map<string, Panel>()
  try {
    const arr = a.cg.symbols.CGDisplayCopyAllDisplayModes(displayId, null)
    if (!arr) return []
    const n = Number(a.cf.symbols.CFArrayGetCount(arr))
    for (let i = 0; i < n; i++) {
      const m = a.cf.symbols.CFArrayGetValueAtIndex(arr, i)
      if (!m) continue
      const width = Number(a.cg.symbols.CGDisplayModeGetPixelWidth(m))
      const height = Number(a.cg.symbols.CGDisplayModeGetPixelHeight(m))
      if (width > 0 && height > 0) out.set(`${width}x${height}`, { width, height })
    }
  } catch {}
  return [...out.values()]
}
