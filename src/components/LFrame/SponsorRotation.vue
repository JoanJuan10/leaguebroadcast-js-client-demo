<script setup lang="ts">
import { useClient } from '@/client'
import { getLFrameBranding } from '@/utils/lFrameBranding'
import { handleImageError, handleImageLoad } from '@/utils/imageUtils'
import lbLogo from '@/assets/leaguebroadcast-logo_text-color-bright_outline.png'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import FadeTransition from '../../transitions/FadeTransition.vue'
import { useOverlayConfig } from '@/composables/useOverlayConfig'

const client = useClient()
const { config: overlayConfig } = useOverlayConfig()
const logoUris = ref<string[]>([])
const currentLogoIndex = ref(0)
const rotationTimer = ref<number | null>(null)

const currentLogoUri = computed(() => logoUris.value[currentLogoIndex.value])

onMounted(async () => {
  const branding = await getLFrameBranding(client)
  logoUris.value = branding.lFrameIconUris.length
    ? branding.lFrameIconUris
    : branding.tournamentIconUri
      ? [branding.tournamentIconUri]
      : []

  if (logoUris.value.length > 1) {
    rotationTimer.value = window.setInterval(() => {
      currentLogoIndex.value = (currentLogoIndex.value + 1) % logoUris.value.length
    }, overlayConfig.value.lFrame.sponsorRotationMs)
  }
})

onUnmounted(() => {
  if (rotationTimer.value !== null) {
    clearInterval(rotationTimer.value)
  }
})
</script>

<template>
  <div class="flex justify-center items-center w-full h-full">
    <FadeTransition mode="out-in">
      <img
        v-if="currentLogoUri"
        :key="currentLogoUri"
        :src="client.getCacheUrl(currentLogoUri, true)"
        class="sponsor-logo"
        alt="L-frame logo"
        @error="handleImageError"
        @load="handleImageLoad"
      />
      <img v-else :src="lbLogo" class="sponsor-logo" alt="League Broadcast" />
    </FadeTransition>
  </div>
</template>

<style lang="css" scoped>
.sponsor-logo {
  max-width: 100%;
  max-height: 100%;
  filter: var(--lframe-footer-media-filter, none);
  object-fit: contain;
}
</style>
