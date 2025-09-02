const { app, BrowserWindow } = require("electron")
const { spawn } = require("child_process")
const path = require("path")

let goProcess

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    })

    const indexPath = path.join(__dirname, "../client/dist/index.html")
    win.loadFile(indexPath).catch(err => {
        console.error("Failed to load index.html:", err)
    })
}

app.whenReady().then(() => {
    const isWin = process.platform === "win32"
    const backendFile = isWin ? "noteblock-server.exe" : "noteblock-server"
    const backendPath = app.isPackaged
        ? path.join(process.resourcesPath, backendFile)
        : path.join(__dirname, "../noteblock-local-service/bin", backendFile)

    console.log("Backend path:", backendPath)

    goProcess = spawn(backendPath, [], {
        env: {
            ...process.env,
            NOTE_DB_PATH: app.getPath("userData")
        }
    })

    goProcess.on("error", err => {
        console.error("Failed to start Go backend:", err)
    })

    createWindow()
})

app.on("will-quit", () => {
    if (goProcess) goProcess.kill()
})
