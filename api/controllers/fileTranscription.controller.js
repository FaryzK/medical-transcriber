import fileTranscriptionService from '../services/fileTranscription.service.js';
import entityService from '../services/entity.service.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter to only allow mp3 and wav files
const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.mp3', '.wav'];
  const allowedMimeTypes = [
    'audio/mp3',
    'audio/mpeg',
    'audio/wav',
    'audio/wave',
    'audio/x-wav'
  ];
  
  const ext = path.extname(file.originalname).toLowerCase();
  const isValidExtension = allowedExtensions.includes(ext);
  const isValidMimeType = allowedMimeTypes.includes(file.mimetype);
  
  if (isValidExtension || isValidMimeType) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Only MP3 and WAV files are allowed. Got mimetype: ${file.mimetype}, extension: ${ext}`));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // Limit file size to 10MB
  }
});

/**
 * Helper function to get combined text from transcription results
 */
const getCombinedTranscription = (results) => {
  return results
    .sort((a, b) => b.confidence - a.confidence) // Sort by confidence score
    .map(result => result.transcript)
    .join(' ');
};

/**
 * Handle file upload and transcription
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
export const transcribeFile = async (req, res) => {
  try {
    // Handle file upload using multer middleware
    upload.single('audioFile')(req, res, async function(err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({
          success: false,
          error: 'File upload error: ' + err.message
        });
      } else if (err) {
        return res.status(400).json({
          success: false,
          error: err.message
        });
      }

      // Check if file was provided
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No audio file provided'
        });
      }

      try {
        const language = req.body.language || 'en-US';
        console.log(`Processing file: ${req.file.path} in language: ${language}`);

        // Transcribe the file
        const transcriptionResult = await fileTranscriptionService.transcribeFile(req.file.path, language);

        // Clean up the uploaded file
        await fileTranscriptionService.cleanup(req.file.path);

        // If transcription was successful, extract entities
        if (transcriptionResult.success && transcriptionResult.results && transcriptionResult.results.length > 0) {
          try {
            // Combine all transcription results into a single text
            const combinedText = getCombinedTranscription(transcriptionResult.results);
            console.log(`Extracting entities from combined text (${combinedText.length} chars)`);
            
            // Extract entities from the combined text
            const entityResult = await entityService.extractEntities(combinedText);
            
            // Add entities to the response
            if (entityResult && entityResult.entities) {
              console.log(`Found ${entityResult.entities.length} entities in the transcription`);
              transcriptionResult.entities = entityResult.entities;
            } else {
              console.log('No entities found in the transcription');
              transcriptionResult.entities = [];
            }
          } catch (entityError) {
            console.error('Error extracting entities:', entityError);
            transcriptionResult.entities = [];
          }
        }

        // Return the transcription results with entities
        res.json(transcriptionResult);

      } catch (error) {
        console.error('Error processing file:', error);
        // Clean up the uploaded file in case of error
        if (req.file) {
          await fileTranscriptionService.cleanup(req.file.path);
        }
        res.status(500).json({
          success: false,
          error: 'Error processing file: ' + error.message
        });
      }
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: 'Unexpected error occurred'
    });
  }
}; 