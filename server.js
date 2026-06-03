const express = require("express");
const fs = require("fs");
const session = require("express-session");

const app = express();
const flag = fs.readFileSync("/flag.txt", "utf8").trim();

app.use(express.json({ limit: "32kb" }));
app.use(
  session({
    secret: "report-vault-local-secret",
    resave: false,
    saveUninitialized: true,
  })
);

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

function ensureUser(req, _res, next) {
  if (!req.session.user) {
    req.session.user = {
      username: "guest",
      reportAccess: "public",
      preferences: {
        theme: "light",
        exportFormat: "pdf",
      },
    };
  }
  next();
}

function isAdmin(user) {
  return user.role === "admin" && user.canExportPrivate === true;
}

app.use(ensureUser);

app.get("/", (req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Report Vault</title>
    <style>
      :root {
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #172033;
        background: #f4f7fb;
      }
      body { margin: 0; }
      main {
        width: min(980px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 48px 0;
      }
      .grid {
        display: grid;
        grid-template-columns: minmax(300px, 1fr) minmax(300px, 1fr);
        gap: 20px;
      }
      textarea, pre, .panel {
        background: #fff;
        border: 1px solid #d9e0ea;
        border-radius: 8px;
        box-shadow: 0 12px 32px rgba(23, 32, 51, 0.08);
      }
      textarea {
        box-sizing: border-box;
        width: 100%;
        min-height: 250px;
        padding: 14px;
        font: 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      pre {
        min-height: 180px;
        overflow: auto;
        padding: 14px;
        white-space: pre-wrap;
      }
      .panel { padding: 18px; }
      button, a.button {
        display: inline-flex;
        align-items: center;
        border: 0;
        border-radius: 6px;
        background: #334155;
        color: #fff;
        cursor: pointer;
        font: inherit;
        font-weight: 800;
        margin-top: 10px;
        padding: 10px 14px;
        text-decoration: none;
      }
      a { color: #1d4ed8; }
      code {
        background: #e9eef7;
        border-radius: 4px;
        padding: 2px 5px;
      }
      @media (max-width: 760px) {
        .grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Report Vault</h1>
      <p>Dashboard internal untuk menyimpan preferensi export laporan divisi. Akun tamu hanya boleh melihat laporan publik.</p>
      <div class="grid">
        <section>
          <h2>Preference JSON</h2>
          <textarea id="body">{"preferences":{"theme":"light","exportFormat":"pdf"}}</textarea>
          <button id="save">Save preferences</button>
        </section>
        <section>
          <h2>Response</h2>
          <pre id="out"></pre>
          <a class="button" href="/reports/private">Open private report</a>
        </section>
      </div>
      <p>Current session user: <code>${req.session.user.username}</code></p>
    </main>
    <script>
      save.onclick = async () => {
        const res = await fetch('/api/preferences', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: body.value
        });
        out.textContent = await res.text();
      };
    </script>
  </body>
</html>`);
});

app.get("/healthz", (_req, res) => {
  res.send("ok");
});

app.get("/api/me", (req, res) => {
  res.json({ user: req.session.user, admin: isAdmin(req.session.user) });
});

app.post("/api/preferences", (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ error: "JSON object required" });
  }

  mergeDeep(req.session.user, req.body);
  res.json({ ok: true, user: req.session.user });
});

app.get("/reports/private", (req, res) => {
  if (!isAdmin(req.session.user)) {
    return res.status(403).send("private report requires admin export access");
  }

  res.type("text/plain").send(`Quarterly confidential report\nstatus=approved\nflag=${flag}\n`);
});

app.listen(8000, "0.0.0.0");

