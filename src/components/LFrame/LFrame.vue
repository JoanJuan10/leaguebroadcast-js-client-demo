<script setup lang="ts">
import { useIsInGame } from '@/composables/useIngame'
import { useClient } from '@/client'
import { useLFrameConfig, type LFrameBackgroundConfig } from '@/composables/useLFrameConfig'
import { getBluebottleLFrameBackground } from '@/utils/lFrameBackground'
import {
  analyzeLFrameContrast,
  DEFAULT_LFRAME_CONTRAST,
  type LFrameContrast,
  type LFrameContrastTone,
} from '@/utils/lFrameContrast'
import GameInfo from './GameInfo.vue'
import InhibitorTimers from './InhibitorTimers.vue'
import SponsorRotation from './SponsorRotation.vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import FadeTransition from '../../transitions/FadeTransition.vue'

const client = useClient()
const isInGame = useIsInGame()
const { config } = useLFrameConfig()
const bluebottleBackground = ref<LFrameBackgroundConfig | undefined>()
const backgroundContrast = ref<LFrameContrast>(DEFAULT_LFRAME_CONTRAST)
let backgroundRefreshTimer: number | undefined

const activeBackground = computed(() => bluebottleBackground.value ?? config.value.background)

function isAbsoluteUrl(url: string) {
  return /^(https?:|data:|blob:)/i.test(url)
}

function resolveBackgroundUrl(background: LFrameBackgroundConfig, preventCacheBust = true) {
  if (!background.src) return undefined
  if (isAbsoluteUrl(background.src)) {
    return background.src
  }

  if (background.src.startsWith('cache:')) {
    return client.getCacheUrl(background.src.slice('cache:'.length), preventCacheBust)
  }

  if (
    background.resolve === 'cache' ||
    background.src.startsWith('/cache/') ||
    background.src.startsWith('cache/')
  ) {
    return client.getCacheUrl(background.src, preventCacheBust)
  }

  return background.src
}

function resolveContrastAnalysisUrl(background: LFrameBackgroundConfig) {
  if (!background.src) return undefined
  if (background.src.startsWith('cache:')) {
    return `/bluebottle-cache/${background.src.slice('cache:'.length).replace(/^\/+/, '')}`
  }

  if (background.src.startsWith('/cache/')) {
    return `/bluebottle-cache/${background.src.slice('/cache/'.length)}`
  }

  if (background.src.startsWith('cache/')) {
    return `/bluebottle-cache/${background.src.slice('cache/'.length)}`
  }

  if (background.resolve === 'cache') {
    return `/bluebottle-cache/${background.src.replace(/^\/+/, '')}`
  }

  return resolveBackgroundUrl(background, false)
}

function toCssUrl(url: string) {
  return `url(${JSON.stringify(url)})`
}

function textColorFor(tone: LFrameContrastTone) {
  return tone === 'light' ? '#07111f' : '#ffffff'
}

function textShadowFor(tone: LFrameContrastTone) {
  return tone === 'light'
    ? '0 1px 1px rgba(255,255,255,0.65), 0 0 3px rgba(255,255,255,0.55)'
    : '0 1px 2px rgba(0,0,0,0.92), 0 0 4px rgba(0,0,0,0.8)'
}

function mediaFilterFor(tone: LFrameContrastTone) {
  return tone === 'light'
    ? 'drop-shadow(0 0 1px rgba(0,0,0,0.95)) drop-shadow(0 0 4px rgba(0,0,0,0.72))'
    : 'drop-shadow(0 1px 2px rgba(0,0,0,0.9)) drop-shadow(0 0 4px rgba(0,0,0,0.65))'
}

const lFrameStyle = computed(() => {
  const background = activeBackground.value
  const resolvedUrl = resolveBackgroundUrl(background)
  let backgroundValue = '#000000'

  if (background.type === 'image' && resolvedUrl) {
    const fallbackColor = background.value ? ` ${background.value}` : ''
    backgroundValue = `${toCssUrl(resolvedUrl)} ${background.position ?? 'center'} / ${background.fit ?? 'cover'} ${background.repeat ?? 'no-repeat'}${fallbackColor}`
  } else if (background.type === 'gradient' || background.type === 'css') {
    backgroundValue = background.value || '#000000'
  } else {
    backgroundValue = background.value || '#000000'
  }

  return {
    '--lframe-background': backgroundValue,
    '--lframe-header-text-color': textColorFor(backgroundContrast.value.header),
    '--lframe-header-text-shadow': textShadowFor(backgroundContrast.value.header),
    '--lframe-header-media-filter': mediaFilterFor(backgroundContrast.value.header),
    '--lframe-footer-text-color': textColorFor(backgroundContrast.value.footer),
    '--lframe-footer-text-shadow': textShadowFor(backgroundContrast.value.footer),
    '--lframe-footer-media-filter': mediaFilterFor(backgroundContrast.value.footer),
  }
})

async function refreshBluebottleBackground() {
  try {
    bluebottleBackground.value = await getBluebottleLFrameBackground(client)
  } catch {
    bluebottleBackground.value = undefined
  }
}

onMounted(() => {
  void refreshBluebottleBackground()
  backgroundRefreshTimer = window.setInterval(refreshBluebottleBackground, 30000)
})

onUnmounted(() => {
  if (backgroundRefreshTimer !== undefined) {
    clearInterval(backgroundRefreshTimer)
  }
})

watch(
  activeBackground,
  async (background) => {
    try {
      backgroundContrast.value = await analyzeLFrameContrast(
        background,
        resolveContrastAnalysisUrl(background),
      )
    } catch {
      backgroundContrast.value = DEFAULT_LFRAME_CONTRAST
    }
  },
  { immediate: true },
)
</script>

<template>
  <FadeTransition>
    <div v-if="isInGame" class="lframe-container" :style="lFrameStyle">
      <div class="lframe-background" aria-hidden="true"></div>
      <div class="lframe-header">
        <GameInfo />
      </div>
      <div id="champion-info-cutout">
        <InhibitorTimers />
      </div>
      <div class="lframe-footer">
        <SponsorRotation />
      </div>
    </div>
  </FadeTransition>
</template>

<style lang="css" scoped>
.lframe-container {
  display: grid;
  grid-template-rows: 38px 1fr 114px;
  grid-template-columns: 1fr;
  position: relative;
  --lframe-background: #000000;
  --lframe-header-text-color: #ffffff;
  --lframe-header-text-shadow: 0 1px 2px rgba(0, 0, 0, 0.92);
  --lframe-header-media-filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.9));
  --lframe-footer-text-color: #ffffff;
  --lframe-footer-text-shadow: 0 1px 2px rgba(0, 0, 0, 0.92);
  --lframe-footer-media-filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.9));
}

.lframe-header,
.lframe-footer {
  position: relative;
  z-index: var(--overlay-z-lframe-shell, 130);
}

#champion-info-cutout {
  position: relative;
  z-index: var(--overlay-z-inhibitors, 90);
  min-height: 0;
}

.lframe-background {
  position: absolute;
  inset: 0;
  z-index: var(--overlay-z-lframe-shell, 130);
  pointer-events: none;
  background: var(--lframe-background);
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 285 260'%3E%3Cpath fill='white' fill-rule='evenodd' d='M0 0H285V38H0ZM0 146H285V260H0ZM0 38H285V146H0ZM8.55 38L256.5 38L270.75 50.96V77.96H262.2V99.56H270.75V146H8.55Z'/%3E%3C/svg%3E")
    center / 100% 100% no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 285 260'%3E%3Cpath fill='white' fill-rule='evenodd' d='M0 0H285V38H0ZM0 146H285V260H0ZM0 38H285V146H0ZM8.55 38L256.5 38L270.75 50.96V77.96H262.2V99.56H270.75V146H8.55Z'/%3E%3C/svg%3E")
    center / 100% 100% no-repeat;
}
</style>
