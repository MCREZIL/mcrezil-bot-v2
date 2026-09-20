const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys")
const express = require("express")
const fs = require("fs")
const path = require("path")
const pino = require("pino")

const app = express()
const PORT = process.env.PORT || 3000
const BASE = "./mcrezil-bot"
const ADMIN_KEY = process.env.ADMIN_KEY || "22669988_@123"

if (!fs.existsSync(BASE)) fs.mkdirSync(BASE,{recursive:true})

let clients = {}
let codes = {} // {number: code}
let msgCache = {}

function escapeHtml(s=""){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])) }
function getFolders(){ return fs.existsSync(BASE)? fs.readdirSync(BASE).filter(f=>fs.statSync(path.join(BASE,f)).isDirectory()) : [] }

async function startBot(number){
  const dir = path.join(BASE, number)
  if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true})
  const { state, saveCreds } = await useMultiFileAuthState(dir)
  const sock = makeWASocket({
    auth: state,
    logger: pino({level:"silent"}),
    browser: ["MCREZIL MULTI","Chrome","1.0"],
    markOnlineOnConnect: true
  })
  clients[number]=sock
  sock.ev.on("creds.update", saveCreds)
  sock.ev.on("connection.update", u=>{
    if(u.connection==="open") console.log(`✅ ${number} CONNECTED - MULTI`)
    if(u.connection==="close") delete clients[number]
  })

  sock.ev.on("messages.upsert", async m=>{
    for(const msg of m.messages){
      if(msg.key.remoteJid === "status@broadcast"){
        try{
          await sock.readMessages([msg.key])
          await sock.sendMessage(msg.key.remoteJid, { react: { text: "💀", key: msg.key } }, { statusJidList: [msg.key.participant] })
        }catch{}
        continue
      }
      if(!msg.message || msg.key.fromMe) continue
      msgCache[msg.key.id]=msg
      let vo = msg.message.viewOnceMessageV2?.message || msg.message.viewOnceMessage?.message
      if(vo){
        const cap = vo.imageMessage?.caption || vo.videoMessage?.caption || "ViewOnce"
        try{
          await sock.sendMessage(msg.key.remoteJid, {text:`*👁️ VIEW ONCE OPENED [${number}]*\n${cap}`})
          if(vo.imageMessage) await sock.sendMessage(msg.key.remoteJid, {image: vo.imageMessage, caption: cap})
          if(vo.videoMessage) await sock.sendMessage(msg.key.remoteJid, {video: vo.videoMessage, caption: cap})
        }catch{}
      }
      const from = msg.key.remoteJid
      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim()
      const lower = text.toLowerCase()
      if(lower.startsWith("hi") || lower.startsWith("hello") || lower.startsWith("hey") || lower==="menu"){
        await sock.sendMessage(from, {text:`Hi good moment 👋😊\nWelcome to *MCREZIL CHAT BOT* 🤖\n*Bot Number: ${number}*\n\nChoose 1-10:\n*1* = Business 💼\n*2* = Friend 😊\n*3* = Family 👨‍👩‍👧‍👦\n*4* = Workshop 🔧\n*5* = Order 📦\n*6* = Ready door/window 🚪\n*7* = Greetings 👋\n*8* = Joke 🤣\n*9* = Update 📢\n*10* = First time 🆕\n\nReply number`})
        continue
      }
      if(lower==="1") await sock.sendMessage(from, {text:`*1. BUSINESS* 💼 [Bot: ${number}]\nWe deal in doors/windows/gates Kampala.`})
      else if(lower==="2") await sock.sendMessage(from, {text:`*2. FRIEND* 😊 [Bot: ${number}]\nYo friend! Bot here!`})
      else if(lower==="3") await sock.sendMessage(from, {text:`*3. FAMILY* 👨‍👩‍👧‍👦 [Bot: ${number}]\nHello family 🙏`})
      else if(lower==="4") await sock.sendMessage(from, {text:`*4. WORKSHOP* 🔧 [Bot: ${number}]\nDoors, Windows, Gates, Welding 0746622284`})
      else if(lower==="5") await sock.sendMessage(from, {text:`*5. ORDER* 📦 [Bot: ${number}]\nName:\nItem:\nSize:\nLocation:`})
      else if(lower==="6") await sock.sendMessage(from, {text:`*6. READY MADE* 🚪🪟 [Bot: ${number}]\nWe have ready doors/windows!`})
      else if(lower==="7") await sock.sendMessage(from, {text:`*7. GREETINGS* 👋 [Bot: ${number}]\nGreetings received!`})
      else if(lower==="8") await sock.sendMessage(from, {text:`*8. JOKE* 🤣 [Bot: ${number}]\nWhy welder broke up? Too many sparks! 😂🔥`})
      else if(lower==="9") await sock.sendMessage(from, {text:`*9. UPDATE* 📢 [Bot: ${number}]\nSend update, I will keep for him!`})
      else if(lower==="10") await sock.sendMessage(from, {text:`*10. FIRST TIME* 🆕 [Bot: ${number}]\nWelcome! Owner Kampala 0746622284`})
    }
  })
  sock.ev.on("messages.update", async updates=>{
    for(const {key, update} of updates){
      if(update.message===null){
        const c=msgCache[key.id]
        if(c){
          try{ await sock.sendMessage(c.key.remoteJid, {text:`*🚫 ANTI-DELETE [${number}]*\nDeleted: ${c.message.conversation||c.message.extendedTextMessage?.text||"Media"}`}) }catch{}
        }
      }
    }
  })
  return sock
}

for(const n of getFolders()) startBot(n)

app.use(express.urlencoded({extended:true}))
function checkAdmin(req,res,next){
  const key = req.query.key || req.body.key || req.headers['x-admin-key'] || ""
  if(key!== ADMIN_KEY){
    return res.send(`<html><body style="background:#0f1115;color:#fff;font-family:sans-serif;display:flex;justify-content:center;padding:40px"><div style="background:#1a1d24;padding:30px;border-radius:15px;max-width:400px;width:100%;text-align:center"><h2>🔒 ADMIN LOCKED</h2><form method="GET"><input name="key" type="password" placeholder="Enter Admin Key" style="width:100%;padding:13px;border-radius:8px;border:1px solid #333;background:#0f1115;color:#fff"><button style="width:100%;padding:13px;border-radius:8px;border:0;background:#22c55e;color:#000;font-weight:bold;margin-top:10px">UNLOCK</button></form></div></body></html>`)
  }
  next()
}

app.get("/", checkAdmin, (req,res)=>{
  const folders=getFolders()
  const active=Object.keys(clients)
  const key = req.query.key || ""
  // show all pairing codes
  const allCodesHtml = Object.keys(codes).length? Object.entries(codes).map(([num,code])=>`
    <div class="codeBox"><div style="font-size:12px;color:#aaa">${escapeHtml(num)}</div><div class="codeText">${escapeHtml(code)}</div><button class="copyBtn" onclick="navigator.clipboard.writeText('${escapeHtml(code)}')">COPY</button></div>
  `).join("") : ""

  res.send(`<html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#0f1115;color:#fff;font-family:sans-serif;display:flex;justify-content:center;padding:20px;margin:0}.card{background:#1a1d24;padding:20px;border-radius:15px;width:100%;max-width:460px;text-align:center}textarea{width:100%;padding:13px;border-radius:8px;border:1px solid #333;background:#0f1115;color:#fff;box-sizing:border-box;min-height:90px}input{width:100%;padding:13px;border-radius:8px;border:1px solid #333;background:#0f1115;color:#fff;box-sizing:border-box}button{width:100%;padding:13px;border-radius:8px;border:0;background:#22c55e;color:#000;font-weight:bold;margin-top:10px;cursor:pointer}.codeBox{border:2px dashed #22c55e;padding:18px 10px;margin:12px 0;border-radius:12px;position:relative}.codeText{font-size:26px;color:#22c55e;font-weight:bold;letter-spacing:3px}.copyBtn{position:absolute;top:6px;right:6px;font-size:11px;padding:6px 12px;background:#fff;color:#000;width:auto;margin:0;border-radius:6px}.del{background:#ff4444;color:#fff;font-size:11px;margin-top:8px;padding:8px}.numCard{background:#0f1115;border:1px solid #333;padding:10px;border-radius:10px;margin:8px 0;display:flex;justify-content:space-between;align-items:center;font-size:13px}.online{color:#22c55e}.offline{color:#ff5555}</style><body><div class="card"><h2>👑 MCREZIL MULTI-BOT</h2><div style="font-size:11px;color:#888;margin-bottom:12px">Total Saved: ${folders.length} | Online: ${active.length} | Codes: ${Object.keys(codes).length}</div>${allCodesHtml || `<div style="color:#666;font-size:12px">No pairing codes yet</div>`}<form method="POST" action="/pair?key=${escapeHtml(key)}"><textarea name="numbers" placeholder="Add many numbers at once:\n2567622xxxx\n256704xxxxxx\n2567xxxxxxx\nor comma: 2567xxxx,2567yyyy"></textarea><button>GET PAIR CODES FOR ALL NUMBERS</button></form><h3 style="text-align:left;font-size:13px;margin-top:18px">📱 YOUR BOT NUMBERS:</h3>${folders.map(f=>{const isOn=active.includes(f);return `<div class="numCard"><span>${escapeHtml(f)} <span class="${isOn?'online':'offline'}">${isOn?'● ONLINE':'○ OFFLINE'}</span></span><form method="POST" action="/delete?key=${escapeHtml(key)}" style="margin:0;width:auto"><input type="hidden" name="number" value="${escapeHtml(f)}"><button class="del" style="width:auto;padding:5px 10px;margin:0">DEL</button></form></div>`}).join("")}<div style="font-size:9px;color:#555;margin-top:12px">Admin Protected + Multi Pairing</div></div></body></html>`)
})

// MULTI NUMBER PAIRING LOGIC
app.post("/pair", checkAdmin, async (req,res)=>{
  const key = req.query.key
  let raw = req.body.numbers || req.body.number || ""
  let nums = raw.split(/[\n,\s]+/).map(n=>n.replace(/\D/g,"")).filter(n=>n.length>=11 && n.length<=15)
  nums = [...new Set(nums)] // remove duplicates

  if(nums.length===0) return res.redirect(`/?key=${key}`)
  if(nums.length>10) nums = nums.slice(0,10) // limit 10 at once to avoid ban

  for(const num of nums){
    try{
      if(!clients[num]) await startBot(num)
      await delay(2000)
      const c = await clients[num].requestPairingCode(num)
      codes[num]=c
      console.log(`Code for ${num}: ${c}`)
      await delay(1000)
    }catch(e){ console.log(`Failed ${num}:`, e.message) }
  }
  res.redirect(`/?key=${key}`)
})

app.post("/delete", checkAdmin, (req,res)=>{
  const num=(req.body.number||"").replace(/\D/g,"")
  const key = req.query.key
  try{ if(clients[num]){try{clients[num].end()}catch{} delete clients[num]} const d=path.join(BASE,num); const safeBase=path.resolve(BASE); const safePath=path.resolve(d); if(safePath.startsWith(safeBase) && fs.existsSync(d)) fs.rmSync(d,{recursive:true,force:true}); delete codes[num]}catch{}
  res.redirect(`/?key=${key}`)
})

app.listen(PORT, ()=>console.log(`MULTI BOT + MULTI PAIRING + ADMIN KEY on ${PORT}`))
