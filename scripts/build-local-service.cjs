const { spawnSync } = require("child_process")
const path = require("path")

const isWin = process.platform === "win32"
const outName = isWin ? "noteblock-server.exe" : "noteblock-server"
const outPath = `bin/${outName}`
const serviceDir = path.join(__dirname, "..", "noteblock-local-service")

const result = spawnSync("go", ["build", "-o", outPath, "./cmd/noteblock"], {
  cwd: serviceDir,
  stdio: "inherit",
  shell: false,
})

if (result.error) {
  console.error("failed to build local service binary:", result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
