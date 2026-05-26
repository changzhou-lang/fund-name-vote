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

const conflictDefaults = {
  "\u8fdc\u5cb3": { status: "clear", label: "No obvious match found", detail: "Public search did not show an obvious AMAC/private fund match." },
  "\u89c2\u5cb3": { status: "clear", label: "No obvious match found", detail: "Public search did not show an obvious AMAC/private fund match." },
  "\u6052\u5cf0": { status: "used", label: "Already used / likely conflict", detail: "Search found private fund product usage with \u6052\u5cf0." },
  "\u6e05\u6e90": { status: "used", label: "Already used / likely conflict", detail: "Search found private fund managers using \u6e05\u6e90, including \u6e05\u6e90\u6295\u8d44 / \u6c34\u6728\u6e05\u6e90\u79c1\u52df." },
  "\u6f84\u6cc9": { status: "clear", label: "No obvious match found", detail: "Public search did not show an obvious AMAC/private fund match." },
  "\u542f\u66dc": { status: "clear", label: "No obvious match found", detail: "Public search did not show an obvious AMAC/private fund match." },
  "\u660e\u6656": { status: "clear", label: "No obvious match found", detail: "Search found non-fund references, but no obvious private fund manager/product match." },
  "\u6668\u66dc": { status: "used", label: "Already used / likely conflict", detail: "Search found \u5b89\u5fbd\u6668\u66dc\u79c1\u52df\u57fa\u91d1\u7ba1\u7406\u6709\u9650\u516c\u53f8." },
  "\u5f18\u9053": { status: "clear", label: "No obvious match found", detail: "Public search did not show an obvious AMAC/private fund match." },
  "\u884c\u8fdc": { status: "clear", label: "No obvious match found", detail: "Public search did not show an obvious AMAC/private fund match." },
  "\u81f4\u8fdc": { status: "used", label: "Already used / likely conflict", detail: "Search found multiple private fund managers/products using \u81f4\u8fdc." },
  "\u535a\u884d": { status: "used", label: "Already used / likely conflict", detail: "Search found \u5317\u4eac\u535a\u884d\u79c1\u52df\u57fa\u91d1\u7ba1\u7406\u6709\u9650\u516c\u53f8." },
  "\u592a\u521d": { status: "used", label: "Already used / likely conflict", detail: "Search found \u5317\u4eac\u592a\u521d\u6295\u8d44\u7ba1\u7406\u6709\u9650\u516c\u53f8 and \u534e\u94a7\u592a\u521d\u79c1\u52df\u8bc1\u5238\u6295\u8d44\u57fa\u91d1." },
  "\u592a\u8861": { status: "clear", label: "No obvious match found", detail: "Public search did not show an obvious China private fund match for \u592a\u8861\u8d44\u672c." },
  "\u5929\u67a2": { status: "clear", label: "No obvious match found", detail: "Public search did not show an obvious China private fund match for \u5929\u67a2\u8d44\u672c." },
  "\u5b9a\u6d77": { status: "clear", label: "No obvious match found", detail: "Public search did not show an obvious China private fund match for \u5b9a\u6d77\u8d44\u672c." }
};

const unknownConflict = {
  status: "clear",
  label: "No obvious match found",
  detail: "No exact private fund match is currently in the conflict list. Please verify through AMAC search before final use."
};

const seedNames = [
  { chinese: "\u8fdc\u5cb3", english: "Farpeak Capital", style: "\u5c71 / \u9ad8\u5ea6", note: "\u9ad8\u5c71\u4ef0\u6b62\uff0c\u666f\u884c\u884c\u6b62" },
  { chinese: "\u89c2\u5cb3", english: "Summitview Capital", style: "\u5c71 / \u9ad8\u5ea6", note: "\u9ad8\u5c4b\u5efa\u74f4\uff0c\u767b\u9ad8\u671b\u8fdc" },
  { chinese: "\u6052\u5cf0", english: "Everpeak Capital", style: "\u5c71 / \u9ad8\u5ea6", note: "\u6301\u4e4b\u4ee5\u6052\uff0c\u5cf0\u56de\u8def\u8f6c" },
  { chinese: "\u6e05\u6e90", english: "Clearsource Capital", style: "\u6c34 / \u6e90\u5934", note: "\u6b63\u672c\u6e05\u6e90\uff0c\u6e90\u8fdc\u6d41\u957f" },
  { chinese: "\u6f84\u6cc9", english: "Clearspring Capital", style: "\u6c34 / \u6e90\u5934", note: "\u6f84\u6000\u89c2\u9053\uff0c\u996e\u6c34\u601d\u6e90" },
  { chinese: "\u542f\u66dc", english: "Firstlight Capital", style: "\u5149 / \u65f6\u95f4", note: "\u542f\u660e\u661f\u660e\uff0c\u65ed\u65e5\u521d\u5347" },
  { chinese: "\u660e\u6656", english: "Brighthorizon Capital", style: "\u5149 / \u65f6\u95f4", note: "\u5149\u98ce\u9701\u6708\uff0c\u6656\u5149\u65e5\u65b0" },
  { chinese: "\u6668\u66dc", english: "Dawnlight Capital", style: "\u5149 / \u65f6\u95f4", note: "\u6668\u5149\u71b9\u5fae\uff0c\u65e5\u65b0\u6708\u5f02" },
  { chinese: "\u5f18\u9053", english: "NoblePath Capital", style: "\u6210\u8bed / \u9053\u8fdc", note: "\u4efb\u91cd\u9053\u8fdc\uff0c\u4eba\u80fd\u5f18\u9053" },
  { chinese: "\u884c\u8fdc", english: "Steadypath Capital", style: "\u6210\u8bed / \u9053\u8fdc", note: "\u884c\u7a33\u81f4\u8fdc\uff0c\u4e45\u4e45\u4e3a\u529f" },
  { chinese: "\u81f4\u8fdc", english: "Longview Capital", style: "\u6210\u8bed / \u8fdc\u89c1", note: "\u6de1\u6cca\u660e\u5fd7\uff0c\u5b81\u9759\u81f4\u8fdc" }
].map((item, index) => ({
  id: `seed-${index + 1}`,
  votes: 0,
  createdAt: "2026-05-24T00:00:00.000Z",
  ...item
}));

const requiredNames = [
  {
    id: "required-taiheng",
    chinese: "\u592a\u8861\u8d44\u672c",
    english: "Tenet Capital (Supreme Equilibrium)",
    style: "\u7ecf\u7eac / \u5e73\u8861",
    note: "\u592a\u8861\u53d6\u5e7f\u5927\u5747\u8861\u4e4b\u610f\uff0c\u9002\u5408\u7a33\u5065\u914d\u7f6e\u6c14\u8d28"
  },
  {
    id: "required-tianshu",
    chinese: "\u5929\u67a2\u8d44\u672c",
    english: "Talix Capital (The Celestial Pivot)",
    style: "\u661f\u8fb0 / \u67a2\u7ebd",
    note: "\u5929\u67a2\u4e3a\u5317\u6597\u4e4b\u9996\uff0c\u6709\u4e2d\u5fc3\u3001\u67a2\u7ebd\u548c\u65b9\u5411\u611f"
  },
  {
    id: "required-dinghai",
    chinese: "\u5b9a\u6d77\u8d44\u672c",
    english: "Dynax Capital (The Sea-Steadying Needle)",
    style: "\u6210\u8bed / \u7a33\u5b9a",
    note: "\u53d6\u5b9a\u6d77\u795e\u9488\u4e4b\u610f\uff0c\u5f3a\u8c03\u7a33\u5b9a\u3001\u538b\u8231\u548c\u7a7f\u8d8a\u5468\u671f"
  }
].map((item) => ({
  votes: 0,
  createdAt: "2026-05-25T00:00:00.000Z",
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
    const loadedNames = Array.isArray(parsed.names) ? parsed.names : seedNames;
    const migratedNames = migrateNames(loadedNames);
    if (JSON.stringify(loadedNames) !== JSON.stringify(migratedNames)) await saveNames(migratedNames);
    return migratedNames;
  } catch {
    const migratedSeeds = migrateNames(seedNames);
    await saveNames(migratedSeeds);
    return migratedSeeds;
  }
}

function cleanText(value, maxLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function baseChineseName(value) {
  return String(value || "").replace(/\u8d44\u672c$/, "");
}

function withCapital(value) {
  const text = cleanText(value, 12);
  if (!text) return "";
  if (!/[\u3400-\u9fff]/.test(text)) return text;
  return text.endsWith("\u8d44\u672c") ? text : `${text}\u8d44\u672c`;
}

function migrateNames(names) {
  const nextNames = names.map((item) => {
    const chinese = withCapital(item.chinese);
    return {
      ...item,
      chinese,
      conflict: item.conflict?.status === "unknown" ? undefined : item.conflict
    };
  });
  requiredNames.forEach((required) => {
    const requiredBase = baseChineseName(required.chinese).toLowerCase();
    const exists = nextNames.some((item) => baseChineseName(item.chinese).toLowerCase() === requiredBase);
    if (!exists) nextNames.push(required);
  });
  return nextNames;
}

function normalizeName(item) {
  const storedConflict = item.conflict?.status === "unknown" ? null : item.conflict;
  const conflict = conflictDefaults[baseChineseName(item.chinese)] || storedConflict || unknownConflict;
  return { ...item, conflict };
}

async function getNamePayload() {
  const names = (await loadNames()).map(normalizeName);
  const styles = [...new Set(names.map((item) => item.style).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  return {
    names: names.sort((a, b) => b.votes - a.votes || a.chinese.localeCompare(b.chinese, "zh-CN")),
    styles,
    updatedAt: new Date().toISOString()
  };
}

async function addName(req, res) {
  const body = await readRequestBody(req);
  const rawChinese = cleanText(body.chinese, 12);
  const rawEnglish = cleanText(body.english, 42);
  const chinese = withCapital(rawChinese || rawEnglish);
  const english = rawEnglish || chinese;
  const style = cleanText(body.style, 18) || "\u5176\u4ed6 / Other";
  const note = cleanText(body.note, 120);
  if (!chinese && !english) return sendJson(res, 400, { error: "Chinese or English name is required." });
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
    conflict: conflictDefaults[chinese] || unknownConflict,
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

async function deleteName(id, req, res) {
  const names = await loadNames();
  const item = names.find((entry) => entry.id === id);
  if (!item) return sendJson(res, 404, { error: "Name not found." });
  const conflict = normalizeName(item).conflict;
  if (conflict.status !== "used") return sendJson(res, 403, { error: "Only already-used names can be deleted." });
  const nextNames = names.filter((entry) => entry.id !== id);
  if (nextNames.length === names.length) return sendJson(res, 404, { error: "Name not found." });
  await saveNames(nextNames);
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
    const nameMatch = url.pathname.match(/^\/api\/names\/([^/]+)$/);
    if (nameMatch && req.method === "PATCH") return updateName(decodeURIComponent(nameMatch[1]), req, res);
    if (nameMatch && req.method === "DELETE") return deleteName(decodeURIComponent(nameMatch[1]), req, res);
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
