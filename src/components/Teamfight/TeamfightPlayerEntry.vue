<script setup lang="ts">
import { useClient } from "@/client";
import ProgressBar from "@/components/PlayerScoreboard/ProgressBar.vue";
import {
    ResourceType,
    SpellSlotIndex,
    Team,
    getRemaining,
    type damageGraphEntry,
    type ingameScoreboardBottomPlayerData,
    type itemWithAsset,
} from "@bluebottle_gg/league-broadcast-client";
import SpellWithCooldown from "../PlayerScoreboard/SpellWithCooldown.vue";
import { computed } from "vue";
import { useIngameSelector } from "@/composables/useIngame";
import ItemWithCooldown from "../PlayerScoreboard/ItemWithCooldown.vue";
import FadeTransition from "@/transitions/FadeTransition.vue";
import type { LiveClientItem, LiveClientPlayer } from "./liveClientTypes";
import { useOverlayConfig } from "@/composables/useOverlayConfig";

const props = withDefaults(defineProps<{
    mirror?: boolean;
    data?: damageGraphEntry;
    liveClientPlayers?: LiveClientPlayer[];
    liveClientPlayerFallback?: LiveClientPlayer;
    scoreboardPlayerFallback?: ingameScoreboardBottomPlayerData;
}>(), {
    mirror: false,
    data: undefined,
    liveClientPlayers: () => [],
    liveClientPlayerFallback: undefined,
    scoreboardPlayerFallback: undefined,
});

const client = useClient();
const gameTime = useIngameSelector((s) => s.gameData.gameTime);
const gameVersion = useIngameSelector((s) => s.gameData.gameVersion);
const scoreboardBottom = useIngameSelector((s) => s.gameData.scoreboardBottom);
const { config: overlayConfig } = useOverlayConfig();

const TEAMFIGHT_ROLE_INDEX = new Map([
    ["top", 0],
    ["toplane", 0],
    ["jungle", 1],
    ["jgl", 1],
    ["middle", 2],
    ["mid", 2],
    ["midlane", 2],
    ["bottom", 3],
    ["bot", 3],
    ["botlane", 3],
    ["adc", 3],
    ["carry", 3],
    ["utility", 4],
    ["support", 4],
    ["sup", 4],
]);

const teamfightImportantItemIds = computed(() => new Set(overlayConfig.value.teamfight.importantItemIds));
const teamfightExcludedItemIds = computed(() => new Set(overlayConfig.value.teamfight.excludedItemIds));
const teamfightItemPriority = computed(
    () => new Map(Object.entries(overlayConfig.value.teamfight.itemPriority).map(([id, priority]) => [Number(id), priority])),
);
const teamfightImportantItemNamePattern = computed(() =>
    getSafeRegExp(overlayConfig.value.teamfight.importantItemNamePattern, "i"),
);

const respawnRemaining = computed(() => getRemaining(props.data?.respawnAt, gameTime.value));

const scoreboardPlayer = computed(() => {
    if (!props.data) return undefined;

    const preferredPlayers = getScoreboardPlayersForEntry(props.data);
    const preferredMatch = preferredPlayers.find((player) => matchesScoreboardPlayer(player, props.data!));
    if (preferredMatch) return preferredMatch;

    const roleMatch = getScoreboardPlayerByRole(preferredPlayers, props.data);
    if (roleMatch) return roleMatch;

    if (props.scoreboardPlayerFallback) return props.scoreboardPlayerFallback;

    for (const team of scoreboardBottom.value?.teams ?? []) {
        const fallbackMatch = team.players?.find((player) => matchesScoreboardPlayer(player, props.data!));
        if (fallbackMatch) return fallbackMatch;
    }

    return undefined;
});

const liveClientPlayer = computed(() => {
    if (!props.data) return undefined;

    const preferredPlayers = getLiveClientPlayersForEntry(props.data);
    const preferredMatch = preferredPlayers.find((player) => matchesLiveClientPlayer(player, props.data!));
    if (preferredMatch) return preferredMatch;

    const roleMatch = getLiveClientPlayerByRole(preferredPlayers, props.data);
    if (roleMatch) return roleMatch;

    return props.liveClientPlayers.find((player) => matchesLiveClientPlayer(player, props.data!)) ??
        props.liveClientPlayerFallback;
});

const teamfightItems = computed(() => {
    return mergeTeamfightItems(
        [
            ...getImportantInventoryItems(scoreboardPlayer.value),
            ...getImportantLiveClientItems(liveClientPlayer.value, scoreboardPlayer.value),
        ],
        props.data?.activeItems ?? [],
    );
});

function getScoreboardPlayersForEntry(entry: damageGraphEntry): ingameScoreboardBottomPlayerData[] {
    if (entry.team !== Team.Order && entry.team !== Team.Chaos) return [];
    return scoreboardBottom.value?.teams[entry.team - 1]?.players ?? [];
}

function getScoreboardPlayerByRole(
    players: ingameScoreboardBottomPlayerData[],
    entry: damageGraphEntry,
) {
    const roleIndex = getRoleIndex(entry.role);
    if (roleIndex === undefined) return undefined;
    return players[roleIndex];
}

function getLiveClientPlayersForEntry(entry: damageGraphEntry): LiveClientPlayer[] {
    const expectedTeam = liveClientTeamForEntry(entry);
    if (!expectedTeam) return props.liveClientPlayers;

    return props.liveClientPlayers.filter((player) => normalizePlayerKey(player.team) === expectedTeam);
}

function getLiveClientPlayerByRole(players: LiveClientPlayer[], entry: damageGraphEntry) {
    const roleIndex = getRoleIndex(entry.role);
    if (roleIndex === undefined) return undefined;

    return players.find((player) => getRoleIndex(player.position) === roleIndex);
}

function liveClientTeamForEntry(entry: damageGraphEntry): string | undefined {
    if (entry.team === Team.Order) return "order";
    if (entry.team === Team.Chaos) return "chaos";
    return undefined;
}

function getRoleIndex(role?: string) {
    return TEAMFIGHT_ROLE_INDEX.get(normalizePlayerKey(role));
}

function normalizePlayerKey(value?: string): string {
    return value?.split("#")[0]?.trim().toLowerCase() ?? "";
}

function isSameChampion(player: ingameScoreboardBottomPlayerData, entry: damageGraphEntry): boolean {
    return Boolean(
        player.champion?.alias &&
        entry.champion?.alias &&
        normalizePlayerKey(player.champion.alias) === normalizePlayerKey(entry.champion.alias),
    );
}

function isSameLiveClientChampion(player: LiveClientPlayer, entry: damageGraphEntry): boolean {
    const entryAliases = [entry.champion?.alias, entry.champion?.name].map(normalizeChampionKey);
    const liveAliases = [player.championName, player.rawChampionName].map(normalizeChampionKey);

    return liveAliases.some((liveAlias) => liveAlias && entryAliases.includes(liveAlias));
}

function matchesLiveClientPlayer(player: LiveClientPlayer, entry: damageGraphEntry): boolean {
    const liveNames = [
        player.riotIdGameName,
        player.summonerName,
        player.riotId,
    ].map(normalizePlayerKey);
    const damageNames = [entry.name, entry.displayName].map(normalizePlayerKey);

    return Boolean(
        liveNames.some((liveName) => liveName && damageNames.includes(liveName)) ||
        isSameLiveClientChampion(player, entry),
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

function getImportantInventoryItems(player?: ingameScoreboardBottomPlayerData): itemWithAsset[] {
    if (!player) return [];

    return (player.items ?? []).filter(
        (item): item is itemWithAsset =>
            Boolean(item && getItemId(item) !== 0 && isImportantTeamfightItem(item)),
    );
}

function getImportantLiveClientItems(
    player?: LiveClientPlayer,
    scoreboardPlayer?: ingameScoreboardBottomPlayerData,
): itemWithAsset[] {
    if (!player) return [];

    return (player.items ?? [])
        .filter(isImportantLiveClientItem)
        .map((item) => toTeamfightItem(item, scoreboardPlayer))
        .filter((item): item is itemWithAsset => Boolean(item));
}

function isImportantLiveClientItem(item: LiveClientItem): boolean {
    const itemId = getLiveClientItemId(item);
    if (itemId === 0) return false;
    if (teamfightExcludedItemIds.value.has(itemId)) return false;
    if (!isRegularInventorySlot(item.slot)) return false;
    if (item.consumable === true) return false;

    return teamfightImportantItemIds.value.has(itemId) || isImportantTeamfightItemName(item.displayName);
}

function isImportantTeamfightItem(item: itemWithAsset): boolean {
    const itemId = getItemId(item);
    if (teamfightExcludedItemIds.value.has(itemId)) return false;
    if (!isRegularInventorySlot(item.slot)) return false;

    return (
        teamfightImportantItemIds.value.has(itemId) ||
        isImportantTeamfightItemName(item.displayName)
    );
}

function isImportantTeamfightItemName(name?: string): boolean {
    return Boolean(name && teamfightImportantItemNamePattern.value.test(normalizeSearchText(name)));
}

function toTeamfightItem(
    item: LiveClientItem,
    player?: ingameScoreboardBottomPlayerData,
): itemWithAsset | undefined {
    const itemId = getLiveClientItemId(item);
    if (itemId === 0) return undefined;

    const playerItem = findPlayerItemById(player, itemId);
    if (playerItem) {
        return {
            ...playerItem,
            slot: finiteNumber(item.slot) ?? playerItem.slot,
            displayName: item.displayName ?? playerItem.displayName,
            cost: finiteNumber(item.price) ?? playerItem.cost,
            count: finiteNumber(item.count) ?? playerItem.count,
        };
    }

    const assetItem = findScoreboardAssetItemById(itemId);

    return {
        id: itemId,
        slot: finiteNumber(item.slot) ?? 0,
        displayName: item.displayName ?? assetItem?.displayName ?? `Item ${itemId}`,
        assetUrl: assetItem?.assetUrl ?? getFallbackItemAssetUrl(itemId),
        modifierUrl: assetItem?.modifierUrl,
        cost: finiteNumber(item.price) ?? assetItem?.cost ?? 0,
        count: finiteNumber(item.count) ?? 1,
        combineCost: assetItem?.combineCost ?? 0,
        stats: assetItem?.stats,
        stacks: assetItem?.stacks ?? 0,
        charges: assetItem?.charges ?? 0,
    };
}

function mergeTeamfightItems(
    inventoryItems: itemWithAsset[],
    activeItems: itemWithAsset[],
): itemWithAsset[] {
    const merged: itemWithAsset[] = [];
    const itemIndexById = new Map<number, number>();

    for (const item of inventoryItems) {
        const itemId = getItemId(item);
        if (!item || itemId === 0 || itemIndexById.has(itemId) || !isImportantTeamfightItem(item)) continue;
        itemIndexById.set(itemId, merged.length);
        merged.push(item);
    }

    for (const item of activeItems) {
        const itemId = getItemId(item);
        if (!item || itemId === 0 || !isImportantTeamfightItem(item)) continue;

        const existingIndex = itemIndexById.get(itemId);
        if (existingIndex !== undefined) {
            if (hasCooldownMetadata(item)) {
                merged[existingIndex] = { ...merged[existingIndex], ...item };
            }
            continue;
        }

        itemIndexById.set(itemId, merged.length);
        merged.push(item);
    }

    return sortTeamfightItems(merged);
}

function hasCooldownMetadata(item: itemWithAsset): boolean {
    return item.readyAt !== undefined || item.maxCooldown !== undefined;
}

function getItemId(item: itemWithAsset): number {
    const looseItem = item as itemWithAsset & {
        itemID?: number | string;
        itemId?: number | string;
    };
    return Number(looseItem.id ?? looseItem.itemID ?? looseItem.itemId) || 0;
}

function getLiveClientItemId(item: LiveClientItem): number {
    return Number(item.id ?? item.itemID ?? item.itemId) || 0;
}

function isRegularInventorySlot(slot: LiveClientItem["slot"]): boolean {
    const parsedSlot = finiteNumber(slot);
    return parsedSlot !== undefined && parsedSlot >= 0 && parsedSlot < 6;
}

function findPlayerItemById(
    player: ingameScoreboardBottomPlayerData | undefined,
    itemId: number,
): itemWithAsset | undefined {
    return player?.items?.find((candidate) => getItemId(candidate) === itemId);
}

function findScoreboardAssetItemById(itemId: number): itemWithAsset | undefined {
    for (const team of scoreboardBottom.value?.teams ?? []) {
        for (const player of team.players ?? []) {
            const item = player.items?.find((candidate) => getItemId(candidate) === itemId);
            if (item) return item;
        }
    }

    return undefined;
}

function sortTeamfightItems(items: itemWithAsset[]): itemWithAsset[] {
    return [...items].sort((a, b) =>
        getTeamfightItemPriority(a) - getTeamfightItemPriority(b) ||
        getItemSlot(a) - getItemSlot(b) ||
        getItemId(a) - getItemId(b)
    );
}

function getTeamfightItemPriority(item: itemWithAsset): number {
    const itemId = getItemId(item);
    return teamfightItemPriority.value.get(itemId) ?? (hasCooldownMetadata(item) ? 50 : 100);
}

function getItemSlot(item: itemWithAsset): number {
    return finiteNumber(item.slot) ?? 99;
}

function getFallbackItemAssetUrl(itemId: number): string {
    const version = normalizeGameVersion(gameVersion.value);
    if (version) {
        return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`;
    }

    return `https://ddragon.leagueoflegends.com/cdn/15.9.1/img/item/${itemId}.png`;
}

function normalizeGameVersion(version?: string): string | undefined {
    const match = version?.match(/\d+\.\d+\.\d+/);
    return match?.[0];
}

function normalizeChampionKey(value?: string): string {
    return normalizePlayerKey(value).replace(/^game_character_displayname_/i, "").replace(/[^a-z0-9]/g, "");
}

function normalizeSearchText(value: string): string {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function finiteNumber(value: unknown): number | undefined {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function getSafeRegExp(pattern: string, flags?: string): RegExp {
    try {
        return new RegExp(pattern, flags);
    } catch {
        return /$^/;
    }
}

function getTeamfightItemKey(item: itemWithAsset): string {
    return `${getItemId(item)}:${item.assetUrl ?? ""}:${item.slot ?? ""}`;
}

const spellD = computed(() => {
    if (!props.data || !props.data.abilities || !props.data.abilities[SpellSlotIndex.D]) return undefined;
    return props.data.abilities[SpellSlotIndex.D];
});

const spellF = computed(() => {
    if (!props.data || !props.data.abilities || !props.data.abilities[SpellSlotIndex.F]) return undefined;
    return props.data.abilities[SpellSlotIndex.F];
});

const spellR = computed(() => {
    if (!props.data || !props.data.abilities || !props.data.abilities[SpellSlotIndex.R]) return undefined;
    return props.data.abilities[SpellSlotIndex.R];
});

const healthPct = computed(() => {
    if (!props.data) return 0;
    return ((props.data.health?.current ?? 0) / (props.data.health?.max ?? 1)) * 100
});

const resourcePct = computed(() => {
    if (!props.data) return 0;
    return ((props.data.resource?.current ?? 0) / (props.data.resource?.max ?? 1)) * 100
});

const resourceColor = computed(() => {
    //resource type might be a string, so parse it to enum if needed
    const resourceType = typeof props.data?.resource?.type === "string"
        ? ResourceType[props.data.resource.type as keyof typeof ResourceType]
        : props.data?.resource?.type;

    switch (resourceType) {
        case ResourceType.mana: return "#1d4ed8";
        case ResourceType.energy: return "#d6db29";
        case ResourceType.none: return "transparent";
        case ResourceType.shield: return "#A9A9A9";
        case ResourceType.battlefury:
        case ResourceType.dragonfury:
        case ResourceType.rage:
        case ResourceType.heat:
        case ResourceType.gnarfury:
        case ResourceType.ferocity:
        case ResourceType.bloodwell: return "#bf0000";
        case ResourceType.wind: return "#A9A9A9";
        case ResourceType.unknown:
        default: return "#1d4ed8";
    }
});

const xpPct = computed(() => {
    if (!props.data) return 0;
    const previous = props.data.experience?.previousLevel ?? 0;
    const next = props.data.experience?.nextLevel ?? 1;
    const current = props.data.experience?.current ?? 0;
    return ((current - previous) / (next - previous)) * 100;
});
</script>


<template>

    <!-- Main grid: ult + spells + splash + bars on left 2 cols, items on right col -->
    <div class="main-grid" :class="mirror ? 'mirrored' : ''" :style="{
        filter: respawnRemaining > 0 ? 'grayscale(1)' : 'grayscale(0)',
        transition: 'filter 0.5s ease'
    }">
        <!-- Ultimate icon: centered over the 2-col section -->
        <div class="area-ult flex justify-center py-1">
            <SpellWithCooldown v-if="spellR?.assets?.iconAsset" :ready-at="spellR?.readyAt"
                :img="client.getCacheUrl(spellR?.assets?.iconAsset)" show-timer :skilled="spellR?.level > 0"
                :total-cooldown="spellR?.totalCooldown" class="champion-icon rounded-full"
                style="--cooldown-font-size: 32px" />
            <div v-else class="champion-icon rounded-full"></div>
        </div>

        <!-- Spell icons: top-left 2 cells -->
        <SpellWithCooldown :ready-at="spellD?.readyAt" :img="client.getCacheUrl(spellD?.assets?.iconAsset)" show-timer
            skilled :total-cooldown="spellD?.totalCooldown" class="spell-icon area-spell1" />
        <SpellWithCooldown :ready-at="spellF?.readyAt" :img="client.getCacheUrl(spellF?.assets?.iconAsset)" show-timer
            skilled :total-cooldown="spellF?.totalCooldown" class="spell-icon area-spell2" />

        <!-- Splash portrait -->
        <div class="player-portrait bg-zinc-600 area-splash">
            <img :src="client.getCacheUrl(data?.champion?.squareImg)" class="object-cover w-full h-full" />
            <FadeTransition>
                <span v-if="respawnRemaining > 0" class="respawn-timer">{{ Math.ceil(respawnRemaining) }}</span>
            </FadeTransition>
        </div>

        <!-- Level + progress bars -->
        <div class="area-bars flex h-7" :class="mirror ? 'flex-row-reverse' : 'flex-row'">
            <div class="level-text" :style="{
                borderLeft: mirror ? '1px solid rgba(255, 255, 255, 0.55)' : 'none',
                borderRight: mirror ? 'none' : '1px solid rgba(255, 255, 255, 0.55)'
            }">
                {{ data?.level }}
            </div>
            <div class="flex-1 flex flex-col gap-0.5 p-0.5 area-progress">
                <ProgressBar :progress-pct="xpPct" fill-color="#a78bfa" :mirror="mirror" class="flex-1" />
                <ProgressBar :progress-pct="healthPct" fill-color="#22c55e" :mirror="mirror" class="flex-2" />
                <ProgressBar :progress-pct="resourcePct" :fill-color="resourceColor" :mirror="mirror" class="flex-2" />
            </div>
        </div>

        <!-- Items: all in one column -->
        <div class="area-items">
            <div v-for="item in teamfightItems" :key="getTeamfightItemKey(item)" class="teamfight-item-slot">
                <ItemWithCooldown :item="item" :show-stacks="false" />
            </div>
        </div>
    </div>

</template>


<style lang="css" scoped>
.champion-icon {
    width: 80%;
    aspect-ratio: 1 / 1;
    transform: translateY(15%);
    z-index: 2;
}

/*
  3-column grid: [spell/splash/bars (×2)] [items]
  Mirrored flips column order via grid-template-areas.
*/
.main-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    grid-template-rows: auto auto auto auto;
    grid-template-areas:
        "ult    ult    empty"
        "spell1 spell2 items"
        "splash splash items"
        "bars   bars   items";
}

.main-grid.mirrored {
    grid-template-areas:
        "empty ult    ult   "
        "items spell1 spell2"
        "items splash splash"
        "items bars   bars  ";
}

.area-ult {
    grid-area: ult;
}

.area-spell1 {
    grid-area: spell1;
}

.area-spell2 {
    grid-area: spell2;
}

.area-splash {
    grid-area: splash;
    border-left: 1px solid rgba(255, 255, 255, 0.55);
    border-right: 1px solid rgba(255, 255, 255, 0.55);
    border-top: 1px solid rgba(255, 255, 255, 0.55);
}

.area-bars {
    grid-area: bars;
    border: 1px solid rgba(255, 255, 255, 0.55);
    background-color: black;
}

.area-items {
    grid-area: items;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    gap: 1px;
    min-height: 0;
    overflow: hidden;
}

.spell-icon {
    aspect-ratio: 1 / 1;
    width: 100%;
    border: 2px solid rgba(0, 0, 0, 0.6);
}

.player-portrait {
    aspect-ratio: 1 / 1;
    width: 100%;
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;

}

.teamfight-item-slot {
    flex: 1 1 0;
    max-height: 33.333%;
    width: 100%;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}

.teamfight-item-slot :deep(.item-slot) {
    height: 100%;
    max-width: 100%;
    aspect-ratio: 1 / 1;
}

.teamfight-item-slot :deep(.item-slot-content),
.teamfight-item-slot :deep(.item-slot-empty) {
    width: 100%;
    height: 100%;
}

.level-text {
    font-family: "Bebas Neue", sans-serif;
    width: calc(100% / 3);
    background-color: black;
    display: flex;
    justify-content: center;
    align-items: center;
}

.respawn-timer {
    position: absolute;
    color: white;
    font-family: "Bebas Neue", sans-serif;
    font-size: 32px;
    text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
}
</style>
