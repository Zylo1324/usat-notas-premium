"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  KeyRound,
  LockKeyhole,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound
} from "lucide-react";
import { firebaseEnabled, saveSessionSnapshot } from "@/lib/firebase";
import type { AppState, CourseState, GradeItem } from "@/lib/types";

type WorkingItem = GradeItem & {
  value: number | null;
};

type WorkingMap = Record<string, WorkingItem[]>;

const PASSING_GRADE = 13.5;

function fmt(value: number | null | undefined, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return Number(value).toFixed(decimals);
}

function ceil2(value: number) {
  return Math.ceil((value + 1e-9) * 100) / 100;
}

function prepareWorking(state: AppState): WorkingMap {
  return Object.fromEntries(
    state.courses.map((course) => [
      course.name,
      course.items.map((item) => ({ ...item, value: item.grade }))
    ])
  );
}

function courseTotals(items: WorkingItem[], passing = PASSING_GRADE) {
  let current = 0;
  let max = 0;
  let emptyPendingWeight = 0;
  let emptyPendingCount = 0;

  for (const item of items) {
    const value = item.value;
    current += (value ?? 0) * item.weight;
    max += (value ?? 20) * item.weight;
    if (item.pending && value === null) {
      emptyPendingWeight += item.weight;
      emptyPendingCount += 1;
    }
  }

  const averageRequired = emptyPendingWeight ? (passing - current) / emptyPendingWeight : null;
  return { current, max, emptyPendingWeight, emptyPendingCount, averageRequired };
}

function statusFor(items: WorkingItem[], passing = PASSING_GRADE) {
  const totals = courseTotals(items, passing);
  if (totals.current >= passing) return { text: "Ya alcanza", cls: "ok" };
  if (totals.max < passing) return { text: "No alcanza", cls: "bad" };
  return { text: "Depende de pendientes", cls: "warn" };
}

function minimumText(items: WorkingItem[], passing = PASSING_GRADE) {
  const totals = courseTotals(items, passing);
  if (!totals.emptyPendingWeight) return "-";
  if (totals.averageRequired !== null && totals.averageRequired > 20) return ">20";
  return fmt(ceil2(Math.max(0, totals.averageRequired ?? 0)));
}

export default function Home() {
  const [studentCode, setStudentCode] = useState("");
  const [password, setPassword] = useState("");
  const [appState, setAppState] = useState<AppState | null>(null);
  const [working, setWorking] = useState<WorkingMap>({});
  const [selectedName, setSelectedName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const passing = appState?.passing ?? PASSING_GRADE;
  const selectedCourse = useMemo<CourseState | null>(() => {
    if (!appState?.courses.length) return null;
    return appState.courses.find((course) => course.name === selectedName) ?? appState.courses[0];
  }, [appState, selectedName]);

  const selectedItems = selectedCourse ? working[selectedCourse.name] ?? [] : [];
  const totals = courseTotals(selectedItems, passing);
  const selectedStatus = statusFor(selectedItems, passing);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 4200);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!studentCode.trim() || !password.trim()) {
      setError("Coloca tu codigo USAT y tu contrasena para iniciar sesion.");
      return;
    }

    if (!window.usatDesktop) {
      setError(
        "Esta pagina publicada no puede leer el campus por seguridad del navegador. Usa el EXE para iniciar sesion y actualizar tus notas."
      );
      return;
    }

    setLoading(true);
    try {
      const result = await window.usatDesktop.updateCampus({
        user: studentCode.trim(),
        password
      });

      if (!result.ok || !result.state) {
        throw new Error(result.message || "No se pudo entrar al campus.");
      }

      setAppState(result.state);
      setWorking(prepareWorking(result.state));
      setSelectedName(result.state.courses[0]?.name ?? "");
      setPassword("");

      await saveSessionSnapshot({
        studentCode: studentCode.trim(),
        courseCount: result.state.courses.length,
        capturedAt: result.state.courses[0]?.capturedAt
      }).catch(() => null);

      showToast("Sesion iniciada. Notas y silabos actualizados.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesion.");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    setAppState(null);
    setWorking({});
    setSelectedName("");
    setPassword("");
    setError("");
  }

  async function closeApp() {
    if (window.usatDesktop) {
      await window.usatDesktop.closeApp();
    } else {
      logout();
    }
  }

  function setGrade(index: number, rawValue: string) {
    if (!selectedCourse) return;
    const value = rawValue.trim().replace(",", ".");
    setWorking((previous) => {
      const nextItems = [...(previous[selectedCourse.name] ?? [])];
      if (!value) {
        nextItems[index] = { ...nextItems[index], value: null };
      } else {
        const parsed = Number(value);
        if (Number.isNaN(parsed) || parsed < 0 || parsed > 20) {
          showToast("La nota debe estar entre 0 y 20.");
          return previous;
        }
        nextItems[index] = { ...nextItems[index], value: parsed };
      }
      return { ...previous, [selectedCourse.name]: nextItems };
    });
  }

  function fillMinimum() {
    if (!selectedCourse) return;
    setWorking((previous) => {
      const items = previous[selectedCourse.name] ?? [];
      const courseCalc = courseTotals(items, passing);
      let fillValue = 0;

      if (courseCalc.current >= passing) {
        fillValue = 0;
        showToast("Ya alcanzas la meta; complete pendientes con 0 para mostrar el minimo.");
      } else if (!courseCalc.emptyPendingWeight || courseCalc.max < passing || (courseCalc.averageRequired ?? 0) > 20) {
        fillValue = 20;
        showToast("No alcanza con las pendientes actuales; complete con 20 para mostrar el maximo posible.");
      } else {
        fillValue = ceil2(Math.max(0, courseCalc.averageRequired ?? 0));
        showToast(`Complete las pendientes con ${fmt(fillValue)} para llegar a ${fmt(passing)}.`);
      }

      return {
        ...previous,
        [selectedCourse.name]: items.map((item) =>
          item.pending && item.value === null ? { ...item, value: fillValue } : item
        )
      };
    });
  }

  function fillWorst() {
    if (!selectedCourse) return;
    setWorking((previous) => {
      const items = previous[selectedCourse.name] ?? [];
      showToast("Peor caso aplicado: las pendientes vacias quedaron en 0.");
      return {
        ...previous,
        [selectedCourse.name]: items.map((item) =>
          item.pending && item.value === null ? { ...item, value: 0 } : item
        )
      };
    });
  }

  function clearSimulation() {
    if (!selectedCourse) return;
    setWorking((previous) => ({
      ...previous,
      [selectedCourse.name]: selectedCourse.items.map((item) => ({ ...item, value: item.grade }))
    }));
    showToast("Simulacion limpiada.");
  }

  function answerText() {
    if (!selectedCourse) return ["Sin curso seleccionado.", ""];
    if (!selectedItems.length) {
      return ["No hay notas leidas para este curso.", "Entra al campus nuevamente o revisa si el docente publico calificaciones."];
    }
    if (totals.emptyPendingCount === 0) {
      if (totals.current >= passing) {
        return ["Ya apruebas con las notas completadas.", `Tu final simulado queda en ${fmt(totals.current)}.`];
      }
      return ["No llegas a 13.50 con las notas actuales.", "No hay pendientes vacias para completar en este curso."];
    }
    if (totals.current >= passing) {
      return ["Ya apruebas aunque lo pendiente salga 0.", "Cualquier punto adicional mejora tu margen final."];
    }
    if (totals.max < passing) {
      return ["No alcanza ni sacando 20 en todo lo pendiente.", `Tu maximo posible es ${fmt(totals.max)}.`];
    }
    const required = ceil2(Math.max(0, totals.averageRequired ?? 0));
    return [
      `Necesitas ${fmt(required)} en cada pendiente para aprobar.`,
      `Ese es el minimo promedio sobre ${totals.emptyPendingCount} evaluacion(es) vacias que pesan ${fmt(totals.emptyPendingWeight * 100, 1)}% del final.`
    ];
  }

  function summaryText() {
    if (!selectedCourse) return "";
    const rows = selectedItems.map(
      (item) =>
        `Unidad ${item.unit} - ${item.label}: ${
          item.value === null ? "Pendiente" : fmt(item.value)
        } | peso final ${fmt(item.weight * 100, 1)}%`
    );
    return [
      `Curso: ${selectedCourse.name}`,
      `Meta: ${fmt(passing)}`,
      `Final simulado: ${fmt(totals.current)}`,
      `Maximo posible: ${fmt(totals.max)}`,
      `Estado: ${selectedStatus.text}`,
      "",
      "Notas:",
      ...rows
    ].join("\n");
  }

  async function exportSummary() {
    const text = summaryText();
    const fileName = `${selectedCourse?.name ?? "resumen"}`.replace(/[^a-z0-9]+/gi, "_") + ".txt";
    if (window.usatDesktop) {
      const result = await window.usatDesktop.exportSummary({ fileName, text });
      showToast(result.ok ? `Resumen guardado: ${result.filePath}` : result.message || "No se pudo exportar.");
      return;
    }
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  if (!appState) {
    return (
      <main className="login-page">
        <section className="login-brand">
          <div className="logo-pill">USAT Notas</div>
          <div className="login-copy">
            <h1>Calcula la nota minima antes de entrar al examen.</h1>
            <p>
              Inicia sesion con tu cuenta USAT, actualiza tus calificaciones y deja que el simulador complete las
              notas pendientes con el minimo para aprobar con 13.50.
            </p>
            <div className="login-points">
              <div className="login-point">
                <ShieldCheck />
                No sube tu contrasena a Firebase.
              </div>
              <div className="login-point">
                <CheckCircle2 />
                Descarga silabos y lee pesos automaticamente.
              </div>
              <div className="login-point">
                <Sparkles />
                Dashboard premium, sin navegador visible.
              </div>
            </div>
          </div>
          <div className="login-footer">
            Firebase: {firebaseEnabled ? "conectado por variables de entorno" : "pendiente de configurar"}.
          </div>
        </section>

        <section className="login-form-area">
          <form className="login-card" onSubmit={handleLogin}>
            <p className="mini-title">Inicio de sesion</p>
            <h2>Cuenta USAT</h2>
            <p className="sub">Primero validamos tu sesion. Despues recien aparece la calculadora.</p>

            <div className="field">
              <label htmlFor="studentCode">Codigo universitario</label>
              <div className="input-shell">
                <UserRound />
                <input
                  id="studentCode"
                  autoComplete="username"
                  value={studentCode}
                  onChange={(event) => setStudentCode(event.target.value)}
                  placeholder="Ej. 222AD31190"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="password">Contrasena</label>
              <div className="input-shell">
                <KeyRound />
                <input
                  id="password"
                  autoComplete="current-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Tu contrasena USAT"
                  disabled={loading}
                />
              </div>
            </div>

            <button className="primary-btn" disabled={loading} type="submit">
              {loading ? <RefreshCw className="spin" /> : <LockKeyhole />}
              {loading ? "Entrando y actualizando..." : "Entrar y actualizar notas"}
            </button>

            {error ? <div className="error-box">{error}</div> : null}
            <div className="info-box">
              La sesion del campus se usa localmente en el EXE. Firebase solo guarda un resumen de sesion si esta
              configurado.
            </div>
          </form>
        </section>
      </main>
    );
  }

  const [answer, advice] = answerText();

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <h1>Calculadora de notas USAT</h1>
          <p>Sesion iniciada. Completa automaticamente lo pendiente con el minimo para aprobar.</p>
        </div>
        <div className="top-actions">
          <button className="plain-btn" onClick={logout}>
            <LogOut size={18} />
            Cerrar sesion
          </button>
          <button className="danger-btn" onClick={closeApp}>
            Cerrar app
          </button>
        </div>
      </header>

      <section className="dashboard-grid">
        <aside className="panel courses-panel">
          <p className="mini-title">Cursos</p>
          <div className="course-list">
            {appState.courses.map((course) => {
              const items = working[course.name] ?? [];
              const status = statusFor(items, passing);
              const totalsForCourse = courseTotals(items, passing);
              return (
                <button
                  className={`course-card ${course.name === selectedCourse?.name ? "active" : ""}`}
                  key={course.name}
                  onClick={() => setSelectedName(course.name)}
                >
                  <strong>{course.name}</strong>
                  <span className="course-meta">
                    <span>Actual: {fmt(totalsForCourse.current)}</span>
                    <span>Min.: {minimumText(items, passing)}</span>
                    <span className={`status ${status.cls}`}>{status.text}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="main-column">
          <section className="panel hero-panel">
            <div className="hero-head">
              <div>
                <p className="mini-title">Respuesta principal</p>
                <h2>{selectedCourse?.name}</h2>
              </div>
              <select
                className="course-select"
                value={selectedCourse?.name ?? ""}
                onChange={(event) => setSelectedName(event.target.value)}
              >
                {appState.courses.map((course) => (
                  <option key={course.name} value={course.name}>
                    {course.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="answer-grid">
              <div className="answer-card">
                <h3>{answer}</h3>
                <p>{advice}</p>
              </div>
              <div className="kpi-grid">
                <div className="kpi">
                  <span>Si pendientes = 0</span>
                  <strong>{fmt(totals.current)}</strong>
                </div>
                <div className="kpi">
                  <span>Maximo posible</span>
                  <strong>{fmt(totals.max)}</strong>
                </div>
                <div className="kpi">
                  <span>Silabos bajados</span>
                  <strong>{appState.syllabusCount}</strong>
                </div>
              </div>
            </div>
          </section>

          <section className="panel tools-panel">
            <p className="mini-title">Completar notas</p>
            <div className="button-row">
              <button className="primary-btn" onClick={fillMinimum}>
                <Sparkles size={18} />
                Completar minimas para aprobar
              </button>
              <button className="secondary-btn" onClick={fillWorst}>
                Completar peor caso: pendientes = 0
              </button>
              <button className="plain-btn" onClick={clearSimulation}>
                Limpiar simulacion
              </button>
              <button className="plain-btn" onClick={exportSummary}>
                <Download size={18} />
                Exportar resumen TXT
              </button>
            </div>
            <p className="muted-copy">
              El boton principal rellena todas las notas pendientes del curso con el mismo promedio minimo necesario.
              No modifica el campus; solo simula dentro de esta app.
            </p>
          </section>

          <section className="panel notes-panel">
            <p className="mini-title">Notas registradas y simuladas</p>
            {!selectedItems.length ? (
              <div className="empty-state">No hay evaluaciones leidas para este curso.</div>
            ) : (
              <table className="notes-table">
                <thead>
                  <tr>
                    <th>Evaluacion</th>
                    <th className="right-cell">Peso final</th>
                    <th className="right-cell">Nota</th>
                    <th className="right-cell">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItems.map((item, index) => (
                    <tr key={item.key}>
                      <td>
                        <div className="unit-label">
                          Unidad {item.unit} · {item.unitTitle}
                        </div>
                        <strong>{item.label}</strong>
                      </td>
                      <td className="right-cell">{fmt(item.weight * 100, 1)}%</td>
                      <td className="right-cell">
                        <input
                          className="note-input"
                          value={item.value === null ? "" : fmt(item.value)}
                          onChange={(event) => setGrade(index, event.target.value)}
                          placeholder="-"
                        />
                      </td>
                      <td className="right-cell">
                        <span className={`status ${item.pending ? (item.value === null ? "warn" : "ok") : "ok"}`}>
                          {item.pending ? (item.value === null ? "Pendiente" : "Simulada") : "Registrada"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </section>
      </section>

      {toast ? (
        <div className="toast">
          <ArrowRight size={16} /> {toast}
        </div>
      ) : null}
    </main>
  );
}
