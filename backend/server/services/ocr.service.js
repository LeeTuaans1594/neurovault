/**
 * NEUROVAULT — OCR Service
 * Text extraction from images using Tesseract.js.
 *
 * Features:
 * - Multi-language support (vi, en, vi+en)
 * - Confidence scoring
 * - Page segmentation modes
 * - Progress callbacks
 * - Worker reuse for performance
 */
import Tesseract from 'tesseract.js';
import fs from 'fs';
import path from 'path';

// Worker pool (reused across requests)
let workerPool = null;

/**
 * Initialize Tesseract scheduler with worker pool.
 * Lazy initialization — only created when first OCR request comes in.
 */
async function getScheduler() {
  if (workerPool) return workerPool;

  const scheduler = Tesseract.createScheduler();

  // Create 2 workers for parallel processing
  const workerCount = Math.min(2, (await import('os')).cpus().length);
  for (let i = 0; i < workerCount; i++) {
    const worker = await Tesseract.createWorker('eng+vie', 1, {
      // Cache trained data locally
      cachePath: path.resolve('./uploads/.tesseract-cache'),
    });
    scheduler.addWorker(worker);
  }

  workerPool = scheduler;
  console.log(`[OCR] Tesseract scheduler ready with ${workerCount} workers (eng+vie)`);
  return scheduler;
}

/**
 * Extract text from an image file.
 *
 * @param {string} imagePath - Absolute path to image file
 * @param {object} options
 * @param {string} options.language - Tesseract language code: 'eng', 'vie', 'eng+vie'
 * @param {function} options.onProgress - Progress callback (0-1)
 * @returns {object} { text, confidence, lines, words, paragraphs }
 */
export async function extractTextFromImage(imagePath, options = {}) {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image file not found: ${imagePath}`);
  }

  const { onProgress } = options;

  const scheduler = await getScheduler();

  const result = await scheduler.addJob('recognize', imagePath, {}, {
    ...(onProgress && {
      progress: (p) => {
        if (p.status === 'recognizing text') {
          onProgress(p.progress);
        }
      },
    }),
  });

  const { data } = result;

  // Build structured output
  const lines = (data.lines || []).map(line => ({
    text: line.text.trim(),
    confidence: Math.round(line.confidence),
    bbox: line.bbox,
  })).filter(l => l.text.length > 0);

  const paragraphs = (data.paragraphs || []).map(p => ({
    text: p.text.trim(),
    confidence: Math.round(p.confidence),
  })).filter(p => p.text.length > 0);

  return {
    text: data.text?.trim() || '',
    confidence: Math.round(data.confidence || 0),
    lines,
    paragraphs,
    wordCount: data.words?.length || 0,
    lineCount: lines.length,
  };
}

/**
 * Extract text from multiple images (e.g., multi-page scanned PDF).
 *
 * @param {string[]} imagePaths - Array of image file paths
 * @param {object} options
 * @returns {object} { fullText, pages, totalConfidence, wordCount }
 */
export async function extractTextFromImages(imagePaths, options = {}) {
  const pages = [];
  let totalConfidence = 0;
  let totalWords = 0;

  for (let i = 0; i < imagePaths.length; i++) {
    const pageResult = await extractTextFromImage(imagePaths[i], {
      ...options,
      onProgress: options.onProgress
        ? (p) => options.onProgress((i + p) / imagePaths.length)
        : undefined,
    });

    pages.push({
      pageNumber: i + 1,
      ...pageResult,
    });

    totalConfidence += pageResult.confidence;
    totalWords += pageResult.wordCount;
  }

  const fullText = pages.map(p => p.text).join('\n\n--- Page Break ---\n\n');

  return {
    fullText,
    pages,
    totalPages: pages.length,
    averageConfidence: pages.length > 0 ? Math.round(totalConfidence / pages.length) : 0,
    totalWordCount: totalWords,
  };
}

/**
 * Check if a file is an image that can be OCR'd.
 */
export function isOCRableFile(mimetype, filename) {
  const imageTypes = ['image/jpeg', 'image/png', 'image/tiff', 'image/bmp', 'image/webp'];
  const imageExts = ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.webp'];
  const ext = path.extname(filename || '').toLowerCase();
  return imageTypes.includes(mimetype) || imageExts.includes(ext);
}

/**
 * Cleanup worker pool on shutdown.
 */
export async function terminateOCR() {
  if (workerPool) {
    await workerPool.terminate();
    workerPool = null;
    console.log('[OCR] Tesseract scheduler terminated');
  }
}
