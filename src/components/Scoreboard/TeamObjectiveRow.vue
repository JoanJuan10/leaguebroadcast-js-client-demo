<script setup lang="ts">
import {
  type ingameScoreboardTeamData,
  type ingameScoreboardBottomPlayerData,
} from '@bluebottle_gg/league-broadcast-client'
import { computed } from 'vue'
import TopIcon from '@/assets/lane/top-placeholder-cropped.svg'
import JungleIcon from '@/assets/lane/jgl-placeholder-cropped.svg'
import MidIcon from '@/assets/lane/mid-placeholder-cropped.svg'
import BotIcon from '@/assets/lane/bot-placeholder-cropped.svg'
import SupportIcon from '@/assets/lane/sup-placeholder-cropped.svg'
import TextWithIcon from './TextWithIcon.vue'
import Grubs from '@/assets/grubs.png'
import Fire from '@/assets/dragon/fire.png'
import Air from '@/assets/dragon/air.png'
import Chemtech from '@/assets/dragon/chemtech.png'
import Hextech from '@/assets/dragon/hextech.png'
import Earth from '@/assets/dragon/earth.png'
import Water from '@/assets/dragon/water.png'
import { handleImageError, handleImageLoad } from '@/utils/imageUtils'
import { isPlayerRoleQuestComplete } from '@/utils/roleQuest'

const props = defineProps<{
  team: ingameScoreboardTeamData
  players: ingameScoreboardBottomPlayerData[]
  mirror?: boolean
  isMocking?: boolean
  showRoleQuests?: boolean
}>()

function playerHasQuestComplete(player: ingameScoreboardBottomPlayerData, roleIndex: number) {
  return isPlayerRoleQuestComplete(player, roleIndex, props.isMocking)
}

const roleIcons = [TopIcon, JungleIcon, MidIcon, BotIcon, SupportIcon]
const questSlots = computed(() =>
  roleIcons.map((_, i) => {
    const player = props.players[i]
    const complete = player ? playerHasQuestComplete(player, i) : false

    return {
      index: i,
      complete,
      animationIndex: props.mirror ? roleIcons.length - 1 - i : i,
    }
  }),
)

const visibleQuestSlots = computed(() => (props.showRoleQuests === false ? [] : questSlots.value))

function isElderDragon(dragonType: string) {
  return ['elder', 'elderdragon', 'elder dragon', 'elder-dragon', 'elder_dragon'].includes(
    dragonType.trim().toLowerCase(),
  )
}

const elementalDragons = computed(() => props.team.dragons.filter((dragon) => !isElderDragon(dragon)))

function getDragonIcon(dragonType: string) {
  switch (dragonType.toLowerCase()) {
    case 'fire':
      return Fire
    case 'air':
      return Air
    case 'chemtech':
      return Chemtech
    case 'hextech':
      return Hextech
    case 'earth':
      return Earth
    case 'water':
      return Water
    default:
      return undefined
  }
}
</script>

<template>
  <div class="flex items-center h-full" :class="mirror ? 'flex-row-reverse' : 'flex-row'">
    <TransitionGroup
      name="stagger-fade"
      tag="div"
      appear
      class="flex flex-row h-full items-center gap-2 w-43"
      :class="mirror ? 'justify-end' : 'justify-start'"
      id="quest-container"
      :style="{
        'padding-left': mirror ? 'auto' : '8px',
        'padding-right': mirror ? '8px' : 'auto',
      }"
    >
      <div
        v-for="slot in visibleQuestSlots"
        :key="slot.index"
        class="flex items-center justify-center gap-1 rounded-full p-1 w-6 h-6 border"
        :style="{
          borderColor: slot.complete
            ? mirror
              ? 'var(--red-team-color)'
              : 'var(--blue-team-color)'
            : '#ffffff55',
          backgroundColor: slot.complete
            ? `color-mix(in srgb, ${mirror ? 'var(--red-team-color)' : 'var(--blue-team-color)'} 10%, transparent)`
            : '#00000066',
          color: slot.complete
            ? mirror
              ? 'var(--red-team-color)'
              : 'var(--blue-team-color)'
            : '#ffffff',
          '--i': slot.animationIndex,
        }"
      >
        <component :is="roleIcons[slot.index]" class="w-4 h-4" />
      </div>
    </TransitionGroup>

    <TextWithIcon
      class="h-6"
      :icon-url="Grubs"
      :text="props.team.grubs.toString()"
      :mirror="mirror"
      :class="mirror ? ['pr-2'] : ['pl-2']"
    />

    <TransitionGroup
      name="stagger-fade"
      tag="div"
      appear
      class="flex flex-row justify-start h-full grow items-center gap-2 mx-4"
      :class="mirror ? 'flex-row' : 'flex-row-reverse'"
    >
      <img
        v-for="(dragon, i) in elementalDragons"
        :key="i"
        :src="getDragonIcon(dragon)"
        alt="Dragon icon"
        class="h-5 w-auto"
        @error="handleImageError"
        @load="handleImageLoad"
      />
    </TransitionGroup>
  </div>
</template>

<style lang="css" scoped>
.stagger-fade-enter-active,
.stagger-fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.stagger-fade-enter-active {
  transition-delay: calc(700ms + var(--i) * 120ms);
}

.stagger-fade-enter-from,
.stagger-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
