const { createStrapi } = require('@strapi/strapi');

async function main() {
    // Load Strapi
    const app = await createStrapi({}).load();

    try {
        console.log('🚀 Starting permission seeding...');

        // 1. Get Roles
        const publicRole = await app.db.query('plugin::users-permissions.role').findOne({ where: { type: 'public' } });
        const authenticatedRole = await app.db.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } });

        if (!publicRole || !authenticatedRole) {
            throw new Error('Public or Authenticated role not found');
        }

        // 2. Define Permissions to Enable for PUBLIC
        const publicPermissions = [
            'api::trip.trip.find',
            'api::trip.trip.findOne',
            'api::offer.offer.find',
            'api::offer.offer.findOne',
            'api::review.review.find',
            'api::review.review.findOne',
            'api::booking.booking.create',
        ];

        // 3. Define Permissions to Enable for AUTHENTICATED
        const authenticatedPermissions = [
            ...publicPermissions,
            'api::booking.booking.create',
            'api::booking.booking.find',
            'api::booking.booking.findOne',
            'api::review.review.create',
            'plugin::users-permissions.user.me',
            'plugin::upload.content-api.upload',
        ];


        // Helper to enable permissions
        const enablePermissions = async (roleId, actions) => {
            for (const action of actions) {
                // Check if permission exists
                const existing = await app.db.query('plugin::users-permissions.permission').findOne({
                    where: { role: roleId, action }
                });

                if (!existing) {
                    await app.db.query('plugin::users-permissions.permission').create({
                        data: {
                            role: roleId,
                            action,
                            enabled: true
                        }
                    });
                    console.log(`✅ Enabled ${action} for role ${roleId}`);
                } else {
                    if (!existing.enabled) {
                        await app.db.query('plugin::users-permissions.permission').update({
                            where: { id: existing.id },
                            data: { enabled: true }
                        });
                        console.log(`✅ Re-enabled ${action} for role ${roleId}`);
                    }
                }
            }
        };

        console.log('Configuring Public Role...');
        await enablePermissions(publicRole.id, publicPermissions);

        console.log('Configuring Authenticated Role...');
        await enablePermissions(authenticatedRole.id, authenticatedPermissions);

        console.log('🎉 Permissions seeded successfully!');

    } catch (error) {
        console.error('❌ Error seeding permissions:', error);
    } finally {
        process.exit(0);
    }
}

main();
