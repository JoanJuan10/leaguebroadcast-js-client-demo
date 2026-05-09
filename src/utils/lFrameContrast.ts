import type { LFrameBackgroundConfig } from '@/composables/useLFrameConfig'

export type LFrameContrastTone = 'dark' | 'light'

export interface LFrameContrast {
  header: LFrameContrastTone
  footer: LFrameContrastTone
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const FRAME_WIDTH = 285
const FRAME_HEIGHT = 260
const HEADER_RECT: Rect = { x: 0, y: 0, width: FRAME_WIDTH, height: 38 }
const FOOTER_RECT: Rect = { x: 0, y: 146, width: FRAME_WIDTH, height: 114 }
const LIGHT_BACKGROUND_THRESHOLD = 0.58
const BRIGHT_PIXEL_THRESHOLD = 0.72
const BRIGHT_PIXEL_RATIO_THRESHOLD = 0.42

export const DEFAULT_LFRAME_CONTRAST: LFrameContrast = {
  header: 'dark',
  footer: 'dark',
}

function isLightRegion(luminance: number, brightRatio: number): boolean {
  return luminance >= LIGHT_BACKGROUND_THRESHOLD || brightRatio >= BRIGHT_PIXEL_RATIO_THRESHOLD
}

function sRgbToLinear(value: number) {
  const normalized = value / 255
  return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
}

function relativeLuminance(red: number, green: number, blue: number) {
  return 0.2126 * sRgbToLinear(red) + 0.7152 * sRgbToLinear(green) + 0.0722 * sRgbToLinear(blue)
}

function averageLuminance(imageData: ImageData) {
  let luminanceTotal = 0
  let visibleSamples = 0
  let brightSamples = 0
  const step = 4 * 4

  for (let index = 0; index < imageData.data.length; index += step) {
    const alpha = imageData.data[index + 3] ?? 0
    if (alpha < 16) continue

    const luminance = relativeLuminance(
      imageData.data[index] ?? 0,
      imageData.data[index + 1] ?? 0,
      imageData.data[index + 2] ?? 0,
    )

    luminanceTotal += luminance
    visibleSamples += 1
    if (luminance >= BRIGHT_PIXEL_THRESHOLD) brightSamples += 1
  }

  if (!visibleSamples) {
    return { luminance: 0, brightRatio: 0 }
  }

  return {
    luminance: luminanceTotal / visibleSamples,
    brightRatio: brightSamples / visibleSamples,
  }
}

function parseHexColor(value: string) {
  const hex = value.trim().match(/^#([0-9a-f]{3,8})$/i)?.[1]
  if (!hex) return undefined

  const full =
    hex.length === 3 || hex.length === 4
      ? hex
          .slice(0, 3)
          .split('')
          .map((part) => `${part}${part}`)
          .join('')
      : hex.slice(0, 6)

  if (full.length !== 6) return undefined

  return {
    red: Number.parseInt(full.slice(0, 2), 16),
    green: Number.parseInt(full.slice(2, 4), 16),
    blue: Number.parseInt(full.slice(4, 6), 16),
  }
}

function parseRgbColor(value: string) {
  const match = value.trim().match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i)

  if (!match) return undefined

  return {
    red: Number(match[1]),
    green: Number(match[2]),
    blue: Number(match[3]),
  }
}

function inferToneFromCssColor(value?: string): LFrameContrastTone | undefined {
  if (!value) return undefined

  const color = parseHexColor(value) ?? parseRgbColor(value)
  if (!color) return undefined

  return isLightRegion(relativeLuminance(color.red, color.green, color.blue), 0) ? 'light' : 'dark'
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Unable to load L-frame background: ${url}`))
    image.src = url
  })
}

function parsePositionPart(
  value: string | undefined,
  lowKeyword: string,
  highKeyword: string,
  freeSpace: number,
) {
  if (!value) return freeSpace / 2

  const normalized = value.toLowerCase()
  if (normalized.includes(lowKeyword)) return 0
  if (normalized.includes(highKeyword)) return freeSpace

  const percentage = normalized.match(/(\d+(?:\.\d+)?)%/)?.[1]
  if (percentage !== undefined) {
    return freeSpace * (Number(percentage) / 100)
  }

  return freeSpace / 2
}

function drawBackgroundImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  background: LFrameBackgroundConfig,
) {
  const fit = background.fit?.toLowerCase()
  const imageWidth = image.naturalWidth || image.width
  const imageHeight = image.naturalHeight || image.height

  if (!imageWidth || !imageHeight) return

  if (fit === 'contain') {
    const scale = Math.min(FRAME_WIDTH / imageWidth, FRAME_HEIGHT / imageHeight)
    const width = imageWidth * scale
    const height = imageHeight * scale
    const x = parsePositionPart(background.position, 'left', 'right', FRAME_WIDTH - width)
    const y = parsePositionPart(background.position, 'top', 'bottom', FRAME_HEIGHT - height)
    context.drawImage(image, x, y, width, height)
    return
  }

  if (fit === 'fill' || fit === 'stretch') {
    context.drawImage(image, 0, 0, FRAME_WIDTH, FRAME_HEIGHT)
    return
  }

  const scale = Math.max(FRAME_WIDTH / imageWidth, FRAME_HEIGHT / imageHeight)
  const width = imageWidth * scale
  const height = imageHeight * scale
  const x = parsePositionPart(background.position, 'left', 'right', FRAME_WIDTH - width)
  const y = parsePositionPart(background.position, 'top', 'bottom', FRAME_HEIGHT - height)
  context.drawImage(image, x, y, width, height)
}

function regionTone(context: CanvasRenderingContext2D, rect: Rect): LFrameContrastTone {
  const region = context.getImageData(rect.x, rect.y, rect.width, rect.height)
  const { luminance, brightRatio } = averageLuminance(region)
  return isLightRegion(luminance, brightRatio) ? 'light' : 'dark'
}

export async function analyzeLFrameContrast(
  background: LFrameBackgroundConfig,
  imageUrl?: string,
): Promise<LFrameContrast> {
  if (background.type !== 'image' || !imageUrl) {
    const tone =
      inferToneFromCssColor(background.value) ??
      (background.type === 'color' ? DEFAULT_LFRAME_CONTRAST.header : undefined)

    return tone ? { header: tone, footer: tone } : DEFAULT_LFRAME_CONTRAST
  }

  const canvas = document.createElement('canvas')
  canvas.width = FRAME_WIDTH
  canvas.height = FRAME_HEIGHT
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return DEFAULT_LFRAME_CONTRAST

  const fallbackTone = inferToneFromCssColor(background.value)
  context.fillStyle = fallbackTone === 'light' ? '#ffffff' : '#000000'
  context.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT)

  const image = await loadImage(imageUrl)
  drawBackgroundImage(context, image, background)

  return {
    header: regionTone(context, HEADER_RECT),
    footer: regionTone(context, FOOTER_RECT),
  }
}
