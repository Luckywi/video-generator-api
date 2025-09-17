const axios = require('axios');
const fs = require('fs');
const path = require('path');

const ELEVENLABS_API_KEY = 'f2f9b4766695a59690b70c5f6be5126c50f0fccc218380083814d9e560c5a948';
const VOICE_ID = 'f5ChBqjF2YtYo8iKr4UV';

async function generateAudio(text, outputPath) {
    try {
        // Vérifier si le fichier existe déjà
        if (fs.existsSync(outputPath)) {
            console.log('🔄 Audio file already exists, reusing:', outputPath);
            return outputPath;
        }

        console.log('🎤 Generating audio with ElevenLabs...');

        // Ajouter une pause SSML de 200ms après la date
        const ssmlText = `<speak>${text}<break time="200ms"/></speak>`;
        console.log('📝 SSML Text:', ssmlText);

        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
            {
                text: ssmlText,
                model_id: "eleven_multilingual_v2",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.5
                }
            },
            {
                headers: {
                    'Accept': 'audio/mpeg',
                    'Content-Type': 'application/json',
                    'xi-api-key': ELEVENLABS_API_KEY
                },
                responseType: 'stream'
            }
        );

        console.log('📥 Audio response received, saving to:', outputPath);

        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                console.log('✅ Audio file saved successfully');
                resolve(outputPath);
            });
            writer.on('error', reject);
        });
    } catch (error) {
        throw new Error(`Failed to generate audio: ${error.message}`);
    }
}

module.exports = { generateAudio };