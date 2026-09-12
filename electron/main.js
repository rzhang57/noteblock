const { app, BrowserWindow, ipcMain, protocol, net } = require("electron")
const { spawn } = require("child_process")
const nodeNet = require("net")
const { randomUUID } = require("crypto")
const path = require("path")
const { pathToFileURL } = require("url")

let goProcess
let cloudProcess
let cloudBaseUrl = ""

// Comfortably inside the sidecar 3s flush timeout, so the race is decided by the sidecar.
const SHUTDOWN_FLUSH_MS = 4000
let responseBuffer = ""
const pendingRequests = new Map()

class BackendIPCError extends Error {
    constructor(message, code) {
        super(message)
        this.name = "BackendIPCError"
        this.code = code
    }
}

function parseBackendLine(rawLine) {
    const line = rawLine.trim()
    if (!line) return
    if (!line.startsWith("{")) return

    let payload
    try {
        payload = JSON.parse(line)
    } catch (err) {
        console.error("Failed to parse backend response line:", err)
        return
    }

    const pending = pendingRequests.get(payload.id)
    if (!pending) return

    pendingRequests.delete(payload.id)
    if (payload.error) {
        pending.reject(new BackendIPCError(payload.error.message || "IPC request failed", payload.error.code))
    } else {
        pending.resolve(payload.result)
    }
}

function wireBackendStdout() {
    if (!goProcess || !goProcess.stdout) return

    goProcess.stdout.setEncoding("utf8")
    goProcess.stdout.on("data", (chunk) => {
        responseBuffer += chunk

        let newlineIndex = responseBuffer.indexOf("\n")
        while (newlineIndex >= 0) {
            const line = responseBuffer.slice(0, newlineIndex)
            responseBuffer = responseBuffer.slice(newlineIndex + 1)
            parseBackendLine(line)
            newlineIndex = responseBuffer.indexOf("\n")
        }
    })
}

// Backend NOTE_DB_PATH and the image protocol handler must resolve to the same dir.
function getDataPath() {
    return app.isPackaged ? app.getPath("userData") : path.join(__dirname, "..")
}

function binaryPath(name, devDir) {
    const file = process.platform === "win32" ? `${name}.exe` : name
    return app.isPackaged
        ? path.join(process.resourcesPath, file)
        : path.join(__dirname, devDir, file)
}

function freePort() {
    return new Promise((resolve, reject) => {
        const server = nodeNet.createServer()
        server.on("error", reject)
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address()
            server.close(() => resolve(port))
        })
    })
}

// Postgres if it is configured, otherwise a local file, so the app works with nothing provisioned.
function cloudEnv(port) {
    const env = { ...process.env, PORT: String(port) }
    if (!env.BLUEPRINT_DB_HOST) {
        env.BLUEPRINT_DB_SQLITE_PATH = path.join(getDataPath(), "cloud.sqlite")
    }
    return env
}

async function startCloudProcess() {
    const port = await freePort()
    cloudBaseUrl = `http://127.0.0.1:${port}`

    cloudProcess = spawn(binaryPath("cloud-api", "../noteblock-cloud-service/bin"), [], {
        stdio: ["ignore", "pipe", "pipe"],
        env: cloudEnv(port)
    })

    cloudProcess.on("error", (err) => {
        console.error("Failed to start cloud service:", err)
    })

    // Gin logs to stdout. It must never reach the JSON-lines parser, so both streams are
    // consumed here and neither is wired to the correlator.
    for (const stream of [cloudProcess.stdout, cloudProcess.stderr]) {
        if (!stream) continue
        stream.setEncoding("utf8")
        stream.on("data", (chunk) => console.error("[cloud-service]", chunk.trim()))
    }
}

function startBackendProcess() {
    goProcess = spawn(binaryPath("noteblock-server", "../noteblock-local-service/bin"), [], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
            ...process.env,
            NOTE_DB_PATH: getDataPath(),
            NOTEBLOCK_CLOUD_URL: cloudBaseUrl
        }
    })

    goProcess.on("error", (err) => {
        console.error("Failed to start Go backend:", err)
    })

    goProcess.on("exit", (code, signal) => {
        const err = new Error(`Local backend exited (code=${code}, signal=${signal})`)
        for (const [id, pending] of pendingRequests.entries()) {
            pending.reject(err)
            pendingRequests.delete(id)
        }
    })

    if (goProcess.stderr) {
        goProcess.stderr.setEncoding("utf8")
        goProcess.stderr.on("data", (chunk) => {
            console.error("[local-backend]", chunk.trim())
        })
    }

    wireBackendStdout()
}

function sendBackendRequest(method, params) {
    if (!goProcess || goProcess.killed || !goProcess.stdin) {
        throw new Error("Local backend process is not running")
    }

    const id = randomUUID()
    const request = { id, method, params }

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            pendingRequests.delete(id)
            reject(new Error(`IPC request timed out: ${method}`))
        }, 15000)

        pendingRequests.set(id, {
            resolve: (result) => {
                clearTimeout(timeout)
                resolve(result)
            },
            reject: (err) => {
                clearTimeout(timeout)
                reject(err)
            }
        })

        goProcess.stdin.write(`${JSON.stringify(request)}\n`)
    })
}

function registerLocalImageProtocol() {
    protocol.handle("noteblock-image", async (request) => {
        const url = new URL(request.url)
        const imageName = decodeURIComponent(url.pathname.replace(/^\/+/, ""))
        const safeName = path.basename(imageName)

        if (!safeName) {
            return new Response("Not Found", { status: 404 })
        }

        const filePath = path.join(getDataPath(), "uploads", "images", safeName)
        return net.fetch(pathToFileURL(filePath).toString())
    })
}

function registerRendererHandlers() {
    ipcMain.handle("local:call", async (_event, payload) => {
        if (!payload || typeof payload.method !== "string") {
            throw new Error("Invalid local IPC payload")
        }
        try {
            return await sendBackendRequest(payload.method, payload.params || {})
        } catch (err) {
            // Expected during debounced autosave when a block is already deleted.
            if (payload.method === "block.update" && err && err.code === "NOT_FOUND") {
                return null
            }
            throw err
        }
    })
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, "preload.js"),
        },
        title: "Noteblock",
        icon: path.join(__dirname, "../assets/icons/noteblock.png"),
    })

    if (app.isPackaged) {
        win.setMenu(null)
    }

    if (app.isPackaged) {
        const indexPath = path.join(__dirname, "../client/dist/index.html")
        win.loadFile(indexPath).catch((err) => {
            console.error("Failed to load index.html:", err)
        })
    } else {
        win.loadURL("http://localhost:5173").catch((err) => {
            console.error("Failed to load dev server:", err)
        })
    }
}

app.whenReady().then(async () => {
    registerLocalImageProtocol()
    // The sidecar needs the cloud url at spawn time, so the port has to be settled first.
    await startCloudProcess()
    startBackendProcess()
    registerRendererHandlers()
    createWindow()
})

// Best effort, never a durability mechanism: the edit is already committed locally and the
// next launch pushes it. A slow quit is a worse bug than a few seconds of staleness elsewhere.
function flushSync() {
    return Promise.race([
        sendBackendRequest("sync.flush", {})
            .then((result) => console.error("[shutdown] sync flush:", JSON.stringify(result)))
            .catch((err) => console.error("[shutdown] sync flush failed:", err.message)),
        new Promise((resolve) => setTimeout(() => {
            console.error("[shutdown] sync flush timed out, quitting anyway")
            resolve()
        }, SHUTDOWN_FLUSH_MS))
    ])
}

let quitting = false

app.on("before-quit", (event) => {
    if (quitting) return

    event.preventDefault()
    quitting = true

    flushSync().finally(() => {
        // Sidecar first: it is the thing that talks to the cloud service.
        if (goProcess && !goProcess.killed) goProcess.kill()
        if (cloudProcess && !cloudProcess.killed) cloudProcess.kill()
        app.quit()
    })
})

app.on("will-quit", () => {
    if (goProcess && !goProcess.killed) goProcess.kill()
    if (cloudProcess && !cloudProcess.killed) cloudProcess.kill()
})
