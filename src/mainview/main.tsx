import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App"

// macOS WKWebView exits native fullscreen when Escape is pressed. Swallow the
// default action in the capture phase so the key never reaches the OS.
document.addEventListener(
  "keydown",
  (e) => {
    if (e.key === "Escape") e.preventDefault()
  },
  true,
)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
