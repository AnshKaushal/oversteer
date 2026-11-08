import { Cpu, Sun, CloudFog, Lamp } from "lucide-react"
import {
  type TimeOfDayMode,
  TIME_OF_DAY_MODES,
  TIME_OF_DAY_LABELS,
} from "../../constants/timeOfDay"
import { type FogLevel, FOG_LEVELS } from "../../systems/settings"
import type { TabProps } from "./types"

export function WorldTab({ settings, onUpdateSettings }: TabProps) {
  const handleSelectTimeOfDay = (mode: TimeOfDayMode) =>
    onUpdateSettings({ ...settings, timeOfDay: mode })
  const handleSelectFog = (fog: FogLevel) =>
    onUpdateSettings({ ...settings, fog })
  return (
    <>
      {}
      <div
        data-anim-item
        className="rounded border border-white/10 bg-white/[0.02] p-4 space-y-2.5"
      >
        <div>
          <div className="text-xs font-semibold tracking-wider text-[#8f99a8] uppercase flex items-center gap-1.5">
            <Sun size={14} className="text-[#51a7d5]" />
            Time of Day
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Select atmosphere (headlights turn on automatically at evening,
            night and in rain; rain and storms also lower tyre grip)
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {TIME_OF_DAY_MODES.map((mode) => {
            const active = (settings.timeOfDay ?? "day") === mode
            return (
              <button
                key={mode}
                onClick={() => handleSelectTimeOfDay(mode)}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded border text-xs font-semibold transition ${
                  active
                    ? "border-[#51a7d5] bg-[#51a7d5]/25 text-white"
                    : "border-white/10 bg-black/30 text-gray-400 hover:border-white/25 hover:text-white"
                }`}
              >
                <span>{TIME_OF_DAY_LABELS[mode]}</span>
              </button>
            )
          })}
        </div>
      </div>

      {}
      <div
        data-anim-item
        className="rounded border border-white/10 bg-white/[0.02] p-4 space-y-3.5"
      >
        <div className="text-xs font-semibold tracking-wider text-[#8f99a8] uppercase flex items-center gap-1.5">
          <Lamp size={14} className="text-[#51a7d5]" />
          Street Lights
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-gray-200">Show</div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Lamp posts beside the road
            </p>
          </div>
          <button
            onClick={() =>
              onUpdateSettings({
                ...settings,
                streetLights: settings.streetLights === false,
              })
            }
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
              settings.streetLights !== false ? "bg-[#51a7d5]" : "bg-gray-700"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.streetLights !== false
                  ? "translate-x-6"
                  : "translate-x-1"
              }`}
            />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-gray-200">Lit</div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Lamps light up in every sky except day
            </p>
          </div>
          <button
            onClick={() =>
              onUpdateSettings({
                ...settings,
                streetLightsOn: settings.streetLightsOn === false,
              })
            }
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
              settings.streetLightsOn !== false ? "bg-[#51a7d5]" : "bg-gray-700"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.streetLightsOn !== false
                  ? "translate-x-6"
                  : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      {}
      <div
        data-anim-item
        className="rounded border border-white/10 bg-white/[0.02] p-4 space-y-2.5"
      >
        <div>
          <div className="text-xs font-semibold tracking-wider text-[#8f99a8] uppercase flex items-center gap-1.5">
            <CloudFog size={14} className="text-[#51a7d5]" />
            Fog
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            How thick the haze is on top of the time of day. Off shows the whole
            horizon
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {FOG_LEVELS.map((level) => {
            const active = (settings.fog ?? "normal") === level
            return (
              <button
                key={level}
                onClick={() => handleSelectFog(level)}
                className={`flex items-center justify-center py-2 px-2 rounded border text-xs font-semibold capitalize transition ${
                  active
                    ? "border-[#51a7d5] bg-[#51a7d5]/25 text-white"
                    : "border-white/10 bg-black/30 text-gray-400 hover:border-white/25 hover:text-white"
                }`}
              >
                {level}
              </button>
            )
          })}
        </div>
      </div>

      {}
      <div
        data-anim-item
        className="rounded border border-white/10 bg-white/[0.02] p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <div>
            <label className="text-xs font-semibold tracking-wider text-[#8f99a8] uppercase flex items-center gap-1.5">
              <Cpu size={14} className="text-[#51a7d5]" />
              Draw Distance
            </label>
            <p className="text-[11px] text-gray-400 mt-0.5">
              How far you can see before the world fades into haze. Lower it for
              more FPS
            </p>
          </div>
          <span className="text-base font-bold text-[#6ec2f0] tabular-nums">
            {settings.drawDistance ?? 100}%
          </span>
        </div>
        <input
          type="range"
          min={20}
          max={100}
          step={5}
          value={settings.drawDistance ?? 100}
          onChange={(e) =>
            onUpdateSettings({
              ...settings,
              drawDistance: Number(e.target.value),
            })
          }
          aria-label="Draw Distance Percentage"
          className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#51a7d5]"
        />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {[100, 75, 50, 25].map((val) => (
            <button
              key={val}
              onClick={() =>
                onUpdateSettings({ ...settings, drawDistance: val })
              }
              className={`flex-1 min-w-[50px] py-1.5 text-xs font-semibold rounded border transition ${
                (settings.drawDistance ?? 100) === val
                  ? "border-[#51a7d5] bg-[#51a7d5]/30 text-white"
                  : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              {val}%
            </button>
          ))}
        </div>
      </div>

      {}
      <div
        data-anim-item
        className="rounded border border-white/10 bg-white/[0.02] p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <div>
            <label className="text-xs font-semibold tracking-wider text-[#8f99a8] uppercase flex items-center gap-1.5">
              <Cpu size={14} className="text-[#51a7d5]" />
              Vegetation
            </label>
            <p className="text-[11px] text-gray-400 mt-0.5">
              How many trees and grass patches fill the world. Lower it for more
              FPS
            </p>
          </div>
          <span className="text-base font-bold text-[#6ec2f0] tabular-nums">
            {settings.vegetation ?? 100}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={settings.vegetation ?? 100}
          onChange={(e) =>
            onUpdateSettings({
              ...settings,
              vegetation: Number(e.target.value),
            })
          }
          aria-label="Vegetation Percentage"
          className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#51a7d5]"
        />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {[100, 75, 50, 25, 0].map((val) => (
            <button
              key={val}
              onClick={() => onUpdateSettings({ ...settings, vegetation: val })}
              className={`flex-1 min-w-[50px] py-1.5 text-xs font-semibold rounded border transition ${
                (settings.vegetation ?? 100) === val
                  ? "border-[#51a7d5] bg-[#51a7d5]/30 text-white"
                  : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              {val}%
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
