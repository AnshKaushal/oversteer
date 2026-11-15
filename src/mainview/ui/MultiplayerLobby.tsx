import { useRef, useState, type ReactNode } from "react";
import { useMenuGamepadNav } from "./useMenuGamepadNav";
import { colorHex } from "../systems/carTint";
import {
  MULTIPLAYER_AI_COUNTS,
  RACE_DISTANCES_KM,
  TRAFFIC_OPTIONS,
  trafficCountFor,
  type TrafficLevel,
} from "../systems/RaceTypes";
import type { PeerPlayer } from "../systems/net/types";
import { EASE, Screen, useStaggerIn } from "./anim";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Globe,
  Dices,
  Lock,
  Zap,
} from "lucide-react";

export type MultiplayerMode = "p2p" | "lan";

const INPUT =
  "w-full border-2 border-[#efefef]/40 bg-transparent px-4 py-3 text-[15px] font-bold text-[#efefef] placeholder:font-medium placeholder:text-[#efefef]/35 focus:border-[#51a7d5] focus:outline-none";
const BTN =
  "inline-flex w-full items-center justify-between gap-3 px-5 py-3.5 text-[15px] font-extrabold uppercase tracking-tight transition-colors";
const PRIMARY = `${BTN} bg-[#51a7d5] text-[#0a0a0a] hover:bg-[#efefef]`;
const GHOST = `${BTN} border-2 border-[#efefef]/40 text-[#efefef] hover:border-[#efefef] hover:bg-[#efefef] hover:text-[#0a0a0a]`;

function Label({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.25em] text-[#51a7d5]">
      <span>{children}</span>
      {right && <span className="text-[#efefef]/60">{right}</span>}
    </div>
  );
}

function Seg<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-[3px]">
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          onClick={() => onChange(o.id)}
          className={`flex-1 px-2 py-3 text-[13px] font-extrabold uppercase tracking-tight transition-colors ${
            value === o.id
              ? "border-2 border-[#51a7d5] bg-[#51a7d5] text-[#0a0a0a]"
              : "border-2 border-[#efefef]/40 text-[#efefef] hover:border-[#efefef] hover:bg-[#efefef] hover:text-[#0a0a0a]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface MultiplayerLobbyProps {
  open: boolean;
  playerName: string;
  carColor: number;
  roomId: string;
  isConnected: boolean;
  peers: PeerPlayer[];
  joinError?: string | null;
  initialMode?: MultiplayerMode;
  onUpdateProfile: (name: string, color: number) => void;
  onJoinRoom: (
    target: string,
    mode: MultiplayerMode,
    password?: string,
  ) => void;
  onLeaveRoom: () => void;
  onStartMultiplayerRace: (distanceKm: number, aiCount: number) => void;
  onStartFreeDrive: () => void;
  mapPicker?: ReactNode;
  lapMode?: boolean;
  traffic: TrafficLevel;
  onTraffic: (level: TrafficLevel) => void;
  onBack: () => void;
}

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const pick = (n: number) =>
    Array.from(
      { length: n },
      () => chars[(Math.random() * chars.length) | 0],
    ).join("");
  return `${pick(4)}-${pick(4)}`;
}

export function MultiplayerLobby({
  open,
  playerName,
  carColor,
  roomId,
  isConnected,
  peers,
  joinError,
  initialMode = "p2p",
  onUpdateProfile,
  onJoinRoom,
  onLeaveRoom,
  onStartMultiplayerRace,
  onStartFreeDrive,
  mapPicker,
  lapMode = false,
  traffic,
  onTraffic,
  onBack,
}: MultiplayerLobbyProps) {
  const [netMode, setNetMode] = useState<MultiplayerMode>(initialMode);
  const [nameInput, setNameInput] = useState(playerName);
  const [p2pRoomInput, setP2pRoomInput] = useState(
    initialMode === "p2p" && roomId ? roomId : "",
  );
  const [passwordInput, setPasswordInput] = useState("");
  const [lanAddressInput, setLanAddressInput] = useState(
    initialMode === "lan" && roomId ? roomId : "localhost:9876",
  );
  const [distanceKm, setDistanceKm] = useState<number>(5);
  const [aiCount, setAiCount] =
    useState<(typeof MULTIPLAYER_AI_COUNTS)[number]>(0);
  const [copied, setCopied] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useMenuGamepadNav(open, rootRef, onBack);
  useStaggerIn(
    gridRef,
    "[data-lobby-in], [data-lobby-row]",
    [isConnected, peers.length],
    !isConnected,
  );

  const normalizeP2PCode = (raw: string) =>
    raw.trim().toUpperCase().replace(/\s+/g, "");

  const handleCreateRoom = () => {
    const code = generateRoomCode();
    onUpdateProfile(nameInput.trim() || playerName, carColor);
    setP2pRoomInput(code);
    onJoinRoom(code, "p2p", passwordInput.trim() || undefined);
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile(nameInput.trim() || playerName, carColor);
    if (netMode === "p2p") {
      const code = normalizeP2PCode(p2pRoomInput);
      if (!code) return;
      setP2pRoomInput(code);
      onJoinRoom(code, "p2p", passwordInput.trim() || undefined);
    } else {
      if (!lanAddressInput.trim()) return;
      onJoinRoom(lanAddressInput.trim(), "lan");
    }
  };

  const stop = (e: React.KeyboardEvent) => e.stopPropagation();
  const rows = [
    {
      id: "you",
      name: nameInput || playerName,
      colorHex: colorHex(carColor),
      pingMs: 0,
      isYou: true,
    },
    ...peers.map((p) => ({ ...p, isYou: false })),
  ];

  return (
    <Screen
      open={open}
      className="pointer-events-auto absolute inset-0 z-50 overflow-y-auto bg-[#0a0a0a]/30 text-[#efefef]"
      from={{ autoAlpha: 0 }}
      to={{ duration: 0.4, ease: EASE.out }}
      exit={{ duration: 0.26, ease: EASE.in }}
      stagger={[
        {
          selector: "[data-lobby-head]",
          from: { autoAlpha: 0 },
          to: { duration: 0.65, ease: EASE.soft },
        },
        { selector: "[data-lobby-acts]", from: { autoAlpha: 0 } },
        { selector: "[data-lobby-grid]", from: { autoAlpha: 0 } },
        {
          selector: "[data-lobby-row]",
          from: { autoAlpha: 0 },
          each: 0.05,
          delay: 0.12,
        },
      ]}
    >
      <div
        ref={rootRef}
        className="mx-auto flex min-h-full w-full max-w-[1180px] flex-col px-6 py-8 md:px-14 md:py-12"
      >
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
          <div data-lobby-head>
            <div className="mb-4 h-[6px] w-16 bg-[#51a7d5]" />
            <h1
              className="font-black uppercase leading-[0.82] tracking-tighter"
              style={{ fontSize: "clamp(48px, 8vw, 120px)" }}
            >
              Multiplayer
            </h1>
            <div className="mt-4 inline-flex border-2 border-[#efefef]/40 px-3 py-1.5 text-[12px] font-black uppercase tracking-[0.2em]">
              {isConnected
                ? `${netMode === "p2p" ? "Internet P2P" : "LAN direct"} · ${peers.length + 1} player${peers.length === 0 ? "" : "s"}`
                : "Not connected"}
            </div>
          </div>
          <div
            data-lobby-acts
            className="flex w-full gap-[3px] sm:w-auto sm:min-w-[380px]"
          >
            {isConnected && (
              <button onClick={onLeaveRoom} className={`${GHOST} flex-1`}>
                Disconnect
              </button>
            )}
            <button onClick={onBack} className={`${GHOST} flex-1`}>
              <ArrowLeft size={18} strokeWidth={2.5} />
              <span className="flex-1 text-right">Garage</span>
            </button>
          </div>
        </div>

        {!isConnected && joinError && (
          <div
            data-lobby-grid
            className="mt-5 w-full max-w-[560px] bg-[#efefef] px-4 py-3 text-[13px] font-bold text-[#0a0a0a]"
          >
            {joinError}
          </div>
        )}

        <div
          data-lobby-grid
          ref={gridRef}
          className={`mt-8 grid items-start gap-x-[3px] gap-y-[3px] ${
            isConnected ? "lg:grid-cols-2" : "max-w-[560px]"
          }`}
        >
          <div className="space-y-[3px]">
            {!isConnected && (
              <>
                <div className="border-2 border-[#efefef]/25 p-4">
                  <Label>Driver name</Label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => {
                      setNameInput(e.target.value);
                      onUpdateProfile(e.target.value, carColor);
                    }}
                    onKeyDown={stop}
                    onKeyUp={stop}
                    maxLength={18}
                    placeholder="Enter name"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className={INPUT}
                  />
                </div>

                <Seg
                  value={netMode}
                  onChange={setNetMode}
                  options={[
                    {
                      id: "p2p",
                      label: (
                        <span className="inline-flex items-center gap-2">
                          <Globe size={15} /> Internet
                        </span>
                      ),
                    },
                    {
                      id: "lan",
                      label: (
                        <span className="inline-flex items-center gap-2">
                          <Zap size={15} /> LAN / Direct
                        </span>
                      ),
                    },
                  ]}
                />

                {netMode === "p2p" ? (
                  <div className="space-y-3 border-2 border-[#efefef]/25 p-4">
                    <form onSubmit={handleJoin} className="space-y-3">
                      <div>
                        <Label>Room code</Label>
                        <div className="flex gap-[3px]">
                          <input
                            type="text"
                            value={p2pRoomInput}
                            onChange={(e) => setP2pRoomInput(e.target.value)}
                            onKeyDown={stop}
                            onKeyUp={stop}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="characters"
                            spellCheck={false}
                            placeholder="X7Q2-MA9D"
                            className={`${INPUT} min-w-0 flex-1 font-mono uppercase tracking-[0.2em]`}
                          />
                          <button
                            type="button"
                            title="Generate random room code"
                            aria-label="Generate random room code"
                            onClick={() => setP2pRoomInput(generateRoomCode())}
                            className="grid shrink-0 place-items-center bg-[#51a7d5] px-4 text-[#0a0a0a] transition-colors hover:bg-[#efefef]"
                          >
                            <Dices size={20} strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>
                      <div>
                        <Label right="Optional">Password</Label>
                        <input
                          type="password"
                          value={passwordInput}
                          onChange={(e) => setPasswordInput(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") handleJoin(e);
                          }}
                          onKeyUp={stop}
                          maxLength={32}
                          autoComplete="off"
                          spellCheck={false}
                          placeholder="Locks the room"
                          className={INPUT}
                        />
                      </div>
                      <button type="submit" className={PRIMARY}>
                        Join room
                        <ArrowRight size={20} strokeWidth={2.5} />
                      </button>
                    </form>
                    <button
                      type="button"
                      onClick={handleCreateRoom}
                      className={`${BTN} bg-[#efefef] text-[#0a0a0a] hover:bg-[#51a7d5]`}
                    >
                      Create new room
                      <Lock size={18} strokeWidth={2.5} />
                    </button>
                    <p className="text-[12px] font-medium leading-relaxed text-[#efefef]/60">
                      Create a room and share the code, or enter a friend&apos;s
                      code to join. A password locks your new room (and gets you
                      into a locked one). Allow ~10s for the WebRTC mesh.
                    </p>
                  </div>
                ) : (
                  <form
                    onSubmit={handleJoin}
                    className="space-y-3 border-2 border-[#efefef]/25 p-4"
                  >
                    <div>
                      <Label>Host address</Label>
                      <input
                        type="text"
                        value={lanAddressInput}
                        onChange={(e) => setLanAddressInput(e.target.value)}
                        onKeyDown={stop}
                        onKeyUp={stop}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        placeholder="localhost:9876 or 192.168.1.x:9876"
                        className={INPUT}
                      />
                    </div>
                    <button type="submit" className={PRIMARY}>
                      Connect
                      <ArrowRight size={20} strokeWidth={2.5} />
                    </button>
                    <p className="text-[12px] font-medium text-[#efefef]/60">
                      Zero-latency local connection. Host auto-runs on port
                      9876.
                    </p>
                  </form>
                )}
              </>
            )}

            {isConnected && (
              <>
                <div data-lobby-in className="bg-[#efefef] p-4 text-[#0a0a0a]">
                  <div className="text-[11px] font-black uppercase tracking-[0.25em] opacity-60">
                    {netMode === "p2p"
                      ? "Share this room code"
                      : "Connected to"}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 truncate font-mono text-[34px] font-black leading-tight tracking-[0.1em]">
                      {roomId}
                    </div>
                    {netMode === "p2p" && (
                      <button
                        onClick={handleCopyCode}
                        className="inline-flex shrink-0 items-center gap-2 bg-[#0a0a0a] px-4 py-2.5 text-[12px] font-extrabold uppercase tracking-wider text-[#efefef] transition-colors hover:bg-[#51a7d5] hover:text-[#0a0a0a]"
                      >
                        {copied ? <Check size={15} /> : <Copy size={15} />}
                        {copied ? "Copied" : "Copy"}
                      </button>
                    )}
                  </div>
                </div>

                {peers.length === 0 && (
                  <div
                    data-lobby-in
                    className="bg-[#51a7d5] px-4 py-3 text-[13px] font-bold text-[#0a0a0a]"
                  >
                    Waiting for rivals. Share{" "}
                    <span className="font-mono font-black">
                      &quot;{roomId}&quot;
                    </span>{" "}
                    and have them press Connect.
                  </div>
                )}

                <div className="space-y-[3px]">
                  <div
                    data-lobby-row
                    className="grid grid-cols-[40px_1fr_auto] bg-[#efefef] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.25em] text-[#0a0a0a]"
                  >
                    <span>#</span>
                    <span>Driver</span>
                    <span>Ping</span>
                  </div>
                  {rows.map((row, i) => (
                    <div
                      key={row.id}
                      data-lobby-row
                      className={`grid h-12 grid-cols-[40px_1fr_auto] items-center px-3 ${
                        row.isYou
                          ? "border-2 border-[#51a7d5] bg-[#51a7d5] text-[#0a0a0a]"
                          : "border-2 border-[#efefef]/25 text-[#efefef]"
                      }`}
                    >
                      <span className="text-[16px] font-black tabular-nums">
                        {i + 1}
                      </span>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className="h-3 w-3 shrink-0"
                          style={{ backgroundColor: row.colorHex }}
                        />
                        <span className="truncate text-[15px] font-bold">
                          {row.name}
                        </span>
                        {row.isYou && (
                          <span className="bg-[#0a0a0a] px-1.5 py-0.5 text-[10px] font-black text-[#efefef]">
                            YOU
                          </span>
                        )}
                      </span>
                      <span className="text-[12px] font-bold tabular-nums opacity-70">
                        {row.isYou
                          ? "0 ms"
                          : row.pingMs > 0
                            ? `${row.pingMs} ms`
                            : "connected"}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {isConnected && (
            <div data-lobby-in className="space-y-[3px]">
              {mapPicker && <div className="border-2 border-[#efefef]/25 p-4">{mapPicker}</div>}

              <div className="border-2 border-[#efefef]/25 p-4">
                <Label>{lapMode ? "Race laps" : "Race distance"}</Label>
                <Seg
                  value={distanceKm}
                  onChange={setDistanceKm}
                  options={RACE_DISTANCES_KM.map((km) => ({
                    id: km as number,
                    label: lapMode
                      ? `${km} ${km === 1 ? "lap" : "laps"}`
                      : `${km} km`,
                  }))}
                />
              </div>

              <div className="border-2 border-[#efefef]/25 p-4">
                <Label right={`Grid ${peers.length + 1}+${aiCount}`}>
                  AI rivals
                </Label>
                <Seg
                  value={aiCount}
                  onChange={setAiCount}
                  options={MULTIPLAYER_AI_COUNTS.map((n) => ({
                    id: n,
                    label: n === 0 ? "Off" : n,
                  }))}
                />
                <p className="mt-2 text-[12px] font-medium text-[#efefef]/60">
                  {aiCount === 0
                    ? "Humans only: the drivers in this room."
                    : `${aiCount} bot${aiCount === 1 ? "" : "s"} join the grid behind the drivers. Whoever hits Start decides for the room.`}
                </p>
              </div>

              <div className="border-2 border-[#efefef]/25 p-4">
                <Label>Free-roam traffic</Label>
                <Seg
                  value={traffic}
                  onChange={onTraffic}
                  options={TRAFFIC_OPTIONS.map((o) => ({
                    id: o.id,
                    label: o.label,
                  }))}
                />
                <p className="mt-2 text-[12px] font-medium text-[#efefef]/60">
                  {traffic === "off"
                    ? "Empty roads when free roaming together."
                    : `${trafficCountFor(traffic)} AI cruisers on your road in free roam (local only, not synced).`}
                </p>
              </div>

              <div className="space-y-[3px] pt-[3px]">
                <button
                  onClick={() => onStartMultiplayerRace(distanceKm, aiCount)}
                  className={`${PRIMARY} py-5 text-[18px]`}
                >
                  {aiCount === 0
                    ? `Start grid race · ${distanceKm} km`
                    : `Start mixed race · ${distanceKm} km · +${aiCount} bots`}
                  <ArrowRight size={22} strokeWidth={2.5} />
                </button>
                <button onClick={onStartFreeDrive} className={GHOST}>
                  {traffic === "off"
                    ? "Free roam together"
                    : `Free roam together · ${TRAFFIC_OPTIONS.find((o) => o.id === traffic)?.label} traffic`}
                  <ArrowRight size={20} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Screen>
  );
}

export { MultiplayerHudBadge } from "./MultiplayerHudBadge";
