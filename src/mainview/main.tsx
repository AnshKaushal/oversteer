import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App"

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
