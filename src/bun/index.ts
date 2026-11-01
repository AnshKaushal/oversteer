import {
  ApplicationMenu,
  BrowserView,
  BrowserWindow,
  GlobalShortcut,
  Updater,
} from "electrobun/main"
import os from "os"
import { UPDATE_ICON_DATA_URI } from "./updateIcon"
import { grabCursor, releaseCursor } from "./macCursor"
import type { OverSteerRPC, UpdateResult } from "../shared/updateRpc"

const DEV_SERVER_PORT = 5173
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`
const LAN_PORT = 9876

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms)
      }),
    ])
  } catch {
    return null
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

const UPDATE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:#0b0d12;color:#e8eaf0;font-family:-apple-system,"Segoe UI",sans-serif}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}
  img{width:72px;height:72px;border-radius:16px}
  h1{margin:0;font-size:22px;letter-spacing:.2em;font-weight:800}
  #msg{font-size:13px;opacity:.7}
  #detail{font-size:11px;opacity:.5;height:14px;font-variant-numeric:tabular-nums}
  .bar{width:280px;height:6px;border-radius:3px;background:#1d212b;overflow:hidden}
  #fill{height:100%;width:0;background:#2f7bff;transition:width .2s}
  .bar.busy #fill{width:35%;animation:slide 1.1s ease-in-out infinite alternate}
  @keyframes slide{from{margin-left:0}to{margin-left:65%}}
</style></head><body>
  <img src="${UPDATE_ICON_DATA_URI}" alt="">
  <h1>OVERSTEER</h1>
  <div class="bar busy" id="bar"><div id="fill"></div></div>
  <div id="msg">Updating…</div>
  <div id="detail"></div>
  <script>
    window.setUpdate=function(msg,pct,detail){
      document.getElementById("msg").textContent=msg;
      document.getElementById("detail").textContent=detail||"";
      var bar=document.getElementById("bar");
      if(typeof pct==="number"){bar.className="bar";document.getElementById("fill").style.width=pct+"%"}
      else bar.className="bar busy";
    };
  </script>
</body></html>`

function openUpdateWindow(): BrowserWindow | null {
  try {
    return new BrowserWindow({
      title: "OverSteer",
      html: UPDATE_HTML,
      frame: { width: 420, height: 220 },
      titleBarStyle: "hidden",
      styleMask: { Miniaturizable: false, Resizable: false },
    })
  } catch {
    return null
  }
}

function setUpdateStatus(
  win: BrowserWindow | null,
  message: string,
  progress?: number,
  detail = "",
): void {
  try {
    win?.webview?.executeJavascript(
      `window.setUpdate&&window.setUpdate(${JSON.stringify(message)},${
        progress === undefined ? "null" : Math.round(progress)
      },${JSON.stringify(detail)})`,
    )
  } catch {}
}

let updateRunning = false

async function runUpdate(manual: boolean): Promise<UpdateResult> {
  if (updateRunning) {
    return { outcome: "busy", message: "An update check is already running." }
  }

  let channel = ""

  try {
    channel = await Updater.localInfo.channel()
  } catch {
    return { outcome: "error", message: "Could not read the app version." }
  }

  if (channel === "dev") {
    return {
      outcome: "dev-build",
      message: "Updates are disabled in development builds.",
    }
  }

  updateRunning = true

  let updateWin: BrowserWindow | null = null

  if (manual) {
    updateWin = openUpdateWindow()
    setUpdateStatus(updateWin, "Checking for updates…")
  }

  const finish = (result: UpdateResult, closeAfterMs = 0): UpdateResult => {
    updateRunning = false

    if (closeAfterMs > 0) {
      setUpdateStatus(updateWin, result.message, result.outcome === "error" ? undefined : 100)
      const win = updateWin
      setTimeout(() => {
        try {
          win?.close()
        } catch {}
      }, closeAfterMs)
    } else {
      try {
        updateWin?.close()
      } catch {}
    }

    return result
  }

  try {
    Updater.onStatusChange((entry) => {
      console.log(`[update] ${entry.status}: ${entry.message}`)

      if (entry.status === "download-progress") {
        const d = entry.details as
          | { progress?: number; bytesDownloaded?: number; totalBytes?: number }
          | undefined
        const mb = (n?: number) => ((n ?? 0) / 1048576).toFixed(1)
        const pct = d?.progress
        const detail =
          d?.totalBytes
            ? `${Math.round(pct ?? 0)}%  ·  ${mb(d.bytesDownloaded)} / ${mb(d.totalBytes)} MB`
            : d?.bytesDownloaded
              ? `${mb(d.bytesDownloaded)} MB`
              : ""
        setUpdateStatus(updateWin, "Downloading update…", pct, detail)
      } else if (entry.status === "downloading-full-bundle") {
        setUpdateStatus(updateWin, "Downloading update…")
      } else if (entry.status === "applying" || entry.status === "replacing-app") {
        setUpdateStatus(updateWin, "Installing update…")
      } else if (entry.status === "launching-new-version") {
        setUpdateStatus(updateWin, "Restarting…")
      }
    })

    const info = await withTimeout(Updater.checkForUpdate(), 8000)

    if (!info || info.error) {
      return finish(
        {
          outcome: "error",
          message: "Could not reach the update server.",
        },
        manual ? 2500 : 0,
      )
    }

    if (!info.updateAvailable) {
      return finish(
        { outcome: "up-to-date", message: "You're on the latest version." },
        manual ? 2000 : 0,
      )
    }

    console.log(`[update] version ${info.version} available, downloading`)

    if (!updateWin) updateWin = openUpdateWindow()
    setUpdateStatus(updateWin, `Downloading version ${info.version}…`)

    const downloaded = await withTimeout(
      Updater.downloadUpdate(),
      10 * 60 * 1000,
    )

    if (downloaded === null) {
      return finish(
        { outcome: "error", message: "The update download failed." },
        manual ? 2500 : 0,
      )
    }

    const fresh = await Updater.checkForUpdate()

    if (fresh.updateReady && !fresh.error) {
      console.log("[update] applying, relaunching on the new version")
      setUpdateStatus(updateWin, "Installing update…")
      await Updater.applyUpdate()
      return { outcome: "updating", message: `Updating to version ${info.version}…` }
    }

    return finish({ outcome: "error", message: "The update could not be installed." }, manual ? 2500 : 0)
  } catch {
    return finish({ outcome: "error", message: "The update failed." }, manual ? 2500 : 0)
  }
}

await runUpdate(false)

async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel()

  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" })
      console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`)
      return DEV_SERVER_URL
    } catch {
      console.log(
        "Vite dev server not running. Run 'hutch run dev:hmr' for HMR support.",
      )
    }
  }

  return "views://mainview/index.html"
}

function getLocalIp(): string {
  try {
    const nets = os.networkInterfaces()

    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === "IPv4" && !net.internal) {
          return net.address
        }
      }
    }
  } catch {}

  return "127.0.0.1"
}

const lanClients = new Set<any>()

try {
  Bun.serve({
    port: LAN_PORT,

    fetch(req, server) {
      if (req.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        })
      }

      if (server.upgrade(req)) return undefined

      return new Response(
        `OverSteer LAN Relay Server (${getLocalIp()}:${LAN_PORT})`,
        { status: 200 },
      )
    },

    websocket: {
      open(ws) {
        lanClients.add(ws)
      },

      message(ws, msg) {
        const message = msg

        for (const client of lanClients) {
          if (client === ws) continue

          try {
            client.send(message)
          } catch {}
        }
      },

      close(ws) {
        lanClients.delete(ws)
      },
    },
  })

  console.log(`[LAN Relay] Server running on ws://${getLocalIp()}:${LAN_PORT}`)
} catch {
  console.log(
    `[LAN Relay] Port ${LAN_PORT} in use or already bound by host instance`,
  )
}

const isWindowed =
  process.argv.includes("--windowed") ||
  process.argv.includes("-w") ||
  process.env.OVERSTEER_WINDOWED === "1"

const openWindows: BrowserWindow[] = []

function createWindow(winUrl: string, windowed = isWindowed) {
  console.log(`[Window] Creating window (windowed=${windowed}) -> ${winUrl}`)

  const rpc = BrowserView.defineRPC<OverSteerRPC>({
    handlers: {
      requests: {
        checkForUpdates: () => runUpdate(true),
        setCursorLock: (p?: any) => {
          if (!p?.locked) {
            releaseCursor()
            return true
          }
          const w = win
          return grabCursor(
            (dx, dy) => (w.webview.rpc as any)?.send?.mouseDelta({ dx, dy }),
            w.isFullScreen(),
          )
        },
      },
      messages: {},
    },
  })

  const win: BrowserWindow = new BrowserWindow({
    title: "OverSteer",
    url: winUrl,
    rpc,
    frame: {
      width: windowed ? 1024 : 1440,
      height: windowed ? 680 : 900,
    },
    styleMask: {
      Miniaturizable: true,
      Resizable: true,
      FullSizeContentView: false,
    },
  })

  openWindows.push(win)

  if (!windowed) {
    win.setFullScreen(true)
  }

  return win
}

if (process.platform === "win32") {
  ApplicationMenu.setApplicationMenu([])
} else {
  ApplicationMenu.setApplicationMenu([
    {
      label: "OverSteer",
      submenu: [
        {
          label: "Toggle Fullscreen",
          action: "toggle-fullscreen",
          accelerator: "CmdOrCtrl+F",
        },
        {
          label: "New Window (multiplayer test)",
          action: "new-window",
          accelerator: "CmdOrCtrl+N",
        },
        {
          label: "Check for Updates…",
          action: "check-for-updates",
        },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "Window",
      submenu: [
        {
          label: "Toggle Fullscreen",
          action: "toggle-fullscreen",
        },
        {
          label: "New Window (multiplayer test)",
          action: "new-window",
        },
      ],
    },
  ])
}

const url = await getMainViewUrl()
const mainWindow = createWindow(url, isWindowed)

let wantFullscreen = !isWindowed
let macCancelOp: any = null

if (process.platform === "darwin") {
  try {
    const { dlopen, JSCallback, CFunction } = await import("bun:ffi")
    const libobjc = dlopen("/usr/lib/libobjc.A.dylib", {
      object_getClass: { args: ["ptr"], returns: "ptr" },
      sel_registerName: { args: ["cstring"], returns: "ptr" },
      class_getInstanceMethod: { args: ["ptr", "ptr"], returns: "ptr" },
      method_setImplementation: { args: ["ptr", "ptr"], returns: "ptr" },
    })
    let originalCancelOpFn: any = null
    macCancelOp = new JSCallback(
      (self: any, _cmd: any, sender: any) => {
        if (wantFullscreen) return
        if (originalCancelOpFn) originalCancelOpFn(self, _cmd, sender)
      },
      { args: ["ptr", "ptr", "ptr"], returns: "void", threadsafe: true },
    )
    const ptr = mainWindow.ptr
    if (ptr) {
      const cls = libobjc.symbols.object_getClass(ptr)
      const sel = libobjc.symbols.sel_registerName("cancelOperation:")
      const method = libobjc.symbols.class_getInstanceMethod(cls, sel)
      if (method && macCancelOp.ptr) {
        const oldImp = libobjc.symbols.method_setImplementation(method, macCancelOp.ptr)
        if (oldImp) {
          originalCancelOpFn = CFunction({ ptr: oldImp, args: ["ptr", "ptr", "ptr"], returns: "void" })
        }
      }
    }
  } catch (e) {
    console.error("[fullscreen] failed to disable escape-exits-fullscreen:", e)
  }
}

ApplicationMenu.on("application-menu-clicked", (event: any) => {
  const data = event?.data ?? event

  if (data?.action === "check-for-updates") {
    void runUpdate(true)
    return
  }

  if (data?.action === "new-window") {
    createWindow(url, true)
    return
  }
  if (data?.action !== "toggle-fullscreen") return

  wantFullscreen = !wantFullscreen
  mainWindow.setFullScreen(wantFullscreen)
})

if (process.platform === "win32") {
  try {
    GlobalShortcut.register("CTRL+N", () => {
      createWindow(url, true)
    })
  } catch {}
  try {
    GlobalShortcut.register("F11", () => {
      try {
        if (mainWindow.isFullScreen()) {
          wantFullscreen = false
          mainWindow.setFullScreen(false)
        }
      } catch {}
    })
  } catch {}
}

console.log(
  `OverSteer started! (${isWindowed ? "Windowed Mode" : "Fullscreen Mode"})`,
)
