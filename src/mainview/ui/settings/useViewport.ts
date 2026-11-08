import { useEffect, useState } from "react"

export function useViewport() {
  const [viewport, setViewport] = useState({
    w: typeof window !== "undefined" ? window.innerWidth : 1920,
    h: typeof window !== "undefined" ? window.innerHeight : 1080,
  })
  useEffect(() => {
    const handleResize = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])
  return viewport
}
