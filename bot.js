const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys")
const express = require("express")
const fs = require("fs")
const path = require("path")
const pino = require("pino")
const qrcode = require("qrcode")

const app = express()
const PORT = process.env.PORT || 3000
const BASE = "./mcrezil-bot"
if (!fs.existsSync(BASE)) fs.mkdirSync(BASE, {recursive:true})

let clients = {}
let codes = {}
let qrCodes = {}

function getFolders(){
  return fs.existsSync(BASE)? fs.readdirSync(BASE).filter(f=>fs.statSync(path.join(BASE,f)).isDirectory()) : []
}

async function startBot(number, isQr=false){
  const dir = path.join(BASE, number)
  if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true})
  const { state, saveCreds } = await useMultiFileAuthState(dir)
  const sock = makeWASocket({ auth: state, logger: pino({level:"silent"}), browser: ["MCREZIL","Chrome","1.0"] })
  clients[number]=sock
  sock.ev.on("creds.update", saveCreds)
  sock.ev.on("connection.update", async (u)=>{
    if(u.qr && isQr){ qrCodes[number] = await qrcode.toDataURL(u.qr) }
    if(u.connection==="open"){ console.log(`✅ ${number} CONNECTED`); qrCodes[number]=null }
    if(u.connection==="close"){ delete clients[number] }
  })
  sock.ev.on("messages.upsert", async m=>{
    const msg = m.messages[0]
    if(!msg?.message || msg.key.fromMe) return
    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim().toLowerCase()
    if(["hi","hello","menu"].includes(text)){
      await sock.sendMessage(msg.key.remoteJid, {text:`Hi 👋 *MCREZIL BOT* 🤖\n1️⃣ Business 2️⃣ Friend 3️⃣ Workshop 4️⃣ Order 5️⃣ Door/Window 6️⃣ Joke 7️⃣ Update`})
    }
  })
  return sock
}
for(const n of getFolders()) startBot(n)

app.use(express.urlencoded({extended:true}))
app.get("/", (req,res)=>{
  const folders=getFolders()
  const active=Object.keys(clients).length
  const num=req.query.num||""
  const code=codes[num]
  const qr=qrCodes[num]
  const err=req.query.err||""
  res.send(`
<html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{background:#0f1115;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}
.card{background:#1a1d24;padding:25px;border-radius:15px;width:90%;max-width:360px;text-align:center}
input{width:100%;padding:13px;border-radius:8px;border:1px solid #333;background:#0f1115;color:#fff;box-sizing:border-box}
button{width:100%;padding:13px;border-radius:8px;border:0;background:#22c55e;color:#000;font-weight:bold;margin-top:10px;cursor:pointer}
.qr{background:#fff;padding:10px;border-radius:10px;margin:10px 0}
.del{background:#ff4444;color:#fff;margin-top:15px;font-size:12px}
.codeBox{border:2px dashed #22c55e;padding:22px 10px;margin:15px 0;border-radius:10px;position:relative}
.codeText{font-size:30px;color:#22c55e;font-weight:bold;letter-spacing:3px;user-select:all}
.copyBtn{position:absolute;top:6px;right:6px;font-size:11px;padding:6px 12px;background:#22c55e;width:auto;margin:0;border-radius:6px}
</style>
<script>
function copyCode(){
  const t=document.getElementById('pairCode').innerText;
  navigator.clipboard.writeText(t);
  const b=document.getElementById('copyBtn');
  b.innerText='COPIED ✓';
  setTimeout(()=>b.innerText='COPY',2000)
}
</script>
<body><div class="card">
<h2>👑 MCREZIL-BOT</h2>
<div style="font-size:11px;color:#888">Holds:${folders.length} | Active:${active}</div>
${err?`<div style="color:#ff5555;margin:10px;font-size:12px">${err}</div>`:""}
${qr?`<div class="qr"><img src="${qr}" style="width:100%"></div><div style="font-size:12px">Scan QR in WhatsApp > Linked Devices</div>`
: code? `<div class="codeBox"><div id="pairCode" class="codeText">${code}</div><button id="copyBtn" class="copyBtn" onclick="copyCode()">COPY</button></div><div style="font-size:11px;color:#aaa">For: ${num}<br>Tap COPY then PASTE in WhatsApp Business > Link with phone number</div>`
: `<div style="color:#888;margin:15px;font-size:13px">Enter your number</div>`}
<form method="POST" action="/pair"><input name="number" value="${num}" placeholder="256746622284" required><button>GET PAIRING CODE</button></form>
<form method="POST" action="/qr"><input type="hidden" name="number" value="${num||'256746622284'}"><button style="background:#fff;color:#000">GET QR CODE</button></form>
${folders.map(f=>`<form method="POST" action="/delete"><input type="hidden" name="number" value="${f}"><button class="del">DELETE SESSION ${f}</button></form>`).join("")}
</div></body></html>`)
})
app.post("/pair", async (req,res)=>{
  let num=(req.body.number||"").replace(/[^0-9]/g,"")
  if(!clients[num]) await startBot(num,false)
  await delay(2000)
  try{ const c=await clients[num].requestPairingCode(num); codes[num]=c; res.redirect(`/?num=${num}`)}catch(e){ res.redirect(`/?err=${encodeURIComponent(e.message)}&num=${num}`)}
})
app.post("/qr", async (req,res)=>{
  let num=(req.body.number||"").replace(/[^0-9]/g,"") || "256746622284"
  try{ if(clients[num]){try{clients[num].end()}catch{} delete clients[num]} const d=path.join(BASE,num); if(fs.existsSync(d)) fs.rmSync(d,{recursive:true,force:true}) }catch{}
  qrCodes[num]=null; codes[num]=null
  await startBot(num,true)
  await delay(2500)
  res.redirect(`/?num=${num}`)
})
app.post("/delete", (req,res)=>{ const num=(req.body.number||"").replace(/[^0-9]/g,""); try{ if(clients[num]){try{clients[num].end()}catch{} delete clients[num]} const dir=path.join(BASE,num); if(fs.existsSync(dir)) fs.rmSync(dir,{recursive:true,force:true}) }catch{} res.redirect("/") })
app.listen(PORT, ()=>console.log(`BOT ${PORT}`))
