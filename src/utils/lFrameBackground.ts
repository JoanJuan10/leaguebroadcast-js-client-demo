import type { LeagueBroadcastClient } from '@bluebottle_gg/league-broadcast-client'
import type { LFrameBackgroundConfig } from '@/composables/useLFrameConfig'

const INGAME_STYLE_PHASE = 'ingame'
const L_FRAME_VARIANT = 'L-Frame'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function parseNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function shouldResolveAsCachePath(source: string) {
  const normalized = source.toLowerCase()
  return (
    normalized.startsWith('/cache/') ||
    normalized.startsWith('cache/') ||
    normalized.startsWith('style/')
  )
}

function parseBluebottleImage(image: unknown) {
  if (!isRecord(image)) return undefined

  const source = parseString(image.source)
  if (!source) return undefined

  return {
    source,
    fit: parseString(image.fit),
    position: parseString(image.position),
    repeat: parseString(image.repeat),
  }
}

function formatGradientStop(stop: unknown) {
  if (!isRecord(stop)) return undefined

  const color = parseString(stop.color)
  if (!color) return undefined

  const position = parseNumber(stop.position)
  if (position === undefined) return color

  const pct = position >= 0 && position <= 1 ? position * 100 : position
  return `${color} ${pct}%`
}

function parseBluebottleGradient(gradient: unknown) {
  if (!isRecord(gradient)) return undefined

  const stops = Array.isArray(gradient.stops)
    ? gradient.stops.map(formatGradientStop).filter((stop): stop is string => Boolean(stop))
    : []

  if (!stops.length) return undefined

  const type = parseNumber(gradient.type) ?? 0
  if (type === 1) {
    return `radial-gradient(circle, ${stops.join(', ')})`
  }

  const angle = parseNumber(gradient.angle) ?? 180
  return `linear-gradient(${angle}deg, ${stops.join(', ')})`
}

function parseBluebottleColorStyle(value: unknown): LFrameBackgroundConfig | undefined {
  const directValue = parseString(value)
  if (directValue) {
    return {
      type: 'css',
      value: directValue,
    }
  }

  if (!isRecord(value)) return undefined

  const image = parseBluebottleImage(value.image)
  const color = parseString(value.color)

  if (image) {
    return {
      type: 'image',
      src: image.source,
      resolve: shouldResolveAsCachePath(image.source) ? 'cache' : undefined,
      value: color,
      fit: image.fit ?? 'cover',
      position: image.position ?? 'center',
      repeat: image.repeat ?? 'no-repeat',
    }
  }

  const gradient = parseBluebottleGradient(value.gradient)
  if (gradient) {
    return {
      type: 'gradient',
      value: gradient,
    }
  }

  if (color) {
    return {
      type: 'color',
      value: color,
    }
  }

  return undefined
}

function getLFrameStyleBackground(value: unknown): LFrameBackgroundConfig | undefined {
  if (!isRecord(value)) return undefined

  return (
    parseBluebottleColorStyle(value.color) ??
    parseBluebottleColorStyle(value.background) ??
    parseBluebottleColorStyle(value.backgroundColor)
  )
}

export async function getBluebottleLFrameBackground(
  client: LeagueBroadcastClient,
): Promise<LFrameBackgroundConfig | undefined> {
  const http = client.api.getHttpClient()
  const activeSet = parseString(await http.get<unknown>(`style/set/${INGAME_STYLE_PHASE}/active`))

  if (!activeSet) return undefined

  const variant = await http.get<unknown>(
    `style/set/${INGAME_STYLE_PHASE}/${encodeURIComponent(activeSet)}/variants/${encodeURIComponent(
      L_FRAME_VARIANT,
    )}`,
  )

  return getLFrameStyleBackground(variant)
}
