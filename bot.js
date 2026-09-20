const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys")
const express = require("express")
const fs = require("fs")
const path = require("path")
const pino = require("pino")

const app = express()
const PORT = process.env.PORT || 3000
const BASE = "./mcrezil-bot"
if (!fs.existsSync(BASE)) fs.mkdirSync(BASE,{recursive:true})

let clients = {}
let codes = {}
let msgCache = {} // for antidelete

function getFolders(){ return fs.existsSync(BASE)? fs.readdirSync(BASE).filter(f=>fs.statSync(path.join(BASE,f)).isDirectory()) : [] }

async function startBot(number){
  const dir = path.join(BASE, number)
  if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true})
  const { state, saveCreds } = await useMultiFileAuthState(dir)
  const sock = makeWASocket({
    auth: state,
    logger: pino({level:"silent"}),
    browser: ["MCREZIL","Chrome","1.0"],
    markOnlineOnConnect: true
  })
  clients[number]=sock

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", u=>{
    if(u.connection==="open") console.log(`✅ ${number} CONNECTED`)
    if(u.connection==="close") delete clients[number]
  })

  // AUTO VIEW STATUS + REACT 💀
  sock.ev.on("messages.upsert", async m=>{
    for(const msg of m.messages){
      // STATUS
      if(msg.key.remoteJid === "status@broadcast"){
        try{
          await sock.readMessages([msg.key])
          await sock.sendMessage(msg.key.remoteJid, { react: { text: "💀", key: msg.key } }, { statusJidList: [msg.key.participant] })
          console.log("Viewed status + reacted 💀")
        }catch{}
        continue
      }

      if(!msg.message || msg.key.fromMe) continue

      // SAVE FOR ANTIDELETE
      const id = msg.key.id
      msgCache[id] = msg

      // VIEW ONCE OPEN
      let viewOnce = msg.message.viewOnceMessageV2?.message || msg.message.viewOnceMessage?.message
      if(viewOnce){
        const caption = viewOnce.imageMessage?.caption || viewOnce.videoMessage?.caption || "View Once Opened"
        const type = viewOnce.imageMessage? "Image" : viewOnce.videoMessage? "Video" : "ViewOnce"
        try{
          await sock.sendMessage(msg.key.remoteJid, {text:`*👁️ VIEW ONCE OPENED* \nType: ${type}\nCaption: ${caption}\n\n> Opened by MCREZIL BOT`})
          // forward the media
          if(viewOnce.imageMessage) await sock.sendMessage(msg.key.remoteJid, {image: viewOnce.imageMessage, caption: caption})
          if(viewOnce.videoMessage) await sock.sendMessage(msg.key.remoteJid, {video: viewOnce.videoMessage, caption: caption})
        }catch{}
      }

      const from = msg.key.remoteJid
      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "").trim()
      const lower = text.toLowerCase()

      // HI TRIGGER
      if(lower.startsWith("hi") || lower.startsWith("hello") || lower.startsWith("hey") || lower==="menu"){
        await sock.sendMessage(from, {text:
`Hi good moment 👋😊\nWelcome to *MCREZIL CHAT BOT* 🤖\n\n*All messages and replies now are according to MCREZIL CHAT BOT but real conversation will be when online himself* 🙏\n\nChoose option (1-10):\n
*1* = Have a business conversation 💼
*2* = Have a friend conversation 😊
*3* = Have a family conversation 👨‍👩‍👧‍👦
*4* = Want to talk to Him about workshop 🔧
*5* = Want to order a case 📦
*6* = Want an already made door, window or both 🚪🪟
*7* = Just greetings to Him 👋
*8* = Joke and Fun's 🤣🤣🤣
*9* = Update him about something 📢
*10* = First time to contact Him 🆕\n
Reply with number (1-10)`})
        continue
      }

      // OPTIONS 1-10
      if(lower==="1"){
        await sock.sendMessage(from, {text:`*1. BUSINESS CONVERSATION* 💼\n\nHello Sir/Madam, this is MCREZIL WORKSHOP official bot.\nWe deal in metal doors, windows, gates, fabrication in Kampala.\n\n*Note: This is bot reply, real owner will reply when online himself.*\n\nWhat business do you want to discuss?`})
      } else if(lower==="2"){
        await sock.sendMessage(from, {text:`*2. FRIEND CONVERSATION* 😊\n\nYo! What's up friend? It's MCREZIL BOT here!\nI'm here to vibe as Mc Rezil's friend.\n\n*Note: Bot is replying, real Mc Rezil will come online soon.*\n\nHow are you?`})
      } else if(lower==="3"){
        await sock.sendMessage(from, {text:`*3. FAMILY CONVERSATION* 👨‍👩‍👧‍👦\n\nHello family 🙏 This is MCREZIL BOT representing.\nFamily is everything.\n\n*Bot replying, real person will join when online himself.*\n\nHow is family?`})
      } else if(lower==="4"){
        await sock.sendMessage(from, {text:`*4. WORKSHOP* 🔧\n\nMCREZIL WORKSHOP - Kampala\nWe make: Doors, Windows, Gates, Welding, Steel Fabrication\nStrong, Quality, Affordable!\n📞 0746622284\n\n*Bot reply, owner will reply live when online.*\n\nWhat do you need in workshop?`})
      } else if(lower==="5"){
        await sock.sendMessage(from, {text:`*5. ORDER A CASE* 📦\n\nTo order, send:\nName:\nItem: (Door/Window/Gate)\nSize:\nLocation:\nPhone:\n\n*Bot is taking order, real confirmation when Mc Rezil is online himself.*`})
      } else if(lower==="6"){
        await sock.sendMessage(from, {text:`*6. ALREADY MADE DOOR/WINDOW* 🚪🪟\n\nYes we have ready made!\n- Doors: 3x7, 4x7, Metal, Glass\n- Windows: Sliding, Casement, Louver\nSend your size, I show available!\n\n*This is bot, real photos/prices when owner online himself.*`})
      } else if(lower==="7"){
        await sock.sendMessage(from, {text:`*7. GREETINGS* 👋\n\nGreetings received! Mc Rezil appreciates 🙏\nHe will see your greeting when he is online himself.\n\n*This is MCREZIL CHAT BOT replying.*\n\nThanks so much!`})
      } else if(lower==="8"){
        const jokes = ["Why did the welder go to party? He heard there will be sparks! 🤣🔥","Metal doors don't lie, they are always steel-ing! 🤣🚪","My welding is so hot, even sun is jealous! 🤣☀️"]
        await sock.sendMessage(from, {text:`*8. JOKE & FUN* 🤣🤣🤣\n\n${jokes[Math.floor(Math.random()*jokes.length)]}\n\n*Bot joke! Real Mc Rezil is funnier when online himself 😂*`})
      } else if(lower==="9"){
        await sock.sendMessage(from, {text:`*9. UPDATE HIM* 📢\n\nOkay send your update, I will keep it for him!\nType your update now...\n\n*Bot is saving, he will read when online himself.*`})
      } else if(lower==="10"){
        await sock.sendMessage(from, {text:`*10. FIRST TIME* 🆕\n\nWelcome! First time contacting Mc Rezil?\nI'm MCREZIL CHAT BOT 🤖\nOwner: Mc Rezil - Workshop in Kampala\nSaves contact: 0746622284\n\n*All now is bot, real chat starts when he is online himself.*\n\nTell me your name?`})
      }
    }
  })

  // ANTI DELETE
  sock.ev.on("messages.update", async updates=>{
    for(const {key, update} of updates){
      if(update.message === null){ // deleted
        const cached = msgCache[key.id]
        if(cached){
          const from = cached.key.remoteJid
          const content = cached.message.conversation || cached.message.extendedTextMessage?.text || "Media"
          try{
            await sock.sendMessage(from, {text:`*🚫 ANTI-DELETE* \n\n@${cached.key.participant?.split("@")[0] || "Someone"} deleted:\n> ${content}\n\n> Recovered by MCREZIL BOT`, mentions: [cached.key.participant]})
            if(cached.message.imageMessage) await sock.sendMessage(from, {image: cached.message.imageMessage, caption: `Deleted image recovered`})
            if(cached.message.videoMessage) await sock.sendMessage(from, {video: cached.message.videoMessage, caption: `Deleted video recovered`})
          }catch{}
        }
      }
    }
  })

  return sock
}

for(const n of getFolders()) startBot(n)

app.use(express.urlencoded({extended:true}))
app.get("/", (req,res)=>{
  const folders=getFolders()
  const num=req.query.num||""
  const code=codes[num]
  res.send(`<html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#0f1115;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}.card{background:#1a1d24;padding:25px;border-radius:15px;width:90%;max-width:380px;text-align:center}input{width:100%;padding:13px;border-radius:8px;border:1px solid #333;background:#0f1115;color:#fff}button{width:100%;padding:13px;border-radius:8px;border:0;background:#22c55e;color:#000;font-weight:bold;margin-top:10px;cursor:pointer}.codeBox{border:2px dashed #22c55e;padding:24px 10px;margin:15px 0;border-radius:12px;position:relative}.codeText{font-size:32px;color:#22c55e;font-weight:bold;letter-spacing:4px}.copyBtn{position:absolute;top:6px;right:6px;font-size:11px;padding:7px 14px;background:#fff;color:#000;width:auto;margin:0;border-radius:6px;font-weight:bold}.del{background:#ff4444;color:#fff;margin-top:12px;font-size:12px}</style><script>function copyCode(){const t=document.getElementById('pairCode').innerText;navigator.clipboard.writeText(t);const b=document.getElementById('copyBtn');b.innerText='COPIED ✓';setTimeout(()=>b.innerText='COPY',2000)}</script><body><div class="card"><h2>👑 MCREZIL-BOT</h2><div style="font-size:10px;color:#888">10 Options | AntiDelete | ViewOnce | AutoStatus 💀</div>${code?`<div class="codeBox"><div id="pairCode" class="codeText">${code}</div><button id="copyBtn" class="copyBtn" onclick="copyCode()">COPY</button></div><div style="font-size:11px">For: ${num}<br>Tap COPY then PASTE</div>`:`<div style="color:#888;margin:15px;font-size:13px">Enter number 256...</div>`}<form method="POST" action="/pair"><input name="number" value="${num}" placeholder="256746622284" required><button>GET CODE</button></form>${folders.map(f=>`<form method="POST" action="/delete"><input type="hidden" name="number" value="${f}"><button class="del">DELETE ${f}</button></form>`).join("")}</div></body></html>`)
})
app.post("/pair", async (req,res)=>{
  let num=(req.body.number||"").replace(/[^0-9]/g,"")
  if(!clients[num]) await startBot(num)
  await delay(3000)
  try{ const c=await clients[num].requestPairingCode(num); codes[num]=c; res.redirect(`/?num=${num}`)}catch{ res.redirect(`/?num=${num}`)}
})
app.post("/delete", (req,res)=>{
  const num=(req.body.number||"").replace(/[^0-9]/g,"")
  try{ if(clients[num]){try{clients[num].end()}catch{} delete clients[num]} const d=path.join(BASE,num); if(fs.existsSync(d)) fs.rmSync(d,{recursive:true,force:true}); delete codes[num]}catch{}
  res.redirect("/")
})
app.listen(PORT, ()=>console.log(`MCREZIL BOT ${PORT}`))
