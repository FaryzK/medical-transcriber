import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

export default function RealTimeTranscription() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [interimTranscription, setInterimTranscription] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [error, setError] = useState(null);
  const [language, setLanguage] = useState('en-US');
  const [simulationMode, setSimulationMode] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [generatedFiles, setGeneratedFiles] = useState([]);
  
  const socketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  
  // Connect to the WebSocket server when component mounts
  useEffect(() => {
    // Connect to WebSocket when component mounts
    if (!socketRef.current) {
      socketRef.current = connectSocket();
    }
    
    // Cleanup function to run when component unmounts
    return () => {
      if (socketRef.current) {
        console.log('Cleaning up socket connection');
        socketRef.current.disconnect();
      }
      if (streamRef.current) {
        console.log('Cleaning up media streams');
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);
  
  // Helper function to add debug info
  const addDebug = (message) => {
    setDebugInfo(prev => prev + (prev ? '\n' : '') + message);
  };
  
  const connectSocket = () => {
    setIsConnecting(true);
    setError(null);
    addDebug('Attempting to connect to WebSocket server...');

    // Use a relative URL that will work with Vite's proxy
    const socket = io('/transcription', {
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
      forceNew: true,
      path: '/socket.io'
    });

    addDebug('Connecting to Socket.IO...');

    socket.on('connect', () => {
      addDebug(`Connected to server with socket ID: ${socket.id}`);
      setIsConnecting(false);
      setIsConnected(true);
      setConnectionStatus('connected');
      
      // Upon connection, send ready event to server
      addDebug(`Starting transcription in ${language}`);
      socket.emit('ready', { language }, (response) => {
        if (response?.status === 'success') {
          addDebug('Transcription service ready');
          setSimulationMode(response.simulation || false);
        } else if (response?.status === 'error') {
          addDebug(`Error starting transcription: ${response.message}`);
          setError(`Failed to start transcription: ${response.message}`);
          setConnectionStatus('error');
        }
      });
    });

    socket.on('ready', (data) => {
      addDebug(`Server ready: ${JSON.stringify(data)}`);
      setSimulationMode(data.simulation || false);
    });

    socket.on('transcription', (data) => {
      addDebug(`Received transcription data: ${JSON.stringify(data)}`);
      
      if (data.results && data.results.length > 0) {
        // Process transcription results
        const result = data.results[0];
        addDebug(`Processing result: ${JSON.stringify(result)}`);
        
        if (result.alternatives && result.alternatives.length > 0) {
          const transcript = result.alternatives[0].transcript || '';
          
          if (result.isFinal) {
            addDebug(`Final transcription: "${transcript}"`);
            setTranscription(prev => {
              const newTranscription = prev + (prev ? ' ' : '') + transcript;
              addDebug(`Updated transcription: "${newTranscription}"`);
              return newTranscription;
            });
            setInterimTranscription('');
          } else {
            addDebug(`Interim transcription: "${transcript}"`);
            setInterimTranscription(transcript);
          }
        } else {
          addDebug(`No alternatives found in result`);
        }
      } else {
        addDebug(`No results found in transcription data`);
      }
    });

    socket.on('error', (data) => {
      const errorMessage = data.message || 'Unknown error';
      addDebug(`Error from server: ${errorMessage}`);
      setError(errorMessage);
      setIsConnecting(false);
      setConnectionStatus('error');
    });

    socket.on('connect_error', (error) => {
      addDebug(`Connection error: ${error.message}`);
      setError(`Connection error: ${error.message}`);
      setIsConnecting(false);
      setIsConnected(false);
      setConnectionStatus('error');
    });

    socket.on('disconnect', (reason) => {
      addDebug(`Disconnected from server. Reason: ${reason}`);
      setIsConnected(false);
      setIsConnecting(false);
      setConnectionStatus('disconnected');
      
      if (reason === 'io server disconnect' || reason === 'transport close') {
        addDebug('Connection lost. Attempting to reconnect in 2 seconds...');
        setError('Connection to server was lost. Reconnecting...');
        
        // Stop recording if active
        if (isRecording) {
          stopRecording();
        }
        
        // Attempt to reconnect after a delay
        setTimeout(() => {
          if (!socketRef.current || !socketRef.current.connected) {
            addDebug('Reconnecting to server...');
            socketRef.current = connectSocket();
          }
        }, 2000);
      }
    });

    socketRef.current = socket;
    return socket;
  };
  
  const startRecording = async () => {
    try {
      setError(null);
      addDebug('Starting recording...');
      
      if (!socketRef.current || !socketRef.current.connected) {
        addDebug('Socket not connected. Connecting...');
        socketRef.current = connectSocket();
        
        // Wait for connection to be established before proceeding
        addDebug('Waiting for connection before starting recording...');
        await new Promise((resolve) => {
          const checkConnection = setInterval(() => {
            if (socketRef.current && socketRef.current.connected) {
              clearInterval(checkConnection);
              resolve();
            }
          }, 500);
          
          // Timeout after 10 seconds
          setTimeout(() => {
            clearInterval(checkConnection);
            if (!socketRef.current || !socketRef.current.connected) {
              throw new Error('Could not connect to server after 10 seconds');
            }
          }, 10000);
        });
      }
      
      setIsRecording(true);
      setInterimTranscription('');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      addDebug('Got audio stream');
      streamRef.current = stream;
      
      // Configure MediaRecorder with optimal settings for Google Cloud Speech-to-Text
      const options = {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 48000
      };
      
      addDebug(`Creating MediaRecorder with options: ${JSON.stringify(options)}`);
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socketRef.current && socketRef.current.connected) {
          addDebug(`Audio data available: ${event.data.size} bytes`);
          event.data.arrayBuffer().then(buffer => {
            const uint8Array = new Uint8Array(buffer);
            addDebug(`Sending ${uint8Array.length} bytes of audio data`);
            socketRef.current.emit('audioData', uint8Array);
          }).catch(err => {
            addDebug(`Error converting audio data: ${err.message}`);
          });
        } else {
          if (event.data.size === 0) {
            addDebug(`Empty audio data received`);
          }
          if (!socketRef.current) {
            addDebug(`Socket reference is null`);
          } else if (!socketRef.current.connected) {
            addDebug(`Socket not connected`);
          }
        }
      };
      
      recorder.onstop = () => {
        addDebug('Recorder stopped');
        
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('stop');
          addDebug('Sent stop signal to server');
        }
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
          addDebug('Audio stream tracks stopped');
        }
        
        setIsRecording(false);
      };
      
      // Start recording with small time slices for real-time transcription
      recorder.start(250);
      addDebug('Recorder started with 250ms time slices');
      
    } catch (error) {
      addDebug(`Error starting recording: ${error.message}`);
      setError(`Could not start recording: ${error.message}`);
      setIsRecording(false);
      setConnectionStatus('error');
    }
  };
  
  const stopRecording = () => {
    try {
      addDebug('Stopping recording...');
      
      // Stop local recording first to prevent new audio data
      stopLocalRecording();
      
      // Tell the server to stop transcription
      if (socketRef.current && socketRef.current.connected) {
        addDebug('Emitting stop event to server');
        socketRef.current.emit('stop');
        
        // Wait for server acknowledgment
        socketRef.current.once('stopped', (data) => {
          addDebug('Received stop acknowledgment from server');
          setIsRecording(false);
          setConnectionStatus('connected');
        });
        
        // Set a timeout for the acknowledgment
        setTimeout(() => {
          if (isRecording) {
            addDebug('Stop acknowledgment timeout - forcing stop');
            setIsRecording(false);
            setConnectionStatus('connected');
          }
        }, 2000);
      } else {
        // If no socket connection, just stop recording
        setIsRecording(false);
        setConnectionStatus('disconnected');
      }
      
      addDebug('Stop sequence initiated');
    } catch (err) {
      console.error('Error stopping recording:', err);
      addDebug(`Stop recording error: ${err.message}`);
      setError(`Failed to stop recording: ${err.message}`);
      // Force recording state to false even if there was an error
      setIsRecording(false);
      setConnectionStatus('error');
    }
  };
  
  // Helper function to stop local recording components
  const stopLocalRecording = () => {
    addDebug('Stopping local recording components...');
    
    // Stop the MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      addDebug('Stopping MediaRecorder');
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    
    // Stop all tracks in the stream
    if (streamRef.current) {
      addDebug('Stopping audio tracks');
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        addDebug(`Stopped track: ${track.kind}`);
      });
      streamRef.current = null;
    }
  };
  
  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };
  
  const handleClearTranscription = () => {
    setTranscription('');
    setInterimTranscription('');
  };
  
  const clearDebugInfo = () => {
    setDebugInfo('');
  };
  
  const handleGenerateDocuments = async () => {
    if (!transcription) {
      setError('No transcription available to generate documents');
      return;
    }

    try {
      addDebug('Generating documents...');
      const response = await fetch('/api/generate-documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: transcription,
          language: language
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate documents');
      }

      setGeneratedFiles(data.files);
      addDebug('Documents generated and download initiated');
    } catch (error) {
      console.error('Error generating documents:', error);
      addDebug(`Document generation error: ${error.message}`);
      setError(`Failed to generate documents: ${error.message}`);
    }
  };
  
  const handleDownloadFile = async (filename) => {
    try {
      const response = await fetch(`/api/download-document/${filename}`);
      
      if (!response.ok) {
        throw new Error('File not found');
      }
      
      // Create a blob from the file data
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Create a temporary link and click it to download
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Failed to download file: ' + error.message);
    }
  };
  
  return (
    <div className="p-4 space-y-4 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold text-gray-800">Real-time Transcription</h2>
      
      {simulationMode && (
        <div className="p-2 bg-yellow-100 text-yellow-800 rounded">
          <p className="text-sm font-medium">Running in simulation mode - No Google Cloud credentials available</p>
          <p className="text-xs">Transcriptions are simulated for demonstration purposes</p>
        </div>
      )}
      
      {/* Language selector */}
      <div className="mb-4">
        <label htmlFor="language" className="block text-sm font-medium text-gray-700">
          Language
        </label>
        <select
          id="language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          disabled={isRecording}
        >
          <option value="en-US">English (US)</option>
          <option value="zh">Mandarin Chinese</option>
        </select>
        <p className="mt-1 text-sm text-gray-500">
          Select the language you'll be speaking before starting the recording.
        </p>
      </div>
      
      {/* Status indicator */}
      <div className="flex items-center space-x-2">
        <div
          className={`h-3 w-3 rounded-full ${
            connectionStatus === 'connected'
              ? 'bg-green-500'
              : connectionStatus === 'connecting'
              ? 'bg-yellow-500'
              : connectionStatus === 'error'
              ? 'bg-red-500'
              : 'bg-gray-500'
          }`}
        ></div>
        <span className="text-sm text-gray-600">
          {connectionStatus === 'connected'
            ? 'Connected' + (isRecording ? ' - Recording' : '')
            : connectionStatus === 'connecting'
            ? 'Connecting...'
            : connectionStatus === 'error'
            ? 'Connection Error'
            : 'Disconnected'}
        </span>
      </div>
      
      {/* Error message */}
      {error && (
        <div className="p-2 text-sm text-red-700 bg-red-100 rounded-md">
          {error}
        </div>
      )}
      
      {/* Transcription output */}
      <div className="mt-4">
        <div className="p-3 bg-gray-50 rounded-md min-h-[100px] max-h-[300px] overflow-y-auto border border-gray-200">
          {!transcription && !interimTranscription && !isRecording ? (
            <p className="text-gray-400 italic">Transcription will appear here...</p>
          ) : (
            <div className="text-gray-800 whitespace-pre-wrap">
              {transcription}
              {interimTranscription && (
                <span className="text-gray-400 italic"> {interimTranscription}</span>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Controls */}
      <div className="flex space-x-3 mb-4">
        <button
          onClick={toggleRecording}
          className={`px-4 py-2 font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            isRecording
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          } focus:ring-blue-500`}
        >
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </button>

        <button
          onClick={handleClearTranscription}
          disabled={!transcription && !interimTranscription}
          className={`px-4 py-2 font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            !transcription && !interimTranscription
              ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          } focus:ring-gray-500`}
        >
          Clear Results
        </button>

        <button
          onClick={handleGenerateDocuments}
          disabled={!transcription || isRecording}
          className={`px-4 py-2 font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            !transcription || isRecording
              ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700'
          } focus:ring-green-500`}
        >
          Generate Documents
        </button>
      </div>
      
      {generatedFiles.length > 0 && (
        <div className="mt-4">
          <h3 className="text-lg font-semibold mb-2">Generated Documents</h3>
          <div className="space-y-2">
            {generatedFiles.map((file, index) => (
              <button
                key={index}
                onClick={() => handleDownloadFile(file.filename)}
                className="block w-full text-left px-4 py-2 bg-white hover:bg-gray-50 border rounded-md shadow-sm group"
              >
                <div className="flex items-center space-x-2">
                  <svg 
                    className="w-5 h-5 text-gray-500 group-hover:text-gray-700" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" 
                    />
                  </svg>
                  <span className="text-blue-600 group-hover:text-blue-800 underline">
                    {file.filename}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      
      <div className="text-xs text-gray-500 mt-2">
        <p>Speak clearly into your microphone. Transcription may take a moment to process.</p>
        {simulationMode && (
          <p className="mt-1">Note: In simulation mode, transcription is not based on actual audio content.</p>
        )}
      </div>
      
      {/* Debug Information Section */}
      <div className="mt-6 p-2 border border-gray-200 rounded">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-medium text-gray-700">Debug Information</h3>
          <button 
            onClick={clearDebugInfo}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        </div>
        <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-[150px] whitespace-pre-wrap">
          {debugInfo || 'No debug information available'}
        </pre>
      </div>
    </div>
  );
} 