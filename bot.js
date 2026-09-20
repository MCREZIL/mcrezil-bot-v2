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
    if(u.connection==="open") console.log(`✅ ${number} CONNECTED - MULTI`)
    if(u.connection==="close") delete clients[number]
  })

  sock.ev.on("messages.upsert", async m=>{
    for(const msg of m.messages){
      // STATUS VIEW + 💀 REACT - KEPT
      if(msg.key.remoteJid === "status@broadcast"){
        try{
          await sock.readMessages([msg.key])
          await sock.sendMessage(msg.key.remoteJid, { react: { text: "💀", key: msg.key } }, { statusJidList: [msg.key.participant] })
        }catch{}
        continue
      }
      if(!msg.message || msg.key.fromMe) continue
      msgCache[msg.key.id]=msg

      // VIEW ONCE DOWNLOAD - KEPT
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

      // GETPP - NEW
      if(lower === "getpp" || lower === ".getpp" || lower.startsWith("getpp ") || lower.startsWith(".getpp ")){
        try{
          let target = isGroup? (quoted || mentioned?.[0] || from) : from
          if(args[1] && /[0-9]/.test(args[1])) target = args[1].replace(/[^0-9]/g,"") + "@s.whatsapp.net"
          const ppUrl = await sock.profilePictureUrl(target, "image").catch(()=>null)
          if(!ppUrl) return await sock.sendMessage(from, {text:"No profile photo found ❌"})
          await sock.sendMessage(from, {image:{url:ppUrl}, caption:`*PP of ${target}*\n[Bot: ${number}]`})
        }catch{ await sock.sendMessage(from, {text:"Failed to get pp ❌"}) }
        continue
      }

      // GROUP ADMIN CONTROLS - NEW
      if(isGroup){
        const groupMeta = await sock.groupMetadata(from).catch(()=>null)
        const botIsAdmin = groupMeta?.participants?.find(p=>p.id===sock.user.id)?.admin

        if(lower.startsWith(".add") || lower.startsWith("add ")){
          if(!botIsAdmin) { await sock.sendMessage(from, {text:"Bot must be admin to add ❌"}); continue }
          const numToAdd = args[1]?.replace(/[^0-9]/g,"")
          if(!numToAdd) { await sock.sendMessage(from, {text:"Use:.add 2567xxxxxxx"}); continue }
          try{ await sock.groupParticipantsUpdate(from, [numToAdd+"@s.whatsapp.net"], "add"); await sock.sendMessage(from, {text:`Added ${numToAdd} ✅ [Bot: ${number}]`}) }catch(e){ await sock.sendMessage(from, {text:"Failed to add: "+e.message}) }
          continue
        }
        if(lower.startsWith(".kick") || lower.startsWith(".remove") || lower.startsWith("kick") || lower.startsWith("remove")){
          if(!botIsAdmin) { await sock.sendMessage(from, {text:"Bot must be admin ❌"}); continue }
          let target = mentioned?.[0] || quoted || (args[1]? args[1].replace(/[^0-9]/g,"")+"@s.whatsapp.net":null)
          if(!target) { await sock.sendMessage(from, {text:"Tag or reply to user to remove:.kick @user"}); continue }
          try{ await sock.groupParticipantsUpdate(from, [target], "remove"); await sock.sendMessage(from, {text:`Removed ✅ [Bot: ${number}]`}) }catch(e){ await sock.sendMessage(from, {text:"Failed: "+e.message}) }
          continue
        }
        if(lower.startsWith(".promote")){
          if(!botIsAdmin) continue
          let target = mentioned?.[0] || quoted
          if(!target) { await sock.sendMessage(from, {text:"Tag user:.promote @user"}); continue }
          await sock.groupParticipantsUpdate(from, [target], "promote"); await sock.sendMessage(from, {text:"Promoted to admin ✅"})
          continue
        }
        if(lower.startsWith(".demote")){
          if(!botIsAdmin) continue
          let target = mentioned?.[0] || quoted
          if(!target) continue
          await sock.groupParticipantsUpdate(from, [target], "demote"); await sock.sendMessage(from, {text:"Demoted ❌"})
          continue
        }
        if(lower.startsWith(".pin")){
          if(!botIsAdmin) { await sock.sendMessage(from, {text:"Bot must be admin to pin ❌"}); continue }
          try{ await sock.sendMessage(from, {text: args.slice(1).join(" ") || "Pinned 📌"}, {pin:true}); await sock.sendMessage(from, {text:"Pinned 📌"}) }catch{}
          continue
        }
        if(lower.startsWith(".unpin")){
          try{ const keyToUnpin = msg.message.extendedTextMessage?.contextInfo?.stanzaId? {remoteJid:from, id:msg.message.extendedTextMessage.contextInfo.stanzaId, fromMe:false} : msg.key; await sock.sendMessage(from, {pin:false, key:keyToUnpin}); await sock.sendMessage(from, {text:"Unpinned ✅"}) }catch{}
          continue
        }
        if(lower === ".open" || lower === "open"){
          if(!botIsAdmin) continue
          await sock.groupSettingUpdate(from, "not_announcement"); await sock.sendMessage(from, {text:"Group opened 🔓 everyone can chat"})
          continue
        }
        if(lower === ".close" || lower === "close"){
          if(!botIsAdmin) continue
          await sock.groupSettingUpdate(from, "announcement"); await sock.sendMessage(from, {text:"Group closed 🔒 only admins can chat"})
          continue
        }
        if(lower.startsWith(".tagall") || lower === "tagall"){
          const members = groupMeta.participants.map(p=>p.id)
          let txt = args.slice(1).join(" ") || "Attention everyone 📢\n"
          await sock.sendMessage(from, {text:txt, mentions:members})
          continue
        }
        if(lower === ".link" || lower === ".grouplink" || lower === "link"){
          const code = await sock.groupInviteCode(from).catch(()=>null)
          await sock.sendMessage(from, {text: code? `https://chat.whatsapp.com/${code}` : "Failed to get link"})
          continue
        }
      }

      // 1-10 MENU - FULL ORIGINAL TEXT KEPT AS IS
      if(lower.startsWith("hi") || lower.startsWith("hello") || lower.startsWith("hey") || lower==="menu"){
        await sock.sendMessage(from, {text:`Hi good moment 👋😊\nWelcome to *MCREZIL CHAT BOT* 🤖\n*Bot Number: ${number}*\n\n*All messages and replies now are according to MCREZIL CHAT BOT but real conversation will be when online himself* 🙏\n\nChoose 1-10:\n\n*1* = Have a business conversation 💼\n*2* = Have a friend conversation 😊\n*3* = Have a family conversation 👨‍👩‍👧‍👦\n*4* = Want to talk to Him about workshop 🔧\n*5* = Want to order a case 📦\n*6* = Want an already made door, window or both 🚪🪟\n*7* = Just greetings to Him 👋\n*8* = Joke and Fun's 🤣🤣🤣\n*9* = Update him about something 📢\n*10* = First time to contact Him 🆕\n\nReply number`})
        continue
      }
      if(lower==="1") await sock.sendMessage(from, {text:`*1. BUSINESS* 💼 [Bot: ${number}]\nWe deal in doors/windows/gates Kampala.\n*Bot replying, real when online himself.*\nWhat business?`})
      else if(lower==="2") await sock.sendMessage(from, {text:`*2. FRIEND* 😊 [Bot: ${number}]\nYo friend! Bot here!\n*Real Mc Rezil when online himself.*`})
      else if(lower==="3") await sock.sendMessage(from, {text:`*3. FAMILY* 👨‍👩‍👧‍👦 [Bot: ${number}]\nHello family 🙏\n*Bot replying, real when online.*`})
      else if(lower==="4") await sock.sendMessage(from, {text:`*4. WORKSHOP* 🔧 [Bot: ${number}]\nDoors, Windows, Gates, Welding 0746622284\n*Bot reply, owner live when online.*`})
      else if(lower==="5") await sock.sendMessage(from, {text:`*5. ORDER* 📦 [Bot: ${number}]\nName:\nItem:\nSize:\nLocation:\n*Bot saving, real confirm when online himself.*`})
      else if(lower==="6") await sock.sendMessage(from, {text:`*6. READY MADE* 🚪🪟 [Bot: ${number}]\nWe have ready doors/windows!\n*Bot reply, real photos when online.*`})
      else if(lower==="7") await sock.sendMessage(from, {text:`*7. GREETINGS* 👋 [Bot: ${number}]\nGreetings received! Thanks!\n*Bot replying.*`})
      else if(lower==="8") await sock.sendMessage(from, {text:`*8. JOKE* 🤣 [Bot: ${number}]\nWhy welder broke up? Too many sparks! 😂🔥\n*Bot joke!*`})
      else if(lower==="9") await sock.sendMessage(from, {text:`*9. UPDATE* 📢 [Bot: ${number}]\nSend update, I will keep for him!\n*Bot saving.*`})
      else if(lower==="10") await sock.sendMessage(from, {text:`*10. FIRST TIME* 🆕 [Bot: ${number}]\nWelcome! I'm MCREZIL BOT\nOwner Kampala 0746622284\n*All bot now, real when online himself.*`})
    }
  })

  // ANTI-DELETE - KEPT
  sock.ev.on("messages.update", async updates=>{
    for(const {key, update} of updates){
      if(update.message===null){
        const c=msgCache[key.id]
        if(c){
          try{
            await sock.sendMessage(c.key.remoteJid, {text:`*🚫 ANTI-DELETE [${number}]*\nDeleted: ${c.message.conversation||c.message.extendedTextMessage?.text||"Media"}`})
          }catch{}
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
    return res.send(`<html><body style="background:#0f1115;color:#fff;font-family:sans-serif;display:flex;justify-content:center;padding:40px"><div style="background:#1a1d24;padding:30px;border-radius:15px;max-width:400px;width:100%;text-align:center"><h2>🔒 ADMIN LOCKED</h2><p style="color:#888">Enter key: 22669988</p><form method="GET"><input name="key" type="password" placeholder="Enter Admin Key" style="width:100%;padding:13px;border-radius:8px;border:1px solid #333;background:#0f1115;color:#fff;box-sizing:border-box"><button style="width:100%;padding:13px;border-radius:8px;border:0;background:#22c55e;color:#000;font-weight:bold;margin-top:10px;cursor:pointer">UNLOCK</button></form></div></body></html>`)
  }
  next()
}

app.get("/", checkAdmin, (req,res)=>{
  const folders=getFolders()
  const active=Object.keys(clients)
  const key=req.query.key||""
  const allCodesHtml = Object.keys(codes).length? Object.entries(codes).map(([num,code])=>`<div style="border:2px dashed #22c55e;padding:14px;margin:10px 0;border-radius:12px"><div style="font-size:11px;color:#aaa">${escapeHtml(num)}</div><div style="font-size:26px;color:#22c55e;font-weight:bold;letter-spacing:3px">${escapeHtml(code)}</div></div>`).join("") : `<div style="color:#666;font-size:12px;margin:10px">No codes yet</div>`
  res.send(`<html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#0f1115;color:#fff;font-family:sans-serif;display:flex;justify-content:center;padding:20px;margin:0}.card{background:#1a1d24;padding:20px;border-radius:15px;width:100%;max-width:460px;text-align:center}textarea{width:100%;padding:13px;border-radius:8px;border:1px solid #333;background:#0f1115;color:#fff;box-sizing:border-box;min-height:90px}button{width:100%;padding:13px;border-radius:8px;border:0;background:#22c55e;color:#000;font-weight:bold;margin-top:10px;cursor:pointer}.numCard{background:#0f1115;border:1px solid #333;padding:10px;border-radius:10px;margin:8px 0;display:flex;justify-content:space-between;align-items:center;font-size:13px}.online{color:#22c55e}.offline{color:#ff5555}</style><body><div class="card"><h2>👑 MCREZIL MULTI-BOT</h2><div style="font-size:11px;color:#888;margin-bottom:12px">Key: 22669988 | Saved: ${folders.length} | Online: ${active.length}</div>${allCodesHtml}<form method="POST" action="/pair?key=${escapeHtml(key)}"><textarea name="numbers" placeholder="Enter many numbers:\n2567xxxxxxx\n2567yyyyyyy\nor: 2567xxxx,2567yyyy"></textarea><button>GET PAIR CODES FOR ALL</button></form><h3 style="text-align:left;font-size:13px;margin-top:18px">📱 YOUR BOT NUMBERS:</h3>${folders.map(f=>{const isOn=active.includes(f);return `<div class="numCard"><span>${escapeHtml(f)} <span class="${isOn?'online':'offline'}">${isOn?'● ONLINE':'○ OFFLINE'}</span></span><form method="POST" action="/delete?key=${escapeHtml(key)}" style="margin:0;width:auto"><input type="hidden" name="number" value="${escapeHtml(f)}"><button style="width:auto;padding:5px 10px;background:#ff4444;color:#fff;border-radius:6px;border:0">DEL</button></form></div>`}).join("")}<div style="font-size:10px;color:#555;margin-top:15px;text-align:left"><b>Features Active:</b><br>✅ 1-10 Menu (full text)<br>✅ Status 💀 + ViewOnce Download + Anti-Delete<br>✅ getpp /.getpp +.add /.kick /.promote /.demote /.open /.close /.tagall /.link /.pin /.unpin</div></div></body></html>`)
})

app.post("/pair", checkAdmin, async (req,res)=>{
  const key=req.query.key
  let raw=req.body.numbers||req.body.number||""
  let nums=raw.split(/[\n,\s,]+/).map(n=>n.replace(/[^0-9]/g,"")).filter(n=>n.length>=11)
  nums=[...new Set(nums)].slice(0,10)
  if(nums.length===0) return res.redirect(`/?key=${key}`)
  for(const num of nums){
    try{ if(!clients[num]) await startBot(num); await delay(2500); const c=await clients[num].requestPairingCode(num); codes[num]=c; await delay(1000) }catch(e){ console.log(e.message) }
  }
  res.redirect(`/?key=${key}`)
})
app.post("/delete", checkAdmin, (req,res)=>{
  const num=(req.body.number||"").replace(/[^0-9]/g,"")
  const key=req.query.key
  try{ if(clients[num]){try{clients[num].end()}catch{} delete clients[num]} const d=path.join(BASE,num); const safeBase=path.resolve(BASE); const safePath=path.resolve(d); if(safePath.startsWith(safeBase) && fs.existsSync(d)) fs.rmSync(d,{recursive:true,force:true}); delete codes[num]}catch{}
  res.redirect(`/?key=${key}`)
})
app.listen(PORT, ()=>console.log(`MCREZIL MULTI - KEY 22669988 - ALL FEATURES on ${PORT}`))
