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
  
  // Handle ready event from client
  socket.on('ready', (data, callback) => {
    console.log(`Client ${socket.id} ready for transcription. Language: ${data?.language || 'en-US'}`);
    
    try {
      // Use the imported singleton instance
      // Start the transcription service
      transcriptionService.createStreamingRecognitionRequest((data) => {
        console.log(`Transcription service response: ${JSON.stringify(data)}`);
        
        if (data.error) {
          console.error(`Transcription error: ${data.error}`);
          socket.emit('error', { message: `Transcription error: ${data.error}` });
          return;
        }
        
        if (data.status === 'ready') {
          console.log('Transcription service ready');
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
          console.log(`Emitting transcription results to client ${socket.id}: ${JSON.stringify(data.results)}`);
          socket.emit('transcription', data);
        }
      });
      
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
      console.log(`[AudioData] Received audio data from client ${socket.id}, size: ${data.length} bytes`);
      
      if (!mediaStream) {
        console.error('No active transcription stream available');
        socket.emit('error', { message: 'No active transcription stream available' });
        return;
      }
      
      // Log info about the first chunk to help with debugging
      if (isFirstChunk) {
        console.log(`First audio chunk received: ${data.length} bytes`);
        console.log(`Audio data type: ${Object.prototype.toString.call(data)}`);
        isFirstChunk = false;
      }
      
      // Write the audio data to the transcription service stream
      const writeSuccess = mediaStream.write(data);
      
      if (!writeSuccess) {
        console.warn('Write operation returned false - backpressure may be occurring');
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
      if (mediaStream) {
        console.log('Ending media stream...');
        mediaStream.end();
        mediaStream = null;
        console.log('Media stream ended successfully');
        console.log('Transcription service stopped successfully');
      } else {
        console.log('No active media stream to end');
      }
      
      socket.emit('stopped', { message: 'Transcription stopped successfully' });
    } catch (error) {
      console.error(`Error stopping transcription: ${error.message}`);
      socket.emit('error', { message: `Error stopping transcription: ${error.message}` });
    }
  });
  
  // Handle disconnect event
  socket.on('disconnect', (reason) => {
    console.log(`Client ${socket.id} disconnected. Reason: ${reason}`);
    
    try {
      if (mediaStream) {
        console.log('Ending media stream due to disconnect...');
        mediaStream.end();
        mediaStream = null;
        console.log('Media stream ended due to disconnect');
        console.log('Transcription service stopped due to disconnect');
      }
    } catch (error) {
      console.error(`Error cleaning up on disconnect: ${error.message}`);
    }
  });
}; 