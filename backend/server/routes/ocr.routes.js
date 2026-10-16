import { Router } from 'express';
import auth from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import { validateFileMagicBytes } from '../middleware/security.js';
import { extractTextFromImage, isOCRableFile } from '../services/ocr.service.js';
import Document from '../models/Document.model.js';
import path from 'path';
import fs from 'fs';
import config from '../config/env.js';
import axios from 'axios';

const router = Router();

/**
 * POST /api/ocr/extract
 * Upload an image and extract text via OCR.
 * Returns extracted text + confidence without creating a document.
 */
router.post('/extract', auth, upload.single('file'), validateFileMagicBytes, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    if (!isOCRableFile(req.file.mimetype, req.file.originalname)) {
      // Clean up uploaded file
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'File must be an image (JPG, PNG, TIFF, BMP, WebP)' });
    }

    const result = await extractTextFromImage(path.resolve(req.file.path));

    res.json({
      text: result.text,
      confidence: result.confidence,
      wordCount: result.wordCount,
      lineCount: result.lineCount,
      lines: result.lines.slice(0, 50), // Limit response size
      filename: req.file.originalname,
    });

    // Clean up — extract-only doesn't persist the file
    try { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch { /* */ }
  } catch (err) {
    // Clean up on error too
    try { if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch { /* */ }
    next(err);
  }
});

/**
 * POST /api/ocr/upload-as-document
 * Upload an image, OCR it, and create a document from the extracted text.
 * This converts scanned content into a searchable, processable document.
 */
router.post('/upload-as-document', auth, upload.single('file'), validateFileMagicBytes, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    if (!isOCRableFile(req.file.mimetype, req.file.originalname)) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'File must be an image for OCR processing' });
    }

    // Extract text
    const ocrResult = await extractTextFromImage(path.resolve(req.file.path));

    if (!ocrResult.text || ocrResult.text.length < 10) {
      return res.status(422).json({
        error: 'OCR could not extract meaningful text from this image',
        confidence: ocrResult.confidence,
      });
    }

    const title = req.body.title || req.file.originalname.replace(/\.[^/.]+$/, '') + ' (OCR)';

    // Create document with OCR text
    const document = new Document({
      user_id: req.userId,
      title,
      original_filename: req.file.originalname,
      file_path: req.file.path,
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      raw_text: ocrResult.text,
      language: detectLanguage(ocrResult.text),
      metadata: {
        word_count: ocrResult.wordCount,
        char_count: ocrResult.text.length,
        processing_status: 'pending',
        ocr_confidence: ocrResult.confidence,
        ocr_source: true,
      },
    });

    await document.save();

    // Trigger AI processing on the extracted text
    triggerOCRProcessing(document._id, ocrResult.text).catch(err => {
      console.error(`[OCR] AI processing failed for doc ${document._id}:`, err.message);
    });

    res.status(201).json({
      message: 'Image OCR\'d and document created. AI processing started.',
      document: {
        _id: document._id,
        title: document.title,
        metadata: document.metadata,
      },
      ocr: {
        confidence: ocrResult.confidence,
        wordCount: ocrResult.wordCount,
        preview: ocrResult.text.slice(0, 300),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Trigger AI Core processing for OCR'd text.
 * Sends raw_text directly instead of file_path since text is already extracted.
 */
async function triggerOCRProcessing(documentId, rawText) {
  try {
    await Document.findByIdAndUpdate(documentId, {
      'metadata.processing_status': 'processing',
      'metadata.processing_started_at': new Date(),
    });

    const response = await axios.post(
      `${config.aiCoreUrl}/api/process`,
      {
        document_id: documentId.toString(),
        raw_text: rawText,
        source: 'ocr',
      },
      { timeout: 120000, headers: { 'Content-Type': 'application/json' } }
    );

    const result = response.data;

    await Document.findByIdAndUpdate(documentId, {
      chunks: result.chunks || [],
      language: result.language || 'unknown',
      'metadata.chunk_count': result.chunks?.length || 0,
      'metadata.processing_status': 'completed',
      'metadata.processing_completed_at': new Date(),
    });

    console.log(`[OCR] Document ${documentId} processed: ${result.chunks?.length || 0} chunks`);
  } catch (err) {
    const errorMessage = err.response?.data?.detail || err.message;
    await Document.findByIdAndUpdate(documentId, {
      'metadata.processing_status': 'failed',
      'metadata.processing_error': errorMessage,
    });
  }
}

/**
 * Simple language detection for OCR'd text.
 */
function detectLanguage(text) {
  const viPattern = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi;
  const viMatches = (text.match(viPattern) || []).length;
  const ratio = viMatches / Math.max(text.length, 1);
  if (ratio > 0.05) return viMatches > text.length * 0.2 ? 'vi' : 'mixed';
  return 'en';
}

export default router;
