import transcriptionService from '../services/transcription.service.js';
import entityService from '../services/entity.service.js';

// Store active transcription sessions
const activeSessions = new Map();

let transcriptionStream = null;
let isStreamActive = false;
let confirmedText = '';
let lastProcessedLength = 0;

/**
 * Handle a new WebSocket connection for real-time transcription
 * @param {object} socket - The socket.io socket object
 */
export const handleSocketConnection = (socket) => {
  console.log(`New socket connection established: ${socket.id}`);
  
  let mediaStream = null;
  let isFirstChunk = true;
  
  // Handle ready event from client
  socket.on('ready', (data, callback) => {
    console.log(`Client ${socket.id} ready for transcription. Language: ${data?.language || 'en-US'}`);
    
    try {
      // Extract language from the data or use English as default
      const language = data?.language || 'en-US';
      
      // Use the imported singleton instance
      // Start the transcription service with the selected language
      transcriptionService.createStreamingRecognitionRequest((data) => {
        console.log(`Transcription service response: ${JSON.stringify(data)}`);
        
        if (data.error) {
          console.error(`Transcription error: ${data.error}`);
          socket.emit('error', { message: `Transcription error: ${data.error}` });
          return;
        }
        
        if (data.status === 'ready') {
          console.log('Transcription service ready');
          isStreamActive = true;
          socket.emit('ready', { 
            simulation: data.simulation || false,
            message: 'Transcription service ready' 
          });
          
          if (typeof callback === 'function') {
            callback({ 
              status: 'success', 
              simulation: data.simulation || false
            });
          }
        } else if (data.results) {
          if (isStreamActive) {
            console.log(`Emitting transcription results to client ${socket.id}: ${JSON.stringify(data.results)}`);
            socket.emit('transcription', data);
          }
        }
      }, language);
      
      mediaStream = transcriptionService.getRecognizeStream();
      console.log(`Media stream initialized for client ${socket.id}`);
      
      // Reset the first chunk flag
      isFirstChunk = true;
      
    } catch (error) {
      console.error(`Error initializing transcription: ${error.message}`);
      socket.emit('error', { message: `Failed to initialize transcription: ${error.message}` });
      
      if (typeof callback === 'function') {
        callback({ status: 'error', message: error.message });
      }
    }
  });
  
  // Handle audio data from client
  socket.on('audioData', (data) => {
    try {
      if (!mediaStream) {
        console.error('No active transcription stream available');
        socket.emit('error', { message: 'No active transcription stream available' });
        return;
      }

      // Only log and emit error if stream is not active and not in stopping state
      if (!isStreamActive && !mediaStream.stopping) {
        console.error('Stream is not active');
        socket.emit('error', { message: 'Stream is not active. Please start a new recording.' });
        return;
      }
      
      console.log(`[AudioData] Received audio data from client ${socket.id}, size: ${data.length} bytes`);
      
      // Log info about the first chunk to help with debugging
      if (isFirstChunk) {
        console.log(`First audio chunk received: ${data.length} bytes`);
        console.log(`Audio data type: ${Object.prototype.toString.call(data)}`);
        isFirstChunk = false;
      }
      
      // Write the audio data to the transcription service stream if it's still available
      if (mediaStream && !mediaStream.destroyed) {
        const writeSuccess = mediaStream.write(data);
        
        if (!writeSuccess) {
          console.warn('Write operation returned false - backpressure may be occurring');
        }
      }
    } catch (error) {
      console.error(`Error processing audio data: ${error.message}`);
      console.error(error.stack);  // Log the full stack trace
      socket.emit('error', { message: `Error processing audio data: ${error.message}` });
    }
  });
  
  // Handle stop event from client
  socket.on('stop', () => {
    console.log(`Client ${socket.id} stopping transcription`);
    try {
      if (!mediaStream) {
        socket.emit('stopped', { message: 'Transcription already stopped' });
        return;
      }

      // Mark stream as stopping to handle graceful shutdown
      mediaStream.stopping = true;
      isStreamActive = false;
      
      // Give a small delay to allow any in-flight audio data to be processed
      setTimeout(() => {
        try {
          if (mediaStream) {
            console.log('Ending media stream...');
            mediaStream.end();
            mediaStream = null;
            console.log('Media stream ended successfully');
          }
          
          // Send stop acknowledgment to client
          socket.emit('stopped', { message: 'Transcription stopped successfully' });
        } catch (error) {
          console.error(`Error in delayed stream cleanup: ${error.message}`);
          socket.emit('error', { message: `Error stopping transcription: ${error.message}` });
        }
      }, 500); // 500ms delay to allow in-flight data to be processed
      
    } catch (error) {
      console.error(`Error stopping transcription: ${error.message}`);
      socket.emit('error', { message: `Error stopping transcription: ${error.message}` });
    }
  });
  
  // Handle disconnect event
  socket.on('disconnect', (reason) => {
    console.log(`Client ${socket.id} disconnected. Reason: ${reason}`);
    
    try {
      isStreamActive = false;
      
      if (mediaStream) {
        console.log('Ending media stream due to disconnect...');
        mediaStream.end();
        mediaStream = null;
        console.log('Media stream ended due to disconnect');
      }
    } catch (error) {
      console.error(`Error cleaning up on disconnect: ${error.message}`);
    }
  });
};

export function startTranscription(req, res) {
  // ... existing code ...
}

export function stopTranscription(req, res) {
  // ... existing code ...
}

export async function audioData(req, res) {
  try {
    if (!isStreamActive) {
      return res.status(400).json({ error: 'No active transcription stream available' });
    }

    const { audioData } = req.body;

    if (!audioData) {
      return res.status(400).json({ error: 'No audio data provided' });
    }

    const results = await transcriptionService.processAudioData(audioData, transcriptionStream);
    
    if (results && results.results) {
      // Get the most stable results (highest stability = confirmed text)
      const stable = results.results.filter(result => result.isFinal);
      
      if (stable.length > 0) {
        // Update confirmed text with the latest stable results
        const transcript = stable
          .map(result => result.alternatives[0].transcript)
          .join(' ');
        
        // Append to confirmed text
        confirmedText += ' ' + transcript;
        confirmedText = confirmedText.trim();
        
        // Extract entities from the newly confirmed portion
        if (confirmedText.length > lastProcessedLength) {
          const newText = confirmedText.substring(lastProcessedLength);
          const entities = await entityService.extractEntities(newText);
          
          // Adjust entity indices to match the full text
          if (entities && entities.entities) {
            entities.entities.forEach(entity => {
              entity.startIndex += lastProcessedLength;
              entity.endIndex += lastProcessedLength;
            });
            
            // Send entities back to the client
            global.io.emit('entities', { 
              confirmedText, 
              entities: entities.entities,
              newTextStartIndex: lastProcessedLength
            });
          }
          
          lastProcessedLength = confirmedText.length;
        }
      }

      return res.json(results);
    }

    return res.json({});
  } catch (error) {
    console.error('Error processing audio data:', error);
    return res.status(500).json({ error: 'Failed to process audio data' });
  }
}

export function endTranscriptionSession(req, res) {
  try {
    transcriptionStream = null;
    isStreamActive = false;
    confirmedText = '';
    lastProcessedLength = 0;
    
    return res.json({ success: true });
  } catch (error) {
    console.error('Error ending transcription session:', error);
    return res.status(500).json({ error: 'Failed to end transcription session' });
  }
}

export function setupTranscriptionSocket(namespace) {
  namespace.on('connection', (socket) => {
    console.log(`New transcription connection: ${socket.id}`);
    
    let recognizeStream = null;
    let sessionId = null;
    let confirmedText = '';
    let lastProcessedLength = 0;
    
    // Handle ready event from client
    socket.on('ready', async ({ language = 'en-US' }, callback) => {
      try {
        console.log(`Client ${socket.id} ready for transcription in language: ${language}`);
        
        // Generate a unique session ID
        sessionId = `session_${Date.now()}_${socket.id}`;
        console.log(`Created session ID: ${sessionId}`);
        
        // Initialize transcription stream
        recognizeStream = transcriptionService.createStreamingRecognitionRequest((data) => {
          // Handle errors
          if (data.error) {
            console.error(`Error in transcription session ${sessionId}:`, data.error);
            socket.emit('error', { message: data.error });
            return;
          }
          
          // Forward transcription results to the client
          if (data.results) {
            socket.emit('transcription', data);
            
            // Process confirmed (final) segments for entity extraction
            const stable = data.results.filter(result => result.isFinal);
            
            if (stable.length > 0) {
              // Update confirmed text with the latest stable results
              const transcript = stable
                .map(result => result.alternatives[0].transcript)
                .join(' ');
              
              // Append to confirmed text
              confirmedText += ' ' + transcript;
              confirmedText = confirmedText.trim();
              
              // Extract entities from the newly confirmed portion
              if (confirmedText.length > lastProcessedLength) {
                const newText = confirmedText.substring(lastProcessedLength);
                processEntities(newText, confirmedText, lastProcessedLength, socket);
                lastProcessedLength = confirmedText.length;
              }
            }
          }
          
          // Forward status updates to the client
          if (data.status) {
            socket.emit('ready', data);
          }
        }, language);
        
        // Store session information
        activeSessions.set(sessionId, {
          socket,
          recognizeStream,
          language,
          confirmedText,
          lastProcessedLength
        });
        
        // Return success to the client
        if (callback) {
          callback({ 
            status: 'success', 
            sessionId, 
            simulation: recognizeStream?.simulation || false
          });
        }
      } catch (error) {
        console.error('Error setting up transcription:', error);
        if (callback) {
          callback({ status: 'error', message: error.message });
        }
      }
    });
    
    // Handle audio data from client
    socket.on('audioData', async (audioData) => {
      try {
        if (!recognizeStream) {
          socket.emit('error', { message: 'No active transcription stream available' });
          return;
        }
        
        // Process the audio data
        if (Buffer.isBuffer(audioData) || (audioData instanceof Uint8Array)) {
          recognizeStream.write(audioData);
        } else {
          console.warn('Received non-buffer audio data:', typeof audioData);
          socket.emit('error', { message: 'Invalid audio data format' });
        }
      } catch (error) {
        console.error('Error processing audio data:', error);
        socket.emit('error', { message: 'Failed to process audio data: ' + error.message });
      }
    });
    
    // Handle stop signal from client
    socket.on('stop', () => {
      try {
        console.log(`Client ${socket.id} stopped transcription`);
        
        if (recognizeStream) {
          recognizeStream.end();
          recognizeStream = null;
        }
        
        socket.emit('transcriptionStopped');
        
        // Clean up session
        if (sessionId) {
          activeSessions.delete(sessionId);
          sessionId = null;
        }
        
        // Reset session data
        confirmedText = '';
        lastProcessedLength = 0;
      } catch (error) {
        console.error('Error stopping transcription:', error);
        socket.emit('error', { message: 'Failed to stop transcription: ' + error.message });
      }
    });
    
    // Handle disconnect event
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      
      // Clean up resources
      if (recognizeStream) {
        recognizeStream.end();
      }
      
      // Remove session
      if (sessionId) {
        activeSessions.delete(sessionId);
      }
    });
  });
}

// Process entities from confirmed text
async function processEntities(newText, fullText, startPosition, socket) {
  try {
    console.log(`Processing entities for text: "${newText}"`);
    console.log(`Start position in full text: ${startPosition}`);
    
    const entitiesResult = await entityService.extractEntities(newText);
    
    if (entitiesResult && entitiesResult.entities && entitiesResult.entities.length > 0) {
      console.log(`Extracted ${entitiesResult.entities.length} entities`);
      
      // Adjust indices to match position in the full text
      const adjustedEntities = entitiesResult.entities.map(entity => ({
        ...entity,
        startIndex: entity.startIndex + startPosition,
        endIndex: entity.endIndex + startPosition
      }));
      
      // Validate adjusted entities
      const validEntities = adjustedEntities.filter(entity => {
        const isValid = entity.startIndex >= 0 && 
                       entity.endIndex <= fullText.length && 
                       entity.startIndex < entity.endIndex;
        
        if (!isValid) {
          console.warn(`Invalid entity after adjustment: ${entity.category} at ${entity.startIndex}-${entity.endIndex}`);
        }
        
        return isValid;
      });
      
      // Send entities back to the client
      if (socket && socket.connected) {
        try {
          socket.emit('entities', { 
            confirmedText: fullText, 
            entities: validEntities,
            newTextStartIndex: startPosition
          });
          
          console.log(`Sent ${validEntities.length} entities to client at position ${startPosition}`);
        } catch (emitError) {
          console.error('Error emitting entities to client:', emitError);
        }
      } else {
        console.warn('Cannot send entities - socket disconnected');
      }
    } else {
      console.log('No entities extracted from text');
    }
  } catch (error) {
    console.error('Error processing entities:', error);
    // Don't try to emit if there was an error - it might be socket-related
  }
} 