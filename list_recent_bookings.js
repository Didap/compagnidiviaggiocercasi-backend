
const strapi = require('@strapi/strapi');

async function listRecentBookings() {
    const app = await strapi.createStrapi({ distDir: './dist' }).load();

    try {
        const bookings = await app.documents('api::booking.booking').findMany({
            status: 'draft',
            sort: 'createdAt:desc',
            limit: 5,
            fields: ['documentId', 'status', 'createdAt', 'publishedAt']
        });

        console.log('--- RECENT BOOKINGS (DRAFT) ---');
        bookings.forEach(b => console.log(`${b.documentId} | Created: ${b.createdAt} | Published: ${b.publishedAt} | Status: '${b.status}'`));

    } catch (err) {
        console.error(err);
    }

    process.exit(0);
}

listRecentBookings();
