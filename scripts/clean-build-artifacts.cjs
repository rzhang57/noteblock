const fs = require("fs")
const path = require("path")

const root = path.join(__dirname, "..")
const pathsToRemove = [
  path.join(root, "dist"),
  path.join(root, "client", "dist"),
]

for (const target of pathsToRemove) {
  try {
    fs.rmSync(target, { recursive: true, force: true })
  } catch (err) {
    console.error(`failed to remove ${target}: ${err.message}`)
    process.exit(1)
  }
}
