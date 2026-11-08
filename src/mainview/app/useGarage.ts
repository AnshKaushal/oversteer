import { useRef, useState } from "react"
import { colorHex } from "../systems/carTint"
import { MultiplayerManager } from "../systems/net/MultiplayerManager"
import { CARS, DEFAULT_CAR_ID, getCar } from "../data/cars"
import type { MutableRefObject } from "react"

export function useGarage(
  multiplayerRef: MutableRefObject<MultiplayerManager | null>,
) {
  const [carId, setCarId] = useState<string>(() => {
    try {
      return localStorage.getItem("oversteer_car") || DEFAULT_CAR_ID
    } catch {
      return DEFAULT_CAR_ID
    }
  })
  const carIdRef = useRef(carId)
  const garageApiRef = useRef<{
    showCar: (id: string, tint?: number) => void
    paint: (color: number | null) => void
  } | null>(null)
  const selectCar = (id: string) => {
    carIdRef.current = id
    setCarId(id)
    try {
      localStorage.setItem("oversteer_car", id)
    } catch {}
    multiplayerRef.current?.setLocalCarId(id)
    pushNetColor()
    garageApiRef.current?.showCar(id)
  }
  const stepCar = (dir: 1 | -1) => {
    const i = CARS.findIndex((c) => c.id === carIdRef.current)
    const next = CARS[(i < 0 ? 0 : i + dir + CARS.length) % CARS.length]
    selectCar(next.id)
  }
  const [paint, setPaint] = useState<Record<string, number | null>>(() => {
    try {
      const raw = localStorage.getItem("oversteer_paint")
      if (raw) {
        const obj = JSON.parse(raw)
        if (obj && typeof obj === "object") return obj
      }
    } catch {}
    return {}
  })
  const paintRef = useRef(paint)
  const paintFor = (id: string): number | undefined => {
    const picked = paintRef.current[id]
    if (picked !== undefined) return picked ?? undefined
    return getCar(id).defaultTint ?? undefined
  }
  const pushNetColor = () => {
    const m = multiplayerRef.current
    if (!m) return
    const c = paintFor(carIdRef.current)
    const paint = c ?? null
    if (m.localPaint === paint) return
    m.localPaint = paint
    if (c !== undefined) {
      m.localColor = c
      m.localColorHex = colorHex(c)
    }
    m.announceIdentitySoon()
  }
  const setPaintFor = (id: string, color: number | null) => {
    const next = { ...paintRef.current, [id]: color }
    paintRef.current = next
    setPaint(next)
    try {
      localStorage.setItem("oversteer_paint", JSON.stringify(next))
    } catch {}
    if (id === carIdRef.current) {
      garageApiRef.current?.paint(color)
      pushNetColor()
    }
  }
  const [pool, setPool] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("oversteer_pool")
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) {
          const known = arr.filter((id) => CARS.some((c) => c.id === id))
          if (known.length > 0) return known
        }
      }
    } catch {}
    return CARS.map((c) => c.id)
  })
  const poolRef = useRef(pool)
  const togglePool = (id: string) => {
    setPool((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id]
      poolRef.current = next
      try {
        localStorage.setItem("oversteer_pool", JSON.stringify(next))
      } catch {}
      return next
    })
  }
  return {
    carId,
    carIdRef,
    garageApiRef,
    selectCar,
    stepCar,
    paint,
    paintRef,
    paintFor,
    pushNetColor,
    setPaintFor,
    pool,
    poolRef,
    togglePool,
  }
}
