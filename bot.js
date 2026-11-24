const { default: makeWASocket, useMultiFileAuthState, delay, jidNormalizedUser } = require("@whiskeysockets/baileys")
const express = require("express")
const fs = require("fs")
const fsp = fs.promises
const path = require("path")
const pino = require("pino")

const app = express()
const PORT = Number(process.env.PORT) || 10000
const BASE = process.env.BOT_DATA_DIR || "./mcrezil-bot"
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
  get(key) { return this.map.get(key) }
}

const msgCache = new BoundedCache(500)

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
  }[char]))
}

function cleanNumber(value) {
  return typeof value === "string" ? value.replace(/[^0-9]/g, "") : ""
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
  if (!/^\d{10,15}$/.test(number)) throw new Error("Invalid phone number")

  const dir = path.join(BASE, number)
  await fsp.mkdir(dir, { recursive: true })
  const { state, saveCreds } = await useMultiFileAuthState(dir)

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["MCREZIL MULTI", "Chrome", "1.0"],
    markOnlineOnConnect: true,
    printQRInTerminal: false
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

    if (update.connection === "close") {
      console.log(`❌ ${number} CLOSED`)
      if (clients.get(number) === sock) clients.delete(number)
      codes.delete(number)
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
        const args = text.trim().split(/\s+/)
        const context = msg.message.extendedTextMessage?.contextInfo
        const quoted = context?.participant
        const mentioned = context?.mentionedJid

        msgCache.set(`${from}:${msg.key.id}`, {
          remoteJid: from,
          text: text || "[Media]"
        })

        if (lower === ".alive") {
          await sock.sendMessage(from, { text: `*👑 MCREZIL ALIVE*\nBot:${number}\nChannel:${CHANNEL_LINK}` })
          continue
        }

        if (lower.startsWith("hi") || lower.startsWith("hello") || lower === "menu") {
          await sock.sendMessage(from, { text:
            `Hi good moment 👋😊\nWelcome *MCREZIL BOT* 🤖\nBot:${number}\nChannel:${CHANNEL_LINK}\n\n*YOUR LIST:*\n1=Business 💼\n2=Friend 😊\n3=Family 👨‍👩‍👧‍👦\n4=Workshop 🔧\n5=Order 📦\n6=Ready door 🚪\n7=Greetings 👋\n8=Joke 🤣\n9=Update 📢\n10=First time 🆕\n\nGroup commands: .getpp .add .kick .remove .promote .tagall .link .open .close`
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
          let target
          if (isGroup) target = quoted || mentioned?.[0] || from
          else target = from
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
            if (/^\d{10,15}$/.test(targetNumber)) {
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

app.use(express.urlencoded({ extended: true }))
app.use(express.json())

app.get("/", (request, response) => response.status(404).send("404 - Use secret link"))

app.get(SECRET_PATH, async (request, response) => {
  const folders = await getFolders()
  const active = [...clients.keys()].filter(number => clients.has(number))
  const lastNum = typeof request.query.num === "string" ? cleanNumber(request.query.num) : ""
  const lastCode = codes.get(lastNum) || ""

  const botCards = folders.map(number => {
    const online = active.includes(number)
    return `<div class="numCard"><span>${escapeHtml(number)} <span class="${online ? "online" : ""}">${online ? "● ONLINE" : "○ OFFLINE"}</span></span>
      <form method="POST" action="${SECRET_PATH}/delete" style="margin:0;width:auto">
        <input type="hidden" name="number" value="${escapeHtml(number)}">
        <button type="submit" style="width:auto;padding:5px 10px;background:#ff4444;color:#fff">DEL</button>
      </form></div>`
  }).join("")

  const safeCode = JSON.stringify(lastCode).replace(/</g, "\\u003c")
  const safeNum = JSON.stringify(lastNum).replace(/</g, "\\u003c")

  response.send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{background:#0f1115;color:#fff;font-family:sans-serif;display:flex;justify-content:center;padding:20px;margin:0}.card{background:#1a1d24;padding:20px;border-radius:15px;width:100%;max-width:460px;text-align:center}input{width:100%;padding:14px;border-radius:10px;border:1px solid #333;background:#0f1115;color:#fff;box-sizing:border-box}button{width:100%;padding:13px;border-radius:10px;border:0;background:#22c55e;color:#000;font-weight:bold;margin-top:10px;cursor:pointer}.codeBox{border:2px dashed #22c55e;padding:18px;margin:12px 0;border-radius:12px;background:#0f1115}.codeTxt{font-size:30px;color:#22c55e;font-weight:bold;letter-spacing:4px}.numCard{background:#0f1115;border:1px solid #333;padding:10px;border-radius:10px;margin:6px 0;display:flex;justify-content:space-between;align-items:center;font-size:13px}.online{color:#22c55e}</style></head>
<body><div class="card"><h2>👑 MCREZIL SECRET</h2>
<div style="font-size:11px;color:#888">Saved:${folders.length} | Online:${active.length}</div>
<div style="font-size:10px;color:#22c55e;margin:6px 0">${escapeHtml(CHANNEL_LINK)}</div>
${lastCode ? `<div class="codeBox"><div style="font-size:11px;color:#aaa">🔔 POPUP ${escapeHtml(lastNum)}</div><div id="c" class="codeTxt">${escapeHtml(lastCode)}</div><div id="timer" style="font-size:12px;color:#ffcc00;margin:6px">Expires in 120s</div><button id="b" onclick="copyC()" type="button">COPY CODE</button></div>` : `<div style="color:#666;margin:12px;font-size:12px">No code - Add number below</div>`}
<form method="POST" action="${SECRET_PATH}/pair"><input name="number" inputmode="numeric" pattern="[0-9]{10,15}" placeholder="256746622284" required><button type="submit">GET CODE + POPUP 🔔</button></form>
<h3 style="text-align:left;font-size:12px;margin-top:16px">📱 YOUR BOTS:</h3>${botCards}
</div>
<script>
let codeVal=${safeCode}; let numVal=${safeNum};
function copyC(){if(!codeVal)return; if(navigator.clipboard) navigator.clipboard.writeText(codeVal).catch(()=>{}); const b=document.getElementById('b'); if(b)b.innerText='COPIED ✓ '+codeVal}
function sendPopup(){if(!codeVal)return;if(!('Notification' in window)){copyC();return}if(Notification.permission==='granted'){copyC();const n=new Notification('👑 MCREZIL CODE: '+codeVal,{body:'Open WhatsApp > Link device > Paste code. Number: '+numVal,requireInteraction:true});n.onclick=function(){window.focus();copyC();n.close();window.location.href='whatsapp://'}}else{Notification.requestPermission().then(permission=>{if(permission==='granted')sendPopup()})}}
window.onload=()=>{if(codeVal){copyC();setTimeout(sendPopup,1000)}};
</script></body></html>`)
})

app.post(`${SECRET_PATH}/pair`, async (request, response) => {
  const number = cleanNumber(request.body?.number)
  if (!/^\d{10,15}$/.test(number)) return response.redirect(SECRET_PATH)
  if (pairInProgress.get(number)) return response.redirect(`${SECRET_PATH}?num=${number}`)

  pairInProgress.set(number, true)
  try {
    await fsp.rm(path.join(BASE, number), { recursive: true, force: true })
    const sock = await startBot(number)
    await delay(1500)
    if (typeof sock.requestPairingCode !== "function") throw new Error("Pairing API unavailable")
    const code = await sock.requestPairingCode(number)
    if (!code) throw new Error("Pairing code was empty")

    codes.set(number, code)
    setTimeout(() => {
      if (codes.get(number) === code) codes.delete(number)
    }, 120000)
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
  if (!/^\d{10,15}$/.test(number)) return response.redirect(SECRET_PATH)

  const sock = clients.get(number)
  if (sock) {
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MCREZIL SECRET RUNNING on ${PORT} at ${SECRET_PATH}`)
})
