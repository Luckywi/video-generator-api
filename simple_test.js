console.log('Starting test...');

const axios = require('axios');

async function test() {
  try {
    console.log('Making API call...');
    const response = await axios.get('https://api.atmo-aura.fr/api/v1/communes/69381/indices/atmo?api_token=0c7d0bee25f494150fa591275260e81f&date_echeance=now', {
      timeout: 5000
    });
    console.log('API response received');
    console.log('Indice:', response.data.data[0].indice);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test().then(() => {
  console.log('Test completed');
  process.exit(0);
}).catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});