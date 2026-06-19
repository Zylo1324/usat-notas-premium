const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROMAN_TO_NUM = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };

function isDev() {
  return !app.isPackaged;
}

function workspaceRoot() {
  const fromExe = path.resolve(path.dirname(process.execPath), "..", "..");
  if (fs.existsSync(path.join(fromExe, "scripts", "usat-grades-scraper.js"))) return fromExe;
  const fromDev = path.resolve(__dirname, "..", "..");
  if (fs.existsSync(path.join(fromDev, "scripts", "usat-grades-scraper.js"))) return fromDev;
  return process.resourcesPath || fromDev;
}

function appRoot() {
  return isDev() ? path.resolve(__dirname, "..") : path.join(process.resourcesPath, "app.asar");
}

function dataDir() {
  return path.join(workspaceRoot(), "data");
}

function gradesPath() {
  return path.join(dataDir(), "usat-grades.json");
}

function syllabusDir() {
  return path.join(dataDir(), "silabos");
}

function modelsPath() {
  const workspaceModel = path.join(workspaceRoot(), "grade_calculator_app", "course_models.json");
  if (fs.existsSync(workspaceModel)) return workspaceModel;
  return path.join(process.resourcesPath, "course_models.json");
}

function scriptsDir() {
  const workspaceScripts = path.join(workspaceRoot(), "scripts");
  if (fs.existsSync(workspaceScripts)) return workspaceScripts;
  return path.join(process.resourcesPath, "scripts");
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function clean(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function parseFloatLoose(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(",", ".");
  if (!text || /^pendiente$/i.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function findUnitLine(courseData, code) {
  const lines = courseData?.flatItems || [];
  const prefix = `UNIDAD ${code} `;
  for (const line of lines) {
    if (String(line).toUpperCase().startsWith(prefix)) return line;
  }
  const pattern = new RegExp(`\\bUNIDAD\\s+${code}\\b`, "i");
  return lines.find((line) => pattern.test(String(line))) || "";
}

function parseUnitCampusGrade(line) {
  const match = String(line || "").match(/Peso:\s*([\d.,]+)\s*%\s*\|\s*([\d.,]+)/i);
  return match ? parseFloatLoose(match[2]) : null;
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findGradeAfterLabel(line, label) {
  if (!line || !label) return null;
  const lowerLine = String(line).toLowerCase();
  const lowerLabel = String(label).toLowerCase();
  let idx = lowerLine.indexOf(lowerLabel);

  if (idx < 0) {
    const relaxed = lowerLabel.replace(/\s+/g, " ").trim();
    idx = lowerLine.replace(/\s+/g, " ").indexOf(relaxed);
  }

  if (idx < 0) return null;
  const after = String(line).slice(idx + label.length, idx + label.length + 280);
  const match = after.match(/\b(Pendiente|-?\d+(?:[.,]\d+)?)\b/i);
  return match ? parseFloatLoose(match[1]) : null;
}

function courseNames(models, grades) {
  const names = Object.keys(models.courses || {});
  for (const course of grades.courses || []) {
    if (course.course && !names.includes(course.course)) names.push(course.course);
  }
  return names;
}

function courseGradeData(grades, courseName) {
  return (grades.courses || []).find((course) => course.course === courseName) || {};
}

function buildItems(models, grades, courseName) {
  const model = models.courses?.[courseName] || {};
  const courseData = courseGradeData(grades, courseName);
  const items = [];

  for (const unit of model.units || []) {
    const code = unit.code || "";
    const unitLine = findUnitLine(courseData, code);
    const campusUnitGrade = parseUnitCampusGrade(unitLine);
    const assessments = unit.assessments || model.default_assessments || [];

    for (const assessment of assessments) {
      const label = assessment.label;
      const unitWeight = Number(unit.weight || 0);
      const itemWeight = Number(assessment.weight || 0);
      const grade = findGradeAfterLabel(unitLine, label);
      items.push({
        key: `${courseName}|${code}|${label}`,
        course: courseName,
        unit: code,
        unitTitle: unit.title || "",
        unitOrder: ROMAN_TO_NUM[code] || 0,
        label,
        weight: unitWeight * itemWeight,
        grade,
        pending: grade === null,
        kind: assessment.kind || "",
        campusUnitGrade
      });
    }
  }

  return items.sort((a, b) => a.unitOrder - b.unitOrder || a.label.localeCompare(b.label));
}

function resultFor(models, grades, courseName) {
  const items = buildItems(models, grades, courseName);
  const current = items.reduce((sum, item) => sum + (item.grade ?? 0) * item.weight, 0);
  const max = items.reduce((sum, item) => sum + (item.grade ?? 20) * item.weight, 0);
  const pendingWeight = items
    .filter((item) => item.pending)
    .reduce((sum, item) => sum + item.weight, 0);
  const passing = Number(models.passing_grade || 13.5);

  return {
    name: courseName,
    formula: models.courses?.[courseName]?.formula || "",
    capturedAt: courseGradeData(grades, courseName).capturedAt || grades.capturedAt || "",
    passing,
    now: Number(current.toFixed(4)),
    max: Number(max.toFixed(4)),
    pendingWeight: Number(pendingWeight.toFixed(6)),
    averageRequired: pendingWeight ? Number(((passing - current) / pendingWeight).toFixed(6)) : null,
    items: items.map((item) => ({
      key: item.key,
      unit: item.unit,
      unitTitle: item.unitTitle,
      label: item.label,
      weight: Number(item.weight.toFixed(6)),
      grade: item.grade,
      pending: item.pending,
      kind: item.kind
    }))
  };
}

function serializeState() {
  const models = readJson(modelsPath(), { passing_grade: 13.5, semester: "2026-I", courses: {} });
  const grades = readJson(gradesPath(), { capturedAt: "", semester: "2026-I", courses: [] });
  const syllabi = fs.existsSync(syllabusDir())
    ? fs.readdirSync(syllabusDir()).filter((file) => file.toLowerCase().endsWith(".pdf"))
    : [];

  return {
    passing: Number(models.passing_grade || 13.5),
    semester: models.semester || grades.semester || "2026-I",
    gradesPath: gradesPath(),
    syllabusDir: syllabusDir(),
    syllabusCount: syllabi.length,
    syllabusFiles: syllabi.map((file) => path.join(syllabusDir(), file)),
    courses: courseNames(models, grades).map((name) => resultFor(models, grades, name))
  };
}

function runNodeScript(scriptName, credentials, headless = true) {
  return new Promise((resolve) => {
    const script = path.join(scriptsDir(), scriptName);
    if (!fs.existsSync(script)) {
      resolve({ ok: false, message: `No existe el script: ${script}` });
      return;
    }

    fs.mkdirSync(dataDir(), { recursive: true });
    fs.mkdirSync(syllabusDir(), { recursive: true });

    const args = headless ? [script, "--headless"] : [script];
    const env = {
      ...process.env,
      USAT_GRADES_OUT: gradesPath(),
      USAT_SYLLABUS_DIR: syllabusDir()
    };
    if (credentials?.user && credentials?.password) {
      env.USAT_USER = credentials.user;
      env.USAT_PASS = credentials.password;
    }

    const child = spawn("node", args, {
      cwd: workspaceRoot(),
      windowsHide: true,
      env
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      stderr += "\nTiempo agotado al leer el campus.";
    }, 420000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, message: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ ok: true, message: clean(stdout) });
      } else {
        resolve({ ok: false, message: clean(stderr || stdout || `Error ${code}`) });
      }
    });
  });
}

async function runNodeScriptWithFallback(scriptName, credentials) {
  const silent = await runNodeScript(scriptName, credentials, true);
  if (silent.ok) return silent;
  return runNodeScript(scriptName, credentials, false);
}

async function updateCampus(credentials) {
  if (!credentials?.useStored && (!credentials?.user || !credentials?.password)) {
    return { ok: false, message: "Falta codigo o contrasena USAT." };
  }

  const grades = await runNodeScriptWithFallback("usat-grades-scraper.js", credentials);
  if (!grades.ok) return grades;

  const syllabi = await runNodeScriptWithFallback("usat-silabus-downloader.js", credentials);
  if (!syllabi.ok) return syllabi;

  return { ok: true, state: serializeState(), message: `${grades.message}\n${syllabi.message}` };
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 760,
    backgroundColor: "#edf2f7",
    autoHideMenuBar: true,
    title: "Calculadora de notas USAT",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const filePath = path.join(appRoot(), "out", "index.html");
  await win.loadFile(filePath);
}

ipcMain.handle("usat:updateCampus", async (_event, credentials) => updateCampus(credentials));

ipcMain.handle("usat:closeApp", async () => {
  app.quit();
});

ipcMain.handle("usat:exportSummary", async (_event, payload) => {
  try {
    const downloads = app.getPath("downloads");
    const safeName = clean(payload.fileName || "resumen.txt").replace(/[\\/:*?"<>|]+/g, "_");
    const filePath = path.join(downloads, safeName.endsWith(".txt") ? safeName : `${safeName}.txt`);
    fs.writeFileSync(filePath, payload.text || "", "utf8");
    return { ok: true, filePath };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
