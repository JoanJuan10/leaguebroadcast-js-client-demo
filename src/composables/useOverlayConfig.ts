import { readonly, ref, type Ref } from 'vue'

export type SideInfoKind = 'gold' | 'experience' | 'damage' | 'creepScore' | 'roleQuest' | 'towerPlates'
export type DragonType = 'air' | 'chemtech' | 'earth' | 'elder' | 'fire' | 'hextech' | 'water'

export interface OverlayConfig {
  language: string
  dataDragon: {
    itemLocale: string
  }
  text: {
    gameInfo: {
      tournamentFallback: string
      patchPrefix: string
    }
    sideInfo: Record<SideInfoKind, string>
    damageGraph: {
      title: string
      legendPhysical: string
      legendMagic: string
      legendTrue: string
      legendAriaLabel: string
    }
    goldGraph: {
      title: string
    }
    inhibitors: {
      title: string
      top: string
      mid: string
      bot: string
    }
    levelUp: {
      label: string
    }
    smiteReaction: {
      title: string
      early: string
      perfect: string
      great: string
      average: string
      slow: string
      secured: string
      missed: string
      poweredBy: string
    }
    dragons: Record<
      DragonType,
      {
        title: string
        effect: string
        soulTitle: string
        soulEffect: string
      }
    >
  }
  scoreboard: {
    roleQuestHideDelaySeconds: number
    roleQuestPlayersPerTeam: number
    matchScoreRequiredWins: Record<string, number>
    teamGoldDiffShowThreshold: number
    teamGoldDiffHideThreshold: number
  }
  playerScoreboard: {
    levelUpNotificationMs: number
    itemBuyNotificationMs: number
    itemBuyMinItemValue: number
    recentItemNotificationWindowMs: number
    excludedBoughtItemNamePattern: string
    championStacks: {
      enabled: boolean
      minValue: number
      compactThreshold: number
    }
  }
  dragonAlerts: {
    titleDurationMs: number
    effectDurationMs: number
    duplicateWindowMs: number
    powerPlayRowHeightPx: number
  }
  lFrame: {
    gameInfoRotationMs: number
    sponsorRotationMs: number
  }
  killFeed: {
    maxEntries: number
    displayDurationMs: number
    staggerStepMs: number
    batchResetMs: number
  }
  smiteReaction: {
    perfectThresholdSeconds: number
    greatThresholdSeconds: number
    averageThresholdSeconds: number
  }
  teamfight: {
    importantItemIds: readonly number[]
    excludedItemIds: readonly number[]
    itemPriority: Record<string, number>
    importantItemNamePattern: string
  }
}

export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = {
  language: 'es-ES',
  dataDragon: {
    itemLocale: 'es_ES',
  },
  text: {
    gameInfo: {
      tournamentFallback: 'League Broadcast',
      patchPrefix: 'PARCHE',
    },
    sideInfo: {
      gold: 'Oro Total',
      experience: 'EXP + Nivel',
      damage: 'Daño Infligido',
      creepScore: 'CS Total',
      roleQuest: 'Misiones de Rol',
      towerPlates: 'Placas de Torreta',
    },
    damageGraph: {
      title: 'Daño Total',
      legendPhysical: 'Físico',
      legendMagic: 'Mágico',
      legendTrue: 'Verdadero',
      legendAriaLabel: 'Leyenda de tipos de daño',
    },
    goldGraph: {
      title: 'Gráfica de Oro',
    },
    inhibitors: {
      title: 'INHIBIDORES',
      top: 'TOP',
      mid: 'MID',
      bot: 'BOT',
    },
    levelUp: {
      label: 'NIVEL',
    },
    smiteReaction: {
      title: 'SMITE REACTION',
      early: 'EARLY',
      perfect: 'PERFECT',
      great: 'GREAT',
      average: 'AVERAGE',
      slow: 'SLOW',
      secured: 'SECURED',
      missed: 'MISSED',
      poweredBy: 'POWERED BY',
    },
    dragons: {
      air: {
        title: 'Dragón de Nube',
        effect: 'Resistencia a ralentizaciones y velocidad fuera de combate',
        soulTitle: 'Alma de Nube',
        soulEffect: 'Velocidad adicional, aumentada tras lanzar la definitiva',
      },
      chemtech: {
        title: 'Dragón Tecnoquímico',
        effect: 'Tenacidad y poder de curaciones y escudos',
        soulTitle: 'Alma Tecnoquímica',
        soulEffect: 'Con poca vida, aumenta el daño y reduce el daño recibido',
      },
      earth: {
        title: 'Dragón de Montaña',
        effect: 'Armadura y resistencia mágica adicional',
        soulTitle: 'Alma de Montaña',
        soulEffect: 'Otorga un escudo tras unos segundos sin recibir daño',
      },
      elder: {
        title: 'Dragón Anciano',
        effect: 'Quema enemigos y ejecuta campeones con poca vida',
        soulTitle: 'Dragón Anciano',
        soulEffect: 'Quema enemigos y ejecuta campeones con poca vida',
      },
      fire: {
        title: 'Dragón Infernal',
        effect: 'Daño de ataque y poder de habilidad adicional',
        soulTitle: 'Alma Infernal',
        soulEffect: 'Ataques y habilidades provocan explosiones de daño en área',
      },
      hextech: {
        title: 'Dragón Hextech',
        effect: 'Aceleración de habilidad y velocidad de ataque',
        soulTitle: 'Alma Hextech',
        soulEffect: 'Ataques y habilidades encadenan rayos que ralentizan',
      },
      water: {
        title: 'Dragón de Océano',
        effect: 'Restaura vida faltante con el paso del tiempo',
        soulTitle: 'Alma de Océano',
        soulEffect: 'Dañar enemigos restaura vida y maná durante unos segundos',
      },
    },
  },
  scoreboard: {
    roleQuestHideDelaySeconds: 30,
    roleQuestPlayersPerTeam: 5,
    matchScoreRequiredWins: {
      '1': 1,
      '2': 2,
      '3': 2,
      '5': 3,
      '7': 4,
    },
    teamGoldDiffShowThreshold: 500,
    teamGoldDiffHideThreshold: 300,
  },
  playerScoreboard: {
    levelUpNotificationMs: 2000,
    itemBuyNotificationMs: 4000,
    itemBuyMinItemValue: 1800,
    recentItemNotificationWindowMs: 12000,
    excludedBoughtItemNamePattern: '\\b(recall|ward|quest)\\b',
    championStacks: {
      enabled: true,
      minValue: 1,
      compactThreshold: 1000,
    },
  },
  dragonAlerts: {
    titleDurationMs: 2600,
    effectDurationMs: 4400,
    duplicateWindowMs: 9000,
    powerPlayRowHeightPx: 30,
  },
  lFrame: {
    gameInfoRotationMs: 15000,
    sponsorRotationMs: 15000,
  },
  killFeed: {
    maxEntries: 5,
    displayDurationMs: 6000,
    staggerStepMs: 100,
    batchResetMs: 150,
  },
  smiteReaction: {
    perfectThresholdSeconds: 0.05,
    greatThresholdSeconds: 0.15,
    averageThresholdSeconds: 0.4,
  },
  teamfight: {
    importantItemIds: [
      2065, 2420, 3026, 3053, 3074, 3107, 3139, 3140, 3142, 3143, 3152, 3157, 3190,
      3222, 3748, 3814, 6631, 6698,
    ],
    excludedItemIds: [
      2003, 2010, 2031, 2033, 2055, 2138, 2139, 2140, 3109, 3330, 3340, 3363, 3364,
      3865, 3866, 3867, 3868, 3869, 3870, 3871, 3872, 3873, 3874, 3875, 3876, 3877,
      4643,
    ],
    itemPriority: {
      '3157': 0,
      '2420': 0,
      '3026': 1,
      '3139': 2,
      '3140': 2,
      '3190': 3,
      '3107': 4,
      '3222': 4,
      '2065': 5,
      '3193': 6,
      '3142': 7,
      '3152': 7,
      '3143': 8,
      '3074': 9,
      '3077': 9,
      '3748': 9,
      '3814': 9,
      '3053': 9,
      '6631': 9,
      '6698': 9,
    },
    importantItemNamePattern:
      '\\b(angel de la guarda|guardian angel|zhonya|reloj de arena|brazalete de la buscadora|seeker|redencion|redemption|solari|mikael|shurelya|qss|fajin|quicksilver|cimitarra|mercurial|youmuu|randuin|sterak|filo de la noche|edge of night|rocketbelt|protobelt|protocinturon|cintomisil|hidra (voraz|titanica|profana)|ravenous hydra|titanic hydra|profane hydra|stridebreaker|cortasendas)\\b',
  },
}

const config = ref<OverlayConfig>(DEFAULT_OVERLAY_CONFIG)
const loaded = ref(false)
const loadError = ref<unknown>(null)
let loadPromise: Promise<void> | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeConfig<T>(defaults: T, override: unknown): T {
  if (!isRecord(defaults) || !isRecord(override)) return override === undefined ? defaults : (override as T)

  const merged: Record<string, unknown> = { ...defaults }
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue
    const defaultValue = (defaults as Record<string, unknown>)[key]
    merged[key] = isRecord(defaultValue) && isRecord(value) ? mergeConfig(defaultValue, value) : value
  }

  return merged as T
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function normalizeConfig(value: unknown): OverlayConfig {
  const merged = mergeConfig(DEFAULT_OVERLAY_CONFIG, isRecord(value) ? value : {})

  return {
    ...merged,
    scoreboard: {
      ...merged.scoreboard,
      roleQuestHideDelaySeconds: normalizePositiveNumber(
        merged.scoreboard.roleQuestHideDelaySeconds,
        DEFAULT_OVERLAY_CONFIG.scoreboard.roleQuestHideDelaySeconds,
      ),
      roleQuestPlayersPerTeam: Math.max(
        1,
        normalizePositiveNumber(
          merged.scoreboard.roleQuestPlayersPerTeam,
          DEFAULT_OVERLAY_CONFIG.scoreboard.roleQuestPlayersPerTeam,
        ),
      ),
    },
    playerScoreboard: {
      ...merged.playerScoreboard,
      levelUpNotificationMs: normalizePositiveNumber(
        merged.playerScoreboard.levelUpNotificationMs,
        DEFAULT_OVERLAY_CONFIG.playerScoreboard.levelUpNotificationMs,
      ),
      itemBuyNotificationMs: normalizePositiveNumber(
        merged.playerScoreboard.itemBuyNotificationMs,
        DEFAULT_OVERLAY_CONFIG.playerScoreboard.itemBuyNotificationMs,
      ),
      itemBuyMinItemValue: normalizePositiveNumber(
        merged.playerScoreboard.itemBuyMinItemValue,
        DEFAULT_OVERLAY_CONFIG.playerScoreboard.itemBuyMinItemValue,
      ),
      recentItemNotificationWindowMs: normalizePositiveNumber(
        merged.playerScoreboard.recentItemNotificationWindowMs,
        DEFAULT_OVERLAY_CONFIG.playerScoreboard.recentItemNotificationWindowMs,
      ),
    },
  }
}

async function loadOverlayConfig() {
  try {
    const response = await fetch('/overlay.json', { cache: 'no-store' })
    if (!response.ok) {
      config.value = DEFAULT_OVERLAY_CONFIG
      return
    }

    config.value = normalizeConfig(await response.json())
  } catch (error) {
    loadError.value = error
    config.value = DEFAULT_OVERLAY_CONFIG
  } finally {
    loaded.value = true
  }
}

function ensureLoaded() {
  if (!loadPromise) {
    loadPromise = loadOverlayConfig()
  }
}

export function useOverlayConfig(): {
  config: Readonly<Ref<OverlayConfig>>
  loaded: Readonly<Ref<boolean>>
  loadError: Readonly<Ref<unknown>>
} {
  ensureLoaded()

  return {
    config: readonly(config),
    loaded: readonly(loaded),
    loadError: readonly(loadError),
  }
}
