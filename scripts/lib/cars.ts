import type * as RAPIER_ from "@dimforge/rapier3d-compat"
import { Vehicle } from "../../src/mainview/physics/vehicle/Vehicle"
import {
  createChassisBody,
  FIXED_DT,
} from "../../src/mainview/physics/core/PhysicsSystem"
import { CARS, type CarDefinition } from "../../src/mainview/data/cars"

export { CARS }
export type { CarDefinition }

export function carById(id: string): CarDefinition {
  const def = CARS.find((c) => c.id === id)
  if (!def) {
    throw new Error(
      `unknown car "${id}". Known: ${CARS.map((c) => c.id).join(", ")}`,
    )
  }
  return def
}

export function activeCar(): CarDefinition {
  const id = process.env.CAR
  if (!id) {
    throw new Error(
      `set CAR=<id> or run through scripts/run-per-car.ts. Known: ${CARS.map((c) => c.id).join(", ")}`,
    )
  }
  return carById(id)
}

export function makeRig(
  RAPIER: typeof RAPIER_,
  def: CarDefinition,
  opts: { y?: number; gravity?: number } = {},
) {
  const world = new RAPIER.World({ x: 0, y: -(opts.gravity ?? 9.81), z: 0 })
  world.timestep = FIXED_DT
  const gb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(3000, 0.5, 3000)
      .setTranslation(0, -0.55, 0)
      .setFriction(1.0),
    gb,
  )
  const body = createChassisBody(world, 0, opts.y ?? 0.72, 0, def.physics)
  const car = new Vehicle(
    world,
    body,
    RAPIER,
    def.physics,
    def.wheels,
    def.dash,
  )
  return { world, gb, body, car }
}
