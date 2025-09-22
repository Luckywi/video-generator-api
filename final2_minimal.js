const fs = require('fs');
const path = require('path');

function generateFinal2Minimal() {
  // Simuler l'indice 2 pour test
  const indice = 2;
  console.log(`📊 Indice ATMO simulé: ${indice}`);

  // Choisir le template correspondant
  const templates = {
    1: 'template-qualité/bonne.mov',
    2: 'template-qualité/moyenne.mov',
    3: 'template-qualité/dégradée.mov',
    4: 'template-qualité/mauvaise.mov',
    5: 'template-qualité/trés mauvaise.mov'
  };

  const templatePath = templates[indice];
  console.log(`🎬 Template sélectionné: ${templatePath}`);

  // Générer la date d'aujourd'hui
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = String(today.getFullYear()).slice(-2);
  const dateStr = `${day}-${month}-${year}`;

  console.log(`📅 Date du jour: ${dateStr}`);

  // Créer le dossier final2
  const outputDir = path.resolve('final2');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log('📁 Dossier final2 créé');
  }

  const outputVideo = path.join(outputDir, `${dateStr}.mp4`);

  // Vérifier les fichiers
  const inputVideo = path.resolve(`final/${dateStr}.mp4`);
  const clipVideo = path.resolve(templatePath);

  console.log(`📼 Vidéo d'entrée: ${inputVideo}`);
  console.log(`🎬 Clip template: ${clipVideo}`);
  console.log(`💾 Sortie: ${outputVideo}`);

  if (!fs.existsSync(inputVideo)) {
    console.log(`❌ Fichier vidéo d'entrée manquant: ${inputVideo}`);
    return false;
  }

  if (!fs.existsSync(clipVideo)) {
    console.log(`❌ Fichier template manquant: ${clipVideo}`);
    return false;
  }

  console.log('✅ Tous les fichiers sont présents');

  // Commande FFmpeg qui serait exécutée
  const ffmpegCmd = `ffmpeg -y -i "${inputVideo}" -i "${clipVideo}" -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.2:offset=END-0.2[v];[0:a][1:a]acrossfade=d=0.2[a]" -map "[v]" -map "[a]" -c:v libx264 -crf 23 -preset veryfast "${outputVideo}"`;

  console.log('🔧 Commande FFmpeg:');
  console.log(ffmpegCmd);

  return true;
}

generateFinal2Minimal();