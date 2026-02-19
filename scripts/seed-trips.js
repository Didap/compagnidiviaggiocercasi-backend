const { createStrapi } = require('@strapi/strapi');
const fs = require('fs');
const path = require('path');

async function downloadImage(url) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

const trips = [
    {
        title: 'Aurora Boreale in Islanda',
        slug: 'aurora-boreale-islanda',
        destination: 'Islanda',
        description: 'Un viaggio indimenticabile alla scoperta delle luci del nord.',
        shortDescription: 'Caccia all\'aurora boreale tra ghiacciai e vulcani.',
        imageUrl: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=800',
        itinerary: [
            { title: 'Arrivo a Reykjavík', description: 'Arrivo e sistemazione in hotel.' },
            { title: 'Circolo d\'Oro', description: 'Visita a Geysir, Gullfoss e Thingvellir.' }
        ]
    },
    {
        title: 'Safari in Tanzania',
        slug: 'safari-tanzania',
        destination: 'Tanzania',
        description: 'Avventura nel Serengeti e relax a Zanzibar.',
        shortDescription: 'Il vero mal d\'Africa tra savana e oceano.',
        imageUrl: 'https://images.unsplash.com/photo-1516426122078-c23e76319801?auto=format&fit=crop&w=800',
        itinerary: [
            { title: 'Arrivo ad Arusha', description: 'Accoglienza e briefing.' },
            { title: 'Serengeti', description: 'Game drive alla ricerca dei Big Five.' }
        ]
    },
    {
        title: 'Giappone Classico',
        slug: 'giappone-classico',
        destination: 'Giappone',
        description: 'Da Tokyo a Kyoto, tra futuro e tradizione.',
        shortDescription: 'Un tuffo nella cultura millenaria del Sol Levante.',
        imageUrl: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=800',
        itinerary: [
            { title: 'Tokyo', description: 'Esplorazione dei quartieri moderni.' },
            { title: 'Kyoto', description: 'Visita ai templi storici.' }
        ]
    }
];

async function main() {
    const strapi = await createStrapi({}).load();

    try {
        console.log('🚀 Starting trip seeding...');

        for (const trip of trips) {
            console.log(`Processing: ${trip.title}`);

            // 1. Check if trip exists
            const existing = await strapi.documents('api::trip.trip').findMany({
                filters: { slug: trip.slug }
            });

            if (existing.length > 0) {
                console.log(`⚠️ Trip ${trip.slug} already exists. Skipping.`);
                continue;
            }

            // 2. Upload Image
            console.log(`  Downloading image...`);
            const buffer = await downloadImage(trip.imageUrl);

            console.log(`  Uploading to Cloudinary...`);
            const uploadService = strapi.plugin('upload').service('upload');

            // Mock file object for Strapi Upload
            const fileData = {
                name: `${trip.slug}.jpg`,
                hash: `${trip.slug}_${Date.now()}`,
                ext: '.jpg',
                mime: 'image/jpeg',
                size: buffer.length / 1000,
                buffer: buffer,
                path: null,
            };

            // Upload explicitly
            const uploadedFiles = await uploadService.upload({
                data: {}, // Metadata
                files: fileData
            });

            const imageId = uploadedFiles[0].id;
            console.log(`  ✅ Image uploaded with ID: ${imageId}`);

            // 3. Create Trip
            console.log(`  Creating trip entry...`);
            await strapi.documents('api::trip.trip').create({
                data: {
                    title: trip.title,
                    slug: trip.slug,
                    destination: trip.destination,
                    description: trip.description,
                    shortDescription: trip.shortDescription,
                    image: imageId,
                    gallery: [imageId], // Reuse same image for gallery for demo
                    itinerary: trip.itinerary
                },
                status: 'published'
            });

            console.log(`  ✅ Trip created successfully!`);
        }

        console.log('🎉 All trips seeded successfully!');

    } catch (error) {
        console.error('❌ Error seeding trips:', error);
    } finally {
        // Strapi destroy/stop if needed, but usually process.exit is enough for scripts
        process.exit(0);
    }
}

main();
