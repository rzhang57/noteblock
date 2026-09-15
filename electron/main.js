const { app, BrowserWindow, dialog, ipcMain, protocol, net, safeStorage } = require("electron")
const { spawn } = require("child_process")
const nodeNet = require("net")
const { randomUUID } = require("crypto")
const fs = require("fs")
const path = require("path")
const {createStore} = require("./cloudConfig")
const {createCloudSetup} = require("./cloudSetup")
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

// The credential deliberately does not live under getDataPath(): in dev that is the repo itself,
// and an encrypted password has no business in a working tree.
const cloudConfig = createStore({
    fs,
    safeStorage,
    userDataPath: () => app.getPath("userData"),
    dataPath: getDataPath,
})

// Allocated once. If it moved per restart the sidecar would have to restart too just to learn the
// new url, taking local reads and writes down for a change that is purely about the cloud.
let cloudPort

function waitForExit(child, timeoutMs = 5000) {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()

    return new Promise((resolve) => {
        const done = () => {
            clearTimeout(timer)
            resolve()
        }
        const timer = setTimeout(done, timeoutMs)
        child.once("exit", done)
    })
}

async function restartCloud() {
    const old = cloudProcess
    cloudProcess = undefined
    if (old && !old.killed) {
        old.kill()
        // The replacement rebinds the same port, and the socket is not free until its previous
        // holder is actually gone: binding too early kills the new child on a correct config.
        await waitForExit(old)
    }

    await startCloudProcess()
}

async function startCloudProcess() {
    if (!cloudPort) cloudPort = await freePort()
    cloudBaseUrl = `http://127.0.0.1:${cloudPort}`

    const child = spawn(binaryPath("cloud-api", "../noteblock-cloud-service/bin"), [], {
        stdio: ["ignore", "pipe", "pipe"],
        env: cloudConfig.environment(cloudPort, process.env),
        // Never the directory the app happened to be launched from: the service reads .env from its
        // working directory, and a planted one could redirect image uploads elsewhere.
        cwd: getDataPath()
    })
    cloudProcess = child

    child.on("error", (err) => {
        console.error("Failed to start cloud service:", err)
    })

    // The service exits on a database it cannot open, and a stale handle here would make the next
    // restart think it still had something to kill.
    child.on("exit", (code) => {
        if (cloudProcess === child) cloudProcess = undefined
        console.error(`[cloud-service] exited (code=${code})`)
    })

    // Gin logs to stdout. It must never reach the JSON-lines parser, so both streams are
    // consumed here and neither is wired to the correlator.
    for (const stream of [child.stdout, child.stderr]) {
        if (!stream) continue
        stream.setEncoding("utf8")
        stream.on("data", (chunk) => console.error("[cloud-service]", chunk.trim()))
    }
}

function failPendingRequests(reason) {
    const err = new Error(reason)
    for (const [id, pending] of pendingRequests.entries()) {
        pending.reject(err)
        pendingRequests.delete(id)
    }
}

// Deliberately stopping the sidecar strands whatever was already written to its stdin: no response
// is ever coming, and waiting out the 15s timeout tells the user far too late.
function stopSidecar() {
    const old = goProcess
    goProcess = undefined
    if (old && !old.killed) old.kill()
    failPendingRequests("Local backend restarted before this request finished")
}

function startBackendProcess({resetCursors = false} = {}) {
    // Shared across generations: a half-line left by the previous sidecar would be glued to the
    // first chunk of the next one and parsed as garbage.
    responseBuffer = ""

    const child = spawn(binaryPath("noteblock-server", "../noteblock-local-service/bin"), [], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
            ...process.env,
            NOTE_DB_PATH: getDataPath(),
            NOTEBLOCK_CLOUD_URL: cloudBaseUrl,
            // Read once at startup, before the sync engine exists.
            ...(resetCursors ? {NOTEBLOCK_SYNC_RESET: "1"} : {})
        }
    })
    goProcess = child

    child.on("error", (err) => {
        console.error("Failed to start Go backend:", err)
    })

    child.on("exit", (code, signal) => {
        // Only the generation that died may fail requests: a replacement is already serving, and
        // rejecting its in-flight work would drop edits the user has just made.
        if (goProcess !== child) return

        failPendingRequests(`Local backend exited (code=${code}, signal=${signal})`)
    })

    if (child.stderr) {
        child.stderr.setEncoding("utf8")
        child.stderr.on("data", (chunk) => {
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

// Spawning is not connecting: the child exits when the database refuses it, so success is only
// reported once /health answers. Otherwise a typo shows as "Connected" and sync is silently dead.
async function cloudIsReachable() {
    for (let attempt = 0; attempt < 20; attempt++) {
        try {
            const res = await net.fetch(`${cloudBaseUrl}/health`)
            if (res.ok) return true
        } catch {
            // not listening yet
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
    }
    return false
}

// The renderer decides when to ask, never what the answer is: a script that reached this channel
// could otherwise point the whole library at a database of its choosing, and the cursor reset that
// follows is what makes the next push send every note there.
async function confirmDestination(event, message, detail) {
    const {response} = await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender), {
        type: "warning",
        buttons: ["Cancel", "Continue"],
        defaultId: 0,
        cancelId: 0,
        message,
        detail,
    })
    return response === 1
}

const cloudSetup = createCloudSetup({
    store: cloudConfig,
    confirm: confirmDestination,
    stopSidecar: async () => stopSidecar(),
    startSidecar: async (options) => startBackendProcess(options),
    restartCloud,
    isReachable: cloudIsReachable,
})

let setupChain = Promise.resolve()

// Serialised: two overlapping runs each kill what the other is about to replace, and the losers
// are left unreferenced - still running, still holding the same database, no longer killed on quit.
function serialiseSetup(run) {
    const done = setupChain.then(run)
    // The caller still sees the failure, but a rejected chain would skip every later run.
    setupChain = done.catch(() => {})
    return done
}

function registerRendererHandlers() {
    // The password crosses this boundary once, inbound. There is deliberately no read path back.
    ipcMain.handle("cloud:configure", (event, config) => serialiseSetup(() => cloudSetup.configure(config, event)))

    ipcMain.handle("cloud:status", () => cloudSetup.status())

    ipcMain.handle("cloud:clear", (event) => serialiseSetup(() => cloudSetup.clear(event)))

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
        // sendBackendRequest throws synchronously when the sidecar is gone, and this runs after
        // preventDefault: an escaping throw means app.quit() is never re-issued and the app
        // cannot be closed at all.
        Promise.resolve()
            .then(() => sendBackendRequest("sync.flush", {}))
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
