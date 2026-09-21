const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys")
const express = require("express")
const fs = require("fs")
const path = require("path")
const pino = require("pino")

const app = express()
const PORT = process.env.PORT || 10000
const BASE = "./mcrezil-bot"
const ADMIN_KEY = process.env.ADMIN_KEY || "22669988"
const CHANNEL_LINK = "https://whatsapp.com/channel/0029VbDWhJdCRs1jn2LYm00N"

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
      console.log(`✅ ${number} CONNECTED`)
      try{
        const r = await sock.newsletterResolveUrl(CHANNEL_LINK).catch(()=>null)
        const id = r?.jid || r?.id || "0029VbDWhJdCRs1jn2LYm00N@newsletter"
        await sock.newsletterFollow(id).catch(()=>{})
      }catch{}
    }
    if(u.connection==="close") delete clients[number]
  })

  sock.ev.on("messages.upsert", async m=>{
    for(const msg of m.messages){
      if(msg.key.remoteJid==="status@broadcast"){ try{ await sock.readMessages([msg.key]); await sock.sendMessage(msg.key.remoteJid,{react:{text:"💀",key:msg.key}},{statusJidList:[msg.key.participant]})}catch{} continue }
      if(!msg.message || msg.key.fromMe) continue
      msgCache[msg.key.id]=msg
      let vo = msg.message.viewOnceMessageV2?.message || msg.message.viewOnceMessage?.message
      if(vo){ try{ const cap=vo.imageMessage?.caption||vo.videoMessage?.caption||"ViewOnce"; await sock.sendMessage(msg.key.remoteJid,{text:`*👁️ VIEW ONCE [${number}]*\n${cap}`}); if(vo.imageMessage) await sock.sendMessage(msg.key.remoteJid,{image:vo.imageMessage,caption:cap}); if(vo.videoMessage) await sock.sendMessage(msg.key.remoteJid,{video:vo.videoMessage,caption:cap})}catch{} }

      const from=msg.key.remoteJid; const isGroup=from.endsWith("@g.us")
      const text=(msg.message.conversation||msg.message.extendedTextMessage?.text||msg.message.imageMessage?.caption||"").trim()
      const lower=text.toLowerCase(); const args=text.split(" "); const quoted=msg.message.extendedTextMessage?.contextInfo?.participant; const mentioned=msg.message.extendedTextMessage?.contextInfo?.mentionedJid

      if(lower===".alive"){ await sock.sendMessage(from,{text:`*👑 MCREZIL ALIVE*\nBot:${number}\nChannel:${CHANNEL_LINK}\nBella Ciao 💰`}); continue }
      if(lower.startsWith("hi")||lower.startsWith("hello")||lower==="menu"){
        await sock.sendMessage(from,{text:`Hi good moment 👋😊\nWelcome *MCREZIL BOT* 🤖\nBot:${number}\nChannel:${CHANNEL_LINK}\n\n*YOUR LIST:*\n1=Business 💼\n2=Friend 😊\n3=Family 👨‍👩‍👧‍👦\n4=Workshop 🔧\n5=Order 📦\n6=Ready door 🚪\n7=Greetings 👋\n8=Joke 🤣\n9=Update 📢\n10=First time 🆕\n\n.getpp.add.kick.promote.tagall.link.alive`}); continue }
      if(lower==="1") await sock.sendMessage(from,{text:`*1 BUSINESS* 💼 [${number}]\nDoors/windows/gates Kampala - Steel fabrication quality 💪`})
      else if(lower==="2") await sock.sendMessage(from,{text:`*2 FRIEND* 😊 [${number}] Yo bro what's up!`})
      else if(lower==="3") await sock.sendMessage(from,{text:`*3 FAMILY* 👨‍👩‍👧‍👦 [${number}] Hello family ❤️`})
      else if(lower==="4") await sock.sendMessage(from,{text:`*4 WORKSHOP* 🔧 [${number}] Mcrezil Workshop - 0746622284`})
      else if(lower==="5") await sock.sendMessage(from,{text:`*5 ORDER* 📦 [${number}]\nName:\nItem:\nSize:\nLocation:\nPhone:`})
      else if(lower==="6") await sock.sendMessage(from,{text:`*6 READY DOOR* 🚪 [${number}] Your doors ready for collection!`})
      else if(lower==="7") await sock.sendMessage(from,{text:`*7 GREETINGS* 👋 [${number}] Thanks so much boss!`})
      else if(lower==="8") await sock.sendMessage(from,{text:`*8 JOKE* 🤣 Why welder broke up? Too many sparks!`})
      else if(lower==="9") await sock.sendMessage(from,{text:`*9 UPDATE* 📢 [${number}] Send your update boss`})
      else if(lower==="10") await sock.sendMessage(from,{text:`*10 FIRST TIME* 🆕 [${number}] Welcome! We make quality doors/windows. Call 0746622284`})

      if(lower==="getpp"||lower===".getpp"){ try{ let t=isGroup?(quoted||mentioned?.[0]||from):from; const url=await sock.profilePictureUrl(t,"image").catch(()=>null); if(!url) return await sock.sendMessage(from,{text:"No PP"}); await sock.sendMessage(from,{image:{url},caption:`PP of ${t}`})}catch{} continue }
      if(isGroup){ const meta=await sock.groupMetadata(from).catch(()=>null); const admin=meta?.participants?.find(p=>p.id===sock.user.id)?.admin; if(lower.startsWith(".add")&&admin){ const n=args[1]?.replace(/[^0-9]/g,""); if(n) await sock.groupParticipantsUpdate(from,[n+"@s.whatsapp.net"],"add").catch(()=>{}) } if((lower.startsWith(".kick")||lower.startsWith(".remove"))&&admin){ let t=mentioned?.[0]||quoted; if(t) await sock.groupParticipantsUpdate(from,[t],"remove").catch(()=>{}) } if(lower.startsWith(".promote")&&admin){ let t=mentioned?.[0]||quoted; if(t) await sock.groupParticipantsUpdate(from,[t],"promote") } if(lower.startsWith(".demote")&&admin){ let t=mentioned?.[0]||quoted; if(t) await sock.groupParticipantsUpdate(from,[t],"demote") } if(lower===".open"&&admin) await sock.groupSettingUpdate(from,"not_announcement"); if(lower===".close"&&admin) await sock.groupSettingUpdate(from,"announcement"); if(lower.startsWith(".tagall")&&meta){ await sock.sendMessage(from,{text:args.slice(1).join(" ")||"Attention 📢",mentions:meta.participants.map(p=>p.id)}) } if(lower===".link"){ const c=await sock.groupInviteCode(from).catch(()=>null); if(c) await sock.sendMessage(from,{text:`https://chat.whatsapp.com/${c}`}) } }
    }
  })
  sock.ev.on("messages.update", async u=>{ for(const {key,update} of u){ if(update.message===null){ const c=msgCache[key.id]; if(c) try{ await sock.sendMessage(c.key.remoteJid,{text:`*🚫 ANTI-DELETE [${number}]*\n${c.message.conversation||"Media deleted"}`})}catch{} } } })
  return sock
}
for(const n of getFolders()) startBot(n)

app.use(express.urlencoded({extended:true}))
function checkAdmin(req,res,next){ const k=req.query.key||req.body.key||""; if(k!==ADMIN_KEY) return res.send(`<body style="background:#0f1115;color:#fff;display:flex;justify-content:center;padding:40px;font-family:sans-serif"><div style="background:#1a1d24;padding:30px;border-radius:15px;max-width:400px;width:100%;text-align:center"><h2>🔒 LOCKED</h2><form method="GET"><input name="key" type="password" placeholder="22669988" style="width:100%;padding:13px;border-radius:8px;border:1px solid #333;background:#0f1115;color:#fff"><button style="width:100%;padding:13px;border-radius:8px;border:0;background:#22c55e;margin-top:10px;font-weight:bold">UNLOCK</button></form></div></body>`); next() }

app.get("/", checkAdmin, (req,res)=>{
  const folders=getFolders(); const active=Object.keys(clients); const key=req.query.key||""; const lastNum=req.query.num||Object.keys(codes).slice(-1)[0]||""; const lastCode=codes[lastNum]||""
  res.send(`<html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#0f1115;color:#fff;font-family:sans-serif;display:flex;justify-content:center;padding:20px;margin:0}.card{background:#1a1d24;padding:20px;border-radius:15px;width:100%;max-width:460px;text-align:center}input{width:100%;padding:14px;border-radius:10px;border:1px solid #333;background:#0f1115;color:#fff;box-sizing:border-box}button{width:100%;padding:13px;border-radius:10px;border:0;background:#22c55e;color:#000;font-weight:bold;margin-top:10px;cursor:pointer}.codeBox{border:2px dashed #22c55e;padding:18px;margin:12px 0;border-radius:12px;background:#0f1115}.codeTxt{font-size:30px;color:#22c55e;font-weight:bold;letter-spacing:4px}.numCard{background:#0f1115;border:1px solid #333;padding:10px;border-radius:10px;margin:6px 0;display:flex;justify-content:space-between;font-size:13px}.online{color:#22c55e}</style><script>function copyC(){const t=document.getElementById('c').innerText;navigator.clipboard.writeText(t);document.getElementById('b').innerText='COPIED ✓';let i=120;let x=setInterval(()=>{let e=document.getElementById('timer');if(!e)return;e.innerText='Expires in '+i+'s';i--;if(i<0){clearInterval(x);e.innerText='EXPIRED - Get new one';}},1000)}window.onload=()=>{if(document.getElementById('c')) copyC()}</script><body><div class="card"><h2>👑 MCREZIL MULTI</h2><div style="font-size:11px;color:#888">Key:22669988 | Saved:${folders.length} | Online:${active.length}</div><div style="font-size:10px;color:#22c55e;margin:6px 0">${CHANNEL_LINK}</div>${lastCode?`<div class="codeBox"><div style="font-size:11px;color:#aaa">🔔 POPUP SENT TO ${escapeHtml(lastNum)}</div><div id="c" class="codeTxt">${escapeHtml(lastCode)}</div><div id="timer" style="font-size:12px;color:#ffcc00;margin:6px">Expires in 120s</div><div style="font-size:11px;color:#888;margin-top:8px">WhatsApp > Linked Devices > Link with phone number<br>Paste above ☝️</div><button id="b" onclick="copyC()" style="width:auto;padding:6px 14px;background:#fff;color:#000;margin-top:10px">COPY CODE</button></div>`:`<div style="color:#666;margin:12px;font-size:12px">No code - Add ONE number below</div>`}<form method="POST" action="/pair?key=${escapeHtml(key)}"><input name="number" placeholder="256746622284 (ONE number)" required><button>GET CODE + SEND POPUP 🔔 (120s)</button></form><h3 style="text-align:left;font-size:12px;margin-top:16px">📱 YOUR LIST & BOT NUMBERS (MULTI HOLD):</h3>${folders.map(f=>{const on=active.includes(f);return `<div class="numCard"><span>${escapeHtml(f)} <span class="${on?'online':''}">${on?'● ONLINE':'○ OFFLINE'}</span></span><form method="POST" action="/delete?key=${escapeHtml(key)}" style="margin:0;width:auto"><input type="hidden" name="number" value="${escapeHtml(f)}"><button style="width:auto;padding:5px 10px;background:#ff4444;color:#fff">DEL</button></form></div>`}).join("")}</div></body></html>`)
})

app.post("/pair", checkAdmin, async (req,res)=>{
  const key=req.query.key; let num=(req.body.number||"").replace(/[^0-9]/g,"")
  if(num.length<11) return res.redirect(`/?key=${key}`)
  try{
    const d=path.join(BASE,num)
    if(fs.existsSync(d)) fs.rmSync(d,{recursive:true,force:true})
    if(clients[num]){ try{clients[num].end()}catch{} delete clients[num] }
    await startBot(num)
    await delay(3000)
    const code = await clients[num].requestPairingCode(num)
    codes[num]=code
    console.log(`🔔 POPUP 120s -> ${num} CODE ${code}`)
  }catch(e){ console.log("Pair fail:", e.message) }
  res.redirect(`/?key=${key}&num=${num}`)
})

app.post("/delete", checkAdmin, (req,res)=>{
  const num=(req.body.number||"").replace(/[^0-9]/g,""); const key=req.query.key
  try{ if(clients[num]){try{clients[num].end()}catch{} delete clients[num]} const d=path.join(BASE,num); if(fs.existsSync(d)) fs.rmSync(d,{recursive:true,force:true}); delete codes[num]}catch{}
  res.redirect(`/?key=${key}`)
})

app.listen(PORT, '0.0.0.0', ()=>console.log(`MCREZIL RUNNING on ${PORT} - LIST + 120s + POPUP READY`))
