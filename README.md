# BASE-BOT-WHATSAPP

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

Bot WhatsApp multi-device open-source berbasis **Node.js** dan **Baileys**. BASE-BOT-WHATSAPP menyediakan pairing code atau QR login, moderasi grup WhatsApp (antilink dan antipromosi), perintah admin, broadcast, kalkulator, dan utilitas bot. Cocok sebagai starter project untuk mengembangkan WhatsApp bot dengan JavaScript.

## Fitur

- Autentikasi WhatsApp melalui pairing code atau QR.
- Perintah informasi bot, kalkulator, dan informasi pemilik.
- Moderasi tautan dan promosi yang dapat diatur per grup.
- Administrasi anggota dan pengelolaan grup.
- Pengujian dan pemeriksaan sintaks menggunakan Node.js.

## Persyaratan

- Node.js 20 atau lebih baru
- npm
- Akun WhatsApp untuk menghubungkan bot

## Instalasi

Klon repositori, lalu pasang dependensi:

```bash
git clone https://github.com/rafashaalfiandi/BASE-BOT-WHATSHAPP.git
cd BASE-BOT-WHATSHAPP
npm install
```

## Konfigurasi

Sebelum menjalankan bot, buka `config.js` dan sesuaikan pengaturan berikut:

| Pengaturan | Keterangan |
| --- | --- |
| `global.botName` | Nama bot yang ditampilkan |
| `global.ownerName` | Nama pemilik bot |
| `global.ownerNumber` | Nomor pemilik dalam format internasional, misalnya `6281234567890` |
| `global.botNumber` | Nomor akun WhatsApp bot; opsional |
| `global.groupLink` | Tautan grup dukungan; opsional |
| `global.prefa` | Daftar awalan perintah; bawaan `!`, `.`, `#`, `$`, dan `,` |
| `global.usePairingCode` | `true` untuk pairing code (bawaan), `false` untuk QR |

Simpan perubahan sebelum melanjutkan. Nomor pemilik digunakan untuk mengotorisasi perintah khusus pemilik.

## Menjalankan bot

Pastikan konfigurasi sudah diisi, kemudian jalankan dari direktori proyek:

```bash
npm start
```

Terminal akan meminta proses autentikasi sesuai metode yang dipilih. Di WhatsApp, buka **Perangkat tertaut** untuk menautkan akun:

- **Pairing code:** masukkan nomor WhatsApp dengan awalan `62` di terminal. Di WhatsApp, pilih **Tautkan dengan nomor telepon** dan masukkan kode yang ditampilkan terminal.
- **QR:** ubah `global.usePairingCode` menjadi `false`, jalankan `npm start`, lalu pindai QR yang muncul menggunakan fitur **Tautkan perangkat**.

Biarkan proses terminal tetap berjalan agar bot tetap aktif. Untuk menghentikannya, tekan `Ctrl+C`. Sesi yang sudah tertaut disimpan di folder `session/`, sehingga biasanya tidak perlu menautkan ulang setiap kali bot dijalankan.

## Perintah

Awalan perintah mengikuti nilai `global.prefa`. Contoh berikut menggunakan awalan titik (`.`).

### Informasi dan utilitas

| Perintah | Fungsi | Akses |
| --- | --- | --- |
| `.ping` | Menampilkan latensi, informasi sistem, dan waktu aktif. | Semua pengguna |
| `.calc <rumus>` | Menghitung operasi `+`, `-`, `*`, `/`, dan tanda kurung. | Semua pengguna |
| `.owner` | Menampilkan informasi pemilik yang dikonfigurasi. | Semua pengguna |
| `.id` | Menampilkan ID grup saat ini. | Grup |

Contoh kalkulator: `.calc 12 * (3 + 2)`.

### Administrasi grup

| Perintah | Fungsi | Akses |
| --- | --- | --- |
| `.kick @anggota` | Mengeluarkan anggota dari grup. | Admin grup; bot juga harus admin |
| `.promote @anggota` | Menjadikan anggota sebagai admin. | Admin grup; bot juga harus admin |
| `.demote @anggota` | Menurunkan admin menjadi anggota. | Admin grup; bot juga harus admin |
| `.hidetag <teks>` atau `.ht <teks>` | Mengirim teks dengan menyebut semua anggota. | Admin grup |
| `.tagall` | Menyebut semua anggota grup. | Admin grup |
| `.antilink on` / `.antilink off` | Mengaktifkan atau menonaktifkan moderasi tautan. | Admin grup |
| `.antipromosi on` / `.antipromosi off` | Mengaktifkan atau menonaktifkan moderasi promosi. | Admin grup |

### Perintah pemilik

| Perintah | Fungsi |
| --- | --- |
| `.autoread on` / `.autoread off` | Mengaktifkan atau menonaktifkan tanda baca pesan. Pengaturan ini kembali nonaktif saat bot dimulai ulang. |
| `.onlygc on` / `.onlygc off` | Membatasi bot agar hanya dapat digunakan di grup. |
| `.onlyprib on` / `.onlyprib off` | Membatasi bot agar hanya dapat digunakan di chat pribadi. |
| `.join <tautan-grup>` | Meminta bot bergabung ke grup melalui tautan undangan. |
| `.leave` | Meminta bot keluar dari grup saat ini. |
| `.listgc` | Menampilkan daftar grup yang diikuti bot. |
| `.broadcast <teks> [notag]` atau `.bc <teks> [notag]` | Mengirim pesan ke grup yang diikuti bot. Secara bawaan pesan menyebut anggota; tambahkan `notag` untuk menonaktifkan sebutan. Perintah ini juga mendukung balasan terhadap pesan. |

Perintah administrasi grup memerlukan hak admin yang sesuai. Beberapa tindakan, seperti menghapus pesan moderasi atau mengelola anggota, juga mengharuskan bot menjadi admin grup.

## Pengujian

Jalankan perintah berikut dari direktori proyek:

```bash
npm test
npm run check
```

## Privasi dan keamanan

- Jangan unggah atau bagikan folder `session/`. Isinya mencakup kredensial autentikasi WhatsApp.
- Folder `database/` menyimpan status moderasi dan pengaturan lokal. Data tersebut dibuat otomatis saat diperlukan dan tidak perlu dimasukkan ke repositori publik.
- `DEBUG_ADMIN=1` dan `LOG_EVERY_MESSAGE=1` mengaktifkan log tambahan yang dapat memuat ID chat atau isi pesan. Gunakan hanya saat diperlukan.
- Baileys adalah library tidak resmi. Otomatisasi WhatsApp dapat berisiko menyebabkan pembatasan akun; gunakan dengan tanggung jawab.

## Lisensi

Proyek ini menggunakan [Apache License 2.0](LICENSE).

## Kontribusi dan kebijakan proyek

Kontribusi, laporan bug, dan saran perbaikan sangat dihargai. Sebelum berpartisipasi, silakan baca [Code of Conduct](CODE_OF_CONDUCT.md) dan [kebijakan keamanan](SECURITY.md). Untuk kerentanan keamanan, gunakan prosedur pelaporan privat yang dijelaskan di sana, bukan issue publik.

## Kontak

- GitHub: [rafashaalfiandi](https://github.com/rafashaalfiandi)
- Instagram: [rafashacode.id](https://instagram.com/rafashacode.id)
- Telegram: [rafashaalfiandi](https://t.me/rafashaalfiandi)
- Email: [rafashacode.id@gmail.com](mailto:rafashacode.id@gmail.com)
