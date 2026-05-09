import { readonly, ref, type Ref } from "vue";

export type LFrameBackgroundType = "color" | "gradient" | "image" | "css";
export type LFrameBackgroundResolver = "url" | "cache";
export type LFrameInhibitorTimerStyle = "bar" | "text";

export interface LFrameBackgroundConfig {
  type: LFrameBackgroundType;
  value?: string;
  src?: string;
  resolve?: LFrameBackgroundResolver;
  fit?: string;
  position?: string;
  repeat?: string;
}

export interface LFrameInhibitorTimersConfig {
  enabled: boolean;
  style: LFrameInhibitorTimerStyle;
  debug: boolean;
  liveClientFallback: boolean;
  liveClientUrl: string;
  liveClientPollMs: number;
}

export interface LFrameConfig {
  background: LFrameBackgroundConfig;
  inhibitors: LFrameInhibitorTimersConfig;
}

const DEFAULT_CONFIG: LFrameConfig = {
  background: {
    type: "color",
    value: "#000000",
    fit: "cover",
    position: "center",
    repeat: "no-repeat",
  },
  inhibitors: {
    enabled: true,
    style: "bar",
    debug: false,
    liveClientFallback: true,
    liveClientUrl: "/riot-liveclient/liveclientdata/allgamedata",
    liveClientPollMs: 1000,
  },
};

const config = ref<LFrameConfig>(DEFAULT_CONFIG);
const loaded = ref(false);
const loadError = ref<unknown>(null);
let loadPromise: Promise<void> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBackgroundType(value: unknown): LFrameBackgroundType {
  return value === "gradient" || value === "image" || value === "css" || value === "color"
    ? value
    : "color";
}

function parseResolver(value: unknown): LFrameBackgroundResolver | undefined {
  return value === "cache" || value === "url" ? value : undefined;
}

function parseString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function parseNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseInhibitorTimerStyle(value: unknown): LFrameInhibitorTimerStyle {
  return value === "text" || value === "bar" ? value : DEFAULT_CONFIG.inhibitors.style;
}

function parseBackground(value: unknown): LFrameBackgroundConfig {
  if (!isRecord(value)) return DEFAULT_CONFIG.background;

  return {
    type: parseBackgroundType(value.type),
    value: parseString(value.value),
    src: parseString(value.src),
    resolve: parseResolver(value.resolve),
    fit: parseString(value.fit) ?? DEFAULT_CONFIG.background.fit,
    position: parseString(value.position) ?? DEFAULT_CONFIG.background.position,
    repeat: parseString(value.repeat) ?? DEFAULT_CONFIG.background.repeat,
  };
}

function parseInhibitors(value: unknown): LFrameInhibitorTimersConfig {
  if (!isRecord(value)) return DEFAULT_CONFIG.inhibitors;

  return {
    enabled: parseBoolean(value.enabled, DEFAULT_CONFIG.inhibitors.enabled),
    style: parseInhibitorTimerStyle(value.style),
    debug: parseBoolean(value.debug, DEFAULT_CONFIG.inhibitors.debug),
    liveClientFallback: parseBoolean(
      value.liveClientFallback,
      DEFAULT_CONFIG.inhibitors.liveClientFallback,
    ),
    liveClientUrl: parseString(value.liveClientUrl) ?? DEFAULT_CONFIG.inhibitors.liveClientUrl,
    liveClientPollMs: Math.max(
      500,
      parseNumber(value.liveClientPollMs, DEFAULT_CONFIG.inhibitors.liveClientPollMs),
    ),
  };
}

function normalizeConfig(value: unknown): LFrameConfig {
  if (!isRecord(value)) return DEFAULT_CONFIG;

  return {
    background: parseBackground(value.background),
    inhibitors: parseInhibitors(value.inhibitors),
  };
}

async function loadLFrameConfig() {
  try {
    const response = await fetch("/lframe.json", { cache: "no-store" });
    if (!response.ok) {
      config.value = DEFAULT_CONFIG;
      return;
    }

    config.value = normalizeConfig(await response.json());
  } catch (error) {
    loadError.value = error;
    config.value = DEFAULT_CONFIG;
  } finally {
    loaded.value = true;
  }
}

function ensureLoaded() {
  if (!loadPromise) {
    loadPromise = loadLFrameConfig();
  }
}

export function useLFrameConfig(): {
  config: Readonly<Ref<LFrameConfig>>;
  loaded: Readonly<Ref<boolean>>;
  loadError: Readonly<Ref<unknown>>;
} {
  ensureLoaded();

  return {
    config: readonly(config),
    loaded: readonly(loaded),
    loadError: readonly(loadError),
  };
}
