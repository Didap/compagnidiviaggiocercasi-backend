
const strapi = require('@strapi/strapi');

async function checkPublished() {
    const app = await strapi.createStrapi({ distDir: './dist' }).load();

    try {
        const drafts = await app.documents('api::booking.booking').findMany({
            status: 'draft',
            sort: 'createdAt:desc',
            limit: 1,
            fields: ['documentId']
        });

        if (drafts.length === 0) {
            console.log('No bookings found.');
        } else {
            const docId = drafts[0].documentId;
            console.log(`Latest Doc ID: ${docId}`);

            const published = await app.documents('api::booking.booking').findOne({
                documentId: docId,
                status: 'published',
                fields: ['status', 'publishedAt']
            });

            if (published) {
                console.log(`PUBLISHED FOUND. Status: '${published.status}'`);
            } else {
                console.log('PUBLISHED VERSION NOT FOUND');
            }
        }

    } catch (err) {
        console.error('ERROR:', err);
    }

    process.exit(0);
}

checkPublished();
