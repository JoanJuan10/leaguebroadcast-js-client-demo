<script setup lang="ts">
import { BestOfType, ingameScoreboardTeamData } from "@bluebottle_gg/league-broadcast-client";
import MatchScore from "./MatchScore.vue";
import { useClient } from "@/client";
import TextWithIcon from "./TextWithIcon.vue";
import Gold from "@/assets/gold.png";
import Tower from "@/assets/tower.png";
import { computed, ref, watch } from "vue";
import FadeTransition from "../../transitions/FadeTransition.vue";
import { handleImageError, handleImageLoad } from "@/utils/imageUtils";
import { useOverlayConfig } from "@/composables/useOverlayConfig";


const props = defineProps<{
    team: ingameScoreboardTeamData
    bestOf: BestOfType
    mirror?: boolean
    enemyTeamGold?: number
}>()

const client = useClient();
const { config: overlayConfig } = useOverlayConfig();

const formattedGold = computed(() => {
    const gold = props.team.gold;
    if (gold >= 1000) {
        return (gold / 1000).toFixed(1) + "K";
    }
    return gold.toString();
})

const goldDiff = computed(() => {
    if (props.enemyTeamGold === undefined) return null;
    const diff = props.team.gold - props.enemyTeamGold;
    return Math.floor(diff);
})

const goldDiffText = computed(() => {
    const diff = goldDiff.value;
    if (diff === null || diff <= 0) return "";
    const formattedDiff = diff >= 1000 ? (diff / 1000).toFixed(1) + "K" : diff.toString();
    return "+" + formattedDiff;
})

// Hysteresis: show above 500, hide below 300 - prevent flickering
const showGoldDiff = ref(false);

watch(goldDiff, (diff) => {
    if (diff === null || diff <= 0) {
        showGoldDiff.value = false;
    } else if (diff > overlayConfig.value.scoreboard.teamGoldDiffShowThreshold) {
        showGoldDiff.value = true;
    } else if (diff < overlayConfig.value.scoreboard.teamGoldDiffHideThreshold) {
        showGoldDiff.value = false;
    }
    // Between HIDE_THRESHOLD and SHOW_THRESHOLD: keep current state
}, { immediate: true })

</script>

<template>
    <div class="w-full h-full flex items-center py-1 px-1 gap-4" :class="mirror ? 'flex-row-reverse' : 'flex-row'">
        <MatchScore class="self-stretch" :best-of="bestOf"
            :fill-color="mirror ? 'var(--red-team-color)' : 'var(--blue-team-color)'" :wins="team.seriesScore.wins"
            :mirror="mirror" />
        <img v-if="team.teamIconUrl" :src="client.getCacheUrl(team.teamIconUrl)" alt="Team icon"
            class="max-h-4/5 w-auto " @error="handleImageError" @load="handleImageLoad" />
        <div class="flex flex-col" :style="{
            textAlign: mirror ? 'right' : 'left'
        }">
            <p class="font-extrabold text-xl" :style="{
                'color': mirror ? 'var(--red-team-color)' : 'var(--blue-team-color)'
            }">{{ team.teamTag }}</p>
            <p class="font-bold overflow-clip whitespace-nowrap text-ellipsis text-sm">{{ team.infoText }}</p>
        </div>
        <TextWithIcon class="-translate-y-1" :class="mirror ? ['pr-2'] : ['pl-2']" :icon-url="Tower"
            :text="team.towers.toString()" :mirror="mirror" />
        <div class="relative flex flex-col items-start">
            <TextWithIcon :class="mirror ? ['pr-2'] : ['pl-2']" :icon-url="Gold" :text="formattedGold"
                :mirror="mirror" />
            <FadeTransition name="fade" mode="out-in">
                <div id="gold-diff" v-if="showGoldDiff" class="absolute top-7 w-10 h-6 text-center" :style="{
                    'background-color': mirror ? 'var(--red-team-color)' : 'var(--blue-team-color)',
                    'left': mirror ? 'auto' : '40px',
                    color: 'white',
                }">
                    <span class="spcing text-stretch-vertical capitalize">{{
                        goldDiffText }}</span>
                </div>
            </FadeTransition>
        </div>
        <span class="text-3xl font-extrabold spcing tracking-tight text-stretch-vertical capitalize"
            :class="mirror ? 'mr-auto ml-2' : 'ml-auto mr-2 '">{{ team.kills
            }}</span>

    </div>
</template>

<style lang="css" scoped>
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
</style>
