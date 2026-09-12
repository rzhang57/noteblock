const { spawnSync } = require("child_process")
const path = require("path")

const isWin = process.platform === "win32"
const suffix = isWin ? ".exe" : ""

const services = [
  { dir: "noteblock-local-service", out: `bin/noteblock-server${suffix}`, pkg: "./cmd/noteblock" },
  { dir: "noteblock-cloud-service", out: `bin/cloud-api${suffix}`, pkg: "./cmd/api" },
]

for (const service of services) {
  const result = spawnSync("go", ["build", "-o", service.out, service.pkg], {
    cwd: path.join(__dirname, "..", service.dir),
    stdio: "inherit",
    shell: false,
  })

  if (result.error) {
    console.error(`failed to build ${service.dir}:`, result.error.message)
    process.exit(1)
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
