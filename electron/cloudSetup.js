const {validate, maskedHost} = require("./cloudConfig")

const SENDS_EVERYTHING =
    "Every note and folder on this device will be sent to that database, and whatever is already there will be merged into this device."
const BACK_TO_LOCAL =
    "This device goes back to local storage. Nothing is deleted from the database, and nothing is deleted from this device."

// The sequence, away from Electron so it can be tested: which of these steps happens before which
// is the whole correctness of the feature, and every ordering mistake here is silent.
function createCloudSetup({store, confirm, stopSidecar, startSidecar, restartCloud, isReachable}) {
    async function revert(previous) {
        try {
            if (previous) store.write(previous)
            else store.clear()
            await restartCloud()
        } finally {
            // Unconditional: putting the old database back can fail on its own, and an app left
            // with no sidecar cannot read or write a single note.
            await startSidecar({resetCursors: false})
        }
    }

    async function configure(config, context) {
        validate(config)

        if (!(await confirm(context, `Sync this device to ${maskedHost(config.host)}?`, SENDS_EVERYTHING))) {
            return store.status()
        }

        const previous = store.read()

        // Stopped before the cloud service changes database: a pass running in that window would
        // push a partial library to the new database under cursors that describe the old one.
        await stopSidecar()

        try {
            // Inside the try: a machine with no secure storage throws here, and the sidecar is
            // already down.
            store.write(config)
            await restartCloud()
            if (!(await isReachable())) {
                throw new Error("The database did not accept the connection. Check the host, password and TLS settings.")
            }
        } catch (err) {
            // Nothing is left pointing at a database that never answered - including the cursors,
            // which have not been touched yet.
            await revert(previous)
            throw err
        }

        await startSidecar({resetCursors: true})
        return store.status()
    }

    async function clear(context) {
        const previous = store.read()
        if (!previous) return store.status()

        if (!(await confirm(context, `Stop syncing to ${maskedHost(previous.host)}?`, BACK_TO_LOCAL))) {
            return store.status()
        }

        await stopSidecar()
        store.clear()
        await restartCloud()
        await startSidecar({resetCursors: true})
        return store.status()
    }

    return {configure, clear, status: () => store.status()}
}

module.exports = {createCloudSetup}
