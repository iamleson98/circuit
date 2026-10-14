/**
 * engine.mjs — create the WebAssembly ngspice SPICE engine, Node-compatible.
 *
 * The engine (@tscircuit/ngspice-spice-engine) loads its WASM ngspice module
 * by fetching it from a CDN, wrapping the source in a Blob, and importing the
 * resulting blob: URL. Browsers and Bun import blob: URLs fine; Node's ESM
 * loader rejects them. The shim below captures the module source when it is
 * fetched and makes URL.createObjectURL() return a data: URL instead —
 * which Node CAN import. Under Bun the shim is a harmless no-op.
 */
export async function createEngine() {
  const isNode =
    typeof process !== "undefined" && process.versions?.node && typeof Bun === "undefined"
  if (isNode) {
    let lastFetchedText = null
    const realFetch = globalThis.fetch
    globalThis.fetch = async (...args) => {
      const res = await realFetch(...args)
      const url = String(args[0])
      if (url.includes("eecircuit-engine") || url.includes("tscircuit.com")) {
        const clone = res.clone()
        lastFetchedText = await clone.text().catch(() => null)
      }
      return res
    }
    const realCreateObjectURL = URL.createObjectURL.bind(URL)
    URL.createObjectURL = (blob) => {
      if (blob instanceof Blob && lastFetchedText) {
        return (
          "data:text/javascript;charset=utf-8," +
          encodeURIComponent(lastFetchedText)
        )
      }
      return realCreateObjectURL(blob)
    }
  }
  const mod = await import("@tscircuit/ngspice-spice-engine")
  return mod.default()
}
