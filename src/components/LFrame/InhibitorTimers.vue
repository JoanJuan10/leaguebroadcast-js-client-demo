<script setup lang="ts">
import { useClient } from "@/client";
import { useIngameSelector } from "@/composables/useIngame";
import { useLFrameConfig } from "@/composables/useLFrameConfig";
import { useOverlayConfig } from "@/composables/useOverlayConfig";
import { handleImageError, handleImageLoad } from "@/utils/imageUtils";
import FadeTransition from "@/transitions/FadeTransition.vue";
import TopIcon from "@/assets/lane/top-placeholder-cropped.svg";
import MidIcon from "@/assets/lane/mid-placeholder-cropped.svg";
import BotIcon from "@/assets/lane/bot-placeholder-cropped.svg";
import {
  AnnouncementType,
  IngameObjectiveType,
  Team,
  getRemaining,
  type announcerEvent,
  type iObjectiveRespawnData,
  type ingameObjectiveEvent,
  type ingameScoreboardTeamData,
  type teamInhibitorData,
} from "@bluebottle_gg/league-broadcast-client";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

const INHIBITOR_RESPAWN_SECONDS = 300;

const client = useClient();
const { config } = useLFrameConfig();
const { config: overlayConfig } = useOverlayConfig();
const inhibitors = useIngameSelector((state) => state.gameData.inhibitors);
const gameTime = useIngameSelector((state) => state.gameData.gameTime);
const scoreboard = useIngameSelector((state) => state.gameData.scoreboard);
const gameTeams = useIngameSelector((state) => state.gameData.teams);
const lastKnownScoreboardTeams = ref<ingameScoreboardTeamData[]>([]);
const fallbackInhibitors = ref<teamInhibitorData[]>([]);
const liveClientInhibitors = ref<teamInhibitorData[]>([]);
const debugEntries = ref<string[]>([]);
const liveClientGameTime = ref(0);
const liveClientStatus = ref("");
let unsubscribeEvents: (() => void) | undefined;
let liveClientPollId: number | undefined;
let liveClientAbortController: AbortController | undefined;
let liveClientPolling = false;
let liveClientPollingKey = "";
let isMounted = false;

const lanes = [
  { key: "top", type: IngameObjectiveType.INHIBITOR_L0, icon: TopIcon },
  { key: "mid", type: IngameObjectiveType.INHIBITOR_L1, icon: MidIcon },
  { key: "bot", type: IngameObjectiveType.INHIBITOR_L2, icon: BotIcon },
] as const;

type LaneDefinition = (typeof lanes)[number];
type LaneKey = LaneDefinition["key"];

interface InhibitorSlot {
  lane: LaneDefinition;
  active: boolean;
  formattedTime: string;
  progressPct: string;
}

interface InhibitorTeamView {
  key: string;
  index: number;
  teamName: string;
  teamTag: string;
  iconUrl?: string;
  color: string;
  missingCount: number;
  slots: InhibitorSlot[];
}

interface LiveClientEvent extends Record<string, unknown> {
  EventID?: number | string;
  EventName?: string;
  EventTime?: number | string;
}

interface ParsedLiveClientInhibitorEvent {
  type: "kill" | "spawn";
  teamIndex: number;
  laneIndex: number;
  eventTime: number;
  inhibitorName: string;
}

type InhibitorObjectiveData = iObjectiveRespawnData & {
  clockSource?: "liveClient";
};

const timerStyle = computed(() => config.value.inhibitors.style);
const inhibitorTitle = computed(() => overlayConfig.value.text.inhibitors.title);
function laneLabel(key: LaneKey): string {
  return overlayConfig.value.text.inhibitors[key];
}

const currentGameTime = computed(() => {
  const blueBottleTime = Number(gameTime.value);
  if (Number.isFinite(blueBottleTime) && blueBottleTime > 0) return blueBottleTime;

  return liveClientGameTime.value;
});
const liveClientReferenceTime = computed(() => {
  const blueBottleTime = Number(gameTime.value);
  const hasBlueBottleTime = Number.isFinite(blueBottleTime) && blueBottleTime > 0;
  const hasLiveClientTime = liveClientGameTime.value > 0;

  if (hasBlueBottleTime && hasLiveClientTime) {
    return Math.max(blueBottleTime, liveClientGameTime.value);
  }

  return hasLiveClientTime ? liveClientGameTime.value : currentGameTime.value;
});

const inhibitorData = computed(() =>
  mergeInhibitorData(
    inhibitors.value ?? [],
    [...fallbackInhibitors.value, ...liveClientInhibitors.value],
  ),
);

const teamViews = computed(() => {
  const data = inhibitorData.value;
  return data.map((teamData, index) => buildTeamView(teamData, index));
});

const teamsWithMissingInhibitors = computed(() =>
  teamViews.value.filter((team) => team.missingCount > 0),
);

const isDualTeamMode = computed(() => teamsWithMissingInhibitors.value.length > 1);

const visibleTeams = computed(() => {
  if (isDualTeamMode.value) {
    return [...teamsWithMissingInhibitors.value]
      .sort((a, b) => a.index - b.index)
      .slice(0, 2);
  }
  return teamsWithMissingInhibitors.value.slice(0, 1);
});

const shouldShow = computed(
  () => config.value.inhibitors.enabled && visibleTeams.value.length > 0,
);
const debugText = computed(() =>
  [
    `raw:${inhibitors.value?.length ?? 0}`,
    `fb:${fallbackInhibitors.value.length}`,
    `live:${liveClientInhibitors.value.length}`,
    `view:${visibleTeams.value.length}`,
    `t:${Math.floor(currentGameTime.value)}`,
    ...(liveClientStatus.value ? [liveClientStatus.value] : []),
    ...debugEntries.value,
  ].join(" | "),
);

onMounted(() => {
  isMounted = true;
  unsubscribeEvents = client.onIngameEvents({
    onObjectiveEvent: handleObjectiveEvent,
    onAnnouncementEvent: handleAnnouncementEvent,
  });
  syncLiveClientPolling();
});

onUnmounted(() => {
  isMounted = false;
  unsubscribeEvents?.();
  stopLiveClientPolling();
});

watch(currentGameTime, pruneExpiredFallbackInhibitors);
watch(
  scoreboard,
  (value) => {
    const teams = value?.teams;
    if (teams && teams.length >= 2) {
      lastKnownScoreboardTeams.value = teams;
    }
  },
  { immediate: true },
);
watch(
  () =>
    [
      config.value.inhibitors.liveClientFallback,
      config.value.inhibitors.liveClientUrl,
      config.value.inhibitors.liveClientPollMs,
    ] as const,
  syncLiveClientPolling,
);

function normalizeKey(value?: string): string {
  return value?.trim().toLowerCase() ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function logDebug(message: string) {
  if (!config.value.inhibitors.debug) return;

  debugEntries.value = [`${Math.floor(currentGameTime.value)} ${message}`, ...debugEntries.value].slice(0, 3);
}

function normalizeObjectiveType(value: iObjectiveRespawnData["type"]): IngameObjectiveType | undefined {
  if (typeof value === "number") return value;

  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed as IngameObjectiveType;

  return IngameObjectiveType[value as keyof typeof IngameObjectiveType];
}

function laneIndexForObjective(key: string, objective: iObjectiveRespawnData): number {
  const type = normalizeObjectiveType(objective.type);
  const keyLower = key.toLowerCase();

  if (type === IngameObjectiveType.INHIBITOR_L0 || keyLower.includes("l0") || keyLower.includes("top")) {
    return 0;
  }

  if (type === IngameObjectiveType.INHIBITOR_L1 || keyLower.includes("l1") || keyLower.includes("mid")) {
    return 1;
  }

  if (type === IngameObjectiveType.INHIBITOR_L2 || keyLower.includes("l2") || keyLower.includes("bot")) {
    return 2;
  }

  return Math.max(0, Math.min(2, Number(key) || 0));
}

function laneIndexFromObjectiveName(objective: string): number {
  const value = objective.toLowerCase();

  if (value.includes("l0") || value.includes("top")) return 0;
  if (value.includes("l1") || value.includes("mid")) return 1;
  if (value.includes("l2") || value.includes("bot") || value.includes("bottom")) return 2;

  return -1;
}

function remainingFor(objective?: iObjectiveRespawnData): number {
  if (!objective || objective.timeAlive === undefined) return 0;

  const remaining = Math.max(0, getRemaining(objective.timeAlive, timeForObjective(objective)));
  return isDisplayableInhibitorRemaining(remaining) ? remaining : 0;
}

function isDisplayableInhibitorRemaining(remaining: number): boolean {
  return remaining > 0 && remaining <= INHIBITOR_RESPAWN_SECONDS;
}

function timeForObjective(objective: iObjectiveRespawnData): number {
  const clockSource = (objective as InhibitorObjectiveData).clockSource;
  if (clockSource === "liveClient" && liveClientReferenceTime.value > 0) {
    return liveClientReferenceTime.value;
  }

  return currentGameTime.value;
}

function progressFor(objective: iObjectiveRespawnData, remaining: number): string {
  const duration =
    objective.timeAlive !== undefined
      ? Math.max(objective.timeAlive - objective.timeDestroy, 1)
      : INHIBITOR_RESPAWN_SECONDS;
  const progress = Math.max(0, Math.min(1, remaining / duration));

  return `${progress * 100}%`;
}

function formatTime(remaining: number): string {
  if (remaining <= 0) return "--";

  const totalSeconds = Math.ceil(remaining);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function isInhibitorObjective(objective: string): boolean {
  return objective.toLowerCase().includes("inhib");
}

function isKillEvent(eventType: unknown): boolean {
  const value = String(eventType).toLowerCase();
  return value === "kill" || value.includes("kill") || value === "1" || value === "13";
}

function isSpawnEvent(eventType: unknown): boolean {
  const value = String(eventType).toLowerCase();
  return value === "spawn" || value.includes("spawn") || value === "0" || value === "19";
}

function teamIndexFromTeam(value?: number): number | undefined {
  const teamIdIndex = gameTeams.value?.findIndex((team) => team.teamId === value) ?? -1;
  if (teamIdIndex === 0 || teamIdIndex === 1) return teamIdIndex;

  if (value === Team.Order || value === 100 || value === 0) return 0;
  if (value === Team.Chaos || value === 200) return 1;
  return undefined;
}

function teamIndexFromObjectiveName(objective: string): number | undefined {
  const value = objective.toLowerCase();
  if (value.includes("blue") || value.includes("order")) return 0;
  if (value.includes("red") || value.includes("chaos")) return 1;
  return undefined;
}

function affectedTeamIndexFor(event: ingameObjectiveEvent, type: "kill" | "spawn"): number | undefined {
  const objectiveTeamIndex = teamIndexFromObjectiveName(event.objective);
  if (objectiveTeamIndex !== undefined) return objectiveTeamIndex;

  const eventTeamIndex = teamIndexFromTeam(event.team);
  if (eventTeamIndex === undefined) return undefined;

  return type === "kill" ? 1 - eventTeamIndex : eventTeamIndex;
}

function firstAvailableFallbackLane(teamIndex: number): number {
  const team = fallbackInhibitors.value.find((entry) => teamIndexFor(entry, teamIndex) === teamIndex);
  if (!team) return 1;

  const occupied = new Set(
    Object.entries(team.inhibitors ?? {}).map(([key, objective]) => laneIndexForObjective(key, objective)),
  );

  return lanes.findIndex((_, index) => !occupied.has(index)) ?? 1;
}

function createFallbackTeam(teamIndex: number): teamInhibitorData {
  const scoreboardTeam = scoreboard.value?.teams[teamIndex];
  const side = teamIndex === 0 ? Team.Order : Team.Chaos;

  return {
    team: scoreboardTeam?.teamTag ?? (teamIndex === 0 ? "Blue" : "Red"),
    teamid: side,
    side,
    inhibitors: {},
  };
}

function fallbackTeamFor(teamIndex: number): teamInhibitorData {
  const existing = fallbackInhibitors.value.find((entry) => teamIndexFor(entry, teamIndex) === teamIndex);
  if (existing) return existing;

  const created = createFallbackTeam(teamIndex);
  fallbackInhibitors.value = [...fallbackInhibitors.value, created];
  return created;
}

function upsertFallbackInhibitor(
  teamIndex: number,
  laneIndex: number,
  eventTime = currentGameTime.value,
) {
  const safeLaneIndex = laneIndex >= 0 ? laneIndex : firstAvailableFallbackLane(teamIndex);
  const lane = lanes[safeLaneIndex] ?? lanes[1];
  const team = fallbackTeamFor(teamIndex);
  const timeDestroy = Math.max(0, eventTime);

  team.inhibitors = {
    ...(team.inhibitors ?? {}),
    [lane.key]: {
      type: lane.type,
      timeDestroy,
      timeAlive: timeDestroy + INHIBITOR_RESPAWN_SECONDS,
    },
  };

  fallbackInhibitors.value = [...fallbackInhibitors.value];
}

function removeFallbackInhibitor(teamIndex: number, laneIndex: number) {
  const next = fallbackInhibitors.value
    .map((team, index) => {
      if (teamIndexFor(team, index) !== teamIndex) return team;

      const inhibitorsByLane = { ...(team.inhibitors ?? {}) };
      for (const [key, objective] of Object.entries(inhibitorsByLane)) {
        if (laneIndex < 0 || laneIndexForObjective(key, objective) === laneIndex) {
          delete inhibitorsByLane[key];
        }
      }

      return { ...team, inhibitors: inhibitorsByLane };
    })
    .filter((team) => Object.keys(team.inhibitors ?? {}).length > 0);

  fallbackInhibitors.value = next;
}

function pruneExpiredFallbackInhibitors() {
  const next = fallbackInhibitors.value
    .map((team) => {
      const activeEntries = Object.fromEntries(
        Object.entries(team.inhibitors ?? {}).filter(([, objective]) => remainingFor(objective) > 0),
      );

      return { ...team, inhibitors: activeEntries };
    })
    .filter((team) => Object.keys(team.inhibitors ?? {}).length > 0);

  fallbackInhibitors.value = next;
}

function handleObjectiveEvent(event: ingameObjectiveEvent) {
  logDebug(`obj:${event.objective}/${event.eventType}/team:${event.team}`);
  if (!isInhibitorObjective(event.objective)) return;

  const laneIndex = laneIndexFromObjectiveName(event.objective);

  if (isKillEvent(event.eventType)) {
    const teamIndex = affectedTeamIndexFor(event, "kill");
    if (teamIndex === undefined) return;

    upsertFallbackInhibitor(teamIndex, laneIndex);
    return;
  }

  if (isSpawnEvent(event.eventType)) {
    const teamIndex = affectedTeamIndexFor(event, "spawn");
    if (teamIndex === undefined) return;

    removeFallbackInhibitor(teamIndex, laneIndex);
  }
}

function isAnnouncementType(type: unknown, expected: AnnouncementType, label: string): boolean {
  const value = String(type).toLowerCase();
  return value === String(expected) || value === label.toLowerCase();
}

function handleAnnouncementEvent(event: announcerEvent) {
  logDebug(`ann:${String(event.type)}/s:${event.source?.team ?? "-"} t:${event.target?.team ?? "-"}`);

  if (isAnnouncementType(event.type, AnnouncementType.InhibitorKill, "InhibitorKill")) {
    const sourceTeamIndex = teamIndexFromTeam(event.source?.team);
    const targetTeamIndex = teamIndexFromTeam(event.target?.team);
    const affectedTeamIndex = targetTeamIndex ?? (sourceTeamIndex === undefined ? undefined : 1 - sourceTeamIndex);
    if (affectedTeamIndex === undefined) return;

    upsertFallbackInhibitor(affectedTeamIndex, -1);
    return;
  }

  if (isAnnouncementType(event.type, AnnouncementType.InhibitorSpawn, "InhibitorSpawn")) {
    const affectedTeamIndex = teamIndexFromTeam(event.target?.team) ?? teamIndexFromTeam(event.source?.team);
    if (affectedTeamIndex === undefined) return;

    removeFallbackInhibitor(affectedTeamIndex, -1);
  }
}

function syncLiveClientPolling() {
  if (!isMounted) return;

  const settings = config.value.inhibitors;
  const pollingKey = `${settings.liveClientFallback}|${settings.liveClientUrl}|${settings.liveClientPollMs}`;

  if (!settings.liveClientFallback || !settings.liveClientUrl) {
    stopLiveClientPolling();
    liveClientStatus.value = "";
    return;
  }

  if (liveClientPollId !== undefined && liveClientPollingKey === pollingKey) return;

  stopLiveClientPolling();
  liveClientPollingKey = pollingKey;
  void pollLiveClientInhibitorEvents();
  liveClientPollId = window.setInterval(() => void pollLiveClientInhibitorEvents(), settings.liveClientPollMs);
}

function stopLiveClientPolling() {
  if (liveClientPollId !== undefined) {
    window.clearInterval(liveClientPollId);
    liveClientPollId = undefined;
  }

  liveClientAbortController?.abort();
  liveClientAbortController = undefined;
  liveClientPolling = false;
  liveClientPollingKey = "";
}

async function pollLiveClientInhibitorEvents() {
  if (liveClientPolling) return;

  const settings = config.value.inhibitors;
  if (!settings.liveClientFallback || !settings.liveClientUrl) return;

  liveClientPolling = true;
  const controller = new AbortController();
  liveClientAbortController = controller;

  try {
    const response = await fetch(settings.liveClientUrl, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      liveClientStatus.value = `lc:${response.status}`;
      return;
    }

    applyLiveClientPayload(await response.json());
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;

    liveClientStatus.value = "lc:err";
    logDebug("lc:err");
  } finally {
    if (liveClientAbortController === controller) {
      liveClientAbortController = undefined;
    }
    liveClientPolling = false;
  }
}

function applyLiveClientPayload(payload: unknown) {
  const payloadGameTime = liveClientGameTimeFromPayload(payload);
  if (payloadGameTime !== undefined) {
    liveClientGameTime.value = payloadGameTime;
  }

  const events = liveClientEventsFromPayload(payload);
  liveClientStatus.value = `lc:${events.length}`;
  const referenceTime = liveClientReferenceTime.value;
  const latestInhibitorEvents = latestLiveClientInhibitorEvents(events, referenceTime);
  liveClientInhibitors.value = buildLiveClientInhibitorData(latestInhibitorEvents, referenceTime);

  if (latestInhibitorEvents.length > 0) {
      logDebug(`lc-active:${liveClientInhibitors.value.length}/${latestInhibitorEvents.length}@${Math.floor(referenceTime)}`);
  }

  pruneExpiredFallbackInhibitors();
}

function latestLiveClientInhibitorEvents(
  events: LiveClientEvent[],
  referenceTime: number,
): ParsedLiveClientInhibitorEvent[] {
  const latestEvents = new Map<string, ParsedLiveClientInhibitorEvent>();

  for (const event of events) {
    const parsedEvent = parseLiveClientInhibitorEvent(event);
    if (!parsedEvent) continue;
    if (referenceTime > 0 && parsedEvent.eventTime > referenceTime) continue;

    const currentEvent = latestEvents.get(parsedEvent.inhibitorName);
    if (!currentEvent || parsedEvent.eventTime >= currentEvent.eventTime) {
      latestEvents.set(parsedEvent.inhibitorName, parsedEvent);
    }
  }

  return Array.from(latestEvents.values());
}

function buildLiveClientInhibitorData(
  events: ParsedLiveClientInhibitorEvent[],
  referenceTime: number,
): teamInhibitorData[] {
  const teams = new Map<number, teamInhibitorData>();
  const now = referenceTime || liveClientReferenceTime.value;

  for (const event of events) {
    const remaining = event.eventTime + INHIBITOR_RESPAWN_SECONDS - now;

    if (event.type !== "kill" || !isDisplayableInhibitorRemaining(remaining)) {
      continue;
    }

    const safeLaneIndex = event.laneIndex >= 0 ? event.laneIndex : firstAvailableLiveClientLane(teams, event.teamIndex);
    const lane = lanes[safeLaneIndex] ?? lanes[1];
    const team = liveClientTeamFor(teams, event.teamIndex);

    team.inhibitors = {
      ...(team.inhibitors ?? {}),
      [lane.key]: {
        type: lane.type,
        timeDestroy: event.eventTime,
        timeAlive: event.eventTime + INHIBITOR_RESPAWN_SECONDS,
        clockSource: "liveClient",
      } as InhibitorObjectiveData,
    };
  }

  return Array.from(teams.values()).filter((team) => Object.keys(team.inhibitors ?? {}).length > 0);
}

function liveClientTeamFor(teams: Map<number, teamInhibitorData>, teamIndex: number): teamInhibitorData {
  const existing = teams.get(teamIndex);
  if (existing) return existing;

  const created = createFallbackTeam(teamIndex);
  teams.set(teamIndex, created);
  return created;
}

function firstAvailableLiveClientLane(teams: Map<number, teamInhibitorData>, teamIndex: number): number {
  const team = teams.get(teamIndex);
  if (!team) return 1;

  const occupied = new Set(
    Object.entries(team.inhibitors ?? {}).map(([key, objective]) => laneIndexForObjective(key, objective)),
  );

  return lanes.findIndex((_, index) => !occupied.has(index)) ?? 1;
}

function liveClientGameTimeFromPayload(payload: unknown): number | undefined {
  if (!isRecord(payload) || !isRecord(payload.gameData)) return undefined;

  return finiteNumber(payload.gameData.gameTime);
}

function liveClientEventsFromPayload(payload: unknown): LiveClientEvent[] {
  if (!isRecord(payload)) return [];

  const directEvents = eventListFromValue(payload.Events);
  if (directEvents) return directEvents;

  const directLowercaseEvents = eventListFromValue(payload.events);
  if (directLowercaseEvents) return directLowercaseEvents;

  if (isRecord(payload.events)) {
    return eventListFromValue(payload.events.Events) ?? [];
  }

  return [];
}

function eventListFromValue(value: unknown): LiveClientEvent[] | undefined {
  if (!Array.isArray(value)) return undefined;

  return value.filter(isRecord);
}

function parseLiveClientInhibitorEvent(event: LiveClientEvent): ParsedLiveClientInhibitorEvent | undefined {
  const eventName = String(event.EventName ?? "").toLowerCase();
  if (!eventName.includes("inhib")) return undefined;

  const isKill = eventName.includes("kill");
  const isSpawn = eventName.includes("spawn") || eventName.includes("respawn");
  if (!isKill && !isSpawn) return undefined;

  const inhibitorName = liveClientInhibitorName(event);
  if (!inhibitorName) return undefined;

  const teamIndex = teamIndexFromLiveClientInhibitor(inhibitorName);
  const eventTime = finiteNumber(event.EventTime);
  if (teamIndex === undefined || eventTime === undefined) return undefined;

  return {
    type: isKill ? "kill" : "spawn",
    teamIndex,
    laneIndex: laneIndexFromLiveClientInhibitor(inhibitorName),
    eventTime,
    inhibitorName,
  };
}

function liveClientInhibitorName(event: LiveClientEvent): string | undefined {
  const preferredKeys = [
    "InhibKilled",
    "InhibRespawned",
    "InhibRespawn",
    "Inhibitor",
    "InhibitorName",
  ];

  for (const key of preferredKeys) {
    const value = event[key];
    if (typeof value === "string" && value.trim()) return value;
  }

  const fallback = Object.entries(event).find(
    ([key, value]) => key.toLowerCase().includes("inhib") && typeof value === "string" && value.trim(),
  );

  return fallback?.[1] as string | undefined;
}

function teamIndexFromLiveClientInhibitor(inhibitorName: string): number | undefined {
  const value = inhibitorName.toLowerCase();

  if (value.includes("order") || value.includes("blue") || /(?:^|[_-])t1(?:[_-]|$)/i.test(inhibitorName)) {
    return 0;
  }

  if (value.includes("chaos") || value.includes("red") || /(?:^|[_-])t2(?:[_-]|$)/i.test(inhibitorName)) {
    return 1;
  }

  return undefined;
}

function laneIndexFromLiveClientInhibitor(inhibitorName: string): number {
  const numericLane = inhibitorName.match(/(?:^|[_-])l([0-2])(?:[_-]|$)/i);
  if (numericLane?.[1] !== undefined) {
    const laneByRiotId = [2, 1, 0];
    return laneByRiotId[Number(numericLane[1])] ?? -1;
  }

  const namedLane = inhibitorName.match(/(?:^|[_-])(top|mid|middle|bot|bottom)(?:[_-]|$)/i)?.[1]?.toLowerCase();
  if (namedLane === "top") return 0;
  if (namedLane === "mid" || namedLane === "middle") return 1;
  if (namedLane === "bot" || namedLane === "bottom") return 2;

  const legacyLane = inhibitorName.match(/(?:^|[_-])([lcr])\d*(?:[_-]|$)/i)?.[1]?.toLowerCase();
  if (legacyLane === "l") return 0;
  if (legacyLane === "c") return 1;
  if (legacyLane === "r") return 2;

  return -1;
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function cloneTeamData(teamData: teamInhibitorData): teamInhibitorData {
  return {
    ...teamData,
    inhibitors: { ...(teamData.inhibitors ?? {}) },
  };
}

function mergeInhibitorData(
  realData: teamInhibitorData[],
  fallbackData: teamInhibitorData[],
): teamInhibitorData[] {
  const merged = new Map<number, teamInhibitorData>();

  for (const [index, team] of fallbackData.entries()) {
    const teamIndex = teamIndexFor(team, index);
    merged.set(teamIndex, cloneTeamData(team));
  }

  for (const [index, team] of realData.entries()) {
    const teamIndex = teamIndexFor(team, index);
    const existing = merged.get(teamIndex);
    merged.set(teamIndex, {
      ...cloneTeamData(team),
      inhibitors: {
        ...(existing?.inhibitors ?? {}),
        ...(team.inhibitors ?? {}),
      },
    });
  }

  return Array.from(merged.values());
}

function buildSlots(teamData: teamInhibitorData): InhibitorSlot[] {
  const slots = lanes.map((lane) => ({
    lane,
    active: false,
    formattedTime: "--",
    progressPct: "0%",
  }));

  for (const [key, objective] of Object.entries(teamData.inhibitors ?? {})) {
    const laneIndex = laneIndexForObjective(key, objective);
    const remaining = remainingFor(objective);

    slots[laneIndex] = {
      lane: lanes[laneIndex] ?? lanes[0],
      active: remaining > 0,
      formattedTime: formatTime(remaining),
      progressPct: progressFor(objective, remaining),
    };
  }

  return slots;
}

function scoreboardTeams(): ingameScoreboardTeamData[] {
  const currentTeams = scoreboard.value?.teams;
  if (currentTeams && currentTeams.length >= 2) return currentTeams;

  return lastKnownScoreboardTeams.value;
}

function scoreboardTeamFor(teamData: teamInhibitorData, fallbackIndex: number) {
  const teams = scoreboardTeams();
  const entryName = normalizeKey(teamData.team);
  const byName = teams.find((team) =>
    [team.teamName, team.teamTag].some((value) => normalizeKey(value) === entryName),
  );

  if (byName) return byName;

  const side = Number(teamData.side);
  if (side === Team.Order || side === 0 || side === 100) return teams[0];
  if (side === Team.Chaos || side === 200) return teams[1];

  const teamIdIndex = teamIndexFromTeam(teamData.teamid);
  if (teamIdIndex !== undefined) return teams[teamIdIndex];

  return teams[fallbackIndex];
}

function teamIndexFor(teamData: teamInhibitorData, fallbackIndex: number) {
  const teams = scoreboardTeams();
  const scoreboardTeam = scoreboardTeamFor(teamData, fallbackIndex);
  const scoreboardIndex = teams.findIndex((team) => team === scoreboardTeam);
  if (scoreboardIndex === 0 || scoreboardIndex === 1) return scoreboardIndex;

  const side = Number(teamData.side);
  if (side === Team.Order || side === 0 || side === 100) return 0;
  if (side === Team.Chaos || side === 200) return 1;

  const teamIdIndex = teamIndexFromTeam(teamData.teamid);
  if (teamIdIndex !== undefined) return teamIdIndex;

  return Math.max(0, Math.min(1, fallbackIndex));
}

function buildTeamView(teamData: teamInhibitorData, index: number): InhibitorTeamView {
  const teamIndex = teamIndexFor(teamData, index);
  const scoreboardTeam = scoreboardTeamFor(teamData, teamIndex) as ingameScoreboardTeamData | undefined;
  const slots = buildSlots(teamData);

  return {
    key: `${teamData.side}-${teamData.teamid}-${teamData.team || index}`,
    index: teamIndex,
    teamName: scoreboardTeam?.teamName || teamData.team || "Equipo",
    teamTag: scoreboardTeam?.teamTag || teamData.team || "TEAM",
    iconUrl: scoreboardTeam?.teamIconUrl,
    color: teamIndex === 0 ? "var(--blue-team-color)" : "var(--red-team-color)",
    missingCount: slots.filter((slot) => slot.active).length,
    slots,
  };
}
</script>

<template>
  <FadeTransition>
    <div
      v-if="shouldShow || config.inhibitors.debug"
      class="inhibitor-timers"
      :class="[
        `inhibitor-timers--${timerStyle}`,
        { 'inhibitor-timers--dual': isDualTeamMode },
      ]"
    >
      <div v-if="config.inhibitors.debug" class="inhibitor-debug">
        {{ debugText }}
      </div>

      <div v-if="!isDualTeamMode" class="inhibitor-panel inhibitor-panel--single">
        <div
          v-for="team in visibleTeams"
          :key="team.key"
          class="single-team"
          :style="{ '--team-color': team.color }"
        >
          <div class="team-brand">
            <img
              v-if="team.iconUrl"
              :src="client.getCacheUrl(team.iconUrl)"
              class="team-logo"
              :alt="team.teamName"
              @error="handleImageError"
              @load="handleImageLoad"
            />
            <span v-else class="team-tag">{{ team.teamTag }}</span>
            <span class="team-label">{{ inhibitorTitle }}</span>
          </div>

          <div class="timer-list">
            <div
              v-for="slot in team.slots"
              :key="slot.lane.key"
              class="timer-row"
              :class="[
                `timer-row--${timerStyle}`,
                { 'timer-row--active': slot.active },
              ]"
            >
              <component :is="slot.lane.icon" class="lane-icon" />
              <span class="lane-label">{{ laneLabel(slot.lane.key) }}</span>
              <div v-if="timerStyle === 'bar'" class="timer-track">
                <span class="timer-fill" :style="{ width: slot.progressPct }"></span>
              </div>
              <span class="timer-text">{{ slot.formattedTime }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="inhibitor-panel inhibitor-panel--dual">
        <div
          v-for="team in visibleTeams"
          :key="team.key"
          class="dual-team"
          :style="{ '--team-color': team.color }"
        >
          <div class="timer-list">
            <div
              v-for="slot in team.slots"
              :key="slot.lane.key"
              class="timer-row"
              :class="[
                `timer-row--${timerStyle}`,
                { 'timer-row--active': slot.active },
              ]"
            >
              <component :is="slot.lane.icon" class="lane-icon" />
              <div v-if="timerStyle === 'bar'" class="timer-track">
                <span class="timer-fill" :style="{ width: slot.progressPct }"></span>
              </div>
              <span class="timer-text">{{ slot.formattedTime }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </FadeTransition>
</template>

<style scoped>
.inhibitor-timers {
  width: 100%;
  height: 100%;
  font-family: "Bebas Neue", sans-serif;
  color: #ffffff;
  user-select: none;
  position: relative;
  overflow: hidden;
  background: #05070b;
  clip-path: polygon(
    3% 0,
    90% 0,
    95% 12%,
    95% 37%,
    92% 37%,
    92% 57%,
    95% 57%,
    95% 100%,
    3% 100%
  );
}

.inhibitor-debug {
  position: absolute;
  left: 8px;
  right: 16px;
  top: 4px;
  z-index: 3;
  overflow: hidden;
  color: #ffd166;
  font-family: Consolas, monospace;
  font-size: 9px;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}

.inhibitor-panel {
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.06), transparent 42%),
    #05070b;
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.45);
}

.single-team {
  height: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  gap: 7px;
  align-items: center;
  padding: 7px 17px 7px 10px;
  border-left: 3px solid var(--team-color);
}

.team-brand {
  height: 100%;
  min-width: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) 16px;
  justify-items: center;
  align-items: center;
  padding-right: 7px;
  border-right: 1px solid rgba(255, 255, 255, 0.18);
}

.team-logo {
  width: 58px;
  max-height: 46px;
  object-fit: contain;
}

.team-tag {
  min-width: 0;
  max-width: 58px;
  overflow: hidden;
  color: var(--team-color);
  font-size: 26px;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.team-label {
  color: rgba(255, 255, 255, 0.74);
  font-size: 15px;
  line-height: 1;
}

.timer-list {
  min-width: 0;
  display: grid;
  grid-template-rows: repeat(3, 1fr);
  gap: 4px;
}

.timer-row {
  min-width: 0;
  min-height: 0;
  display: grid;
  align-items: center;
  gap: 5px;
  padding: 2px 5px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.48);
}

.timer-row--active {
  color: #ffffff;
  border-color: color-mix(in srgb, var(--team-color) 58%, rgba(255, 255, 255, 0.18));
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--team-color) 16%, transparent), transparent 72%),
    rgba(255, 255, 255, 0.07);
}

.timer-row--bar {
  grid-template-columns: 18px 25px minmax(0, 1fr) 39px;
}

.timer-row--text {
  grid-template-columns: 18px 28px minmax(0, 1fr);
}

.lane-icon {
  width: 16px;
  height: 16px;
  color: currentColor;
}

.lane-label {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timer-track {
  height: 5px;
  min-width: 0;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.14);
}

.timer-fill {
  display: block;
  height: 100%;
  background: var(--team-color);
  box-shadow: 0 0 8px color-mix(in srgb, var(--team-color) 55%, transparent);
  transition: width 0.35s linear;
}

.timer-text {
  min-width: 0;
  justify-self: end;
  font-size: 18px;
  line-height: 1;
  white-space: nowrap;
}

.timer-row--text .timer-text {
  grid-column: 3;
  font-size: 21px;
}

.inhibitor-panel--dual {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding: 7px 17px 7px 10px;
}

.dual-team {
  min-width: 0;
  display: grid;
  align-content: center;
  padding-left: 5px;
  border-left: 3px solid var(--team-color);
}

.dual-team .timer-row {
  padding-left: 4px;
  padding-right: 4px;
}

.dual-team .timer-row--bar {
  grid-template-columns: 17px minmax(0, 1fr) 35px;
}

.dual-team .timer-row--text {
  grid-template-columns: 17px minmax(0, 1fr);
}

.dual-team .timer-row--text .timer-text,
.dual-team .timer-text {
  grid-column: auto;
}

.dual-team .timer-text {
  font-size: 16px;
}

.dual-team .lane-icon {
  width: 15px;
  height: 15px;
}
</style>
