export const STORAGE_VERSION = 1;

export const EXPENSE_TYPES = {
  variable: "variable",
  fixed: "fixed"
};

export const MONTHLY_FIXED_STATUSES = {
  pending: "pending",
  paid: "paid",
  skipped: "skipped"
};

export const INITIAL_CATEGORY_NAMES = [
  "Transporte",
  "Subscripciones",
  "Trabajo",
  "Otro",
  "Salud",
  "Entretenimiento",
  "Comida",
  "Hogar",
  "Convivencia"
];

export const FIXED_EXPENSE_SEEDS = [
  ["AI", "Subscripciones"],
  ["Auto Impuesto Rentas", "Transporte"],
  ["Factura CUI", "Trabajo"],
  ["Factura Fanatics", "Trabajo"],
  ["Factura FPM", "Trabajo"],
  ["Fundación Corazón Contento", "Otro"],
  ["Gimnasio", "Salud"],
  ["HBO Max", "Subscripciones"],
  ["iCloud", "Subscripciones"],
  ["Monotributo", "Trabajo"],
  ["Municipalidad Auto", "Transporte"],
  ["Pago TC", "Otro"],
  ["Peajes", "Transporte"],
  ["Plata MercadoPago", "Convivencia"],
  ["Prevención Salud", "Salud"],
  ["Promesa", "Entretenimiento"],
  ["Seguro Auto", "Transporte"],
  ["Spotify", "Subscripciones"],
  ["Talleres", "Entretenimiento"],
  ["YouTube", "Subscripciones"]
];

const CATEGORY_ALIASES = new Map([
  ["entretenimienti", "Entretenimiento"],
  ["plata mercadopago", "Convivencia"]
]);

export function emptyState() {
  return {
    version: STORAGE_VERSION,
    categories: [],
    expenses: [],
    fixedExpenses: [],
    monthlyFixedExpenses: [],
    settings: {
      currency: "ARS",
      dateFormat: "yyyy-MM-dd"
    }
  };
}

export function upgradeState(input) {
  const state = input && typeof input === "object" ? input : emptyState();
  state.version = STORAGE_VERSION;
  state.categories = Array.isArray(state.categories) ? state.categories : [];
  state.expenses = Array.isArray(state.expenses) ? state.expenses : [];
  state.fixedExpenses = Array.isArray(state.fixedExpenses) ? state.fixedExpenses : [];
  state.monthlyFixedExpenses = Array.isArray(state.monthlyFixedExpenses) ? state.monthlyFixedExpenses : [];
  state.settings = state.settings && typeof state.settings === "object" ? state.settings : {};
  state.settings.currency = "ARS";
  state.settings.dateFormat = "yyyy-MM-dd";
  return state;
}

export function seedState(input, now = new Date()) {
  const state = upgradeState(input);
  INITIAL_CATEGORY_NAMES.forEach((name) => ensureCategory(state, name, now));

  FIXED_EXPENSE_SEEDS.forEach(([name, categoryName]) => {
    const normalizedName = normalizeName(name);
    if (state.fixedExpenses.some((fixed) => fixed.normalizedName === normalizedName)) return;

    const category = ensureCategory(state, categoryName, now);
    state.fixedExpenses.push({
      id: newId(),
      name,
      normalizedName,
      categoryId: category.id,
      defaultAmountCents: 0,
      active: true,
      aliases: [],
      deactivatedAt: null,
      createdAt: isoNow(now),
      updatedAt: isoNow(now)
    });
  });

  return state;
}

export function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveCategoryName(name) {
  const normalized = normalizeName(name);
  return CATEGORY_ALIASES.get(normalized) || String(name || "").trim();
}

export function ensureCategory(state, name, now = new Date()) {
  const categoryName = resolveCategoryName(name);
  if (!categoryName) throw new Error("La categoría no puede estar vacía.");

  const normalizedName = normalizeName(categoryName);
  const existing = state.categories.find((category) => category.normalizedName === normalizedName);
  if (existing) return existing;

  const category = {
    id: newId(),
    name: categoryName,
    normalizedName,
    createdAt: isoNow(now),
    updatedAt: isoNow(now)
  };
  state.categories.push(category);
  sortByName(state.categories);
  return category;
}

export function addCategory(state, name, now = new Date()) {
  const normalizedName = normalizeName(name);
  if (!normalizedName) throw new Error("Ingresá un nombre para la categoría.");
  if (state.categories.some((category) => category.normalizedName === normalizedName)) {
    throw new Error("Ya existe una categoría con ese nombre.");
  }
  return ensureCategory(state, name, now);
}

export function renameCategory(state, categoryId, nextName, now = new Date()) {
  const category = findById(state.categories, categoryId);
  if (!category) throw new Error("No encontré esa categoría.");

  const normalizedName = normalizeName(nextName);
  if (!normalizedName) throw new Error("Ingresá un nombre para la categoría.");
  if (state.categories.some((item) => item.id !== categoryId && item.normalizedName === normalizedName)) {
    throw new Error("Ya existe una categoría con ese nombre.");
  }

  category.name = String(nextName).trim();
  category.normalizedName = normalizedName;
  category.updatedAt = isoNow(now);

  state.monthlyFixedExpenses
    .filter((monthly) => monthly.categoryId === categoryId)
    .forEach((monthly) => {
      monthly.categoryNameSnapshot = category.name;
      monthly.updatedAt = isoNow(now);
    });

  sortByName(state.categories);
  return category;
}

export function deleteCategoryWithReassignment(state, categoryId, replacementCategoryId, now = new Date()) {
  if (categoryId === replacementCategoryId) {
    throw new Error("Elegí una categoría distinta para reasignar.");
  }

  const category = findById(state.categories, categoryId);
  const replacement = findById(state.categories, replacementCategoryId);
  if (!category || !replacement) throw new Error("No encontré la categoría para reasignar.");

  state.expenses.forEach((expense) => {
    if (expense.categoryId === categoryId) {
      expense.categoryId = replacementCategoryId;
      expense.updatedAt = isoNow(now);
    }
  });

  state.fixedExpenses.forEach((fixed) => {
    if (fixed.categoryId === categoryId) {
      fixed.categoryId = replacementCategoryId;
      fixed.updatedAt = isoNow(now);
    }
  });

  state.monthlyFixedExpenses.forEach((monthly) => {
    if (monthly.categoryId === categoryId) {
      monthly.categoryId = replacementCategoryId;
      monthly.categoryNameSnapshot = replacement.name;
      monthly.updatedAt = isoNow(now);
    }
  });

  state.categories = state.categories.filter((item) => item.id !== categoryId);
}

export function addVariableExpense(state, input, now = new Date()) {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("El nombre del gasto es obligatorio.");
  if (!input.categoryId || !findById(state.categories, input.categoryId)) {
    throw new Error("Elegí una categoría.");
  }

  const amountCents = Number(input.amountCents || 0);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error("Ingresá un monto mayor a cero.");
  }

  const date = normalizeDateInput(input.date || dateInputValue(now));
  const expense = {
    id: newId(),
    name,
    normalizedName: normalizeName(name),
    amountCents,
    categoryId: input.categoryId,
    date,
    monthKey: monthKeyFromDate(date),
    type: EXPENSE_TYPES.variable,
    linkedMonthlyFixedExpenseId: null,
    createdAt: isoNow(now),
    updatedAt: isoNow(now)
  };
  state.expenses.push(expense);
  return expense;
}

export function updateExpense(state, expenseId, input, now = new Date()) {
  const expense = findById(state.expenses, expenseId);
  if (!expense) throw new Error("No encontré el gasto.");

  const name = String(input.name || "").trim();
  if (!name) throw new Error("El nombre del gasto es obligatorio.");
  if (!input.categoryId || !findById(state.categories, input.categoryId)) {
    throw new Error("Elegí una categoría.");
  }

  const amountCents = Number(input.amountCents || 0);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error("Ingresá un monto mayor a cero.");
  }

  expense.name = name;
  expense.normalizedName = normalizeName(name);
  expense.amountCents = amountCents;
  expense.categoryId = input.categoryId;
  expense.date = normalizeDateInput(input.date);
  expense.monthKey = monthKeyFromDate(expense.date);
  expense.updatedAt = isoNow(now);

  if (expense.type === EXPENSE_TYPES.fixed && expense.linkedMonthlyFixedExpenseId) {
    const monthly = findById(state.monthlyFixedExpenses, expense.linkedMonthlyFixedExpenseId);
    if (monthly) {
      monthly.nameSnapshot = expense.name;
      monthly.categoryId = expense.categoryId;
      monthly.categoryNameSnapshot = getCategoryName(state, expense.categoryId);
      monthly.amountCents = expense.amountCents;
      monthly.status = MONTHLY_FIXED_STATUSES.paid;
      monthly.paidAt = expense.date;
      monthly.updatedAt = isoNow(now);
    }
  }

  return expense;
}

export function deleteExpense(state, expenseId, now = new Date()) {
  const expense = findById(state.expenses, expenseId);
  if (!expense) return;

  if (expense.type === EXPENSE_TYPES.fixed && expense.linkedMonthlyFixedExpenseId) {
    const monthly = findById(state.monthlyFixedExpenses, expense.linkedMonthlyFixedExpenseId);
    if (monthly) {
      monthly.status = MONTHLY_FIXED_STATUSES.pending;
      monthly.paidAt = null;
      monthly.updatedAt = isoNow(now);
    }
  }

  state.expenses = state.expenses.filter((item) => item.id !== expenseId);
}

export function ensureMonthlyFixedForMonth(state, monthKey, now = new Date()) {
  const fixedActive = state.fixedExpenses.filter((fixed) => fixed.active);
  fixedActive.forEach((fixed) => {
    const uniqueKey = monthlyFixedUniqueKey(fixed.id, monthKey);
    if (state.monthlyFixedExpenses.some((monthly) => monthly.uniqueKey === uniqueKey)) return;

    state.monthlyFixedExpenses.push({
      id: newId(),
      fixedExpenseId: fixed.id,
      monthKey,
      nameSnapshot: fixed.name,
      categoryId: fixed.categoryId,
      categoryNameSnapshot: getCategoryName(state, fixed.categoryId),
      amountCents: fixed.defaultAmountCents || 0,
      status: MONTHLY_FIXED_STATUSES.pending,
      paidAt: null,
      uniqueKey,
      createdAt: isoNow(now),
      updatedAt: isoNow(now)
    });
  });
}

export function addFixedExpense(state, input, now = new Date()) {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Ingresá un nombre para el fijo.");
  if (!input.categoryId || !findById(state.categories, input.categoryId)) {
    throw new Error("Elegí una categoría.");
  }

  const normalizedName = normalizeName(name);
  if (state.fixedExpenses.some((fixed) => fixed.normalizedName === normalizedName)) {
    throw new Error("Ya existe un gasto fijo con ese nombre.");
  }

  const fixed = {
    id: newId(),
    name,
    normalizedName,
    categoryId: input.categoryId,
    defaultAmountCents: Number(input.defaultAmountCents || 0),
    active: input.active !== false,
    aliases: [],
    deactivatedAt: input.active === false ? isoNow(now) : null,
    createdAt: isoNow(now),
    updatedAt: isoNow(now)
  };
  state.fixedExpenses.push(fixed);
  sortByName(state.fixedExpenses);
  return fixed;
}

export function updateFixedExpense(state, fixedExpenseId, input, now = new Date()) {
  const fixed = findById(state.fixedExpenses, fixedExpenseId);
  if (!fixed) throw new Error("No encontré ese fijo.");

  const name = String(input.name || "").trim();
  if (!name) throw new Error("Ingresá un nombre para el fijo.");
  const normalizedName = normalizeName(name);
  if (state.fixedExpenses.some((item) => item.id !== fixedExpenseId && item.normalizedName === normalizedName)) {
    throw new Error("Ya existe un gasto fijo con ese nombre.");
  }
  if (!input.categoryId || !findById(state.categories, input.categoryId)) {
    throw new Error("Elegí una categoría.");
  }

  fixed.name = name;
  fixed.normalizedName = normalizedName;
  fixed.categoryId = input.categoryId;
  fixed.defaultAmountCents = Number(input.defaultAmountCents || 0);
  fixed.active = input.active !== false;
  fixed.deactivatedAt = fixed.active ? null : fixed.deactivatedAt || isoNow(now);
  fixed.updatedAt = isoNow(now);

  state.monthlyFixedExpenses
    .filter((monthly) => monthly.fixedExpenseId === fixed.id && monthly.status === MONTHLY_FIXED_STATUSES.pending)
    .forEach((monthly) => {
      monthly.nameSnapshot = fixed.name;
      monthly.categoryId = fixed.categoryId;
      monthly.categoryNameSnapshot = getCategoryName(state, fixed.categoryId);
      monthly.amountCents = fixed.defaultAmountCents;
      monthly.updatedAt = isoNow(now);
    });

  sortByName(state.fixedExpenses);
  return fixed;
}

export function deactivateFixedExpense(state, fixedExpenseId, now = new Date()) {
  const fixed = findById(state.fixedExpenses, fixedExpenseId);
  if (!fixed) throw new Error("No encontré ese fijo.");
  fixed.active = false;
  fixed.deactivatedAt = isoNow(now);
  fixed.updatedAt = isoNow(now);
  return fixed;
}

export function setFixedExpenseActive(state, fixedExpenseId, active, now = new Date()) {
  const fixed = findById(state.fixedExpenses, fixedExpenseId);
  if (!fixed) throw new Error("No encontré ese fijo.");
  fixed.active = Boolean(active);
  fixed.deactivatedAt = fixed.active ? null : isoNow(now);
  fixed.updatedAt = isoNow(now);
  return fixed;
}

export function updateMonthlyFixedAmount(state, monthlyFixedExpenseId, amountCents, now = new Date()) {
  const monthly = findById(state.monthlyFixedExpenses, monthlyFixedExpenseId);
  if (!monthly) throw new Error("No encontré ese fijo mensual.");
  monthly.amountCents = Number(amountCents || 0);
  monthly.updatedAt = isoNow(now);

  const linkedExpense = state.expenses.find((expense) => expense.linkedMonthlyFixedExpenseId === monthly.id);
  if (linkedExpense) {
    linkedExpense.amountCents = monthly.amountCents;
    linkedExpense.updatedAt = isoNow(now);
  }
  return monthly;
}

export function payMonthlyFixedExpense(state, monthlyFixedExpenseId, amountCents, paidDate, now = new Date()) {
  const monthly = findById(state.monthlyFixedExpenses, monthlyFixedExpenseId);
  if (!monthly) throw new Error("No encontré ese fijo mensual.");

  const amount = Number(amountCents || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Ingresá un monto mayor a cero.");
  }

  const date = normalizeDateInput(paidDate || dateForMonth(monthly.monthKey));
  monthly.amountCents = amount;
  monthly.status = MONTHLY_FIXED_STATUSES.paid;
  monthly.paidAt = date;
  monthly.updatedAt = isoNow(now);

  let expense = state.expenses.find((item) => item.linkedMonthlyFixedExpenseId === monthly.id);
  if (!expense) {
    expense = {
      id: newId(),
      name: monthly.nameSnapshot,
      normalizedName: normalizeName(monthly.nameSnapshot),
      amountCents: amount,
      categoryId: monthly.categoryId,
      date,
      monthKey: monthKeyFromDate(date),
      type: EXPENSE_TYPES.fixed,
      linkedMonthlyFixedExpenseId: monthly.id,
      createdAt: isoNow(now),
      updatedAt: isoNow(now)
    };
    state.expenses.push(expense);
  } else {
    expense.name = monthly.nameSnapshot;
    expense.normalizedName = normalizeName(monthly.nameSnapshot);
    expense.amountCents = amount;
    expense.categoryId = monthly.categoryId;
    expense.date = date;
    expense.monthKey = monthKeyFromDate(date);
    expense.type = EXPENSE_TYPES.fixed;
    expense.updatedAt = isoNow(now);
  }

  return expense;
}

export function skipMonthlyFixedExpense(state, monthlyFixedExpenseId, now = new Date()) {
  const monthly = findById(state.monthlyFixedExpenses, monthlyFixedExpenseId);
  if (!monthly) throw new Error("No encontré ese fijo mensual.");
  monthly.status = MONTHLY_FIXED_STATUSES.skipped;
  monthly.paidAt = null;
  monthly.updatedAt = isoNow(now);
  state.expenses = state.expenses.filter((expense) => expense.linkedMonthlyFixedExpenseId !== monthly.id);
  return monthly;
}

export function setMonthlyFixedPending(state, monthlyFixedExpenseId, now = new Date()) {
  const monthly = findById(state.monthlyFixedExpenses, monthlyFixedExpenseId);
  if (!monthly) throw new Error("No encontré ese fijo mensual.");
  monthly.status = MONTHLY_FIXED_STATUSES.pending;
  monthly.paidAt = null;
  monthly.updatedAt = isoNow(now);
  state.expenses = state.expenses.filter((expense) => expense.linkedMonthlyFixedExpenseId !== monthly.id);
  return monthly;
}

export function buildMonthlyReport(state, monthKey, now = new Date()) {
  const expenses = state.expenses
    .filter((expense) => monthKeyFromDate(expense.date) === monthKey)
    .sort((a, b) => b.date.localeCompare(a.date));

  const previousKey = previousMonthKey(monthKey);
  const previousExpenses = state.expenses.filter((expense) => monthKeyFromDate(expense.date) === previousKey);

  const totalCents = sum(expenses.map((expense) => expense.amountCents));
  const previousTotalCents = sum(previousExpenses.map((expense) => expense.amountCents));
  const variableCents = sum(expenses.filter((expense) => expense.type === EXPENSE_TYPES.variable).map((expense) => expense.amountCents));
  const fixedPaidCents = sum(expenses.filter((expense) => expense.type === EXPENSE_TYPES.fixed).map((expense) => expense.amountCents));

  const categoryTotals = Array.from(
    expenses.reduce((map, expense) => {
      const categoryName = getCategoryName(state, expense.categoryId);
      map.set(categoryName, (map.get(categoryName) || 0) + expense.amountCents);
      return map;
    }, new Map())
  )
    .map(([category, amountCents]) => ({ category, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents);

  const monthlyFixed = state.monthlyFixedExpenses.filter((monthly) => monthly.monthKey === monthKey);
  const fixedPaid = monthlyFixed.filter((monthly) => monthly.status === MONTHLY_FIXED_STATUSES.paid);
  const fixedPending = monthlyFixed.filter((monthly) => monthly.status === MONTHLY_FIXED_STATUSES.pending);
  const fixedSkipped = monthlyFixed.filter((monthly) => monthly.status === MONTHLY_FIXED_STATUSES.skipped);

  return {
    monthKey,
    previousMonthKey: previousKey,
    totalCents,
    previousTotalCents,
    comparisonCents: totalCents - previousTotalCents,
    variableCents,
    fixedPaidCents,
    categoryTotals,
    topExpenses: expenses.slice().sort((a, b) => b.amountCents - a.amountCents).slice(0, 5),
    fixed: {
      total: monthlyFixed.length,
      paidCount: fixedPaid.length,
      pendingCount: fixedPending.length,
      skippedCount: fixedSkipped.length,
      paidTotalCents: sum(fixedPaid.map((monthly) => monthly.amountCents)),
      pendingEstimatedCents: sum(fixedPending.map((monthly) => monthly.amountCents)),
      pending: fixedPending.sort((a, b) => a.nameSnapshot.localeCompare(b.nameSnapshot)),
      paid: fixedPaid.sort((a, b) => a.nameSnapshot.localeCompare(b.nameSnapshot)),
      skipped: fixedSkipped.sort((a, b) => a.nameSnapshot.localeCompare(b.nameSnapshot))
    }
  };
}

export function exportExpensesCSV(state) {
  const rows = [["Nombre", "Categoria", "Fecha", "Monto"]];
  state.expenses
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((expense) => {
      rows.push([
        expense.name,
        getCategoryName(state, expense.categoryId),
        expense.date,
        String(Math.round(expense.amountCents / 100))
      ]);
    });
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function importExpensesCSV(state, text, now = new Date()) {
  const rows = parseCSV(text).filter((row) => row.some((cell) => String(cell).trim() !== ""));
  if (!rows.length) return { imported: 0 };

  const header = rows[0].map((cell) => normalizeName(cell));
  const expected = ["nombre", "categoria", "fecha", "monto"];
  if (expected.some((name, index) => header[index] !== name)) {
    throw new Error("El CSV debe tener las columnas: Nombre, Categoria, Fecha, Monto.");
  }

  let imported = 0;
  rows.slice(1).forEach((row, index) => {
    const [name, categoryName, date, amount] = row;
    if (!String(name || "").trim()) {
      throw new Error(`Fila ${index + 2}: falta el nombre.`);
    }
    const category = ensureCategory(state, categoryName, now);
    addVariableExpense(
      state,
      {
        name,
        categoryId: category.id,
        date: normalizeDateInput(date),
        amountCents: parseAmountToCents(amount)
      },
      now
    );
    imported += 1;
  });

  return { imported };
}

export function exportBackupJSON(state, now = new Date()) {
  return JSON.stringify(
    {
      kind: "gastos-mensuales-backup",
      version: STORAGE_VERSION,
      exportedAt: isoNow(now),
      state
    },
    null,
    2
  );
}

export function importBackupJSON(text) {
  const parsed = JSON.parse(text);
  const state = parsed.state || parsed.data || parsed;
  return upgradeState(state);
}

export function parseAmountToCents(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  const pesos = Number(digits);
  if (!Number.isFinite(pesos) || pesos <= 0) return 0;
  return pesos * 100;
}

export function formatARS(amountCents) {
  const pesos = Math.round(Number(amountCents || 0) / 100);
  return `$${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(pesos)}`;
}

export function amountInputValue(amountCents) {
  const pesos = Math.round(Number(amountCents || 0) / 100);
  return pesos > 0 ? String(pesos) : "";
}

export function dateInputValue(date = new Date()) {
  const parsed = date instanceof Date ? date : new Date(date);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateForMonth(monthKey) {
  const currentMonth = monthKeyFromDate(new Date());
  if (monthKey === currentMonth) return dateInputValue(new Date());
  return `${monthKey}-01`;
}

export function normalizeDateInput(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error("La fecha debe tener formato yyyy-mm-dd.");
  }
  const parsed = new Date(`${text}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("La fecha no es válida.");
  }
  return text;
}

export function monthKeyFromDate(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}/.test(value)) return value.slice(0, 7);
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function monthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(date);
}

export function previousMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return monthKeyFromDate(new Date(year, month - 2, 1));
}

export function nextMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return monthKeyFromDate(new Date(year, month, 1));
}

export function getCategoryName(state, categoryId) {
  return findById(state.categories, categoryId)?.name || "Sin categoría";
}

export function getFixedName(state, fixedExpenseId) {
  return findById(state.fixedExpenses, fixedExpenseId)?.name || "Fijo eliminado";
}

export function findById(collection, id) {
  return collection.find((item) => item.id === id);
}

export function sortByName(collection) {
  collection.sort((a, b) => String(a.name || a.nameSnapshot).localeCompare(String(b.name || b.nameSnapshot), "es"));
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function monthlyFixedUniqueKey(fixedExpenseId, monthKey) {
  return `${fixedExpenseId}:${monthKey}`;
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function isoNow(now) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
