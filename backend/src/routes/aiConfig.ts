import express from 'express';
import { getAIConfig, saveAIConfig } from '../controllers/aiConfigController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

router.get('/', authenticateToken, getAIConfig);
router.post('/', authenticateToken, saveAIConfig);

export default router;
