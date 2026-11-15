import type { GameMap } from "../maps"

export interface CircuitMenuOptions {
  lengthKm: number
  twistiness: number
  widthM: number
  barriers: boolean
  lockSeed: boolean
  seed: number
}

export const DEFAULT_CIRCUIT_MENU: CircuitMenuOptions = {
  lengthKm: 5,
  twistiness: 0.6,
  widthM: 14,
  barriers: true,
  lockSeed: false,
  seed: 1,
}

export function circuitOptionsFor(o: CircuitMenuOptions) {
  return {
    seed: o.seed,
    lengthM: o.lengthKm * 1000,
    twistiness: o.twistiness,
    widthM: o.widthM,
    barriers: o.barriers,
  }
}

const LENGTHS_KM = [1.5, 3, 5, 7, 10]
const CHARACTER = [
  { label: "Flowing", value: 0.3 },
  { label: "Mixed", value: 0.6 },
  { label: "Technical", value: 0.95 },
]
const WIDTHS = [
  { label: "Narrow", value: 10 },
  { label: "Standard", value: 14 },
  { label: "Wide", value: 18 },
]

const heading = "mt-3 text-[12px] font-medium tracking-wide text-[#8b97ab]"

function Choice({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`min-w-0 flex-1 px-2 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-all ${
        on
          ? "bg-[#51a7d5] text-[#0a0a0a]"
          : "text-[#8b97ab] hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      {children}
    </button>
  )
}

export function MapPicker({
  maps,
  mapId,
  onMap,
  circuit,
  onCircuit,
  onReroll,
}: {
  maps: readonly GameMap[]
  mapId: string
  onMap: (id: string) => void
  circuit: CircuitMenuOptions
  onCircuit: (patch: Partial<CircuitMenuOptions>) => void
  onReroll: () => void
}) {
  const current = maps.find((m) => m.id === mapId) ?? maps[0]
  return (
    <div className="mt-1 text-left">
      <div className="text-[12px] font-medium tracking-wide text-[#8b97ab]">
        Map
      </div>
      <div className="mt-1.5 flex gap-1 border border-white/[0.06] bg-black/30 p-1">
        {maps.map((m) => (
          <Choice key={m.id} on={m.id === mapId} onClick={() => onMap(m.id)}>
            {m.name}
          </Choice>
        ))}
      </div>
      <div className="mt-1 text-[12px] text-gray-400">
        {current?.description}
      </div>

      {mapId === "circuit" && (
        <>
          <div className={heading}>Track length</div>
          <div className="mt-1.5 flex gap-1 border border-white/[0.06] bg-black/30 p-1">
            {LENGTHS_KM.map((km) => (
              <Choice
                key={km}
                on={circuit.lengthKm === km}
                onClick={() => onCircuit({ lengthKm: km })}
              >
                {km} km
              </Choice>
            ))}
          </div>
          <div className={heading}>Character</div>
          <div className="mt-1.5 flex gap-1 border border-white/[0.06] bg-black/30 p-1">
            {CHARACTER.map((c) => (
              <Choice
                key={c.label}
                on={circuit.twistiness === c.value}
                onClick={() => onCircuit({ twistiness: c.value })}
              >
                {c.label}
              </Choice>
            ))}
          </div>
          <div className={heading}>Track width</div>
          <div className="mt-1.5 flex gap-1 border border-white/[0.06] bg-black/30 p-1">
            {WIDTHS.map((w) => (
              <Choice
                key={w.label}
                on={circuit.widthM === w.value}
                onClick={() => onCircuit({ widthM: w.value })}
              >
                {w.label}
              </Choice>
            ))}
          </div>
          <div className={heading}>Barriers</div>
          <div className="mt-1.5 flex gap-1 border border-white/[0.06] bg-black/30 p-1">
            <Choice
              on={circuit.barriers}
              onClick={() => onCircuit({ barriers: true })}
            >
              On
            </Choice>
            <Choice
              on={!circuit.barriers}
              onClick={() => onCircuit({ barriers: false })}
            >
              Off
            </Choice>
          </div>
          <div className={heading}>Layout</div>
          <div className="mt-1.5 flex gap-1 border border-white/[0.06] bg-black/30 p-1">
            <Choice
              on={!circuit.lockSeed}
              onClick={() => onCircuit({ lockSeed: false })}
            >
              New every start
            </Choice>
            <Choice
              on={circuit.lockSeed}
              onClick={() => onCircuit({ lockSeed: true })}
            >
              Keep this one
            </Choice>
            <button
              onClick={onReroll}
              className="px-3 py-1.5 text-[13px] font-semibold text-[#51a7d5] transition hover:bg-white/[0.06]"
            >
              Re-roll
            </button>
          </div>
          <div className="mt-1 text-[12px] text-gray-400">
            Seed {circuit.seed}. Vegetation is set in Settings.
          </div>
        </>
      )}
    </div>
  )
}
