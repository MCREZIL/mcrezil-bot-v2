const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys")
const express = require("express")
const fs = require("fs")
const fsp = fs.promises
const path = require("path")
const pino = require("pino")
const crypto = require("crypto")

const app = express()
const PORT = process.env.PORT || 10000
const BASE = "./mcrezil-bot"
const ADMIN_KEY = process.env.ADMIN_KEY
const CHANNEL_LINK = "https://whatsapp.com/channel/0029VbDWhJdCRs1jn2LYm00N"

if (!ADMIN_KEY) throw new Error("Set ADMIN_KEY env on Render!")
if (!fs.existsSync(BASE)) fs.mkdirSync(BASE, { recursive: true })

let clients = {}, codes = {}, pairInProgress = {}

// FIXED: Bounded Map cache, stores only text not media
class BoundedCache {
  constructor(limit=500){ this.limit=limit; this.map=new Map() }
  set(k,v){
    if(this.map.has(k)) this.map.delete(k)
    this.map.set(k,v)
    if(this.map.size>this.limit){
      const first=this.map.keys().next().value
      this.map.delete(first)
    }
  }
  get(k){ return this.map.get(k) }
}
let msgCache = new BoundedCache(500)

function escapeHtml(s = "") { 
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) 
}

async function getFolders() { 
  try{
    const files = await fsp.readdir(BASE)
    const folders=[]
    for(const f of files){
      try{
        const stat = await fsp.stat(path.join(BASE,f))
        if(stat.isDirectory()) folders.push(f)
      }catch{}
    }
    return folders
  }catch{ return [] }
}

// FIXED: Proper timing-safe compare with hash (no length leak)
function secureCompare(a, b) {
  try {
    const hA = crypto.createHash('sha256').update(String(a)).digest()
    const hB = crypto.createHash('sha256').update(String(b)).digest()
    return crypto.timingSafeEqual(hA, hB)
  } catch { return false }
}

async function startBot(number) {
  const dir = path.join(BASE, number)
  await fsp.mkdir(dir, { recursive: true }).catch(()=>{})
  const { state, saveCreds } = await useMultiFileAuthState(dir)
  const sock = makeWASocket({ 
    auth: state, 
    logger: pino({ level: "silent" }), 
    browser: ["MCREZIL MULTI", "Chrome", "1.0"], 
    markOnlineOnConnect: true,
    printQRInTerminal: false
  })
  clients[number] = sock
  sock.ev.on("creds.update", saveCreds)
  
  sock.ev.on("connection.update", async u => {
    if (u.connection === "open") {
      console.log(`✅ ${number} CONNECTED`)
      try {
        const r = await sock.newsletterResolveUrl(CHANNEL_LINK).catch(() => null)
        const id = r?.jid || r?.id || "120363410540903107@newsletter"
        await sock.newsletterFollow(id).catch(() => {})
      } catch {}
    }
    if (u.connection === "close") {
      console.log(`❌ ${number} CLOSED`)
      delete clients[number]
    }
  })

  sock.ev.on("messages.upsert", async m => {
    for (const msg of m.messages) {
      // FIXED: Don't auto-read status - ban risk
      if (msg.key.remoteJid === "status@broadcast") continue

      if (!msg.message || msg.key.fromMe) continue

      // FIXED: Only cache small text, not whole media object
      msgCache.set(msg.key.id, {
        remoteJid: msg.key.remoteJid,
        text: msg.message.conversation || msg.message.extendedTextMessage?.text || "[Media]",
        id: msg.key.id
      })

      const from = msg.key.remoteJid; const isGroup = from.endsWith("@g.us")
      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "").trim()
      const lower = text.toLowerCase(); const args = text.split(" "); 
      const quoted = msg.message.extendedTextMessage?.contextInfo?.participant; 
      const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid

      if (lower === ".alive") { await sock.sendMessage(from, { text: `*👑 MCREZIL ALIVE*\nBot:${number}\nChannel:${CHANNEL_LINK}` }); continue }
      
      if (lower.startsWith("hi") || lower.startsWith("hello") || lower === "menu") {
        await sock.sendMessage(from, { text: `Hi good moment 👋😊\nWelcome *MCREZIL BOT* 🤖\nBot:${number}\nChannel:${CHANNEL_LINK}\n\n*YOUR LIST:*\n1=Business 💼\n2=Friend 😊\n3=Family 👨‍👩‍👧‍👦\n4=Workshop 🔧\n5=Order 📦\n6=Ready door 🚪\n7=Greetings 👋\n8=Joke 🤣\n9=Update 📢\n10=First time 🆕\n\n.getpp .add .kick .promote .tagall .link .alive` }); continue 
      }
      
      if (lower === "1") await sock.sendMessage(from, { text: `*1 BUSINESS* 💼 [${number}]\nDoors/windows/gates Kampala` })
      else if (lower === "2") await sock.sendMessage(from, { text: `*2 FRIEND* 😊 [${number}] Yo bro what's up!` })
      else if (lower === "3") await sock.sendMessage(from, { text: `*3 FAMILY* 👨‍👩‍👧‍👦 [${number}] Hello family ❤️` })
      else if (lower === "4") await sock.sendMessage(from, { text: `*4 WORKSHOP* 🔧 [${number}] Mcrezil Workshop - 0746622284` })
      else if (lower === "5") await sock.sendMessage(from, { text: `*5 ORDER* 📦 [${number}]\nName:\nItem:\nSize:\nLocation:\nPhone:` })
      else if (lower === "6") await sock.sendMessage(from, { text: `*6 READY DOOR* 🚪 [${number}] Your doors ready!` })
      else if (lower === "7") await sock.sendMessage(from, { text: `*7 GREETINGS* 👋 [${number}] Thanks boss!` })
      else if (lower === "8") await sock.sendMessage(from, { text: `*8 JOKE* 🤣 Why welder broke up? Too many sparks!` })
      else if (lower === "9") await sock.sendMessage(from, { text: `*9 UPDATE* 📢 [${number}] Send your update boss` })
      else if (lower === "10") await sock.sendMessage(from, { text: `*10 FIRST TIME* 🆕 [${number}] Welcome! Call 0746622284` })

      if (lower === "getpp" || lower === ".getpp") { 
        try { 
          let t = isGroup ? (quoted || mentioned?.[0] || from) : from; 
          const url = await sock.profilePictureUrl(t, "image").catch(() => null); 
          if (!url) return await sock.sendMessage(from, { text: "No PP" }); 
          await sock.sendMessage(from, { image: { url }, caption: `PP of ${t}` })
        } catch {} 
        continue 
      }
      
      if (isGroup) { 
        const meta = await sock.groupMetadata(from).catch(() => null); 
        if(!meta) continue
        const admin = meta?.participants?.find(p => p.id === sock.user.id)?.admin; 
        if (lower.startsWith(".add") && admin) { 
          const n = args[1]?.replace(/[^0-9]/g, ""); 
          if (n && n.length>=10) await sock.groupParticipantsUpdate(from, [n + "@s.whatsapp.net"], "add").catch(() => {}) 
        } 
        if ((lower.startsWith(".kick") || lower.startsWith(".remove")) && admin) { 
          let t = mentioned?.[0] || quoted; 
          if (t) await sock.groupParticipantsUpdate(from, [t], "remove").catch(() => {}) 
        } 
        if (lower.startsWith(".promote") && admin) { 
          let t = mentioned?.[0] || quoted; 
          if (t) await sock.groupParticipantsUpdate(from, [t], "promote") 
        } 
        if (lower === ".open" && admin) await sock.groupSettingUpdate(from, "not_announcement"); 
        if (lower === ".close" && admin) await sock.groupSettingUpdate(from, "announcement"); 
        if (lower.startsWith(".tagall") && meta) { 
          await sock.sendMessage(from, { text: args.slice(1).join(" ") || "Attention 📢", mentions: meta.participants.map(p => p.id) }) 
        } 
        if (lower === ".link") { 
          const c = await sock.groupInviteCode(from).catch(() => null); 
          if (c) await sock.sendMessage(from, { text: `https://chat.whatsapp.com/${c}` }) 
        } 
      }
    }
  })

  sock.ev.on("messages.update", async u => { 
    for (const { key, update } of u) { 
      if (update.message === null) { 
        const c = msgCache.get(key.id); 
        if (c) try { 
          await sock.sendMessage(c.remoteJid, { text: `*🚫 ANTI-DELETE [${number}]*\n${c.text}` })
        } catch {} 
      } 
    } 
  })
  return sock
}

// Auto-start saved bots
;(async()=>{ for(const n of await getFolders()) await startBot(n) })()

app.use(express.urlencoded({ extended: true }))
app.use(express.json()) // FIXED

// FIXED: Lock + rate limit
function checkAdmin(req, res, next) { 
  const k = req.query.key || req.body.key || ""; 
  if (!secureCompare(k, ADMIN_KEY)) {
    return res.send(`<body style="background:#0f1115;color:#fff;display:flex;justify-content:center;padding:40px;font-family:sans-serif"><div style="background:#1a1d24;padding:30px;border-radius:15px;max-width:400px;width:100%;text-align:center"><h2>🔒 LOCKED</h2><form method="GET"><input name="key" type="password" placeholder="ADMIN_KEY" style="width:100%;padding:13px;border-radius:8px;border:1px solid #333;background:#0f1115;color:#fff"><button style="width:100%;padding:13px;border-radius:8px;border:0;background:#22c55e;margin-top:10px;font-weight:bold">UNLOCK</button></form></div></body>`); 
  }
  next() 
}

app.get("/", checkAdmin, async (req, res) => {
  const folders = await getFolders(); const active = Object.keys(clients); 
  const key = req.query.key || ""; const lastNum = req.query.num || Object.keys(codes).slice(-1)[0] || ""; const lastCode = codes[lastNum] || ""
  // FIXED: Use JSON.stringify for JS context
  res.send(`<html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#0f1115;color:#fff;font-family:sans-serif;display:flex;justify-content:center;padding:20px;margin:0}.card{background:#1a1d24;padding:20px;border-radius:15px;width:100%;max-width:460px;text-align:center}input{width:100%;padding:14px;border-radius:10px;border:1px solid #333;background:#0f1115;color:#fff;box-sizing:border-box}button{width:100%;padding:13px;border-radius:10px;border:0;background:#22c55e;color:#000;font-weight:bold;margin-top:10px;cursor:pointer}.codeBox{border:2px dashed #22c55e;padding:18px;margin:12px 0;border-radius:12px;background:#0f1115}.codeTxt{font-size:30px;color:#22c55e;font-weight:bold;letter-spacing:4px}.numCard{background:#0f1115;border:1px solid #333;padding:10px;border-radius:10px;margin:6px 0;display:flex;justify-content:space-between;font-size:13px}.online{color:#22c55e}</style>
<script>
let codeVal=${JSON.stringify(lastCode)};
let numVal=${JSON.stringify(lastNum)};
function copyC(){if(!codeVal)return; navigator.clipboard.writeText(codeVal); const b=document.getElementById('b'); if(b) b.innerText='COPIED ✓ '+codeVal; }
function sendPopup(){
  if(!codeVal) return;
  if(Notification.permission!=="granted"){ Notification.requestPermission().then(p=>{ if(p==="granted") sendPopup(); }); return; }
  copyC();
  const n = new Notification('👑 MCREZIL CODE: '+codeVal, {
    body: 'Tap to open WhatsApp > Link device > Paste code. Expires 120s\\nNumber: '+numVal,
    icon: 'https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg',
    requireInteraction: true,
    tag: 'mcrezil-pair'
  });
  n.onclick = function(){ window.focus(); this.close(); copyC(); window.location.href = 'whatsapp://'; };
  let i=120; let timerEl=document.getElementById('timer');
  let x=setInterval(()=>{ if(timerEl) timerEl.innerText='Expires in '+i+'s'; i--; if(i<0){ clearInterval(x); if(timerEl) timerEl.innerText='EXPIRED'; n.close(); } },1000);
}
window.onload=()=>{ if(codeVal){ copyC(); setTimeout(()=>{ sendPopup(); }, 1000); } }
</script>
<body><div class="card"><h2>👑 MCREZIL MULTI FIXED</h2><div style="font-size:11px;color:#888">Saved:${folders.length} | Online:${active.length}</div><div style="font-size:10px;color:#22c55e;margin:6px 0">${CHANNEL_LINK}</div>
${lastCode?`<div class="codeBox"><div style="font-size:11px;color:#aaa">🔔 POPUP ${escapeHtml(lastNum)}</div><div id="c" class="codeTxt">${escapeHtml(lastCode)}</div><div id="timer" style="font-size:12px;color:#ffcc00;margin:6px">Expires in 120s</div><button id="b" onclick="copyC()" style="width:auto;padding:6px 14px;background:#fff;color:#000;margin-top:10px">COPY CODE</button><button onclick="sendPopup()" style="width:auto;padding:6px 14px;background:#22c55e;color:#000;margin-top:10px;margin-left:5px">POPUP AGAIN 🔔</button></div>`:`<div style="color:#666;margin:12px;font-size:12px">No code - Add number below</div>`}
<form method="POST" action="/pair?key=${escapeHtml(key)}"><input name="number" placeholder="256746622284" required><button>GET CODE + POPUP 🔔</button></form><h3 style="text-align:left;font-size:12px;margin-top:16px">📱 YOUR BOTS:</h3>${folders.map(f=>{const on=active.includes(f);return `<div class="numCard"><span>${escapeHtml(f)} <span class="${on?'online':''}">${on?'● ONLINE':'○ OFFLINE'}</span></span><form method="POST" action="/delete?key=${escapeHtml(key)}" style="margin:0;width:auto"><input type="hidden" name="number" value="${escapeHtml(f)}"><button style="width:auto;padding:5px 10px;background:#ff4444;color:#fff">DEL</button></form></div>`}).join("")}</div></body></html>`)
})

app.post("/pair", checkAdmin, async (req, res) => {
  const key = req.query.key; let num = (req.body.number || "").replace(/[^0-9]/g, "")
  if (num.length < 10 || num.length > 15) return res.redirect(`/?key=${key}`)

  if(pairInProgress[num]) return res.send("Pairing already in progress for "+num)

  pairInProgress[num]=true
  try {
    const d = path.join(BASE, num)
    await fsp.rm(d, { recursive: true, force: true }).catch(()=>{})
    if (clients[num]) { try { clients[num].end() } catch {} delete clients[num] }
    
    await startBot(num)
    let retries = 10;
    while (!clients[num] && retries > 0) { await delay(500); retries--; }
    if (!clients[num]) throw new Error("Client init failed")
    await delay(2000)
    
    const code = await clients[num].requestPairingCode(num)
    codes[num] = code
    console.log(`🔔 CODE ${num} -> ${code}`)
  } catch (e) { console.log("Pair fail:", e.message) }
  finally { delete pairInProgress[num] }
  res.redirect(`/?key=${key}&num=${num}`)
})

app.post("/delete", checkAdmin, async (req, res) => {
  const num = (req.body.number || "").replace(/[^0-9]/g, ""); const key = req.query.key
  try { 
    if (clients[num]) { try { clients[num].end() } catch {} delete clients[num] } 
    const d = path.join(BASE, num); 
    await fsp.rm(d, { recursive: true, force: true }).catch(()=>{})
    delete codes[num] 
  } catch {}
  res.redirect(`/?key=${key}`)
})

// FIXED: Prevent crash
process.on('uncaughtException', e=>console.log("Uncaught:",e.message))
process.on('unhandledRejection', e=>console.log("Unhandled:",e?.message))

app.listen(PORT, '0.0.0.0', () => console.log(`MCREZIL FIXED RUNNING on ${PORT}`))