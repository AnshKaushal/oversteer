import { onNativeMouseDelta, setNativeCursorLock } from "../systems/updater"
import { getFocus } from "../systems/garageFocus"
import type { InputManager } from "../systems/InputManager"
import type { CameraRig } from "./cameraRig"
import type { SessionCtx } from "./sessionCtx"

export function createPointerLock(opts: {
  ctx: SessionCtx
  dom: HTMLElement
  input: InputManager
  rig: CameraRig
  e0: { lastMovementX: number; lastMovementY: number }
}) {
  const { ctx, dom, input, rig, e0 } = opts
  const {
    startedRef,
    pausedRef,
    errorRef,
    showSettingsRef,
    raceFinishedRef,
    multiplayerRef,
    pauseFnRef,
    setLockHint,
  } = ctx
  let lastPX = 0
  let lastPY = 0
  let hadLock = false
  let nativeActive = false
  let nativeWant = false
  let cmdHeld = false
  const onCmdKey = (e: KeyboardEvent) => {
    cmdHeld = e.metaKey
  }
  window.addEventListener("keydown", onCmdKey)
  window.addEventListener("keyup", onCmdKey)
  onNativeMouseDelta((dx, dy) => {
    if (!nativeActive) return
    e0.lastMovementX += dx
    e0.lastMovementY += dy
  })
  let mouseLocked = false
  let lockWanted = false
  let lockRetry = 0

  const hideCursor = () => {
    document.documentElement.style.cursor = "none"
    document.body.style.cursor = "none"
    tryLock()
  }
  const tryLock = () => {
    if (
      errorRef.current ||
      nativeActive ||
      !startedRef.current ||
      pausedRef.current ||
      lockWanted
    )
      return
    lockWanted = true
    const el = dom as any
    if (!el.requestPointerLock) {
      lockWanted = false
      return
    }
    let p: unknown
    try {
      try {
        p = el.requestPointerLock({ unadjustedMovement: true })
      } catch {
        p = el.requestPointerLock()
      }
    } catch {
      lockWanted = false
      return
    }
    const fail = () => {
      lockWanted = false
      if (lockRetry) return
      lockRetry = window.setTimeout(() => {
        lockRetry = 0
        tryLock()
      }, 350)
    }
    if (p && typeof (p as Promise<void>).catch === "function") {
      ;(p as Promise<void>).catch(fail)
    } else {
      window.setTimeout(() => {
        if (lockWanted && document.pointerLockElement !== dom) fail()
      }, 120)
    }
  }
  const onForceHide = () => {
    if (startedRef.current && !document.pointerLockElement) lockWanted = false
  }
  const onGesture = (e: Event) => {
    if ((e as KeyboardEvent).key === "Escape") return
    if (!errorRef.current && startedRef.current && !document.pointerLockElement)
      tryLock()
  }
  document.addEventListener("pointermove", onForceHide)
  document.addEventListener("pointerdown", onGesture)
  document.addEventListener("keydown", onGesture)
  document.addEventListener("pointerlockerror", onForceHide)
  const onPointerDown = (e: PointerEvent) => {
    if (startedRef.current && !pausedRef.current) hideCursor()
    rig.orbiting = true
    lastPX = e.clientX
    lastPY = e.clientY
    rig.lastOrbit = performance.now() / 1000
  }
  const onPointerMove = (e: PointerEvent) => {
    if (nativeActive) {
    } else if (document.pointerLockElement === dom) {
      e0.lastMovementX += e.movementX || 0
      e0.lastMovementY += e.movementY || 0
    } else if (
      e.movementX !== undefined &&
      (e.movementX !== 0 || e.movementY !== 0)
    ) {
      e0.lastMovementX += e.movementX || 0
      e0.lastMovementY += e.movementY || 0
    }
    if (!startedRef.current) {
      const focus = getFocus()
      if (!rig.orbiting || (focus && focus !== "dyno")) return
      const dx = e.clientX - lastPX
      const dy = e.clientY - lastPY
      lastPX = e.clientX
      lastPY = e.clientY
      if (focus === "dyno") {
        rig.dynoYaw -= dx * 0.0052
        rig.dynoPitch += dy * 0.0032
      } else {
        rig.garageYaw -= dx * 0.0052
        rig.garagePitch += dy * 0.0032
      }
      rig.lastOrbit = performance.now() / 1000
    }
  }
  const onPointerUp = () => {
    rig.orbiting = false
  }
  const onLockChange = () => {
    mouseLocked = document.pointerLockElement === dom
    if (mouseLocked) {
      hadLock = true
      lockWanted = false
      if (lockRetry) {
        window.clearTimeout(lockRetry)
        lockRetry = 0
      }
    } else {
      lockWanted = false
      if (hadLock && startedRef.current && !pausedRef.current) {
        hadLock = false
        if (multiplayerRef.current?.roomId && !document.hasFocus()) {
          input.clear()
        } else {
          pauseFnRef.current()
        }
      }
    }
    setLockHint(startedRef.current && !pausedRef.current && !mouseLocked)
  }
  dom.addEventListener("pointerdown", onPointerDown)
  dom.addEventListener("pointermove", onPointerMove)
  dom.addEventListener("pointerup", onPointerUp)
  dom.addEventListener("pointercancel", onPointerUp)
  const onWheel = (e: WheelEvent) => {
    if (startedRef.current || !rig.garage) return
    const focus = getFocus()
    if (focus === "dyno") rig.dynoZoom *= Math.exp(e.deltaY * 0.001)
    else if (!focus) rig.garageDist *= Math.exp(e.deltaY * 0.001)
  }
  dom.addEventListener("wheel", onWheel, { passive: true })
  document.addEventListener("pointerlockchange", onLockChange)

  const lockGuard = window.setInterval(() => {
    if (
      !errorRef.current &&
      startedRef.current &&
      !pausedRef.current &&
      !mouseLocked &&
      !lockWanted &&
      document.pointerLockElement !== dom
    ) {
      tryLock()
    }
  }, 800)

  const onWinBlur = () => {
    input.clear()
    cmdHeld = false
    if (nativeWant) {
      nativeWant = false
      nativeActive = false
      void setNativeCursorLock(false)
    }
  }
  window.addEventListener("blur", onWinBlur)

  const syncNative = () => {
    const wantNative =
      startedRef.current &&
      !pausedRef.current &&
      !showSettingsRef.current &&
      !raceFinishedRef.current &&
      !cmdHeld &&
      document.hasFocus()
    if (wantNative !== nativeWant) {
      nativeWant = wantNative
      if (!wantNative) nativeActive = false
      void setNativeCursorLock(wantNative).then((ok) => {
        nativeActive = ok && nativeWant
      })
    }
  }

  const dispose = () => {
    onNativeMouseDelta(null)
    window.removeEventListener("keydown", onCmdKey)
    window.removeEventListener("keyup", onCmdKey)
    if (nativeWant) void setNativeCursorLock(false)
    window.removeEventListener("blur", onWinBlur)
    dom.removeEventListener("pointerdown", onPointerDown)
    dom.removeEventListener("pointermove", onPointerMove)
    dom.removeEventListener("pointerup", onPointerUp)
    dom.removeEventListener("pointercancel", onPointerUp)
    dom.removeEventListener("wheel", onWheel)
    document.removeEventListener("pointermove", onForceHide)
    document.removeEventListener("pointerdown", onGesture)
    document.removeEventListener("keydown", onGesture)
    document.removeEventListener("pointerlockerror", onForceHide)
    document.removeEventListener("pointerlockchange", onLockChange)
    if (lockRetry) window.clearTimeout(lockRetry)
    window.clearInterval(lockGuard)
  }

  return { syncNative, dispose }
}
