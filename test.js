const { fetchAtmoData } = require('./api/fetch-atmo');
const { exec } = require('child_process');

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

async function testAPI() {
    try {
        console.log('Testing ATMO API...');
        const atmoData = await fetchAtmoData();
        console.log('ATMO data:', atmoData);

        const dateEcheance = atmoData.date_echeance;
        console.log('Date echeance:', dateEcheance);

        const frenchDate = formatDateToFrench(dateEcheance);
        console.log('French date:', frenchDate);

        console.log('Testing FFmpeg video generation...');
        const ffmpegCommand = `ffmpeg -f lavfi -i color=c=white:s=1920x1080:d=3 -vf "drawtext=text='${frenchDate}':x=(w-text_w)/2:y=(h-text_h)/2:fontsize=60:fontcolor=black,fade=in:st=0:d=1" -y "videos/intro.mp4"`;

        console.log('Command:', ffmpegCommand);

        exec(ffmpegCommand, (error, stdout, stderr) => {
            if (error) {
                console.error('FFmpeg error:', error);
                return;
            }
            console.log('Video generated successfully!');
            console.log('FFmpeg stdout:', stdout);
            console.log('FFmpeg stderr:', stderr);
        });

    } catch (error) {
        console.error('Error:', error);
    }
}

testAPI();