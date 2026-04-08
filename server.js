const express = require("express");
const Database = require("better-sqlite3");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3377;

// --- Database setup ---
const db = new Database(path.join(__dirname, "usage.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS usage_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    five_hour_pct REAL,
    five_hour_resets_at TEXT,
    seven_day_pct REAL,
    seven_day_resets_at TEXT,
    rate_limit_tier TEXT,
    extra_used_credits REAL,
    extra_monthly_limit REAL,
    extra_utilization REAL,
    raw_json TEXT
  )
`);

// Migrate: add extra columns if missing
try {
  db.exec(`ALTER TABLE usage_snapshots ADD COLUMN extra_used_credits REAL`);
  db.exec(`ALTER TABLE usage_snapshots ADD COLUMN extra_monthly_limit REAL`);
  db.exec(`ALTER TABLE usage_snapshots ADD COLUMN extra_utilization REAL`);
} catch {
  // columns already exist
}

// --- Token reader ---
function getToken() {
  const credPath = path.join(
    process.env.HOME || process.env.USERPROFILE,
    ".claude",
    ".credentials.json"
  );
  const creds = JSON.parse(fs.readFileSync(credPath, "utf-8"));
  return creds.claudeAiOauth?.accessToken;
}

// --- Fetch usage from Anthropic ---
async function fetchUsage() {
  const token = getToken();
  if (!token) {
    console.error("[claudemonit] No token found in ~/.claude/.credentials.json");
    return null;
  }

  try {
    const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error(`[claudemonit] Usage API returned ${res.status}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error("[claudemonit] Fetch error:", err.message);
    return null;
  }
}

// --- Record a snapshot ---
async function recordSnapshot() {
  const data = await fetchUsage();
  if (!data) return;

  const credPath = path.join(
    process.env.HOME || process.env.USERPROFILE,
    ".claude",
    ".credentials.json"
  );
  const creds = JSON.parse(fs.readFileSync(credPath, "utf-8"));
  const tier = creds.claudeAiOauth?.rateLimitTier || null;

  const extra = data.extra_usage || {};

  const stmt = db.prepare(`
    INSERT INTO usage_snapshots (five_hour_pct, five_hour_resets_at, seven_day_pct, seven_day_resets_at, rate_limit_tier, extra_used_credits, extra_monthly_limit, extra_utilization, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    data.five_hour?.utilization ?? null,
    data.five_hour?.resets_at ?? null,
    data.seven_day?.utilization ?? null,
    data.seven_day?.resets_at ?? null,
    tier,
    extra.used_credits ?? null,
    extra.monthly_limit ?? null,
    extra.utilization ?? null,
    JSON.stringify(data)
  );

  console.log(
    `[claudemonit] ${new Date().toISOString()} | 5h: ${data.five_hour?.utilization ?? "?"}% | 7d: ${data.seven_day?.utilization ?? "?"}%`
  );
}

// --- Cron: every 5 minutes ---
cron.schedule("*/5 * * * *", () => {
  recordSnapshot();
});

// --- API: get snapshots ---
app.get("/api/snapshots", (req, res) => {
  const hours = parseInt(req.query.hours) || 24;
  const rows = db
    .prepare(
      `SELECT * FROM usage_snapshots WHERE timestamp >= datetime('now', '-${hours} hours') ORDER BY timestamp ASC`
    )
    .all();
  res.json(rows);
});

app.get("/api/latest", (_req, res) => {
  const row = db
    .prepare("SELECT * FROM usage_snapshots ORDER BY id DESC LIMIT 1")
    .get();
  res.json(row || {});
});

// Force a snapshot now
app.post("/api/snapshot", async (_req, res) => {
  await recordSnapshot();
  const row = db
    .prepare("SELECT * FROM usage_snapshots ORDER BY id DESC LIMIT 1")
    .get();
  res.json(row || {});
});

// --- Serve frontend ---
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.use(express.static(path.join(__dirname, "public")));

// --- Start ---
app.listen(PORT, async () => {
  console.log(`[claudemonit] Running on http://localhost:${PORT}`);
  console.log("[claudemonit] Taking initial snapshot...");
  await recordSnapshot();
});
