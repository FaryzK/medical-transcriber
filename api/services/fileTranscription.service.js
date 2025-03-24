import { SpeechClient } from '@google-cloud/speech';
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
      // If credentials are provided directly in the environment variable
      if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
        console.log('Using Google Cloud credentials from environment variable');
        try {
          const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
          this.speechClient = new SpeechClient({ credentials });
          console.log('Successfully initialized Google Speech client for file transcription');
        } catch (parseError) {
          console.error('Error parsing GOOGLE_CLOUD_CREDENTIALS:', parseError);
          console.log('Falling back to credentials file path');
          this.speechClient = new SpeechClient();
        }
      } 
      // If credentials are provided as a file path
      else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.log('Using Google Cloud credentials from file path');
        this.speechClient = new SpeechClient();
        console.log('Successfully initialized Google Speech client for file transcription');
      } 
      // No valid credentials found
      else {
        console.warn('No Google Cloud credentials found. File transcription will not work properly.');
        this.speechClient = null;
      }
    } catch (error) {
      console.error('Error initializing Google Speech client:', error);
      this.speechClient = null;
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
      // Convert to mono WAV format with 48kHz sample rate
      await execAsync(`ffmpeg -y -i "${inputPath}" -ac 1 -ar 48000 "${outputPath}"`);
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
    if (!this.speechClient) {
      throw new Error('Speech client not initialized');
    }

    let monoFilePath = null;
    try {
      // Convert the file to mono WAV format
      monoFilePath = await this.convertToMono(filePath);
      
      // Read the converted file content
      const content = fs.readFileSync(monoFilePath);
      const audio = { content: content.toString('base64') };

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
        audio: audio,
        config: config,
      };

      console.log(`Processing file transcription request for ${monoFilePath}`);
      const [response] = await this.speechClient.recognize(request);
      
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
      // Clean up the converted mono file
      if (monoFilePath) {
        await this.cleanup(monoFilePath);
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