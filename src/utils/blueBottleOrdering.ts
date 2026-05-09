import {
  TeamMemberRole,
  type damageGraphEntry,
  type ingameScoreboardBottomPlayerData,
  type teamMember,
  type teamWithMembers,
} from '@bluebottle_gg/league-broadcast-client'

interface LiveClientPlayerLike {
  championName?: string
  position?: string
  rawChampionName?: string
  riotId?: string
  riotIdGameName?: string
  summonerName?: string
  team?: string
}

type OrderedPlayer =
  | damageGraphEntry
  | ingameScoreboardBottomPlayerData
  | LiveClientPlayerLike

export function hasBlueBottlePlayerOrder(team?: teamWithMembers): boolean {
  return blueBottleMembers(team).length > 0
}

export function orderScoreboardPlayersByBlueBottle(
  players: ingameScoreboardBottomPlayerData[] | undefined,
  team?: teamWithMembers,
): ingameScoreboardBottomPlayerData[] {
  return orderByBlueBottleMembers(players ?? [], team, scoreboardPlayerKeys)
}

export function orderDamageEntriesByBlueBottle(
  entries: damageGraphEntry[] | undefined,
  team?: teamWithMembers,
): damageGraphEntry[] {
  return orderByBlueBottleMembers(entries ?? [], team, damageEntryKeys)
}

export function orderLiveClientPlayersByBlueBottle<T extends LiveClientPlayerLike>(
  players: T[] | undefined,
  team?: teamWithMembers,
): T[] {
  return orderByBlueBottleMembers(players ?? [], team, liveClientPlayerKeys)
}

function orderByBlueBottleMembers<T extends OrderedPlayer>(
  players: T[],
  team: teamWithMembers | undefined,
  getPlayerKeys: (player: T) => Array<string | undefined>,
): T[] {
  const members = blueBottleMembers(team)
  if (!players.length || !members.length) return [...players]

  const available = [...players]
  const ordered: T[] = []

  for (const member of members) {
    const matchIndex = available.findIndex((player) => matchesMember(member, getPlayerKeys(player)))
    if (matchIndex < 0) continue

    const [matched] = available.splice(matchIndex, 1)
    if (matched) ordered.push(matched)
  }

  return [...ordered, ...available]
}

function blueBottleMembers(team?: teamWithMembers): teamMember[] {
  return (team?.members ?? []).filter((member) => {
    const role = Number(member.role)
    return role === TeamMemberRole.Player || role === TeamMemberRole.Unknown
  })
}

function matchesMember(member: teamMember, playerKeys: Array<string | undefined>): boolean {
  const exactMemberKeys = memberExactKeys(member)
  const looseMemberKeys = memberLooseKeys(member)
  const exactPlayerKeys = playerKeys.map(normalizeExactKey).filter(Boolean)
  const loosePlayerKeys = playerKeys.map(normalizeLooseKey).filter(Boolean)

  return (
    exactMemberKeys.some((key) => exactPlayerKeys.includes(key)) ||
    looseMemberKeys.some((key) => loosePlayerKeys.includes(key))
  )
}

function memberExactKeys(member: teamMember): string[] {
  return [
    member.alias,
    member.displayName,
    member.tag ? `${member.alias}#${member.tag}` : undefined,
    member.tag && member.displayName ? `${member.displayName}#${member.tag}` : undefined,
  ]
    .map(normalizeExactKey)
    .filter(Boolean)
}

function memberLooseKeys(member: teamMember): string[] {
  return [
    member.alias,
    member.displayName,
    member.givenName,
    member.familyName,
    `${member.givenName ?? ''} ${member.familyName ?? ''}`,
  ]
    .map(normalizeLooseKey)
    .filter(Boolean)
}

function scoreboardPlayerKeys(player: ingameScoreboardBottomPlayerData): Array<string | undefined> {
  return [player.name, player.displayName]
}

function damageEntryKeys(entry: damageGraphEntry): Array<string | undefined> {
  return [entry.name, entry.displayName]
}

function liveClientPlayerKeys(player: LiveClientPlayerLike): Array<string | undefined> {
  return [player.riotId, player.riotIdGameName, player.summonerName]
}

function normalizeExactKey(value?: string): string {
  return normalizeKey(value)
}

function normalizeLooseKey(value?: string): string {
  return normalizeKey(value?.split('#')[0])
}

function normalizeKey(value?: string): string {
  return (
    value
      ?.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase() ?? ''
  )
}
