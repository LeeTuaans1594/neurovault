import Document from '../models/Document.model.js';
import config from '../config/env.js';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

/**
 * POST /api/documents/upload
 * Upload file → save metadata → trigger AI processing
 */
export const uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const { originalname, filename, path: filePath, size, mimetype } = req.file;
    const title = req.body.title || originalname.replace(/\.[^/.]+$/, ''); // Strip extension

    const document = new Document({
      user_id: req.userId,
      title,
      original_filename: originalname,
      file_path: filePath,
      file_size: size,
      mime_type: mimetype,
      metadata: {
        processing_status: 'pending',
      },
    });

    await document.save();

    // Trigger AI processing asynchronously
    triggerProcessing(document._id, filePath).catch(err => {
      console.error(`[Processing] Failed for doc ${document._id}:`, err.message);
    });

    res.status(201).json({
      message: 'Document uploaded successfully. Processing started.',
      document: {
        _id: document._id,
        title: document.title,
        original_filename: document.original_filename,
        file_size: document.file_size,
        metadata: document.metadata,
        createdAt: document.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Trigger AI Core processing (gọi Python FastAPI server)
 * Sử dụng axios để nhất quán với ai.routes.js
 */
async function triggerProcessing(documentId, filePath) {
  try {
    // Cập nhật status → processing
    await Document.findByIdAndUpdate(documentId, {
      'metadata.processing_status': 'processing',
      'metadata.processing_started_at': new Date(),
    });

    const absolutePath = path.resolve(filePath);

    // Gọi AI Core qua axios (nhất quán với ai.routes.js)
    const response = await axios.post(
      `${config.aiCoreUrl}/api/process`,
      {
        document_id: documentId.toString(),
        file_path: absolutePath,
      },
      {
        timeout: 120000, // 2 phút timeout cho xử lý tài liệu lớn
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const result = response.data;

    // Cập nhật document với processed data
    await Document.findByIdAndUpdate(documentId, {
      raw_text: result.raw_text || '',
      language: result.language || 'unknown',
      chunks: result.chunks || [],
      'metadata.word_count': result.word_count || 0,
      'metadata.page_count': result.page_count || 0,
      'metadata.char_count': result.char_count || 0,
      'metadata.chunk_count': result.chunks?.length || 0,
      'metadata.processing_status': 'completed',
      'metadata.processing_completed_at': new Date(),
    });

    console.log(`[Processing] Document ${documentId} completed: ${result.chunks?.length || 0} chunks`);
  } catch (err) {
    // Trích xuất error message chi tiết từ axios error
    const errorMessage = err.response?.data?.detail || err.response?.data?.error || err.message;

    // Mark as failed
    await Document.findByIdAndUpdate(documentId, {
      'metadata.processing_status': 'failed',
      'metadata.processing_error': errorMessage,
      'metadata.processing_completed_at': new Date(),
    });
    throw new Error(errorMessage);
  }
}

/**
 * GET /api/documents
 * List tất cả documents của user hiện tại
 */
export const getDocuments = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      Document.find({ user_id: req.userId })
        .select('-raw_text -chunks.embedding_vector -chunks.sparse_vector')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Document.countDocuments({ user_id: req.userId }),
    ]);

    res.json({
      documents,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/documents/:id
 * Chi tiết 1 document
 */
export const getDocument = async (req, res, next) => {
  try {
    const document = await Document.findOne({
      _id: req.params.id,
      user_id: req.userId,
    }).select('-chunks.embedding_vector -chunks.sparse_vector');

    if (!document) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    res.json({ document });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/documents/:id/status
 */
export const getDocumentStatus = async (req, res, next) => {
  try {
    const document = await Document.findOne({
      _id: req.params.id,
      user_id: req.userId,
    }).select('metadata.processing_status metadata.processing_error metadata.chunk_count');

    if (!document) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    res.json({ status: document.metadata });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/documents/:id
 */
export const deleteDocument = async (req, res, next) => {
  try {
    const document = await Document.findOneAndDelete({
      _id: req.params.id,
      user_id: req.userId,
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    // Delete file from disk
    if (document.file_path && fs.existsSync(document.file_path)) {
      fs.unlinkSync(document.file_path);
    }

    res.json({ message: 'Document deleted successfully.' });
  } catch (err) {
    next(err);
  }
};
