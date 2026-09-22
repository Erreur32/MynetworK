import { Router } from 'express';
import { freeboxApi } from '../services/freeboxApi.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';
import { param, requireIntParam } from '../utils/params.js';

const router = Router();
router.use(requireAuth);

// GET /api/downloads - Get all downloads
router.get('/', asyncHandler(async (_req, res) => {
  const result = await freeboxApi.getDownloads();
  res.json(result);
}));

// GET /api/downloads/stats - Get download stats
router.get('/stats', asyncHandler(async (_req, res) => {
  const result = await freeboxApi.getDownloadStats();
  res.json(result);
}));

// GET /api/downloads/:id - Get specific download
router.get('/:id', asyncHandler(async (req, res) => {
  const id = requireIntParam(req, 'id', 'Invalid download ID', 'INVALID_ID');
  const result = await freeboxApi.getDownload(id);
  res.json(result);
}));

// GET /api/downloads/:id/trackers - Get download trackers
router.get('/:id/trackers', asyncHandler(async (req, res) => {
  const id = requireIntParam(req, 'id', 'Invalid download ID', 'INVALID_ID');
  const result = await freeboxApi.getDownloadTrackers(id);
  res.json(result);
}));

// GET /api/downloads/:id/peers - Get download peers
router.get('/:id/peers', asyncHandler(async (req, res) => {
  const id = requireIntParam(req, 'id', 'Invalid download ID', 'INVALID_ID');
  const result = await freeboxApi.getDownloadPeers(id);
  res.json(result);
}));

// GET /api/downloads/:id/files - Get download files
router.get('/:id/files', asyncHandler(async (req, res) => {
  const id = requireIntParam(req, 'id', 'Invalid download ID', 'INVALID_ID');
  const result = await freeboxApi.getDownloadFiles(id);
  res.json(result);
}));

// PUT /api/downloads/:id/files/:fileId - Update download file priority
router.put('/:id/files/:fileId', requireAdmin, asyncHandler(async (req, res) => {
  const id = requireIntParam(req, 'id', 'Invalid download ID', 'INVALID_ID');
  const fileId = param(req, 'fileId');
  const { priority } = req.body;
  const result = await freeboxApi.updateDownloadFile(id, fileId, priority);
  res.json(result);
}));

// GET /api/downloads/:id/pieces - Get download pieces
router.get('/:id/pieces', asyncHandler(async (req, res) => {
  const id = requireIntParam(req, 'id', 'Invalid download ID', 'INVALID_ID');
  const result = await freeboxApi.getDownloadPieces(id);
  res.json(result);
}));

// GET /api/downloads/:id/blacklist - Get download blacklist
router.get('/:id/blacklist', asyncHandler(async (req, res) => {
  const id = requireIntParam(req, 'id', 'Invalid download ID', 'INVALID_ID');
  const result = await freeboxApi.getDownloadBlacklist(id);
  res.json(result);
}));

// DELETE /api/downloads/:id/blacklist/empty - Empty download blacklist
router.delete('/:id/blacklist/empty', requireAdmin, asyncHandler(async (req, res) => {
  const id = requireIntParam(req, 'id', 'Invalid download ID', 'INVALID_ID');
  const result = await freeboxApi.emptyDownloadBlacklist(id);
  res.json(result);
}));

// GET /api/downloads/:id/log - Get download log
router.get('/:id/log', asyncHandler(async (req, res) => {
  const id = requireIntParam(req, 'id', 'Invalid download ID', 'INVALID_ID');
  const result = await freeboxApi.getDownloadLog(id);
  res.json(result);
}));

// POST /api/downloads - Add new download (URL or file)
router.post('/', requireAdmin, asyncHandler(async (req, res) => {
  const { url, downloadDir, fileBase64, filename } = req.body;

  if (downloadDir !== undefined && (typeof downloadDir !== 'string' || /[\r\n]/.test(downloadDir))) {
    throw createError('Invalid downloadDir', 400, 'INVALID_DOWNLOAD_DIR');
  }

  // If fileBase64 is provided, use file upload method
  if (fileBase64 && filename) {
    if (typeof fileBase64 !== 'string' || typeof filename !== 'string') {
      throw createError('fileBase64 and filename must be strings', 400, 'INVALID_FILE_UPLOAD');
    }
    // filename/downloadDir are embedded as raw multipart form fields (see
    // freeboxApi.addDownloadFromFile) — reject quotes/CRLF to prevent breaking
    // out of the Content-Disposition header or injecting extra form parts.
    if (!filename.trim() || /["\r\n]/.test(filename)) {
      throw createError('Invalid filename', 400, 'INVALID_FILENAME');
    }
    // 10mb is already enforced by express.json()'s body size limit; this just
    // rejects a malformed/empty payload before it reaches the Freebox API.
    const fileBuffer = Buffer.from(fileBase64, 'base64');
    if (fileBuffer.length === 0) {
      throw createError('fileBase64 is empty or invalid', 400, 'INVALID_FILE_UPLOAD');
    }
    const result = await freeboxApi.addDownloadFromFile(fileBuffer, filename, downloadDir);
    res.json(result);
    return;
  }

  // Otherwise use URL method
  if (!url || typeof url !== 'string') {
    throw createError('URL or file is required', 400, 'MISSING_URL_OR_FILE');
  }
  const result = await freeboxApi.addDownload(url, downloadDir);
  res.json(result);
}));

// PUT /api/downloads/:id - Update download (pause/resume)
router.put('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = requireIntParam(req, 'id', 'Invalid download ID', 'INVALID_ID');
  const { status, io_priority } = req.body;
  const result = await freeboxApi.updateDownload(id, { status, io_priority });
  res.json(result);
}));

// DELETE /api/downloads/:id - Delete download
router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = requireIntParam(req, 'id', 'Invalid download ID', 'INVALID_ID');
  const deleteFiles = req.query.delete_files === 'true';
  const result = await freeboxApi.deleteDownload(id, deleteFiles);
  res.json(result);
}));

export default router;