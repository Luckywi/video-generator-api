const express = require('express');
const multer = require('multer');
const { fetchAtmoData, findBestTemplateFile } = require('./api/fetch-atmo');
const { generateAudio } = require('./api/elevenlabs');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration Multer pour l'upload de vidéos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.resolve('uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const dateStr = getTodayDateString();
        const ext = path.extname(file.originalname);
        cb(null, `custom-clip-${dateStr}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Seuls les fichiers vidéo sont autorisés'), false);
        }
    },
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB max
    }
});

function getTodayDateString() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = String(today.getFullYear()).slice(-2);
    return `${day}-${month}-${year}`;
}

app.use(express.json());

function formatDateToFrench(dateString) {
    const months = [
        'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
        'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
    ];

    const date = new Date(dateString);
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    return `${day} ${month} ${year}`;
}

function getAudioDuration(audioPath) {
    return new Promise((resolve, reject) => {
        const command = `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            const duration = parseFloat(stdout.trim());
            resolve(duration);
        });
    });
}

async function generateMuteVideo(text, videoPath, duration) {
    return new Promise((resolve, reject) => {
        // Format vertical iPhone : 1080x1920 (9:16)
        const ffmpegCommand = `ffmpeg -f lavfi -i color=c=white:s=1080x1920:d=${duration} -vf "drawtext=text='${text}':x=(w-text_w)/2:y=(h-text_h)/2:fontsize=80:fontcolor=black,fade=in:st=0:d=1" -c:v libx264 -y "${videoPath}"`;

        console.log('📱 Generating vertical iPhone video:', ffmpegCommand);

        exec(ffmpegCommand, (error, stdout, stderr) => {
            if (error) {
                console.error('💥 Video generation error:', error);
                console.error('FFmpeg stderr:', stderr);
                reject(error);
                return;
            }
            console.log('✅ Vertical video generated successfully:', videoPath);
            resolve(videoPath);
        });
    });
}

async function mergeAudioVideo(dateStr) {
    const videoPath = path.resolve(`videos/${dateStr}.mp4`);
    const audioPath = path.resolve(`audio/${dateStr}.mp3`);
    const outputDir = path.resolve('final');
    const outputPath = path.join(outputDir, `${dateStr}.mp4`);

    // Vérifier que les fichiers existent
    if (!fs.existsSync(videoPath)) {
        throw new Error(`❌ Vidéo manquante: ${videoPath}`);
    }
    if (!fs.existsSync(audioPath)) {
        throw new Error(`❌ Audio manquant: ${audioPath}`);
    }

    // Créer le dossier final si besoin
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log('📁 Created final directory');
    }

    return new Promise((resolve, reject) => {
        const ffmpegCmd = `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -shortest "${outputPath}"`;
        console.log('🔧 FFmpeg command:', ffmpegCmd);

        exec(ffmpegCmd, (error, stdout, stderr) => {
            if (error) {
                console.error('💥 Erreur FFmpeg:', stderr);
                return reject(new Error(stderr));
            }
            console.log('✅ Fusion terminée avec succès:', outputPath);
            resolve(outputPath);
        });
    });
}

async function generateAirQualityVideos(atmoData, dateStr) {
    const templateBasePath = path.resolve('template-indice');
    const outputDir = path.resolve('final2');

    // Créer le dossier final2 si besoin
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log('📁 Created final2 directory');
    }

    // Ordre des polluants: PM2.5, O3, NO2, SO2
    const pollutantOrder = ['PM2.5', 'O3', 'NO2', 'SO2'];
    const videoClips = [];

    for (const pollutant of pollutantOrder) {
        // Trouver le polluant dans les données de l'API
        const pollutantData = atmoData.sous_indices.find(p => p.polluant_nom === pollutant);

        if (pollutantData) {
            console.log(`🔍 Processing ${pollutant} with indice ${pollutantData.indice}`);

            // Chercher le fichier template correspondant
            const templateFile = findBestTemplateFile(pollutant, pollutantData.indice, templateBasePath);

            if (templateFile && fs.existsSync(templateFile)) {
                console.log(`✅ Found template: ${templateFile}`);
                videoClips.push(templateFile);
            } else {
                console.log(`⚠️ No template found for ${pollutant} with indice ${pollutantData.indice}`);
            }
        } else {
            console.log(`⚠️ ${pollutant} not found in API data`);
        }
    }

    if (videoClips.length === 0) {
        console.log('⚠️ No air quality videos to generate');
        return null;
    }

    // Concaténer tous les clips trouvés
    const outputPath = path.join(outputDir, `air-quality-${dateStr}.mp4`);

    return new Promise((resolve, reject) => {
        // Créer une liste de fichiers pour ffmpeg concat
        const fileListPath = path.join(outputDir, `filelist-${dateStr}.txt`);
        const fileListContent = videoClips.map(clip => `file '${clip}'`).join('\n');

        fs.writeFileSync(fileListPath, fileListContent);

        const ffmpegCmd = `ffmpeg -y -f concat -safe 0 -i "${fileListPath}" -c copy "${outputPath}"`;
        console.log('🔧 Air quality concat command:', ffmpegCmd);

        exec(ffmpegCmd, (error, stdout, stderr) => {
            // Nettoyer le fichier temporaire
            if (fs.existsSync(fileListPath)) {
                fs.unlinkSync(fileListPath);
            }

            if (error) {
                console.error('💥 Erreur concat air quality:', stderr);
                return reject(new Error(stderr));
            }
            console.log('✅ Air quality videos concatenated:', outputPath);
            resolve(outputPath);
        });
    });
}

async function combineWithAirQuality(mainVideoPath, airQualityPath, dateStr) {
    const outputDir = path.resolve('final3');

    // Créer le dossier final3 si besoin
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log('📁 Created final3 directory');
    }

    const outputPath = path.join(outputDir, `complete-${dateStr}.mp4`);

    return new Promise((resolve, reject) => {
        // Utiliser filter_complex pour une meilleure compatibilité
        const ffmpegCmd = `ffmpeg -y -i "${mainVideoPath}" -i "${airQualityPath}" -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" -c:v libx264 -c:a aac -preset veryfast -r 25 "${outputPath}"`;
        console.log('🔧 Final combination command:', ffmpegCmd);

        exec(ffmpegCmd, (error, stdout, stderr) => {
            if (error) {
                console.error('💥 Erreur final combination:', stderr);
                return reject(new Error(stderr));
            }
            console.log('✅ Final video created:', outputPath);
            resolve(outputPath);
        });
    });
}

async function createFinal4WithCustomClip(final2Path, customClipPath, pollutantClipsPath, dateStr) {
    const outputDir = path.resolve('final4');

    // Créer le dossier final4 si besoin
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log('📁 Created final4 directory');
    }

    const outputPath = path.join(outputDir, `complete-with-custom-${dateStr}.mp4`);

    return new Promise((resolve, reject) => {
        // Ordre: final2 + clip personnalisé + clips polluants
        const ffmpegCmd = `ffmpeg -y -i "${final2Path}" -i "${customClipPath}" -i "${pollutantClipsPath}" -filter_complex "[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" -c:v libx264 -c:a aac -preset veryfast -r 25 "${outputPath}"`;
        console.log('🔧 Final4 creation command:', ffmpegCmd);

        exec(ffmpegCmd, (error, stdout, stderr) => {
            if (error) {
                console.log('🔄 Tentative avec normalisation des clips...');

                // Méthode de fallback avec normalisation
                const tempDir = path.join(outputDir, 'temp');
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }

                const tempFinal2 = path.join(tempDir, `temp-final2-${dateStr}.mp4`);
                const tempCustom = path.join(tempDir, `temp-custom-${dateStr}.mp4`);
                const tempPollutant = path.join(tempDir, `temp-pollutant-${dateStr}.mp4`);

                const normalizeAndCombine = async () => {
                    try {
                        // Normaliser les 3 vidéos
                        await Promise.all([
                            new Promise((res, rej) => {
                                exec(`ffmpeg -y -i "${final2Path}" -c:v libx264 -c:a aac -r 25 -preset veryfast "${tempFinal2}"`, (err) => err ? rej(err) : res());
                            }),
                            new Promise((res, rej) => {
                                exec(`ffmpeg -y -i "${customClipPath}" -c:v libx264 -c:a aac -r 25 -preset veryfast "${tempCustom}"`, (err) => err ? rej(err) : res());
                            }),
                            new Promise((res, rej) => {
                                exec(`ffmpeg -y -i "${pollutantClipsPath}" -c:v libx264 -c:a aac -r 25 -preset veryfast "${tempPollutant}"`, (err) => err ? rej(err) : res());
                            })
                        ]);

                        // Concaténer les vidéos normalisées
                        const finalCmd = `ffmpeg -y -i "${tempFinal2}" -i "${tempCustom}" -i "${tempPollutant}" -filter_complex "[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" -c:v libx264 -c:a aac -preset veryfast "${outputPath}"`;

                        exec(finalCmd, (finalError, stdout2, stderr2) => {
                            // Nettoyer les fichiers temporaires
                            [tempFinal2, tempCustom, tempPollutant].forEach(file => {
                                if (fs.existsSync(file)) fs.unlinkSync(file);
                            });
                            if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);

                            if (finalError) {
                                console.error('💥 Erreur final4 après normalisation:', stderr2);
                                return reject(new Error(stderr2));
                            }
                            console.log('✅ Final4 video created with normalization:', outputPath);
                            resolve(outputPath);
                        });

                    } catch (normError) {
                        console.error('💥 Erreur normalisation:', normError);
                        reject(normError);
                    }
                };

                normalizeAndCombine();
            } else {
                console.log('✅ Final4 video created:', outputPath);
                resolve(outputPath);
            }
        });
    });
}

app.post('/render', async (req, res) => {
    try {
        console.log('🚀 POST /render - Starting...');

        // Étape 1: Récupérer les données ATMO
        console.log('📡 Fetching ATMO data...');
        const atmoData = await fetchAtmoData();
        const dateEcheance = atmoData.date_echeance;
        const frenchDate = formatDateToFrench(dateEcheance);
        console.log('📅 French date:', frenchDate);

        // Générer le nom de fichier basé sur la date du jour
        const today = new Date();
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const year = String(today.getFullYear()).slice(-2);
        const dateStr = `${day}-${month}-${year}`;

        // Définir tous les chemins avec path.resolve pour des chemins absolus
        const audioPath = path.resolve('audio', `${dateStr}.mp3`);
        const videoPath = path.resolve('videos', `${dateStr}.mp4`);

        console.log('📁 Audio path:', audioPath);
        console.log('📁 Video path:', videoPath);

        // Créer les dossiers nécessaires
        ['videos', 'audio', 'final', 'final2', 'final3', 'final4', 'uploads'].forEach(dir => {
            const dirPath = path.resolve(dir);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
                console.log(`📁 Created ${dir} directory`);
            }
        });

        // Étape 2: Générer l'audio (ou réutiliser si existant)
        console.log('🎤 Step 1: Generating/checking audio...');
        await generateAudio(frenchDate, audioPath);

        // Obtenir la durée de l'audio
        console.log('⏱️ Getting audio duration...');
        const audioDuration = await getAudioDuration(audioPath);
        console.log(`🕐 Audio duration: ${audioDuration} seconds`);

        // Étape 3: Générer la vidéo muette
        console.log('🎬 Step 2: Generating mute video...');
        await generateMuteVideo(frenchDate, videoPath, audioDuration);

        // Étape 4: Fusionner audio et vidéo
        console.log('🔧 Step 3: Merging audio and video...');
        const finalPath = await mergeAudioVideo(dateStr);
        console.log('🎉 Vidéo principale générée:', finalPath);

        // Étape 5: Générer les vidéos de qualité de l'air
        console.log('🌬️ Step 4: Generating air quality videos...');
        const airQualityPath = await generateAirQualityVideos(atmoData, dateStr);

        let completePath = finalPath;

        // Étape 6: Combiner avec les vidéos de qualité de l'air si elles existent
        if (airQualityPath) {
            console.log('🔗 Step 5: Combining with air quality videos...');
            completePath = await combineWithAirQuality(finalPath, airQualityPath, dateStr);
            console.log('🎉 Vidéo complète générée:', completePath);
        } else {
            console.log('⚠️ No air quality videos to combine, using main video only');
        }

        res.json({
            success: true,
            path: path.relative(process.cwd(), completePath),
            mainVideo: path.relative(process.cwd(), finalPath),
            airQualityVideo: airQualityPath ? path.relative(process.cwd(), airQualityPath) : null
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Nouvel endpoint pour générer vidéo avec clip personnalisé
app.post('/render-with-custom-clip', upload.single('customClip'), async (req, res) => {
    try {
        console.log('🚀 POST /render-with-custom-clip - Starting...');

        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Aucun fichier vidéo fourni. Utilisez le champ "customClip" pour upload.'
            });
        }

        // Étape 1: Récupérer les données ATMO
        console.log('📡 Fetching ATMO data...');
        const atmoData = await fetchAtmoData();
        const dateEcheance = atmoData.date_echeance;
        const frenchDate = formatDateToFrench(dateEcheance);
        console.log('📅 French date:', frenchDate);

        // Générer le nom de fichier basé sur la date du jour
        const dateStr = getTodayDateString();

        // Créer les dossiers nécessaires
        ['videos', 'audio', 'final', 'final2', 'final3', 'final4', 'uploads'].forEach(dir => {
            const dirPath = path.resolve(dir);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
                console.log(`📁 Created ${dir} directory`);
            }
        });

        // Définir tous les chemins
        const audioPath = path.resolve('audio', `${dateStr}.mp3`);
        const videoPath = path.resolve('videos', `${dateStr}.mp4`);
        const customClipPath = req.file.path;

        console.log('📁 Audio path:', audioPath);
        console.log('📁 Video path:', videoPath);
        console.log('📁 Custom clip path:', customClipPath);

        // Étape 2: Générer l'audio (ou réutiliser si existant)
        console.log('🎤 Step 1: Generating/checking audio...');
        await generateAudio(frenchDate, audioPath);

        // Étape 3: Obtenir la durée de l'audio et générer la vidéo muette
        console.log('⏱️ Getting audio duration...');
        const audioDuration = await getAudioDuration(audioPath);
        console.log(`🕐 Audio duration: ${audioDuration} seconds`);

        console.log('🎬 Step 2: Generating mute video...');
        await generateMuteVideo(frenchDate, videoPath, audioDuration);

        // Étape 4: Fusionner audio et vidéo dans /final
        console.log('🔧 Step 3: Merging audio and video...');
        const finalPath = await mergeAudioVideo(dateStr);
        console.log('🎉 Vidéo principale générée:', finalPath);

        // Étape 5: Ajouter le clip qualité générale dans /final2
        console.log('🌟 Step 4: Adding quality clip...');
        const qualiteIndice = atmoData.indice;
        const final2Path = await addQualityClip(dateStr, qualiteIndice);
        console.log('🎉 Vidéo avec qualité générée:', final2Path);

        // Étape 6: Générer les clips polluants individuels
        console.log('🌬️ Step 5: Generating air quality videos...');
        const airQualityPath = await generateAirQualityVideos(atmoData, dateStr);

        let final4Path = null;

        // Étape 7: Créer final4 avec clip personnalisé
        if (airQualityPath) {
            console.log('🎨 Step 6: Creating final4 with custom clip...');
            final4Path = await createFinal4WithCustomClip(final2Path, customClipPath, airQualityPath, dateStr);
            console.log('🎉 Vidéo finale avec clip personnalisé générée:', final4Path);
        } else {
            console.log('⚠️ No air quality videos generated, cannot create final4');
        }

        res.json({
            success: true,
            message: 'Vidéo générée avec succès avec clip personnalisé',
            files: {
                mainVideo: path.relative(process.cwd(), finalPath),
                final2Video: final2Path ? path.relative(process.cwd(), final2Path) : null,
                airQualityVideo: airQualityPath ? path.relative(process.cwd(), airQualityPath) : null,
                final4Video: final4Path ? path.relative(process.cwd(), final4Path) : null,
                customClip: path.relative(process.cwd(), customClipPath)
            },
            atmoData: {
                indice: atmoData.indice,
                qualificatif: atmoData.qualificatif,
                date: frenchDate
            }
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Fonction pour ajouter le clip qualité (reprise de generate_final2.js)
async function addQualityClip(dateStr, indiceAtmo) {
    const templates = {
        1: 'template-qualité/bonne.mov',
        2: 'template-qualité/moyenne.mov',
        3: 'template-qualité/dégradée.mov',
        4: 'template-qualité/mauvaise.mov',
        5: 'template-qualité/trés mauvaise.mov'
    };

    const templatePath = templates[indiceAtmo];
    if (!templatePath) {
        throw new Error(`Indice ATMO ${indiceAtmo} non supporté`);
    }

    const inputVideo = path.resolve(`final/${dateStr}.mp4`);
    const clipVideo = path.resolve(templatePath);
    const outputDir = path.resolve('final2');
    const outputVideo = path.join(outputDir, `${dateStr}.mp4`);

    if (!fs.existsSync(inputVideo)) {
        throw new Error(`❌ Vidéo finale manquante: ${inputVideo}`);
    }
    if (!fs.existsSync(clipVideo)) {
        throw new Error(`❌ Clip qualité manquant: ${clipVideo}`);
    }

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log('📁 Dossier final2 créé');
    }

    return new Promise((resolve, reject) => {
        // Utiliser concat simple et robuste
        const ffmpegCmd = `ffmpeg -y -i "${inputVideo}" -i "${clipVideo}" -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" -c:v libx264 -c:a aac -preset veryfast -r 25 "${outputVideo}"`;
        console.log('🔧 Quality clip concatenation command:', ffmpegCmd);

        exec(ffmpegCmd, (error, stdout, stderr) => {
            if (error) {
                console.error('💥 Erreur ajout clip qualité:', stderr);
                return reject(new Error(stderr));
            }
            console.log('✅ Vidéo final2 générée:', outputVideo);
            resolve(outputVideo);
        });
    });
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`🎬 Endpoints disponibles:`);
    console.log(`  POST /render - Génération vidéo standard`);
    console.log(`  POST /render-with-custom-clip - Génération avec clip personnalisé`);
});