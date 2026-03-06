const { app, BrowserWindow, ipcMain, protocol, net } = require("electron")
const { spawn } = require("child_process")
const { randomUUID } = require("crypto")
const path = require("path")
const { pathToFileURL } = require("url")

let goProcess
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

function startBackendProcess() {
    const isWin = process.platform === "win32"
    const backendFile = isWin ? "noteblock-server.exe" : "noteblock-server"
    const backendPath = app.isPackaged
        ? path.join(process.resourcesPath, backendFile)
        : path.join(__dirname, "../noteblock-local-service/bin", backendFile)

    goProcess = spawn(backendPath, [], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
            ...process.env,
            NOTE_DB_PATH: app.getPath("userData")
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

        const filePath = path.join(app.getPath("userData"), "uploads", "images", safeName)
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

app.whenReady().then(() => {
    registerLocalImageProtocol()
    startBackendProcess()
    registerRendererHandlers()
    createWindow()
})

app.on("will-quit", () => {
    if (goProcess && !goProcess.killed) {
        goProcess.kill()
    }
})
