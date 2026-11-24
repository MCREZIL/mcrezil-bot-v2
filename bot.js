const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(process.env.PORT || 10000);
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  jidNormalizedUser
} = require("@whiskeysockets/baileys")
const express = require("express")
const fs = require("fs")
const fsp = fs.promises
const path = require("path")
const pino = require("pino")

const app = express()
const PORT = Number(process.env.PORT) || 10000
const BASE = path.resolve(process.env.BOT_DATA_DIR || "./mcrezil-bot")
const SECRET_PATH = process.env.ADMIN_PATH || "/mcrezil123"
const CHANNEL_LINK = "https://whatsapp.com/channel/0029VbDWhJdCRs1jn2LYm00N"

fs.mkdirSync(BASE, { recursive: true })

const clients = new Map()
const codes = new Map()
const pairInProgress = new Map()

class BoundedCache {
  constructor(limit = 500) {
    this.limit = limit
    this.map = new Map()
  }

  set(key, value) {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)
    if (this.map.size > this.limit) {
      this.map.delete(this.map.keys().next().value)
    }
  }

  get(key) {
    return this.map.get(key)
  }
}

const msgCache = new BoundedCache(500)

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char])
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
      .filter(entry => entry.isDirectory() && /^\d{10,15}$/.test(entry.name))
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

  sock.ev.on("connection.update", async update => {
    if (update.connection === "open") {
      console.log(`✅ ${number} CONNECTED`)
      try {
        if (typeof sock.newsletterResolveUrl === "function") {
          const resolved = await sock.newsletterResolveUrl(CHANNEL_LINK).catch(() => null)
          const jid = resolved?.jid || resolved?.id
          if (jid && typeof sock.newsletterFollow === "function") {
            await sock.newsletterFollow(jid).catch(() => {})
          }
        }
      } catch {}
    }

    if (update.connection === "close" && clients.get(number) === sock) {
      console.log(`❌ ${number} CLOSED`)
      clients.delete(number)
      codes.delete(number)
      pairInProgress.delete(number)
    }
  })

  sock.ev.on("messages.upsert", async event => {
    for (const msg of event.messages || []) {
      try {
        if (!msg?.key?.remoteJid || msg.key.remoteJid === "status@broadcast") continue
        if (!msg.message || msg.key.fromMe) continue

        const from = msg.key.remoteJid
        const isGroup = from.endsWith("@g.us")
        const text = (
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          msg.message.videoMessage?.caption ||
          ""
        ).trim()

        const lower = text.toLowerCase()
        const args = text.trim().split(/\s+/).filter(Boolean)
        const context = msg.message.extendedTextMessage?.contextInfo
        const quoted = context?.participant
        const mentioned = context?.mentionedJid

        msgCache.set(`${from}:${msg.key.id || Date.now()}`, {
          remoteJid: from,
          text: text || "[Media]"
        })

        if (lower === ".alive") {
          await sock.sendMessage(from, { text: `*👑 MCREZIL ALIVE*\nBot:${number}\nChannel:${CHANNEL_LINK}` })
          continue
        }

        if (lower.startsWith("hi") || lower.startsWith("hello") || lower === "menu") {
          await sock.sendMessage(from, { text:
            `Hi good moment 👋😊\nWelcome *MCREZIL BOT* 🤖\nBot:${number}\nChannel:${CHANNEL_LINK}\n\n*YOUR LIST:*\n1=Business 💼\n2=Friend 😊\n3=Family 👨‍👩‍👧‍👦\n4=Workshop 🔧\n5=Order 📦\n6=Ready Door 🚪\n7=Greetings 👋\n8=Joke 🤣\n9=Update 📢\n10=First Time 🆕`
          })
          continue
        }

        const menuReplies = {
          "1": `*1 BUSINESS* 💼 [${number}]\nDoors/windows/gates Kampala`,
          "2": `*2 FRIEND* 😊 [${number}] Yo bro what's up!`,
          "3": `*3 FAMILY* 👨‍👩‍👧‍👦 [${number}] Hello family ❤️`,
          "4": `*4 WORKSHOP* 🔧 [${number}] Mcrezil Workshop - 0746622284`,
          "5": `*5 ORDER* 📦 [${number}]\nName:\nItem:\nSize:\nLocation:\nPhone:`,
          "6": `*6 READY DOOR* 🚪 [${number}] Your doors ready!`,
          "7": `*7 GREETINGS* 👋 [${number}] Thanks boss!`,
          "8": `*8 JOKE* 🤣 Why did the welder break up? Too many sparks!`,
          "9": `*9 UPDATE* 📢 [${number}] Send your update boss`,
          "10": `*10 FIRST TIME* 🆕 [${number}] Welcome! Call 0746622284`
        }

        if (menuReplies[lower]) {
          await sock.sendMessage(from, { text: menuReplies[lower] })
          continue
        }

        if (lower === "getpp" || lower === ".getpp") {
          const target = isGroup ? (quoted || mentioned?.[0] || from) : from
          const pictureUrl = await sock.profilePictureUrl(target, "image").catch(() => null)
          await sock.sendMessage(from, pictureUrl
            ? { image: { url: pictureUrl }, caption: `PP of ${target}` }
            : { text: "No profile picture available" })
          continue
        }

        if (isGroup) {
          const meta = await sock.groupMetadata(from).catch(() => null)
          if (!meta) continue

          const botJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null
          const participant = botJid
            ? meta.participants?.find(person => jidNormalizedUser(person.id) === botJid)
            : null
          const admin = participant?.admin === "admin" || participant?.admin === "superadmin"

          if (lower.startsWith(".add") && admin) {
            const targetNumber = cleanNumber(args[1] || "")
            if (isValidNumber(targetNumber)) {
              await sock.groupParticipantsUpdate(from, [`${targetNumber}@s.whatsapp.net`], "add").catch(() => {})
            }
          } else if ((lower.startsWith(".kick") || lower.startsWith(".remove")) && admin) {
            const target = mentioned?.[0] || quoted
            if (target) await sock.groupParticipantsUpdate(from, [target], "remove").catch(() => {})
          } else if (lower.startsWith(".promote") && admin) {
            const target = mentioned?.[0] || quoted
            if (target) await sock.groupParticipantsUpdate(from, [target], "promote").catch(() => {})
          } else if (lower === ".open" && admin) {
            await sock.groupSettingUpdate(from, "not_announcement").catch(() => {})
          } else if (lower === ".close" && admin) {
            await sock.groupSettingUpdate(from, "announcement").catch(() => {})
          } else if (lower.startsWith(".tagall") && meta.participants) {
            await sock.sendMessage(from, {
              text: args.slice(1).join(" ") || "Attention 📢",
              mentions: meta.participants.map(person => person.id)
            }).catch(() => {})
          } else if (lower === ".link") {
            const inviteCode = await sock.groupInviteCode(from).catch(() => null)
            if (inviteCode) await sock.sendMessage(from, { text: `https://chat.whatsapp.com/${inviteCode}` }).catch(() => {})
          }
        }
      } catch (error) {
        console.error(`Message handler error for ${number}:`, error.message)
      }
    }
  })

  sock.ev.on("messages.update", async updates => {
    for (const { key, update } of updates || []) {
      if (update?.message === null) {
        const cached = msgCache.get(`${key.remoteJid}:${key.id}`)
        if (cached) {
          try {
            await sock.sendMessage(cached.remoteJid, {
              text: `*🚫 ANTI-DELETE [${number}]*\n${cached.text}`
            })
          } catch {}
        }
      }
    }
  })

  return sock
}

;(async () => {
  for (const number of await getFolders()) {
    try { await startBot(number) } catch (error) {
      console.error(`Could not start ${number}:`, error.message)
    }
  }
})().catch(error => console.error("Startup error:", error.message))

app.disable("x-powered-by")
app.use(express.urlencoded({ extended: true, limit: "32kb" }))
app.use(express.json({ limit: "32kb" }))

app.get("/", (request, response) => response.status(404).send("404 - Use secret link"))

app.get(SECRET_PATH, async (request, response) => {
  const folders = await getFolders()
  const active = [...clients.keys()].filter(number => clients.has(number))
  const lastNum = typeof request.query.num === "string" ? cleanNumber(request.query.num) : ""
  const lastCode = codes.get(lastNum) || ""

  const botCards = folders.map(number => {
    const online = active.includes(number)
    return `<div class="numCard"><span>${escapeHtml(number)} <span class="${online ? "online" : ""}">${online ? "● ONLINE" : "○ OFFLINE"}</span></span>
      <form method="POST" action="${escapeHtml(SECRET_PATH)}/delete" style="margin:0;width:auto">
        <input type="hidden" name="number" value="${escapeHtml(number)}">
        <button type="submit" class="deleteBtn">DEL</button>
      </form></div>`
  }).join("")

  const safeCode = JSON.stringify(lastCode).replace(/</g, "\\u003c")
  const safeNum = JSON.stringify(lastNum).replace(/</g, "\\u003c")

  response.send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MCREZIL SECRET</title>
<style>
:root{--green:#22c55e;--deep:#071713;--glass:rgba(10,28,23,.88)}
*{box-sizing:border-box}html,body{min-height:100%;margin:0}
body{overflow-x:hidden;color:#fff;font-family:system-ui,-apple-system,sans-serif;display:flex;justify-content:center;align-items:flex-start;padding:24px 12px;background:linear-gradient(155deg,#052018 0%,#064e3b 55%,#16a34a 100%)}
body:before,body:after{content:"";position:fixed;left:-10%;width:120%;height:240px;pointer-events:none;border-radius:45%;z-index:-1}
body:before{bottom:-105px;background:rgba(74,222,128,.28);box-shadow:0 -18px 55px rgba(134,239,172,.22);animation:wave 8s ease-in-out infinite alternate}
body:after{bottom:-135px;height:270px;background:rgba(5,150,105,.38);animation:wave2 11s ease-in-out infinite alternate}
@keyframes wave{to{transform:translateX(4%) translateY(-24px) rotate(2deg)}}@keyframes wave2{to{transform:translateX(-5%) translateY(-38px) rotate(-3deg)}}
.card{width:100%;max-width:430px;text-align:center;background:var(--glass);backdrop-filter:blur(16px);padding:24px;border-radius:22px;border:1px solid rgba(134,239,172,.22);box-shadow:0 24px 70px rgba(0,20,14,.45)}
h2{margin:0 0 8px}.stats{font-size:12px;color:#a7f3d0}.channel{font-size:11px;color:#86efac;margin:8px 0 12px;overflow-wrap:anywhere}
form{display:flex;flex-direction:column;gap:10px;margin:14px 0}input,button{font:inherit;border-radius:10px;border:0}input{width:100%;padding:13px;background:#edfdf4;color:#08291f;outline:2px solid transparent}input:focus{outline-color:#4ade80}button{padding:13px;width:100%;cursor:pointer;background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;font-weight:800}
.codeBox{margin:14px 0;padding:14px;border:1px solid rgba(74,222,128,.35);background:rgba(20,83,45,.38);border-radius:13px}.codeTxt{font-size:29px;font-weight:900;color:#86efac;letter-spacing:2px}.copyBtn{background:#ecfdf5;color:#14532d;width:auto;padding:9px 16px}.deleteBtn{width:auto!important;padding:5px 10px!important;background:#ef4444!important}
.numCard{display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px 8px 8px 12px;margin:8px 0}.online{color:#86efac}h3{text-align:left;font-size:13px;margin-top:18px}.channelHint{font-size:10px;color:#86efac}
</style></head>
<body><main class="card"><h2>👑 MCREZIL SECRET</h2>
<div class="stats">Saved:${folders.length} | Online:${active.length}</div>
<div class="channel">${escapeHtml(CHANNEL_LINK)}</div>
${lastCode ? `<div class="codeBox"><div class="channelHint">🔔 POPUP ${escapeHtml(lastNum)}</div><div id="c" class="codeTxt">${escapeHtml(lastCode)}</div><button id="b" class="copyBtn" type="button" onclick="copyC()">COPY CODE</button></div>` : ""}
<form method="POST" action="${escapeHtml(SECRET_PATH)}/pair"><input name="number" inputmode="numeric" pattern="[0-9]{10,15}" placeholder="256746622284" required><button type="submit">GET CODE + POPUP 🔔</button></form>
<h3>📱 YOUR BOTS:</h3>${botCards}
</main>
<script>
let codeVal=${safeCode}; const numVal=${safeNum};
function copyC(){if(!codeVal)return;if(navigator.clipboard)navigator.clipboard.writeText(codeVal).catch(()=>{});const b=document.getElementById('b');if(b)b.innerText='COPIED ✓ '+codeVal}
function sendPopup(){if(!codeVal)return;if(!('Notification' in window)){copyC();return}if(Notification.permission==='granted'){copyC();new Notification('👑 MCREZIL CODE: '+codeVal,{body:'Pair bot '+numVal})}else if(Notification.permission==='default')Notification.requestPermission().then(permission=>{if(permission==='granted')sendPopup()}).catch(()=>copyC())}
window.addEventListener('load',()=>{if(codeVal){copyC();setTimeout(sendPopup,1000)}});
</script></body></html>`)
})

app.post(`${SECRET_PATH}/pair`, async (request, response) => {
  const number = cleanNumber(request.body?.number)
  if (!isValidNumber(number)) return response.redirect(SECRET_PATH)
  if (pairInProgress.get(number)) return response.redirect(`${SECRET_PATH}?num=${number}`)

  pairInProgress.set(number, true)
  try {
    const dir = path.join(BASE, number)
    await fsp.rm(dir, { recursive: true, force: true })
    const sock = await startBot(number)
    await delay(1500)
    if (typeof sock.requestPairingCode !== "function") throw new Error("Pairing API unavailable")

    const code = await sock.requestPairingCode(number)
    if (!code) throw new Error("Pairing code was empty")

    codes.set(number, code)
    const timer = setTimeout(() => {
      if (codes.get(number) === code) codes.delete(number)
    }, 120000)
    timer.unref?.()
    console.log(`🔔 CODE ${number} -> ${code}`)
  } catch (error) {
    console.error("Pair fail:", error.message)
  } finally {
    pairInProgress.delete(number)
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
    if (clients.get(number) === sock) clients.delete(number)
  }
  await fsp.rm(path.join(BASE, number), { recursive: true, force: true }).catch(() => {})
  codes.delete(number)
  pairInProgress.delete(number)
  response.redirect(SECRET_PATH)
})

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

package.json

JSON
{
  "name": "mcrezil-bot-v2",
  "version": "1.0.0",
  "main": "bot.js",
  "type": "commonjs",
  "scripts": {
    "start": "node bot.js",
    "check": "node --check bot.js"
  },
  "dependencies": {
    "@whiskeysockets/baileys": "^6.7.18",
    "express": "4.18.2",
    "pino": "8.17.0"
  }
}
