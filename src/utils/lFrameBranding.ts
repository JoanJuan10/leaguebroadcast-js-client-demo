import type { LeagueBroadcastClient } from '@bluebottle_gg/league-broadcast-client'

export interface LFrameBranding {
  tournamentName: string
  tournamentIconUri?: string
  lFrameIconUris: string[]
}

interface SeasonLike {
  seasonName?: string | null
  iconUri?: string | null
}

interface RecentAssetsResponse {
  assets?: unknown
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function normalizeAssetPath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path
}

function normalizePathPart(value: string): string {
  return value.trim().toLowerCase().replace(/\\/g, '/')
}

async function getJson<T>(client: LeagueBroadcastClient, path: string): Promise<T> {
  const apiUrl = client.getApiUrl().replace(/\/$/, '')
  const cleanPath = path.replace(/^\//, '')
  const response = await fetch(`${apiUrl}/${cleanPath}`)

  if (!response.ok) {
    throw new Error(`LeagueBroadcast request failed: ${path}`)
  }

  return (await response.json()) as T
}

async function getLFrameIcons(
  client: LeagueBroadcastClient,
  tournamentName: string,
): Promise<string[]> {
  try {
    const icons = await getJson<unknown>(client, 'lframe/icons')

    if (isStringArray(icons) && icons.length > 0) {
      return icons.map(normalizeAssetPath)
    }
  } catch {
    // Fall through to the recent-assets fallback.
  }

  try {
    const recentAssets = await getJson<RecentAssetsResponse>(client, 'display/assets/recent')
    if (!isStringArray(recentAssets.assets)) return []

    const tournamentPathPart = `/cache/style/lframe/${normalizePathPart(tournamentName)}/`

    return recentAssets.assets
      .filter((asset) => normalizePathPart(asset).includes(tournamentPathPart))
      .map(normalizeAssetPath)
  } catch {
    return []
  }
}

export async function getLFrameBranding(client: LeagueBroadcastClient): Promise<LFrameBranding> {
  const season = (await client.api.season.getCurrentSeason()) as SeasonLike
  const tournamentName = season.seasonName || 'League Broadcast'
  const tournamentIconUri =
    season.iconUri ?? (await client.api.season.getCurrentSeasonIcon().catch(() => undefined))

  return {
    tournamentName,
    tournamentIconUri: tournamentIconUri || undefined,
    lFrameIconUris: await getLFrameIcons(client, tournamentName),
  }
}
