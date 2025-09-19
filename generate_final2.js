const { fetchAtmoData, findBestTemplateFile } = require('./api/fetch-atmo');
const { generateAudio } = require('./api/elevenlabs');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

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

// Nouvelle fonction pour obtenir la durée d'une vidéo
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
        const ffmpegCommand = `ffmpeg -f lavfi -i color=c=white:s=1080x1920:d=${duration} -vf "drawtext=text='${text}':fontfile='./fonts/Inter/static/Inter_18pt-Medium.ttf':fontsize='if(lt(t,1),80+15*abs(sin(t*3)),80)':x=(w-text_w)/2:y=(h-text_h)/2:fontcolor=black,fade=in:st=0:d=0.5" -c:v libx264 -y "${videoPath}"`;

        console.log('📱 Génération vidéo verticale moderne avec effet bounce:', videoPath);

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

        exec(ffmpegCmd, (error, stdout, stderr) => {
            if (error) {
                console.error('💥 Erreur FFmpeg fusion:', stderr);
                return reject(new Error(stderr));
            }
            console.log('✅ Fusion terminée avec mix audio:', outputPath);
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
        // Obtenir la durée de la première vidéo pour calculer l'offset
        const firstVideoDuration = await getVideoDuration(inputVideo);
        const transitionDuration = 0.2;
        const offset = Math.max(0, firstVideoDuration - transitionDuration);
        
        console.log(`⏱️ Durée première vidéo: ${firstVideoDuration}s`);
        console.log(`🔧 Offset calculé: ${offset}s`);

        return new Promise((resolve, reject) => {
            // Version avec crossfade audio
            const ffmpegCmd = `ffmpeg -y -i "${inputVideo}" -i "${clipVideo}" -filter_complex "[0:v][1:v]xfade=transition=fade:duration=${transitionDuration}:offset=${offset}[v];[0:a][1:a]acrossfade=d=${transitionDuration}[a]" -map "[v]" -map "[a]" -c:v libx264 -crf 23 -preset veryfast "${outputVideo}"`;

            console.log('🔧 Concaténation avec transition...');

            exec(ffmpegCmd, (error, stdout, stderr) => {
                if (error) {
                    console.log('🔄 Tentative sans crossfade audio...');
                    // Version de fallback sans crossfade audio
                    const ffmpegCmdNoAudio = `ffmpeg -y -i "${inputVideo}" -i "${clipVideo}" -filter_complex "[0:v][1:v]xfade=transition=fade:duration=${transitionDuration}:offset=${offset}[v]" -map "[v]" -map 0:a -c:v libx264 -crf 23 -preset veryfast -shortest "${outputVideo}"`;

                    exec(ffmpegCmdNoAudio, (error2, stdout2, stderr2) => {
                        if (error2) {
                            console.log('🔄 Tentative avec concat simple...');
                            // Version de fallback avec concat simple
                            const ffmpegCmdConcat = `ffmpeg -y -i "${inputVideo}" -i "${clipVideo}" -filter_complex "[0:v][1:v]concat=n=2:v=1[v];[0:a][1:a]concat=n=2:v=0:a=1[a]" -map "[v]" -map "[a]" -c:v libx264 -crf 23 -preset veryfast "${outputVideo}"`;
                            
                            exec(ffmpegCmdConcat, (error3, stdout3, stderr3) => {
                                if (error3) {
                                    console.error('💥 Erreur FFmpeg final2:', stderr3);
                                    return reject(new Error(stderr3));
                                }
                                console.log('✅ Vidéo final2 générée (concat simple):', outputVideo);
                                resolve(outputVideo);
                            });
                        } else {
                            console.log('✅ Vidéo final2 générée (sans crossfade audio):', outputVideo);
                            resolve(outputVideo);
                        }
                    });
                } else {
                    console.log('✅ Vidéo final2 générée:', outputVideo);
                    resolve(outputVideo);
                }
            });
        });
    } catch (error) {
        throw new Error(`Erreur lors du calcul de durée: ${error.message}`);
    }
}

async function generatePollutantClips(atmoData, dateStr) {
    const templateBasePath = path.resolve('template-indice');
    const outputDir = path.resolve('pollutant-clips');

    // Créer le dossier pollutant-clips si besoin
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log('📁 Dossier pollutant-clips créé');
    }

    // Ordre des polluants: PM2.5, O3, NO2, SO2
    const pollutantOrder = ['PM2.5', 'O3', 'SO2', 'NO2'];
    const videoClips = [];

    console.log('\n=== GÉNÉRATION CLIPS POLLUANTS ===');

    for (const pollutant of pollutantOrder) {
        // Trouver le polluant dans les données de l'API
        const pollutantData = atmoData.sous_indices.find(p => p.polluant_nom === pollutant);

        if (pollutantData) {
            console.log(`🔍 Traitement ${pollutant} avec indice ${pollutantData.indice}`);

            // Chercher le fichier template correspondant
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

    // Concaténer tous les clips trouvés
    const outputPath = path.join(outputDir, `pollutants-${dateStr}.mp4`);

    return new Promise((resolve, reject) => {
        // Créer une liste de fichiers pour ffmpeg concat
        const fileListPath = path.join(outputDir, `filelist-${dateStr}.txt`);
        const fileListContent = videoClips.map(clip => `file '${clip}'`).join('\n');

        fs.writeFileSync(fileListPath, fileListContent);

        // Forcer le réencodage avec frame rate uniforme pour assurer la compatibilité
        const ffmpegCmd = `ffmpeg -y -f concat -safe 0 -i "${fileListPath}" -c:v libx264 -c:a aac -preset veryfast -r 25 -avoid_negative_ts make_zero "${outputPath}"`;
        console.log('🔧 Commande concat polluants avec réencodage et frame rate uniforme:', ffmpegCmd);

        exec(ffmpegCmd, (error, stdout, stderr) => {
            // Nettoyer le fichier temporaire
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

    // Créer le dossier final3 si besoin
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log('📁 Dossier final3 créé');
    }

    const outputPath = path.join(outputDir, `complete-${dateStr}.mp4`);

    return new Promise((resolve, reject) => {
        // Créer une liste de fichiers pour la concaténation finale
        const fileListPath = path.join(outputDir, `final-filelist-${dateStr}.txt`);

        // S'assurer que les chemins sont absolus pour ffmpeg concat
        const absoluteFinal2Path = path.resolve(final2Path);
        const absolutePollutantPath = path.resolve(pollutantClipsPath);

        const fileListContent = `file '${absoluteFinal2Path}'\nfile '${absolutePollutantPath}'`;

        fs.writeFileSync(fileListPath, fileListContent);

        console.log('📝 Contenu du fichier de liste:', fileListContent);

        // Utiliser une approche différente avec les filtres FFmpeg
        const ffmpegCmd = `ffmpeg -y -i "${absoluteFinal2Path}" -i "${absolutePollutantPath}" -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" -c:v libx264 -c:a aac -preset veryfast -r 25 "${outputPath}"`;
        console.log('🔧 Commande combinaison finale avec filter_complex:', ffmpegCmd);

        exec(ffmpegCmd, (error, stdout, stderr) => {
            // Nettoyer le fichier temporaire
            if (fs.existsSync(fileListPath)) {
                fs.unlinkSync(fileListPath);
            }

            if (error) {
                console.log('🔄 Tentative avec méthode de fallback...');
                // Méthode de fallback avec re-encodage des deux inputs séparément
                const tempFinal2 = path.join(outputDir, `temp-final2-${dateStr}.mp4`);
                const tempPollutant = path.join(outputDir, `temp-pollutant-${dateStr}.mp4`);

                const normalizeCmd1 = `ffmpeg -y -i "${absoluteFinal2Path}" -c:v libx264 -c:a aac -r 25 -preset veryfast "${tempFinal2}"`;
                console.log('🔧 Normalisation final2:', normalizeCmd1);

                exec(normalizeCmd1, (error1, stdout1, stderr1) => {
                    if (error1) {
                        console.error('💥 Erreur normalisation final2:', stderr1);
                        return reject(new Error(stderr1));
                    }

                    const normalizeCmd2 = `ffmpeg -y -i "${absolutePollutantPath}" -c:v libx264 -c:a aac -r 25 -preset veryfast "${tempPollutant}"`;
                    console.log('🔧 Normalisation pollutant:', normalizeCmd2);

                    exec(normalizeCmd2, (error2, stdout2, stderr2) => {
                        if (error2) {
                            console.error('💥 Erreur normalisation pollutant:', stderr2);
                            return reject(new Error(stderr2));
                        }

                        const finalConcatCmd = `ffmpeg -y -i "${tempFinal2}" -i "${tempPollutant}" -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" -c:v libx264 -c:a aac -preset veryfast "${outputPath}"`;
                        console.log('🔧 Concaténation finale normalisée:', finalConcatCmd);

                        exec(finalConcatCmd, (error3, stdout3, stderr3) => {
                            // Nettoyer les fichiers temporaires
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

function getTodayDateString() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = String(today.getFullYear()).slice(-2);
    return `${day}-${month}-${year}`;
}

async function generateComplete() {
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
        ['videos', 'audio', 'final', 'final2', 'final3', 'pollutant-clips'].forEach(dir => {
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

        // Étape 7: Créer final3 en combinant final2 + clips polluants
        if (pollutantClipsPath) {
            console.log('\n=== ÉTAPE 7: CRÉATION FINAL3 ===');
            final3Path = await createFinal3(final2Path, pollutantClipsPath, dateStr);
            console.log('\n🎉 PROCESSUS TERMINÉ AVEC SUCCÈS!');
            console.log(`📼 Vidéo complète: ${path.relative(process.cwd(), final3Path)}`);
        } else {
            console.log('\n⚠️ Aucun clip polluant généré, final2 reste la version finale');
            console.log('\n🎉 PROCESSUS TERMINÉ AVEC SUCCÈS!');
            console.log(`📼 Vidéo finale: ${path.relative(process.cwd(), final2Path)}`);
        }

        return {
            success: true,
            finalPath: path.relative(process.cwd(), finalPath),
            final2Path: path.relative(process.cwd(), final2Path),
            final3Path: final3Path ? path.relative(process.cwd(), final3Path) : null,
            pollutantClipsPath: pollutantClipsPath ? path.relative(process.cwd(), pollutantClipsPath) : null,
            indiceAtmo,
            qualificatif
        };

    } catch (error) {
        console.error('\n❌ ERREUR:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

if (require.main === module) {
    generateComplete().then(result => {
        if (result.success) {
            console.log('\n✅ RÉSULTAT:');
            console.log(`- Vidéo base: ${result.finalPath}`);
            console.log(`- Vidéo final2: ${result.final2Path}`);
            if (result.pollutantClipsPath) {
                console.log(`- Clips polluants: ${result.pollutantClipsPath}`);
            }
            if (result.final3Path) {
                console.log(`- Vidéo final3: ${result.final3Path}`);
            }
            console.log(`- Qualité air: ${result.indiceAtmo} (${result.qualificatif})`);
        } else {
            console.error('\n❌ ÉCHEC:', result.error);
            process.exit(1);
        }
    });
}

module.exports = { generateComplete };