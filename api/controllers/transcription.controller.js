import transcriptionService from '../services/transcription.service.js';

// Store active transcription sessions
const activeSessions = new Map();

/**
 * Handle a new WebSocket connection for real-time transcription
 * @param {object} socket - The socket.io socket object
 */
export const handleSocketConnection = (socket) => {
  console.log(`New socket connection established: ${socket.id}`);
  
  let mediaStream = null;
  let isFirstChunk = true;
  let isStreamActive = false;
  
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