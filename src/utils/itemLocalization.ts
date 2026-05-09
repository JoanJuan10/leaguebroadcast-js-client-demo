import type { itemWithAsset } from '@bluebottle_gg/league-broadcast-client'

const itemNameCache = new Map<string, Promise<Map<number, string>>>()

interface DataDragonItemFile {
  data: Record<string, { name?: string }>
}

function toDataDragonVersion(gameVersion?: string): string | undefined {
  const parts = gameVersion?.split('.')
  if (!parts || parts.length < 2) return undefined

  return `${parts[0]}.${parts[1]}.1`
}

async function fetchItemNames(version: string, locale: string): Promise<Map<number, string>> {
  const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/${locale}/item.json`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to load Data Dragon item names for ${version}`)

  const data = (await response.json()) as DataDragonItemFile
  return new Map(Object.entries(data.data).map(([id, item]) => [Number(id), item.name ?? '']))
}

async function getItemNames(version: string, locale: string): Promise<Map<number, string>> {
  const cacheKey = `${version}:${locale}`
  if (!itemNameCache.has(cacheKey)) {
    itemNameCache.set(cacheKey, fetchItemNames(version, locale))
  }

  return itemNameCache.get(cacheKey)!
}

export async function getSpanishItemName(
  item: itemWithAsset,
  gameVersion?: string,
  locale = 'es_ES',
): Promise<string> {
  const version = toDataDragonVersion(gameVersion)
  if (!version) return item.displayName

  try {
    const itemNames = await getItemNames(version, locale)
    return itemNames.get(item.id) || item.displayName
  } catch {
    return item.displayName
  }
}
