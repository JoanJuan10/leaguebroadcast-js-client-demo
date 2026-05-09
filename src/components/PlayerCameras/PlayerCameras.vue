<script setup lang="ts">
import { useIngameSelector } from '@/composables/useIngame';
import { usePlayerCameraConfig } from '@/composables/usePlayerCameraConfig';
import { Team } from '@bluebottle_gg/league-broadcast-client';
import { computed } from 'vue';
import PlayerCamera from './PlayerCamera.vue';

const scoreboard = useIngameSelector((s) => s.gameData.scoreboardBottom);
const teamfight = useIngameSelector((s) => s.gameData.teamfightDamageOverview);
const { camerasEnabled } = usePlayerCameraConfig();

const showCameras = computed(() => camerasEnabled.value && Boolean(scoreboard.value || teamfight.value));
</script>


<template>
    <Transition name="slide-down">

        <div v-if="showCameras" class="camera-container">
            <PlayerCamera show side="left" :team="Team.Order" :scoreboard="scoreboard" :teamfight="teamfight"
                class="border rounded-t-sm border-r-0.5 border-b-0 border-white/55" />
            <div></div>
            <PlayerCamera show side="right" :team="Team.Chaos" :scoreboard="scoreboard" :teamfight="teamfight"
                class="border rounded-t-sm border-r-0.5 border-b-0 border-white/55" />
        </div>
    </Transition>
</template>



<style lang="css" scoped>
.camera-container {
    display: grid;
    grid-template-columns: var(--player-camera-width, 178px) 1fr var(--player-camera-width, 178px);
    grid-template-rows: 1fr;
}

.slide-down-enter-active,
.slide-down-leave-active {
    transition: transform 0.5s ease
}

.slide-down-enter-from,
.slide-down-leave-to {
    transform: translateY(100%);
}
</style>
