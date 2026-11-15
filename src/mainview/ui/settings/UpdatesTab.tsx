import { useState } from "react"
import { checkForUpdates } from "../../systems/updater"
import { ActionButton, Row, Section } from "./controls"

export function UpdatesTab() {
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState("")
  const check = async () => {
    if (checking) return
    setChecking(true)
    setMessage("Checking for updates…")
    const result = await checkForUpdates()
    setMessage(result.message)
    setChecking(false)
  }
  return (
    <Section title="Updates">
      <Row
        label="Check for updates"
        hint={message || ""}
      >
        <ActionButton onClick={check} disabled={checking}>
          {checking ? "Checking…" : "Check now"}
        </ActionButton>
      </Row>
    </Section>
  )
}
