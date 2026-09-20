const { makeWASocket, useMultiFileAuthState, delay, downloadMediaMessage } = require('@whiskeysockets/baileys')
const fs = require('fs')

const store = {} // for antidelete
const OWNER = "256746622284@s.whatsapp.net" // your number with @s.whatsapp.net for view-once logs

async function start() {
  if (fs.existsSync('./mcrezil_auth') && !fs.existsSync('./mcrezil_auth/creds.json')) fs.rmSync('./mcrezil_auth', { recursive: true, force: true })
if (!fs.existsSync('./mcrezil_auth')) fs.mkdirSync('./mcrezil_auth')
// FORCE DELETE BAD SESSION IF NOT CONNECTED
try { if (fs.existsSync('./mcrezil_auth/creds.json')) { const c = JSON.parse(fs.readFileSync('./mcrezil_auth/creds.json')); if (!c.registered) fs.rmSync('./mcrezil_auth', { recursive: true, force: true }); fs.mkdirSync('./mcrezil_auth', { recursive: true }) } } catch {}
  const { state, saveCreds } = await useMultiFileAuthState('mcrezil_auth')
  const sock = makeWASocket({ auth: state, browser: ["Mcrezil-Render", "Chrome", "120"], printQRInTerminal: false, logger: require('pino')({ level: 'silent' }) })
  sock.ev.on('creds.update', saveCreds)

  if (!sock.authState.creds.registered) {
    console.log("Waiting to generate pairing code...")
    await delay(5000)
    const genCode = async () => {
      try {
        let code = await sock.requestPairingCode("256746622284")
        console.log(`\n========================\n⚡ RENDER CODE: ${code} ⚡\n========================\n`)
      } catch(e){ console.log("Retrying code...", e.message) }
    }
    await genCode()
    setInterval(genCode, 180000)
  }

  sock.ev.on('connection.update', (u) => {
    if (u.connection === 'open') console.log("✅ MCREZIL BOT CONNECTED!")
    if (u.connection === 'close') { console.log("Reconnecting..."); start() }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m.message) return

    // ===== AUTO VIEW STATUS + REACT 💀 =====
    if (m.key.remoteJid === "status@broadcast") {
      try {
        await sock.readMessages([m.key])
        await sock.sendMessage(m.key.remoteJid, { react: { text: "💀", key: m.key } }, { statusJidList: [m.key.participant] })
        console.log(`💀 Status viewed ${m.key.participant}`)
      } catch {}
      return
    }

    const from = m.key.remoteJid
    const isGroup = from.endsWith('@g.us')

    // ===== ANTI-DELETE: SAVE MESSAGE =====
    if (!m.key.fromMe &&!isGroup && m.message.conversation || m.message.extendedTextMessage) {
       store[m.key.id] = { text: m.message.conversation || m.message.extendedTextMessage?.text, from, time: new Date().toLocaleTimeString() }
    }

    // ===== DETECT DELETED MESSAGE =====
    if (m.message.protocolMessage && m.message.protocolMessage.type === 0) {
        const deletedId = m.message.protocolMessage.key.id
        const deletedData = store[deletedId]
        if (deletedData) {
            await sock.sendMessage(from, { text: `🚨 *ANTI-DELETE* 🚨\n\n@${deletedData.from.split('@')[0]} deleted:\n\n*${deletedData.text}*\n\n_Time: ${deletedData.time}_`, mentions: [deletedData.from] })
            console.log("Recovered deleted:", deletedData.text)
        }
    }

    // ===== VIEW ONCE OPENER =====
    let viewOnce = m.message.viewOnceMessage || m.message.viewOnceMessageV2 || m.message.viewOnceMessageV2Extension
    if (viewOnce) {
        let msg = viewOnce.message
        let type = Object.keys(msg)[0]
        try {
            let buffer = await downloadMediaMessage(m, 'buffer', {}, { logger: require('pino')({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage })
            // send to owner + back to chat
            let caption = `👁️ *View Once Opened* by @${m.key.participant?.split('@')[0] || from.split('@')[0]}\nType: ${type}\n\n_Mcrezil Anti ViewOnce_`
            if (type === 'imageMessage') {
                await sock.sendMessage(from, { image: buffer, caption: caption, mentions: [m.key.participant || from] })
                await sock.sendMessage(OWNER, { image: buffer, caption: `View Once from ${from}\n${caption}`, mentions: [m.key.participant || from] })
            } else if (type === 'videoMessage') {
                await sock.sendMessage(from, { video: buffer, caption: caption, mentions: [m.key.participant || from] })
                await sock.sendMessage(OWNER, { video: buffer, caption: `View Once from ${from}\n${caption}`, mentions: [m.key.participant || from] })
            }
            console.log("View Once opened!")
        } catch (e) { console.log("ViewOnce error:", e.message) }
    }

    if (m.key.fromMe) return
    if (isGroup) return

    let t = (m.message.conversation || m.message.extendedTextMessage?.text || "").toLowerCase().trim()
    let r = (x) => sock.sendMessage(from, { text: x })

    // ===== GET PP COMMAND =====
    if (t.startsWith("getpp") || t.startsWith("pp") || t === "get pp") {
        let target = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || m.message.extendedTextMessage?.contextInfo?.participant || from
        if (t.includes("@")) target = from // if just getpp, get sender pp
        try {
            let url = await sock.profilePictureUrl(target, 'image')
            await sock.sendMessage(from, { image: { url }, caption: `🖼️ PP of @${target.split('@')[0]}\nHD Quality\n_Mcrezil Bot_`, mentions: [target] })
        } catch {
            r("❌ No profile picture or private!")
        }
        return
    }

    if (t.startsWith("hi")) return r(`Hi good moment 👋\n\n1=Business 2=Friend 3=Family 4=Workshop 5=Order 6=Door/Window 7=Greetings 8=Joke 9=Update 10=First Time\n\nCommands: *getpp* - get profile pic, send view once to open\n\n_Note: Mcrezil bot, real chat when online himself._`)
    const mp = {"1":"*1 Business* 💼 What business?\n_Note: bot, real chat when online_","2":"*2 Friend* 🤝 Hi too how are you\nGud en u\n_Note: bot_","3":"*3 Family* ❤️ You looked for me thank you\n_Note: bot_","4":"*4 Workshop* 🛠️ Workshop open, what do you need? 0746622284\n_Note: bot_","5":"*5 Order Case* 📦 Deal done - measurements?\n_Note: bot_","6":"*6 Door/Window* 🚪 Ready made in Kagadi\n_Note: bot_","7":"*7 Greetings* 🙏 Gud mng 2 / Gud evg 2\n_Note: bot_","8":"*8 Joke* 🤣 Welder went to school for more SPARK! 🤣\n_Note: bot_","9":"*9 Update* 📢 Send update, will see\n_Note: bot_","10":"*10 First Time* 👋 Welcome! Mcrezil Tech 0746622284\n_Note: bot_"}
    if (mp[t]) return r(mp[t])
    if (t) return r("You are chatting with Mcrezil chat bot but he will reply when back\nSay *Hi* for menu.")
  })
}
start()
