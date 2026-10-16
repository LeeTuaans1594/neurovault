import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import {
  uploadDocument,
  getDocuments,
  getDocument,
  getDocumentStatus,
  deleteDocument,
} from '../controllers/document.controller.js';
import Document from '../models/Document.model.js';
import auth from '../middleware/auth.js';
import upload from '../middleware/upload.js';

const router = Router();

// Tất cả routes cần authentication
router.use(auth);

router.post('/upload', upload.single('file'), uploadDocument);
router.get('/', getDocuments);
router.get('/:id', getDocument);
router.get('/:id/status', getDocumentStatus);
router.delete('/:id', deleteDocument);

/**
 * GET /api/documents/:id/file
 * Serve file gốc (PDF, TXT, MD) cho inline viewer
 * Chỉ user sở hữu document mới truy cập được
 */
router.get('/:id/file', async (req, res, next) => {
  try {
    const document = await Document.findOne({
      _id: req.params.id,
      user_id: req.userId,
    }).select('file_path mime_type original_filename');

    if (!document) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const absolutePath = path.resolve(document.file_path);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'File not found on disk.' });
    }

    // Set appropriate headers
    const mimeType = document.mime_type || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(document.original_filename)}"`);

    // Stream file to response
    const fileStream = fs.createReadStream(absolutePath);
    fileStream.pipe(res);

    fileStream.on('error', (err) => {
      console.error(`[Documents] File stream error for ${document._id}:`, err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to read file.' });
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
