import { useState } from 'react'
import RealTimeTranscription from './components/RealTimeTranscription';
import FileTranscription from './components/FileTranscription';

export default function App() {
  const [activeTab, setActiveTab] = useState('realtime');

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          Medical Transcription Service
        </h1>

        {/* Tab Navigation */}
        <div className="mb-6">
          <nav className="flex space-x-4 border-b border-gray-200 pb-4">
            <button
              onClick={() => setActiveTab('realtime')}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                activeTab === 'realtime'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Real-time Transcription
            </button>
            <button
              onClick={() => setActiveTab('file')}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                activeTab === 'file'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              File Transcription
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'realtime' ? (
            <RealTimeTranscription />
          ) : (
            <FileTranscription />
          )}
        </div>
      </div>
    </div>
  )
}
