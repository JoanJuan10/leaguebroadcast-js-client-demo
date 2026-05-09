<script setup lang="ts">
import type { ingameObjectivePowerPlay } from '@bluebottle_gg/league-broadcast-client'
import { computed } from 'vue'
import BaronIcon from '@/assets/baron/baron.png'
import ElderIcon from '@/assets/dragon/elder.png'
import GoldIcon from '@/assets/gold.png'

const props = defineProps<{
  type: 'baron' | 'elder'
  powerPlay: ingameObjectivePowerPlay
  gameTime: number
  mirror?: boolean
}>()

const remainingSeconds = computed(() =>
  Math.max(0, Math.ceil(props.powerPlay.timeEnd - props.gameTime)),
)

const remainingText = computed(() => {
  const minutes = Math.floor(remainingSeconds.value / 60)
  const seconds = remainingSeconds.value % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
})

const goldText = computed(() => {
  const gold = Math.round(props.powerPlay.gold)
  const sign = gold > 0 ? '+' : gold < 0 ? '-' : ''
  const absGold = Math.abs(gold)
  const formatted = absGold >= 1000 ? `${(absGold / 1000).toFixed(1)}K` : absGold.toString()
  return `${sign}${formatted}`
})

const goldState = computed(() => (props.powerPlay.gold < 0 ? 'negative' : 'positive'))
const icon = computed(() => (props.type === 'baron' ? BaronIcon : ElderIcon))
</script>

<template>
  <div class="powerplay-badge" :class="[type, { mirror }]">
    <img :src="icon" class="objective-icon" alt="" />
    <span class="timer-text">{{ remainingText }}</span>
    <span class="gold-wrap" :class="goldState">
      <img :src="GoldIcon" class="gold-icon" alt="" />
      <span>{{ goldText }}</span>
    </span>
  </div>
</template>

<style scoped>
.powerplay-badge {
  width: 230px;
  height: 26px;
  display: grid;
  grid-template-columns: 24px 62px 96px;
  align-items: center;
  column-gap: 14px;
  padding: 2px 8px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 4px;
  color: white;
  font-family: 'Bebas Neue', sans-serif;
  line-height: 1;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
}

.powerplay-badge.baron {
  background: linear-gradient(90deg, rgba(89, 31, 132, 0.86), rgba(20, 10, 30, 0.72));
}

.powerplay-badge.elder {
  background: linear-gradient(90deg, rgba(214, 218, 232, 0.76), rgba(28, 31, 42, 0.72));
}

.objective-icon {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.timer-text {
  justify-self: center;
  font-size: 22px;
  letter-spacing: 0;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

.gold-wrap {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  font-size: 17px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

.gold-wrap.positive {
  color: #f6c84f;
}

.gold-wrap.negative {
  color: #ff5757;
}

.gold-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.gold-wrap.positive .gold-icon {
  filter: sepia(1) saturate(5) hue-rotate(355deg) brightness(1.2);
}

.gold-wrap.negative .gold-icon {
  filter: saturate(5) hue-rotate(320deg) brightness(1.1);
}
</style>
