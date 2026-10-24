# Kebijakan Keamanan

## Versi yang didukung

Perbaikan keamanan ditujukan untuk versi kode terbaru di branch utama. Pengguna disarankan memperbarui dependensi dan menggunakan versi terbaru.

## Melaporkan kerentanan

Jangan melaporkan kerentanan yang belum diperbaiki melalui issue publik. Hubungi pengelola secara langsung melalui email yang tercantum pada bagian Kontak di README, dan sertakan:

- Ringkasan kerentanan dan dampak yang mungkin terjadi.
- Langkah reproduksi yang aman, atau bukti konsep minimal.
- Versi Node.js dan commit/versi proyek yang terdampak.
- Informasi tambahan yang dapat membantu verifikasi.

Mohon beri waktu yang wajar untuk meninjau laporan dan menyiapkan perbaikan sebelum mengungkapkan detailnya secara publik. Jangan menyertakan kredensial, data pribadi, atau sesi WhatsApp aktif dalam laporan.

## Menjaga keamanan instalasi

- Jangan pernah membagikan folder `session/`; isinya dapat memberikan akses ke akun WhatsApp yang tertaut.
- Jangan mengunggah nomor pribadi, token, kredensial, atau isi log sensitif ke issue maupun pull request publik.
- Batasi akses mesin dan akun yang menjalankan bot, serta perbarui dependensi secara berkala.
