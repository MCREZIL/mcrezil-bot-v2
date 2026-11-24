const express = require("express")
const fs = require("fs")
const fsp = fs.promises
const path = require("path")
const pino = require("pino")
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  jidNormalizedUser
} = require("@whiskeysockets/baileys")

const app = express()
const PORT = Number(process.env.PORT) || 10000
const BASE = path.resolve(process.env.BOT_DATA_DIR || "./mcrezil-bot")
const SECRET_PATH = process.env.ADMIN_PATH || "/mcrezil123"

fs.mkdirSync(BASE, { recursive: true })
app.disable("x-powered-by")
app.use(express.urlencoded({ extended: true, limit: "32kb" }))
app.use(express.json({ limit: "32kb" }))

const clients = new Map()
const pairingCodes = new Map()
const pairingInProgress = new Map()

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#039;",
    "\"": "&quot;"
  })[character])
}

function cleanNumber(value) {
  return typeof value === "string" ? value.replace(/[^0-9]/g, "") : ""
}

function isValidNumber(number) {
  return /^\d{10,15}$/.test(number)
}

async function getFolders() {
  try {
    const entries = await fsp.readdir(BASE, { withFileTypes: true })
    return entries
      .filter(entry => entry.isDirectory() && isValidNumber(entry.name))
      .map(entry => entry.name)
      .sort()
  } catch (error) {
    console.error("Could not read bot data:", error.message)
    return []
  }
}

async function startBot(number) {
  if (!isValidNumber(number)) throw new Error("Invalid phone number")

  const dir = path.join(BASE, number)
  await fsp.mkdir(dir, { recursive: true })
  const { state, saveCreds } = await useMultiFileAuthState(dir)

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["MCREZIL MULTI", "Chrome", "1.0"],
    markOnlineOnConnect: true,
    printQRInTerminal: false,
    syncFullHistory: false
  })

  const previous = clients.get(number)
  if (previous && previous !== sock) {
    try { previous.end(new Error("Replaced by a newer socket")) } catch {}
  }
  clients.set(number, sock)
  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", update => {
    if (update.connection === "open") {
      console.log(`✅ ${number} CONNECTED`)
    }
    if (update.connection === "close" && clients.get(number) === sock) {
      console.log(`❌ ${number} CLOSED`)
      clients.delete(number)
      pairingCodes.delete(number)
      pairingInProgress.delete(number)
    }
  })

  sock.ev.on("messages.upsert", async event => {
    for (const message of event.messages || []) {
      try {
        if (!message?.key?.remoteJid || message.key.fromMe) continue
        if (message.key.remoteJid === "status@broadcast") continue

        const text = (
          message.message?.conversation ||
          message.message?.extendedTextMessage?.text ||
          ""
        ).trim().toLowerCase()

        if (text === "alive" || text === ".alive") {
          await sock.sendMessage(message.key.remoteJid, {
            text: `👑 MCREZIL BOT ALIVE\nBot: ${number}`
          })
        }
      } catch (error) {
        console.error(`Message handler error for ${number}:`, error.message)
      }
    }
  })

  return sock
}

app.get("/health", (request, response) => {
  response.status(200).json({ ok: true })
})

app.get("/", (request, response) => {
  response.redirect(SECRET_PATH)
})

app.get(SECRET_PATH, async (request, response) => {
  const folders = await getFolders()
  const number = typeof request.query.num === "string" ? cleanNumber(request.query.num) : ""
  const code = pairingCodes.get(number) || ""

  const cards = folders.map(item => {
    const online = clients.has(item)
    return `<div>${escapeHtml(item)} — ${online ? "ONLINE" : "OFFLINE"}
      <form method="POST" action="${escapeHtml(SECRET_PATH)}/delete" style="display:inline">
        <input type="hidden" name="number" value="${escapeHtml(item)}">
        <button type="submit">Delete</button>
      </form></div>`
  }).join("")

  response.send(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MCREZIL SECRET</title></head>
<body style="font-family:system-ui;margin:30px">
<h2>👑 MCREZIL SECRET</h2>
<form method="POST" action="${escapeHtml(SECRET_PATH)}/pair">
<input name="number" inputmode="numeric" pattern="[0-9]{10,15}" placeholder="256746622284" required>
<button type="submit">Get pairing code</button>
</form>
${code ? `<h3>Pairing code: ${escapeHtml(code)}</h3>` : ""}
<h3>Saved bots</h3>${cards || "No saved bots"}
</body></html>`)
})

app.post(`${SECRET_PATH}/pair`, async (request, response) => {
  const number = cleanNumber(request.body?.number)
  if (!isValidNumber(number)) return response.redirect(SECRET_PATH)
  if (pairingInProgress.get(number)) return response.redirect(`${SECRET_PATH}?num=${number}`)

  pairingInProgress.set(number, true)
  try {
    await fsp.rm(path.join(BASE, number), { recursive: true, force: true })
    const sock = await startBot(number)
    await delay(1500)

    if (typeof sock.requestPairingCode !== "function") {
      throw new Error("Pairing API unavailable")
    }

    const code = await sock.requestPairingCode(number)
    if (!code) throw new Error("Pairing code was empty")

    pairingCodes.set(number, code)
    const timer = setTimeout(() => {
      if (pairingCodes.get(number) === code) pairingCodes.delete(number)
    }, 120000)
    timer.unref?.()
    console.log(`🔔 CODE ${number} -> ${code}`)
  } catch (error) {
    console.error("Pair fail:", error.message)
  } finally {
    pairingInProgress.delete(number)
  }

  response.redirect(`${SECRET_PATH}?num=${number}`)
})

app.post(`${SECRET_PATH}/delete`, async (request, response) => {
  const number = cleanNumber(request.body?.number)
  if (!isValidNumber(number)) return response.redirect(SECRET_PATH)

  const sock = clients.get(number)
  if (sock) {
    try { await sock.logout() } catch {}
    try { sock.end(new Error("Deleted by dashboard")) } catch {}
    clients.delete(number)
  }

  await fsp.rm(path.join(BASE, number), { recursive: true, force: true }).catch(() => {})
  pairingCodes.delete(number)
  pairingInProgress.delete(number)
  response.redirect(SECRET_PATH)
})

;(async () => {
  for (const number of await getFolders()) {
    try { await startBot(number) } catch (error) {
      console.error(`Could not start ${number}:`, error.message)
    }
  }
})().catch(error => console.error("Startup error:", error.message))

process.on("uncaughtException", error => console.error("Uncaught:", error.message))
process.on("unhandledRejection", error => console.error("Unhandled:", error?.message || error))

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`MCREZIL SECRET RUNNING on ${PORT} at ${SECRET_PATH}`)
})

function shutdown(signal) {
  console.log(`${signal} received; shutting down`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5000).unref()
}

process.once("SIGINT", () => shutdown("SIGINT"))
process.once("SIGTERM", () => shutdown("SIGTERM"))

module.exports = { app, startBot }
