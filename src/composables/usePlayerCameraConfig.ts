import { computed, readonly, ref, type Ref } from "vue";
import type { teamMember } from "@bluebottle_gg/league-broadcast-client";

export type PlayerCameraMode = "none" | "static" | "player";
export type PlayerCameraNoneLayout = "compact" | "expanded";
export type PlayerCameraSourceType = "image" | "video" | "iframe";
export type PlayerCameraSourceResolver = "url" | "cache";
export type PlayerCameraFit = "cover" | "contain";

export interface PlayerCameraSource {
  label?: string;
  src?: string;
  type?: PlayerCameraSourceType;
  resolve?: PlayerCameraSourceResolver;
  poster?: string;
  fit?: PlayerCameraFit;
  muted?: boolean;
  loop?: boolean;
  autoplay?: boolean;
}

export interface PlayerCameraConfig {
  mode: PlayerCameraMode;
  noneLayout: PlayerCameraNoneLayout;
  rotationMs: number;
  showDeadState: boolean;
  static: {
    left?: PlayerCameraSource;
    right?: PlayerCameraSource;
  };
  players: Record<string, PlayerCameraSource>;
}

const DEFAULT_CONFIG: PlayerCameraConfig = {
  mode: "player",
  noneLayout: "compact",
  rotationMs: 10000,
  showDeadState: true,
  static: {},
  players: {},
};

const config = ref<PlayerCameraConfig>(DEFAULT_CONFIG);
const loaded = ref(false);
const loadError = ref<unknown>(null);
let loadPromise: Promise<void> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMode(value: unknown): PlayerCameraMode {
  return value === "none" || value === "static" || value === "player" ? value : "player";
}

function parseNoneLayout(value: unknown): PlayerCameraNoneLayout {
  return value === "expanded" ? "expanded" : "compact";
}

function parseSourceType(value: unknown): PlayerCameraSourceType | undefined {
  return value === "image" || value === "video" || value === "iframe" ? value : undefined;
}

function parseResolver(value: unknown): PlayerCameraSourceResolver | undefined {
  return value === "url" || value === "cache" ? value : undefined;
}

function parseFit(value: unknown): PlayerCameraFit | undefined {
  return value === "cover" || value === "contain" ? value : undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function parsePositiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseSource(value: unknown): PlayerCameraSource | undefined {
  if (!isRecord(value)) return undefined;

  const source: PlayerCameraSource = {};

  if (typeof value.label === "string") source.label = value.label;
  if (typeof value.src === "string") source.src = value.src;
  if (typeof value.poster === "string") source.poster = value.poster;

  const type = parseSourceType(value.type);
  const resolve = parseResolver(value.resolve);
  const fit = parseFit(value.fit);
  const muted = parseBoolean(value.muted);
  const loop = parseBoolean(value.loop);
  const autoplay = parseBoolean(value.autoplay);

  if (type) source.type = type;
  if (resolve) source.resolve = resolve;
  if (fit) source.fit = fit;
  if (muted !== undefined) source.muted = muted;
  if (loop !== undefined) source.loop = loop;
  if (autoplay !== undefined) source.autoplay = autoplay;

  return Object.keys(source).length > 0 ? source : undefined;
}

function parseStaticSources(value: unknown): PlayerCameraConfig["static"] {
  if (!isRecord(value)) return {};

  return {
    left: parseSource(value.left),
    right: parseSource(value.right),
  };
}

function parsePlayerSources(value: unknown): Record<string, PlayerCameraSource> {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, source]) => [key, parseSource(source)] as const)
      .filter((entry): entry is readonly [string, PlayerCameraSource] => Boolean(entry[1])),
  );
}

function normalizeConfig(value: unknown): PlayerCameraConfig {
  if (!isRecord(value)) return DEFAULT_CONFIG;

  return {
    mode: parseMode(value.mode),
    noneLayout: parseNoneLayout(value.noneLayout),
    rotationMs: parsePositiveNumber(value.rotationMs, DEFAULT_CONFIG.rotationMs),
    showDeadState: parseBoolean(value.showDeadState) ?? DEFAULT_CONFIG.showDeadState,
    static: parseStaticSources(value.static),
    players: parsePlayerSources(value.players),
  };
}

async function loadPlayerCameraConfig() {
  try {
    const response = await fetch("/player-cameras.json", { cache: "no-store" });
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
    loadPromise = loadPlayerCameraConfig();
  }
}

function pushKey(keys: string[], value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return;

  const key = String(value).trim();
  if (!key || keys.includes(key)) return;
  keys.push(key);
}

function getPlayerCameraKeys(player: teamMember | undefined): string[] {
  if (!player) return [];

  const keys: string[] = [];
  pushKey(keys, `${player.alias}#${player.tag}`);
  pushKey(keys, player.displayName);
  pushKey(keys, player.alias);
  pushKey(keys, player.memberId);

  return keys;
}

export function getConfiguredPlayerCameraSource(
  playerSources: Record<string, PlayerCameraSource>,
  player: teamMember | undefined,
): PlayerCameraSource | undefined {
  for (const key of getPlayerCameraKeys(player)) {
    const source = playerSources[key] ?? playerSources[key.toLowerCase()];
    if (source) return source;
  }

  return undefined;
}

export function usePlayerCameraConfig(): {
  config: Readonly<Ref<PlayerCameraConfig>>;
  loaded: Readonly<Ref<boolean>>;
  loadError: Readonly<Ref<unknown>>;
  camerasEnabled: Readonly<Ref<boolean>>;
  expandBottomWhenCamerasHidden: Readonly<Ref<boolean>>;
} {
  ensureLoaded();

  return {
    config: readonly(config),
    loaded: readonly(loaded),
    loadError: readonly(loadError),
    camerasEnabled: readonly(computed(() => config.value.mode !== "none")),
    expandBottomWhenCamerasHidden: readonly(
      computed(() => config.value.mode === "none" && config.value.noneLayout === "expanded"),
    ),
  };
}
