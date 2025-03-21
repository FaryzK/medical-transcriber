import { SpeechClient } from '@google-cloud/speech';
import dotenv from 'dotenv';

dotenv.config();

class TranscriptionService {
  constructor() {
    this.useRealTranscription = process.env.USE_REAL_TRANSCRIPTION === 'true' || false;
    this.forceDisableSimulation = process.env.FORCE_DISABLE_SIMULATION === 'true' || false;
    
    console.log(`TranscriptionService init - Use real transcription: ${this.useRealTranscription}`);
    console.log(`TranscriptionService init - Force disable simulation: ${this.forceDisableSimulation}`);
    
    try {
      // If credentials are provided directly in the environment variable
      if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
        console.log('Using Google Cloud credentials from environment variable');
        try {
          const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
          this.speechClient = new SpeechClient({ credentials });
          console.log('Successfully initialized Google Speech client');
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
        console.log('Successfully initialized Google Speech client');
      } 
      // No valid credentials found
      else {
        console.warn('No Google Cloud credentials found. Speech-to-Text functionality will not work properly.');
        this.speechClient = null;
      }
    } catch (error) {
      console.error('Error initializing Google Speech client:', error);
      this.speechClient = null;
    }
  }

  /**
   * Initialize a streaming recognition request with Google Speech-to-Text
   * @param {function} callback - Callback function for receiving transcription results
   * @returns {object} The streaming recognize object
   */
  createStreamingRecognitionRequest(callback) {
    // If simulation is forcibly disabled and we don't have a speech client, that's an error
    if (this.forceDisableSimulation && !this.speechClient) {
      const errorMsg = 'Real transcription requested but no Google Speech client available';
      console.error(errorMsg);
      callback({ error: errorMsg });
      return null;
    }
    
    // Check if Speech client is available and we're not forcing real transcription
    if (!this.speechClient && !this.forceDisableSimulation) {
      console.log('No Google Speech client available, using simulation');
      callback({ 
        simulation: true, 
        status: 'ready' 
      });
      
      // Fall back to simulation
      this.recognizeStream = this.createSimulatedRecognizeStream(callback);
      return this.recognizeStream;
    }
    
    console.log('Using real Google Cloud Speech-to-Text service');
    
    try {
      // Create a recognize stream with proper configuration
      const request = {
        config: {
          encoding: 'WEBM_OPUS',  // Match MediaRecorder format
          sampleRateHertz: 48000, // Standard for most browsers
          languageCode: 'en-US',
          enableAutomaticPunctuation: true,
          model: 'default',
          useEnhanced: true,
          audioChannelCount: 1,
        },
        interimResults: true,
      };

      console.log('Creating Speech-to-Text streaming recognition with config:', JSON.stringify(request));

      // Create a stream that the client can write to
      this.recognizeStream = this.speechClient
        .streamingRecognize(request)
        .on('error', (error) => {
          console.error('Google Speech API error:', error);
          callback({ error: error.message || 'Speech recognition error' });
        })
        .on('data', (data) => {
          console.log('Received transcription result:', JSON.stringify(data.results));
          // Send the raw results - the controller will handle parsing
          callback({ results: data.results });
        });
      
      // Notify that the service is ready
      callback({ status: 'ready', simulation: false });
      console.log('Real transcription service ready');

      return this.recognizeStream;
    } catch (error) {
      console.error('Error creating streaming recognition request:', error);
      
      // Only fall back to simulation if not explicitly forbidden
      if (!this.forceDisableSimulation) {
        console.log('Falling back to simulation due to error');
        callback({ 
          error: `Failed to create streaming recognition: ${error.message}`,
          simulation: true 
        });
        
        this.recognizeStream = this.createSimulatedRecognizeStream(callback);
        return this.recognizeStream;
      } else {
        callback({ 
          error: `Failed to create streaming recognition: ${error.message}`,
          simulation: false
        });
        return null;
      }
    }
  }
  
  getRecognizeStream() {
    return this.recognizeStream;
  }
  
  /**
   * Create a simulated recognize stream for testing without credentials
   * @param {function} callback - Callback function for receiving transcription results
   * @returns {object} A mock stream with write and end methods
   */
  createSimulatedRecognizeStream(callback) {
    console.log("Creating simulated transcription service");
    
    // Medical phrases to simulate transcription
    const medicalPhrases = [
      "Patient presents with fever and cough",
      "Blood pressure 120 over 80",
      "Lungs clear to auscultation bilaterally",
      "Heart rate is within normal limits",
      "Patient denies shortness of breath",
      "No signs of respiratory distress",
      "Patient reports pain level of 4 out of 10",
      "Medication administered as ordered",
      "Follow up appointment scheduled in two weeks",
      "Laboratory results are within normal range"
    ];
    
    let isActive = true;
    let autoAdvanceTimer = null;
    let counter = 0;
    
    // Function to send a simulated transcription result
    const sendSimulatedResult = (final = false) => {
      if (!isActive) return;
      
      if (!final) {
        // Send an interim result
        console.log('[SIMULATION] Sending interim transcription result');
        callback({
          results: [
            {
              alternatives: [
                {
                  transcript: "Processing...",
                }
              ],
              isFinal: false
            }
          ]
        });
      } else {
        // Send a final result
        const phrase = medicalPhrases[counter % medicalPhrases.length];
        counter++;
        
        console.log(`[SIMULATION] Sending final transcription: "${phrase}"`);
        callback({
          results: [
            {
              alternatives: [
                {
                  transcript: phrase,
                }
              ],
              isFinal: true
            }
          ]
        });
        
        // Schedule next transcription if still active
        if (isActive) {
          autoAdvanceTimer = setTimeout(() => {
            sendSimulatedResult(false);
            setTimeout(() => sendSimulatedResult(true), 1000);
          }, 5000);
        }
      }
    };
    
    // Create a mock stream object
    const mockStream = {
      write: (data) => {
        // When data is written, simulate a transcription result
        console.log(`[SIMULATION] Received audio data: ${data.length} bytes`);
        
        // Only process if active
        if (!isActive) return true;
        
        // Clear previous timers if they exist
        if (autoAdvanceTimer) {
          clearTimeout(autoAdvanceTimer);
        }
        
        // Set a new timer to simulate processing delay
        autoAdvanceTimer = setTimeout(() => {
          sendSimulatedResult(false);
          
          // Then send a final result after a short delay
          setTimeout(() => {
            sendSimulatedResult(true);
          }, 500);
        }, 300);
        
        return true;
      },
      
      end: () => {
        // Mark as inactive
        console.log('[SIMULATION] Ending simulated transcription stream');
        isActive = false;
        
        // Clean up timers
        if (autoAdvanceTimer) {
          clearTimeout(autoAdvanceTimer);
        }
      }
    };
    
    // Start sending simulated results right away
    console.log('[SIMULATION] Starting initial transcription');
    setTimeout(() => {
      if (isActive) {
        sendSimulatedResult(false);
        setTimeout(() => sendSimulatedResult(true), 1000);
      }
    }, 1000);
    
    return mockStream;
  }
}

export default new TranscriptionService(); 