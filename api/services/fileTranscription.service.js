import { SpeechClient } from '@google-cloud/speech';
import { Storage } from '@google-cloud/storage';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

dotenv.config();

class FileTranscriptionService {
  constructor() {
    try {
      // Initialize both Speech and Storage clients
      if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
        console.log('Using Google Cloud credentials from environment variable');
        try {
          const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
          this.speechClient = new SpeechClient({ credentials });
          this.storageClient = new Storage({ credentials });
          console.log('Successfully initialized Google clients');
        } catch (parseError) {
          console.error('Error parsing GOOGLE_CLOUD_CREDENTIALS:', parseError);
          console.log('Falling back to credentials file path');
          this.speechClient = new SpeechClient();
          this.storageClient = new Storage();
        }
      } 
      else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.log('Using Google Cloud credentials from file path');
        this.speechClient = new SpeechClient();
        this.storageClient = new Storage();
        console.log('Successfully initialized Google clients');
      } 
      else {
        console.warn('No Google Cloud credentials found. File transcription will not work properly.');
        this.speechClient = null;
        this.storageClient = null;
      }
    } catch (error) {
      console.error('Error initializing Google clients:', error);
      this.speechClient = null;
      this.storageClient = null;
    }
  }

  /**
   * Upload file to Google Cloud Storage
   * @param {string} filePath - Path to the file to upload
   * @returns {Promise<string>} GCS URI
   */
  async uploadToGCS(filePath) {
    if (!this.storageClient) {
      throw new Error('Storage client not initialized');
    }

    const bucketName = process.env.GCS_BUCKET_NAME;
    if (!bucketName) {
      throw new Error('GCS_BUCKET_NAME environment variable not set');
    }

    const fileName = path.basename(filePath);
    const gcsFileName = `transcription/${Date.now()}-${fileName}`;

    await this.storageClient.bucket(bucketName).upload(filePath, {
      destination: gcsFileName,
      metadata: {
        contentType: 'audio/wav'
      }
    });

    return `gs://${bucketName}/${gcsFileName}`;
  }

  /**
   * Delete file from Google Cloud Storage
   * @param {string} gcsUri - GCS URI of the file to delete
   */
  async deleteFromGCS(gcsUri) {
    if (!this.storageClient) return;

    const bucketName = process.env.GCS_BUCKET_NAME;
    if (!bucketName) return;

    // Extract the full path from the GCS URI (everything after bucket name)
    const fileName = gcsUri.split(`${bucketName}/`)[1];
    if (!fileName) return;

    try {
      await this.storageClient.bucket(bucketName).file(fileName).delete();
      console.log(`Successfully deleted file from GCS: ${fileName}`);
    } catch (error) {
      console.error('Error deleting file from GCS:', error);
      // Don't throw the error since this is cleanup
    }
  }

  /**
   * Convert audio file to mono WAV format using ffmpeg
   * @param {string} inputPath - Path to the input audio file
   * @returns {Promise<string>} Path to the converted file
   */
  async convertToMono(inputPath) {
    const outputPath = inputPath.replace(/\.[^/.]+$/, '') + '_mono.wav';
    try {
      // Log original file size
      const originalSize = fs.statSync(inputPath).size;
      console.log(`Original file size: ${originalSize} bytes (${(originalSize / 1024 / 1024).toFixed(2)} MB)`);
      
      // Convert to mono WAV format with 16kHz sample rate and compression
      await execAsync(`ffmpeg -y -i "${inputPath}" -ac 1 -ar 16000 -acodec pcm_s16le "${outputPath}"`);
      
      // Log converted file size
      const convertedSize = fs.statSync(outputPath).size;
      console.log(`Converted file size: ${convertedSize} bytes (${(convertedSize / 1024 / 1024).toFixed(2)} MB)`);
      
      console.log(`Successfully converted ${inputPath} to mono`);
      return outputPath;
    } catch (error) {
      console.error('Error converting audio to mono:', error);
      throw new Error('Failed to convert audio to mono format');
    }
  }

  /**
   * Transcribe an audio file using Google Cloud Speech-to-Text
   * @param {string} filePath - Path to the audio file
   * @param {string} language - Language code (e.g., 'en-US', 'cmn-Hans-CN')
   * @returns {Promise<object>} Transcription results
   */
  async transcribeFile(filePath, language = 'en-US') {
    if (!this.speechClient || !this.storageClient) {
      throw new Error('Google clients not initialized');
    }

    let monoFilePath = null;
    let gcsUri = null;
    try {
      // Convert the file to mono WAV format
      monoFilePath = await this.convertToMono(filePath);
      
      // Upload to GCS
      gcsUri = await this.uploadToGCS(monoFilePath);
      console.log(`File uploaded to GCS: ${gcsUri}`);

      // Configure the request
      const config = {
        encoding: 'LINEAR16',
        languageCode: language === 'zh' ? 'cmn-Hans-CN' : language,
        enableAutomaticPunctuation: true,
        enableWordTimeOffsets: false,
        audioChannelCount: 1,
        enableSeparateRecognitionPerChannel: false,
        useEnhanced: true,
        model: 'default',
      };

      console.log('Using transcription config:', JSON.stringify(config, null, 2));

      const request = {
        audio: { uri: gcsUri },
        config: config,
      };

      console.log(`Processing file transcription request for ${gcsUri}`);
      
      // Start the long-running operation
      const [operation] = await this.speechClient.longRunningRecognize(request);
      
      // Wait for the operation to complete
      const [response] = await operation.promise();
      
      if (!response.results || response.results.length === 0) {
        console.warn('No transcription results returned from the API');
        return {
          success: false,
          error: 'No transcription results were generated. The audio might be unclear or empty.'
        };
      }

      // Process and format the results
      const results = response.results.map(result => ({
        transcript: result.alternatives[0].transcript,
        confidence: result.alternatives[0].confidence,
      }));

      return {
        success: true,
        results: results,
      };

    } catch (error) {
      console.error('Error transcribing file:', error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      // Clean up files
      if (monoFilePath) {
        await this.cleanup(monoFilePath);
      }
      if (gcsUri) {
        await this.deleteFromGCS(gcsUri);
      }
    }
  }

  /**
   * Clean up temporary files
   * @param {string} filePath - Path to the file to delete
   */
  async cleanup(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Cleaned up temporary file: ${filePath}`);
      }
    } catch (error) {
      console.error('Error cleaning up file:', error);
    }
  }
}

export default new FileTranscriptionService(); 