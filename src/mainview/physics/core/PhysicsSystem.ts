import * as RAPIER from "@dimforge/rapier3d-compat"
import type { CarPhysicsConfig } from "../../data/schema"
import { FIXED_DT, WORLD } from "../../data/world"

let R: typeof RAPIER | null = null
let initP: Promise<typeof RAPIER> | null = null

export function initPhysics(): Promise<typeof RAPIER> {
  if (R) return Promise.resolve(R)
  if (!initP) {
    initP = RAPIER.init().then(() => RAPIER)
  }
  return initP.then((mod) => {
    R = mod
    return mod
  })
}

export function getR(): typeof RAPIER {
  if (!R) throw new Error("Rapier not initialized — call initPhysics() first")
  return R
}

export function createWorld(): RAPIER.World {
  const RAPIER_ = getR()
  const world = new RAPIER_.World({ x: 0, y: -WORLD.gravity, z: 0 })
  world.timestep = FIXED_DT
  return world
}

export function createChassisBody(
  world: RAPIER.World,
  x: number,
  y: number,
  z: number,
  physics: CarPhysicsConfig,
): RAPIER.RigidBody {
  const RAPIER_ = getR()
  const { dimensions: d, mass, chassis: c } = physics
  const bodyDesc = RAPIER_.RigidBodyDesc.dynamic()
    .setTranslation(x, y, z)
    .setLinvel(0, 0, 0)
    .setAngvel({ x: 0, y: 0, z: 0 })
    .setLinearDamping(c.linearDamping)
    .setAngularDamping(c.angularDamping)
    .setCcdEnabled(true)
  // Mass comes from data, not the collider volumes: the centre of mass sits at its stated
  // height and the inertia is that of a solid box of the car's dimensions.
  const rideHeight = (physics.wheels.suspension.front.rideHeight + physics.wheels.suspension.rear.rideHeight) / 2
  bodyDesc.setAdditionalMassProperties(
    mass.chassis,
    { x: 0, y: d.centerOfMassHeight - rideHeight, z: d.centerOfMassOffsetZ },
    boxInertia(mass.chassis, d),
    { x: 0, y: 0, z: 0, w: 1 },
  )
  const body = world.createRigidBody(bodyDesc)
  const col = RAPIER_.ColliderDesc.cuboid(
    d.width / 2,
    d.height * c.lower.halfHeightRatio,
    d.length / 2,
  )
    .setTranslation(0, c.lower.offsetY, 0)
    .setDensity(0)
    .setFriction(c.lower.friction)
    .setRestitution(c.lower.restitution)
  world.createCollider(col, body)
  world.createCollider(createCabinCollider(RAPIER_, physics).setDensity(0), body)
  return body
}

const BOX_INERTIA_DIVISOR = 12

/** Principal moments (kg m^2) of a solid box of mass m with the car's width, height and length. */
export function boxInertia(m: number, d: { width: number; height: number; length: number }) {
  const k = m / BOX_INERTIA_DIVISOR
  return {
    x: k * (d.height * d.height + d.length * d.length),
    y: k * (d.width * d.width + d.length * d.length),
    z: k * (d.width * d.width + d.height * d.height),
  }
}

export function createCabinCollider(
  RAPIER_: typeof RAPIER,
  physics: Pick<CarPhysicsConfig, "dimensions" | "chassis">,
) {
  const { dimensions: d, chassis } = physics
  const c = chassis.cabin
  return RAPIER_.ColliderDesc.cuboid(
    d.width * c.halfWidthRatio,
    d.height * c.halfHeightRatio,
    d.length * c.halfLengthRatio,
  )
    .setTranslation(0, d.height * c.offsetYRatio, d.length * c.offsetZRatio)
    .setFriction(c.friction)
    .setRestitution(c.restitution)
}

export function stepWorld(world: RAPIER.World, dt: number) {
  const n = Math.min(MAX_SUBSTEPS, Math.max(1, Math.round(dt / FIXED_DT)))
  for (let i = 0; i < n; i++) world.step()
}

export { FIXED_DT }

export const MAX_SUBSTEPS = WORLD.maxSubsteps

export interface FixedStepper {
  acc: number
  droppedTotal: number
}

export function createFixedStepper(): FixedStepper {
  return { acc: 0, droppedTotal: 0 }
}

export function pushFrameTime(stepper: FixedStepper, frameDt: number): number {
  stepper.acc += frameDt
  let steps = Math.floor(stepper.acc / FIXED_DT)
  if (steps > MAX_SUBSTEPS) {
    const dropped = stepper.acc - MAX_SUBSTEPS * FIXED_DT
    stepper.droppedTotal += dropped
    stepper.acc = MAX_SUBSTEPS * FIXED_DT
    steps = MAX_SUBSTEPS
  }
  return steps
}

/** Fraction of the next fixed step already accumulated, for render blending. */
export function stepperAlpha(stepper: FixedStepper): number {
  return Math.min(1, Math.max(0, stepper.acc / FIXED_DT))
}

/** Drop whole steps of backlog (frame budget exhausted) and count them. */
export function dropBacklog(stepper: FixedStepper): void {
  const keep = stepper.acc % FIXED_DT
  stepper.droppedTotal += stepper.acc - keep
  stepper.acc = keep
}

export function consumeSubstep(stepper: FixedStepper): void {
  stepper.acc -= FIXED_DT
  if (stepper.acc < 0) stepper.acc = 0
}

export function stepVehicleOnce<T>(
  world: RAPIER.World,
  updateController: () => T,
): T {
  const out = updateController()
  world.step()
  return out
}

export function moveGroundBody(body: RAPIER.RigidBody, x: number, z: number) {
  body.setTranslation({ x: Math.round(x), y: 0, z: Math.round(z) }, true)
}
