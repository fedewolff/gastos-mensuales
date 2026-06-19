import test from "node:test";
import assert from "node:assert/strict";
import { addVariableExpense, emptyState, ensureCategory, seedState } from "../src/domain.js";

class MockLocalStorage {
  constructor() {
    this.items = new Map();
  }

  getItem(key) {
    return this.items.has(key) ? this.items.get(key) : null;
  }

  setItem(key, value) {
    this.items.set(key, String(value));
  }

  removeItem(key) {
    this.items.delete(key);
  }

  keys() {
    return Array.from(this.items.keys());
  }
}

async function loadStorageModule() {
  globalThis.localStorage = new MockLocalStorage();
  return import(`../src/storage.js?test=${Date.now()}-${Math.random()}`);
}

function stateWithExpense(name, amountCents) {
  const state = seedState(emptyState(), "2026-06-19T12:00:00.000Z");
  const category = ensureCategory(state, "Comida", "2026-06-19T12:00:00.000Z");
  addVariableExpense(
    state,
    {
      name,
      amountCents,
      categoryId: category.id,
      date: "2026-06-19"
    },
    "2026-06-19T12:00:00.000Z"
  );
  return state;
}

test("saveState guarda estado actual y autoguardado anterior", async () => {
  const { saveState } = await loadStorageModule();
  const first = stateWithExpense("Café QA", 550000);
  const second = stateWithExpense("Cena QA", 3150000);

  saveState(first);
  saveState(second);

  const current = JSON.parse(localStorage.getItem("gastos-mensuales:data:v1"));
  const lastGood = JSON.parse(localStorage.getItem("gastos-mensuales:data:v1:last-good"));
  const previousGood = JSON.parse(localStorage.getItem("gastos-mensuales:data:v1:previous-good"));

  assert.equal(current.expenses[0].name, "Cena QA");
  assert.equal(lastGood.expenses[0].name, "Cena QA");
  assert.equal(previousGood.expenses[0].name, "Café QA");
});

test("loadState recupera último estado bueno si el principal está corrupto", async () => {
  const { loadState, saveState } = await loadStorageModule();
  const valid = stateWithExpense("Persistido QA", 8900000);
  const originalConsoleError = console.error;

  saveState(valid);
  localStorage.setItem("gastos-mensuales:data:v1", "{broken json");

  console.error = () => {};
  try {
    const loaded = loadState();
    const recoveryKeys = localStorage.keys().filter((key) => key.startsWith("gastos-mensuales:data:v1:recovery:"));

    assert.equal(loaded.expenses.length, 1);
    assert.equal(loaded.expenses[0].name, "Persistido QA");
    assert.equal(recoveryKeys.length, 1);
  } finally {
    console.error = originalConsoleError;
  }
});

test("restorePreviousState permite volver al autoguardado anterior", async () => {
  const { restorePreviousState, saveState } = await loadStorageModule();
  const first = stateWithExpense("Antes QA", 100000);
  const second = stateWithExpense("Después QA", 200000);

  saveState(first);
  saveState(second);

  const restored = restorePreviousState();

  assert.equal(restored.expenses.length, 1);
  assert.equal(restored.expenses[0].name, "Antes QA");
});
