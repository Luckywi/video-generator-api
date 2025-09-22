const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

function getAtmoIndex() {
  return new Promise((resolve, reject) => {
    const apiToken = process.env.ATMO_API_TOKEN || '0c7d0bee25f494150fa591275260e81f';
    const apiUrl = `https://api.atmo-aura.fr/api/v1/communes/69381/indices/atmo?api_token=${apiToken}&date_echeance=now`;

    console.log('🌍 Récupération de l\'indice ATMO...');

    exec(`curl -s "${apiUrl}"`, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Erreur API: ${stderr}`));
        return;
      }

      try {
        const response = JSON.parse(stdout);
        const indice = response.data[0].indice;
        const qualificatif = response.data[0].qualificatif;
        console.log(`📊 Indice ATMO récupéré: ${indice} (${qualificatif})`);
        resolve(indice);
      } catch (parseError) {
        reject(new Error(`Erreur parsing JSON: ${parseError.message}`));
      }
    });
  });
}

async function generateFinal2(dateStr) {
  try {
    // 1. Récupérer l'indice via API ATMO
    const indice = await getAtmoIndex();

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

    // 4. Commande FFmpeg avec crossfade - utilise une durée fixe de transition
    const ffmpegCmd = `ffmpeg -y -i "${inputVideo}" -i "${clipVideo}" -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.2:offset=0.8[v];[0:a][1:a]acrossfade=d=0.2[a]" -map "[v]" -map "[a]" -c:v libx264 -crf 23 -preset veryfast "${outputVideo}"`;

    console.log('🔧 Exécution de la commande FFmpeg...');

    return new Promise((resolve, reject) => {
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

// Exemple d'utilisation
(async () => {
  const dateStr = getTodayDateString();
  console.log(`📅 Date du jour: ${dateStr}`);

  try {
    await generateFinal2(dateStr);
    console.log('🎉 Génération final2 terminée avec succès!');
  } catch (e) {
    console.error('❌ Erreur génération final2:', e.message);
    process.exit(1);
  }
})();