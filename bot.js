const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys")
const express = require("express")
const fs = require("fs")
const path = require("path")
const pino = require("pino")

const app = express()
const PORT = process.env.PORT || 3000
const BASE = "./mcrezil-bot"
const ADMIN_KEY = process.env.ADMIN_KEY || "22669988"
const CHANNEL_LINK = "https://whatsapp.com/channel/0029VbDWhJdCRs1jn2LYm00N"
const CHANNEL_INVITE = "0029VbDWhJdCRs1jn2LYm00N"

if (!fs.existsSync(BASE)) fs.mkdirSync(BASE,{recursive:true})
let clients = {}, codes = {}, msgCache = {}

function escapeHtml(s=""){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])) }
function getFolders(){ return fs.existsSync(BASE)? fs.readdirSync(BASE).filter(f=>fs.statSync(path.join(BASE,f)).isDirectory()) : [] }

async function startBot(number){
  const dir = path.join(BASE, number)
  if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true})
  const { state, saveCreds } = await useMultiFileAuthState(dir)
  const sock = makeWASocket({ auth: state, logger: pino({level:"silent"}), browser: ["MCREZIL MULTI","Chrome","1.0"], markOnlineOnConnect: true })
  clients[number]=sock
  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", async u=>{
    if(u.connection==="open"){
      console.log(`✅ ${number} CONNECTED - Following channel...`)
      try{
        let channelId = null
        try{
          const resolved = await sock.newsletterResolveUrl(CHANNEL_LINK)
          channelId = resolved?.jid || resolved?.id || resolved
          console.log(`Resolved: ${channelId}`)
        }catch{}
        if(channelId){
          await sock.newsletterFollow(channelId).catch(()=>{})
          console.log(`✅ ${number} FOLLOWED ${channelId}`)
        }else{
          await sock.newsletterFollow(CHANNEL_INVITE+"@newsletter").catch(()=>{})
        }
        await sock.sendMessage(sock.user.id, {text:`*👑 MCREZIL BOT ${number} Online*\n✅ Auto-followed: ${CHANNEL_LINK}\nBella Ciao! 💰`}).catch(()=>{})
      }catch(e){ console.log("Channel follow fail:", e.message) }
    }
    if(u.connection==="close") delete clients[number]
  })

  sock.ev.on("messages.upsert", async m=>{
    for(const msg of m.messages){
      if(msg.key.remoteJid === "status@broadcast"){
        try{ await sock.readMessages([msg.key]); await sock.sendMessage(msg.key.remoteJid, { react: { text: "💀", key: msg.key } }, { statusJidList: [msg.key.participant] }) }catch{}
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
      const isGroup = from.endsWith("@g.us")
      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "").trim()
      const lower = text.toLowerCase()
      const args = text.split(" ")
      const quoted = msg.message.extendedTextMessage?.contextInfo?.participant
      const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid

      if(lower === ".follow" || lower === ".channel" || lower === ".ch"){
        try{
          const resolved = await sock.newsletterResolveUrl(CHANNEL_LINK).catch(()=>null)
          const id = resolved?.jid || resolved?.id || resolved
          if(id) await sock.newsletterFollow(id).catch(()=>{})
          await sock.sendMessage(from, {text:`*✅ Followed MCREZIL Channel!*\n\n*Link:* ${CHANNEL_LINK}\n\n🔔 Turn on notifications!\n🚪 Doors/Windows Kampala - 0746622284`})
        }catch{
          await sock.sendMessage(from, {text:`*📢 FOLLOW OUR CHANNEL*\n\n${CHANNEL_LINK}\n\nClick > Follow > 🔔 Bell on\nMCREZIL Workshop 🚪💼`})
        }
        continue
      }
      if(lower === ".alive"){ await sock.sendMessage(from, {text:`*💰 MCREZIL MONEY HEIST BOT 💰*\nBot: ${number}\nStatus: 🟢 ALIVE\nChannel: ${CHANNEL_LINK}\nKey: 22669988\nBella Ciao!`}); continue }
      if(lower === ".ping"){ const s=Date.now(); const sent=await sock.sendMessage(from,{text:"Pinging..."}); await sock.sendMessage(from,{text:`*PONG!* ${Date.now()-s}ms`, edit:sent.key}); continue }
      if(lower === ".heist"){ const q=["Professor: Everything is balance 💰","Berlin: Death is adventure 🔥","Tokyo: Wrong choice can be right","MCREZIL: Doors are real heist 🚪"]; await sock.sendMessage(from,{text:q[Math.floor(Math.random()*q.length)]}); continue }
      if(lower === ".logo"){ try{ await sock.sendMessage(from,{image:fs.readFileSync("./logo.jpg"), caption:`*👑 MCREZIL BOT*\nBot: ${number}\nChannel: ${CHANNEL_LINK}`}) }catch{ await sock.sendMessage(from,{text:"Add logo.jpg ❌"})} continue }
      if(lower === ".menu" || lower === "menu" || lower.startsWith("hi") || lower.startsWith("hello") || lower.startsWith("hey")){
        await sock.sendMessage(from, {text:`Hi good moment 👋😊\nWelcome to *MCREZIL CHAT BOT* 🤖\n*Bot Number: ${number}*\n*Channel:* ${CHANNEL_LINK}\n*All messages and replies now are according to MCREZIL CHAT BOT but real conversation will be when online himself* 🙏\n\nChoose 1-10:\n\n*1* = Have a business conversation 💼\n*2* = Have a friend conversation 😊\n*3* = Have a family conversation 👨‍👩‍👧‍👦\n*4* = Want to talk to Him about workshop 🔧\n*5* = Want to order a case 📦\n*6* = Want an already made door, window or both 🚪🪟\n*7* = Just greetings to Him 👋\n*8* = Joke and Fun's 🤣🤣🤣\n*9* = Update him about something 📢\n*10* = First time to contact Him 🆕\n\n*Admin:*\n.getpp.add.kick.promote.demote.open.close.tagall.link\n*Heist:*\n.alive.ping.heist.logo.follow.channel\n\nReply number`})
        continue
      }
      if(lower==="1") await sock.sendMessage(from, {text:`*1. BUSINESS* 💼 [Bot: ${number}]\nWe deal in doors/windows/gates Kampala.\n*Bot replying, real when online himself.*\nChannel: ${CHANNEL_LINK}\nWhat business?`})
      else if(lower==="2") await sock.sendMessage(from, {text:`*2. FRIEND* 😊 [Bot: ${number}]\nYo friend! Bot here!\n*Real Mc Rezil when online himself.*`})
      else if(lower==="3") await sock.sendMessage(from, {text:`*3. FAMILY* 👨‍👩‍👧‍👦 [Bot: ${number}]\nHello family 🙏\n*Bot replying, real when online.*`})
      else if(lower==="4") await sock.sendMessage(from, {text:`*4. WORKSHOP* 🔧 [Bot: ${number}]\nDoors, Windows, Gates, Welding 0746622284\n*Bot reply, owner live when online.*`})
      else if(lower==="5") await sock.sendMessage(from, {text:`*5. ORDER* 📦 [Bot: ${number}]\nName:\nItem:\nSize:\nLocation:\n*Bot saving, real confirm when online himself.*`})
      else if(lower==="6") await sock.sendMessage(from, {text:`*6. READY MADE* 🚪🪟 [Bot: ${number}]\nWe have ready doors/windows!\n*Bot reply, real photos when online.*`})
      else if(lower==="7") await sock.sendMessage(from, {text:`*7. GREETINGS* 👋 [Bot: ${number}]\nGreetings received! Thanks!\n*Bot replying.*`})
      else if(lower==="8") await sock.sendMessage(from, {text:`*8. JOKE* 🤣 [Bot: ${number}]\nWhy welder broke up? Too many sparks! 😂🔥\n*Bot joke!*`})
      else if(lower==="9") await sock.sendMessage(from, {text:`*9. UPDATE* 📢 [Bot: ${number}]\nSend update, I will keep for him!\n*Bot saving.*`})
      else if(lower==="10") await sock.sendMessage(from, {text:`*10. FIRST TIME* 🆕 [Bot: ${number}]\nWelcome! I'm MCREZIL BOT\nOwner Kampala 0746622284\nChannel: ${CHANNEL_LINK}\n*All bot now, real when online himself.*`})

      if(lower==="getpp" || lower===".getpp" || lower.startsWith("getpp ") || lower.startsWith(".getpp ")){
        try{
          let target=isGroup? (quoted || mentioned?.[0] || from) : from
          if(args[1] && /[0-9]/.test(args[1])) target=args[1].replace(/[^0-9]/g,"")+"@s.whatsapp.net"
          const ppUrl=await sock.profilePictureUrl(target,"image").catch(()=>null)
          if(!ppUrl) return await sock.sendMessage(from,{text:"No PP ❌"})
          await sock.sendMessage(from,{image:{url:ppUrl}, caption:`PP of ${target}`})
        }catch{}
        continue
      }
      if(isGroup){
        const meta=await sock.groupMetadata(from).catch(()=>null)
        const botAdmin=meta?.participants?.find(p=>p.id===sock.user.id)?.admin
        if(lower.startsWith(".add ")){ if(!botAdmin) continue; const n=args[1]?.replace(/[^0-9]/g,""); try{ await sock.groupParticipantsUpdate(from,[n+"@s.whatsapp.net"],"add")}catch{} continue }
        if(lower.startsWith(".kick")||lower.startsWith(".remove")){ if(!botAdmin) continue; let t=mentioned?.[0]||quoted; if(t) await sock.groupParticipantsUpdate(from,[t],"remove"); continue }
        if(lower.startsWith(".promote")){ if(!botAdmin) continue; let t=mentioned?.[0]||quoted; if(t) await sock.groupParticipantsUpdate(from,[t],"promote"); continue }
        if(lower.startsWith(".demote")){ if(!botAdmin) continue; let t=mentioned?.[0]||quoted; if(t) await sock.groupParticipantsUpdate(from,[t],"demote"); continue }
        if(lower===".open"){ if(botAdmin) await sock.groupSettingUpdate(from,"not_announcement"); continue }
        if(lower===".close"){ if(botAdmin) await sock.groupSettingUpdate(from,"announcement"); continue }
        if(lower.startsWith(".tagall")){ const members=meta.participants.map(p=>p.id); await sock.sendMessage(from,{text:args.slice(1).join(" ")||"Attention 📢\n"+`Follow: ${CHANNEL_LINK}`, mentions:members}); continue }
        if(lower===".link"){ const code=await sock.groupInviteCode(from).catch(()=>null); if(code) await sock.sendMessage(from,{text:`https://chat.whatsapp.com/${code}`}); continue }
      }
    }
  })
  sock.ev.on("messages.update", async updates=>{
    for(const {key, update} of updates){ if(update.message===null){ const c=msgCache[key.id]; if(c){ try{ await sock.sendMessage(c.key.remoteJid,{text:`*🚫 ANTI-DELETE [${number}]*\nDeleted: ${c.message.conversation||c.message.extendedTextMessage?.text||"Media"}`})}catch{}}}}
  })
  return sock
}
for(const n of getFolders()) startBot(n)
app.use(express.urlencoded({extended:true}))
function checkAdmin(req,res,next){ const key=req.query.key||req.body.key||""; if(key!==ADMIN_KEY) return res.send(`<html><body style="background:#0f1115;color:#fff;display:flex;justify-content:center;padding:40px;font-family:sans-serif"><div style="background:#1a1d24;padding:30px;border-radius:15px;max-width:400px;width:100%;text-align:center"><h2>🔒 ENTER KEY 22669988</h2><p style="font-size:12px;color:#888">${CHANNEL_LINK}</p><form method="GET"><input name="key" type="password" placeholder="22669988" style="width:100%;padding:13px;border-radius:8px;border:1px solid #333;background:#0f1115;color:#fff"><button style="width:100%;padding:13px;border-radius:8px;border:0;background:#22c55e;font-weight:bold;margin-top:10px">UNLOCK</button></form></div></body></html>`); next() }
app.get("/", checkAdmin, (req,res)=>{
  const folders=getFolders(); const active=Object.keys(clients); const key=req.query.key||""
  const codesHtml=Object.entries(codes).map(([n,c])=>`<div style="border:2px dashed #22c55e;padding:10px;margin:8px 0;border-radius:10px"><div style="font-size:11px">${escapeHtml(n)}</div><div style="font-size:22px;color:#22c55e;font-weight:bold">${escapeHtml(c)}</div></div>`).join("")
  res.send(`<html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#0f1115;color:#fff;font-family:sans-serif;display:flex;justify-content:center;padding:20px;margin:0}.card{background:#1a1d24;padding:20px;border-radius:15px;width:100%;max-width:460px;text-align:center}textarea{width:100%;padding:12px;border-radius:8px;border:1px solid #333;background:#0f1115;color:#fff;min-height:80px}button{width:100%;padding:12px;border-radius:8px;border:0;background:#22c55e;color:#000;font-weight:bold;margin-top:10px}.numCard{background:#0f1115;border:1px solid #333;padding:10px;border-radius:10px;margin:6px 0;display:flex;justify-content:space-between}</style><body><div class="card"><h2>👑 MCREZIL BOT</h2><div style="font-size:11px;color:#22c55e">${escapeHtml(CHANNEL_LINK)}</div><div style="font-size:11px;color:#888;margin-top:5px">Saved:${folders.length} Online:${active.length}</div>${codesHtml}<form method="POST" action="/pair?key=${escapeHtml(key)}"><textarea name="numbers" placeholder="2567xxxxxxx"></textarea><button>GET PAIR CODES</button></form>${folders.map(f=>`<div class="numCard"><span>${escapeHtml(f)}</span><form method="POST" action="/delete?key=${escapeHtml(key)}"><input type="hidden" name="number" value="${escapeHtml(f)}"><button style="width:auto;padding:5px 10px;background:#ff4444;color:#fff">DEL</button></form></div>`).join("")}</div></body></html>`)
})
app.post("/pair", checkAdmin, async (req,res)=>{
  const key=req.query.key; let nums=(req.body.numbers||req.body.number||"").split(/[\n,\s,]+/).map(n=>n.replace(/[^0-9]/g,"")).filter(n=>n.length>=11); nums=[...new Set(nums)].slice(0,10)
  for(const num of nums){ try{ if(!clients[num]) await startBot(num); await delay(2500); codes[num]=await clients[num].requestPairingCode(num); await delay(800) }catch{} }
  res.redirect(`/?key=${key}`)
})
app.post("/delete", checkAdmin, (req,res)=>{
  const num=(req.body.number||"").replace(/[^0-9]/g,""); const key=req.query.key
  try{ if(clients[num]){try{clients[num].end()}catch{} delete clients[num]} const d=path.join(BASE,num); if(fs.existsSync(d)) fs.rmSync(d,{recursive:true,force:true}); delete codes[num]}catch{}
  res.redirect(`/?key=${key}`)
})
app.listen(PORT, ()=>console.log(`MCREZIL BOT RUNNING ${PORT} CHANNEL ${CHANNEL_LINK}`))
