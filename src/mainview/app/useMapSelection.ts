import { useRef, useState } from "react"
import { DEFAULT_MAP_ID, listMaps, randomSeed } from "../maps"
import { DEFAULT_CIRCUIT_MENU, type CircuitMenuOptions } from "../ui/MapPicker"

export function useMapSelection(rebuildSession: () => void) {
  const [mapId, setMapId] = useState<string>(() => {
    try {
      const raw = localStorage.getItem("oversteer_map")
      if (raw && listMaps().some((m) => m.id === raw)) return raw
    } catch {}
    return DEFAULT_MAP_ID
  })
  const mapIdRef = useRef(mapId)
  const [circuitOpts, setCircuitOpts] = useState<CircuitMenuOptions>(() => {
    try {
      const raw = localStorage.getItem("oversteer_circuit")
      if (raw)
        return {
          ...DEFAULT_CIRCUIT_MENU,
          ...JSON.parse(raw),
          seed: randomSeed(),
        }
    } catch {}
    return { ...DEFAULT_CIRCUIT_MENU, seed: randomSeed() }
  })
  const circuitOptsRef = useRef(circuitOpts)
  const updateCircuitOpts = (
    patch: Partial<CircuitMenuOptions>,
    rebuild = true,
  ) => {
    const next = { ...circuitOptsRef.current, ...patch }
    circuitOptsRef.current = next
    setCircuitOpts(next)
    try {
      const { seed: _seed, ...persist } = next
      localStorage.setItem("oversteer_circuit", JSON.stringify(persist))
    } catch {}
    if (rebuild) rebuildSession()
  }
  const selectMap = (id: string) => {
    if (id === mapIdRef.current) return
    mapIdRef.current = id
    setMapId(id)
    try {
      localStorage.setItem("oversteer_map", id)
    } catch {}
    rebuildSession()
  }
  const rerollTrack = () => {
    if (mapIdRef.current === "circuit" && !circuitOptsRef.current.lockSeed) {
      circuitOptsRef.current = { ...circuitOptsRef.current, seed: randomSeed() }
      setCircuitOpts(circuitOptsRef.current)
    }
  }
  return {
    mapId,
    setMapId,
    mapIdRef,
    circuitOpts,
    setCircuitOpts,
    circuitOptsRef,
    updateCircuitOpts,
    selectMap,
    rerollTrack,
  }
}
