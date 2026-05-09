<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  Team,
  type ingameObjectiveEvent,
  type ingameScoreboardTeamData,
} from '@bluebottle_gg/league-broadcast-client'
import { useClient } from '@/client'
import { useIngameSelector } from '@/composables/useIngame'
import { useOverlayConfig } from '@/composables/useOverlayConfig'
import AirDragon from '@/assets/dragon/air.png'
import ChemtechDragon from '@/assets/dragon/chemtech.png'
import EarthDragon from '@/assets/dragon/earth.png'
import ElderDragon from '@/assets/dragon/elder.png'
import FireDragon from '@/assets/dragon/fire.png'
import HextechDragon from '@/assets/dragon/hextech.png'
import WaterDragon from '@/assets/dragon/water.png'

type DragonType = 'air' | 'chemtech' | 'earth' | 'elder' | 'fire' | 'hextech' | 'water'
type AlertPhase = 'title' | 'effect'

interface DragonMeta {
  type: DragonType
  title: string
  effect: string
  soulTitle: string
  soulEffect: string
  icon: string
  accent: string
}

interface DragonVisualMeta {
  type: DragonType
  icon: string
  accent: string
}

interface DragonAlert {
  id: number
  meta: DragonMeta
  teamIndex?: number
  duplicateKey: string
  grantsSoul: boolean
}

const props = withDefaults(
  defineProps<{
    powerPlayRows?: number
  }>(),
  {
    powerPlayRows: 0,
  },
)

const dragonMeta: Record<DragonType, DragonVisualMeta> = {
  air: {
    type: 'air',
    icon: AirDragon,
    accent: '#b9e8f7',
  },
  chemtech: {
    type: 'chemtech',
    icon: ChemtechDragon,
    accent: '#b8f05a',
  },
  earth: {
    type: 'earth',
    icon: EarthDragon,
    accent: '#d7c28b',
  },
  elder: {
    type: 'elder',
    icon: ElderDragon,
    accent: '#dbe4f4',
  },
  fire: {
    type: 'fire',
    icon: FireDragon,
    accent: '#ff8657',
  },
  hextech: {
    type: 'hextech',
    icon: HextechDragon,
    accent: '#8de7ff',
  },
  water: {
    type: 'water',
    icon: WaterDragon,
    accent: '#81f0ca',
  },
}

let nextAlertId = 0

const client = useClient()
const scoreboard = useIngameSelector((state) => state.gameData.scoreboard)
const gameTeams = useIngameSelector((state) => state.gameData.teams)
const { config: overlayConfig } = useOverlayConfig()

const queue = ref<DragonAlert[]>([])
const activeAlert = ref<DragonAlert | null>(null)
const phase = ref<AlertPhase>('title')
const hasScoreboardBaseline = ref(false)
const recentAlerts = new Map<string, number>()
const timers: number[] = []

const activeStyle = computed(() => ({
  '--dragon-accent': activeAlert.value?.meta.accent ?? '#b9e8f7',
}))

const anchorStyle = computed(() => ({
  '--dragon-powerplay-offset': `${Math.max(0, props.powerPlayRows) * overlayConfig.value.dragonAlerts.powerPlayRowHeightPx}px`,
}))

function clearTimers() {
  while (timers.length > 0) {
    const timer = timers.pop()
    if (timer !== undefined) window.clearTimeout(timer)
  }
}

function normalizeDragonType(value?: string): DragonType | undefined {
  const normalized = value?.trim().toLowerCase().replace(/[\s_-]+/g, '') ?? ''

  if (!normalized) return undefined
  if (normalized.includes('elder')) return 'elder'
  if (normalized.includes('hextech')) return 'hextech'
  if (normalized.includes('chemtech')) return 'chemtech'
  if (normalized.includes('infernal') || normalized.includes('fire')) return 'fire'
  if (normalized.includes('mountain') || normalized.includes('earth')) return 'earth'
  if (normalized.includes('ocean') || normalized.includes('water')) return 'water'
  if (normalized.includes('cloud') || normalized.includes('air')) return 'air'

  return undefined
}

function teamIndexFromTeam(value?: number): number | undefined {
  const teamIdIndex = gameTeams.value?.findIndex((team) => team.teamId === value) ?? -1
  if (teamIdIndex === 0 || teamIdIndex === 1) return teamIdIndex

  if (value === Team.Order || value === 100 || value === 0) return 0
  if (value === Team.Chaos || value === 200) return 1

  return undefined
}

function isKillEvent(eventType: unknown): boolean {
  const value = String(eventType).toLowerCase()
  return value === 'kill' || value.includes('kill') || value === '1' || value === '10'
}

function dragonListFor(team?: ingameScoreboardTeamData): DragonType[] {
  return (team?.dragons ?? [])
    .map((dragon) => normalizeDragonType(dragon))
    .filter((dragon): dragon is DragonType => dragon !== undefined)
}

function countElementalDragons(dragons: DragonType[]) {
  return dragons.filter((dragon) => dragon !== 'elder').length
}

function getNewDragons(previous: DragonType[], current: DragonType[]): DragonType[] {
  const remainingPrevious = new Map<DragonType, number>()
  previous.forEach((dragon) => {
    remainingPrevious.set(dragon, (remainingPrevious.get(dragon) ?? 0) + 1)
  })

  return current.filter((dragon) => {
    const previousCount = remainingPrevious.get(dragon) ?? 0
    if (previousCount > 0) {
      remainingPrevious.set(dragon, previousCount - 1)
      return false
    }

    return true
  })
}

function alertTitle(alert: DragonAlert) {
  if (!alert.grantsSoul) return alert.meta.title

  const teamTag =
    alert.teamIndex === undefined ? undefined : scoreboard.value?.teams[alert.teamIndex]?.teamTag

  return teamTag ? `${alert.meta.soulTitle}` : `${alert.meta.soulTitle}`
}

function alertEffect(alert: DragonAlert) {
  return alert.grantsSoul ? alert.meta.soulEffect : alert.meta.effect
}

const activeTitle = computed(() => {
  const alert = activeAlert.value
  return alert ? alertTitle(alert) : ''
})

const activeEffect = computed(() => {
  const alert = activeAlert.value
  return alert ? alertEffect(alert) : ''
})

const effectClass = computed(() => ({
  'alert-effect--soul': Boolean(activeAlert.value?.grantsSoul),
  'alert-effect--long': activeEffect.value.length > 58,
  'alert-effect--very-long': activeEffect.value.length > 74,
}))

function startNextAlert() {
  if (activeAlert.value || queue.value.length === 0) return

  const nextAlert = queue.value[0]
  if (!nextAlert) return

  activeAlert.value = nextAlert
  queue.value = queue.value.slice(1)
  phase.value = 'title'

  timers.push(
    window.setTimeout(() => {
      phase.value = 'effect'
    }, overlayConfig.value.dragonAlerts.titleDurationMs),
  )

  timers.push(
    window.setTimeout(() => {
      activeAlert.value = null
      startNextAlert()
    }, overlayConfig.value.dragonAlerts.titleDurationMs + overlayConfig.value.dragonAlerts.effectDurationMs),
  )
}

function upgradeExistingSoulAlert(duplicateKey: string) {
  if (activeAlert.value?.duplicateKey === duplicateKey) {
    activeAlert.value = {
      ...activeAlert.value,
      grantsSoul: true,
    }
    return true
  }

  const queuedIndex = queue.value.findIndex((alert) => alert.duplicateKey === duplicateKey)
  if (queuedIndex < 0) return false

  queue.value = queue.value.map((alert, index) =>
    index === queuedIndex
      ? {
          ...alert,
          grantsSoul: true,
        }
      : alert,
  )
  return true
}

function pushDragonAlert(
  type: DragonType,
  teamIndex: number | undefined,
  grantsSoul: boolean,
  duplicateKey: string,
) {
  const textMeta = overlayConfig.value.text.dragons[type]

  queue.value = [
    ...queue.value,
    {
      id: nextAlertId++,
      meta: { ...dragonMeta[type], ...textMeta },
      teamIndex,
      duplicateKey,
      grantsSoul,
    },
  ]
  startNextAlert()
}

function enqueueDragonAlert(type: DragonType, teamIndex?: number, grantsSoul = false) {
  const duplicateKey = `${teamIndex ?? 'unknown'}:${type}`
  const now = Date.now()
  const previous = recentAlerts.get(duplicateKey) ?? 0
  if (now - previous < overlayConfig.value.dragonAlerts.duplicateWindowMs) {
    if (!grantsSoul) return

    if (upgradeExistingSoulAlert(duplicateKey)) return

    pushDragonAlert(type, teamIndex, true, duplicateKey)
    return
  }

  recentAlerts.set(duplicateKey, now)
  pushDragonAlert(type, teamIndex, grantsSoul, duplicateKey)
}

function handleObjectiveEvent(event: ingameObjectiveEvent) {
  if (!isKillEvent(event.eventType)) return

  const dragonType = normalizeDragonType(event.objective)
  if (!dragonType) return

  enqueueDragonAlert(dragonType, teamIndexFromTeam(event.team))
}

const unsubscribeEvents = client.onIngameEvents({
  onObjectiveEvent: handleObjectiveEvent,
})

watch(
  () => [
    dragonListFor(scoreboard.value?.teams[0]),
    dragonListFor(scoreboard.value?.teams[1]),
  ],
  (current, previous) => {
    if (!scoreboard.value) {
      hasScoreboardBaseline.value = false
      return
    }

    if (!hasScoreboardBaseline.value || !previous) {
      hasScoreboardBaseline.value = true
      return
    }

    current.forEach((dragons, teamIndex) => {
      const previousDragons = previous[teamIndex] ?? []
      let elementalCount = countElementalDragons(previousDragons)

      getNewDragons(previousDragons, dragons).forEach((dragon) => {
        if (dragon !== 'elder') elementalCount += 1

        enqueueDragonAlert(dragon, teamIndex, dragon !== 'elder' && elementalCount >= 4)
      })
    })
  },
  { immediate: true },
)

onUnmounted(() => {
  unsubscribeEvents()
  clearTimers()
})
</script>

<template>
  <div class="dragon-alert-anchor" :style="anchorStyle">
    <Transition name="dragon-alert">
      <div
        v-if="activeAlert"
        :key="activeAlert.id"
        class="dragon-alert"
        :class="{ 'dragon-alert--soul': activeAlert.grantsSoul }"
        :style="activeStyle"
      >
        <Transition name="dragon-alert-swap" mode="out-in">
          <div v-if="phase === 'title'" key="title" class="alert-content alert-content-title">
            <img :src="activeAlert.meta.icon" class="dragon-icon" alt="" />
            <span class="alert-title">{{ activeTitle }}</span>
            <img :src="activeAlert.meta.icon" class="dragon-icon" alt="" />
          </div>
          <div v-else key="effect" class="alert-content alert-content-effect">
            <img :src="activeAlert.meta.icon" class="dragon-icon dragon-icon-small" alt="" />
            <span class="alert-effect" :class="effectClass">{{ activeEffect }}</span>
          </div>
        </Transition>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.dragon-alert-anchor {
  position: absolute;
  top: calc(126px + var(--dragon-powerplay-offset, 0px));
  left: 50%;
  z-index: 4;
  width: 620px;
  height: 34px;
  transform: translateX(-50%);
  transition: top 0.22s ease;
  pointer-events: none;
}

.dragon-alert {
  width: 100%;
  height: 100%;
  border: 1px solid color-mix(in srgb, var(--dragon-accent) 70%, rgba(255, 255, 255, 0.5));
  background:
    linear-gradient(90deg, rgba(8, 13, 18, 0.1), rgba(8, 13, 18, 0.94) 13%, rgba(8, 13, 18, 0.94) 87%, rgba(8, 13, 18, 0.1)),
    linear-gradient(90deg, rgba(255, 255, 255, 0), color-mix(in srgb, var(--dragon-accent) 28%, transparent) 50%, rgba(255, 255, 255, 0));
  box-shadow:
    0 0 18px color-mix(in srgb, var(--dragon-accent) 36%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
  overflow: hidden;
}

.dragon-alert--soul {
  border-color: color-mix(in srgb, var(--dragon-accent) 72%, #f5d36a);
  box-shadow:
    0 0 22px color-mix(in srgb, var(--dragon-accent) 48%, transparent),
    0 0 12px rgba(245, 211, 106, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.58);
}

.alert-content {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #f5fbff;
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.95),
    0 0 10px color-mix(in srgb, var(--dragon-accent) 46%, transparent);
}

.alert-content-title {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 30px;
  line-height: 1;
  text-transform: uppercase;
}

.alert-content-effect {
  gap: 10px;
  padding: 0 18px;
  font-family: Inter, system-ui, sans-serif;
  font-size: 16px;
  font-weight: 800;
  line-height: 1;
}

.alert-title,
.alert-effect {
  overflow: hidden;
  white-space: nowrap;
}

.alert-title {
  text-overflow: ellipsis;
}

.alert-effect {
  flex: 0 1 auto;
  min-width: 0;
  letter-spacing: 0;
}

.alert-effect--soul {
  font-size: 14px;
}

.alert-effect--long {
  font-size: 12px;
}

.alert-effect--very-long {
  font-size: 11px;
}

.dragon-icon {
  width: 22px;
  height: 22px;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 6px var(--dragon-accent));
}

.dragon-icon-small {
  width: 18px;
  height: 18px;
}

.dragon-alert-enter-active,
.dragon-alert-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.dragon-alert-enter-from,
.dragon-alert-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.dragon-alert-swap-enter-active,
.dragon-alert-swap-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.dragon-alert-swap-enter-from {
  opacity: 0;
  transform: translateY(5px);
}

.dragon-alert-swap-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}
</style>
