<script setup lang="ts">
import { useClient } from "@/client";
import { useIngameSelector } from "@/composables/useIngame";
import { handleImageError, handleImageLoad } from "@/utils/imageUtils";
import SlideTransition from "@/transitions/SlideTransition.vue";
import { orderScoreboardPlayersByBlueBottle } from "@/utils/blueBottleOrdering";
import { getLFrameBranding } from "@/utils/lFrameBranding";
import { useOverlayConfig } from "@/composables/useOverlayConfig";
import {
  Team,
  MAGIC_COLOR,
  PHYS_COLOR,
  TRUE_COLOR,
  damageBarSegments,
  type DamageBarSegment,
  type damageGraphEntry,
  type ingameScoreboardBottomPlayerData,
} from "@bluebottle_gg/league-broadcast-client";
import { computed, onMounted, ref } from "vue";

const client = useClient();
const scoreboardBottom = useIngameSelector((s) => s.gameData.scoreboardBottom);
const gameTeams = useIngameSelector((s) => s.gameData.teams);
const damageGraph = useIngameSelector((s) => s.gameData.damageGraph);
const competitionLogoUri = ref<string | null>(null);
const { config: overlayConfig } = useOverlayConfig();

type DamageSlot = damageGraphEntry | undefined;

const ROLE_ORDER = new Map([
  ["top", 0],
  ["toplane", 0],
  ["jungle", 1],
  ["jgl", 1],
  ["middle", 2],
  ["mid", 2],
  ["bottom", 3],
  ["bot", 3],
  ["adc", 3],
  ["carry", 3],
  ["utility", 4],
  ["support", 4],
  ["sup", 4],
]);

const entries = computed(() => damageGraph.value?.damageDealt ?? []);
const hasTeamData = computed(() =>
  entries.value.some((entry) => entry.team === Team.Order || entry.team === Team.Chaos),
);

const maxDamage = computed(() =>
  Math.max(...entries.value.map((entry) => entry.totalDamageDealt || 0), 1),
);

const hasDamageGraph = computed(() => entries.value.length > 0);

const orderEntries = computed(() => getTeamEntries(Team.Order));
const chaosEntries = computed(() => getTeamEntries(Team.Chaos));
const orderSlots = computed(() => toSlots(orderEntries.value));
const chaosSlots = computed(() => toSlots(chaosEntries.value));
const damageTitle = computed(() => overlayConfig.value.text.damageGraph.title);
const damageLegendAriaLabel = computed(() => overlayConfig.value.text.damageGraph.legendAriaLabel);
const damageLegendItems = computed(() => [
  { label: overlayConfig.value.text.damageGraph.legendPhysical, color: PHYS_COLOR },
  { label: overlayConfig.value.text.damageGraph.legendMagic, color: MAGIC_COLOR },
  { label: overlayConfig.value.text.damageGraph.legendTrue, color: TRUE_COLOR },
]);

onMounted(async () => {
  try {
    const branding = await getLFrameBranding(client);
    competitionLogoUri.value = branding.tournamentIconUri ?? branding.lFrameIconUris[0] ?? null;
  } catch {
    competitionLogoUri.value = null;
  }
});

function normalizePlayerKey(value?: string): string {
  return value?.trim().toLowerCase() ?? "";
}

function roleWeight(entry: damageGraphEntry) {
  const role = entry.role?.trim().toLowerCase() ?? "";
  return ROLE_ORDER.get(role) ?? 99;
}

function isSameChampion(
  player: ingameScoreboardBottomPlayerData,
  entry: damageGraphEntry,
): boolean {
  return Boolean(
    player.champion?.alias &&
      entry.champion?.alias &&
      normalizePlayerKey(player.champion.alias) === normalizePlayerKey(entry.champion.alias),
  );
}

function matchesScoreboardPlayer(
  player: ingameScoreboardBottomPlayerData,
  entry: damageGraphEntry,
): boolean {
  const scoreboardName = normalizePlayerKey(player.name);
  const scoreboardDisplayName = normalizePlayerKey(player.displayName);
  const damageName = normalizePlayerKey(entry.name);
  const damageDisplayName = normalizePlayerKey(entry.displayName);

  return Boolean(
    (scoreboardName && (scoreboardName === damageName || scoreboardName === damageDisplayName)) ||
      (scoreboardDisplayName &&
        (scoreboardDisplayName === damageName || scoreboardDisplayName === damageDisplayName)) ||
      isSameChampion(player, entry),
  );
}

function getTeamEntries(team: Team) {
  const indexedEntries = entries.value.map((entry, index) => ({ entry, index }));

  const filtered = hasTeamData.value
    ? indexedEntries.filter(({ entry }) => entry.team === team)
    : team === Team.Order
      ? indexedEntries.slice(0, 5)
      : indexedEntries.slice(5, 10);

  const sortedFallback = filtered
    .sort((a, b) => roleWeight(a.entry) - roleWeight(b.entry) || a.index - b.index)
    .map(({ entry }) => entry);

  const scoreboardPlayers = orderScoreboardPlayersByBlueBottle(
    scoreboardBottom.value?.teams[team - 1]?.players,
    gameTeams.value?.[team - 1],
  );
  if (!scoreboardPlayers?.length) return sortedFallback.slice(0, 5);

  const used = new Set<damageGraphEntry>();
  const orderedEntries: damageGraphEntry[] = [];

  for (const player of scoreboardPlayers.slice(0, 5)) {
    const matched = sortedFallback.find((entry) => !used.has(entry) && matchesScoreboardPlayer(player, entry));
    if (!matched) continue;

    used.add(matched);
    orderedEntries.push(matched);
  }

  const remaining = sortedFallback.filter((entry) => !used.has(entry));
  return [...orderedEntries, ...remaining].slice(0, 5);
}

function toSlots(teamEntries: damageGraphEntry[]): DamageSlot[] {
  return Array.from({ length: 5 }, (_, index) => teamEntries[index]);
}

function formatDamage(value: number | undefined) {
  const damage = Math.max(value ?? 0, 0);
  if (damage >= 1000) {
    return `${(damage / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  }

  return `${Math.round(damage)}`;
}

function damageWidth(entry: damageGraphEntry) {
  if (entry.totalDamageDealt <= 0) return "0%";

  return `${Math.max(2, Math.min(100, (entry.totalDamageDealt / maxDamage.value) * 100))}%`;
}

function segmentsFor(entry: damageGraphEntry): DamageBarSegment[] {
  const segments = damageBarSegments(entry.damageByType ?? {}, entry.totalDamageDealt);
  if (segments.length > 0) return segments;

  return [{ color: "rgba(255,255,255,0.72)", pct: 100 }];
}

function championImage(entry: damageGraphEntry) {
  return entry.champion?.squareImg ? client.getCacheUrl(entry.champion.squareImg) : undefined;
}
</script>

<template>
  <SlideTransition>
    <div v-if="hasDamageGraph" class="damage-graph-container">
      <div class="title-container">
        <div class="-translate-y-10 flex flex-row justify-between w-full items-center">
          <span class="title-text">{{ damageTitle }}</span>
          <span class="title-arrow ml-auto">&#8250;</span>
        </div>
      </div>

      <div class="tournament-info-container" :class="{ 'has-logo': competitionLogoUri }">
        <img
          v-if="competitionLogoUri"
          :src="client.getCacheUrl(competitionLogoUri, true)"
          class="competition-logo"
          alt="Competition logo"
          @error="handleImageError"
          @load="handleImageLoad"
        />

        <div class="damage-legend" :aria-label="damageLegendAriaLabel">
          <div v-for="item in damageLegendItems" :key="item.label" class="damage-legend-row">
            <span class="damage-legend-swatch" :style="{ backgroundColor: item.color }"></span>
            <span class="damage-legend-label">{{ item.label }}</span>
          </div>
        </div>
      </div>

      <div class="graph-container">
        <section class="damage-graph">
          <div class="damage-body">
            <div class="damage-team damage-team-order">
              <div
                v-for="(entry, index) in orderSlots"
                :key="entry?.name ?? `order-empty-${index}`"
                class="damage-row"
                :class="{ 'is-empty': !entry }"
              >
                <template v-if="entry">
                  <img
                    v-if="championImage(entry)"
                    :src="championImage(entry)"
                    class="champion-icon"
                    :alt="entry.displayName"
                    @error="handleImageError"
                    @load="handleImageLoad"
                  />
                  <div v-else class="champion-icon champion-placeholder"></div>

                  <div class="damage-details">
                    <div class="damage-meta">
                      <span class="player-name">{{ entry.displayName || entry.name }}</span>
                      <span class="damage-value">{{ formatDamage(entry.totalDamageDealt) }}</span>
                    </div>
                    <div class="damage-track">
                      <div class="damage-fill" :style="{ width: damageWidth(entry) }">
                        <span
                          v-for="(segment, segmentIndex) in segmentsFor(entry)"
                          :key="segmentIndex"
                          class="damage-segment"
                          :style="{
                            width: `${segment.pct}%`,
                            backgroundColor: segment.color,
                          }"
                        ></span>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <div class="damage-center" aria-hidden="true">
              <span class="center-mark"></span>
            </div>

            <div class="damage-team damage-team-chaos">
              <div
                v-for="(entry, index) in chaosSlots"
                :key="entry?.name ?? `chaos-empty-${index}`"
                class="damage-row mirror"
                :class="{ 'is-empty': !entry }"
              >
                <template v-if="entry">
                  <div class="damage-details">
                    <div class="damage-meta">
                      <span class="damage-value">{{ formatDamage(entry.totalDamageDealt) }}</span>
                      <span class="player-name">{{ entry.displayName || entry.name }}</span>
                    </div>
                    <div class="damage-track">
                      <div class="damage-fill" :style="{ width: damageWidth(entry) }">
                        <span
                          v-for="(segment, segmentIndex) in segmentsFor(entry)"
                          :key="segmentIndex"
                          class="damage-segment"
                          :style="{
                            width: `${segment.pct}%`,
                            backgroundColor: segment.color,
                          }"
                        ></span>
                      </div>
                    </div>
                  </div>

                  <img
                    v-if="championImage(entry)"
                    :src="championImage(entry)"
                    class="champion-icon"
                    :alt="entry.displayName"
                    @error="handleImageError"
                    @load="handleImageLoad"
                  />
                  <div v-else class="champion-icon champion-placeholder"></div>
                </template>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </SlideTransition>
</template>

<style scoped>
.damage-graph-container {
  display: grid;
  grid-template-columns: 285px 176px 1fr;
  height: 100%;
  position: relative;
  z-index: 99;
  box-sizing: border-box;
}

.title-container {
  background-color: #1a1d24;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 24px;
  padding-right: 24px;
  position: relative;
}

.title-text {
  color: #ffffff;
  font-size: 24px;
  font-weight: 700;
  font-family: "Bebas Neue", sans-serif;
}

.title-arrow {
  color: #ffffff;
  font-size: 48px;
  font-family: "Bebas Neue", sans-serif;
}

.tournament-info-container {
  background-color: black;
  height: 260px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 18px 14px;
}

.tournament-info-container.has-logo {
  justify-content: flex-start;
  gap: 18px;
  padding-top: 24px;
}

.competition-logo {
  width: 100%;
  max-width: 118px;
  max-height: 88px;
  object-fit: contain;
}

.damage-legend {
  width: 128px;
  display: grid;
  gap: 8px;
}

.damage-legend-row {
  min-width: 0;
  height: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.damage-legend-swatch {
  width: 24px;
  height: 9px;
  flex: 0 0 24px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.08);
}

.damage-legend-label {
  min-width: 0;
  color: rgba(255, 255, 255, 0.88);
  font-family: "Bebas Neue", sans-serif;
  font-size: 15px;
  line-height: 1;
  white-space: nowrap;
}

.graph-container {
  height: 260px;
  min-height: 0;
  z-index: 3;
  overflow: hidden;
  border: 10px solid rgba(0, 0, 0, 1);
  box-sizing: border-box;
}

.damage-graph {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background:
    linear-gradient(90deg, rgba(64, 120, 220, 0.08), transparent 34%, transparent 66%, rgba(210, 58, 65, 0.08)),
    #12151a;
  font-family: "Bebas Neue", sans-serif;
  color: white;
  user-select: none;
}

.damage-body {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 72px minmax(0, 1fr);
}

.damage-team {
  min-width: 0;
  display: grid;
  grid-template-rows: repeat(5, minmax(0, 1fr));
  gap: 3px;
  padding: 10px 12px;
}

.damage-row {
  min-height: 0;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}

.damage-row.mirror {
  grid-template-columns: minmax(0, 1fr) 36px;
}

.damage-row.is-empty {
  opacity: 0;
}

.champion-icon {
  width: 36px;
  height: 36px;
  object-fit: cover;
  background: rgba(0, 0, 0, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.38);
}

.damage-team-order .champion-icon {
  border-left: 2px solid var(--blue-team-color);
}

.damage-team-chaos .champion-icon {
  border-right: 2px solid var(--red-team-color);
}

.champion-placeholder {
  background: rgba(255, 255, 255, 0.08);
}

.damage-details {
  min-width: 0;
  display: grid;
  grid-template-rows: 17px 16px;
  gap: 3px;
}

.damage-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  color: rgba(255, 255, 255, 0.92);
  font-size: 16px;
  line-height: 1;
}

.mirror .damage-meta {
  text-align: right;
}

.player-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.damage-value {
  flex: 0 0 auto;
  color: #ffffff;
  font-size: 19px;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
}

.damage-track {
  position: relative;
  height: 16px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.09);
  border: 1px solid rgba(255, 255, 255, 0.16);
}

.damage-fill {
  height: 100%;
  min-width: 2px;
  display: flex;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.12);
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.1);
  transition: width 0.35s ease;
}

.mirror .damage-fill {
  margin-left: auto;
  flex-direction: row-reverse;
}

.damage-segment {
  height: 100%;
  min-width: 1px;
  opacity: 0.88;
}

.damage-center {
  position: relative;
  display: flex;
  align-items: stretch;
  justify-content: center;
  border-left: 1px solid rgba(255, 255, 255, 0.18);
  border-right: 1px solid rgba(255, 255, 255, 0.18);
  background:
    linear-gradient(to right, rgba(72, 132, 238, 0.2), transparent 42%, transparent 58%, rgba(232, 64, 87, 0.2)),
    rgba(0, 0, 0, 0.2);
}

.center-mark {
  width: 1px;
  height: 100%;
  background: linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.58), transparent);
}

</style>
