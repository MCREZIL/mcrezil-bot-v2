const { default: makeWASocket, useMultiFileAuthState, delay, downloadMediaMessage, DisconnectReason } = require('@whiskeysockets/baileys')
const pino = require('pino')
const fs = require('fs')
const express = require('express')
const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const PORT = process.env.PORT || 3000
const ownerJid = "256746622284@s.whatsapp.net"
let sock;
let lastCode = "Waiting..."
let pairingNumber = "256746622284"

async function startBot() {
if (!fs.existsSync('./mcrezil_auth')) fs.mkdirSync('./mcrezil_auth', {recursive:true})
const { state, saveCreds } = await useMultiFileAuthState('mcrezil_auth')
sock = makeWASocket({
auth: state,
logger: pino({level:"silent"}),
browser: ["MCREZIL BOT","Chrome","1.0.0"],
printQRInTerminal: false
})
sock.ev.on('creds.update', saveCreds)

sock.ev.on('connection.update', async (update) => {
const { connection, lastDisconnect } = update
if (connection === 'open') {
console.log("✅ MCREZIL BOT CONNECTED SUPERSONIC!")
}
if (connection === 'close') {
let reason = lastDisconnect?.error?.output?.statusCode
if (reason!== DisconnectReason.loggedOut) startBot()
}
})

 // ==== YOUR FEATURES: AntiDelete, ViewOnce, Status, Menu ====
 sock.ev.on('messages.upsert', async ({messages}) => {
  try{
   let msg = messages[0]
   if(!msg.message) return
   const from = msg.key.remoteJid
   const isOwner = msg.key.fromMe || from === ownerJid

   // View Once Opener
   if(msg.message.viewOnceMessageV2 || msg.message.viewOnceMessage){
     let view = msg.message.viewOnceMessageV2 || msg.message.viewOnceMessage
     let media = view.message
     let type = Object.keys(media)[0]
     let buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({level:"silent"}), reuploadRequest: sock.updateMediaMessage })
     if(type === 'imageMessage') await sock.sendMessage(from, {image: buffer, caption: "👁️ MCREZIL VIEWONCE OPENED 👁️"}, {quoted: msg})
     if(type === 'videoMessage') await sock.sendMessage(from, {video: buffer, caption: "👁️ MCREZIL VIEWONCE OPENED 👁️"}, {quoted: msg})
   }
   // Auto Status View
   if(from === 'status@broadcast') {
     await sock.readMessages([msg.key])
     await sock.sendMessage(from, {react: {text:"💀", key: msg.key}})
   }
   // Menu
   let text = msg.message.conversation || msg.message.extendedTextMessage?.text || ""
   if(text.toLowerCase() === 'hi' || text.toLowerCase() === 'menu' || text.toLowerCase() === '.menu'){
     await sock.sendMessage(from, {text: "👑 *MCREZIL BOT MENU* 👑\n\n.menyu - menu\n.getpp - steal pp\n.antidelete ON\n.viewonce - auto open\n\nSupersonic Online! 💀"})
   }
  }catch(e){console.log(e)}
 })
}

 // ==== ELITE PRO TECH PAIRING WEBSITE ====
app.get('/', (req, res) => {
res.send(`
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
body{background:#0a0a0a;color:white;font-family:sans-serif;text-align:center;padding:30px}
.card{background:#1a1a1a;padding:20px;border-radius:15px;max-width:400px;margin:auto}
input{width:90%;padding:15px;border-radius:10px;border:none;margin:10px;font-size:18px}
button{padding:15px 30px;background:#25D366;color:black;border:none;border-radius:10px;font-weight:bold;font-size:18px;width:95%}
.code{font-size:35px;letter-spacing:5px;background:black;padding:15px;border-radius:10px;margin:15px;color:#25D366;font-weight:bold}
</style></head><body>
<div class="card">
<h2>👑 MCREZIL PAIRING 👑</h2>
<p>Elite Pro Tech Style</p>
<div class="code">${lastCode}</div>
<p>Your Number: ${pairingNumber}</p>
<form action="/pair" method="POST">
<input type="text" name="number" placeholder="2567XXXXXXXX" value="256746622284" required>
<button type="submit">GET NEW CODE</button>
</form>
<p style="font-size:12px;margin-top:20px">1. Click GET NEW CODE<br>2. Go to WhatsApp > Linked devices > Link with phone number<br>3. Enter code above</p>
</div></body></html>
`)
})

app.post('/pair', async (req, res) => {
let number = req.body.number.replace(/[^0-9]/g,'')
pairingNumber = number
if (!fs.existsSync('./mcrezil_auth')) fs.mkdirSync('./mcrezil_auth', {recursive:true})
try {
if(!sock) await startBot()
await delay(2000)
let code = await sock.requestPairingCode(number)
lastCode = code
console.log(`⚡ NEW ELITE CODE FOR ${number}: ${code} ⚡`)
} catch(e){
lastCode = "Error: " + e.message + " - Try again in 2 mins"
}
res.redirect('/')
})

app.listen(PORT, () => console.log(`🌐 Elite Pair Site running on port ${PORT}`))
startBot()
