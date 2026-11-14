import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js"

/** GLTFLoader that can read the meshopt-compressed models in public/models. */
export function createGLTFLoader(): GLTFLoader {
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  return loader
}

THREE.Cache.enabled = true

/**
 * Start downloading models in parallel now. GLTFLoader's FileLoader shares the
 * THREE.Cache entry (and any in-flight request) for the same URL, so the later
 * sequential `await load()` calls resolve from memory instead of one-by-one.
 */
export function prefetchModels(baseUrl: string, files: string[]): void {
  for (const f of new Set(files)) {
    new THREE.FileLoader()
      .setResponseType("arraybuffer")
      .loadAsync(`${baseUrl}models/${f}`)
      .catch(() => {})
  }
}
