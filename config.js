const path = require('path');

global.usePairingCode = true; // Set to true if you want to use pairing code, false for normal login
global.prefa = ['', '!', '.', '#', '$', ',']

global.botName = 'MyWhatsAppBot'
global.ownerName = 'Owner'
global.ownerNumber = '' // Isi nomor owner format internasional, contoh: 6281234567890
global.botNumber = '' // Opsional: nomor akun bot format internasional
global.groupLink = '' // Opsional: tautan grup dukungan milikmu

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
