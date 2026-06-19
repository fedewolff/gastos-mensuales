import { emptyState, seedState, upgradeState } from "./domain.js";

const STORAGE_KEY = "gastos-mensuales:data:v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : emptyState();
    return seedState(upgradeState(parsed));
  } catch (error) {
    console.error("No se pudo cargar el estado local", error);
    return seedState(emptyState());
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function replaceState(state) {
  saveState(upgradeState(state));
}
