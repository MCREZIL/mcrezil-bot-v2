const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys")
const express = require("express")
const fs = require("fs")
const path = require("path")
const pino = require("pino")

const app = express()
const PORT = process.env.PORT || 3000
const BASE = "./mcrezil-bot"
if (!fs.existsSync(BASE)) fs.mkdirSync(BASE, {recursive:true})

let clients = {} // number -> socket
let codes = {} // number -> pairing code

function getFolders(){
  if(!fs.existsSync(BASE)) return []
  return fs.readdirSync(BASE).filter(f=>fs.statSync(path.join(BASE,f)).isDirectory())
}

async function startBot(number){
  const dir = path.join(BASE, number)
  if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true})
  const { state, saveCreds } = await useMultiFileAuthState(dir)
  const sock = makeWASocket({
    auth: state,
    logger: pino({level:"silent"}),
    browser: ["MCREZIL-BOT","Chrome","1.0"],
    printQRInTerminal: false
  })
  clients[number]=sock
  sock.ev.on("creds.update", saveCreds)
  sock.ev.on("connection.update", async (u)=>{
    if(u.connection==="open"){
      console.log(`✅ ${number} CONNECTED`)
      await sock.sendMessage(sock.user.id, {text:`*MCREZIL-BOT CONNECTED* ✅\nNumber: ${number}\nFolder:./mcrezil-bot/${number}`})
    }
    if(u.connection==="close"){
      delete clients[number]
      console.log(`❌ ${number} closed`)
    }
  })
  sock.ev.on("messages.upsert", async m=>{
    try{
      const msg = m.messages[0]
      if(!msg.message || msg.key.fromMe) return
      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim().toLowerCase()
      if(text==="hi" || text==="hello" || text==="menu"){
        await sock.sendMessage(msg.key.remoteJid, {text:`Hi 👋 Good moment! ✨\n\n*Welcome to Mcrezil Chat Bot* 🤖\n\nChoose 1-10:\n1️⃣ Business\n2️⃣ Friend\n3️⃣ Family\n4️⃣ Workshop\n5️⃣ Order case\n6️⃣ Door/window\n7️⃣ Greetings\n8️⃣ Joke 🤣\n9️⃣ Update\n🔟 First time\n\n_Reply with number_ 👇`})
      }
    }catch(e){}
  })
  return sock
}

// load existing
(async()=>{
  for(const num of getFolders()){
    await startBot(num)
    await delay(1000)
  }
})()

app.use(express.urlencoded({extended:true}))
app.use(express.json())

app.get("/", (req,res)=>{
  const folders = getFolders()
  const active = Object.keys(clients).length
  const lastCode = req.query.code? codes[req.query.num] : null
  const lastNum = req.query.num || ""
  const err = req.query.err || ""
  res.send(`
  <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
  body{background:#0f1115;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}
 .card{background:#1a1d24;padding:25px;border-radius:15px;width:90%;max-width:350px;text-align:center;box-shadow:0 0 20px #000}
  h1{color:#fff;margin:0}.sub{color:#888;font-size:12px;margin:8px 0 15px}
 .code-box{border:2px dashed #22c55e;padding:15px;border-radius:10px;margin:15px 0;font-size:28px;font-weight:bold;color:#22c55e;letter-spacing:2px}
  input{width:100%;padding:13px;border-radius:8px;border:1px solid #333;background:#0f1115;color:#fff;box-sizing:border-box;font-size:16px}
  button{width:100%;padding:13px;border-radius:8px;border:0;background:#22c55e;color:#000;font-weight:bold;margin-top:10px;font-size:16px;cursor:pointer}
 .del{background:#ff4444;color:#fff;margin-top:15px;font-size:12px;padding:8px}
 .info{font-size:11px;color:#888;margin-top:15px}
 .err{color:#ff4444;font-size:13px;margin:10px 0}
  </style></head><body>
  <div class="card">
    <h1>👑 MCREZIL-BOT</h1>
    <div class="sub">Folder:./mcrezil-bot | Holds: ${folders.length} numbers | Active: ${active}</div>
    ${err?`<div class="err">${err}</div>`:""}
    ${lastCode?`<div class="code-box">${lastCode}</div><div style="font-size:12px">For: ${lastNum}</div>`:`<div class="code-box" style="font-size:14px;color:#888">Enter number below</div>`}
    <form method="POST" action="/pair">
      <input name="number" value="${lastNum}" placeholder="256746622284" required pattern="[0-9]+">
      <button type="submit">GET PAIRING CODE</button>
    </form>
    <div class="info">Enter code in WhatsApp > Linked Devices > Link with phone number - within 30 sec!</div>
    <div class="info">✓ Each number saved in./mcrezil-bot/number</div>
    ${folders.map(f=>`<form method="POST" action="/delete"><input type="hidden" name="number" value="${f}"><button class="del" type="submit">DELETE SESSION ${f} (Fix WAIT error)</button></form>`).join("")}
  </div></body></html>`)
})

app.post("/pair", async (req,res)=>{
  let num = (req.body.number||"").replace(/[^0-9]/g,"")
  if(num.startsWith("0")) num = "256"+num.slice(1)
  if(num.length<10) return res.redirect("/?err=Invalid number. Use 256746622284")

  try{
    if(!clients[num]) await startBot(num)
    await delay(1500)
    if(!clients[num]) throw new Error("Socket not ready")
    const code = await clients[num].requestPairingCode(num)
    codes[num]=code
    console.log(`CODE for ${num}: ${code}`)
    return res.redirect(`/?code=1&num=${num}`)
  }catch(e){
    console.log("Pair error", e.message)
    if(e.message.includes("rate") || e.message.includes("Too Many") || e.message.includes("428")){
      return res.redirect(`/?err=WAIT 2 MINS - You clicked too much! Click DELETE SESSION ${num} below, wait 10 mins, then try ONCE&num=${num}`)
    }
    return res.redirect(`/?err=${encodeURIComponent(e.message)}&num=${num}`)
  }
})

app.post("/delete", (req,res)=>{
  const num = (req.body.number||"").replace(/[^0-9]/g,"")
  try{
    if(clients[num]){ try{clients[num].end()}catch{} delete clients[num] }
    const dir = path.join(BASE,num)
    if(fs.existsSync(dir)) fs.rmSync(dir,{recursive:true,force:true})
    delete codes[num]
  }catch{}
  res.redirect("/?err=Deleted "+num+" - Now wait 5 mins then pair again&num=")
})

app.listen(PORT, ()=>console.log(`🌐 MCREZIL-BOT MULTI hosting ${PORT}`))
