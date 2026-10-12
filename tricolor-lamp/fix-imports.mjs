/**
 * fix-imports.mjs — post-build ESM fixer.
 *
 * `tsc` emits extensionless relative imports (e.g. `from "../lib/parts"`),
 * which Node's ESM loader cannot resolve (it requires explicit ".js"
 * extensions). This walks dist/ and appends ".js" to every extensionless
 * relative import. Runs automatically after `tsc` as part of `npm run build`
 * so verify.mjs / render.mjs can import the compiled boards under plain Node.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { extname, join } from "node:path"

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(p)
    else if (entry.name.endsWith(".js")) yield p
  }
}

let filesPatched = 0
let importsPatched = 0

for (const file of walk("dist")) {
  const src = readFileSync(file, "utf8")
  const fixed = src.replace(
    /(from\s+|import\(\s*)("\.[^"]+"|'\.[^']+')/g,
    (match, prefix, specifier) => {
      const quote = specifier[0]
      const path = specifier.slice(1, -1)
      if (extname(path) !== "") return match // already has an extension
      importsPatched++
      return `${prefix}${quote}${path}.js${quote}`
    },
  )
  if (fixed !== src) {
    writeFileSync(file, fixed)
    filesPatched++
  }
}

console.log(`fix-imports: patched ${importsPatched} import(s) in ${filesPatched} file(s) under dist/`)
