import {
  getRoleQuest,
  type ingameScoreboardBottomPlayerData,
  type itemWithAsset,
} from '@bluebottle_gg/league-broadcast-client'

const COMPLETE_TOP_TELEPORT_ID = 1220
const ROLE_QUEST_REWARD_IDS = new Set([1205, 1206, 1207, 1208, 1209, 1220, 1221])
const BOT_ROLE_INDEX = 3
const BOOT_NAME_PATTERN = /\b(boots?|shoes|greaves|treads|swiftmarch|steelcaps|footwear)\b/i

export function isRoleQuestReward(item?: itemWithAsset): boolean {
  if (!item) return false

  return ROLE_QUEST_REWARD_IDS.has(item.id) || /\bquest reward\b/i.test(item.displayName)
}

export function isRoleQuestItem(item?: itemWithAsset): boolean {
  if (!item) return false

  return (item.id >= 1090 && item.id <= 1095) || (item.id >= 1200 && item.id <= 1250)
}

export function isTopTeleportComplete(item?: itemWithAsset): boolean {
  return item?.id === COMPLETE_TOP_TELEPORT_ID
}

export function isBotQuestBootReward(item?: itemWithAsset, roleIndex?: number): boolean {
  if (!item || roleIndex !== BOT_ROLE_INDEX) return false

  return item.slot === 8 && BOOT_NAME_PATTERN.test(item.displayName)
}

export function getRoleQuestProgressPercent(item?: itemWithAsset): number {
  if (isRoleQuestReward(item)) return 100
  if (!item?.stats || item.stats.length < 2) return 0

  const current = item.stats[0] ?? 0
  const max = item.stats[1] ?? 0
  if (max <= 0) return 0

  const value = Math.min(100, Math.max(0, (current / max) * 100))

  return value < 10 ? 0 : value
}

export function isRoleQuestComplete(item?: itemWithAsset, roleIndex?: number): boolean {
  return (
    isRoleQuestReward(item) ||
    isBotQuestBootReward(item, roleIndex) ||
    getRoleQuestProgressPercent(item) >= 100
  )
}

export function isPlayerRoleQuestComplete(
  player: ingameScoreboardBottomPlayerData,
  roleIndex: number,
  isMocking?: boolean,
): boolean {
  if (isMocking) {
    return Boolean(player.respawnAt)
  }

  return isRoleQuestComplete(getRoleQuest(player), roleIndex)
}
