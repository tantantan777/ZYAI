import express from 'express';
import { authenticateToken, requireSystemSettingsAccess } from '../middleware/auth';
import { getSystemLogs, logClientAction } from '../controllers/systemLogController';

const router = express.Router();

router.post('/client-event', authenticateToken, logClientAction);
router.get('/', authenticateToken, requireSystemSettingsAccess, getSystemLogs);

export default router;
