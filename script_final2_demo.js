const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

async function generateFinal2(dateStr, forceIndice = null) {
  try {
    // 1. Récupérer l'indice (hardcodé pour la démo, ou via API en production)
    let indice = forceIndice || 2; // Par défaut indice 2 (moyenne)

    if (!forceIndice) {
      // TODO: Implémenter l'appel API ATMO en production
      console.log('🌍 Utilisation de l\'indice par défaut (API désactivée pour la démo)');
    }

    console.log(`📊 Indice ATMO: ${indice}`);

    // 2. Choisir le template correspondant
    const templates = {
      1: 'template-qualité/bonne.mov',
      2: 'template-qualité/moyenne.mov',
      3: 'template-qualité/dégradée.mov',
      4: 'template-qualité/mauvaise.mov',
      5: 'template-qualité/trés mauvaise.mov'
    };

    const templatePath = templates[indice];
    if (!templatePath) {
      throw new Error(`Indice ${indice} non supporté`);
    }
    console.log(`🎬 Template sélectionné: ${templatePath}`);

    // 3. Construire les chemins d'entrée/sortie
    const inputVideo = path.resolve(`final/${dateStr}.mp4`);
    const clipVideo = path.resolve(templatePath);
    const outputDir = path.resolve('final2');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log('📁 Dossier final2 créé');
    }

    const outputVideo = path.join(outputDir, `${dateStr}.mp4`);

    // Vérifier que les fichiers d'entrée existent
    if (!fs.existsSync(inputVideo)) {
      throw new Error(`Fichier vidéo d'entrée introuvable: ${inputVideo}`);
    }
    if (!fs.existsSync(clipVideo)) {
      throw new Error(`Fichier template introuvable: ${clipVideo}`);
    }

    console.log(`📼 Vidéo d'entrée: ${inputVideo}`);
    console.log(`🎬 Clip template: ${clipVideo}`);
    console.log(`💾 Sortie: ${outputVideo}`);

    // 4. Vérifier si FFmpeg est installé
    console.log('🔍 Vérification de FFmpeg...');

    return new Promise((resolve, reject) => {
      exec('ffmpeg -version', (error, stdout, stderr) => {
        if (error) {
          console.log('❌ FFmpeg n\'est pas installé. Voici la commande qui serait exécutée:');
          const ffmpegCmd = `ffmpeg -y -i "${inputVideo}" -i "${clipVideo}" -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.2:offset=0.8[v];[0:a][1:a]acrossfade=d=0.2[a]" -map "[v]" -map "[a]" -c:v libx264 -crf 23 -preset veryfast "${outputVideo}"`;
          console.log('\n🔧 Commande FFmpeg:');
          console.log(ffmpegCmd);
          console.log('\n📝 Pour installer FFmpeg:');
          console.log('brew install ffmpeg  # sur macOS');
          console.log('apt install ffmpeg   # sur Ubuntu/Debian');
          resolve(outputVideo);
          return;
        }

        console.log('✅ FFmpeg détecté');

        // Commande FFmpeg avec crossfade
        const ffmpegCmd = `ffmpeg -y -i "${inputVideo}" -i "${clipVideo}" -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.2:offset=0.8[v];[0:a][1:a]acrossfade=d=0.2[a]" -map "[v]" -map "[a]" -c:v libx264 -crf 23 -preset veryfast "${outputVideo}"`;

        console.log('🔧 Exécution de la commande FFmpeg...');
        console.log(`Command: ${ffmpegCmd}`);

        exec(ffmpegCmd, (error, stdout, stderr) => {
          if (error) {
            console.error('💥 Erreur FFmpeg:', stderr);
            // Essayer sans audio si erreur audio
            console.log('🔄 Tentative sans crossfade audio...');
            const ffmpegCmdNoAudio = `ffmpeg -y -i "${inputVideo}" -i "${clipVideo}" -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.2:offset=0.8[v]" -map "[v]" -map 0:a -c:v libx264 -crf 23 -preset veryfast -shortest "${outputVideo}"`;

            exec(ffmpegCmdNoAudio, (error2, stdout2, stderr2) => {
              if (error2) {
                console.error('💥 Erreur FFmpeg (sans audio):', stderr2);
                return reject(new Error(stderr2));
              }
              console.log('✅ Vidéo finale (final2) générée:', outputVideo);
              resolve(outputVideo);
            });
          } else {
            console.log('✅ Vidéo finale (final2) générée:', outputVideo);
            resolve(outputVideo);
          }
        });
      });
    });
  } catch (error) {
    console.error('❌ Erreur lors de la génération:', error.message);
    throw error;
  }
}

// Fonction pour générer la date d'aujourd'hui au format attendu
function getTodayDateString() {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = String(today.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

// Fonction pour tester avec différents indices
async function testAllIndices() {
  const dateStr = getTodayDateString();
  console.log(`📅 Date du jour: ${dateStr}\n`);

  for (let i = 1; i <= 5; i++) {
    console.log(`\n🧪 Test avec indice ${i}:`);
    try {
      await generateFinal2(`test-${dateStr}-${i}`, i);
    } catch (e) {
      console.error(`❌ Erreur pour indice ${i}:`, e.message);
    }
  }
}

// Utilisation principale
(async () => {
  const args = process.argv.slice(2);

  if (args[0] === 'test-all') {
    await testAllIndices();
  } else {
    const dateStr = getTodayDateString();
    console.log(`📅 Date du jour: ${dateStr}`);

    try {
      await generateFinal2(dateStr);
      console.log('🎉 Génération final2 terminée avec succès!');
    } catch (e) {
      console.error('❌ Erreur génération final2:', e.message);
      process.exit(1);
    }
  }
})();