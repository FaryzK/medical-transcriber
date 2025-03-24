import documentService from '../services/document.service.js';
import fs from 'fs';

/**
 * Generate documents from transcription
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
export const generateDocuments = async (req, res) => {
  try {
    const { text, language } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'No transcription text provided'
      });
    }

    const files = await documentService.processTranscription(text, language);
    
    // Return file paths for download
    res.json({
      success: true,
      files: files.map(filepath => ({
        path: filepath,
        filename: filepath.split('/').pop()
      }))
    });

  } catch (error) {
    console.error('Error generating documents:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Download a generated document
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
export const downloadDocument = async (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = `${process.cwd()}/api/documents/${filename}`;

    if (!filename) {
      return res.status(400).json({
        success: false,
        error: 'No filename provided'
      });
    }

    // Check if file exists
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Set headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    // Send file and delete it after download
    res.download(filepath, filename, (err) => {
      if (err) {
        console.error('Error downloading file:', err);
        // Only send error if headers haven't been sent yet
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Error downloading file'
          });
        }
      }
    });

  } catch (error) {
    console.error('Error in downloadDocument:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}; 