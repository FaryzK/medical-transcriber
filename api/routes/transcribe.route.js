import express from 'express';
import { transcribeAudio } from '../controllers/transcribe.controller.js';

const router = express.Router();

router.post('/transcribe', transcribeAudio);

export default router; 