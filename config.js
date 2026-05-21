const path = require('path');

global.usePairingCode = true; // Set to true if you want to use pairing code, false for normal login
global.prefa = ['', '!', '.', '#', '$', ',']

global.botName = 'rafashacodeid'
global.ownerName = 'rafasha'
global.ownerNumber = '628561617643' // Replace with your WhatsApp number
global.botNumber = '6287734034677' // Nomor bot (untuk fallback admin saat grup mode @lid)
global.groupLink = 'https://chat.whatsapp.com/GW24s5fe9hgIBU4MwhhB2V' // Ganti dengan link grup kamu

const assetsDir = path.join(__dirname, 'assets', 'img');
global.assetPaths = {
    thumbnail: path.join(assetsDir, 'logo.png')
};

module.exports = {
    usePairingCode: global.usePairingCode,
    prefa: global.prefa,
    botName: global.botName,
    ownerName: global.ownerName,
    ownerNumber: global.ownerNumber,
    botNumber: global.botNumber,
    groupLink: global.groupLink,
    assetPaths: global.assetPaths
};
