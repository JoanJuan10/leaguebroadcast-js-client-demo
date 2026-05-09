<script setup lang="ts">
import {
  playerUpdateEvent,
  isPlayerDead,
  type ingameObjectivePowerPlay,
  type ingameScoreboardBottomData,
  type ingameScoreboardBottomPlayerData,
  type itemWithAsset,
  type tabPlayer,
} from '@bluebottle_gg/league-broadcast-client'
import PlayerItems from './PlayerItems.vue'
import { useIngameSelector } from '@/composables/useIngame'
import PlayerInfo from './PlayerInfo.vue'
import GoldDiff from './GoldDiff.vue'
import ItemBuyNotification from './ItemBuyNotification.vue'
import { useClient } from '@/client'
import { computed, onUnmounted, watch } from 'vue'
import { useNotificationQueue } from '@/composables/useNotificationQueue'
import { orderScoreboardPlayersByBlueBottle } from '@/utils/blueBottleOrdering'
import { getSpanishItemName } from '@/utils/itemLocalization'
import { useOverlayConfig } from '@/composables/useOverlayConfig'

const scoreboard = useIngameSelector((s) => s.gameData.scoreboardBottom)
const gameScoreboard = useIngameSelector((s) => s.gameData.scoreboard)
const tabs = useIngameSelector((s) => s.gameData.tabs)
const gameTime = useIngameSelector((s) => s.gameData.gameTime)
const gameVersion = useIngameSelector((s) => s.gameData.gameVersion)
const gameTeams = useIngameSelector((s) => s.gameData.teams)
const client = useClient()
const { config: overlayConfig } = useOverlayConfig()

const levelUpQueue = useNotificationQueue(
  computed(() => overlayConfig.value.playerScoreboard.levelUpNotificationMs),
)
const itemBuyQueue = useNotificationQueue(
  computed(() => overlayConfig.value.playerScoreboard.itemBuyNotificationMs),
)
const lastInventoryByPlayer = new Map<string, Map<number, number>>()
const recentItemNotifications = new Map<string, number>()
const recentItemWindowMs = computed(
  () => overlayConfig.value.playerScoreboard.recentItemNotificationWindowMs,
)
const minItemValue = computed(() => overlayConfig.value.playerScoreboard.itemBuyMinItemValue)
const excludedBoughtItemNamePattern = computed(() =>
  getSafeRegExp(overlayConfig.value.playerScoreboard.excludedBoughtItemNamePattern, 'i'),
)
type ObjectiveBuffType = 'baron' | 'elder'
type ObjectiveBuffActiveKey = 'baronStart' | 'elderStart'
type ObjectiveBuffLostKey = 'lostBaronStart' | 'lostElderStart'
type ObjectiveBuffState = {
  baronStart?: number
  elderStart?: number
  lostBaronStart?: number
  lostElderStart?: number
}
const objectiveBuffStateByPlayer = new Map<string, ObjectiveBuffState>()
const orderPlayers = computed(() =>
  orderScoreboardPlayersByBlueBottle(scoreboard.value?.teams[0]?.players, gameTeams.value?.[0]),
)
const chaosPlayers = computed(() =>
  orderScoreboardPlayersByBlueBottle(scoreboard.value?.teams[1]?.players, gameTeams.value?.[1]),
)

/**
 * Find which row index (0-4) and team a player belongs to,
 * based on their name matching scoreboard data.
 */
function findPlayerPosition(
  playerName: string,
): { playerIndex: number; team: 'Order' | 'Chaos' } | null {
  if (!scoreboard.value) return null
  for (let i = 0; i < 5; i++) {
    if (orderPlayers.value[i]?.name === playerName) {
      return { playerIndex: i, team: 'Order' }
    }
    if (chaosPlayers.value[i]?.name === playerName) {
      return { playerIndex: i, team: 'Chaos' }
    }
  }
  return null
}

function normalizePlayerKey(value?: string): string {
  return value?.trim().toLowerCase() ?? ''
}

function getTabPlayerIdentity(player?: tabPlayer): string {
  if (!player) return ''
  return normalizePlayerKey(`${player.playerName}#${player.playerHashtag}`)
}

function findTabPlayer(
  team: 'Order' | 'Chaos',
  scoreboardPlayer?: ingameScoreboardBottomPlayerData,
  fallbackIndex?: number,
): tabPlayer | undefined {
  const teamPlayers = tabs.value?.[team]?.players ?? []
  const scoreboardName = normalizePlayerKey(scoreboardPlayer?.name)
  const scoreboardDisplayName = normalizePlayerKey(scoreboardPlayer?.displayName)

  const matchedPlayer = teamPlayers.find((player) => {
    const tabName = getTabPlayerIdentity(player)
    return (
      (scoreboardName && tabName === scoreboardName) ||
      (scoreboardDisplayName && normalizePlayerKey(player.displayName) === scoreboardDisplayName)
    )
  })

  return matchedPlayer ?? (fallbackIndex === undefined ? undefined : teamPlayers[fallbackIndex])
}

function getObjectiveBuffState(playerName: string): ObjectiveBuffState {
  const current = objectiveBuffStateByPlayer.get(playerName) ?? {}
  objectiveBuffStateByPlayer.set(playerName, current)
  return current
}

function getObjectiveBuffKeys(type: ObjectiveBuffType): {
  active: ObjectiveBuffActiveKey
  lost: ObjectiveBuffLostKey
} {
  return type === 'baron'
    ? { active: 'baronStart', lost: 'lostBaronStart' }
    : { active: 'elderStart', lost: 'lostElderStart' }
}

function isPowerPlayActive(
  powerPlay?: ingameObjectivePowerPlay,
): powerPlay is ingameObjectivePowerPlay {
  return Boolean(
    powerPlay && powerPlay.timeStart <= gameTime.value && powerPlay.timeEnd > gameTime.value,
  )
}

function syncObjectiveBuff(
  type: ObjectiveBuffType,
  powerPlay: ingameObjectivePowerPlay | undefined,
  players: ingameScoreboardBottomPlayerData[] | undefined,
) {
  const keys = getObjectiveBuffKeys(type)
  const activePowerPlay = isPowerPlayActive(powerPlay) ? powerPlay : undefined

  for (const player of players ?? []) {
    const state = getObjectiveBuffState(player.name)

    if (!activePowerPlay) {
      delete state[keys.active]
      delete state[keys.lost]
      continue
    }

    if (state[keys.active] !== activePowerPlay.timeStart) {
      delete state[keys.active]
    }
    if (state[keys.lost] !== activePowerPlay.timeStart) {
      delete state[keys.lost]
    }

    if (isPlayerDead(player, gameTime.value)) {
      delete state[keys.active]
      state[keys.lost] = activePowerPlay.timeStart
      continue
    }

    if (state[keys.lost] !== activePowerPlay.timeStart) {
      state[keys.active] = activePowerPlay.timeStart
    }
  }
}

function hasObjectiveBuff(
  type: ObjectiveBuffType,
  player?: ingameScoreboardBottomPlayerData,
  tabPlayerForPlayer?: tabPlayer,
): boolean {
  if (
    !player ||
    isPlayerDead(player, gameTime.value) ||
    isPlayerDead(tabPlayerForPlayer, gameTime.value)
  )
    return false

  const state = objectiveBuffStateByPlayer.get(player.name)
  const keys = getObjectiveBuffKeys(type)
  if (state?.[keys.lost] !== undefined) return false

  const nativeFlag = type === 'baron' ? tabPlayerForPlayer?.hasBaron : tabPlayerForPlayer?.hasElder
  return state?.[keys.active] !== undefined || (nativeFlag ?? false)
}

watch(
  [gameScoreboard, scoreboard, gameTime],
  ([nextGameScoreboard, nextScoreboard]) => {
    // BlueBottle sometimes keeps tabPlayer.hasBaron/hasElder false while the
    // team power play is active, so we track eligible living players ourselves.
    syncObjectiveBuff(
      'baron',
      nextGameScoreboard?.teams[0]?.baronPowerPlay,
      nextScoreboard?.teams[0]?.players,
    )
    syncObjectiveBuff(
      'baron',
      nextGameScoreboard?.teams[1]?.baronPowerPlay,
      nextScoreboard?.teams[1]?.players,
    )
    syncObjectiveBuff(
      'elder',
      nextGameScoreboard?.teams[0]?.dragonPowerPlay,
      nextScoreboard?.teams[0]?.players,
    )
    syncObjectiveBuff(
      'elder',
      nextGameScoreboard?.teams[1]?.dragonPowerPlay,
      nextScoreboard?.teams[1]?.players,
    )
  },
  { immediate: true },
)

function getInventoryCounts(player: ingameScoreboardBottomPlayerData): Map<number, number> {
  const counts = new Map<number, number>()
  for (const item of player.items ?? []) {
    counts.set(item.id, (counts.get(item.id) ?? 0) + Math.max(item.count ?? 1, 1))
  }
  return counts
}

function refreshInventorySnapshot(nextScoreboard?: ingameScoreboardBottomData) {
  lastInventoryByPlayer.clear()
  for (const team of nextScoreboard?.teams ?? []) {
    for (const player of team.players ?? []) {
      lastInventoryByPlayer.set(player.name, getInventoryCounts(player))
    }
  }
}

watch(
  scoreboard,
  (nextScoreboard) => {
    // LeagueBroadcast dispatches state updates before player events. Deferring this
    // keeps the map as the previous inventory while the related event is handled.
    window.setTimeout(() => refreshInventorySnapshot(nextScoreboard), 0)
  },
  { immediate: true },
)

function isAnnounceableBoughtItem(item: itemWithAsset): boolean {
  if (item.id === 0 || item.cost < minItemValue.value) return false
  if (item.slot < 0 || item.slot > 5) return false
  if (excludedBoughtItemNamePattern.value.test(item.displayName)) return false
  return true
}

function wasAlreadyInInventory(playerName: string, item: itemWithAsset): boolean {
  const previous = lastInventoryByPlayer.get(playerName)
  return (previous?.get(item.id) ?? 0) >= Math.max(item.count ?? 1, 1)
}

function wasRecentlyShown(playerName: string, item: itemWithAsset): boolean {
  const key = `${playerName}:${item.id}`
  const now = Date.now()
  const lastShownAt = recentItemNotifications.get(key) ?? 0
  if (now - lastShownAt < recentItemWindowMs.value) return true
  recentItemNotifications.set(key, now)
  return false
}

function selectBoughtItemsForPopup(event: playerUpdateEvent): itemWithAsset[] {
  const candidates = event.boughtItems?.filter(isAnnounceableBoughtItem) ?? []
  if (candidates.length === 0) return []

  const previous = lastInventoryByPlayer.get(event.playerNameAndTagLine)
  if (!previous && candidates.length > 1) return []

  const newItems = candidates.filter(
    (item) => !wasAlreadyInInventory(event.playerNameAndTagLine, item),
  )

  const selectedItems = newItems.length > 0 ? newItems : candidates.length === 1 ? candidates : []
  return selectedItems.filter((item) => !wasRecentlyShown(event.playerNameAndTagLine, item))
}

async function enqueueItemBuyNotification(
  item: itemWithAsset,
  playerIndex: number,
  team: 'Order' | 'Chaos',
) {
  const itemName = await getSpanishItemName(
    item,
    gameVersion.value,
    overlayConfig.value.dataDragon.itemLocale,
  )
  itemBuyQueue.enqueue({
    type: 'item-buy',
    playerIndex,
    team,
    itemIcon: client.getCacheUrl(item.assetUrl),
    itemName,
  })
}

const unsub = client.onIngameEvents({
  onPlayerEvent(event: playerUpdateEvent) {
    const pos = findPlayerPosition(event.playerNameAndTagLine)
    if (!pos) return

    // Queue level-up notifications
    if (event.levelUp) {
      levelUpQueue.enqueue({
        type: 'level-up',
        playerIndex: pos.playerIndex,
        team: pos.team,
        level: event.levelUp[1], // new level after the level-up
      })
    }

    // Queue item-buy notifications
    const boughtItems = selectBoughtItemsForPopup(event)
    for (const boughtItem of boughtItems) {
      void enqueueItemBuyNotification(boughtItem, pos.playerIndex, pos.team)
    }
  },
})

onUnmounted(() => {
  unsub()
})

function getSafeRegExp(pattern: string, flags?: string): RegExp {
  try {
    return new RegExp(pattern, flags)
  } catch {
    return /$^/
  }
}
</script>

<template>
  <Transition name="slide-down">
    <div id="player-scoreboard" v-if="scoreboard && tabs">
      <!-- <PlayerCamera show :team="Team.Order" :scoreboard="scoreboard"
                class="border rounded-t-sm border-r-0.5 border-b-0 border-white/55" /> -->
      <div class="player-grid">
        <div v-for="i in 5" :key="i" class="grid-item">
          <PlayerItems
            style="grid-area: order-items"
            :scoreboard-player="orderPlayers[i - 1]"
            :tab-player="findTabPlayer('Order', orderPlayers[i - 1], i - 1)"
            :grayscale="isPlayerDead(orderPlayers[i - 1], gameTime)"
          />
          <PlayerInfo
            style="grid-area: order-info"
            :scoreboard-player="orderPlayers[i - 1]"
            :tab-player="findTabPlayer('Order', orderPlayers[i - 1], i - 1)"
            :level-up-level="levelUpQueue.getActive('Order', i - 1)?.level"
            :level-up-visible="levelUpQueue.isVisible('Order', i - 1)"
            :level-up-exiting="levelUpQueue.isExiting('Order', i - 1)"
            :has-baron-buff="
              hasObjectiveBuff(
                'baron',
                orderPlayers[i - 1],
                findTabPlayer('Order', orderPlayers[i - 1], i - 1),
              )
            "
            :has-elder-buff="
              hasObjectiveBuff(
                'elder',
                orderPlayers[i - 1],
                findTabPlayer('Order', orderPlayers[i - 1], i - 1),
              )
            "
          />
          <GoldDiff
            style="grid-area: gold-diff"
            :order-gold="orderPlayers[i - 1]?.totalGold ?? 0"
            :chaos-gold="chaosPlayers[i - 1]?.totalGold ?? 0"
          />
          <PlayerInfo
            style="grid-area: chaos-info"
            :scoreboard-player="chaosPlayers[i - 1]"
            :tab-player="findTabPlayer('Chaos', chaosPlayers[i - 1], i - 1)"
            mirror
            :level-up-level="levelUpQueue.getActive('Chaos', i - 1)?.level"
            :level-up-visible="levelUpQueue.isVisible('Chaos', i - 1)"
            :level-up-exiting="levelUpQueue.isExiting('Chaos', i - 1)"
            :has-baron-buff="
              hasObjectiveBuff(
                'baron',
                chaosPlayers[i - 1],
                findTabPlayer('Chaos', chaosPlayers[i - 1], i - 1),
              )
            "
            :has-elder-buff="
              hasObjectiveBuff(
                'elder',
                chaosPlayers[i - 1],
                findTabPlayer('Chaos', chaosPlayers[i - 1], i - 1),
              )
            "
          />
          <PlayerItems
            style="grid-area: chaos-items"
            :scoreboard-player="chaosPlayers[i - 1]"
            :tab-player="findTabPlayer('Chaos', chaosPlayers[i - 1], i - 1)"
            mirror
            :grayscale="isPlayerDead(chaosPlayers[i - 1], gameTime)"
          />
          <!-- Single item-buy overlay per side, spanning both items+info columns -->
          <ItemBuyNotification
            v-if="itemBuyQueue.getActive('Order', i - 1)"
            :item-icon="itemBuyQueue.getActive('Order', i - 1)?.itemIcon"
            :item-name="itemBuyQueue.getActive('Order', i - 1)?.itemName"
            :visible="itemBuyQueue.isVisible('Order', i - 1)"
            :exiting="itemBuyQueue.isExiting('Order', i - 1)"
          />
          <ItemBuyNotification
            v-if="itemBuyQueue.getActive('Chaos', i - 1)"
            :item-icon="itemBuyQueue.getActive('Chaos', i - 1)?.itemIcon"
            :item-name="itemBuyQueue.getActive('Chaos', i - 1)?.itemName"
            :visible="itemBuyQueue.isVisible('Chaos', i - 1)"
            :exiting="itemBuyQueue.isExiting('Chaos', i - 1)"
            mirror
          />
        </div>
      </div>
      <!-- <PlayerCamera show :team="Team.Chaos" :scoreboard="scoreboard"
                class="border rounded-t-sm border-l-0.5 border-b-0 border-white/55" /> -->
    </div>
  </Transition>
</template>

<style lang="css" scoped>
#player-scoreboard {
  display: grid;
  /* grid-template-columns: 176px 1fr 176px; */
  grid-template-columns: 1fr;
  grid-template-rows: 1fr;
}

.player-grid {
  background-color: rgba(0, 0, 0, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-bottom: 0px;
  border-radius: 8px 8px 0 0;
  display: grid;
  grid-template-rows: repeat(5, minmax(0, 1fr));
  grid-template-columns: 1fr;
}

.player-grid .grid-item {
  border-bottom: 1px solid rgba(255, 255, 255, 0.55);
  overflow: hidden;
  min-height: 0;
  position: relative;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  grid-template-columns: 215px 250px 1fr 250px 215px;
  grid-template-areas: 'order-items order-info gold-diff chaos-info chaos-items';
}

.player-grid .grid-item:last-child {
  border-bottom: none;
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: transform 0.5s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(100%);
}
</style>
