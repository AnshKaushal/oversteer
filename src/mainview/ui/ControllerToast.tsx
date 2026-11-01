import { Gamepad2 } from "lucide-react"

export function ControllerToast({ message }: { message: string | null }) {
  return (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed right-6 top-6 z-50 flex items-center gap-2 rounded border border-white/15 bg-[#0b0e14]/90 px-4 py-2 text-xs font-semibold text-gray-100 shadow-lg backdrop-blur transition-all duration-300 ${
        message ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
      }`}
    >
      <Gamepad2 size={16} className="text-[#51a7d5]" />
      {message}
    </div>
  )
}
