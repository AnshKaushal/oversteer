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

const heading = "mt-4 text-[11px] font-semibold tracking-[0.22em] text-[#8f99a8]"

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
      className={`flex-1 border border-[#51a7d5] py-2 text-[13px] font-semibold transition ${
        on
          ? "bg-white text-[#0b0e14]"
          : "bg-[#51a7d5]/15 text-gray-300 hover:bg-[#51a7d5]/25"
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
    <div className="mt-5 text-left">
      <div className="text-[11px] font-semibold tracking-[0.22em] text-[#8f99a8]">
        MAP
      </div>
      <div className="mt-2 flex gap-1.5">
        {maps.map((m) => (
          <Choice key={m.id} on={m.id === mapId} onClick={() => onMap(m.id)}>
            {m.name}
          </Choice>
        ))}
      </div>
      <div className="mt-1 text-[12px] text-gray-400">{current?.description}</div>

      {mapId === "circuit" && (
        <>
          <div className={heading}>TRACK LENGTH</div>
          <div className="mt-2 flex gap-1.5">
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
          <div className={heading}>CHARACTER</div>
          <div className="mt-2 flex gap-1.5">
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
          <div className={heading}>TRACK WIDTH</div>
          <div className="mt-2 flex gap-1.5">
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
          <div className={heading}>BARRIERS</div>
          <div className="mt-2 flex gap-1.5">
            <Choice on={circuit.barriers} onClick={() => onCircuit({ barriers: true })}>
              On
            </Choice>
            <Choice on={!circuit.barriers} onClick={() => onCircuit({ barriers: false })}>
              Off
            </Choice>
          </div>
          <div className={heading}>LAYOUT</div>
          <div className="mt-2 flex gap-1.5">
            <Choice on={!circuit.lockSeed} onClick={() => onCircuit({ lockSeed: false }, )}>
              New every start
            </Choice>
            <Choice on={circuit.lockSeed} onClick={() => onCircuit({ lockSeed: true })}>
              Keep this one
            </Choice>
            <button
              onClick={onReroll}
              className="border border-[#51a7d5] bg-[#51a7d5]/15 px-3 py-2 text-[13px] font-semibold text-[#6ec2f0] transition hover:bg-[#51a7d5]/25"
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
