/**
 * Adaptive Resource-Safety Controller for Vector PDF Export (Phase 1)
 *
 * Makes per-sheet decisions DURING rendering — not just after a batch completes.
 * After each physical sheet finishes rendering, the controller evaluates
 * available signals and returns one of three states:
 *
 *   Normal   → continue rendering in the current batch
 *   Caution  → finish the current batch, reduce workload for the next
 *   Critical → discard any incomplete sheet, save completed sheets, reduce heavily
 *
 * ─── Signals used (and their honest limitations) ───────────────────────
 *
 * MEASURED (genuinely available):
 *   • Sheet render duration (ms)         — high-resolution performance.now()
 *   • Cumulative batch render duration    — sum of sheet durations in this batch
 *   • PDF output size (bytes)            — Blob.size after generation
 *   • performance.memory (Chromium only) — usedJSHeapSize / jsHeapSizeLimit
 *     ⚠ This is a HEAP metric, not total browser memory. It may undercount
 *       off-heap resources (canvas backing stores, GPU textures, etc.).
 *     ⚠ It is behind a non-standard flag and may be inaccurate.
 *
 * ESTIMATED (workload indicators, NOT memory measurements):
 *   • Images per sheet                   — count of member images loaded
 *   • Sheets completed in current batch  — workload accumulation proxy
 *
 * This controller does NOT:
 *   • Treat PDF output size as browser memory usage
 *   • Treat render duration as memory usage
 *   • Claim to prevent all browser OOM situations
 *   • Guarantee exact memory accounting
 *
 * The adaptive logic is conservative: it starts with small batches, grows
 * slowly after healthy sheets, and reduces promptly on any warning signal.
 */

// ---------------------------------------------------------------------------
// Tuning constants — centralised, documented, easy to adjust
// ---------------------------------------------------------------------------

/** Initial max sheets in the first batch (conservative start). */
const INITIAL_MAX_SHEETS = 2

/** Minimum sheets the controller will ever allow per batch. */
const MIN_SHEETS_PER_BATCH = 1

/** Maximum sheets the controller will ever allow per batch. */
const MAX_SHEETS_PER_BATCH = 20

/**
 * Target duration for one physical sheet (ms).
 * Sheets finishing faster contribute to cautious growth.
 */
const TARGET_SHEET_DURATION_MS = 8_000

/**
 * Sheet duration that triggers Caution state.
 * Complete the current sheet but do not start another in this batch.
 */
const CAUTION_SHEET_DURATION_MS = 15_000

/**
 * Sheet duration that triggers Critical state.
 * Discard incomplete sheet, save completed sheets.
 */
const CRITICAL_SHEET_DURATION_MS = 30_000

/**
 * Cumulative batch duration that triggers Caution.
 * Prevents long-running batches even when individual sheets are fast.
 */
const CAUTION_BATCH_DURATION_MS = 45_000

/**
 * Chromium performance.memory: heap usage ratio that triggers Caution.
 * usedJSHeapSize / jsHeapSizeLimit > this value → Caution.
 */
const CAUTION_HEAP_RATIO = 0.70

/**
 * Chromium performance.memory: heap usage ratio that triggers Critical.
 */
const CRITICAL_HEAP_RATIO = 0.85

/** Cautious growth multiplier applied after consistently healthy sheets. */
const GROWTH_FACTOR = 1.25

/** Number of consecutive healthy sheets before growth is applied. */
const HEALTHY_STREAK_FOR_GROWTH = 3

/** Moderate reduction multiplier for Caution state. */
const CAUTION_REDUCTION_FACTOR = 0.7

/** Aggressive reduction multiplier for Critical state. */
const CRITICAL_REDUCTION_FACTOR = 0.5

/** Maximum consecutive failures on the same sheet before aborting. */
export const MAX_SHEET_RETRIES = 3

/**
 * Minimum sheets above which batching is used instead of one-shot.
 * Exports with fewer total sheets use the existing single-pass path.
 */
export const BATCH_THRESHOLD_SHEETS = 5

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ControllerState = 'normal' | 'caution' | 'critical'

export interface SheetMetrics {
  /** Duration to render this single physical sheet (ms) */
  sheetDurationMs: number
  /** Number of students/members on this sheet */
  studentCount: number
  /** Number of PDF pages this sheet produced (1 for single-sided, 2 for duplex) */
  pageCount: number
  /** Whether this sheet completed successfully */
  success: boolean
}

export interface SheetDecision {
  /** Controller's recommendation */
  state: ControllerState
  /** Whether it is safe to begin the next sheet in this batch */
  continueInBatch: boolean
  /** Human-readable reason for the decision (for logging/debugging only) */
  reason: string
}

export interface MemorySnapshot {
  /** Whether performance.memory was available */
  available: boolean
  /** usedJSHeapSize in bytes (0 if unavailable) */
  usedHeapBytes: number
  /** jsHeapSizeLimit in bytes (0 if unavailable) */
  heapLimitBytes: number
  /** Ratio: usedHeapBytes / heapLimitBytes (0 if unavailable) */
  heapRatio: number
}

export interface BatchSummary {
  batchIndex: number
  sheetsCompleted: number
  totalDurationMs: number
  totalStudents: number
  totalPages: number
  finalState: ControllerState
  memorySnapshot: MemorySnapshot
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class AdaptiveBatchController {
  private maxSheetsPerBatch: number = INITIAL_MAX_SHEETS
  private healthyStreak: number = 0
  private batchHistory: BatchSummary[] = []
  private currentBatchStartTime: number = 0
  private currentBatchDurationMs: number = 0
  private currentBatchSheets: number = 0
  private consecutiveSheetFailures: number = 0
  private lastFailedSheetIndex: number = -1

  /**
   * Call at the start of each new batch.
   * Resets per-batch accumulators.
   */
  startBatch(): void {
    this.currentBatchStartTime = performance.now()
    this.currentBatchDurationMs = 0
    this.currentBatchSheets = 0
  }

  /**
   * Maximum sheets the controller currently recommends for the next batch.
   * The orchestrator should not exceed this but may render fewer if
   * per-sheet decisions interrupt the batch earlier.
   */
  getMaxSheetsForBatch(): number {
    return this.maxSheetsPerBatch
  }

  /**
   * Check whether it is safe to START the next sheet in the current batch.
   * Call this BEFORE beginning work on a new sheet.
   */
  shouldStartNextSheet(): SheetDecision {
    // Check if we've hit the max for this batch
    if (this.currentBatchSheets >= this.maxSheetsPerBatch) {
      return {
        state: 'normal',
        continueInBatch: false,
        reason: `Reached batch limit of ${this.maxSheetsPerBatch} sheets`,
      }
    }

    // Check cumulative batch duration
    if (this.currentBatchDurationMs > CAUTION_BATCH_DURATION_MS) {
      return {
        state: 'caution',
        continueInBatch: false,
        reason: `Cumulative batch duration ${Math.round(this.currentBatchDurationMs)}ms exceeds caution threshold ${CAUTION_BATCH_DURATION_MS}ms`,
      }
    }

    // Check Chromium heap memory if available
    const mem = this.takeMemorySnapshot()
    if (mem.available) {
      if (mem.heapRatio > CRITICAL_HEAP_RATIO) {
        return {
          state: 'critical',
          continueInBatch: false,
          reason: `Heap usage ${(mem.heapRatio * 100).toFixed(1)}% exceeds critical threshold ${CRITICAL_HEAP_RATIO * 100}%`,
        }
      }
      if (mem.heapRatio > CAUTION_HEAP_RATIO) {
        return {
          state: 'caution',
          continueInBatch: false,
          reason: `Heap usage ${(mem.heapRatio * 100).toFixed(1)}% exceeds caution threshold ${CAUTION_HEAP_RATIO * 100}%`,
        }
      }
    }

    return {
      state: 'normal',
      continueInBatch: true,
      reason: 'All signals within safe bounds',
    }
  }

  /**
   * Record the result of a completed (or failed) physical sheet.
   * Returns the decision for what to do next.
   *
   * Call this AFTER a sheet finishes rendering (successfully or not).
   */
  recordSheet(metrics: SheetMetrics, globalSheetIndex: number): SheetDecision {
    if (!metrics.success) {
      // Track consecutive failures on the same sheet
      if (globalSheetIndex === this.lastFailedSheetIndex) {
        this.consecutiveSheetFailures++
      } else {
        this.consecutiveSheetFailures = 1
        this.lastFailedSheetIndex = globalSheetIndex
      }

      this.healthyStreak = 0

      // Reduce aggressively after failure
      this.maxSheetsPerBatch = Math.max(
        MIN_SHEETS_PER_BATCH,
        Math.floor(this.maxSheetsPerBatch * CRITICAL_REDUCTION_FACTOR),
      )

      if (this.consecutiveSheetFailures >= MAX_SHEET_RETRIES) {
        return {
          state: 'critical',
          continueInBatch: false,
          reason: `Sheet ${globalSheetIndex} failed ${this.consecutiveSheetFailures} consecutive times — aborting`,
        }
      }

      return {
        state: 'critical',
        continueInBatch: false,
        reason: `Sheet render failed (attempt ${this.consecutiveSheetFailures}/${MAX_SHEET_RETRIES})`,
      }
    }

    // Successful sheet — reset failure tracking for this sheet
    if (globalSheetIndex === this.lastFailedSheetIndex) {
      this.consecutiveSheetFailures = 0
      this.lastFailedSheetIndex = -1
    }

    this.currentBatchDurationMs += metrics.sheetDurationMs
    this.currentBatchSheets++

    // ── Evaluate sheet duration ──

    // Critical: extremely slow sheet
    if (metrics.sheetDurationMs > CRITICAL_SHEET_DURATION_MS) {
      this.healthyStreak = 0
      this.maxSheetsPerBatch = Math.max(
        MIN_SHEETS_PER_BATCH,
        Math.floor(this.maxSheetsPerBatch * CRITICAL_REDUCTION_FACTOR),
      )
      return {
        state: 'caution',
        continueInBatch: false,
        reason: `Sheet took ${Math.round(metrics.sheetDurationMs)}ms (critical: >${CRITICAL_SHEET_DURATION_MS}ms)`,
      }
    }

    // Caution: slow sheet
    if (metrics.sheetDurationMs > CAUTION_SHEET_DURATION_MS) {
      this.healthyStreak = 0
      this.maxSheetsPerBatch = Math.max(
        MIN_SHEETS_PER_BATCH,
        Math.floor(this.maxSheetsPerBatch * CAUTION_REDUCTION_FACTOR),
      )
      return {
        state: 'caution',
        continueInBatch: false,
        reason: `Sheet took ${Math.round(metrics.sheetDurationMs)}ms (caution: >${CAUTION_SHEET_DURATION_MS}ms)`,
      }
    }

    // Check cumulative batch duration
    if (this.currentBatchDurationMs > CAUTION_BATCH_DURATION_MS) {
      this.healthyStreak = 0
      return {
        state: 'caution',
        continueInBatch: false,
        reason: `Cumulative batch duration ${Math.round(this.currentBatchDurationMs)}ms exceeds threshold`,
      }
    }

    // Check memory
    const mem = this.takeMemorySnapshot()
    if (mem.available) {
      if (mem.heapRatio > CRITICAL_HEAP_RATIO) {
        this.healthyStreak = 0
        this.maxSheetsPerBatch = Math.max(
          MIN_SHEETS_PER_BATCH,
          Math.floor(this.maxSheetsPerBatch * CRITICAL_REDUCTION_FACTOR),
        )
        return {
          state: 'critical',
          continueInBatch: false,
          reason: `Heap usage ${(mem.heapRatio * 100).toFixed(1)}% exceeds critical threshold after sheet`,
        }
      }
      if (mem.heapRatio > CAUTION_HEAP_RATIO) {
        this.healthyStreak = 0
        this.maxSheetsPerBatch = Math.max(
          MIN_SHEETS_PER_BATCH,
          Math.floor(this.maxSheetsPerBatch * CAUTION_REDUCTION_FACTOR),
        )
        return {
          state: 'caution',
          continueInBatch: false,
          reason: `Heap usage ${(mem.heapRatio * 100).toFixed(1)}% exceeds caution threshold after sheet`,
        }
      }
    }

    // ── Healthy sheet — consider growth ──

    if (metrics.sheetDurationMs < TARGET_SHEET_DURATION_MS) {
      this.healthyStreak++
      if (this.healthyStreak >= HEALTHY_STREAK_FOR_GROWTH) {
        this.maxSheetsPerBatch = Math.min(
          MAX_SHEETS_PER_BATCH,
          Math.ceil(this.maxSheetsPerBatch * GROWTH_FACTOR),
        )
        this.healthyStreak = 0 // Reset so growth doesn't happen every sheet
      }
    } else {
      // Sheet was OK but not fast — don't grow, don't reduce
      this.healthyStreak = 0
    }

    // Check if we've hit the batch limit
    if (this.currentBatchSheets >= this.maxSheetsPerBatch) {
      return {
        state: 'normal',
        continueInBatch: false,
        reason: `Reached batch limit of ${this.maxSheetsPerBatch} sheets`,
      }
    }

    return {
      state: 'normal',
      continueInBatch: true,
      reason: `Sheet healthy (${Math.round(metrics.sheetDurationMs)}ms), ${this.maxSheetsPerBatch - this.currentBatchSheets} slots remaining`,
    }
  }

  /**
   * Record a completed batch for history.
   */
  recordBatch(summary: BatchSummary): void {
    this.batchHistory.push(summary)
  }

  /** Return a copy of all recorded batch summaries. */
  getHistory(): readonly BatchSummary[] {
    return [...this.batchHistory]
  }

  /** Whether the same sheet has failed too many times. */
  isSheetPermanentlyFailed(): boolean {
    return this.consecutiveSheetFailures >= MAX_SHEET_RETRIES
  }

  /**
   * Take a snapshot of Chromium's performance.memory API.
   *
   * IMPORTANT LIMITATIONS:
   * - Only available in Chromium-based browsers
   * - Reports JS heap only, not total process memory
   * - Off-heap resources (canvas, GPU textures) are NOT included
   * - Values may lag behind actual allocation
   * - Not a reliable measure of "total browser memory usage"
   */
  takeMemorySnapshot(): MemorySnapshot {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const perfMem = (performance as any).memory
      if (perfMem && typeof perfMem.usedJSHeapSize === 'number') {
        const used = perfMem.usedJSHeapSize as number
        const limit = perfMem.jsHeapSizeLimit as number
        return {
          available: true,
          usedHeapBytes: used,
          heapLimitBytes: limit,
          heapRatio: limit > 0 ? used / limit : 0,
        }
      }
    } catch {
      // Silently ignore
    }
    return { available: false, usedHeapBytes: 0, heapLimitBytes: 0, heapRatio: 0 }
  }
}
