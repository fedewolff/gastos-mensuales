import { emptyState, seedState, upgradeState } from "./domain.js?v=14";

const STORAGE_KEY = "gastos-mensuales:data:v1";
const LAST_GOOD_KEY = "gastos-mensuales:data:v1:last-good";
const PREVIOUS_GOOD_KEY = "gastos-mensuales:data:v1:previous-good";
const RECOVERY_PREFIX = "gastos-mensuales:data:v1:recovery:";

export function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return parseStoredState(raw);
    } catch (error) {
      console.error("No se pudo cargar el estado local principal", error);
      preserveRecoveryCopy(raw);

      const lastGood = localStorage.getItem(LAST_GOOD_KEY);
      if (lastGood) {
        try {
          return parseStoredState(lastGood);
        } catch (backupError) {
          console.error("No se pudo cargar el último estado bueno", backupError);
          preserveRecoveryCopy(lastGood);
        }
      }
    }
  }

  const lastGood = localStorage.getItem(LAST_GOOD_KEY);
  if (lastGood) {
    try {
      return parseStoredState(lastGood);
    } catch (error) {
      console.error("No se pudo recuperar el último estado bueno", error);
      preserveRecoveryCopy(lastGood);
    }
  }

  return seedState(emptyState());
}

export function saveState(state) {
  const nextRaw = JSON.stringify(upgradeState(state));
  const currentRaw = localStorage.getItem(STORAGE_KEY);

  if (currentRaw && currentRaw !== nextRaw) {
    localStorage.setItem(PREVIOUS_GOOD_KEY, currentRaw);
  }

  localStorage.setItem(STORAGE_KEY, nextRaw);
  localStorage.setItem(LAST_GOOD_KEY, nextRaw);
}

export function replaceState(state) {
  saveState(upgradeState(state));
}

export function restorePreviousState() {
  const raw = localStorage.getItem(PREVIOUS_GOOD_KEY) || localStorage.getItem(LAST_GOOD_KEY);
  if (!raw) throw new Error("No hay autoguardado anterior para restaurar.");

  const restored = parseStoredState(raw);
  saveState(restored);
  return restored;
}

function parseStoredState(raw) {
  return seedState(upgradeState(JSON.parse(raw)));
}

function preserveRecoveryCopy(raw) {
  if (!raw) return;

  try {
    localStorage.setItem(`${RECOVERY_PREFIX}${new Date().toISOString()}`, raw);
  } catch (error) {
    console.error("No se pudo preservar una copia de recuperación", error);
  }
}
