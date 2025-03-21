import { SpeechClient } from '@google-cloud/speech';
import dotenv from 'dotenv';

dotenv.config();

// Initialize the Speech Client with credentials
const speechClient = new SpeechClient({
    credentials: JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS),
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
});

export const transcribeAudio = async (req, res) => {
    try {
        if (!req.files || !req.files.audio) {
            return res.status(400).json({ error: 'No audio file uploaded' });
        }

        const audioBuffer = req.files.audio.data;
        
        // Configure request for WebM audio from browser
        const request = {
            audio: {
                content: audioBuffer.toString('base64'),
            },
            config: {
                encoding: 'WEBM_OPUS',
                sampleRateHertz: 48000,
                languageCode: 'en-US',
                model: 'default', // Use 'medical_conversation' if available in your region
                useEnhanced: true,
                enableAutomaticPunctuation: true,
            },
        };

        console.log('Sending chunk to Google Speech-to-Text...');
        const [response] = await speechClient.recognize(request);
        
        // Extract transcription
        const transcription = response.results
            .map(result => result.alternatives[0].transcript)
            .join(' ');

        console.log('Transcription received:', transcription);
        
        res.json({ transcription });
    } catch (error) {
        console.error('Transcription error:', error);
        res.status(500).json({ 
            error: 'Transcription failed',
            details: error.message 
        });
    }
}; 