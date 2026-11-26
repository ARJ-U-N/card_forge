/**
 * Shared barcode layout constants and calculations.
 *
 * Used by all barcode rendering paths (Designer, card-renderer, vector-pdf)
 * to guarantee identical barcode container dimensions, margins, and label
 * positioning regardless of which renderer is active.
 */

// ---------------------------------------------------------------------------
// JsBarcode rendering parameters — must be identical everywhere
// ---------------------------------------------------------------------------

/** JsBarcode `margin` parameter in pixels (applied on all four sides) */
export const BARCODE_MARGIN_PX = 2

/** JsBarcode `width` multiplier for bar widths */
export const BARCODE_BAR_WIDTH = 1.5

// ---------------------------------------------------------------------------
// Bar height calculation
// ---------------------------------------------------------------------------

/**
 * Pixels deducted from the element height to compute the JsBarcode `height`
 * parameter. This reserves space so the barcode's internal margins don't get
 * squished when the barcode image is drawn into the element's bounding box.
 */
const BAR_DEDUCT_PX = 16

/** Minimum JsBarcode bar height in pixels */
const MIN_BAR_HEIGHT_PX = 20

/**
 * Compute the JsBarcode `height` parameter for a given element height in
 * CSS/canvas pixels. This is the bar-only height; JsBarcode adds its own
 * `margin` on top/bottom.
 *
 * All rendering paths MUST use this function so the barcode's proportions
 * (bar height vs. margin) are identical across Designer, raster PDF, and
 * vector PDF.
 */
export function barcodeBarHeight(elementHeightPx: number): number {
  return Math.max(MIN_BAR_HEIGHT_PX, elementHeightPx - BAR_DEDUCT_PX)
}

// ---------------------------------------------------------------------------
// Need Name label positioning
// ---------------------------------------------------------------------------

/** Label font size in PDF points (used by vector-pdf-renderer) */
export const BARCODE_LABEL_FONT_SIZE_PT = 7

/** Label font size in CSS pixels (used by card-renderer canvas) */
export const BARCODE_LABEL_FONT_SIZE_PX = 10

/**
 * Height of the white background rectangle behind the barcode name label, in mm.
 * Sized to fit the BARCODE_LABEL_FONT_SIZE_PT text with vertical padding.
 * 7pt ≈ 2.47mm + ~1mm padding = 3.5mm total.
 */
export const BARCODE_NAME_BG_HEIGHT_MM = 3.5

// ---------------------------------------------------------------------------
// Coordinate conversion
// ---------------------------------------------------------------------------

/** Pixels per mm — CR-80 reference: 324 px / 85.6 mm ≈ 3.785 */
export const PX_PER_MM = 324 / 85.6
