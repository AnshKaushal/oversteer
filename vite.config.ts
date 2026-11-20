import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { electrobunViteAliases } from "./.hutch/devkit/api/config/electrobun-vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: electrobunViteAliases(resolve(__dirname, ".hutch/devkit")),
  },
  root: "src/mainview",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined
          if (id.includes("/three/")) return "three"
          if (id.includes("rapier3d")) return "rapier"
          if (id.includes("trystero")) return "net"
          if (id.includes("gsap") || id.includes("swiper")) return "ui-vendor"
          if (/\/(react|react-dom|scheduler)\//.test(id)) return "react"
          return undefined
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
