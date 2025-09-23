const axios = require('axios');

async function fetchAtmoData() {
    try {
        const response = await axios.get('https://api.atmo-aura.fr/api/v1/communes/69381/indices/atmo', {
            params: {
                api_token: '0c7d0bee25f494150fa591275260e81f',
                date_echeance: 'now'
            }
        });

        return response.data.data[0];
    } catch (error) {
        throw new Error(`Failed to fetch ATMO data: ${error.message}`);
    }
}

function getAirQualityMapping() {
    return {
        1: 'bon',
        2: 'moyen',
        3: 'dégradé',
        4: 'mauvais',
        5: 'très mauvais',
        6: 'extrêmement mauvais'
    };
}

function findBestTemplateFile(pollutant, indice, basePath) {
    const mapping = getAirQualityMapping();
    const quality = mapping[indice] || 'bon';

    const possibleFiles = [
        `${pollutant}_${quality}.mp4`,
        `${pollutant}_${quality}.mov`,
        `${pollutant.toLowerCase()}_${quality}.mp4`,
        `${pollutant.toLowerCase()}_${quality}.mov`
    ];

    const fs = require('fs');
    const path = require('path');

    for (const fileName of possibleFiles) {
        const fullPath = path.join(basePath, pollutant, fileName);
        if (fs.existsSync(fullPath)) {
            return fullPath;
        }

        const lowerPath = path.join(basePath, pollutant.toLowerCase(), fileName);
        if (fs.existsSync(lowerPath)) {
            return lowerPath;
        }
    }

    return null;
}

module.exports = { fetchAtmoData, getAirQualityMapping, findBestTemplateFile };