'use client'
import React from 'react'
import { TILE_GAP, ZERO_ADDRESS } from '@/constants/map'
import {
  FREE_LAND,
  HEAT_RAMP,
  PENDING_LAND,
  ROT_RAMP,
  TAKEN_LAND,
  sampleRamp,
} from '@/constants/mapColors'
import { idToXY } from '@/lib/pixelMath'
import { isLand } from '@/lib/landMask'
import { ownerDefaultColor } from '@/lib/colorUtils'
import { dealTierRamps } from '@/lib/decay'
import { useCurrentMapMeta } from '@/hooks/useCurrentMapMeta'
import type { PixelView } from '@/lib/mock'

export type MapView = 'normal' | 'heatmap' | 'myland' | 'deals'

export function drawPixels(
  ctx: CanvasRenderingContext2D,
  pixelData: PixelView[],
  mapView: MapView,
  width: number,
  height: number,
  mask: Uint8Array,
  userAddress?: string,
  /** The connected wallet's current (possibly unsaved) profile color, used
   *  for their own pixels so the map matches what they see on the profile
   *  screen even before they save it on-chain. */
  userColor?: string,
) {
  ctx.clearRect(0, 0, width, height)

  const gap = TILE_GAP
  const userAddr = userAddress?.toLowerCase()
  // Unclaimed land. Every non-normal view keeps the same stone tone for it so
  // "nobody owns this" reads identically whichever lens is on.
  const unownedColor = FREE_LAND
  // Prices haven't resolved yet — near-black so it reads as "not known", not
  // as a cheap deal.
  const fadedColor = PENDING_LAND
  // Deals view: sold land that isn't a deal right now. Opaque, so it reads as
  // "taken" rather than blending into the ocean underneath.
  const soldColor = TAKEN_LAND
  // My-land view: everyone else's land, deliberately flattened to one tone so
  // MY pixels are the only colour on the map.
  const myLandFaded = TAKEN_LAND

  // Resolve an owned pixel's fill:
  //   1. on-chain per-owner color (what everyone agrees on) wins;
  //   2. else, for the connected user's OWN pixels, their live profile color
  //      so their view matches the profile screen even before they save;
  //   3. else, a deterministic per-address color (so unclaimed-looking grey
  //      never shows and every viewer computes the same hue).
  // Cached per owner so the hash isn't recomputed for every pixel.
  const ownerColorCache = new Map<string, string>()
  const ownedFill = (pixel: PixelView): string => {
    if (pixel.color) return pixel.color
    const owner = pixel.owner
    if (userColor && userAddr && owner.toLowerCase() === userAddr) {
      return userColor
    }
    let c = ownerColorCache.get(owner)
    if (!c) {
      c = ownerDefaultColor(owner)
      ownerColorCache.set(owner, c)
    }
    return c
  }

  if (mapView === 'heatmap') {
    let maxSales = 0
    for (let i = 0; i < pixelData.length; i++) {
      if (pixelData[i].saleCount > maxSales) {
        maxSales = pixelData[i].saleCount
      }
    }

    for (let i = 0; i < pixelData.length; i++) {
      if (!isLand(i, mask)) continue
      const pixel = pixelData[i]
      const { x, y } = idToXY(i, width)

      if (pixel.saleCount === 0) {
        ctx.fillStyle = unownedColor
      } else {
        const ratio = maxSales > 0 ? pixel.saleCount / maxSales : 0
        ctx.fillStyle = sampleRamp(HEAT_RAMP, ratio)
      }

      ctx.fillRect(x + gap / 2, y + gap / 2, 1 - gap, 1 - gap)
    }
  } else if (mapView === 'deals') {
    // Deals view — the rot lens. Several stages of "deal" over the CHEAPEST land,
    // anchored to the actual lowest live price — NOT the entry price. The
    // cheapest of the DEAL_STAGES lowest price levels is the deepest deal
    // (brightest, yellow); each level up is a shallower stage; everything above
    // greys out. Because it tracks the map's real lowest price, the view always
    // surfaces the best-value land even once every pixel is bought and bid up:
    // if the cheapest land is 8¢, that 8¢ tier is the deal. The scale re-ranks
    // itself for free as land decays or gets bought — nothing is pinned to a
    // fixed threshold.
    const landPrices: bigint[] = []
    for (let i = 0; i < pixelData.length; i++) {
      if (!isLand(i, mask)) continue
      landPrices.push(pixelData[i].currentPrice)
    }
    const ramps = dealTierRamps(landPrices)

    for (let i = 0; i < pixelData.length; i++) {
      if (!isLand(i, mask)) continue
      const pixel = pixelData[i]
      const { x, y } = idToXY(i, width)
      const ramp = ramps.get(pixel.currentPrice)

      if (ramp !== undefined) {
        ctx.fillStyle = sampleRamp(ROT_RAMP, ramp)
      } else if (pixel.owner !== ZERO_ADDRESS) {
        // Above the deal stages (bid up) — taken and not a bargain. Opaque
        // (see soldColor) so it reads as "taken" instead of blending into the
        // ocean.
        ctx.fillStyle = soldColor
      } else {
        // Prices haven't loaded yet — dim everything until they do.
        ctx.fillStyle = fadedColor
      }

      ctx.fillRect(x + gap / 2, y + gap / 2, 1 - gap, 1 - gap)
    }
  } else if (mapView === 'myland') {
    for (let i = 0; i < pixelData.length; i++) {
      if (!isLand(i, mask)) continue
      const pixel = pixelData[i]
      const { x, y } = idToXY(i, width)
      const isOwned = pixel.owner !== ZERO_ADDRESS
      const isMine = userAddr && isOwned && pixel.owner.toLowerCase() === userAddr

      if (isMine) {
        // My pixels in my current profile color (live), falling back to their
        // on-chain color so they're always clearly "mine".
        ctx.fillStyle = userColor ?? ownedFill(pixel)
      } else {
        ctx.fillStyle = myLandFaded
      }

      ctx.fillRect(x + gap / 2, y + gap / 2, 1 - gap, 1 - gap)
    }
  } else {
    for (let i = 0; i < pixelData.length; i++) {
      if (!isLand(i, mask)) continue
      const pixel = pixelData[i]
      const { x, y } = idToXY(i, width)
      const isOwned = pixel.owner !== ZERO_ADDRESS

      if (isOwned) {
        ctx.fillStyle = ownedFill(pixel)
      } else {
        ctx.fillStyle = unownedColor
      }

      ctx.fillRect(x + gap / 2, y + gap / 2, 1 - gap, 1 - gap)
    }
  }
}

interface PixelLayerProps {
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>
}

export default function PixelLayer({ canvasRef }: PixelLayerProps) {
  const { width, height } = useCurrentMapMeta()
  return (
    <canvas
      ref={el => { canvasRef.current = el }}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width,
        height,
        pointerEvents: 'none',
        imageRendering: 'pixelated',
      }}
    />
  )
}
