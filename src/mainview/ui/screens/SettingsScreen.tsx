import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { RotateCcw } from "lucide-react"
import { EASE, Screen, wipeIn } from "../anim"
import { type AppSettings, DEFAULT_SETTINGS } from "../../systems/settings"
import { GraphicsTab } from "../settings/GraphicsTab"
import { WorldTab } from "../settings/WorldTab"
import { InterfaceTab } from "../settings/InterfaceTab"
import { UpdatesTab } from "../settings/UpdatesTab"
import { ControlsGuide } from "../ControlsGuide"
import { useMenuGamepadNav } from "../useMenuGamepadNav"

export interface SettingsScreenProps {
  open: boolean
  settings: AppSettings
  onUpdateSettings: (next: AppSettings) => void
  onClose: () => void
}

const TABS = [
  { id: "graphics", label: "Graphics" },
  { id: "world", label: "World" },
  { id: "interface", label: "Interface" },
  { id: "controls", label: "Controls" },
  { id: "updates", label: "Updates" },
] as const
type TabId = (typeof TABS)[number]["id"]

const PAD_CHIP =
  "border border-white/25 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-white/40"

export function SettingsScreen({
  open,
  settings,
  onUpdateSettings,
  onClose,
}: SettingsScreenProps) {
  const [tab, setTab] = useState<TabId>("graphics")
  const [confirmReset, setConfirmReset] = useState(false)
  useEffect(() => {
    if (!confirmReset) return
    const t = setTimeout(() => setConfirmReset(false), 4000)
    return () => clearTimeout(t)
  }, [confirmReset])
  const rootRef = useRef<HTMLDivElement>(null)

  const stepTab = useCallback((d: -1 | 1) => {
    setTab((t) => {
      const i = TABS.findIndex((x) => x.id === t)
      return TABS[(i + d + TABS.length) % TABS.length].id
    })
  }, [])
  useMenuGamepadNav(open, rootRef, onClose, stepTab)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener("keydown", onKeyDown, { capture: true })
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true })
  }, [open, onClose])

  const bodyRef = useRef<HTMLDivElement>(null)
  const firstTab = useRef(true)
  useLayoutEffect(() => {
    if (firstTab.current) {
      firstTab.current = false
      return
    }
    const body = bodyRef.current
    if (!body) return
    const rows = body.querySelectorAll(`[data-panel="${tab}"] [data-set-row]`)
    if (!rows.length) return
    body.scrollTop = 0
    const tween = wipeIn(rows, { duration: 0.45, stagger: 0.03 })
    return () => {
      tween.kill()
    }
  }, [tab])

  const panel = (id: TabId) => (tab === id ? "" : "hidden")

  return (
    <Screen
      open={open}
      className="absolute inset-0 z-[120] bg-[#0a0a0a]/20 text-white"
      from={{ autoAlpha: 0 }}
      to={{ duration: 0.5 }}
      exit={{ duration: 0.4, ease: EASE.in }}
      slash
      stagger={[
        {
          selector: "[data-set-head]",
          from: { autoAlpha: 0, x: -30 },
          to: { duration: 0.6, ease: EASE.soft, force3D: true },
        },
        {
          selector: "[data-set-tab]",
          from: { autoAlpha: 0, y: -18 },
          each: 0.06,
          delay: 0.12,
        },
        {
          selector: "[data-panel=graphics] [data-set-row]",
          from: { autoAlpha: 0, y: 14 },
          to: { duration: 0.4, ease: EASE.soft, force3D: true },
          each: 0.025,
          delay: 0.15,
        },
        {
          selector: "[data-set-foot]",
          from: { autoAlpha: 0, y: 24 },
          delay: 0.4,
        },
      ]}
    >
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-full md:w-[60%]"
        style={{
          background:
            "linear-gradient(90deg, rgba(10,10,10,0.92) 0%, rgba(10,10,10,0.6) 55%, rgba(10,10,10,0) 100%)",
        }}
      />
      <div ref={rootRef} className="absolute inset-0">
        <span className="pointer-events-none absolute left-5 top-5 h-5 w-5 border-l-2 border-t-2 border-white/30 md:left-8 md:top-8" />
        <span className="pointer-events-none absolute bottom-5 right-5 h-5 w-5 border-b-2 border-r-2 border-white/30 md:bottom-8 md:right-8" />
        <span className="pointer-events-none absolute left-5 bottom-5 h-5 w-5 border-l-2 border-b-2 border-white/30 md:left-8 md:bottom-8" />
        <span className="pointer-events-none absolute top-5 right-5 h-5 w-5 border-t-2 border-r-2 border-white/30 md:top-8 md:right-8" />

        <div className="relative mx-auto flex h-full w-full max-w-[1100px] flex-col px-8 pb-6 pt-10 md:px-16 md:pb-8 md:pt-14">
          <div data-set-head>
            <h1
              className="font-extrabold italic leading-[0.85] tracking-tighter text-white"
              style={{ fontSize: "clamp(40px, 5.5vw, 84px)" }}
            >
              Settings
            </h1>
            <div className="mt-4 h-[3px] w-20 bg-[#51a7d5]" />
          </div>

          <div className="mt-7 flex items-center gap-3 border-b border-white/10">
            <span className={`${PAD_CHIP} hidden sm:block`}>LB</span>
            <div role="tablist" aria-label="Settings sections" className="flex flex-1 flex-wrap gap-x-7">
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  data-set-tab
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`relative py-3 text-[13px] font-semibold uppercase tracking-[0.18em] outline-none transition-colors ${
                    tab === id
                      ? "text-white"
                      : "text-white/45 hover:text-white focus-visible:text-white"
                  }`}
                >
                  {label}
                  <span
                    className={`absolute inset-x-0 -bottom-px h-[3px] origin-left bg-[#51a7d5] transition-transform duration-300 ${
                      tab === id ? "scale-x-100" : "scale-x-0"
                    }`}
                  />
                </button>
              ))}
            </div>
            <span className={`${PAD_CHIP} hidden sm:block`}>RB</span>
          </div>

          <div
            ref={bodyRef}
            className="no-scrollbar mt-5 min-h-0 flex-1 overflow-y-auto pr-1"
          >
            <div data-panel="graphics" className={panel("graphics")}>
              <GraphicsTab
                settings={settings}
                onUpdateSettings={onUpdateSettings}
              />
            </div>
            <div data-panel="world" className={panel("world")}>
              <WorldTab
                settings={settings}
                onUpdateSettings={onUpdateSettings}
              />
            </div>
            <div data-panel="interface" className={panel("interface")}>
              <InterfaceTab
                settings={settings}
                onUpdateSettings={onUpdateSettings}
              />
            </div>
            <div data-panel="controls" className={panel("controls")}>
              <div data-set-row className="px-4 pb-6">
                <ControlsGuide />
              </div>
            </div>
            <div data-panel="updates" className={panel("updates")}>
              <UpdatesTab />
            </div>
          </div>

          <div
            data-set-foot
            className="mt-4 flex items-center gap-4 border-t border-white/10 pt-4"
          >
            <button
              onClick={onClose}
              className="-skew-x-12 bg-[#51a7d5] px-8 py-2.5 text-[13px] font-bold uppercase tracking-[0.14em] text-[#0a0a0a] outline-none transition-colors hover:bg-[#51a7d5] focus-visible:bg-[#51a7d5]"
            >
              <span className="block skew-x-12">Back</span>
            </button>
            <button
              onClick={() => {
                if (!confirmReset) return setConfirmReset(true)
                setConfirmReset(false)
                onUpdateSettings(DEFAULT_SETTINGS)
              }}
              className="flex items-center gap-2 px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55 outline-none transition-colors hover:text-white focus-visible:text-white"
            >
              <RotateCcw size={14} />
              {confirmReset ? "Press again to reset everything" : "Reset defaults"}
            </button>
          </div>
        </div>
      </div>
    </Screen>
  )
}
