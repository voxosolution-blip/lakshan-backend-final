import express from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import * as adminController from '../controllers/admin.controller.js';

const router = express.Router();

router.use(authenticate);
router.use(authorize(['ADMIN']));

// Upload temp folder
const uploadDir = path.join(os.tmpdir(), 'yogurt_erp_uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 200 * 1024 * 1024 // 200MB
  }
});

router.get('/backup', adminController.downloadBackup);
router.post('/restore', upload.single('file'), adminController.restoreFromBackup);
router.post('/reset', adminController.resetSystem);

export default router;


