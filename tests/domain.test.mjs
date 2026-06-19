import test from "node:test";
import assert from "node:assert/strict";
import {
  EXPENSE_TYPES,
  MONTHLY_FIXED_STATUSES,
  addVariableExpense,
  buildMonthlyReport,
  deactivateFixedExpense,
  deleteCategoryWithReassignment,
  deleteExpense,
  emptyState,
  ensureCategory,
  ensureMonthlyFixedForMonth,
  exportExpensesCSV,
  findById,
  importExpensesCSV,
  parseAmountToCents,
  payMonthlyFixedExpense,
  seedState,
  skipMonthlyFixedExpense
} from "../src/domain.js";

function makeState() {
  const state = seedState(emptyState(), "2026-06-19T12:00:00.000Z");
  ensureMonthlyFixedForMonth(state, "2026-06", "2026-06-19T12:00:00.000Z");
  return state;
}

test("seed inicial no duplica categorías ni fijos", () => {
  const state = seedState(emptyState(), "2026-06-19T12:00:00.000Z");
  seedState(state, "2026-06-19T12:00:00.000Z");

  assert.equal(state.categories.length, 9);
  assert.equal(state.fixedExpenses.length, 20);
  assert.ok(state.categories.some((category) => category.name === "Convivencia"));
  const mp = state.fixedExpenses.find((fixed) => fixed.name === "Plata MercadoPago");
  assert.equal(findById(state.categories, mp.categoryId).name, "Convivencia");
});

test("crear mes nuevo genera fijos activos pendientes y no duplica al reabrir", () => {
  const state = seedState(emptyState(), "2026-06-19T12:00:00.000Z");

  ensureMonthlyFixedForMonth(state, "2026-07", "2026-07-01T12:00:00.000Z");
  ensureMonthlyFixedForMonth(state, "2026-07", "2026-07-01T12:00:00.000Z");

  const july = state.monthlyFixedExpenses.filter((monthly) => monthly.monthKey === "2026-07");
  assert.equal(july.length, 20);
  assert.equal(july.every((monthly) => monthly.status === MONTHLY_FIXED_STATUSES.pending), true);
});

test("fijo pendiente con monto 0 no suma al total", () => {
  const state = makeState();
  const report = buildMonthlyReport(state, "2026-06", "2026-06-19T12:00:00.000Z");

  assert.equal(report.totalCents, 0);
  assert.equal(report.fixed.pendingEstimatedCents, 0);
});

test("pagar fijo crea gasto fijo y suma al total mensual", () => {
  const state = makeState();
  const monthly = state.monthlyFixedExpenses.find((item) => item.nameSnapshot === "Spotify");

  payMonthlyFixedExpense(state, monthly.id, 350000, "2026-06-05", "2026-06-05T12:00:00.000Z");
  const report = buildMonthlyReport(state, "2026-06", "2026-06-19T12:00:00.000Z");

  assert.equal(report.totalCents, 350000);
  assert.equal(report.fixedPaidCents, 350000);
  assert.equal(report.fixed.paidCount, 1);
  assert.equal(state.expenses[0].type, EXPENSE_TYPES.fixed);
  assert.equal(state.expenses[0].linkedMonthlyFixedExpenseId, monthly.id);
});

test("fijo omitido no crea gasto ni suma", () => {
  const state = makeState();
  const monthly = state.monthlyFixedExpenses.find((item) => item.nameSnapshot === "HBO Max");

  skipMonthlyFixedExpense(state, monthly.id, "2026-06-05T12:00:00.000Z");
  const report = buildMonthlyReport(state, "2026-06", "2026-06-19T12:00:00.000Z");

  assert.equal(report.totalCents, 0);
  assert.equal(report.fixed.skippedCount, 1);
  assert.equal(state.expenses.length, 0);
});

test("fijo dado de baja no aparece en meses futuros y conserva histórico", () => {
  const state = makeState();
  const spotify = state.fixedExpenses.find((fixed) => fixed.name === "Spotify");
  const juneSpotify = state.monthlyFixedExpenses.find((monthly) => monthly.fixedExpenseId === spotify.id && monthly.monthKey === "2026-06");

  deactivateFixedExpense(state, spotify.id, "2026-06-20T12:00:00.000Z");
  ensureMonthlyFixedForMonth(state, "2026-07", "2026-07-01T12:00:00.000Z");

  assert.ok(juneSpotify);
  assert.equal(state.monthlyFixedExpenses.some((monthly) => monthly.fixedExpenseId === spotify.id && monthly.monthKey === "2026-07"), false);
});

test("reportes usan date del gasto y no createdAt", () => {
  const state = makeState();
  const comida = state.categories.find((category) => category.name === "Comida");

  addVariableExpense(
    state,
    {
      name: "Cena",
      amountCents: 100000,
      categoryId: comida.id,
      date: "2026-05-31"
    },
    "2026-06-19T12:00:00.000Z"
  );

  assert.equal(buildMonthlyReport(state, "2026-06", "2026-06-19T12:00:00.000Z").totalCents, 0);
  assert.equal(buildMonthlyReport(state, "2026-05", "2026-06-19T12:00:00.000Z").totalCents, 100000);
});

test("import CSV crea gastos variables y acepta fecha día/mes/año", () => {
  const state = makeState();
  const csv = "Nombre,Categoria,Fecha,Monto\nCafé,Comida,1/3/2026,2500\nPlata MercadoPago,Plata MercadoPago,11/6/2026,10000";

  const result = importExpensesCSV(state, csv, "2026-06-19T12:00:00.000Z");

  assert.equal(result.imported, 2);
  assert.equal(state.expenses.every((expense) => expense.type === EXPENSE_TYPES.variable), true);
  assert.equal(state.expenses.find((expense) => expense.name === "Café").date, "2026-03-01");
  const mpExpense = state.expenses.find((expense) => expense.name === "Plata MercadoPago");
  assert.equal(findById(state.categories, mpExpense.categoryId).name, "Convivencia");
});

test("parsea montos con separadores de miles y decimales", () => {
  assert.equal(parseAmountToCents("5,500.00"), 550000);
  assert.equal(parseAmountToCents("31,500.00"), 3150000);
  assert.equal(parseAmountToCents("2,200,000.00"), 220000000);
  assert.equal(parseAmountToCents("31.500,00"), 3150000);
  assert.equal(parseAmountToCents("31.500"), 3150000);
  assert.equal(parseAmountToCents("31500"), 3150000);
});

test("importa el formato del CSV de Finanzas Personales", () => {
  const state = makeState();
  const csv = [
    "Nombre,Categoria,Fecha,Monto,,SUM de Monto",
    'Café,Comida,1/3/2026,"5,500.00",,"13,441,973.00"',
    'Cena,Comida,1/3/2026,"31,500.00",,',
    'Auto,Transporte,1/5/2026,"2,200,000.00",,',
    '[Fijo] Pago TC,Otro,1/4/2026,0.00,,'
  ].join("\n");

  const result = importExpensesCSV(state, csv, "2026-06-19T12:00:00.000Z");
  const reportMarch = buildMonthlyReport(state, "2026-03", "2026-06-19T12:00:00.000Z");
  const reportMay = buildMonthlyReport(state, "2026-05", "2026-06-19T12:00:00.000Z");

  assert.equal(result.imported, 3);
  assert.equal(result.skipped, 1);
  assert.equal(reportMarch.totalCents, 3700000);
  assert.equal(reportMay.totalCents, 220000000);
});

test("export CSV escribe fechas como día/mes/año", () => {
  const state = makeState();
  const comida = state.categories.find((category) => category.name === "Comida");

  addVariableExpense(
    state,
    {
      name: "Panadería",
      amountCents: 420000,
      categoryId: comida.id,
      date: "2026-03-01"
    },
    "2026-06-19T12:00:00.000Z"
  );

  assert.match(exportExpensesCSV(state), /Panadería,Comida,1\/3\/2026,4200/);
});

test("borrar categoría exige reasignación y preserva datos", () => {
  const state = makeState();
  const comida = state.categories.find((category) => category.name === "Comida");
  const hogar = state.categories.find((category) => category.name === "Hogar");

  addVariableExpense(
    state,
    {
      name: "Super",
      amountCents: 200000,
      categoryId: comida.id,
      date: "2026-06-12"
    },
    "2026-06-19T12:00:00.000Z"
  );
  deleteCategoryWithReassignment(state, comida.id, hogar.id, "2026-06-19T12:00:00.000Z");

  assert.equal(state.categories.some((category) => category.id === comida.id), false);
  assert.equal(state.expenses[0].categoryId, hogar.id);
});

test("borrar gasto fijo pagado vuelve el mensual a pendiente", () => {
  const state = makeState();
  const monthly = state.monthlyFixedExpenses.find((item) => item.nameSnapshot === "YouTube");
  const expense = payMonthlyFixedExpense(state, monthly.id, 450000, "2026-06-05", "2026-06-05T12:00:00.000Z");

  deleteExpense(state, expense.id, "2026-06-06T12:00:00.000Z");

  assert.equal(findById(state.monthlyFixedExpenses, monthly.id).status, MONTHLY_FIXED_STATUSES.pending);
  assert.equal(state.expenses.length, 0);
});
