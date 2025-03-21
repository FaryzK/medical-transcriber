import { useState, useRef } from 'react'

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const mediaRecorderRef = useRef(null);
  const [apiResponse, setApiResponse] = useState(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      
      // When we get data, send it to our API
      mediaRecorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          const formData = new FormData();
          formData.append('audio', e.data);
          
          try {
            const response = await fetch('/api/transcribe', {
              method: 'POST',
              body: formData
            });
            
            const data = await response.json();
            if (data.transcription) {
              setTranscription(prev => prev + ' ' + data.transcription);
            }
          } catch (error) {
            console.error('Error sending audio:', error);
          }
        }
      };

      mediaRecorder.start(3000); // Collect 3 seconds of audio at a time
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please ensure you have given permission.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  return (
    <div className="p-4 bg-gray-100 min-h-screen">
      <h1 className="text-3xl font-bold text-blue-600 mb-4">
        Medical Transcriber
      </h1>
      
      <div className="space-y-4">
        <div className="flex flex-col items-center space-y-4">
          <button 
            onClick={isRecording ? stopRecording : startRecording}
            className={`
              w-24 h-24 rounded-full flex items-center justify-center
              transition-all duration-200 shadow-lg
              ${isRecording 
                ? 'bg-red-600 hover:bg-red-700 animate-pulse' 
                : 'bg-blue-500 hover:bg-blue-700'
              }
            `}
          >
            <span className="text-white text-lg font-medium">
              {isRecording ? 'Stop' : 'Record'}
            </span>
          </button>

          {isRecording && (
            <div className="text-red-600 animate-pulse">
              Recording...
            </div>
          )}
        </div>

        {transcription && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-2">Transcription:</h2>
            <div className="bg-white rounded-lg p-4 shadow">
              {transcription}
            </div>
          </div>
        )}

        {/* Keep the test API button for debugging */}
        <div className="mt-8">
          <button 
            onClick={async () => {
              const response = await fetch('/api/test');
              const data = await response.json();
              setApiResponse(data);
            }}
            className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
          >
            Test API Connection
          </button>

          {apiResponse && (
            <div className="mt-4 p-4 bg-white rounded shadow">
              <pre className="whitespace-pre-wrap">
                {JSON.stringify(apiResponse, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
