/**
 * Runs a physics script once per registry car (CAR=<id>) and prints one
 * pass/fail line per car. Usage:
 *   bun scripts/run-per-car.ts scripts/smoke-test.ts [--only id,id] [--verbose]
 * Failing checks listed in scripts/known-failures.json are reported as
 * "known" and do not fail the run; any other failing check does.
 *   --record   rewrite this script's entry in known-failures.json from the
 *              current run (use only to document the state of a baseline)
 */
import { CARS } from "./lib/cars"

const KNOWN_PATH = new URL("./known-failures.json", import.meta.url).pathname
const known: Record<string, Record<string, string[]>> = (await Bun.file(
  KNOWN_PATH,
).exists())
  ? await Bun.file(KNOWN_PATH).json()
  : {}

const args = process.argv.slice(2)
const script = args.find((a) => !a.startsWith("--"))
if (!script) {
  console.error("usage: bun scripts/run-per-car.ts <script> [--only a,b] [--verbose]")
  process.exit(2)
}
const verbose = args.includes("--verbose")
const record = args.includes("--record")
const key = script.split("/").pop()!
const recorded: Record<string, string[]> = {}
const onlyIdx = args.indexOf("--only")
const only = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(",")) : null

let failed = 0
for (const def of CARS) {
  if (only && !only.has(def.id)) continue
  const t0 = performance.now()
  const p = Bun.spawn(["bun", script], {
    env: { ...process.env, CAR: def.id },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [out, err] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
  ])
  const code = await p.exited
  const text = out + err
  // One name per failed check: the text between "FAIL | " and the next " | ".
  const failed_checks = [
    ...new Set(
      text
        .split("\n")
        .filter((l) => l.includes("FAIL | "))
        .map((l) => l.split("FAIL | ")[1].split(" | ")[0].trim()),
    ),
  ]
  const crashed = code !== 0 && failed_checks.length === 0
  const knownHere = new Set(known[key]?.[def.id] ?? [])
  const fresh = failed_checks.filter((n) => !knownHere.has(n))
  const secs = ((performance.now() - t0) / 1000).toFixed(1)
  recorded[def.id] = failed_checks
  const status =
    code === 0 ? "PASS" : crashed || fresh.length ? "FAIL" : "KNOWN"
  console.log(
    `${status} | ${def.id} | ${secs}s | ${failed_checks.length} failing, ${fresh.length} new`,
  )
  if (crashed) {
    failed++
    console.log("    crashed: " + text.trim().split("\n").slice(-3).join(" / "))
  } else if (fresh.length) {
    failed++
    for (const n of fresh) console.log("    NEW FAIL | " + n)
  }
  if (verbose) console.log(text)
}
if (record) {
  known[key] = recorded
  await Bun.write(KNOWN_PATH, JSON.stringify(known, null, 2) + "\n")
  console.log(`recorded ${key} in known-failures.json`)
  process.exit(0)
}
console.log(`\n${failed} car(s) with new failures in ${script}`)
process.exit(failed ? 1 : 0)
