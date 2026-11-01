import { dlopen, FFIType, ptr } from "bun:ffi"

type Cg = {
  associate: (on: boolean) => number
  lastDelta: (dx: unknown, dy: unknown) => void
  hide: (d: number) => number
  show: (d: number) => number
  mainDisplay: () => number
  wide: (d: number) => number
  high: (d: number) => number
  warp: (x: number, y: number) => number
}

let cg: Cg | null | undefined

function load(): Cg | null {
  if (cg !== undefined) return cg
  if (process.platform !== "darwin") return (cg = null)
  try {
    const lib = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", {
      CGAssociateMouseAndMouseCursorPosition: { args: [FFIType.bool], returns: FFIType.i32 },
      CGGetLastMouseDelta: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.void },
      CGDisplayHideCursor: { args: [FFIType.u32], returns: FFIType.i32 },
      CGDisplayShowCursor: { args: [FFIType.u32], returns: FFIType.i32 },
      CGMainDisplayID: { args: [], returns: FFIType.u32 },
      CGDisplayPixelsWide: { args: [FFIType.u32], returns: FFIType.u64 },
      CGDisplayPixelsHigh: { args: [FFIType.u32], returns: FFIType.u64 },
      CGWarpMouseCursorPosition: { args: [FFIType.f64, FFIType.f64], returns: FFIType.i32 },
    })
    const s = lib.symbols
    cg = {
      associate: (on) => s.CGAssociateMouseAndMouseCursorPosition(on),
      lastDelta: (dx, dy) => s.CGGetLastMouseDelta(dx as never, dy as never),
      hide: (d) => s.CGDisplayHideCursor(d),
      show: (d) => s.CGDisplayShowCursor(d),
      mainDisplay: () => s.CGMainDisplayID(),
      wide: (d) => Number(s.CGDisplayPixelsWide(d)),
      high: (d) => Number(s.CGDisplayPixelsHigh(d)),
      warp: (x, y) => s.CGWarpMouseCursorPosition(x, y),
    }
  } catch (e) {
    console.error("[cursor] CoreGraphics unavailable:", e)
    cg = null
  }
  return cg
}

let grabbed = false
let timer: ReturnType<typeof setInterval> | null = null
const dxBuf = new Int32Array(1)
const dyBuf = new Int32Array(1)

export function grabCursor(send: (dx: number, dy: number) => void, centre: boolean): boolean {
  const c = load()
  if (!c) return false
  if (grabbed) return true
  const d = c.mainDisplay()
  if (centre) c.warp(c.wide(d) / 2, c.high(d) / 2)
  c.associate(false)
  c.hide(d)
  c.lastDelta(ptr(dxBuf), ptr(dyBuf))
  grabbed = true
  timer = setInterval(() => {
    c.lastDelta(ptr(dxBuf), ptr(dyBuf))
    if (dxBuf[0] !== 0 || dyBuf[0] !== 0) send(dxBuf[0], dyBuf[0])
  }, 8)
  return true
}

export function releaseCursor() {
  const c = cg
  if (!c || !grabbed) return
  grabbed = false
  if (timer) clearInterval(timer)
  timer = null
  c.associate(true)
  c.show(c.mainDisplay())
}

process.on("exit", releaseCursor)
