import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { FaSpinner } from 'react-icons/fa';

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
  const [isGeneratingDocuments, setIsGeneratingDocuments] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [entities, setEntities] = useState([]);
  const [confirmedText, setConfirmedText] = useState('');
  const [showTranscriptionModal, setShowTranscriptionModal] = useState(false);
  const [isPendingRecording, setIsPendingRecording] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  
  const socketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const transcriptionContainerRef = useRef(null);
  const userHasScrolledRef = useRef(false);
  
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
  
  // Add scroll event listener to detect manual scrolling
  useEffect(() => {
    const container = transcriptionContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (!isRecording) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 50;
      
      if (!isAtBottom && !userHasScrolledRef.current) {
        // User has scrolled up during recording
        userHasScrolledRef.current = true;
        setShouldAutoScroll(false);
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isRecording]);

  // Auto-scroll effect
  useEffect(() => {
    if (shouldAutoScroll && transcriptionContainerRef.current) {
      const container = transcriptionContainerRef.current;
      container.scrollTop = container.scrollHeight;
    }
  }, [transcription, interimTranscription, shouldAutoScroll]);
  
  // Function to format text with entities
  const formatTextWithEntities = (text, entities) => {
    try {
      if (!text || typeof text !== 'string') {
        return '';
      }
      
      if (!entities || !Array.isArray(entities) || entities.length === 0) {
        return text;
      }

      // Create a safe copy of entities with additional validation
      const safeEntities = entities.filter(entity => {
        try {
          // Double check if entity text actually matches the text at specified indices
          const actualText = text.substring(entity.startIndex, entity.endIndex);
          const isValid = entity && 
            typeof entity.startIndex === 'number' && 
            typeof entity.endIndex === 'number' &&
            entity.startIndex >= 0 && 
            entity.endIndex <= text.length &&
            entity.startIndex < entity.endIndex;
          
          if (!isValid) {
            console.warn(`Entity validation failed for ${entity?.category} at positions ${entity?.startIndex}-${entity?.endIndex}`);
          }
          
          return isValid;
        } catch (e) {
          console.error('Error validating entity:', e);
          return false;
        }
      });
      
      // Sort entities by startIndex in descending order to avoid index shifting
      const sortedEntities = [...safeEntities].sort((a, b) => b.startIndex - a.startIndex);
      
      let result = text;
      
      // Apply styling to each entity
      for (const entity of sortedEntities) {
        try {
          const { startIndex, endIndex, category, text: entityText } = entity;
          
          // Determine styling based on category
          let style = '';
          switch (category) {
            case 'PHI':
              style = 'color: red;';
              break;
            case 'CONDITION':
              style = 'color: darkgreen;';
              break;
            case 'ANATOMY':
              style = 'font-style: italic;';
              break;
            case 'MEDICATION':
              style = 'background-color: rgba(255, 255, 0, 0.3);';
              break;
            case 'PROCEDURE':
              style = 'color: darkblue;';
              break;
            default:
              continue;
          }
          
          // Insert styled spans
          const before = result.substring(0, startIndex);
          const textSegment = result.substring(startIndex, endIndex);
          const after = result.substring(endIndex);
          
          result = `${before}<span style="${style}" title="${category}: ${textSegment}">${textSegment}</span>${after}`;
        } catch (entityError) {
          console.error('Error formatting entity:', entityError);
          // Continue with next entity if there's an error with this one
        }
      }
      
      return result;
    } catch (error) {
      console.error('Error in formatTextWithEntities:', error);
      return text || ''; // Return original text if there's an error
    }
  };

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

    // Listen for entity events
    socket.on('entities', (data) => {
      try {
        addDebug(`Received entities: ${JSON.stringify(data)}`);
        if (data && data.entities && Array.isArray(data.entities) && data.confirmedText) {
          // Filter out any malformed entities
          const validEntities = data.entities.filter(entity => 
            entity && 
            typeof entity.startIndex === 'number' && 
            typeof entity.endIndex === 'number' &&
            entity.startIndex >= 0 && 
            entity.endIndex <= data.confirmedText.length &&
            entity.startIndex < entity.endIndex &&
            entity.category &&
            ['PHI', 'CONDITION', 'ANATOMY', 'MEDICATION', 'PROCEDURE'].includes(entity.category)
          );
          
          if (validEntities.length !== data.entities.length) {
            addDebug(`Filtered out ${data.entities.length - validEntities.length} invalid entities`);
          }
          
          setConfirmedText(data.confirmedText);
          
          // Completely replace entities to avoid duplicates and ensure updates
          setEntities(current => {
            // Remove any entities from the exact same text range (replacing with new ones)
            const filteredEntities = current.filter(existingEntity => {
              // Keep entities not in the current batch
              return !validEntities.some(newEntity => 
                newEntity.startIndex === existingEntity.startIndex && 
                newEntity.endIndex === existingEntity.endIndex
              );
            });
            
            // Add new entities
            return [...filteredEntities, ...validEntities];
          });
          
          addDebug(`Added ${validEntities.length} entities to display`);
        } else {
          addDebug('Received malformed entity data');
        }
      } catch (error) {
        addDebug(`Error processing entities: ${error.message}`);
        console.error('Error processing entity data:', error);
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
      
      // If we already have transcription, show modal to continue or start new
      if (transcription) {
        setIsPendingRecording(true);
        setShowTranscriptionModal(true);
        return; // Wait for user response via modal
      }
      
      // Otherwise, proceed with starting new recording
      await initializeRecording(false);
      
    } catch (error) {
      addDebug(`Error starting recording: ${error.message}`);
      setError(`Could not start recording: ${error.message}`);
      setIsRecording(false);
      setConnectionStatus('error');
      setIsPendingRecording(false);
    }
  };
  
  // New function to handle the actual recording initialization
  const initializeRecording = async (continueExisting) => {
    try {
      if (!continueExisting) {
        // Clear existing transcription to start fresh
        setTranscription('');
        setInterimTranscription('');
        setConfirmedText('');
        setEntities([]);
        addDebug('Starting new transcription, cleared previous data');
      } else {
        addDebug('Continuing with existing transcription');
      }
      
      // Reset auto-scroll state
      setShouldAutoScroll(true);
      userHasScrolledRef.current = false;
      
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
      } else {
        // If socket exists but we need to re-initialize the transcription
        addDebug('Re-initializing transcription service');
        socketRef.current.emit('ready', { language }, (response) => {
          if (response?.status === 'success') {
            addDebug('Transcription service re-initialized');
            setSimulationMode(response.simulation || false);
          } else if (response?.status === 'error') {
            addDebug(`Error re-initializing transcription: ${response.message}`);
            setError(`Failed to re-initialize transcription: ${response.message}`);
            setConnectionStatus('error');
          }
        });
      }
      
      setIsRecording(true);
      
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
      setIsPendingRecording(false);
      
    } catch (error) {
      setIsPendingRecording(false);
      throw error; // Rethrow to be caught by the caller
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
    setConfirmedText('');
    setEntities([]);
  };
  
  const clearDebugInfo = () => {
    setDebugInfo('');
  };
  
  const handleGenerateDocuments = async () => {
    if (!transcription) return;

    setIsGenerating(true);
    setGeneratedFiles([]);
    setError(null);

    try {
      console.log("Generating documents for text:", transcription.substring(0, 100) + "...");
      
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

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();
      console.log("Document generation response:", data);
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to generate documents');
      }
      
      // Process file objects from response
      const files = data.files || [];
      const processedFiles = files.map(file => {
        return typeof file === 'string' 
          ? { name: file, status: 'ready' }
          : { name: file.filename, status: 'ready' };
      });
      
      setGeneratedFiles(processedFiles);
      
    } catch (err) {
      console.error('Error generating documents:', err);
      setError(`Failed to generate documents: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleDownloadFile = async (filename) => {
    const downloadWindow = window.open(`/api/download-document/${filename}`, '_blank');
    if (!downloadWindow) {
      throw new Error('Pop-up blocked or failed to open download window');
    }
    
    return new Promise((resolve) => {
      // We can't perfectly track download completion in a new window
      // So we'll just resolve after a short timeout
      setTimeout(resolve, 1000);
    });
  };
  
  // Custom modal component for the transcription choice
  const TranscriptionModal = () => {
    if (!showTranscriptionModal) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Continue Transcription?</h3>
            <p className="text-gray-600 mb-4">
              You already have existing transcription text. Would you like to continue with the current text or start a new transcription?
            </p>
            <div className="flex flex-col space-y-2">
              <button
                onClick={() => {
                  setShowTranscriptionModal(false);
                  initializeRecording(true).catch(error => {
                    setError(`Failed to start recording: ${error.message}`);
                  });
                }}
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md"
              >
                Continue Current Transcription
              </button>
              <button
                onClick={() => {
                  setShowTranscriptionModal(false);
                  initializeRecording(false).catch(error => {
                    setError(`Failed to start recording: ${error.message}`);
                  });
                }}
                className="w-full py-2 px-4 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-md"
              >
                Start New Transcription
              </button>
              <button
                onClick={() => {
                  setShowTranscriptionModal(false);
                  setIsPendingRecording(false);
                }}
                className="w-full py-2 px-4 text-gray-500 hover:text-gray-700 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
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
      
      {/* Modal for transcription choice */}
      <TranscriptionModal />
      
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
        <div 
          ref={transcriptionContainerRef}
          className="p-3 bg-gray-50 rounded-md min-h-[100px] max-h-[300px] overflow-y-auto border border-gray-200 relative"
        >
          {!transcription && !interimTranscription && !isRecording ? (
            <p className="text-gray-400 italic">Transcription will appear here...</p>
          ) : (
            <div className="text-gray-800">
              <div 
                dangerouslySetInnerHTML={{ 
                  __html: formatTextWithEntities(transcription, entities) + 
                          (interimTranscription ? ` <span class="text-gray-400 italic">${interimTranscription}</span>` : '')
                }} 
              />
            </div>
          )}
          {!shouldAutoScroll && isRecording && (
            <button
              onClick={() => {
                setShouldAutoScroll(true);
                userHasScrolledRef.current = false;
                const container = transcriptionContainerRef.current;
                if (container) {
                  container.scrollTop = container.scrollHeight;
                }
              }}
              className="absolute bottom-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded-full shadow-md hover:bg-blue-600 transition-colors"
            >
              Resume Auto-scroll
            </button>
          )}
        </div>
        <div className="mt-2 text-xs text-gray-500 flex flex-wrap gap-4">
          <div><span className="inline-block w-3 h-3 mr-1" style={{color: 'red'}}>■</span> PHI</div>
          <div><span className="inline-block w-3 h-3 mr-1" style={{color: 'darkgreen'}}>■</span> Medical Condition</div>
          <div><span className="inline-block mr-1 italic">I</span> Anatomy</div>
          <div><span className="inline-block w-3 h-3 mr-1 bg-yellow-200"></span> Medication</div>
          <div><span className="inline-block w-3 h-3 mr-1" style={{color: 'darkblue'}}>■</span> Procedures/Tests</div>
        </div>
      </div>
      
      {/* Controls */}
      <div className="flex space-x-3 mb-4">
        <button
          onClick={toggleRecording}
          disabled={isPendingRecording}
          className={`px-4 py-2 font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            isRecording
              ? 'bg-red-600 text-white hover:bg-red-700'
              : isPendingRecording
              ? 'bg-gray-400 text-white cursor-wait'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          } focus:ring-blue-500`}
        >
          {isRecording ? 'Stop Recording' : isPendingRecording ? 'Starting...' : 'Start Recording'}
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
          disabled={!transcription || isRecording || isGenerating || isPendingRecording}
          className={`px-4 py-2 font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            !transcription || isRecording || isGenerating || isPendingRecording
              ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700'
          } focus:ring-green-500`}
        >
          {isGenerating ? (
            <span className="flex items-center">
              Generating
              <FaSpinner className="animate-spin ml-2" />
            </span>
          ) : (
            'Generate Documents'
          )}
        </button>
      </div>
      
      {generatedFiles.length > 0 && (
        <div className="mt-4">
          <h3 className="text-lg font-semibold mb-2">Generated Documents</h3>
          <p className="text-sm text-gray-600 mb-2">Available documents:</p>
          <div className="space-y-2">
            {generatedFiles.map((file, index) => (
              <button
                key={index}
                onClick={() => handleDownloadFile(file.name)}
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
                    {file.name}
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
      {/* <div className="mt-6 p-2 border border-gray-200 rounded">
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
      </div> */}
    </div>
  );
} 