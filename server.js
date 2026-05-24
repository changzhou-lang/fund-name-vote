import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const dataDir = process.env.DATA_DIR || path.join(__dirname, "outputs", "name-vote-data");
const namesDataPath = path.join(dataDir, "names.json");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const seedNames = [
  { chinese: "远岳", english: "Farpeak Capital", style: "山 / 高度", note: "高山仰止，景行行止" },
  { chinese: "观岳", english: "Summitview Capital", style: "山 / 高度", note: "高屋建瓴，登高望远" },
  { chinese: "恒峰", english: "Everpeak Capital", style: "山 / 高度", note: "持之以恒，峰回路转" },
  { chinese: "清源", english: "Clearsource Capital", style: "水 / 源头", note: "正本清源，源远流长" },
  { chinese: "澄泉", english: "Clearspring Capital", style: "水 / 源头", note: "澄怀观道，饮水思源" },
  { chinese: "启曜", english: "Firstlight Capital", style: "光 / 时间", note: "启明星明，旭日初升" },
  { chinese: "明晖", english: "Brighthorizon Capital", style: "光 / 时间", note: "光风霁月，晖光日新" },
  { chinese: "晨曜", english: "Dawnlight Capital", style: "光 / 时间", note: "晨光熹微，日新月异" },
  { chinese: "弘道", english: "NoblePath Capital", style: "成语 / 道远", note: "任重道远，人能弘道" },
  { chinese: "行远", english: "Steadypath Capital", style: "成语 / 道远", note: "行稳致远，久久为功" },
  { chinese: "致远", english: "Longview Capital", style: "成语 / 远见", note: "淡泊明志，宁静致远" }
].map((item, index) => ({
  id: `seed-${index + 1}`,
  votes: 0,
  createdAt: "2026-05-24T00:00:00.000Z",
  ...item
}));

function sendJson(res, status, payload) {
  res.writeHead(status, jsonHeaders);
  res.end(JSON.stringify(payload));
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function saveNames(names) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(namesDataPath, `${JSON.stringify({ names }, null, 2)}\n`, "utf8");
}

async function loadNames() {
  try {
    const raw = await readFile(namesDataPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.names) ? parsed.names : seedNames;
  } catch {
    await saveNames(seedNames);
    return seedNames;
  }
}

function cleanText(value, maxLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

async function getNamePayload() {
  const names = await loadNames();
  const styles = [...new Set(names.map((item) => item.style).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  return {
    names: names.sort((a, b) => b.votes - a.votes || a.chinese.localeCompare(b.chinese, "zh-CN")),
    styles,
    updatedAt: new Date().toISOString()
  };
}

async function addName(req, res) {
  const body = await readRequestBody(req);
  const chinese = cleanText(body.chinese, 12);
  const english = cleanText(body.english, 42);
  const style = cleanText(body.style, 18) || "其他 / Other";
  const note = cleanText(body.note, 120);
  if (!chinese || !english) return sendJson(res, 400, { error: "Chinese and English names are required." });
  const names = await loadNames();
  const duplicate = names.some((item) =>
    item.chinese.toLowerCase() === chinese.toLowerCase()
    || item.english.toLowerCase() === english.toLowerCase()
  );
  if (duplicate) return sendJson(res, 409, { error: "This name already exists." });
  names.push({
    id: `name-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    chinese,
    english,
    style,
    note,
    votes: 0,
    createdAt: new Date().toISOString()
  });
  await saveNames(names);
  return sendJson(res, 201, await getNamePayload());
}

async function updateName(id, req, res) {
  const body = await readRequestBody(req);
  const english = cleanText(body.english, 42);
  if (!english) return sendJson(res, 400, { error: "English name is required." });
  const names = await loadNames();
  const item = names.find((entry) => entry.id === id);
  if (!item) return sendJson(res, 404, { error: "Name not found." });
  item.english = english;
  item.updatedAt = new Date().toISOString();
  await saveNames(names);
  return sendJson(res, 200, await getNamePayload());
}

async function voteName(id, res) {
  const names = await loadNames();
  const item = names.find((entry) => entry.id === id);
  if (!item) return sendJson(res, 404, { error: "Name not found." });
  item.votes += 1;
  await saveNames(names);
  return sendJson(res, 200, await getNamePayload());
}

async function serveStatic(req, res) {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  const filePath = path.join(publicDir, pathname === "/" ? "names.html" : pathname);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8"
  };
  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      "content-type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/api/names" && req.method === "GET") return sendJson(res, 200, await getNamePayload());
    if (url.pathname === "/api/names" && req.method === "POST") return addName(req, res);
    const updateMatch = url.pathname.match(/^\/api\/names\/([^/]+)$/);
    if (updateMatch && req.method === "PATCH") return updateName(decodeURIComponent(updateMatch[1]), req, res);
    const voteMatch = url.pathname.match(/^\/api\/names\/([^/]+)\/vote$/);
    if (voteMatch && req.method === "POST") return voteName(decodeURIComponent(voteMatch[1]), res);
    return serveStatic(req, res);
  } catch (error) {
    return sendJson(res, 500, { error: error.message, updatedAt: new Date().toISOString() });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Fund name vote is running: http://localhost:${PORT}`);
});
