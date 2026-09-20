const { default: makeWASocket, useMultiFileAuthState, delay, downloadMediaMessage, DisconnectReason } = require('@whiskeysockets/baileys')
const pino = require('pino')
const fs = require('fs')
const express = require('express')
const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const PORT = process.env.PORT || 3000
let sock;
let lastCode = "____-____"
let pairingNumber = "256746622284"
let store = {}

async function startBot() {
if (!fs.existsSync('./mcrezil_auth')) fs.mkdirSync('./mcrezil_auth', {recursive:true})
const { state, saveCreds } = await useMultiFileAuthState('mcrezil_auth')
sock = makeWASocket({ auth: state, logger: pino({level:"silent"}), browser: ["MCREZIL","Chrome","1.0.0"] })
sock.ev.on('creds.update', saveCreds)
sock.ev.on('connection.update', async (u) => {
if(u.connection==='open') console.log("✅ MCREZIL CONNECTED!")
if(u.connection==='close' && u.lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut) startBot()
})

sock.ev.on('messages.upsert', async ({messages}) => {
try{
let msg = messages[0]; if(!msg.message) return
let from = msg.key.remoteJid
let text = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "").trim()
store[msg.key.id] = msg

if(from === 'status@broadcast'){ await sock.readMessages([msg.key]); try{ await sock.sendMessage(from, {react:{text:"💀", key:msg.key}})}catch{} return }

if(msg.message.viewOnceMessageV2 || msg.message.viewOnceMessage){
let view = msg.message.viewOnceMessageV2 || msg.message.viewOnceMessage
let type = Object.keys(view.message)[0]
let buffer = await downloadMediaMessage(msg, 'buffer', {}, {logger:pino({level:"silent"}), reuploadRequest: sock.updateMediaMessage})
let cap = "👁️ *MCREZIL VIEWONCE OPENED* 👁️"
if(type==='imageMessage') await sock.sendMessage(from, {image: buffer, caption: cap}, {quoted: msg})
if(type==='videoMessage') await sock.sendMessage(from, {video: buffer, caption: cap}, {quoted: msg})
}

if(msg.message.protocolMessage && msg.message.protocolMessage.type === 0){
let del = store[msg.message.protocolMessage.key.id]
if(del){
let delText = del.message.conversation || del.message.extendedTextMessage?.text || "Media"
await sock.sendMessage(from, {text: `🚨 *ANTI-DELETE* 🚨\n\n👤 @${del.key.participant?.split('@')[0] || from.split('@')[0]} deleted: ${delText}`, mentions: [del.key.participant || from]})
}
}

let lower = text.toLowerCase()
if(lower.startsWith('hi') || lower.startsWith('hello') || lower==='hey'){
await sock.sendMessage(from, {text: `Hi 👋 Good moment! ✨\n\n*Welcome to Mcrezil Chat Bot* 🤖\n\nAll messages and replies are according to *Mcrezil Chat Bot* - Real conversation will be when he is online himself 💀\n\n*Choose 1-10:*\n\n1️⃣ Have a business conversation\n2️⃣ Have a friend conversation\n3️⃣ Have a family conversation\n4️⃣ Want to talk to Him about workshop\n5️⃣ Want to order a case\n6️⃣ Want an already made door, window or both\n7️⃣ Just greetings to Him\n8️⃣ Joke and Fun's 🤣🤣🤣\n9️⃣ Update him about something\n🔟 First time to contact Him\n\n_Reply with number_ 👇`}); return
}
if(lower==='1') await sock.sendMessage(from, {text:`1️⃣ *BUSINESS* 💼\n\nThanks for business! Tell me business, budget, deadline?\n\n_This is auto reply by Mcrezil Chat Bot, real talk when he is online himself_ 👑\n\nReply *Hi* for menu.`})
else if(lower==='2') await sock.sendMessage(from, {text:`2️⃣ *FRIEND* 🤝\nYo! What's up! Mcrezil offline but will reply soon.\n\n_This is auto reply by Mcrezil Chat Bot, real gist when online_ 💀\n\nReply *Hi* for menu.`})
else if(lower==='3') await sock.sendMessage(from, {text:`3️⃣ *FAMILY* 👨‍👩‍👧‍👦\nFamily is everything! ❤️ Drop message he will reply when online.\n\n_This is auto reply by Mcrezil Chat Bot, real talk when online_ 🙏\n\nReply *Hi* for menu.`})
else if(lower==='4') await sock.sendMessage(from, {text:`4️⃣ *WORKSHOP* 🔧\nKampala - Doors, Windows, Gates, Welding. What you want about workshop?\n\n_This is auto reply by Mcrezil Chat Bot, real talk when online_ 👑\n\nReply *Hi* for menu.`})
else if(lower==='5') await sock.sendMessage(from, {text:`5️⃣ *ORDER CASE* 📦\nSend Type, Measurements, Design photo, Location.\n\n_This is auto reply by Mcrezil Chat Bot, real order when online_ 💼\n\nReply *Hi* for menu.`})
else if(lower==='6') await sock.sendMessage(from, {text:`6️⃣ *READY MADE* 🚪🪟\nYes we have ready doors/windows! Tell size you need.\n\n_This is auto reply by Mcrezil Chat Bot, real check when online_ 🏭\n\nReply *Hi* for menu.`})
else if(lower==='7') await sock.sendMessage(from, {text:`7️⃣ *GREETINGS* 👋\nThanks for greeting Mcrezil! Will greet back when online. 🙏💀\n\n_This is auto reply by Mcrezil Chat Bot_\n\nReply *Hi* for menu.`})
else if(lower==='8') await sock.sendMessage(from, {text:`8️⃣ *JOKE* 🤣\nWhy welder bring ladder? Job was over his head! 😂\nMcrezil doors so strong even ex can't break in! 🤣\n\n_This is auto reply by Mcrezil Chat Bot_\n\nReply *Hi* for menu.`})
else if(lower==='9') await sock.sendMessage(from, {text:`9️⃣ *UPDATE* 📢\nOkay update Mcrezil! Type your update now I keep for him.\n\n_This is auto reply by Mcrezil Chat Bot, real seen when online_ 👑\n\nReply *Hi* for menu.`})
else if(lower==='10') await sock.sendMessage(from, {text:`🔟 *FIRST TIME* 🆕\nWelcome! Introduce yourself, where you got number and what you need!\n\n_This is auto reply by Mcrezil Chat Bot, real welcome when online himself_ ✨\n\nReply *Hi* for menu.`})

if(lower.startsWith('getpp') || lower.startsWith('.getpp') || lower==='pp'){
let who = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || msg.message.extendedTextMessage?.contextInfo?.participant || from
try{ let url = await sock.profilePictureUrl(who, 'image'); await sock.sendMessage(from, {image:{url}, caption:`👤 PP of @${who.split('@')[0]} - Stolen by Mcrezil 💀`, mentions:[who]}) }catch{ await sock.sendMessage(from, {text:`❌ No PP! Reply to someone with getpp`}) }
}
}catch(e){console.log(e.message)}
})
}

// ===== ELITEPRO TECH STYLE PAIRING PAGE =====
app.get('/', (req,res)=>{
res.send(`
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MCREZIL - Elite Pair</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:Arial,sans-serif}
body{background:#111b21;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}
.box{background:#202c33;width:100%;max-width:420px;border-radius:12px;padding:25px;box-shadow:0 0 20px rgba(0,0,0,0.5);text-align:center;color:#fff}
.logo{width:80px;height:80px;background:#25D366;border-radius:50%;margin:0 auto 15px;display:flex;align-items:center;justify-content:center;font-size:40px}
h2{color:#fff;margin-bottom:5px} p.sub{color:#8696a0;font-size:13px;margin-bottom:20px}
.code-box{background:#111b21;border:1px dashed #25D366;border-radius:10px;padding:20px;margin:15px 0}
.code{font-size:36px;letter-spacing:6px;color:#25D366;font-weight:bold;font-family:monospace}
.timer{color:#8696a0;font-size:12px;margin-top:8px}
input{width:100%;padding:14px;border-radius:8px;border:1px solid #2a3942;background:#2a3942;color:#fff;font-size:16px;margin:10px 0;outline:none}
input:focus{border-color:#25D366}
button.main{width:100%;padding:14px;background:#25D366;color:#111b21;border:none;border-radius:8px;font-weight:bold;font-size:16px;cursor:pointer;margin-top:10px}
button.copy{padding:8px 15px;background:#2a3942;color:#fff;border:none;border-radius:6px;font-size:12px;margin-top:10px;cursor:pointer}
.steps{text-align:left;background:#111b21;border-radius:8px;padding:12px;margin-top:15px;font-size:12px;color:#8696a0;line-height:1.6}
.footer{margin-top:15px;font-size:11px;color:#8696a0}
</style>
</head><body>
<div class="box">
<div class="logo">👑</div>
<h2>MCREZIL BOT</h2>
<p class="sub">EliteProTech Style Pairing</p>

<div class="code-box">
<div class="code" id="code">${lastCode}</div>
<div class="timer" id="timer">Code expires in 60s - Get new one</div>
<button class="copy" onclick="copyCode()">📋 COPY CODE</button>
</div>

<form action="/pair" method="POST">
<input type="text" name="number" placeholder="Enter WhatsApp Number with country code" value="${pairingNumber}" required>
<button class="main" type="submit">GET PAIRING CODE</button>
</form>

<div class="steps">
<b>How to link:</b><br>
1. Click GET PAIRING CODE<br>
2. Open WhatsApp on your phone<br>
3. Go to Settings > Linked Devices<br>
4. Tap Link with phone number<br>
5. Enter the code above
</div>

<div class="footer">
✓ AntiDelete ✓ ViewOnce ✓ Auto Status 💀 ✓ getpp ✓ Hi Menu 1-10<br><br>
Powered by Mcrezil Supersonic © 2026
</div>
</div>
<script>
function copyCode(){
let c=document.getElementById('code').innerText;
navigator.clipboard.writeText(c);
alert('Code copied: '+c)
}
</script>
</body></html>
`)
})

app.post('/pair', async (req,res)=>{
let number = req.body.number.replace(/[^0-9]/g,'')
pairingNumber = number
try{
if(!sock) await startBot()
await delay(2000)
let code = await sock.requestPairingCode(number)
lastCode = code
console.log(`⚡ ELITE CODE FOR ${number}: ${code}`)
}catch(e){ lastCode = "WAIT 2 MINS"; console.log(e.message) }
res.redirect('/')
})

app.listen(PORT, ()=> console.log(`🌐 ElitePro Style running on ${PORT}`))
startBot()
