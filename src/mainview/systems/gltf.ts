import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js"

export function createGLTFLoader(): GLTFLoader {
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  return loader
}

THREE.Cache.enabled = true

export function prefetchModels(baseUrl: string, files: string[]): void {
  for (const f of new Set(files)) {
    new THREE.FileLoader()
      .setResponseType("arraybuffer")
      .loadAsync(`${baseUrl}models/${f}`)
      .catch(() => {})
  }
}
