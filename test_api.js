const axios = require('axios');
require('dotenv').config();

async function testAtmoAPI() {
  try {
    const apiToken = process.env.ATMO_API_TOKEN || '0c7d0bee25f494150fa591275260e81f';
    const apiUrl = `https://api.atmo-aura.fr/api/v1/communes/69381/indices/atmo?api_token=${apiToken}&date_echeance=now`;

    console.log('🌍 Test de l\'API ATMO...');
    const response = await axios.get(apiUrl);
    const indice = response.data.data[0].indice;
    const qualificatif = response.data.data[0].qualificatif;

    console.log(`📊 Indice ATMO: ${indice} (${qualificatif})`);

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
    console.log(`📼 Fichier de sortie: final2/${dateStr}.mp4`);

    return { indice, templatePath, dateStr };

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    throw error;
  }
}

testAtmoAPI();