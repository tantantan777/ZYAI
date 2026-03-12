import express from 'express';
import { getAIConfig, saveAIConfig } from '../controllers/aiConfigController';
import { authenticateToken, requireSystemSettingsAccess } from '../middleware/auth';

const router = express.Router();

router.get('/', authenticateToken, requireSystemSettingsAccess, getAIConfig);
router.post('/', authenticateToken, requireSystemSettingsAccess, saveAIConfig);

export default router;
