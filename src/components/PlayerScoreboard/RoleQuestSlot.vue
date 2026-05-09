<script setup lang="ts">
import { useClient } from '@/client'
import type { itemWithAsset } from '@bluebottle_gg/league-broadcast-client'
import { computed } from 'vue'
import ItemWithCooldown from './ItemWithCooldown.vue'
import { handleImageError, handleImageLoad } from '@/utils/imageUtils'
import {
  getRoleQuestProgressPercent,
  isRoleQuestItem,
  isTopTeleportComplete as isTopTeleportCompleteItem,
} from '@/utils/roleQuest'

const props = defineProps<{ mirror?: boolean; item?: itemWithAsset; progressColor?: string }>()
defineOptions({ inheritAttrs: false })
const client = useClient()

const progressPercent = computed(() => {
  return getRoleQuestProgressPercent(props.item)
})

// Using pathLength="100" on the rect normalizes the path to work with percentages
const strokeDashoffset = computed(() => {
  // At 0% progress, offset = 100 (nothing visible)
  // At 100% progress, offset = 0 (full border visible)
  return 100 - progressPercent.value
})

//A list of all item ids available at: https://darkintaqt.com/blog/item-ids
const isQuestItem = computed(() => {
  return isRoleQuestItem(props.item)
})

const isTopTeleportComplete = computed(() => {
  return isTopTeleportCompleteItem(props.item)
})
</script>

<template>
  <div v-if="isQuestItem">
    <!-- Show teleport as a spell, not an item -->
    <ItemWithCooldown v-if="isTopTeleportComplete" :item="item" />
    <div :class="[$attrs.class ?? 'w-8', 'relative']" v-else>
      <svg
        class="absolute inset-0 pointer-events-none"
        width="100%"
        height="100%"
        style="overflow: visible"
      >
        <!-- Progress border rectangle -->
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="none"
          :stroke="props.progressColor ?? '#fff'"
          :stroke-width="2"
          pathLength="100"
          stroke-dasharray="100"
          :stroke-dashoffset="strokeDashoffset"
          style="transition: stroke-dashoffset 0.3s ease"
          v-if="progressPercent < 100"
        />
      </svg>
      <div class="w-full h-full relative">
        <img
          class="absolute inset-0 w-full h-full"
          :src="client.getCacheUrl(item?.assetUrl)"
          @error="handleImageError"
          @load="handleImageLoad"
        />
      </div>
    </div>
  </div>

  <ItemWithCooldown v-else :class="$attrs.class" :item="item" />
</template>
