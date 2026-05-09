<script setup lang="ts">
import { useClient } from '@/client';
import { handleImageError, handleImageLoad } from '@/utils/imageUtils';
import {
    getConfiguredPlayerCameraSource,
    type PlayerCameraSource,
    type PlayerCameraSourceResolver,
    type PlayerCameraSourceType,
    usePlayerCameraConfig,
} from '@/composables/usePlayerCameraConfig';
import { ingameDamageGraphData, ingameScoreboardBottomData, type teamMember, type Team, isPlayerDead, getRemaining } from '@bluebottle_gg/league-broadcast-client';
import { computed, onUnmounted, ref, watch } from 'vue';
import { useIngameSelector } from '@/composables/useIngame';

const props = defineProps<{
    show: boolean
    side: 'left' | 'right'
    team: Team
    scoreboard?: ingameScoreboardBottomData
    teamfight?: ingameDamageGraphData
}>()

const client = useClient();
const { config } = usePlayerCameraConfig();
const gameTime = useIngameSelector((s) => s.gameData.gameTime);
const playersOnTeam = ref<teamMember[]>([]);

//rotate through players in x seconds intervals.
const currentPlayerIndex = ref(0);
let intervalId: number | null = null;
let playerLoadPromise: Promise<void> | null = null;
let rotationRequestId = 0;

type ResolvedPlayerCameraSource = PlayerCameraSource & {
    src: string
    type: PlayerCameraSourceType
    poster?: string
}

const cameraMode = computed(() => config.value.mode === 'static' ? 'static' : 'player');
const currentPlayer = computed(() => playersOnTeam.value[currentPlayerIndex.value]);

const configuredPlayerSource = computed(() =>
    getConfiguredPlayerCameraSource(config.value.players, currentPlayer.value),
);

const fallbackPlayerSource = computed<PlayerCameraSource | undefined>(() => {
    const player = currentPlayer.value;
    if (!player?.iconUri) return undefined;

    return {
        label: player.alias,
        src: player.iconUri,
        type: 'image',
        resolve: 'cache',
        fit: 'cover',
    };
});

const activeSource = computed<PlayerCameraSource | undefined>(() => {
    if (cameraMode.value === 'static') {
        return config.value.static[props.side];
    }

    return configuredPlayerSource.value ?? fallbackPlayerSource.value;
});

const displaySource = computed<ResolvedPlayerCameraSource | undefined>(() => {
    const source = activeSource.value;
    if (!source?.src) return undefined;

    const src = resolveAssetUrl(source.src, source.resolve);
    if (!src) return undefined;

    return {
        ...source,
        src,
        type: inferSourceType(source),
        poster: resolveAssetUrl(source.poster, source.resolve),
    };
});

const displayLabel = computed(() => {
    if (activeSource.value?.label) return activeSource.value.label;

    const player = currentPlayer.value;
    return player?.displayName ?? player?.alias ?? '';
});

const isCurrentPlayerDead = computed(() => {
    const player = currentPlayer.value;
    if (!player) return false;

    // We match by name and tag line rather than index because streamer mode players
    // aren't included in the player list from the client but are in the overlay data.
    const playerName = `${player.alias}#${player.tag}`;

    // Prefer scoreboard data when available.
    const scoreboardTeam = props.scoreboard?.teams[props.team - 1];
    if (scoreboardTeam) {
        const playerInfo = scoreboardTeam.players.find(p => p.name === playerName);
        return isPlayerDead(playerInfo, gameTime.value);
    }

    // Fall back to teamfight data.
    const teamfightEntry = props.teamfight?.damageDealt.find(
        e => e.team === props.team && e.name === playerName
    );
    return getRemaining(teamfightEntry?.respawnAt, gameTime.value) > 0;
})

const mediaStyle = computed(() => ({
    filter: cameraMode.value === 'player' && config.value.showDeadState && isCurrentPlayerDead.value
        ? 'grayscale(1)'
        : 'grayscale(0)',
    objectFit: displaySource.value?.fit ?? 'cover',
    transition: 'filter 0.5s ease',
}));

function resolveAssetUrl(src: string | undefined, resolver: PlayerCameraSourceResolver | undefined) {
    if (!src) return undefined;
    if (src.startsWith('cache:')) {
        return client.getCacheUrl(src.slice('cache:'.length));
    }

    if (resolver === 'cache') {
        return client.getCacheUrl(src);
    }

    return src;
}

function inferSourceType(source: PlayerCameraSource): PlayerCameraSourceType {
    if (source.type) return source.type;

    const path = source.src?.split('?')[0]?.toLowerCase() ?? '';
    if (/\.(mp4|webm|ogg)$/.test(path)) return 'video';
    return 'image';
}

function getSourceForPlayer(player: teamMember): ResolvedPlayerCameraSource | undefined {
    const source = getConfiguredPlayerCameraSource(config.value.players, player) ?? (
        player.iconUri
            ? {
                label: player.alias,
                src: player.iconUri,
                type: 'image',
                resolve: 'cache',
                fit: 'cover',
            } satisfies PlayerCameraSource
            : undefined
    );

    if (!source?.src) return undefined;

    const src = resolveAssetUrl(source.src, source.resolve);
    if (!src) return undefined;

    return {
        ...source,
        src,
        type: inferSourceType(source),
        poster: resolveAssetUrl(source.poster, source.resolve),
    };
}

function preloadImage(src: string): Promise<void> {
    return new Promise<void>((resolve) => {
        const img = new Image();
        img.src = src;
        img.onload = () => resolve();
        img.onerror = () => resolve();
    });
}

async function preloadPlayerImages() {
    const preloadPromises = playersOnTeam.value
        .map(getSourceForPlayer)
        .filter((source): source is ResolvedPlayerCameraSource => source?.type === 'image')
        .map((source) => preloadImage(source.src));

    await Promise.all(preloadPromises);
}

async function loadPlayersOnTeam() {
    if (playerLoadPromise) return playerLoadPromise;

    playerLoadPromise = (async () => {
        try {
            const game = await client.api.game.getCurrentGame();
            if (!game) {
                playerLoadPromise = null;
                return;
            }

            const playersInGame = await client.api.game.getPlayersInGame(game.gameId);
            playersOnTeam.value = playersInGame[props.team] ?? [];
            if (currentPlayerIndex.value >= playersOnTeam.value.length) {
                currentPlayerIndex.value = 0;
            }
        } catch {
            playerLoadPromise = null;
            // Ignore. The overlay should degrade to an empty slot if REST is unavailable.
        }
    })();

    return playerLoadPromise;
}

function stopRotation() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
}

function startRotation() {
    stopRotation();
    if (playersOnTeam.value.length <= 1) return;

    intervalId = window.setInterval(() => {
        if (playersOnTeam.value.length === 0) {
            currentPlayerIndex.value = 0;
            return;
        }

        currentPlayerIndex.value = (currentPlayerIndex.value + 1) % playersOnTeam.value.length;
    }, config.value.rotationMs);
}

watch(
    () => [props.show, props.team, config.value.mode, config.value.rotationMs, config.value.players] as const,
    async () => {
        const requestId = ++rotationRequestId;
        stopRotation();

        if (!props.show || cameraMode.value !== 'player') return;

        await loadPlayersOnTeam();
        if (requestId !== rotationRequestId) return;

        await preloadPlayerImages();
        if (requestId !== rotationRequestId) return;

        startRotation();
    },
    { immediate: true },
);

watch(
    () => props.team,
    () => {
        playerLoadPromise = null;
        playersOnTeam.value = [];
        currentPlayerIndex.value = 0;
    },
);

watch(
    () => playersOnTeam.value.length,
    () => {
        if (currentPlayerIndex.value >= playersOnTeam.value.length) {
            currentPlayerIndex.value = 0;
        }
    },
);

onUnmounted(() => {
    stopRotation();
})
</script>

<template>
    <div v-if="show" id="player-scoreboard-camera" class="bg-black/55 flex flex-col">
        <div class="relative flex-1 grow overflow-hidden">
            <img v-if="displaySource?.type === 'image'" :style="mediaStyle" :src="displaySource.src" alt="Player media"
                class="camera-media object-top rounded-t" @error="handleImageError" @load="handleImageLoad" />
            <video v-else-if="displaySource?.type === 'video'" :style="mediaStyle" :src="displaySource.src"
                :poster="displaySource.poster" :autoplay="displaySource.autoplay ?? true"
                :muted="displaySource.muted ?? true" :loop="displaySource.loop ?? true" playsinline
                class="camera-media object-top rounded-t"></video>
            <iframe v-else-if="displaySource?.type === 'iframe'" :src="displaySource.src"
                class="camera-media rounded-t" allow="autoplay; fullscreen; picture-in-picture"></iframe>
            <div v-else class="w-full h-full flex items-center justify-center bg-black">
            </div>
        </div>
        <span class="player-name">{{ displayLabel }}</span>
    </div>
</template>

<style lang="css" scoped>
.camera-media {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: 0;
    object-position: top;
}

.player-name {
    display: flex;
    align-items: center;
    justify-content: center;
    justify-self: center;
    height: 40px;
    width: 100%;
    background-color: rgba(0, 0, 0, 1);
    color: white;
    font-size: 22px;
    line-height: 22px;
    text-align: center;
    font-weight: bolder;
    font-family: "Bebas Neue", sans-serif;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
</style>
