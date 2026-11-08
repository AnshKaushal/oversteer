import * as THREE from "three"
import type { InputManager } from "../systems/InputManager"
import type { SessionCtx } from "./sessionCtx"

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const _orbQ = new THREE.Quaternion()
const _vd = new THREE.Vector3()
const _des = new THREE.Vector3()
const _tmpA = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _UP = new THREE.Vector3(0, 1, 0)

export interface CameraRigDeps {
  camera: THREE.PerspectiveCamera
  input: InputManager
  wm: { terrainHeightAt(x: number, z: number): number }
  playerDef: { physics: any }
  e0: { lastMovementX: number; lastMovementY: number }
  ctx: Pick<
    SessionCtx,
    | "startedRef"
    | "showIntroRef"
    | "showLobbyRef"
    | "loadingRef"
    | "setSpeedLines"
  >
}

export interface CameraFrame {
  dt: number
  nowS: number
  carPos: THREE.Vector3
  quat: THREE.Quaternion
  car: { forwardSpeed: number }
  raceActive: boolean
  headsUp: number
}

export class CameraRig {
  camYaw = 0
  camPitch = 0
  lastOrbit = -10000
  orbiting = false
  recentering = false
  freeCamYaw = 0
  freeCamPitch = 0
  freeCamActive = false
  chaseFar = false
  camMode = 0
  readonly camPos: THREE.Vector3
  readonly freeCamPos: THREE.Vector3
  readonly freeCamCamPos: THREE.Vector3
  readonly freeCamLook: THREE.Vector3
  readonly showDesired = new THREE.Vector3()
  readonly camLook = new THREE.Vector3()
  readonly smoothFwd = new THREE.Vector3(0, 0, -1)
  readonly camHeightBoost: number

  constructor(
    private d: CameraRigDeps,
    startX: number,
  ) {
    this.camPos = new THREE.Vector3(startX, 3, 8)
    this.freeCamPos = new THREE.Vector3(startX, 3, 8)
    this.freeCamCamPos = new THREE.Vector3(startX, 3, 8)
    this.freeCamLook = new THREE.Vector3(startX, 3, 7)
    this.camHeightBoost =
      Math.max(0, d.playerDef.physics.dimensions.height - 1.43) * 1.65
  }

  update(f: CameraFrame) {
    const { camera, input, wm, playerDef, e0 } = this.d
    const {
      startedRef,
      showIntroRef,
      showLobbyRef,
      loadingRef,
      setSpeedLines,
    } = this.d.ctx
    const { dt, nowS, carPos, quat, car, raceActive, headsUp } = f
    if (!startedRef.current) {
      e0.lastMovementX = 0
      e0.lastMovementY = 0
      const orbitA = nowS * 0.28
      const sr = 7.4
      this.showDesired.set(
        carPos.x + Math.sin(orbitA) * sr,
        carPos.y + 2.1,
        carPos.z + Math.cos(orbitA) * sr,
      )
      this.camPos.lerp(this.showDesired, 1 - Math.exp(-dt * 2.5))
      camera.position.copy(this.camPos)
      this.camLook.copy(carPos)
      this.camLook.y += 0.55 + playerDef.physics.dimensions.height * 0.12
      if (
        window.innerWidth >= 768 &&
        !showIntroRef.current &&
        !showLobbyRef.current &&
        !loadingRef.current
      ) {
        const dx = carPos.x - this.camPos.x
        const dz = carPos.z - this.camPos.z
        const plan = Math.hypot(dx, dz) || sr
        const hfovHalf = Math.atan(
          Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect,
        )
        const shift =
          ((2 * 200) / window.innerWidth) * plan * Math.tan(hfovHalf)
        this.camLook.x += (-dz / plan) * shift
        this.camLook.z += (dx / plan) * shift
      }
      camera.lookAt(this.camLook)
      if (Math.abs(camera.fov - 58) > 0.05) {
        camera.fov += (58 - camera.fov) * Math.min(1, dt * 2)
        camera.updateProjectionMatrix()
      }
      setSpeedLines(0, 0)
    } else {
      {
        const MAXD = 120
        const mx = Math.max(-MAXD, Math.min(MAXD, e0.lastMovementX))
        const my = Math.max(-MAXD, Math.min(MAXD, e0.lastMovementY))
        if (this.freeCamActive) {
          if (mx !== 0 || my !== 0) {
            this.freeCamYaw += mx * 0.0024
            this.freeCamPitch = Math.max(
              -1.45,
              Math.min(1.45, this.freeCamPitch - my * 0.0024),
            )
          }
          if (input.lookX !== 0 || input.lookY !== 0) {
            this.freeCamYaw += input.lookX * 1.3 * dt
            this.freeCamPitch = Math.max(
              -1.45,
              Math.min(1.45, this.freeCamPitch - input.lookY * 0.6 * dt),
            )
          }
        } else {
          if (mx !== 0 || my !== 0) {
            this.camYaw -= mx * 0.0022
            this.camPitch = Math.max(
              -0.5,
              Math.min(0.5, this.camPitch + my * 0.0022),
            )
            this.lastOrbit = nowS
          }
          if (input.lookX !== 0 || input.lookY !== 0) {
            this.camYaw -= input.lookX * 2.6 * dt
            this.camPitch = Math.max(
              -0.5,
              Math.min(0.5, this.camPitch + input.lookY * 1.2 * dt),
            )
            this.lastOrbit = nowS
            this.recentering = false
          }
          if (mx !== 0 || my !== 0) this.recentering = false
          if (input.lookReset) this.recentering = true
        }
      }
      e0.lastMovementX = 0
      e0.lastMovementY = 0
      const rolling = Math.abs(car.forwardSpeed) > 1.0
      if (
        !this.freeCamActive &&
        !this.orbiting &&
        ((rolling && nowS - this.lastOrbit > 2.5) || this.recentering)
      ) {
        const ck = 1 - Math.exp(-dt * (this.recentering ? 4.5 : 2.2))
        this.camYaw +=
          (Math.round(this.camYaw / (Math.PI * 2)) * Math.PI * 2 -
            this.camYaw) *
          ck
        if (Math.abs(this.camYaw) < 0.002) this.camYaw = 0
        this.camPitch += (0 - this.camPitch) * ck
        if (Math.abs(this.camPitch) < 0.002) this.camPitch = 0
        if (this.camYaw === 0 && this.camPitch === 0) this.recentering = false
      }
      if (this.freeCamActive) {
        const cosP = Math.cos(this.freeCamPitch)
        const sinP = Math.sin(this.freeCamPitch)
        const cosY = Math.cos(this.freeCamYaw)
        const sinY = Math.sin(this.freeCamYaw)
        const fwd = new THREE.Vector3(sinY * cosP, sinP, -cosY * cosP)
        const right = new THREE.Vector3(cosY, 0, sinY)
        const sprint = input.isDown("ShiftLeft") || input.isDown("ShiftRight")
        const speed = (sprint ? 12 : 3) * dt
        if (input.isDown("KeyW")) this.freeCamPos.addScaledVector(fwd, speed)
        if (input.isDown("KeyS")) this.freeCamPos.addScaledVector(fwd, -speed)
        if (input.isDown("KeyA")) this.freeCamPos.addScaledVector(right, -speed)
        if (input.isDown("KeyD")) this.freeCamPos.addScaledVector(right, speed)
        if (input.isDown("KeyQ")) this.freeCamPos.y += speed
        if (input.isDown("KeyE")) this.freeCamPos.y -= speed
        if (this.freeCamPos.y < 0.5) this.freeCamPos.y = 0.5
        const look = this.freeCamPos.clone().add(fwd)
        const k = 1 - Math.exp(-dt * 8)
        this.freeCamCamPos.lerp(this.freeCamPos, k)
        this.freeCamLook.lerp(look, k)
        camera.position.copy(this.freeCamCamPos)
        camera.lookAt(this.freeCamLook)
        if (Math.abs(camera.fov - 75) > 0.05) {
          camera.fov += (75 - camera.fov) * Math.min(1, dt * 4)
          camera.updateProjectionMatrix()
        }
        setSpeedLines(0, 0)
      } else {
        const orbitQ = _orbQ.setFromAxisAngle(_UP, this.camYaw)
        const viewDir = _vd.copy(this.smoothFwd).applyQuaternion(orbitQ)
        viewDir.y = 0
        viewDir.normalize()
        const dist = this.chaseFar ? 5.5 : 4.4
        const height =
          (this.chaseFar ? 1.08 : 0.92) +
          this.camPitch * 5 +
          this.camHeightBoost
        const desired = _des
          .copy(carPos)
          .addScaledVector(viewDir, -dist)
          .add(_tmpA.set(0, height, 0))
        desired.y = Math.max(desired.y, carPos.y - 0.9, 0.3)
        const surfaceY = wm.terrainHeightAt(desired.x, desired.z) + 0.6
        if (surfaceY > desired.y) {
          desired.y = Math.min(surfaceY, carPos.y + 2.5)
        }
        if (raceActive && headsUp > 0) {
          desired
            .copy(carPos)
            .addScaledVector(this.smoothFwd, 13)
            .add(_tmpA.set(7.5, 4.2, 0))
          this.camLook
            .copy(carPos)
            .addScaledVector(this.smoothFwd, -9)
            .add(_tmpA.set(0, 1.2, 0))
          camera.position.copy(desired)
          camera.lookAt(this.camLook)
        } else {
          this.camPos.copy(desired)

          const SF = playerDef.physics.assists.speedFeel
          const vAbs = Math.abs(car.forwardSpeed) * 3.6
          const sfFov = Math.min(1, vAbs / SF.fovAtMaxSpeedKmh)
          const offAxis = clamp(Math.abs(this.camYaw) / (Math.PI / 2), 0, 1)
          const fovCeil =
            SF.fovBase + (SF.fovMax - SF.fovBase) * (1 - offAxis * 0.55)
          const targetFov = SF.fovBase + (fovCeil - SF.fovBase) * sfFov
          if (Math.abs(camera.fov - targetFov) > 0.02) {
            camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3.5)
            camera.updateProjectionMatrix()
          }
          setSpeedLines(
            Math.min(
              1,
              Math.max(
                0,
                (vAbs - SF.linesFromKmh) /
                  (SF.fovAtMaxSpeedKmh - SF.linesFromKmh),
              ),
            ),
            SF.linesStrength,
          )

          this.camLook.copy(carPos)
          camera.position.copy(this.camPos)
          camera.lookAt(this.camLook)

          const sfShake = Math.min(
            1,
            Math.max(
              0,
              (vAbs - SF.shakeFromKmh) /
                (SF.fovAtMaxSpeedKmh - SF.shakeFromKmh),
            ),
          )
          if (sfShake > 0.001) {
            const t2 = nowS * 34
            camera.rotation.z += Math.sin(t2 * 1.7) * SF.shakeAmp * sfShake
            camera.position.x += Math.sin(t2 * 2.3) * 0.014 * sfShake
            camera.position.y += Math.sin(t2 * 3.1) * 0.012 * sfShake
          }
        }
      }
    }

    if (
      startedRef.current &&
      !this.freeCamActive &&
      this.camMode >= 2 &&
      !(raceActive && headsUp > 0)
    ) {
      const dm = playerDef.physics.dimensions
      const eyeY =
        (this.camMode === 3 ? dm.height * 0.72 : dm.height * 0.8) +
        dm.groundClearance -
        dm.centerOfMassHeight
      const eyeZ = this.camMode === 3 ? -dm.length * 0.05 : -dm.length * 0.3
      this.camPos.set(0, eyeY, eyeZ).applyQuaternion(quat).add(carPos)
      const dir = _dir
        .set(0, 0, -1)
        .applyQuaternion(quat)
        .applyAxisAngle(_UP, this.camYaw * 0.9)
      camera.position.copy(this.camPos)
      this.camLook.copy(this.camPos).addScaledVector(dir, 20)
      camera.lookAt(this.camLook)
      const vAbsCk = Math.abs(car.forwardSpeed) * 3.6
      const fovCk =
        (this.camMode === 3 ? 74 : 68) + Math.min(1, vAbsCk / 300) * 10
      if (Math.abs(camera.fov - fovCk) > 0.02) {
        camera.fov += (fovCk - camera.fov) * Math.min(1, dt * 3.5)
        camera.updateProjectionMatrix()
      }
      setSpeedLines(Math.min(1, Math.max(0, (vAbsCk - 120) / 200)), 0.5)
    }
  }
}
