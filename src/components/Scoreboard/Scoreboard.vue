<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useIngameSelector } from '@/composables/useIngame'
import TeamRow from './TeamRow.vue'
import TeamObjectiveRow from './TeamObjectiveRow.vue'
import DragonTakeAlert from './DragonTakeAlert.vue'
import {
  GameState,
  type ingameObjectivePowerPlay,
  type ingameScoreboardBottomPlayerData,
} from '@bluebottle_gg/league-broadcast-client'
import { useClient } from '@/client'
import { handleImageError, handleImageLoad } from '@/utils/imageUtils'
import PowerPlayBadge from './PowerPlayBadge.vue'
import { orderScoreboardPlayersByBlueBottle } from '@/utils/blueBottleOrdering'
import { isPlayerRoleQuestComplete } from '@/utils/roleQuest'
import { useOverlayConfig } from '@/composables/useOverlayConfig'

const scoreboard = useIngameSelector((s) => s.gameData.scoreboard)
const players = useIngameSelector((s) => s.gameData.scoreboardBottom)
const gameTeams = useIngameSelector((s) => s.gameData.teams)
const isMocking = useIngameSelector((s) => (s.gameState as number) === GameState.Mocking)
const client = useClient()
const { config: overlayConfig } = useOverlayConfig()

const seasonIcon = ref<string | null>(null)

const blue = computed(() => scoreboard.value?.teams[0])
const red = computed(() => scoreboard.value?.teams[1])

const bluePlayers = computed(() =>
  orderScoreboardPlayersByBlueBottle(players.value?.teams[0]?.players, gameTeams.value?.[0]),
)
const redPlayers = computed(() =>
  orderScoreboardPlayersByBlueBottle(players.value?.teams[1]?.players, gameTeams.value?.[1]),
)

const currentGameTime = computed(() => scoreboard.value?.gameTime ?? 0)
const roleQuestsCompletedAt = ref<number | null>(null)
const roleQuestHideDelaySeconds = computed(
  () => overlayConfig.value.scoreboard.roleQuestHideDelaySeconds,
)
const roleQuestPlayersPerTeam = computed(() => overlayConfig.value.scoreboard.roleQuestPlayersPerTeam)

function teamHasCompleteRoleQuests(players: ingameScoreboardBottomPlayerData[]) {
  if (players.length < roleQuestPlayersPerTeam.value) return false

  return players
    .slice(0, roleQuestPlayersPerTeam.value)
    .every((player, roleIndex) => isPlayerRoleQuestComplete(player, roleIndex, isMocking.value))
}

const allRoleQuestsComplete = computed(
  () => teamHasCompleteRoleQuests(bluePlayers.value) && teamHasCompleteRoleQuests(redPlayers.value),
)

watch(
  [allRoleQuestsComplete, currentGameTime],
  ([allComplete, time]) => {
    if (!allComplete) {
      roleQuestsCompletedAt.value = null
      return
    }

    if (roleQuestsCompletedAt.value === null || time < roleQuestsCompletedAt.value) {
      roleQuestsCompletedAt.value = time
    }
  },
  { immediate: true },
)

const showRoleQuests = computed(() => {
  const completedAt = roleQuestsCompletedAt.value

  return completedAt === null || currentGameTime.value < completedAt + roleQuestHideDelaySeconds.value
})

const gameTime = computed(() => {
  if (!scoreboard.value) return '00:00'
  const minutes = Math.floor(currentGameTime.value / 60)
  const seconds = Math.floor(currentGameTime.value % 60)
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
})

function isPowerPlayActive(
  powerPlay?: ingameObjectivePowerPlay,
): powerPlay is ingameObjectivePowerPlay {
  return Boolean(
    powerPlay &&
    powerPlay.timeStart <= currentGameTime.value &&
    powerPlay.timeEnd > currentGameTime.value,
  )
}

function teamPowerPlays(team: typeof blue.value) {
  const entries: { type: 'baron' | 'elder'; powerPlay: ingameObjectivePowerPlay }[] = []
  if (isPowerPlayActive(team?.baronPowerPlay)) {
    entries.push({ type: 'baron', powerPlay: team.baronPowerPlay })
  }
  if (isPowerPlayActive(team?.dragonPowerPlay)) {
    entries.push({ type: 'elder', powerPlay: team.dragonPowerPlay })
  }
  return entries
}

const bluePowerPlays = computed(() => teamPowerPlays(blue.value))
const redPowerPlays = computed(() => teamPowerPlays(red.value))
const powerPlayRowCount = computed(() =>
  Math.max(bluePowerPlays.value.length, redPowerPlays.value.length),
)

onMounted(async () => {
  seasonIcon.value = await client.api.season.getCurrentSeasonIcon()
})
const dateTimeNowString = new Date().toISOString()
</script>

<template>
  <Transition name="scoreboard" :duration="{ enter: 850, leave: 750 }">
    <div v-if="scoreboard && blue && red" class="scoreboard">
      <div class="row-clip">
        <div class="top-row">
          <TeamRow
            style="grid-column: 1"
            :team="blue"
            :best-of="scoreboard.bestOf"
            :enemy-team-gold="red.gold"
          />
          <!-- TODO: remove temporary cache busting -->
          <img
            v-if="seasonIcon"
            :src="client.getCacheUrl(seasonIcon, true) + `?ts=${dateTimeNowString}`"
            class="center-logo"
            @error="handleImageError"
            @load="handleImageLoad"
          />
          <TeamRow
            style="grid-column: 3"
            :team="red"
            :best-of="scoreboard.bestOf"
            :enemy-team-gold="blue.gold"
            mirror
          />
        </div>
      </div>
      <div class="row-clip">
        <div class="bottom-row">
          <TeamObjectiveRow
            :team="blue"
            :players="bluePlayers"
            :is-mocking="isMocking"
            :show-role-quests="showRoleQuests"
          />
          <p class="game-time text-stretch-vertical">{{ gameTime }}</p>
          <TeamObjectiveRow
            :team="red"
            :players="redPlayers"
            mirror
            :is-mocking="isMocking"
            :show-role-quests="showRoleQuests"
          />
        </div>
      </div>
      <div class="powerplay-layer">
        <TransitionGroup
          name="powerplay-slide"
          tag="div"
          class="powerplay-stack powerplay-stack-blue"
        >
          <PowerPlayBadge
            v-for="entry in bluePowerPlays"
            :key="entry.type"
            :type="entry.type"
            :power-play="entry.powerPlay"
            :game-time="currentGameTime"
          />
        </TransitionGroup>
        <TransitionGroup
          name="powerplay-slide"
          tag="div"
          class="powerplay-stack powerplay-stack-red"
        >
          <PowerPlayBadge
            v-for="entry in redPowerPlays"
            :key="entry.type"
            :type="entry.type"
            :power-play="entry.powerPlay"
            :game-time="currentGameTime"
            mirror
          />
        </TransitionGroup>
      </div>
      <DragonTakeAlert :power-play-rows="powerPlayRowCount" />
    </div>
  </Transition>
</template>

<style scoped>
.scoreboard {
  width: 800px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
}

.row-clip {
  overflow: hidden;
}

/* Enter: top row first, bottom row waits for top to finish */
.scoreboard-enter-active .top-row {
  animation: row-slide-in 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
}

.scoreboard-enter-active .bottom-row {
  animation: row-slide-in 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.4s both;
}

/* Exit: bottom row first, top row waits for bottom to finish */
.scoreboard-leave-active .top-row {
  animation: row-slide-out 0.35s cubic-bezier(0.55, 0, 0.75, 0.06) 0.35s both;
}

.scoreboard-leave-active .bottom-row {
  animation: row-slide-out 0.35s cubic-bezier(0.55, 0, 0.75, 0.06) both;
}

@keyframes row-slide-in {
  from {
    transform: translateY(-100%);
  }

  to {
    transform: translateY(0);
  }
}

@keyframes row-slide-out {
  from {
    transform: translateY(0);
  }

  to {
    transform: translateY(-100%);
  }
}

.top-row {
  height: 80px;
  background-color: rgba(0, 0, 0, 0.9);
  border-radius: 8px;
  border: 1px solid #ffffff55;
  box-sizing: border-box;
  overflow: hidden;
  display: grid;
  grid-template-columns: 1fr 40px 1fr;
  grid-template-rows: 80px;
}

.team-row {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 12px;
  color: #fff;
}

.team-row.team-blue {
  background-color: rgba(37, 99, 235, 0.8);
  grid-column: 1;
}

.team-row.team-red {
  background-color: rgba(220, 38, 38, 0.8);
  grid-column: 3;
}

.center-logo {
  width: 32px;
  height: 32px;
  justify-self: center;
  align-self: center;
  grid-column: 2;
}

.bottom-row {
  height: 40px;
  background-color: rgba(0, 0, 0, 0.4);
  border-radius: 8px;
  display: grid;
  box-sizing: border-box;
  overflow: hidden;
  display: grid;
  grid-template-columns: 1fr 40px 1fr;
  grid-template-rows: 40px;
}

.game-time {
  margin: 0;
  line-height: 1;
  color: #fff;
  font-size: 24px;
  font-weight: bold;
  justify-self: center;
  align-self: center;
  letter-spacing: var(--tracking-tight);
}

.text-stretch-vertical {
  font-family: 'Bebas Neue';
  display: inline-block;
  -webkit-transform: scale(1, 1.5);
  /* Safari and Chrome */
  -moz-transform: scale(1, 1.5);
  /* Firefox */
  -ms-transform: scale(1, 1.5);
  /* IE 9 */
  -o-transform: scale(1, 1.5);
  /* Opera */
  transform: scale(1, 1.5);
  /* Standard syntax */
}

.powerplay-layer {
  position: absolute;
  top: 128px;
  left: 0;
  right: 0;
  pointer-events: none;
  display: grid;
  grid-template-columns: 1fr 40px 1fr;
}

.powerplay-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.powerplay-stack-blue {
  grid-column: 1;
  align-items: flex-start;
}

.powerplay-stack-red {
  grid-column: 3;
  align-items: flex-end;
}

.powerplay-slide-enter-active,
.powerplay-slide-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.powerplay-slide-enter-from,
.powerplay-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
