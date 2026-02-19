const { createStrapi } = require('@strapi/strapi');
async function main() {
    const app = await createStrapi({ distDir: './dist' }).load();
    try {
        const res = await app.db.query('plugin::upload.file').findOne({
            where: { name: { $contains: 'giappone' } }
        });
        if (res) {
            console.log('--- FILE FOUND ---');
            console.log('NAME:', res.name);
            console.log('URL:', res.url);
            console.log('FORMATS:', JSON.stringify(res.formats, null, 2));
            console.log('PROVIDER_METADATA:', JSON.stringify(res.provider_metadata, null, 2));

            console.log('--- CHECKING URL ACCESSIBILITY ---');
            try {
                const check = await fetch(res.url, { method: 'HEAD' });
                console.log('STATUS:', check.status);
            } catch (e) {
                console.log('FETCH ERROR:', e.message);
            }
        } else {
            console.log('--- FILE NOT FOUND ---');
        }
    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        process.exit(0);
    }
}
main();
