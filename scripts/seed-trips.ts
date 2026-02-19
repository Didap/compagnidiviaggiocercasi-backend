import { createStrapi } from '@strapi/strapi';
import fs from 'fs';
import path from 'path';

// Define Trip Interface for better type safety (optional but good practice)
interface TripData {
    title: string;
    slug: string;
    destination: string;
    description: string;
    shortDescription: string;
    imageUrl: string;
    itinerary: { title: string; description: string }[];
}

const trips: TripData[] = [
    {
        title: 'Aurora Boreale in Islanda',
        slug: 'aurora-boreale-islanda',
        destination: 'Islanda',
        description: 'Un viaggio indimenticabile alla scoperta delle luci del nord. Esplora vulcani, ghiacciai e lagune termali in un tour che ti lascerà senza fiato.',
        shortDescription: 'Caccia all\'aurora boreale tra ghiacciai e vulcani.',
        imageUrl: 'https://images.unsplash.com/photo-1476610182048-b716b8518aae?auto=format&fit=crop&w=800',
        itinerary: [
            { title: 'Arrivo a Reykjavík', description: 'Arrivo e sistemazione in hotel. Serata libera.' },
            { title: 'Circolo d\'Oro', description: 'Visita a Geysir, Gullfoss e Thingvellir.' },
            { title: 'Costa Sud', description: 'Cascate, spiagge nere e scogliere di basalto.' }
        ]
    },
    {
        title: 'Safari in Tanzania',
        slug: 'safari-tanzania',
        destination: 'Tanzania',
        description: 'Avventura nel Serengeti e relax a Zanzibar. Il perfetto mix tra avventura selvaggia e relax in paradiso.',
        shortDescription: 'Il vero mal d\'Africa tra savana e oceano.',
        imageUrl: 'https://images.unsplash.com/photo-1516426122078-c23e76319801?auto=format&fit=crop&w=800',
        itinerary: [
            { title: 'Arrivo ad Arusha', description: 'Accoglienza e briefing sul safari.' },
            { title: 'Serengeti', description: 'Game drive alla ricerca dei Big Five e tramonto nella savana.' },
            { title: 'Cratere di Ngorongoro', description: 'Discesa nel cratere per un safari unico.' }
        ]
    },
    {
        title: 'Giappone Classico',
        slug: 'giappone-classico',
        destination: 'Giappone',
        description: 'Da Tokyo a Kyoto, tra futuro e tradizione. Un viaggio che unisce la tecnologia sfrenata alla pace dei giardini zen.',
        shortDescription: 'Un tuffo nella cultura millenaria del Sol Levante.',
        imageUrl: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=800',
        itinerary: [
            { title: 'Tokyo', description: 'Esplorazione dei quartieri moderni di Shinjuku e Shibuya.' },
            { title: 'Kyoto', description: 'Visita ai templi storici e al quartiere delle geishe.' },
            { title: 'Nara e Osaka', description: 'I cervi sacri di Nara e lo street food di Osaka.' }
        ]
    }
];

// Helper to download image
async function downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

async function main() {
    // Initialize Strapi
    const app = await createStrapi({}).load();

    try {
        console.log('🚀 Starting trip seeding...');

        for (const trip of trips) {
            console.log(`Processing: ${trip.title}`);

            // 1. Check if trip exists
            const existing = await app.documents('api::trip.trip').findMany({
                filters: { slug: trip.slug }
            });

            if (existing.length > 0) {
                console.log(`⚠️ Trip ${trip.slug} already exists. Skipping.`);
                continue;
            }

            // 2. Upload Image
            console.log(`  Downloading image from ${trip.imageUrl}...`);
            let buffer: Buffer;
            try {
                buffer = await downloadImage(trip.imageUrl);
            } catch (err) {
                console.error(`  ❌ Failed to download image: ${err.message}`);
                continue;
            }

            console.log(`  Uploading to Cloudinary...`);
            const uploadService = app.plugin('upload').service('upload');

            const fileData = {
                name: `${trip.slug}.jpg`,
                hash: `${trip.slug}_${Date.now()}`,
                ext: '.jpg',
                mime: 'image/jpeg',
                size: buffer.length / 1000, // Size in KB
                buffer: buffer,
                path: null,
            };

            try {
                // Upload explicitly
                const uploadedFiles = await uploadService.upload({
                    data: {},
                    files: fileData
                });

                if (!uploadedFiles || uploadedFiles.length === 0) {
                    throw new Error('No files returned from upload service');
                }

                const imageId = uploadedFiles[0].id;
                const imageDocumentId = uploadedFiles[0].documentId; // Strapi v5 uses documentId mainly
                console.log(`  ✅ Image uploaded. ID: ${imageId}, DocumentID: ${imageDocumentId}`);

                // 3. Create Trip
                console.log(`  Creating trip entry...`);
                // Use documentId for relation if available, but ID is standard for upload plugin return
                // Strapi v5 documents API expects IDs or DocumentIDs for relations? 
                // Usually ID is safer for core upload plugin.

                await app.documents('api::trip.trip').create({
                    data: {
                        title: trip.title,
                        slug: trip.slug,
                        destination: trip.destination,
                        description: trip.description,
                        shortDescription: trip.shortDescription,
                        image: imageId, // Link by ID
                        gallery: [imageId],
                        itinerary: trip.itinerary
                    },
                    status: 'published'
                });

                console.log(`  ✅ Trip created successfully!`);

            } catch (uploadErr) {
                console.error('  ❌ Upload/Creation failed:', uploadErr);
            }
        }

        console.log('🎉 All trips seeded successfully!');

    } catch (error) {
        console.error('❌ Error seeding trips:', error);
    } finally {
        // We don't need to explicitly stop as the script will exit, 
        // but destroying the instance is good practice if ensuring DB connections close.
        // app.destroy(); 
        process.exit(0);
    }
}

main();
