import * as THREE from "three"
import { FrameStats, drawFrameGraph } from "../diagnostics/FrameStats"
import { AutoQuality } from "../systems/quality"
import { WORLD } from "../data/world"
import { perfGraph, perfOverlay } from "../app/helpers"
import type { SessionCtx } from "./sessionCtx"

export function createPerfHud(scene: THREE.Scene, ctx: SessionCtx) {
  const { settingsRef, rendererRef, handleUpdateSettingsRef, startedRef } = ctx
  const stats = new FrameStats(WORLD.statsWindowMs)
  const statsEl = perfOverlay()
  const graphEl = perfGraph()
  const autoQ = new AutoQuality()
  let f3Flip = false
  let basicMat = false
  let shadowsOff = false
  let objCountAt = 0
  let overlayAt = 0
  let graphAt = 0
  let objCount = 0
  let breakdown = ""
  let cpuMax = 0
  let renderMax = 0

  const onStatsKey = (e: KeyboardEvent) => {
    if (e.code === "F3") f3Flip = !f3Flip
    if (e.code === "F4") {
      basicMat = !basicMat
      scene.overrideMaterial = basicMat
        ? new THREE.MeshBasicMaterial({ color: 0x888888 })
        : null
    }
    if (e.code === "F5") {
      shadowsOff = !shadowsOff
      rendererRef.current!.shadowMap.enabled =
        !shadowsOff && settingsRef.current.shadows
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material
        if (m)
          for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true
      })
    }
  }
  window.addEventListener("keydown", onStatsKey)

  const shown = () => !!settingsRef.current.perfOverlay !== f3Flip

  const spikeExtra = (steps: number, speedKmh: number): string => {
    const renderer = rendererRef.current!
    const ri = renderer.info.render
    let litLights = 0
    let litSpots = 0
    scene.traverse((o) => {
      const l = o as THREE.Light
      if (l.isLight && l.visible && l.intensity > 0) {
        let p: THREE.Object3D | null = o.parent
        let vis = true
        while (p) {
          if (!p.visible) {
            vis = false
            break
          }
          p = p.parent
        }
        if (vis) {
          litLights++
          if ((o as THREE.SpotLight).isSpotLight) litSpots++
        }
      }
    })
    return `lights=${litLights}(${litSpots} spot) basic=${basicMat} shadowsOff=${shadowsOff} ${ri.calls} calls ${(ri.triangles / 1000).toFixed(0)}k tris, ${objCount} objs, steps=${steps}, scale=${settingsRef.current.renderScale}, buf=${renderer.domElement.width}x${renderer.domElement.height}, aa=${settingsRef.current.antiAliasing ?? "fxaa"}, shadows=${renderer.shadowMap.enabled}, preset=${settingsRef.current.qualityPreset}, speed=${Math.round(speedKmh)}kmh, started=${startedRef.current}, hasFocus=${document.hasFocus()}`
  }

  const frame = (
    now: number,
    dtMs: number,
    steps: number,
    stepMs: number,
    loopT0: number,
    renderT0: number,
    renderT1: number,
  ) => {
    cpuMax = Math.max(cpuMax * 0.985, renderT0 - loopT0)
    renderMax = Math.max(renderMax * 0.985, renderT1 - renderT0)
    stats.frame(now, dtMs, steps, stepMs)
    const showStats = shown()
    statsEl.style.display = showStats ? "block" : "none"
    graphEl.style.display = showStats ? "block" : "none"
    if (stats.windowTick && settingsRef.current.autoQuality) {
      const cur = settingsRef.current.renderScale
      const ceil = settingsRef.current.qualityPreset === "low" ? 60 : 100
      const nextScale = autoQ.tick(stats.frameMs, cur, ceil)
      if (nextScale !== null)
        handleUpdateSettingsRef.current({
          ...settingsRef.current,
          renderScale: nextScale,
        })
    }
    if (showStats) {
      if (now - graphAt > 100) {
        graphAt = now
        drawFrameGraph(graphEl, stats)
      }
      if (now - objCountAt > 1000) {
        objCountAt = now
        let n = 0,
          meshes = 0,
          inst = 0,
          shadowCasters = 0,
          lights = 0,
          tris = 0
        const geos = new Set<THREE.BufferGeometry>()
        const top: { label: string; t: number }[] = []
        const cat = new Map<string, { n: number; t: number }>()
        const mats = new Set<THREE.Material>()
        scene.traverse((o) => {
          n++
          const m = o as THREE.Mesh
          if ((o as THREE.Light).isLight) lights++
          if (m.isMesh) {
            meshes++
            if ((o as THREE.InstancedMesh).isInstancedMesh) inst++
            if (m.castShadow) shadowCasters++
            geos.add(m.geometry)
            for (const mm of Array.isArray(m.material)
              ? m.material
              : [m.material])
              mats.add(mm)
            const g = m.geometry
            const mt =
              ((g.index ? g.index.count : g.attributes.position.count) / 3) *
              ((o as THREE.InstancedMesh).count ?? 1)
            tris += mt
            let owner: THREE.Object3D | null = o
            let label = ""
            while (owner && !label) {
              label = owner.name
              owner = owner.parent
            }
            {
              let o2: THREE.Object3D | null = o
              let nm = ""
              while (o2 && !nm) {
                nm = o2.name
                o2 = o2.parent
              }
              nm = nm || "other"
              const e = cat.get(nm) ?? { n: 0, t: 0 }
              e.n++
              e.t += mt
              cat.set(nm, e)
            }
            top.push({
              label: `${label || "?"}${m.castShadow ? "*" : ""}${(o as THREE.InstancedMesh).isInstancedMesh ? " x" + (o as THREE.InstancedMesh).count : ""}`,
              t: mt,
            })
          }
        })
        objCount = n
        top.sort((a, b) => b.t - a.t)
        const topTxt = top
          .slice(0, 5)
          .map((x) => `${x.label} ${(x.t / 1000).toFixed(0)}k`)
          .join(" | ")
        const catTxt = [...cat.entries()]
          .sort((a, b) => b[1].t - a[1].t)
          .slice(0, 5)
          .map(([k, v]) => `${k} ${v.n}m/${(v.t / 1000).toFixed(0)}k`)
          .join(" | ")
        breakdown =
          `by owner: ${catTxt}\n` +
          `top: ${topTxt}\n` +
          `${meshes} meshes (${inst} instanced), ${geos.size} geometries, ${mats.size} materials\n${shadowCasters} shadow casters, ${lights} lights, ${(tris / 1000).toFixed(0)}k scene tris`
      }
      const ri = rendererRef.current!.info.render
      if (now - overlayAt > 250) {
        overlayAt = now
        statsEl.textContent = `${basicMat ? "[F4 basic materials]\n" : ""}${shadowsOff ? "[F5 shadows off]\n" : ""}${stats.text()}\n${ri.calls} draw calls, ${(ri.triangles / 1000).toFixed(0)}k tris, ${objCount} scene objects\n${breakdown}\nlogic max ${cpuMax.toFixed(1)} ms, render submit max ${renderMax.toFixed(1)} ms`
        graphEl.style.marginTop = `${statsEl.offsetHeight + 4}px`
      }
    }
  }

  const dispose = () => {
    window.removeEventListener("keydown", onStatsKey)
    statsEl.style.display = "none"
    graphEl.style.display = "none"
  }

  return {
    stats,
    frame,
    shown,
    spikeExtra,
    dispose,
    get objCount() {
      return objCount
    },
  }
}
