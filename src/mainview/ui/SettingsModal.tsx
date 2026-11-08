import { useState } from "react"
import { Monitor, Check, RotateCcw, Sun, Gauge, RefreshCw } from "lucide-react"
import { type AppSettings, DEFAULT_SETTINGS } from "../systems/settings"
import { GraphicsTab } from "./settings/GraphicsTab"
import { WorldTab } from "./settings/WorldTab"
import { InterfaceTab } from "./settings/InterfaceTab"
import { UpdatesTab } from "./settings/UpdatesTab"
import { useSettingsAnimation } from "./settings/useSettingsAnimation"

export interface SettingsModalProps {
  open: boolean
  settings: AppSettings
  onUpdateSettings: (next: AppSettings) => void
  onClose: () => void
}

type TabId = "graphics" | "world" | "interface" | "about"

export function SettingsModal({
  open,
  settings,
  onUpdateSettings,
  onClose,
}: SettingsModalProps) {
  const { mounted, overlayRef, modalRef } = useSettingsAnimation(open, onClose)
  const [tab, setTab] = useState<TabId>("graphics")

  if (!mounted) return null

  const handleReset = () => {
    onUpdateSettings(DEFAULT_SETTINGS)
  }

  const TABS = [
    { id: "graphics", label: "Graphics", icon: Monitor },
    { id: "world", label: "World", icon: Sun },
    { id: "interface", label: "Interface", icon: Gauge },
    { id: "about", label: "Updates", icon: RefreshCw },
  ] as const

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[120] overflow-y-auto bg-black/55 backdrop-blur-[2px] text-white"
    >
      <div ref={modalRef} className="flex min-h-full flex-col p-5 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div data-anim-item>
            <div
              className="mb-2 h-2.5 w-20"
              style={{
                backgroundImage:
                  "repeating-conic-gradient(#51a7d5 0% 25%, #0b0e14 0% 50%)",
                backgroundSize: "12px 12px",
              }}
            />
            <span className="text-[64px] font-bold leading-[0.9] tracking-tight text-white drop-shadow-[0_8px_30px_rgba(0,0,0,0.6)] md:text-[96px]">
              Settings
            </span>
            <p className="mt-2 text-[13px] tracking-wide text-gray-300">
              Graphics, world and interface. Changes apply instantly.
            </p>
          </div>
          <div
            data-anim-item
            className="flex w-full flex-col gap-2 sm:w-[280px]"
          >
            <button
              onClick={onClose}
              className="w-full bg-[#51a7d5] px-6 py-3 text-[14px] font-semibold text-white transition hover:bg-[#51a7d5]/90 active:scale-[0.98] inline-flex items-center justify-center gap-2"
            >
              <Check size={16} />
              Done
            </button>
            <button
              onClick={handleReset}
              className="w-full border border-white/12 bg-white/5 px-6 py-3 text-[14px] font-medium text-gray-100 transition hover:bg-white/10 active:scale-[0.98] inline-flex items-center justify-center gap-2"
            >
              <RotateCcw size={16} />
              Reset defaults
            </button>
          </div>
        </div>

        <div className="mt-8 grid flex-1 gap-6 md:grid-cols-[220px_1fr]">
          <div
            data-anim-item
            className="flex flex-row gap-2 md:flex-col md:self-start"
          >
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex flex-1 items-center gap-2.5 border px-4 py-3 text-left text-[14px] font-semibold transition active:scale-[0.98] md:flex-none ${
                  tab === id
                    ? "border-[#51a7d5] bg-[#51a7d5] text-[#0b0e14]"
                    : "border-white/10 bg-black/30 text-gray-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>

          <div className="max-w-3xl space-y-4">
            <div className={tab === "graphics" ? "space-y-4" : "hidden"}>
              <GraphicsTab
                settings={settings}
                onUpdateSettings={onUpdateSettings}
              />
            </div>
            <div className={tab === "world" ? "space-y-4" : "hidden"}>
              <WorldTab
                settings={settings}
                onUpdateSettings={onUpdateSettings}
              />
            </div>
            <div className={tab === "interface" ? "space-y-4" : "hidden"}>
              <InterfaceTab
                settings={settings}
                onUpdateSettings={onUpdateSettings}
              />
            </div>
            <div className={tab === "about" ? "space-y-4" : "hidden"}>
              <UpdatesTab />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
