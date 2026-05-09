<script setup lang="ts">
import { computed } from 'vue'
import {
  IngameSideInfoPageType,
  Team,
  type ingameScoreboardBottomPlayerData,
  type ingameSideInfoPage,
  type ingameSideInfoPageRow,
  type tabPlayer,
} from '@bluebottle_gg/league-broadcast-client'
import { useClient } from '@/client'
import { useIngameSelector } from '@/composables/useIngame'
import { useOverlayConfig, type SideInfoKind } from '@/composables/useOverlayConfig'
import SlideTransition from '@/transitions/SlideTransition.vue'
import { handleImageError, handleImageLoad } from '@/utils/imageUtils'

const client = useClient()
const sideInfoPage = useIngameSelector((s) => s.gameData.sideInfoPage)
const scoreboardBottom = useIngameSelector((s) => s.gameData.scoreboardBottom)
const tabs = useIngameSelector((s) => s.gameData.tabs)
const { config: overlayConfig } = useOverlayConfig()

const visiblePage = computed(() => {
  const page = sideInfoPage.value
  if (!page || !isSupportedPage(page)) return undefined
  if (!page.players?.length) return undefined

  return page
})

const rows = computed(() =>
  [...(visiblePage.value?.players ?? [])].sort(
    (a, b) => getMetricValue(b) - getMetricValue(a) || getRowName(a).localeCompare(getRowName(b)),
  ),
)
const title = computed(() => {
  const page = visiblePage.value
  if (!page) return ''

  const kind = getPageKind(page)
  return kind ? overlayConfig.value.text.sideInfo[kind] : page.title?.trim() || ''
})

const maxBarValue = computed(() => Math.max(...rows.value.map(getMetricValue), 1))
const pageKind = computed(() => {
  const page = visiblePage.value
  return page ? getPageKind(page) : undefined
})

const showHero = computed(() => visiblePage.value?.display?.showHero ?? true)
const showBar = computed(() => visiblePage.value?.display?.showBar ?? true)

function isSupportedPage(page: ingameSideInfoPage): boolean {
  return getPageKind(page) !== undefined
}

function getPageKind(page: ingameSideInfoPage): SideInfoKind | undefined {
  const type = Number(page.type)
  if (type === IngameSideInfoPageType.Gold) return 'gold'
  if (type === IngameSideInfoPageType.Experience) return 'experience'
  if (type === IngameSideInfoPageType.Damage) return 'damage'
  if (type === IngameSideInfoPageType.CreepScore) return 'creepScore'
  if (type === IngameSideInfoPageType.RoleQuest) return 'roleQuest'
  if (type === IngameSideInfoPageType.TowerPlatings) return 'towerPlates'

  const key = normalizeSearchText(`${String(page.type)} ${page.title ?? ''}`)
  if (key.includes('gold')) return 'gold'
  if (key.includes('experience') || key.includes('exp')) return 'experience'
  if (key.includes('damage')) return 'damage'
  if (key.includes('creepscore') || key.includes('creep score') || key.includes('cs')) return 'creepScore'
  if (key.includes('rolequest') || key.includes('role quest')) return 'roleQuest'
  if (
    key.includes('towerplating') ||
    key.includes('tower plating') ||
    key.includes('towerplate') ||
    key.includes('tower plate')
  ) return 'towerPlates'

  return undefined
}

function getRowName(row: ingameSideInfoPageRow): string {
  return row.displayName || row.playerName || row.champion?.alias || row.champion?.name || ''
}

function getChampionIcon(row: ingameSideInfoPageRow): string | undefined {
  return row.champion?.squareImg ? client.getCacheUrl(row.champion.squareImg) : undefined
}

function getTeamClass(row: ingameSideInfoPageRow): string {
  return row.team === Team.Chaos ? 'team-chaos' : 'team-order'
}

function getBarWidth(row: ingameSideInfoPageRow): string {
  if (pageKind.value === 'experience') {
    return `${getExperienceProgress(row)}%`
  }

  const pct = (getMetricValue(row) / maxBarValue.value) * 100

  return `${Math.max(0, Math.min(100, pct))}%`
}

function getValueText(row: ingameSideInfoPageRow): string {
  if (pageKind.value === 'experience') {
    return formatPlainNumber(getExperienceLevel(row))
  }

  return formatValue(getMetricValue(row), row.displayValueSuffix)
}

function getMetricValue(row: ingameSideInfoPageRow): number {
  if (pageKind.value === 'experience') {
    return getExperienceLevel(row) + getExperienceProgress(row) / 100
  }

  return (
    finiteNumber(row.curValue) ??
    finiteNumber(row.displayValue) ??
    finiteNumber(row.maxValue) ??
    0
  )
}

function getExperienceLevel(row: ingameSideInfoPageRow): number {
  return findScoreboardPlayer(row)?.level ?? findTabPlayer(row)?.level ?? getFallbackExperienceLevel(row)
}

function getExperienceProgress(row: ingameSideInfoPageRow): number {
  const tabPlayer = findTabPlayer(row)
  const min = finiteNumber(tabPlayer?.experience.previousLevel) ?? finiteNumber(row.minValue) ?? 0
  const current = finiteNumber(tabPlayer?.experience.current) ?? finiteNumber(row.curValue) ?? min
  const max = finiteNumber(tabPlayer?.experience.nextLevel) ?? finiteNumber(row.maxValue)

  if (max !== undefined && max > min) {
    return clampPercent(((current - min) / (max - min)) * 100)
  }

  return clampPercent(current)
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function getFallbackExperienceLevel(row: ingameSideInfoPageRow): number {
  const candidates = [finiteNumber(row.displayValue), finiteNumber(row.curValue), finiteNumber(row.maxValue)]
  return candidates.find((value) => value !== undefined && value >= 1 && value <= 18) ?? 0
}

function findScoreboardPlayer(
  row: ingameSideInfoPageRow,
): ingameScoreboardBottomPlayerData | undefined {
  const teamPlayers = getScoreboardPlayersForRow(row)
  const matchedPlayer = teamPlayers.find((player) => matchesSideInfoRow(player, row))
  if (matchedPlayer) return matchedPlayer

  for (const team of scoreboardBottom.value?.teams ?? []) {
    const fallbackMatch = team.players?.find((player) => matchesSideInfoRow(player, row))
    if (fallbackMatch) return fallbackMatch
  }

  return undefined
}

function getScoreboardPlayersForRow(row: ingameSideInfoPageRow): ingameScoreboardBottomPlayerData[] {
  const index = getTeamIndex(row.team)
  if (index !== undefined) return scoreboardBottom.value?.teams[index]?.players ?? []

  return scoreboardBottom.value?.teams.flatMap((team) => team.players ?? []) ?? []
}

function findTabPlayer(row: ingameSideInfoPageRow): tabPlayer | undefined {
  const scoreboardPlayer = findScoreboardPlayer(row)
  const teamKey = getTabTeamKey(row.team)
  const playerGroups = teamKey
    ? [tabs.value?.[teamKey]?.players ?? []]
    : Object.values(tabs.value ?? {}).map((team) => team.players ?? [])

  for (const players of playerGroups) {
    const matchedPlayer = players.find(
      (player) => matchesTabPlayer(player, row) || matchesScoreboardPlayerName(player, scoreboardPlayer),
    )
    if (matchedPlayer) return matchedPlayer
  }

  return undefined
}

function matchesSideInfoRow(
  player: ingameScoreboardBottomPlayerData,
  row: ingameSideInfoPageRow,
): boolean {
  const rowKeys = getRowKeys(row)
  const playerKeys = [player.name, player.displayName, player.champion?.alias, player.champion?.name]
    .map(normalizeExactKey)
    .filter(Boolean)

  return rowKeys.some((key) => playerKeys.includes(key))
}

function matchesTabPlayer(player: tabPlayer, row: ingameSideInfoPageRow): boolean {
  const rowKeys = getRowKeys(row)
  const playerKeys = [
    player.playerName,
    player.displayName,
    player.playerHashtag ? `${player.playerName}#${player.playerHashtag}` : undefined,
    player.championAssets?.alias,
    player.championAssets?.name,
  ]
    .map(normalizeExactKey)
    .filter(Boolean)

  return rowKeys.some((key) => playerKeys.includes(key))
}

function matchesScoreboardPlayerName(
  player: tabPlayer,
  scoreboardPlayer?: ingameScoreboardBottomPlayerData,
): boolean {
  if (!scoreboardPlayer) return false

  const scoreboardKeys = [scoreboardPlayer.name, scoreboardPlayer.displayName]
    .map(normalizeExactKey)
    .filter(Boolean)
  const tabKeys = [player.playerName, player.displayName, player.playerHashtag ? `${player.playerName}#${player.playerHashtag}` : undefined]
    .map(normalizeExactKey)
    .filter(Boolean)

  return scoreboardKeys.some((key) => tabKeys.includes(key))
}

function getRowKeys(row: ingameSideInfoPageRow): string[] {
  return [
    row.playerName,
    row.displayName,
    row.champion?.alias,
    row.champion?.name,
  ]
    .map(normalizeExactKey)
    .filter(Boolean)
}

function getTeamIndex(team: ingameSideInfoPageRow['team']): number | undefined {
  if (team === Team.Order) return 0
  if (team === Team.Chaos) return 1
  if (team === 0 || team === 1) return team
  return undefined
}

function getTabTeamKey(team: ingameSideInfoPageRow['team']): 'Order' | 'Chaos' | undefined {
  const index = getTeamIndex(team)
  if (index === 0) return 'Order'
  if (index === 1) return 'Chaos'
  return undefined
}

function formatValue(value: number, suffix?: string): string {
  if (suffix) return `${formatPlainNumber(value)}${suffix}`

  const absoluteValue = Math.abs(value)
  if (absoluteValue >= 1000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`
  }

  return formatPlainNumber(value)
}

function formatPlainNumber(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1).replace(/\.0$/, '')
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeExactKey(value?: string): string {
  return normalizeSearchText(value?.split('#')[0] ?? '')
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}
</script>

<template>
  <SlideTransition enter-from="left" leave-to="left" :duration="450" fade>
    <aside v-if="visiblePage" class="side-info" :class="{ 'without-hero': !showHero }">
      <h2 class="side-info-title">{{ title }}</h2>

      <div class="side-info-rows">
        <div
          v-for="(row, index) in rows"
          :key="`${row.playerName ?? row.displayName ?? index}:${index}`"
          class="side-info-row"
          :class="getTeamClass(row)"
        >
          <img
            v-if="showHero && getChampionIcon(row)"
            class="champion-icon"
            :src="getChampionIcon(row)"
            @error="handleImageError"
            @load="handleImageLoad"
          />
          <div v-else-if="showHero" class="champion-icon champion-icon-empty"></div>

          <div class="row-content">
            <div class="player-name">{{ getRowName(row) }}</div>
            <div v-if="showBar" class="bar-track">
              <div class="bar-fill" :style="{ width: getBarWidth(row) }"></div>
            </div>
          </div>

          <div class="value-box">{{ getValueText(row) }}</div>
        </div>
      </div>
    </aside>
  </SlideTransition>
</template>

<style scoped>
.side-info {
  width: 292px;
  padding: 18px 18px 20px;
  background:
    linear-gradient(90deg, rgba(7, 10, 18, 0.96), rgba(7, 10, 18, 0.78)),
    linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.01));
  border-top: 1px solid rgba(255, 255, 255, 0.18);
  border-right: 1px solid rgba(255, 255, 255, 0.12);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  overflow: hidden;
  pointer-events: none;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.42);
}

.side-info-title {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 27px;
  line-height: 1;
  font-weight: 400;
  letter-spacing: 0;
  margin-bottom: 13px;
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 0 2px 3px rgba(0, 0, 0, 0.9);
}

.side-info-rows {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}

.side-info-row {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) 54px;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 2px 0;
}

.side-info.without-hero .side-info-row {
  grid-template-columns: minmax(0, 1fr) 54px;
}

.champion-icon {
  width: 30px;
  height: 30px;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.25);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.65);
}

.champion-icon-empty {
  background: rgba(255, 255, 255, 0.08);
}

.row-content {
  display: grid;
  grid-template-rows: 16px 12px;
  gap: 2px;
  min-width: 0;
}

.player-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
  line-height: 16px;
  font-weight: 900;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}

.bar-track {
  position: relative;
  width: 100%;
  height: 12px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.bar-fill {
  height: 100%;
  min-width: 2px;
  background: linear-gradient(90deg, var(--row-color-soft), var(--row-color));
  transition: width 0.35s ease;
}

.value-box {
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-left: 2px solid var(--row-color);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-family: 'Bebas Neue', sans-serif;
  font-size: 18px;
  line-height: 1;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}

.team-order {
  --row-color: #06aeea;
  --row-color-soft: rgba(6, 174, 234, 0.42);
}

.team-chaos {
  --row-color: #cf3439;
  --row-color-soft: rgba(207, 52, 57, 0.42);
}
</style>
