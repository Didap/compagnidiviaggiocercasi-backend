const { createStrapi } = require('@strapi/strapi');
const fs = require('fs');
const path = require('path');

// Helper to download image (using native fetch in Node 18+)
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
        imageUrl: 'https://images.unsplash.com/photo-1476610182048-b716b8518aae?auto=format&fit=crop&w=800',
        itinerary: [
            { title: 'Arrivo a Reykjavík', description: 'Arrivo e sistemazione in hotel. Serata libera.' },
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

const cloudinary = require('cloudinary').v2;

async function main() {
    const app = await createStrapi({ distDir: './dist' }).load();

    // Configure Cloudinary
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_NAME,
        api_key: process.env.CLOUDINARY_KEY,
        api_secret: process.env.CLOUDINARY_SECRET
    });

    try {
        console.log('🚀 Starting trip seeding (Direct Cloudinary)...');

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

            // 2. Upload Image Direct to Cloudinary
            console.log(`  Downloading image...`);
            let buffer;
            try {
                buffer = await downloadImage(trip.imageUrl);
            } catch (e) {
                console.error('Failed to download image', e);
                continue;
            }

            const tempFilePath = path.join(__dirname, `temp_${Date.now()}.jpg`);
            fs.writeFileSync(tempFilePath, buffer);

            console.log(`  Uploading to Cloudinary...`);

            let uploadResult;
            try {
                uploadResult = await cloudinary.uploader.upload(tempFilePath, {
                    folder: 'strapi-uploads', // Optional
                    public_id: trip.slug
                });
            } catch (cloudErr) {
                console.error('Cloudinary Upload Failed:', cloudErr);
                if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
                continue;
            }

            // Cleanup temp file
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

            console.log(`  ✅ Uploaded to Cloudinary: ${uploadResult.secure_url}`);

            // 3. Create File Entry in Strapi
            const fileEntry = await app.db.query('plugin::upload.file').create({
                data: {
                    name: `${trip.slug}.jpg`,
                    alternativeText: trip.title,
                    caption: trip.title,
                    width: uploadResult.width,
                    height: uploadResult.height,
                    formats: null, // Simplified, usually Cloudinary triggers generation but here we skip
                    hash: uploadResult.public_id,
                    ext: '.jpg',
                    mime: 'image/jpeg',
                    size: uploadResult.bytes / 1000,
                    url: uploadResult.secure_url,
                    previewUrl: null,
                    provider: 'cloudinary',
                    provider_metadata: {
                        public_id: uploadResult.public_id,
                        resource_type: uploadResult.resource_type
                    },
                    folderPath: '/',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }
            });

            console.log(`  ✅ Created File entry in Strapi with ID: ${fileEntry.id}`);

            // 4. Create Trip
            console.log(`  Creating trip entry...`);
            await app.documents('api::trip.trip').create({
                data: {
                    title: trip.title,
                    slug: trip.slug,
                    destination: trip.destination,
                    description: trip.description,
                    shortDescription: trip.shortDescription,
                    image: fileEntry.id,
                    gallery: [fileEntry.id],
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
        process.exit(0);
    }
}

main();
