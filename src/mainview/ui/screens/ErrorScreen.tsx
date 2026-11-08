import { Screen } from "../anim"

export function ErrorScreen({ error }: { error: string }) {
  return (
    <Screen
      open
      className="absolute inset-0 flex items-center justify-center text-white p-6 cursor-auto [&_*]:cursor-auto"
      style={{ cursor: "auto" }}
      from={{ autoAlpha: 0 }}
    >
      <div className="max-w-lg rounded-2xl bg-red-950/80 border border-red-500/40 p-5">
        <div className="font-bold text-lg mb-2">Something went wrong</div>
        <div className="text-sm whitespace-pre-wrap">{error}</div>
        <div className="text-xs mt-3 text-gray-300">
          If models 404, make sure <b>src/mainview/models/bmw_m3.glb</b> and{" "}
          <b>tree_pack.glb</b> are served (copied to the Vite public dir or
          imported as assets).
        </div>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 w-full rounded-2xl bg-[#e30613] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#f01422] active:scale-[0.98]"
        >
          Reload world
        </button>
      </div>
    </Screen>
  )
}
