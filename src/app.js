import {
  EXPENSE_TYPES,
  MONTHLY_FIXED_STATUSES,
  addCategory,
  addFixedExpense,
  addVariableExpense,
  amountInputValue,
  buildMonthlyReport,
  dateForMonth,
  dateInputValue,
  deactivateFixedExpense,
  deleteCategoryWithReassignment,
  deleteExpense,
  ensureMonthlyFixedForMonth,
  exportBackupJSON,
  exportExpensesCSV,
  findById,
  formatARS,
  getCategoryName,
  importBackupJSON,
  importExpensesCSV,
  monthKeyFromDate,
  monthLabel,
  nextMonthKey,
  normalizeName,
  parseAmountToCents,
  payMonthlyFixedExpense,
  previousMonthKey,
  renameCategory,
  setFixedExpenseActive,
  setMonthlyFixedPending,
  skipMonthlyFixedExpense,
  updateExpense,
  updateFixedExpense,
  updateMonthlyFixedAmount
} from "./domain.js";
import { loadState, replaceState, saveState } from "./storage.js";

let state = loadState();

const currentMonth = monthKeyFromDate(new Date());
ensureMonthlyFixedForMonth(state, currentMonth);
saveState(state);

const ui = {
  view: "home",
  homeMode: EXPENSE_TYPES.variable,
  summaryMonthKey: currentMonth,
  expensesMonthKey: currentMonth,
  expenseCategoryId: "all",
  expenseType: "all",
  expenseSearch: "",
  expenseSort: "desc",
  fixedMonthKey: currentMonth,
  fixedStatus: "all",
  modal: null
};

const titles = {
  home: "Carga rápida",
  summary: "Resumen mensual",
  expenses: "Gastos",
  fixed: "Fijos del mes",
  settings: "Configuración"
};

const app = document.querySelector("#app");
const screenTitle = document.querySelector("#screen-title");
const toast = document.querySelector("#toast");
let toastTimer = null;

document.querySelectorAll("[data-nav]").forEach((button) => {
  button.addEventListener("click", () => {
    ui.view = button.dataset.nav;
    ui.modal = null;
    render();
  });
});

render();
registerServiceWorker();

function render() {
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.nav === ui.view);
  });
  screenTitle.textContent = titles[ui.view];

  let html = "";
  if (ui.view === "home") html = renderHome();
  if (ui.view === "summary") html = renderSummary();
  if (ui.view === "expenses") html = renderExpenses();
  if (ui.view === "fixed") html = renderFixed();
  if (ui.view === "settings") html = renderSettings();

  app.innerHTML = `${html}${renderModal()}`;
  bindCommonEvents();
  bindViewEvents();
}

function renderHome() {
  const monthKey = currentMonthKey();
  ensureMonth(monthKey);
  const pending = getMonthlyFixed(monthKey).filter((monthly) => monthly.status === MONTHLY_FIXED_STATUSES.pending);
  const firstPending = pending[0];

  const fixedForm = pending.length
    ? `
      <form id="fixed-form" class="stack">
        <label class="field">
          <span>Fijo pendiente</span>
          <select class="select" name="monthlyFixedId" id="home-fixed-select" required>
            ${pending
              .map(
                (monthly) => `
                  <option value="${monthly.id}" data-amount="${monthly.amountCents}">
                    ${escapeHtml(monthly.nameSnapshot)} · ${escapeHtml(getCategoryName(state, monthly.categoryId))}
                  </option>
                `
              )
              .join("")}
          </select>
        </label>
        <label class="field">
          <span>Monto</span>
          <input class="input input--amount" name="amount" id="home-fixed-amount" inputmode="numeric" autocomplete="off" placeholder="$0" value="${amountInputValue(firstPending?.amountCents)}" required />
        </label>
        <button class="button" type="submit">Marcar fijo pagado</button>
      </form>
    `
    : `<div class="empty">No quedan fijos pendientes este mes.</div>`;

  const variableForm = `
    <form id="variable-form" class="stack">
      <label class="field">
        <span>Monto</span>
        <input class="input input--amount" name="amount" inputmode="numeric" autocomplete="off" placeholder="$0" required autofocus />
      </label>
      <label class="field">
        <span>Nombre</span>
        <input class="input" name="name" autocomplete="off" placeholder="Ej: supermercado, nafta, café" required />
      </label>
      <label class="field">
        <span>Categoría</span>
        <select class="select" name="categoryId" required>${categoryOptions()}</select>
      </label>
      <label class="field">
        <span>Fecha real del gasto</span>
        <input class="input" name="date" type="date" value="${dateInputValue()}" required />
      </label>
      <button class="button" type="submit">Guardar gasto</button>
    </form>
  `;

  return `
    <section class="section stack">
      <div class="segmented" role="tablist" aria-label="Tipo de gasto">
        <button type="button" class="${ui.homeMode === EXPENSE_TYPES.variable ? "is-active" : ""}" data-home-mode="${EXPENSE_TYPES.variable}">Variable</button>
        <button type="button" class="${ui.homeMode === EXPENSE_TYPES.fixed ? "is-active" : ""}" data-home-mode="${EXPENSE_TYPES.fixed}">Fijo</button>
      </div>
      ${ui.homeMode === EXPENSE_TYPES.variable ? variableForm : fixedForm}
    </section>
  `;
}

function renderSummary() {
  ensureMonth(ui.summaryMonthKey);
  const report = buildMonthlyReport(state, ui.summaryMonthKey);
  const maxCategory = Math.max(1, ...report.categoryTotals.map((item) => item.amountCents));

  const categoryBars = report.categoryTotals.length
    ? report.categoryTotals
        .map((item) => {
          const width = Math.max(4, Math.round((item.amountCents / maxCategory) * 100));
          return `
            <div class="bar-row">
              <div class="bar-row__label">
                <span>${escapeHtml(item.category)}</span>
                <strong>${formatARS(item.amountCents)}</strong>
              </div>
              <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
            </div>
          `;
        })
        .join("")
    : `<div class="empty">Todavía no hay gastos para este mes.</div>`;

  const topExpenses = report.topExpenses.length
    ? report.topExpenses
        .map(
          (expense) => `
            <div class="row">
              <div class="row__top">
                <div>
                  <div class="row__title">${escapeHtml(expense.name)}</div>
                  <div class="row__meta">${escapeHtml(getCategoryName(state, expense.categoryId))} · ${expense.date}</div>
                </div>
                <div class="row__amount">${formatARS(expense.amountCents)}</div>
              </div>
            </div>
          `
        )
        .join("")
    : `<div class="empty">Sin top gastos por ahora.</div>`;

  const comparisonText =
    report.comparisonCents === 0
      ? "Igual que el mes anterior"
      : `${report.comparisonCents > 0 ? "+" : ""}${formatARS(report.comparisonCents)} vs. ${monthLabel(report.previousMonthKey)}`;

  return `
    ${monthNav("summaryMonthKey")}
    <section class="section grid grid--four">
      ${metric("Total del mes", formatARS(report.totalCents), comparisonText)}
      ${metric("Variables", formatARS(report.variableCents), "Gastos no fijos")}
      ${metric("Fijos pagados", formatARS(report.fixedPaidCents), `${report.fixed.paidCount} de ${report.fixed.total} fijos`)}
      ${metric("Promedio diario", formatARS(report.dailyAverageCents), "Según fecha real")}
    </section>
    <section class="section card">
      <h2>Total por categoría</h2>
      <div class="bar-list">${categoryBars}</div>
    </section>
    <section class="section grid">
      ${metric("Falta pagar", formatARS(report.fixed.pendingEstimatedCents), `${report.fixed.pendingCount} pendientes`)}
      ${metric("Omitidos", String(report.fixed.skippedCount), "No cuentan en gastos")}
    </section>
    <section class="section">
      <h2>Top gastos</h2>
      <div class="list">${topExpenses}</div>
    </section>
    <section class="section">
      <h2>Fijos pendientes</h2>
      <div class="list">${fixedMiniList(report.fixed.pending)}</div>
    </section>
  `;
}

function renderExpenses() {
  const expenses = filteredExpenses();
  const list = expenses.length
    ? expenses
        .map(
          (expense) => `
            <div class="row">
              <div class="row__top">
                <div>
                  <div class="row__title">${escapeHtml(expense.name)}</div>
                  <div class="row__meta">${expense.date} · ${escapeHtml(getCategoryName(state, expense.categoryId))} · ${expense.type === EXPENSE_TYPES.fixed ? "Fijo" : "Variable"}</div>
                </div>
                <div class="row__amount">${formatARS(expense.amountCents)}</div>
              </div>
              <div class="button-row">
                <button class="button button--small button--secondary" type="button" data-edit-expense="${expense.id}">Editar</button>
                <button class="button button--small button--danger" type="button" data-delete-expense="${expense.id}">Borrar</button>
              </div>
            </div>
          `
        )
        .join("")
    : `<div class="empty">No hay gastos con esos filtros.</div>`;

  return `
    ${monthNav("expensesMonthKey")}
    <form id="expense-filter-form" class="filters">
      <select class="select" name="categoryId">
        <option value="all">Todas las categorías</option>
        ${categoryOptions(ui.expenseCategoryId)}
      </select>
      <select class="select" name="type">
        <option value="all" ${ui.expenseType === "all" ? "selected" : ""}>Todos los tipos</option>
        <option value="${EXPENSE_TYPES.variable}" ${ui.expenseType === EXPENSE_TYPES.variable ? "selected" : ""}>Variables</option>
        <option value="${EXPENSE_TYPES.fixed}" ${ui.expenseType === EXPENSE_TYPES.fixed ? "selected" : ""}>Fijos</option>
      </select>
      <input class="input" name="search" value="${escapeHtml(ui.expenseSearch)}" placeholder="Buscar por nombre" />
      <select class="select" name="sort">
        <option value="desc" ${ui.expenseSort === "desc" ? "selected" : ""}>Más nuevos primero</option>
        <option value="asc" ${ui.expenseSort === "asc" ? "selected" : ""}>Más viejos primero</option>
      </select>
      <button class="button button--secondary" type="submit">Aplicar filtros</button>
    </form>
    <section class="section list">${list}</section>
  `;
}

function renderFixed() {
  ensureMonth(ui.fixedMonthKey);
  const report = buildMonthlyReport(state, ui.fixedMonthKey);
  const allMonthly = getMonthlyFixed(ui.fixedMonthKey);
  const monthly = allMonthly
    .filter((item) => ui.fixedStatus === "all" || item.status === ui.fixedStatus)
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.nameSnapshot.localeCompare(b.nameSnapshot, "es"));

  const list = monthly.length
    ? monthly.map(renderMonthlyFixedRow).join("")
    : `<div class="empty">No hay fijos para mostrar con este filtro.</div>`;

  return `
    ${monthNav("fixedMonthKey")}
    <section class="section grid">
      ${metric("Progreso", `${report.fixed.paidCount} de ${report.fixed.total}`, "fijos pagados")}
      ${metric("Pagado", formatARS(report.fixed.paidTotalCents), "Total de fijos")}
      ${metric("Pendiente", formatARS(report.fixed.pendingEstimatedCents), `${report.fixed.pendingCount} fijos`)}
      ${metric("Omitidos", String(report.fixed.skippedCount), "Este mes")}
    </section>
    <section class="section stack">
      <div class="button-row">
        <button class="button" type="button" data-open-fixed-modal>Nuevo fijo</button>
        <select class="select" id="fixed-status-filter" aria-label="Filtrar fijos">
          <option value="all" ${ui.fixedStatus === "all" ? "selected" : ""}>Todos</option>
          <option value="${MONTHLY_FIXED_STATUSES.pending}" ${ui.fixedStatus === MONTHLY_FIXED_STATUSES.pending ? "selected" : ""}>Pendientes</option>
          <option value="${MONTHLY_FIXED_STATUSES.paid}" ${ui.fixedStatus === MONTHLY_FIXED_STATUSES.paid ? "selected" : ""}>Pagados</option>
          <option value="${MONTHLY_FIXED_STATUSES.skipped}" ${ui.fixedStatus === MONTHLY_FIXED_STATUSES.skipped ? "selected" : ""}>Omitidos</option>
        </select>
      </div>
      <div class="list">${list}</div>
    </section>
  `;
}

function renderSettings() {
  const categoryRows = state.categories
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map(
      (category) => `
        <div class="row">
          <div class="row__top">
            <div>
              <div class="row__title">${escapeHtml(category.name)}</div>
              <div class="row__meta">${categoryUsage(category.id)} usos</div>
            </div>
          </div>
          <div class="button-row">
            <button class="button button--small button--secondary" type="button" data-edit-category="${category.id}">Editar</button>
            <button class="button button--small button--danger" type="button" data-delete-category="${category.id}">Eliminar</button>
          </div>
        </div>
      `
    )
    .join("");

  const fixedRows = state.fixedExpenses
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map(
      (fixed) => `
        <div class="row">
          <div class="row__top">
            <div>
              <div class="row__title">${escapeHtml(fixed.name)}</div>
              <div class="row__meta">${escapeHtml(getCategoryName(state, fixed.categoryId))} · default ${formatARS(fixed.defaultAmountCents)}</div>
            </div>
            <span class="badge ${fixed.active ? "badge--paid" : "badge--skipped"}">${fixed.active ? "Activo" : "Inactivo"}</span>
          </div>
          <div class="button-row">
            <button class="button button--small button--secondary" type="button" data-edit-fixed="${fixed.id}">Editar</button>
            <button class="button button--small button--ghost" type="button" data-toggle-fixed="${fixed.id}">${fixed.active ? "Desactivar" : "Activar"}</button>
          </div>
        </div>
      `
    )
    .join("");

  return `
    <section class="section stack">
      <div class="card stack">
        <h2>Datos</h2>
        <button class="button" type="button" id="export-csv">Exportar gastos CSV</button>
        <label class="button button--secondary" for="import-csv">Importar CSV</label>
        <input class="file-input" id="import-csv" type="file" accept=".csv,text/csv" />
        <button class="button button--secondary" type="button" id="export-backup">Backup local JSON</button>
        <label class="button button--warning" for="import-backup">Importar backup</label>
        <input class="file-input" id="import-backup" type="file" accept=".json,application/json" />
      </div>
    </section>

    <section class="section stack">
      <h2>Categorías</h2>
      <form id="category-add-form" class="inline-form">
        <input class="input" name="name" placeholder="Nueva categoría" required />
        <button class="button button--secondary" type="submit">Crear</button>
      </form>
      <div class="list">${categoryRows}</div>
    </section>

    <section class="section stack">
      <div class="button-row">
        <h2 style="margin-bottom:0">Gastos fijos</h2>
        <button class="button button--small" type="button" data-open-fixed-modal>Nuevo fijo</button>
      </div>
      <div class="list">${fixedRows}</div>
    </section>
  `;
}

function renderMonthlyFixedRow(monthly) {
  const fixed = findById(state.fixedExpenses, monthly.fixedExpenseId);
  const isActive = fixed?.active;
  const canMarkPaid = monthly.status !== MONTHLY_FIXED_STATUSES.paid;

  return `
    <div class="row">
      <div class="row__top">
        <div>
          <div class="row__title">${escapeHtml(monthly.nameSnapshot)}</div>
          <div class="row__meta">${escapeHtml(getCategoryName(state, monthly.categoryId))}${isActive === false ? " · fijo dado de baja" : ""}</div>
        </div>
        <div style="text-align:right">
          <div class="row__amount">${formatARS(monthly.amountCents)}</div>
          ${statusBadge(monthly.status)}
        </div>
      </div>
      <div class="button-row">
        ${canMarkPaid ? `<button class="button button--small" type="button" data-pay-monthly="${monthly.id}">Marcar pagado</button>` : ""}
        <button class="button button--small button--secondary" type="button" data-edit-monthly-amount="${monthly.id}">Editar monto</button>
        ${monthly.status !== MONTHLY_FIXED_STATUSES.skipped ? `<button class="button button--small button--warning" type="button" data-skip-monthly="${monthly.id}">Omitir este mes</button>` : ""}
        ${monthly.status !== MONTHLY_FIXED_STATUSES.pending ? `<button class="button button--small button--ghost" type="button" data-pending-monthly="${monthly.id}">Volver pendiente</button>` : ""}
        ${isActive ? `<button class="button button--small button--danger" type="button" data-deactivate-fixed="${monthly.fixedExpenseId}">Dar de baja fijo</button>` : ""}
      </div>
    </div>
  `;
}

function renderModal() {
  if (!ui.modal) return "";
  if (ui.modal.type === "expense") return renderExpenseModal(ui.modal.id);
  if (ui.modal.type === "category") return renderCategoryModal(ui.modal.id);
  if (ui.modal.type === "delete-category") return renderDeleteCategoryModal(ui.modal.id);
  if (ui.modal.type === "fixed") return renderFixedExpenseModal(ui.modal.id);
  if (ui.modal.type === "monthly-amount") return renderMonthlyAmountModal(ui.modal.id);
  return "";
}

function renderExpenseModal(expenseId) {
  const expense = findById(state.expenses, expenseId);
  if (!expense) return "";

  return modalShell(
    "Editar gasto",
    `
      <form id="expense-edit-form" class="stack">
        <label class="field">
          <span>Monto</span>
          <input class="input input--amount" name="amount" inputmode="numeric" value="${amountInputValue(expense.amountCents)}" required />
        </label>
        <label class="field">
          <span>Nombre</span>
          <input class="input" name="name" value="${escapeHtml(expense.name)}" required />
        </label>
        <label class="field">
          <span>Categoría</span>
          <select class="select" name="categoryId" required>${categoryOptions(expense.categoryId)}</select>
        </label>
        <label class="field">
          <span>Fecha real del gasto</span>
          <input class="input" name="date" type="date" value="${expense.date}" required />
        </label>
        <button class="button" type="submit">Guardar cambios</button>
      </form>
    `
  );
}

function renderCategoryModal(categoryId) {
  const category = findById(state.categories, categoryId);
  if (!category) return "";

  return modalShell(
    "Editar categoría",
    `
      <form id="category-edit-form" class="stack">
        <label class="field">
          <span>Nombre</span>
          <input class="input" name="name" value="${escapeHtml(category.name)}" required />
        </label>
        <button class="button" type="submit">Guardar categoría</button>
      </form>
    `
  );
}

function renderDeleteCategoryModal(categoryId) {
  const category = findById(state.categories, categoryId);
  if (!category) return "";
  const replacements = state.categories.filter((item) => item.id !== categoryId);

  return modalShell(
    "Eliminar categoría",
    `
      <form id="category-delete-form" class="stack">
        <p class="danger-text">Los gastos y fijos de “${escapeHtml(category.name)}” se van a reasignar antes de eliminarla.</p>
        <label class="field">
          <span>Reasignar a</span>
          <select class="select" name="replacementCategoryId" required>
            ${replacements.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}
          </select>
        </label>
        <button class="button button--danger" type="submit">Reasignar y eliminar</button>
      </form>
    `
  );
}

function renderFixedExpenseModal(fixedExpenseId) {
  const fixed = fixedExpenseId ? findById(state.fixedExpenses, fixedExpenseId) : null;

  return modalShell(
    fixed ? "Editar fijo" : "Nuevo fijo",
    `
      <form id="fixed-edit-form" class="stack">
        <label class="field">
          <span>Nombre</span>
          <input class="input" name="name" value="${escapeHtml(fixed?.name || "")}" required />
        </label>
        <label class="field">
          <span>Categoría</span>
          <select class="select" name="categoryId" required>${categoryOptions(fixed?.categoryId)}</select>
        </label>
        <label class="field">
          <span>Monto default opcional</span>
          <input class="input" name="defaultAmount" inputmode="numeric" value="${amountInputValue(fixed?.defaultAmountCents)}" placeholder="0" />
        </label>
        <label class="field" style="display:flex;grid-template-columns:auto 1fr;align-items:center">
          <input name="active" type="checkbox" ${fixed?.active === false ? "" : "checked"} />
          <span>Activo para meses futuros</span>
        </label>
        <button class="button" type="submit">${fixed ? "Guardar fijo" : "Crear fijo"}</button>
      </form>
    `
  );
}

function renderMonthlyAmountModal(monthlyFixedExpenseId) {
  const monthly = findById(state.monthlyFixedExpenses, monthlyFixedExpenseId);
  if (!monthly) return "";

  return modalShell(
    "Editar monto",
    `
      <form id="monthly-amount-form" class="stack">
        <p class="muted">${escapeHtml(monthly.nameSnapshot)} · ${escapeHtml(monthLabel(monthly.monthKey))}</p>
        <label class="field">
          <span>Monto</span>
          <input class="input input--amount" name="amount" inputmode="numeric" value="${amountInputValue(monthly.amountCents)}" required />
        </label>
        <button class="button button--secondary" name="action" value="save" type="submit">Guardar monto</button>
        <button class="button" name="action" value="pay" type="submit">Guardar y marcar pagado</button>
      </form>
    `
  );
}

function bindCommonEvents() {
  document.querySelectorAll("[data-month-shift]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.monthState;
      ui[key] = button.dataset.monthShift === "previous" ? previousMonthKey(ui[key]) : nextMonthKey(ui[key]);
      if (key === "summaryMonthKey" || key === "fixedMonthKey") ensureMonth(ui[key]);
      saveState(state);
      render();
    });
  });

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", closeModal);
  });

  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });
  });

  bindModalEvents();
}

function bindViewEvents() {
  if (ui.view === "home") bindHomeEvents();
  if (ui.view === "expenses") bindExpensesEvents();
  if (ui.view === "fixed") bindFixedEvents();
  if (ui.view === "settings") bindSettingsEvents();
}

function bindHomeEvents() {
  document.querySelectorAll("[data-home-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.homeMode = button.dataset.homeMode;
      render();
    });
  });

  document.querySelector("#variable-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    withError(() => {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      addVariableExpense(state, {
        name: data.name,
        amountCents: parseAmountToCents(data.amount),
        categoryId: data.categoryId,
        date: data.date
      });
      persist("Gasto guardado");
    });
  });

  const fixedSelect = document.querySelector("#home-fixed-select");
  const fixedAmount = document.querySelector("#home-fixed-amount");
  fixedSelect?.addEventListener("change", () => {
    const selected = fixedSelect.selectedOptions[0];
    fixedAmount.value = amountInputValue(Number(selected?.dataset.amount || 0));
  });

  document.querySelector("#fixed-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    withError(() => {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      payMonthlyFixedExpense(state, data.monthlyFixedId, parseAmountToCents(data.amount), dateInputValue());
      persist("Fijo pagado");
    });
  });
}

function bindExpensesEvents() {
  document.querySelector("#expense-filter-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    ui.expenseCategoryId = data.categoryId;
    ui.expenseType = data.type;
    ui.expenseSearch = data.search;
    ui.expenseSort = data.sort;
    render();
  });

  document.querySelectorAll("[data-edit-expense]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.modal = { type: "expense", id: button.dataset.editExpense };
      render();
    });
  });

  document.querySelectorAll("[data-delete-expense]").forEach((button) => {
    button.addEventListener("click", () => {
      const expense = findById(state.expenses, button.dataset.deleteExpense);
      if (!expense) return;
      if (!confirm(`¿Borrar “${expense.name}”?`)) return;
      deleteExpense(state, expense.id);
      persist("Gasto borrado");
    });
  });
}

function bindFixedEvents() {
  document.querySelector("#fixed-status-filter")?.addEventListener("change", (event) => {
    ui.fixedStatus = event.currentTarget.value;
    render();
  });

  document.querySelectorAll("[data-open-fixed-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.modal = { type: "fixed", id: null };
      render();
    });
  });

  document.querySelectorAll("[data-pay-monthly]").forEach((button) => {
    button.addEventListener("click", () => {
      const monthly = findById(state.monthlyFixedExpenses, button.dataset.payMonthly);
      if (!monthly) return;
      if (monthly.amountCents <= 0) {
        ui.modal = { type: "monthly-amount", id: monthly.id };
        render();
        return;
      }
      withError(() => {
        payMonthlyFixedExpense(state, monthly.id, monthly.amountCents, dateForMonth(monthly.monthKey));
        persist("Fijo pagado");
      });
    });
  });

  document.querySelectorAll("[data-edit-monthly-amount]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.modal = { type: "monthly-amount", id: button.dataset.editMonthlyAmount };
      render();
    });
  });

  document.querySelectorAll("[data-skip-monthly]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!confirm("¿Omitir este fijo solo por este mes?")) return;
      skipMonthlyFixedExpense(state, button.dataset.skipMonthly);
      persist("Fijo omitido este mes");
    });
  });

  document.querySelectorAll("[data-pending-monthly]").forEach((button) => {
    button.addEventListener("click", () => {
      setMonthlyFixedPending(state, button.dataset.pendingMonthly);
      persist("Fijo vuelto a pendiente");
    });
  });

  document.querySelectorAll("[data-deactivate-fixed]").forEach((button) => {
    button.addEventListener("click", () => {
      const fixed = findById(state.fixedExpenses, button.dataset.deactivateFixed);
      if (!fixed) return;
      if (!confirm(`¿Dar de baja “${fixed.name}” para meses futuros?`)) return;
      deactivateFixedExpense(state, fixed.id);
      persist("Fijo dado de baja");
    });
  });
}

function bindSettingsEvents() {
  document.querySelector("#export-csv")?.addEventListener("click", () => {
    downloadFile(`gastos-${dateInputValue()}.csv`, exportExpensesCSV(state), "text/csv;charset=utf-8");
    showToast("CSV exportado");
  });

  document.querySelector("#export-backup")?.addEventListener("click", () => {
    downloadFile(`backup-gastos-${dateInputValue()}.json`, exportBackupJSON(state), "application/json;charset=utf-8");
    showToast("Backup exportado");
  });

  document.querySelector("#import-csv")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    withErrorAsync(async () => {
      const text = await file.text();
      const result = importExpensesCSV(state, text);
      persist(`${result.imported} gastos importados`);
    });
  });

  document.querySelector("#import-backup")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!confirm("Esto reemplaza todos los datos locales por el backup. ¿Seguimos?")) return;
    withErrorAsync(async () => {
      const text = await file.text();
      state = importBackupJSON(text);
      replaceState(state);
      ensureMonth(currentMonthKey());
      saveState(state);
      render();
      showToast("Backup restaurado");
    });
  });

  document.querySelector("#category-add-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    withError(() => {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      addCategory(state, data.name);
      persist("Categoría creada");
    });
  });

  document.querySelectorAll("[data-edit-category]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.modal = { type: "category", id: button.dataset.editCategory };
      render();
    });
  });

  document.querySelectorAll("[data-delete-category]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.categories.length <= 1) {
        showToast("Necesitás al menos una categoría");
        return;
      }
      ui.modal = { type: "delete-category", id: button.dataset.deleteCategory };
      render();
    });
  });

  document.querySelectorAll("[data-open-fixed-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.modal = { type: "fixed", id: null };
      render();
    });
  });

  document.querySelectorAll("[data-edit-fixed]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.modal = { type: "fixed", id: button.dataset.editFixed };
      render();
    });
  });

  document.querySelectorAll("[data-toggle-fixed]").forEach((button) => {
    button.addEventListener("click", () => {
      const fixed = findById(state.fixedExpenses, button.dataset.toggleFixed);
      if (!fixed) return;
      setFixedExpenseActive(state, fixed.id, !fixed.active);
      ensureMonth(currentMonthKey());
      persist(fixed.active ? "Fijo activado" : "Fijo desactivado");
    });
  });
}

function bindModalEvents() {
  document.querySelector("#expense-edit-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    withError(() => {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      updateExpense(state, ui.modal.id, {
        name: data.name,
        amountCents: parseAmountToCents(data.amount),
        categoryId: data.categoryId,
        date: data.date
      });
      closeModal();
      persist("Gasto actualizado");
    });
  });

  document.querySelector("#category-edit-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    withError(() => {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      renameCategory(state, ui.modal.id, data.name);
      closeModal();
      persist("Categoría actualizada");
    });
  });

  document.querySelector("#category-delete-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    withError(() => {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      deleteCategoryWithReassignment(state, ui.modal.id, data.replacementCategoryId);
      closeModal();
      persist("Categoría eliminada");
    });
  });

  document.querySelector("#fixed-edit-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    withError(() => {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const editing = Boolean(ui.modal.id);
      const input = {
        name: data.name,
        categoryId: data.categoryId,
        defaultAmountCents: parseAmountToCents(data.defaultAmount),
        active: data.active === "on"
      };
      if (editing) updateFixedExpense(state, ui.modal.id, input);
      else addFixedExpense(state, input);
      ensureMonth(ui.fixedMonthKey);
      ensureMonth(currentMonthKey());
      closeModal();
      persist(editing ? "Fijo actualizado" : "Fijo creado");
    });
  });

  document.querySelector("#monthly-amount-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    withError(() => {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const action = event.submitter?.value || data.action || "save";
      const amountCents = parseAmountToCents(data.amount);
      updateMonthlyFixedAmount(state, ui.modal.id, amountCents);
      if (action === "pay") {
        payMonthlyFixedExpense(state, ui.modal.id, amountCents, dateForMonth(findById(state.monthlyFixedExpenses, ui.modal.id).monthKey));
      }
      closeModal();
      persist(action === "pay" ? "Fijo pagado" : "Monto guardado");
    });
  });
}

function filteredExpenses() {
  const search = normalizeName(ui.expenseSearch);
  return state.expenses
    .filter((expense) => monthKeyFromDate(expense.date) === ui.expensesMonthKey)
    .filter((expense) => ui.expenseCategoryId === "all" || expense.categoryId === ui.expenseCategoryId)
    .filter((expense) => ui.expenseType === "all" || expense.type === ui.expenseType)
    .filter((expense) => !search || expense.normalizedName.includes(search))
    .sort((a, b) => (ui.expenseSort === "asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)));
}

function getMonthlyFixed(monthKey) {
  return state.monthlyFixedExpenses.filter((monthly) => monthly.monthKey === monthKey);
}

function ensureMonth(monthKey) {
  const before = state.monthlyFixedExpenses.length;
  ensureMonthlyFixedForMonth(state, monthKey);
  if (state.monthlyFixedExpenses.length !== before) saveState(state);
}

function monthNav(stateKey) {
  return `
    <div class="month-nav">
      <button class="icon-button" type="button" data-month-state="${stateKey}" data-month-shift="previous" aria-label="Mes anterior">‹</button>
      <strong>${escapeHtml(monthLabel(ui[stateKey]))}</strong>
      <button class="icon-button" type="button" data-month-state="${stateKey}" data-month-shift="next" aria-label="Mes siguiente">›</button>
    </div>
  `;
}

function metric(label, value, hint = "") {
  return `
    <div class="metric">
      <div class="metric__label">${escapeHtml(label)}</div>
      <div class="metric__value">${escapeHtml(value)}</div>
      ${hint ? `<div class="metric__hint">${escapeHtml(hint)}</div>` : ""}
    </div>
  `;
}

function fixedMiniList(items) {
  if (!items.length) return `<div class="empty">Nada pendiente.</div>`;
  return items
    .map(
      (monthly) => `
        <div class="row">
          <div class="row__top">
            <div>
              <div class="row__title">${escapeHtml(monthly.nameSnapshot)}</div>
              <div class="row__meta">${escapeHtml(getCategoryName(state, monthly.categoryId))}</div>
            </div>
            <div class="row__amount">${formatARS(monthly.amountCents)}</div>
          </div>
        </div>
      `
    )
    .join("");
}

function categoryOptions(selectedId = state.categories[0]?.id) {
  return state.categories
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((category) => `<option value="${category.id}" ${category.id === selectedId ? "selected" : ""}>${escapeHtml(category.name)}</option>`)
    .join("");
}

function statusBadge(status) {
  const labels = {
    [MONTHLY_FIXED_STATUSES.pending]: "Pendiente",
    [MONTHLY_FIXED_STATUSES.paid]: "Pagado",
    [MONTHLY_FIXED_STATUSES.skipped]: "Omitido"
  };
  return `<span class="badge badge--${status}">${labels[status] || status}</span>`;
}

function statusRank(status) {
  if (status === MONTHLY_FIXED_STATUSES.pending) return 0;
  if (status === MONTHLY_FIXED_STATUSES.paid) return 1;
  return 2;
}

function categoryUsage(categoryId) {
  return (
    state.expenses.filter((expense) => expense.categoryId === categoryId).length +
    state.fixedExpenses.filter((fixed) => fixed.categoryId === categoryId).length +
    state.monthlyFixedExpenses.filter((monthly) => monthly.categoryId === categoryId).length
  );
}

function currentMonthKey() {
  return monthKeyFromDate(new Date());
}

function modalShell(title, body) {
  return `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal__panel">
        <div class="modal__header">
          <h2>${escapeHtml(title)}</h2>
          <button class="button button--small button--ghost" type="button" data-close-modal>Cerrar</button>
        </div>
        ${body}
      </div>
    </div>
  `;
}

function closeModal() {
  ui.modal = null;
  render();
}

function persist(message) {
  saveState(state);
  render();
  showToast(message);
}

function withError(callback) {
  try {
    callback();
  } catch (error) {
    showToast(error.message || "Algo salió mal");
  }
}

async function withErrorAsync(callback) {
  try {
    await callback();
  } catch (error) {
    showToast(error.message || "Algo salió mal");
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("No se pudo registrar el service worker", error);
    });
  });
}
