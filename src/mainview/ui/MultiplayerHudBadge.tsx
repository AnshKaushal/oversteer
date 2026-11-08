export function MultiplayerHudBadge({
  playerCount,
  pingMs,
  onLeave,
}: {
  playerCount: number
  pingMs: number
  onLeave: () => void
}) {
  return (
    <div className="pointer-events-auto absolute top-5 right-5 flex items-center gap-2.5 rounded-full border border-white/15 bg-black/60 px-3.5 py-1.5 text-xs text-white backdrop-blur shadow-md">
      <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
      <span className="font-semibold text-gray-200">
        Online · {playerCount} player{playerCount === 1 ? "" : "s"}
      </span>
      {pingMs > 0 && (
        <>
          <span className="h-3 w-px bg-white/20" />
          <span className="font-mono text-green-400">{pingMs}ms</span>
        </>
      )}
      <button
        onClick={onLeave}
        className="ml-1 text-gray-400 hover:text-red-400 text-[11px] font-bold"
        title="Leave multiplayer"
      >
        ✕
      </button>
    </div>
  )
}
