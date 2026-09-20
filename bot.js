const { default: makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, delay, downloadMediaMessage, DisconnectReason } = require('@whiskeysockets/baileys')
const pino = require('pino')
const fs = require('fs')
const express = require('express')
const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const PORT = process.env.PORT || 3000
const BASE_SESSION = "./mcrezil-bot" // YOUR CONTROLLED FOLDER
let globalSocks = {}
let codes = {}

if (!fs.existsSync(BASE_SESSION)) fs.mkdirSync(BASE_SESSION, {recursive:true})

async function startBotForNumber(number){
let authFolder = `${BASE_SESSION}/${number}`
if (!fs.existsSync(authFolder)) fs.mkdirSync(authFolder, {recursive:true})
let { state, saveCreds } = await useMultiFileAuthState(authFolder)
let sock = makeWASocket({
auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({level:"silent"})) },
logger: pino({level:"silent"}),
browser: ["MCREZIL","Chrome","1.0.0"]
})
sock.ev.on('creds.update', saveCreds)
globalSocks[number] = sock

sock.ev.on('connection.update', async (u) => {
if(u.connection==='open') console.log(`✅ BOT ${number} CONNECTED IN ${BASE_SESSION}`)
if(u.connection==='close' && u.lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut) startBotForNumber(number)
})

sock.ev.on('messages.upsert', async ({messages}) => {
try{
let msg = messages[0]; if(!msg.message) return
let from = msg.key.remoteJid
let text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim()

if(from === 'status@broadcast'){ await sock.readMessages([msg.key]); try{await sock.sendMessage(from, {react:{text:"💀", key:msg.key}})}catch{} return }

if(msg.message.viewOnceMessageV2){
let view = msg.message.viewOnceMessageV2.message
let type = Object.keys(view)[0]
let buffer = await downloadMediaMessage(msg, 'buffer', {}, {logger:pino({level:"silent"}), reuploadRequest: sock.updateMediaMessage})
if(type==='imageMessage') await sock.sendMessage(from, {image: buffer, caption: "👁️ *VIEWONCE BUSTED*"}, {quoted: msg})
}

let lower = text.toLowerCase()
if(lower.startsWith('hi') || lower.startsWith('hello')){
await sock.sendMessage(from, {text:`Hi 👋 Good moment! ✨\n\n*Welcome to Mcrezil Chat Bot* 🤖\n\nAll replies are according to *Mcrezil Chat Bot* - Real conversation when he is online himself 💀\n\n*Choose 1-10:*\n\n1️⃣ Have a business conversation\n2️⃣ Have a friend conversation\n3️⃣ Have a family conversation\n4️⃣ Want to talk to Him about workshop\n5️⃣ Want to order a case\n6️⃣ Want an already made door, window or both\n7️⃣ Just greetings to Him\n8️⃣ Joke and Fun's 🤣🤣🤣\n9️⃣ Update him about something\n🔟 First time to contact Him\n\n_Reply with number_ 👇`}); return
}
if(lower==='1') await sock.sendMessage(from, {text:`1️⃣ *BUSINESS* 💼\nTell me business?\n\n_Auto reply by Mcrezil Bot, real talk when online_ 👑\nReply *Hi*`})
if(lower==='2') await sock.sendMessage(from, {text:`2️⃣ *FRIEND* 🤝\nYo friend! Will reply soon.\nReply *Hi*`})
if(lower==='3') await sock.sendMessage(from, {text:`3️⃣ *FAMILY* ❤️\nFamily is everything!\nReply *Hi*`})
if(lower==='4') await sock.sendMessage(from, {text:`4️⃣ *WORKSHOP* 🔧\nKampala - Doors, Windows, Gates.\nReply *Hi*`})
if(lower==='5') await sock.sendMessage(from, {text:`5️⃣ *ORDER CASE* 📦\nSend Type, Size, Photo, Location.\nReply *Hi*`})
if(lower==='6') await sock.sendMessage(from, {text:`6️⃣ *READY MADE* 🚪🪟\nYes available! Tell size.\nReply *Hi*`})
if(lower==='7') await sock.sendMessage(from, {text:`7️⃣ *GREETINGS* 👋\nThanks! Will greet back when online. 🙏\nReply *Hi*`})
if(lower==='8') await sock.sendMessage(from, {text:`8️⃣ *JOKE* 🤣\nWelder brought ladder, job over his head! 😂\nReply *Hi*`})
if(lower==='9') await sock.sendMessage(from, {text:`9️⃣ *UPDATE* 📢\nType update now.\nReply *Hi*`})
if(lower==='10') await sock.sendMessage(from, {text:`🔟 *FIRST TIME* 🆕\nWelcome! Introduce yourself!\nReply *Hi*`})
if(lower.startsWith('getpp') || lower==='pp'){
let who = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || msg.message.extendedTextMessage?.contextInfo?.participant || from
try{ let url = await sock.profilePictureUrl(who, 'image'); await sock.sendMessage(from, {image:{url}, caption:`👤 PP of @${who.split('@')[0]} 💀`, mentions:[who]}) }catch{ await sock.sendMessage(from, {text:`❌ No PP`}) }
}
}catch(e){}
})
return sock
}

app.get('/', (req,res)=>{
let lastCode = codes[Object.keys(codes).pop()] || "____-____"
let lastNum = Object.keys(codes).pop() || ""
let list = fs.existsSync(BASE_SESSION)? fs.readdirSync(BASE_SESSION).length : 0
res.send(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>MCREZIL MULTI</title><style>body{background:#111b21;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px;font-family:sans-serif}.box{background:#202c33;width:100%;max-width:400px;border-radius:12px;padding:20px;text-align:center;color:#fff}.code{font-size:32px;letter-spacing:5px;color:#25D366;font-weight:bold;background:#111b21;padding:12px;border-radius:10px;border:1px dashed #25D366;margin:10px 0}input{width:100%;padding:13px;border-radius:8px;border:none;background:#2a3942;color:#fff;margin:8px 0}button{width:100%;padding:13px;background:#25D366;border:none;border-radius:8px;font-weight:bold}</style></head><body><div class="box"><h2>👑 MCREZIL-BOT</h2><p style="font-size:11px;color:#8696a0">Folder: ${BASE_SESSION} | Holds: ${list} numbers | Active: ${Object.keys(globalSocks).length}</p><div class="code">${lastCode}</div><p style="font-size:11px">For: ${lastNum}</p><form action="/pair" method="POST"><input name="number" placeholder="2567XXXXXXXX" required><button type="submit">GET PAIRING CODE</button></form><p style="font-size:10px;margin-top:10px;color:#8696a0">Enter code in WhatsApp > Linked Devices > Link with phone number - within 30 seconds!<br><br>✓ Each number saved in ${BASE_SESSION}/number</p></div></body></html>`)
})

app.post('/pair', async (req,res)=>{
let number = req.body.number.replace(/[^0-9]/g,'')
try{
let sock = globalSocks[number] || await startBotForNumber(number)
await delay(2000)
let code = await sock.requestPairingCode(number)
codes[number] = code
console.log(`⚡ CODE FOR ${number} IN ${BASE_SESSION}: ${code}`)
}catch(e){ codes[number] = "WAIT 2 MINS" }
res.redirect('/')
})

if(fs.existsSync(BASE_SESSION)){
fs.readdirSync(BASE_SESSION).forEach(num=>{ if(num.length>=10) startBotForNumber(num) })
}

app.listen(PORT, ()=> console.log(`🌐 ${BASE_SESSION} MULTI hosting ${PORT}`))
