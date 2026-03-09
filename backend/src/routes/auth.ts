import express from 'express';
import { sendCode, login, verify } from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

router.post('/send-code', sendCode);
router.post('/login', login);
router.get('/verify', authMiddleware, verify);

export default router;
