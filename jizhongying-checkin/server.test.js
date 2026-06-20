const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

test("访客可以共享读取带有服务端时间的打卡记录", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "checkin-test-"));
  const port = 32100 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, [path.join(__dirname, "server.js")], { env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DATA_DIR: dataDir }, stdio: "ignore" });
  t.after(async () => { child.kill(); await fs.rm(dataDir, { recursive: true, force: true }); });

  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const created = await fetch(`${base}/api/checkins`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "阿强", note: "" }) });
  assert.equal(created.status, 201);
  const payload = await created.json();
  assert.equal(payload.checkins[0].name, "阿强");
  assert.equal(payload.checkins[0].note, "已练不欠");
  assert.ok(!Number.isNaN(Date.parse(payload.checkins[0].createdAt)));

  const shared = await (await fetch(`${base}/api/checkins`)).json();
  assert.deepEqual(shared.checkins, payload.checkins);
});
