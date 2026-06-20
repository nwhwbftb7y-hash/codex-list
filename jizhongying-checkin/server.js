const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "checkins.json");
const MAX_BODY_SIZE = 16 * 1024;
const staticFiles = new Map([["/", ["index.html", "text/html; charset=utf-8"]], ["/app.js", ["app.js", "text/javascript; charset=utf-8"]], ["/styles.css", ["styles.css", "text/css; charset=utf-8"]]]);

let writeQueue = Promise.resolve();

async function readCheckins() {
  try {
    const data = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function saveCheckins(checkins) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temporary = `${DATA_FILE}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(checkins, null, 2), "utf8");
  await fs.rename(temporary, DATA_FILE);
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_SIZE) reject(Object.assign(new Error("请求内容过大"), { status: 413 }));
    });
    request.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); } catch { reject(Object.assign(new Error("请求格式不正确"), { status: 400 })); }
    });
    request.on("error", reject);
  });
}

async function handleApi(request, response, pathname) {
  if (pathname !== "/api/checkins") return false;
  if (request.method === "GET") {
    sendJson(response, 200, { checkins: await readCheckins() });
    return true;
  }
  if (request.method === "POST") {
    const body = await readBody(request);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (!name || name.length > 30) throw Object.assign(new Error("姓名需为 1—30 个字符"), { status: 400 });
    if (note.length > 200) throw Object.assign(new Error("心得不能超过 200 个字符"), { status: 400 });

    const task = writeQueue.then(async () => {
      const checkins = await readCheckins();
      checkins.unshift({ id: crypto.randomUUID(), name, note: note || "已练不欠", createdAt: new Date().toISOString() });
      await saveCheckins(checkins);
      return checkins;
    });
    writeQueue = task.catch(() => {});
    sendJson(response, 201, { checkins: await task });
    return true;
  }
  response.writeHead(405, { Allow: "GET, POST" });
  response.end();
  return true;
}

const server = http.createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, `http://${request.headers.host || "localhost"}`).pathname;
    if (await handleApi(request, response, pathname)) return;
    const staticFile = staticFiles.get(pathname);
    if (!staticFile || request.method !== "GET") { response.writeHead(404); response.end("Not found"); return; }
    const [file, contentType] = staticFile;
    response.writeHead(200, { "Content-Type": contentType, "X-Content-Type-Options": "nosniff" });
    response.end(await fs.readFile(path.join(ROOT, file)));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, error.status || 500, { error: error.status ? error.message : "服务器开小差了，请稍后再试" });
    else response.end();
  }
});

server.listen(PORT, HOST, () => console.log(`集中营打卡运行在 http://localhost:${PORT}`));
