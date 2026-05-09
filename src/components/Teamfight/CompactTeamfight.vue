<script setup lang="ts">
import { useClient } from '@/client'
import { useIngameSelector } from '@/composables/useIngame'
import { useLFrameConfig } from '@/composables/useLFrameConfig'
import {
  hasBlueBottlePlayerOrder,
  orderDamageEntriesByBlueBottle,
  orderLiveClientPlayersByBlueBottle,
  orderScoreboardPlayersByBlueBottle,
} from '@/utils/blueBottleOrdering'
import { handleImageError, handleImageLoad } from '@/utils/imageUtils'
import { Team, type ingameScoreboardBottomPlayerData } from '@bluebottle_gg/league-broadcast-client'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import TeamfightPlayerEntry from './TeamfightPlayerEntry.vue'
import type { LiveClientPlayer } from './liveClientTypes'

const client = useClient()
const { config } = useLFrameConfig()
const teamfight = useIngameSelector((state) => state.gameData.teamfightDamageOverview)
const gameTeams = useIngameSelector((state) => state.gameData.teams)
const scoreboardBottom = useIngameSelector((state) => state.gameData.scoreboardBottom)
const seasonIcon = ref<string | null>(null)
const liveClientPlayers = ref<LiveClientPlayer[]>([])
const cachedOrderScoreboardPlayers = ref<ingameScoreboardBottomPlayerData[]>([])
const cachedChaosScoreboardPlayers = ref<ingameScoreboardBottomPlayerData[]>([])
let liveClientPollId: number | undefined
let liveClientAbortController: AbortController | undefined
let liveClientPolling = false
let liveClientPollingKey = ''
let isMounted = false

const blueEntries = computed(
  () =>
    orderDamageEntriesByBlueBottle(
      teamfight?.value?.damageDealt.filter((entry) => entry.team === Team.Order),
      gameTeams.value?.[0],
    ),
)
const redEntries = computed(
  () =>
    orderDamageEntriesByBlueBottle(
      teamfight?.value?.damageDealt.filter((entry) => entry.team === Team.Chaos),
      gameTeams.value?.[1],
    ),
)
const orderLiveClientPlayers = computed(() => getLiveClientTeamPlayers('order'))
const chaosLiveClientPlayers = computed(() => getLiveClientTeamPlayers('chaos'))
const currentOrderScoreboardPlayers = computed(() =>
  orderScoreboardPlayersByBlueBottle(scoreboardBottom.value?.teams[0]?.players, gameTeams.value?.[0]),
)
const currentChaosScoreboardPlayers = computed(() =>
  orderScoreboardPlayersByBlueBottle(scoreboardBottom.value?.teams[1]?.players, gameTeams.value?.[1]),
)
const orderScoreboardPlayers = computed(() =>
  currentOrderScoreboardPlayers.value.length ? currentOrderScoreboardPlayers.value : cachedOrderScoreboardPlayers.value,
)
const chaosScoreboardPlayers = computed(() =>
  currentChaosScoreboardPlayers.value.length ? currentChaosScoreboardPlayers.value : cachedChaosScoreboardPlayers.value,
)
const dateTimeNowString = new Date().toISOString()

onMounted(async () => {
  isMounted = true
  try {
    seasonIcon.value = await client.api.season.getCurrentSeasonIcon()
  } finally {
    syncLiveClientPolling()
  }
})

onUnmounted(() => {
  isMounted = false
  stopLiveClientPolling()
})

watch(
  () =>
    [
      Boolean(teamfight.value),
      config.value.inhibitors.liveClientFallback,
      config.value.inhibitors.liveClientUrl,
      config.value.inhibitors.liveClientPollMs,
    ] as const,
  syncLiveClientPolling,
)

watch(
  currentOrderScoreboardPlayers,
  (players) => {
    if (players.length) cachedOrderScoreboardPlayers.value = players
  },
  { immediate: true },
)

watch(
  currentChaosScoreboardPlayers,
  (players) => {
    if (players.length) cachedChaosScoreboardPlayers.value = players
  },
  { immediate: true },
)

function syncLiveClientPolling() {
  if (!isMounted) return

  const settings = config.value.inhibitors
  const pollingKey = `${Boolean(teamfight.value)}|${settings.liveClientFallback}|${settings.liveClientUrl}|${settings.liveClientPollMs}`

  if (!teamfight.value || !settings.liveClientFallback || !settings.liveClientUrl) {
    stopLiveClientPolling()
    liveClientPlayers.value = []
    return
  }

  if (liveClientPollId !== undefined && liveClientPollingKey === pollingKey) return

  stopLiveClientPolling()
  liveClientPollingKey = pollingKey
  void pollLiveClientPlayers()
  liveClientPollId = window.setInterval(() => void pollLiveClientPlayers(), settings.liveClientPollMs)
}

function stopLiveClientPolling() {
  if (liveClientPollId !== undefined) {
    window.clearInterval(liveClientPollId)
    liveClientPollId = undefined
  }

  liveClientAbortController?.abort()
  liveClientAbortController = undefined
  liveClientPolling = false
  liveClientPollingKey = ''
}

async function pollLiveClientPlayers() {
  if (liveClientPolling) return

  const settings = config.value.inhibitors
  if (!teamfight.value || !settings.liveClientFallback || !settings.liveClientUrl) return

  liveClientPolling = true
  const controller = new AbortController()
  liveClientAbortController = controller

  try {
    const response = await fetch(settings.liveClientUrl, {
      cache: 'no-store',
      signal: controller.signal,
    })

    if (!response.ok) return

    liveClientPlayers.value = liveClientPlayersFromPayload(await response.json())
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
  } finally {
    if (liveClientAbortController === controller) {
      liveClientAbortController = undefined
    }
    liveClientPolling = false
  }
}

function liveClientPlayersFromPayload(payload: unknown): LiveClientPlayer[] {
  if (!isRecord(payload) || !Array.isArray(payload.allPlayers)) return []

  return payload.allPlayers.filter(isRecord)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const LIVE_CLIENT_ROLE_ORDER = new Map([
  ['top', 0],
  ['jungle', 1],
  ['middle', 2],
  ['mid', 2],
  ['bottom', 3],
  ['bot', 3],
  ['utility', 4],
  ['support', 4],
])

function getLiveClientTeamPlayers(team: 'order' | 'chaos') {
  const teamIndex = team === 'order' ? 0 : 1
  const players = liveClientPlayers.value.filter((player) => normalizeKey(player.team) === team)
  const teamMeta = gameTeams.value?.[teamIndex]
  const orderedPlayers = orderLiveClientPlayersByBlueBottle(players, teamMeta)

  if (hasBlueBottlePlayerOrder(teamMeta)) return orderedPlayers

  return orderedPlayers.sort((a, b) => roleWeight(a.position) - roleWeight(b.position))
}

function roleWeight(role?: string) {
  return LIVE_CLIENT_ROLE_ORDER.get(normalizeKey(role)) ?? 99
}

function normalizeKey(value?: string) {
  return value?.trim().toLowerCase() ?? ''
}

const STAGGER_STEP = 0.1
const BASE_DELAY = 0.5

function onBeforeEnter(el: Element) {
  const htmlEl = el as HTMLElement
  htmlEl.style.opacity = '0'
  htmlEl.style.transform = 'translateY(100%)'
}

function makeEnterHandler(
  getDelay: (index: number, total: number) => number,
  getTotal: () => number,
) {
  return (el: Element, done: () => void) => {
    const htmlEl = el as HTMLElement
    const index = parseInt((htmlEl as HTMLElement).dataset.index ?? '0')
    const delay = BASE_DELAY + getDelay(index, getTotal())
    htmlEl.style.transition = `opacity 0.3s ease ${delay}s, transform 0.3s ease ${delay}s`
    // force reflow
    void htmlEl.offsetHeight
    htmlEl.style.opacity = '1'
    htmlEl.style.transform = 'translateY(0)'
    htmlEl.addEventListener('transitionend', done, { once: true })
  }
}

// Blue: inside = highest index (rightmost), outside = 0 (leftmost)
const onBlueEnter = makeEnterHandler(
  (index, total) => (total - 1 - index) * STAGGER_STEP,
  () => blueEntries.value.length,
)

// Red: inside = index 0 (leftmost), outside = highest index (rightmost)
const onRedEnter = makeEnterHandler(
  (index) => index * STAGGER_STEP,
  () => redEntries.value.length,
)
</script>

<template>
  <Transition name="slide-down">
    <div v-if="teamfight" class="teamfight-container">
      <div class="team-container order">
        <TransitionGroup appear @before-enter="onBeforeEnter" @enter="onBlueEnter">
          <TeamfightPlayerEntry
            class="team-entry"
            v-for="(entry, index) in blueEntries"
            :key="index"
            :data="entry"
            :live-client-players="liveClientPlayers"
            :live-client-player-fallback="orderLiveClientPlayers[index]"
            :scoreboard-player-fallback="orderScoreboardPlayers[index]"
            :data-index="index"
          >
          </TeamfightPlayerEntry>
        </TransitionGroup>
      </div>
      <img
        v-if="seasonIcon"
        :src="client.getCacheUrl(seasonIcon, true) + `?ts=${dateTimeNowString}`"
        class="teamfight-logo"
        @error="handleImageError"
        @load="handleImageLoad"
      />

      <div class="team-container chaos">
        <TransitionGroup appear @before-enter="onBeforeEnter" @enter="onRedEnter">
          <TeamfightPlayerEntry
            class="team-entry"
            v-for="(entry, index) in redEntries"
            :key="index"
            :data="entry"
            :live-client-players="liveClientPlayers"
            :live-client-player-fallback="chaosLiveClientPlayers[index]"
            :scoreboard-player-fallback="chaosScoreboardPlayers[index]"
            mirror
            :data-index="index"
          >
          </TeamfightPlayerEntry>
        </TransitionGroup>
      </div>
    </div>
  </Transition>
</template>

<style lang="css" scoped>
.teamfight-container {
  display: grid;
  grid-template-columns: 1fr 100px 1fr;
  grid-template-rows: auto;
  align-items: center;
  background: linear-gradient(to bottom, rgba(30, 30, 30, 0), rgba(10, 10, 10, 1));
}

.team-container {
  display: flex;
  flex-direction: row;
  gap: 4px;
  padding: 8px;
  height: 100%;
  align-items: flex-end;
  background-origin: border-box;
}

/* Blue: gradient border on left (top→bottom) and bottom (right→left), meeting at bottom-left */
.team-container.order {
  background:
    linear-gradient(to bottom, transparent, var(--blue-team-color)) left / 5px 100% no-repeat,
    linear-gradient(to left, transparent, var(--blue-team-color)) bottom / 100% 5px no-repeat;
}

/* Red: gradient border on right (top→bottom) and bottom (left→right), meeting at bottom-right */
.team-container.chaos {
  background:
    linear-gradient(to bottom, transparent, var(--red-team-color)) right / 5px 100% no-repeat,
    linear-gradient(to right, transparent, var(--red-team-color)) bottom / 100% 5px no-repeat;
}

.team-entry {
  flex: 1;
  width: 100%;
}

.teamfight-logo {
  margin-top: auto;
  height: 100px;
}

.slide-down-enter-active {
  transition: transform 0.3s ease 0.3s;
}

.slide-down-leave-active {
  transition: transform 0.3s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(100%);
}
</style>
