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

function cleanupOldFiles(currentDateStr, keepCurrent = true) {
    const directories = ['uploads', 'videos', 'audio', 'final', 'final2', 'final3', 'final4', 'pollutant-clips'];
    let cleanedCount = 0;

    directories.forEach(dir => {
        if (!fs.existsSync(dir)) return;

        try {
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                if (file.startsWith('.')) return; // Skip hidden files

                const shouldDelete = keepCurrent
                    ? !file.includes(currentDateStr)
                    : true;

                if (shouldDelete) {
                    const filePath = path.join(dir, file);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        cleanedCount++;
                        console.log(`🧹 Nettoyé: ${filePath}`);
                    }
                }
            });
        } catch (error) {
            console.error(`⚠️ Erreur nettoyage ${dir}:`, error.message);
        }
    });

    if (cleanedCount > 0) {
        console.log(`✅ Nettoyage terminé: ${cleanedCount} fichiers supprimés`);
    }
}

function cleanupTempFiles() {
    const tempPatterns = [
        'temp-final2-*.mp4',
        'temp-pollutant-*.mp4',
        'temp-custom-*.mp4',
        'filelist-*.txt'
    ];

    let cleanedCount = 0;

    tempPatterns.forEach(pattern => {
        try {
            const files = fs.readdirSync('.').filter(file => {
                return file.match(pattern.replace('*', '.*'));
            });

            files.forEach(file => {
                fs.unlinkSync(file);
                cleanedCount++;
                console.log(`🧹 Temp nettoyé: ${file}`);
            });
        } catch (error) {
            console.error(`⚠️ Erreur nettoyage temp:`, error.message);
        }
    });

    if (cleanedCount > 0) {
        console.log(`✅ Fichiers temporaires nettoyés: ${cleanedCount}`);
    }
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

function getVideoDuration(videoPath) {
    return new Promise((resolve, reject) => {
        const command = `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${videoPath}"`;
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
        const ffmpegCommand = `ffmpeg -f lavfi -i color=c=white:s=1080x1920:d=${duration} -vf "drawtext=text='${text}':fontfile='./fonts/Inter/static/Inter_18pt-Medium.ttf':fontsize='if(lt(t,1),80+15*abs(sin(t*3)),80)':x=(w-text_w)/2:y=(h-text_h)/2:fontcolor=black,fade=in:st=0:d=0.5" -c:v libx264 -preset ultrafast -crf 28 -threads 2 -y "${videoPath}"`;

        console.log('📱 Génération vidéo verticale avec Inter Medium et bounce unique:', videoPath);

        exec(ffmpegCommand, (error, stdout, stderr) => {
            if (error) {
                console.error('💥 Erreur génération vidéo:', error);
                console.error('FFmpeg stderr:', stderr);
                reject(error);
                return;
            }
            console.log('✅ Vidéo verticale générée:', videoPath);
            resolve(videoPath);
        });
    });
}

async function mergeAudioVideo(dateStr) {
    const videoPath = path.resolve(`videos/${dateStr}.mp4`);
    const elevenLabsAudio = path.resolve(`audio/${dateStr}.mp3`);
    const softRiserPath = path.resolve('audio-effet/soft_riser_song_for_-#2-1758206926855.mp3');
    const outputDir = path.resolve('final');
    const outputPath = path.join(outputDir, `${dateStr}.mp4`);

    if (!fs.existsSync(videoPath)) {
        throw new Error(`❌ Vidéo manquante: ${videoPath}`);
    }
    if (!fs.existsSync(elevenLabsAudio)) {
        throw new Error(`❌ Audio ElevenLabs manquant: ${elevenLabsAudio}`);
    }
    if (!fs.existsSync(softRiserPath)) {
        throw new Error(`❌ Effet sonore manquant: ${softRiserPath}`);
    }

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log('📁 Dossier final créé');
    }

    return new Promise((resolve, reject) => {
        // Mix audio : soft_riser au début + ElevenLabs à 0.3s en superposition
        const ffmpegCmd = `ffmpeg -y -i "${videoPath}" -i "${softRiserPath}" -i "${elevenLabsAudio}" -filter_complex "[1:a]volume=0.7[riser];[2:a]adelay=300|300[delayed_voice];[riser][delayed_voice]amix=inputs=2:duration=longest[mixed_audio]" -map 0:v -map "[mixed_audio]" -c:v copy -c:a aac -shortest "${outputPath}"`;
        console.log('🔧 Fusion vidéo avec mix audio (riser + voix):', ffmpegCmd);

        exec(ffmpegCmd, { timeout: 60000 }, (error, stdout, stderr) => {
            if (error) {
                console.error('💥 Erreur FFmpeg fusion:', stderr);
                return reject(new Error(stderr));
            }
            console.log('✅ Fusion terminée:', outputPath);
            resolve(outputPath);
        });
    });
}

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

    console.log(`🎬 Template sélectionné: ${templatePath}`);
    console.log(`📼 Vidéo d'entrée: ${inputVideo}`);
    console.log(`💾 Sortie final2: ${outputVideo}`);

    try {
        const firstVideoDuration = await getVideoDuration(inputVideo);
        const transitionDuration = 0.2;
        const offset = Math.max(0, firstVideoDuration - transitionDuration);

        console.log(`⏱️ Durée première vidéo: ${firstVideoDuration}s`);
        console.log(`🔧 Offset calculé: ${offset}s`);

        return new Promise((resolve, reject) => {
            const ffmpegCmd = `ffmpeg -y -i "${inputVideo}" -i "${clipVideo}" -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" -c:v libx264 -crf 28 -preset ultrafast -threads 2 -r 25 -movflags +faststart "${outputVideo}"`;

            console.log('🔧 Concaténation avec concat optimisé Railway...');

            exec(ffmpegCmd, { timeout: 60000 }, (error, stdout, stderr) => {
                if (error) {
                    console.error('💥 Erreur FFmpeg final2:', stderr);
                    return reject(new Error(stderr));
                }
                console.log('✅ Vidéo final2 générée:', outputVideo);
                resolve(outputVideo);
            });
        });
    } catch (error) {
        throw new Error(`Erreur lors du calcul de durée: ${error.message}`);
    }
}

async function generatePollutantClips(atmoData, dateStr) {
    const templateBasePath = path.resolve('template-indice');
    const outputDir = path.resolve('pollutant-clips');

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log('📁 Dossier pollutant-clips créé');
    }

    const pollutantOrder = ['PM2.5'];
    const videoClips = [];

    console.log('\n=== GÉNÉRATION CLIPS POLLUANTS ===');

    for (const pollutant of pollutantOrder) {
        const pollutantData = atmoData.sous_indices.find(p => p.polluant_nom === pollutant);

        if (pollutantData) {
            console.log(`🔍 Traitement ${pollutant} avec indice ${pollutantData.indice}`);

            const templateFile = findBestTemplateFile(pollutant, pollutantData.indice, templateBasePath);

            if (templateFile && fs.existsSync(templateFile)) {
                console.log(`✅ Template trouvé: ${templateFile}`);
                videoClips.push(templateFile);
            } else {
                console.log(`⚠️ Aucun template trouvé pour ${pollutant} avec indice ${pollutantData.indice}`);
            }
        } else {
            console.log(`⚠️ ${pollutant} non trouvé dans les données API`);
        }
    }

    if (videoClips.length === 0) {
        console.log('⚠️ Aucun clip polluant à générer');
        return null;
    }

    const outputPath = path.join(outputDir, `pollutants-${dateStr}.mp4`);

    return new Promise((resolve, reject) => {
        const fileListPath = path.join(outputDir, `filelist-${dateStr}.txt`);
        const fileListContent = videoClips.map(clip => `file '${clip}'`).join('\n');

        fs.writeFileSync(fileListPath, fileListContent);

        const ffmpegCmd = `ffmpeg -y -f concat -safe 0 -i "${fileListPath}" -c:v libx264 -c:a aac -preset ultrafast -crf 28 -threads 2 -r 25 -avoid_negative_ts make_zero "${outputPath}"`;
        console.log('🔧 Commande concat polluants avec réencodage et frame rate uniforme:', ffmpegCmd);

        exec(ffmpegCmd, { timeout: 60000 }, (error, stdout, stderr) => {
            if (fs.existsSync(fileListPath)) {
                fs.unlinkSync(fileListPath);
            }

            if (error) {
                console.error('💥 Erreur concat polluants:', stderr);
                return reject(new Error(stderr));
            }
            console.log('✅ Clips polluants concaténés avec réencodage:', outputPath);
            resolve(outputPath);
        });
    });
}

async function createFinal3(final2Path, pollutantClipsPath, dateStr) {
    const outputDir = path.resolve('final3');

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log('📁 Dossier final3 créé');
    }

    const outputPath = path.join(outputDir, `complete-${dateStr}.mp4`);

    return new Promise((resolve, reject) => {
        const absoluteFinal2Path = path.resolve(final2Path);
        const absolutePollutantPath = path.resolve(pollutantClipsPath);

        const ffmpegCmd = `ffmpeg -y -i "${absoluteFinal2Path}" -i "${absolutePollutantPath}" -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" -c:v libx264 -c:a aac -preset ultrafast -crf 28 -threads 2 -r 25 "${outputPath}"`;
        console.log('🔧 Commande combinaison finale avec filter_complex:', ffmpegCmd);

        exec(ffmpegCmd, { timeout: 60000 }, (error, stdout, stderr) => {
            if (error) {
                console.log('🔄 Tentative avec méthode de fallback...');
                const tempFinal2 = path.join(outputDir, `temp-final2-${dateStr}.mp4`);
                const tempPollutant = path.join(outputDir, `temp-pollutant-${dateStr}.mp4`);

                const normalizeCmd1 = `ffmpeg -y -i "${absoluteFinal2Path}" -vf scale=1080:1920 -c:v libx264 -c:a aac -r 25 -preset ultrafast -crf 28 -threads 2 "${tempFinal2}"`;
                console.log('🔧 Normalisation final2:', normalizeCmd1);

                exec(normalizeCmd1, { timeout: 60000 }, (error1, stdout1, stderr1) => {
                    if (error1) {
                        console.error('💥 Erreur normalisation final2:', stderr1);
                        return reject(new Error(stderr1));
                    }

                    const normalizeCmd2 = `ffmpeg -y -i "${absolutePollutantPath}" -vf scale=1080:1920 -c:v libx264 -c:a aac -r 25 -preset ultrafast -crf 28 -threads 2 "${tempPollutant}"`;
                    console.log('🔧 Normalisation pollutant:', normalizeCmd2);

                    exec(normalizeCmd2, { timeout: 60000 }, (error2, stdout2, stderr2) => {
                        if (error2) {
                            console.error('💥 Erreur normalisation pollutant:', stderr2);
                            return reject(new Error(stderr2));
                        }

                        const finalConcatCmd = `ffmpeg -y -i "${tempFinal2}" -i "${tempPollutant}" -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" -c:v libx264 -c:a aac -preset ultrafast -crf 28 -threads 2 "${outputPath}"`;
                        console.log('🔧 Concaténation finale normalisée:', finalConcatCmd);

                        exec(finalConcatCmd, (error3, stdout3, stderr3) => {
                            [tempFinal2, tempPollutant].forEach(file => {
                                if (fs.existsSync(file)) fs.unlinkSync(file);
                            });

                            if (error3) {
                                console.error('💥 Erreur concaténation finale:', stderr3);
                                return reject(new Error(stderr3));
                            }
                            console.log('✅ Vidéo finale créée avec normalisation:', outputPath);
                            resolve(outputPath);
                        });
                    });
                });
            } else {
                console.log('✅ Vidéo finale créée avec filter_complex:', outputPath);
                resolve(outputPath);
            }
        });
    });
}

async function createFinal4WithCustomClip(final2Path, customClipPath, pollutantClipsPath, dateStr) {
    const outputDir = path.resolve('final4');
    const maskPath = path.resolve('template-qualité/bonne-mask-1.mov');

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log('📁 Dossier final4 créé');
    }

    if (!fs.existsSync(maskPath)) {
        throw new Error(`❌ Mask file manquant: ${maskPath}`);
    }

    const outputPath = path.join(outputDir, `complete-with-custom-${dateStr}.mp4`);
    const tempCustomWithMask = path.join(outputDir, `temp-custom-with-mask-${dateStr}.mp4`);

    return new Promise(async (resolve, reject) => {
        try {
            // Obtenir la durée du customClip pour calculer le début de l'iris out
            const customClipDuration = await getVideoDuration(customClipPath);
            const irisStartTime = Math.max(0, customClipDuration - 0.5);

            console.log(`⏱️ Durée custom clip: ${customClipDuration}s, iris out démarre à: ${irisStartTime}s`);

            // Étape 1: Appliquer le mask overlay + iris out blanc sur le customClip
            const overlayCmd = `ffmpeg -y -i "${customClipPath}" -i "${maskPath}" -filter_complex "[0:v][1:v]overlay=0:0:enable='between(t,0,0.7)'[masked];[masked]geq=r='if(hypot(X-W/2,Y-H/2)<=W/2*max(0,1-(t-${irisStartTime})/0.5),r(X,Y),255)':g='if(hypot(X-W/2,Y-H/2)<=W/2*max(0,1-(t-${irisStartTime})/0.5),g(X,Y),255)':b='if(hypot(X-W/2,Y-H/2)<=W/2*max(0,1-(t-${irisStartTime})/0.5),b(X,Y),255)':enable='gte(t,${irisStartTime})'[iris_out]" -map "[iris_out]" -map 0:a -c:v libx264 -c:a aac -preset ultrafast -crf 28 -threads 2 -r 25 "${tempCustomWithMask}"`;
            console.log('🎭 Applying mask overlay + iris out to custom clip:', overlayCmd);

            exec(overlayCmd, { timeout: 60000 }, (overlayError, stdout, stderr) => {
            if (overlayError) {
                console.error('💥 Erreur application mask:', stderr);
                return reject(new Error(stderr));
            }

            console.log('✅ Mask appliqué au clip personnalisé');

            // Étape 2: Concaténer final2 + customClipWithMask + pollutantClips
            const ffmpegCmd = `ffmpeg -y -i "${final2Path}" -i "${tempCustomWithMask}" -i "${pollutantClipsPath}" -filter_complex "[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" -c:v libx264 -c:a aac -preset ultrafast -crf 28 -threads 2 -r 25 "${outputPath}"`;
            console.log('🔧 Final4 creation command with mask:', ffmpegCmd);

            exec(ffmpegCmd, { timeout: 60000 }, (error, stdout, stderr) => {
                // Nettoyer le fichier temporaire
                if (fs.existsSync(tempCustomWithMask)) {
                    fs.unlinkSync(tempCustomWithMask);
                }

                if (error) {
                    console.log('🔄 Tentative avec normalisation des clips...');

                    const tempDir = path.join(outputDir, 'temp');
                    if (!fs.existsSync(tempDir)) {
                        fs.mkdirSync(tempDir, { recursive: true });
                    }

                    const tempFinal2 = path.join(tempDir, `temp-final2-${dateStr}.mp4`);
                    const tempCustomNorm = path.join(tempDir, `temp-custom-${dateStr}.mp4`);
                    const tempPollutant = path.join(tempDir, `temp-pollutant-${dateStr}.mp4`);

                    const normalizeAndCombine = async () => {
                        try {
                            // Normaliser le customClip avec le mask et iris out appliqués
                            await new Promise((res, rej) => {
                                const normalizeCustomCmd = `ffmpeg -y -i "${customClipPath}" -i "${maskPath}" -filter_complex "[0:v]scale=1080:1920[scaled];[scaled][1:v]overlay=0:0:enable='between(t,0,0.7)'[masked];[masked]geq=r='if(hypot(X-W/2,Y-H/2)<=W/2*max(0,1-(t-${irisStartTime})/0.5),r(X,Y),255)':g='if(hypot(X-W/2,Y-H/2)<=W/2*max(0,1-(t-${irisStartTime})/0.5),g(X,Y),255)':b='if(hypot(X-W/2,Y-H/2)<=W/2*max(0,1-(t-${irisStartTime})/0.5),b(X,Y),255)':enable='gte(t,${irisStartTime})'[iris_out]" -map "[iris_out]" -map 0:a -c:v libx264 -c:a aac -r 25 -preset ultrafast -crf 28 -threads 2 "${tempCustomNorm}"`;
                                exec(normalizeCustomCmd, (err) => err ? rej(err) : res());
                            });

                            await Promise.all([
                                new Promise((res, rej) => {
                                    exec(`ffmpeg -y -i "${final2Path}" -vf scale=1080:1920 -c:v libx264 -c:a aac -r 25 -preset ultrafast -crf 28 -threads 2 "${tempFinal2}"`, (err) => err ? rej(err) : res());
                                }),
                                new Promise((res, rej) => {
                                    exec(`ffmpeg -y -i "${pollutantClipsPath}" -vf scale=1080:1920 -c:v libx264 -c:a aac -r 25 -preset ultrafast -crf 28 -threads 2 "${tempPollutant}"`, (err) => err ? rej(err) : res());
                                })
                            ]);

                            const finalCmd = `ffmpeg -y -i "${tempFinal2}" -i "${tempCustomNorm}" -i "${tempPollutant}" -filter_complex "[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" -c:v libx264 -c:a aac -preset ultrafast -crf 28 -threads 2 "${outputPath}"`;

                            exec(finalCmd, (finalError, stdout2, stderr2) => {
                                [tempFinal2, tempCustomNorm, tempPollutant].forEach(file => {
                                    if (fs.existsSync(file)) fs.unlinkSync(file);
                                });
                                if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);

                                if (finalError) {
                                    console.error('💥 Erreur final4 après normalisation:', stderr2);
                                    return reject(new Error(stderr2));
                                }
                                console.log('✅ Final4 video created with mask and normalization:', outputPath);
                                resolve(outputPath);
                            });

                        } catch (normError) {
                            console.error('💥 Erreur normalisation:', normError);
                            reject(normError);
                        }
                    };

                    normalizeAndCombine();
                } else {
                    console.log('✅ Final4 video created with mask overlay:', outputPath);
                    resolve(outputPath);
                }
            });
        });
        } catch (durationError) {
            console.error('💥 Erreur obtention durée custom clip:', durationError);
            reject(durationError);
        }
    });
}

// Fonction principale de génération (basée sur generate_final2.js)
async function generateComplete(customClipPath = null) {
    try {
        console.log('🚀 DÉBUT DU PROCESSUS COMPLET\n');

        const dateStr = getTodayDateString();
        console.log(`📅 Date du jour: ${dateStr}\n`);

        // Étape 1: Récupérer les données ATMO
        console.log('=== ÉTAPE 1: DONNÉES ATMO ===');
        const atmoData = await fetchAtmoData();
        const dateEcheance = atmoData.date_echeance;
        const indiceAtmo = atmoData.indice;
        const qualificatif = atmoData.qualificatif;
        const frenchDate = formatDateToFrench(dateEcheance);

        console.log(`📊 Indice ATMO: ${indiceAtmo} (${qualificatif})`);
        console.log(`📅 Date française: ${frenchDate}\n`);

        // Créer les dossiers nécessaires
        ['videos', 'audio', 'final', 'final2', 'final3', 'final4', 'pollutant-clips', 'uploads'].forEach(dir => {
            const dirPath = path.resolve(dir);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
                console.log(`📁 Dossier ${dir} créé`);
            }
        });

        // Définir les chemins
        const audioPath = path.resolve('audio', `${dateStr}.mp3`);
        const videoPath = path.resolve('videos', `${dateStr}.mp4`);

        // Étape 2: Générer l'audio
        console.log('\n=== ÉTAPE 2: GÉNÉRATION AUDIO ===');
        await generateAudio(frenchDate, audioPath);

        // Étape 3: Obtenir durée audio et générer vidéo
        console.log('\n=== ÉTAPE 3: GÉNÉRATION VIDÉO ===');
        const audioDuration = await getAudioDuration(audioPath);
        console.log(`⏱️ Durée audio: ${audioDuration} secondes`);

        await generateMuteVideo(frenchDate, videoPath, audioDuration);

        // Étape 4: Fusionner audio et vidéo dans /final
        console.log('\n=== ÉTAPE 4: FUSION AUDIO/VIDÉO ===');
        const finalPath = await mergeAudioVideo(dateStr);
        console.log('✅ Vidéo de base créée dans /final');

        // Étape 5: Ajouter le clip qualité et créer final2
        console.log('\n=== ÉTAPE 5: AJOUT CLIP QUALITÉ ===');
        const final2Path = await addQualityClip(dateStr, indiceAtmo);

        // Étape 6: Générer les clips polluants individuels
        console.log('\n=== ÉTAPE 6: CLIPS POLLUANTS ===');
        const pollutantClipsPath = await generatePollutantClips(atmoData, dateStr);

        let final3Path = null;
        let final4Path = null;

        // Étape 7: Créer final3 en combinant final2 + clips polluants
        if (pollutantClipsPath) {
            console.log('\n=== ÉTAPE 7: CRÉATION FINAL3 ===');
            final3Path = await createFinal3(final2Path, pollutantClipsPath, dateStr);
            console.log('🎉 Vidéo final3 générée:', final3Path);

            // Étape 8: Créer final4 avec clip personnalisé si fourni
            if (customClipPath) {
                console.log('\n=== ÉTAPE 8: CRÉATION FINAL4 AVEC CLIP PERSONNALISÉ ===');
                final4Path = await createFinal4WithCustomClip(final2Path, customClipPath, pollutantClipsPath, dateStr);
                console.log('🎉 Vidéo final4 avec clip personnalisé générée:', final4Path);
            }
        } else {
            console.log('\n⚠️ Aucun clip polluant généré, final2 reste la version finale');
        }

        console.log('\n🎉 PROCESSUS TERMINÉ AVEC SUCCÈS!');

        return {
            success: true,
            finalPath: path.relative(process.cwd(), finalPath),
            final2Path: path.relative(process.cwd(), final2Path),
            final3Path: final3Path ? path.relative(process.cwd(), final3Path) : null,
            final4Path: final4Path ? path.relative(process.cwd(), final4Path) : null,
            pollutantClipsPath: pollutantClipsPath ? path.relative(process.cwd(), pollutantClipsPath) : null,
            customClipPath: customClipPath ? path.relative(process.cwd(), customClipPath) : null,
            indiceAtmo,
            qualificatif,
            frenchDate
        };

    } catch (error) {
        console.error('\n❌ ERREUR:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// Endpoints API
app.post('/render', async (req, res) => {
    try {
        console.log('🚀 POST /render - Starting...');

        const result = await generateComplete();

        if (result.success) {
            // Nettoyage final après succès
            const dateStr = getTodayDateString();
            setTimeout(() => {
                cleanupOldFiles(dateStr, true);
                cleanupTempFiles();
            }, 1000);

            res.json({
                success: true,
                message: 'Vidéo générée avec succès',
                files: {
                    mainVideo: result.finalPath,
                    final2Video: result.final2Path,
                    final3Video: result.final3Path,
                    pollutantClipsVideo: result.pollutantClipsPath
                },
                atmoData: {
                    indice: result.indiceAtmo,
                    qualificatif: result.qualificatif,
                    date: result.frenchDate
                }
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/render-with-custom-clip', upload.single('customClip'), async (req, res) => {
    try {
        console.log('🚀 POST /render-with-custom-clip - Starting...');

        // Nettoyage préventif au début
        const dateStr = getTodayDateString();
        cleanupOldFiles(dateStr, true);
        cleanupTempFiles();

        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Aucun fichier vidéo fourni. Utilisez le champ "customClip" pour upload.'
            });
        }

        const customClipPath = req.file.path;
        console.log('📁 Custom clip uploaded:', customClipPath);

        const result = await generateComplete(customClipPath);

        if (result.success) {
            // Nettoyage final après succès (garde seulement les fichiers du jour)
            setTimeout(() => {
                cleanupOldFiles(dateStr, true);
                cleanupTempFiles();
            }, 1000);

            res.json({
                success: true,
                message: 'Vidéo générée avec succès avec clip personnalisé',
                files: {
                    mainVideo: result.finalPath,
                    final2Video: result.final2Path,
                    final3Video: result.final3Path,
                    final4Video: result.final4Path,
                    pollutantClipsVideo: result.pollutantClipsPath,
                    customClip: result.customClipPath
                },
                atmoData: {
                    indice: result.indiceAtmo,
                    qualificatif: result.qualificatif,
                    date: result.frenchDate
                }
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint pour télécharger les vidéos générées
app.get('/download/:folder/:filename', (req, res) => {
    const { folder, filename } = req.params;
    const allowedFolders = ['final', 'final2', 'final3', 'final4', 'pollutant-clips'];

    if (!allowedFolders.includes(folder)) {
        return res.status(400).json({ error: 'Dossier non autorisé' });
    }

    const filePath = path.resolve(folder, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Fichier non trouvé' });
    }

    res.download(filePath);
});

// Endpoint de santé
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'API Video Generator is running',
        endpoints: [
            'POST /render - Génération vidéo standard (final → final2 → final3)',
            'POST /render-with-custom-clip - Génération avec clip personnalisé (final → final2 → final4)',
            'GET /download/:folder/:filename - Téléchargement des vidéos générées',
            'GET /health - Statut de l\'API'
        ]
    });
});

app.listen(PORT, () => {
    console.log(`🎬 Video Generator API running on port ${PORT}`);

    // Nettoyage au démarrage
    console.log('🧹 Nettoyage au démarrage...');
    cleanupOldFiles('dummy', false); // Nettoie tout sauf les templates
    cleanupTempFiles();

    console.log(`📋 Endpoints disponibles:`);
    console.log(`  POST /render - Génération vidéo complète`);
    console.log(`  POST /render-with-custom-clip - Génération avec clip personnalisé`);
    console.log(`  GET /download/:folder/:filename - Téléchargement de vidéos`);
    console.log(`  GET /health - Statut de l'API`);
});