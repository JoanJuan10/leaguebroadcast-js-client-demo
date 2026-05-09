<script setup lang="ts">
import { useClient } from '@/client'
import { useIngameSelector } from '@/composables/useIngame'
import { getLFrameBranding } from '@/utils/lFrameBranding'
import { handleImageError, handleImageLoad } from '@/utils/imageUtils'
import BBLogo from '@/assets/blue_bottle-logo-color-bright_outline.svg'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import FadeTransition from '../../transitions/FadeTransition.vue'
import { useOverlayConfig } from '@/composables/useOverlayConfig'

const client = useClient()
const patch = useIngameSelector((s) => s.gameData.patch)
const { config: overlayConfig } = useOverlayConfig()
const tournamentName = ref(overlayConfig.value.text.gameInfo.tournamentFallback)
const tournamentIconUri = ref<string | null>(null)
const allInfo = computed(() => [
  tournamentName.value,
  `${overlayConfig.value.text.gameInfo.patchPrefix} ${patch.value}`,
])

const currentInfoIndex = ref(0)
const currentInfo = computed(() => allInfo.value[currentInfoIndex.value] ?? '')
const rotationTimer = ref<number | null>(null)

onMounted(async () => {
  const branding = await getLFrameBranding(client)
  tournamentName.value = branding.tournamentName || overlayConfig.value.text.gameInfo.tournamentFallback
  tournamentIconUri.value = branding.tournamentIconUri ?? null

  rotationTimer.value = setInterval(() => {
    currentInfoIndex.value = (currentInfoIndex.value + 1) % allInfo.value.length
  }, overlayConfig.value.lFrame.gameInfoRotationMs)
})

onUnmounted(() => {
  if (rotationTimer.value !== null) {
    clearInterval(rotationTimer.value)
  }
})
</script>

<template>
  <div class="flex flex-row justify-between items-center pl-2 pr-10 py-1 w-full h-full">
    <img
      v-if="tournamentIconUri"
      class="tournament-icon"
      :src="client.getCacheUrl(tournamentIconUri, true)"
      alt="Tournament icon"
      @error="handleImageError"
      @load="handleImageLoad"
    />
    <BBLogo v-else class="brand-logo h-8" />
    <div class="info-text-slot">
      <FadeTransition mode="out-in">
        <span :key="currentInfoIndex" class="patch-text">{{ currentInfo }}</span>
      </FadeTransition>
    </div>
  </div>
</template>

<style lang="css" scoped>
.tournament-icon {
  width: 30px;
  height: 30px;
  object-fit: contain;
  filter: var(--lframe-header-media-filter, none);
}

.brand-logo {
  filter: var(--lframe-header-media-filter, none);
}

.info-text-slot {
  display: grid;
  justify-items: end;
  align-items: center;
  overflow: hidden;
}

.patch-text {
  grid-area: 1 / 1;
  color: var(--lframe-header-text-color, white);
  font-size: 24px;
  line-height: 1;
  font-family: 'Bebas Neue', sans-serif;
  font-weight: bold;
  text-shadow: var(--lframe-header-text-shadow, 0 1px 2px rgba(0, 0, 0, 0.92));
  white-space: nowrap;
}
</style>
