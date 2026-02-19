const { createStrapi } = require('@strapi/strapi');
async function main() {
    const app = await createStrapi({ distDir: './dist' }).load();
    try {
        const res = await app.db.query('plugin::upload.file').findOne({
            where: { name: { $contains: 'giappone' } }
        });
        if (res) {
            console.log('UPDATING FILE:', res.name);

            // Generate thumbnail URL by inserting transformation into Cloudinary URL
            // Original: https://res.cloudinary.com/daz1m90yx/image/upload/v1771493403/strapi-uploads/giappone-classico.jpg
            // Target: https://res.cloudinary.com/daz1m90yx/image/upload/c_fill,w_112,h_112,g_auto/v1771493403/strapi-uploads/giappone-classico.jpg

            const thumbUrl = res.url.replace('/upload/', '/upload/c_fill,w_112,h_112,g_auto/');

            const formats = {
                thumbnail: {
                    name: 'thumbnail_' + res.name,
                    hash: 'thumbnail_' + res.hash,
                    ext: res.ext,
                    mime: res.mime,
                    width: 112,
                    height: 112,
                    size: res.size / 4, // Estimate
                    url: thumbUrl
                }
            };

            await app.db.query('plugin::upload.file').update({
                where: { id: res.id },
                data: { formats }
            });

            console.log('--- SUCCESS: Thumbnail added ---');
            console.log('Thumb URL:', thumbUrl);
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
