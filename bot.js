const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys")
const express = require("express")
const fs = require("fs")
const path = require("path")
const pino = require("pino")

const app = express()
const PORT = process.env.PORT || 3000
const BASE = "./mcrezil-bot"
const ADMIN_KEY = process.env.ADMIN_KEY || "22669988"

if (!fs.existsSync(BASE)) fs.mkdirSync(BASE,{recursive:true})

let clients = {}
let codes = {}
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
    if(u.connection==="open") console.log(`✅ ${number} CONNECTED`)
    if(u.connection==="close") delete clients[number]
  })

  sock.ev.on("messages.upsert", async m=>{
    for(const msg of m.messages){
      if(msg.key.remoteJid === "status@broadcast"){
        try{
          await sock.readMessages([msg.key])
          await sock.sendMessage(msg.key.remoteJid, { react: { text: "💀", key: msg.key } }, { statusJidList: [msg.key.participant] })
        }catch{} continue
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
      const isGroup = from.endsWith("@g.us")
      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "").trim()
      const lower = text.toLowerCase()
      const args = text.split(" ")
      const quoted = msg.message.extendedTextMessage?.contextInfo?.participant
      const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid

      if(lower === "getpp" || lower === ".getpp"){
        try{
          let target = isGroup? (quoted || mentioned?.[0] || from) : from
          if(args[1] && /[0-9]/.test(args[1])) target = args[1].replace(/[^0-9]/g,"") + "@s.whatsapp.net"
          const ppUrl = await sock.profilePictureUrl(target, "image").catch(()=>null)
          if(!ppUrl) return await sock.sendMessage(from, {text:"No pp ❌"})
          await sock.sendMessage(from, {image:{url:ppUrl}, caption:`*PP of ${target}*`})
        }catch{ await sock.sendMessage(from, {text:"Failed to get pp"}) }
        continue
      }

      if(isGroup){
        const groupMeta = await sock.groupMetadata(from).catch(()=>null)
        const botIsAdmin = groupMeta?.participants?.find(p=>p.id===sock.user.id)?.admin
        if(lower.startsWith(".add")){
          if(!botIsAdmin) { await sock.sendMessage(from, {text:"Bot must be admin ❌"}); continue }
          const numToAdd = args[1]?.replace(/[^0-9]/g,"")
          if(!numToAdd) { await sock.sendMessage(from, {text:"Use:.add 2567xxxx"}); continue }
          try{ await sock.groupParticipantsUpdate(from, [numToAdd+"@s.whatsapp.net"], "add"); await sock.sendMessage(from, {text:`Added ${numToAdd} ✅`}) }catch(e){ await sock.sendMessage(from, {text:"Failed: "+e.message}) }
          continue
        }
        if(lower.startsWith(".kick") || lower.startsWith(".remove")){
          if(!botIsAdmin) continue
          let target = mentioned?.[0] || quoted
          if(!target) continue
          try{ await sock.groupParticipantsUpdate(from, [target], "remove"); await sock.sendMessage(from, {text:"Removed ✅"}) }catch{}
          continue
        }
        if(lower.startsWith(".promote")){
          if(!botIsAdmin) continue
          let target = mentioned?.[0] || quoted
          if(!target) continue
          await sock.groupParticipantsUpdate(from, [target], "promote"); await sock.sendMessage(from, {text:"Promoted ✅"})
          continue
        }
        if(lower.startsWith(".demote")){
          if(!botIsAdmin) continue
          let target = mentioned?.[0] || quoted
          if(!target) continue
          await sock.groupParticipantsUpdate(from, [target], "demote"); await sock.sendMessage(from, {text:"Demoted"})
          continue
        }
        if(lower === ".open"){ if(botIsAdmin) await sock.groupSettingUpdate(from, "not_announcement"); await sock.sendMessage(from, {text:"Group opened 🔓"}); continue }
        if(lower === ".close"){ if(botIsAdmin) await sock.groupSettingUpdate(from, "announcement"); await sock.sendMessage(from, {text:"Group closed 🔒"}); continue }
        if(lower.startsWith(".tagall")){ const members = groupMeta.participants.map(p=>p.id); await sock.sendMessage(from, {text: args.slice(1).join(" ") || "Attention 📢", mentions:members}); continue }
        if(lower === ".link"){ const code = await sock.groupInviteCode(from).catch(()=>null); await sock.sendMessage(from, {text: code? `https://chat.whatsapp.com/${code}` : "No link"}); continue }
      }

      if(lower.startsWith("hi") || lower.startsWith("hello") || lower==="menu"){
        await sock.sendMessage(from, {text:`Hi good moment 👋😊\nWelcome to *MCREZIL CHAT BOT* 🤖\n*Bot Number: ${number}*\n\n*All messages and replies now are according to MCREZIL CHAT BOT but real conversation will be when online himself* 🙏\n\nChoose 1-10:\n*1* = Have a business conversation 💼\n*2* = Have a friend conversation 😊\n*3* = Have a family conversation 👨‍👩‍👧‍👦\n*4* = Want to talk to Him about workshop 🔧\n*5* = Want to order a case 📦\n*6* = Want an already made door, window or both 🚪🪟\n*7* = Just greetings to Him 👋\n*8* = Joke and Fun's 🤣🤣🤣\n*9* = Update him about something 📢\n*10* = First time to contact Him 🆕\n\nReply number`})
        continue
      }
      if(lower==="1") await sock.sendMessage(from, {text:`*1. BUSINESS* 💼 [${number}]\nDoors/windows/gates Kampala.\n*Bot replying, real when online himself.*`})
      else if(lower==="2") await sock.sendMessage(from, {text:`*2. FRIEND* 😊 [${number}]\nYo friend! Bot here!\n*Real Mc Rezil when online.*`})
      else if(lower==="3") await sock.sendMessage(from, {text:`*3. FAMILY* 👨‍👩‍👧‍👦 [${number}]\nHello family 🙏 *Bot replying.*`})
      else if(lower==="4") await sock.sendMessage(from, {text:`*4. WORKSHOP* 🔧 [${number}]\nDoors, Windows, Gates 0746622284\n*Bot reply, owner live when online.*`})
      else if(lower==="5") await sock.sendMessage(from, {text:`*5. ORDER* 📦 [${number}]\nName:\nItem:\nSize:\nLocation:\n*Bot saving, real confirm when online.*`})
      else if(lower==="6") await sock.sendMessage(from, {text:`*6. READY MADE* 🚪🪟 [${number}]\nWe have ready doors/windows!`})
      else if(lower==="7") await sock.sendMessage(from, {text:`*7. GREETINGS* 👋 [${number}]\nGreetings received!`})
      else if(lower==="8") await sock.sendMessage(from, {text:`*8. JOKE* 🤣 [${number}]\nWhy welder broke up? Too many sparks! 😂`})
      else if(lower==="9") await sock.sendMessage(from, {text:`*9. UPDATE* 📢 [${number}]\nSend update, I keep for him!`})
      else if(lower==="10") await sock.sendMessage(from, {text:`*10. FIRST TIME* 🆕 [${number}]\nWelcome! I'm MCREZIL BOT 0746622284\n*All bot now, real when online himself.*`})
    }
  })

  sock.ev.on("messages.update", async updates=>{
    for(const {key, update} of updates){
      if(update.message===null){
        const c=msgCache[key.id]
        if(c){ try{ await sock.sendMessage(c.key.remoteJid, {text:`*🚫 ANTI-DELETE [${number}]*\nDeleted: ${c.message.conversation||c.message.extendedTextMessage?.text||"Media"}`}) }catch{} }
      }
    }
  })
  return sock
}

for(const n of getFolders()) startBot(n)

app.use(express.urlencoded({extended:true}))
function checkAdmin(req,res,next){
  const key = req.query.key || req.body.key || ""
  if(key!== ADMIN_KEY){
    return res.send(`<html><body style="background:#0f1115;color:#fff;font-family:sans-serif;display:flex;justify-content:center;padding:40px"><div style="background:#1a1d24;padding:30px;border-radius:15px;max-width:400px;width:100%;text-align:center"><h2>🔒 ADMIN</h2><form method="GET"><input name="key" type="password" placeholder="22669988" style="width:100%;padding:13px;border-radius:8px;border:1px solid #333;background:#0f1115;color:#fff"><button style="width:100%;padding:13px;border-radius:8px;border:0;background:#22c55e;margin-top:10px;font-weight:bold">UNLOCK</button></form></div></body></html>`)
  }
  next()
}

app.get("/", checkAdmin, (req,res)=>{
  const folders=getFolders()
  const active=Object.keys(clients)
  const key=req.query.key||""
  const num=req.query.num||""
  const code=codes[num]||""
  res.send(`<html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#0f1115;color:#fff;font-family:sans-serif;display:flex;justify-content:center;padding:20px;margin:0}.card{background:#1a1d24;padding:20px;border-radius:15px;width:100%;max-width:460px;text-align:center}input{width:100%;padding:13px;border-radius:8px;border:1px solid #333;background:#0f1115;color:#fff;box-sizing:border-box}button{width:100%;padding:13px;border-radius:8px;border:0;background:#22c55e;color:#000;font-weight:bold;margin-top:10px;cursor:pointer}.codeBox{border:2px dashed #22c55e;padding:20px;margin:12px 0;border-radius:12px;position:relative}.codeText{font-size:28px;color:#22c55e;font-weight:bold;letter-spacing:3px}.copyBtn{position:absolute;top:6px;right:6px;font-size:11px;padding:6px 12px;background:#fff;color:#000;width:auto;margin:0;border-radius:6px}.numCard{background:#0f1115;border:1px solid #333;padding:10px;border-radius:10px;margin:8px 0;display:flex;justify-content:space-between;align-items:center;font-size:13px}.online{color:#22c55e}.offline{color:#ff5555}</style><script>function copyCode(){const t=document.getElementById('pairCode').innerText;navigator.clipboard.writeText(t);const b=document.getElementById('copyBtn');b.innerText='COPIED ✓';setTimeout(()=>b.innerText='COPY',2000)}</script><body><div class="card"><h2>👑 MCREZIL MULTI</h2><div style="font-size:11px;color:#888">Saved: ${folders.length} | Online: ${active.length} | Add ONE at a time</div>${code?`<div class="codeBox"><div id="pairCode" class="codeText">${escapeHtml(code)}</div><button id="copyBtn" class="copyBtn" onclick="copyCode()">COPY</button></div><div style="font-size:11px">For: ${escapeHtml(num)}</div>`:`<div style="color:#666;font-size:12px;margin:10px">No code - add number below</div>`}<form method="POST" action="/pair?key=${escapeHtml(key)}"><input name="number" placeholder="256746622284" required><button>GET PAIR CODE (ONE NUMBER)</button></form><h3 style="text-align:left;font-size:13px;margin-top:18px">📱 YOUR BOT NUMBERS (MULTI HOLD):</h3>${folders.map(f=>{const isOn=active.includes(f);return `<div class="numCard"><span>${escapeHtml(f)} <span class="${isOn?'online':'offline'}">${isOn?'● ONLINE':'○ OFFLINE'}</span></span><form method="POST" action="/delete?key=${escapeHtml(key)}" style="margin:0;width:auto"><input type="hidden" name="number" value="${escapeHtml(f)}"><button style="width:auto;padding:5px 10px;background:#ff4444;color:#fff;border-radius:6px;border:0">DEL</button></form></div>`}).join("")}</div></body></html>`)
})

// FIXED: ONE NUMBER AT A TIME
app.post("/pair", checkAdmin, async (req,res)=>{
  const key=req.query.key
  let num=(req.body.number||"").replace(/[^0-9]/g,"")
  if(num.length<11) return res.redirect(`/?key=${key}`)
  try{
    if(!clients[num]) await startBot(num)
    await delay(3000)
    const c=await clients[num].requestPairingCode(num)
    codes[num]=c
    res.redirect(`/?key=${key}&num=${num}`)
  }catch(e){ console.log(e); res.redirect(`/?key=${key}&num=${num}`) }
})

app.post("/delete", checkAdmin, (req,res)=>{
  const num=(req.body.number||"").replace(/[^0-9]/g,"")
  const key=req.query.key
  try{ if(clients[num]){try{clients[num].end()}catch{} delete clients[num]} const d=path.join(BASE,num); if(fs.existsSync(d)) fs.rmSync(d,{recursive:true,force:true}); delete codes[num]}catch{}
  res.redirect(`/?key=${key}`)
})
app.listen(PORT, ()=>console.log(`MCREZIL MULTI ONE-BY-ONE on ${PORT}`))
