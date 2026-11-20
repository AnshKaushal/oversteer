export const FOV_MIN = 12
export const FOV_MAX = 110

export const photoState = { fov: 75, pending: false }

export function setPhotoFov(v: number) {
  photoState.fov = Math.min(FOV_MAX, Math.max(FOV_MIN, v))
  window.dispatchEvent(new CustomEvent("freecam-fov", { detail: photoState.fov }))
}

export function requestPhoto() {
  photoState.pending = true
}

export function photoSaved(ok: boolean, where: string) {
  window.dispatchEvent(
    new CustomEvent("photo-saved", { detail: { ok, where } }),
  )
}
