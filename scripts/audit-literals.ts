/**
 * Burn-down for hardcoded physics numbers. Counts numeric literals other
 * than 0, 1, 2 and -1 in the physics source files, ignoring comments and
 * strings. Report-only by default; with --fail it exits non-zero when any
 * file in ENFORCED has a literal that scripts/audit-allowlist.json does not
 * list for that file.
 *   bun scripts/audit-literals.ts [--fail] [--list <file-substring>]
 */
import ts from "typescript"
import { readdirSync } from "node:fs"

const DIR = process.env.AUDIT_DIR ?? "src/mainview/physics"
/** Every file under physics/ must reach zero literals. */
const ENFORCED_ALL = true
const TRIVIAL = new Set(["0", "1", "2"])

const allowPath = new URL("./audit-allowlist.json", import.meta.url).pathname
const allow: Record<string, string[]> = (await Bun.file(allowPath).exists())
  ? await Bun.file(allowPath).json()
  : {}

const args = process.argv.slice(2)
const failMode = args.includes("--fail")
const listIdx = args.indexOf("--list")
const listFilter = listIdx >= 0 ? args[listIdx + 1] : null

const files = (
  await Array.fromAsync(new Bun.Glob("**/*.ts").scan({ cwd: DIR }))
).sort()
let total = 0
let violations = 0
const rows: [string, number][] = []

for (const f of files) {
  const text = await Bun.file(`${DIR}/${f}`).text()
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true)
  const hits: { line: number; text: string }[] = []
  const visit = (n: ts.Node) => {
    if (ts.isLiteralTypeNode(n)) return // numeric types like Gear are not values
    if (ts.isNumericLiteral(n) && !TRIVIAL.has(n.text)) {
      const neg =
        n.parent &&
        ts.isPrefixUnaryExpression(n.parent) &&
        n.parent.operator === ts.SyntaxKind.MinusToken
      if (!(neg && n.text === "1")) {
        hits.push({
          line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
          text: (neg ? "-" : "") + n.text,
        })
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  total += hits.length
  rows.push([f, hits.length])
  const allowed = new Set(allow[f.split("/").pop()!] ?? [])
  if (ENFORCED_ALL) {
    for (const h of hits) {
      if (!allowed.has(h.text)) {
        violations++
        if (failMode) console.log(`${f}:${h.line} literal ${h.text}`)
      }
    }
  }
  if (listFilter && f.includes(listFilter)) {
    for (const h of hits) console.log(`${f}:${h.line}  ${h.text}`)
  }
}

rows.sort((a, b) => b[1] - a[1])
for (const [f, n] of rows) if (n) console.log(String(n).padStart(5) + "  " + f)
console.log(`${String(total).padStart(5)}  TOTAL numeric literals`)
if (failMode && violations) {
  console.log(`${violations} literal(s) in enforced files`)
  process.exit(1)
}
