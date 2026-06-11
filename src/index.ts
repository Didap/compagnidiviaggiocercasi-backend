import { randomUUID } from 'crypto';

export default {
  register() { },

  bootstrap({ strapi }: { strapi: any }) {

    // Newsletter Lifecycle
    strapi.db.lifecycles.subscribe({
      models: ['api::newsletter-registration.newsletter-registration'],

      async beforeCreate(event) {
        const { data } = event.params;
        if (!data) return;
        if (!data.unsubscribeToken) {
          data.unsubscribeToken = randomUUID();
        }
        if (data.subscribed === undefined || data.subscribed === null) {
          data.subscribed = true;
        }
      },

      async afterCreate(event) {
        const { result } = event;
        try {
          if (result && result.email) {
            await strapi.plugin('email').service('email').send({
              to: result.email,
              from: process.env.RESEND_FROM_EMAIL || 'info@compagnidiviaggiocercasi.it',
              subject: 'Benvenuto nel Journal di Compagni di Viaggio!',
              html: `
                <div style="font-family: sans-serif; color: #333;">
                  <h1>Benvenuto a bordo! 🌍</h1>
                  <p>Grazie per esserti iscritto al nostro Journal.</p>
                  <p>Riceverai presto ispirazioni, consigli di viaggio e le nostre migliori offerte.</p>
                  <br>
                  <p>A presto,</p>
                  <p>Il team di Compagni di Viaggio Cercasi</p>
                </div>
              `,
            });
            console.log(`[Newsletter] Welcome email sent to ${result.email}`);
          }
        } catch (err) {
          console.error('[Newsletter] Failed to send welcome email:', err);
        }
      }
    });

    // User Registration Welcome Email
    strapi.db.lifecycles.subscribe({
      models: ['plugin::users-permissions.user'],

      async afterCreate(event) {
        const { result } = event;
        try {
          if (result && result.email) {
            const emailService = require('./api/booking/services/email').default;
            const userName = result.firstName || result.username || 'Viaggiatore';
            await emailService.sendWelcomeEmail(strapi, result.email, userName);
            console.log(`[Auth] Welcome email sent to ${result.email}`);
          }
        } catch (err) {
          console.error('[Auth] Failed to send welcome email:', err);
        }
      }
    });

    // Auto-configure permissions
    const configurePermissions = async () => {
      try {
        console.log('[Bootstrap] Configuring permissions...');

        const roles = await strapi.documents('plugin::users-permissions.role').findMany({
          filters: { type: { $in: ['authenticated', 'public'] } }
        });

        const authenticatedRole = roles.find((r: any) => r.type === 'authenticated');
        const publicRole = roles.find((r: any) => r.type === 'public');

        // Helper to add permission if missing using Query Engine
        const addPermission = async (roleId: number, action: string) => {
          const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
            where: {
              action,
              role: roleId
            }
          });

          if (!existing) {
            console.log(`[Bootstrap] Adding permission ${action} to role ${roleId}`);
            await strapi.db.query('plugin::users-permissions.permission').create({
              data: {
                action,
                role: roleId
              }
            });
          }
        };

        // Consolidate permissions
        const publicPermissions = [
          'api::trip.trip.find', 'api::trip.trip.findOne',
          'api::offer.offer.find', 'api::offer.offer.findOne',
          'api::post.post.find', 'api::post.post.findOne',
          'api::review.review.find', 'api::review.review.findOne',
          'api::newsletter-registration.newsletter-registration.create', // Public newsletter
          'api::newsletter-registration.newsletter-registration.unsubscribe', // Public unsubscribe via email link
          'api::contact-message.contact-message.create', // Public contact form
          'api::booking.booking.create', // Public guest checkout
          'plugin::upload.content-api.find', // Images
          // 'plugin::users-permissions.auth.callback', // Login (handled by plugin default)
          // 'plugin::users-permissions.auth.register' // Register
        ];

        const authenticatedPermissions = [
          ...publicPermissions,
          // No booking.find/findOne/update here: customers only see their own
          // bookings via myBookings; staff operates through the admin role.
          'api::booking.booking.create', 'api::booking.booking.myBookings', 'api::booking.booking.createPaymentSession',
          'api::trip-proposal.trip-proposal.create', 'api::trip-proposal.trip-proposal.find', 'api::trip-proposal.trip-proposal.findOne',
          'api::review.review.create', 'api::review.review.myReviews',
          'api::newsletter-registration.newsletter-registration.unsubscribeMe',
          'plugin::users-permissions.user.findOne', 'plugin::users-permissions.user.update',
          // newsletter-campaign permissions are reserved to the admin role
          // (see restrictNewsletterCampaignToAdmin below)
        ];

        if (publicRole) {
          console.log('[Bootstrap] Setting public permissions...');
          for (const action of publicPermissions) {
            await addPermission(publicRole.id, action);
          }
        }

        if (authenticatedRole) {
          console.log('[Bootstrap] Setting authenticated permissions...');
          for (const action of authenticatedPermissions) {
            await addPermission(authenticatedRole.id, action);
          }
        }

      } catch (error) {
        console.warn('[Bootstrap] Failed to auto-configure permissions:', error);
      }
    };

    // Idempotent: ensures unsubscribe permissions exist on already-seeded deployments.
    const ensureUnsubscribePermissions = async () => {
      try {
        const roles = await strapi.documents('plugin::users-permissions.role').findMany({
          filters: { type: { $in: ['authenticated', 'public'] } }
        });
        const authenticatedRole = roles.find((r: any) => r.type === 'authenticated');
        const publicRole = roles.find((r: any) => r.type === 'public');

        const ensure = async (roleId: number, action: string) => {
          const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
            where: { action, role: roleId }
          });
          if (!existing) {
            await strapi.db.query('plugin::users-permissions.permission').create({
              data: { action, role: roleId }
            });
            console.log(`[Bootstrap] Added permission ${action} to role ${roleId}`);
          }
        };

        if (publicRole) {
          await ensure(publicRole.id, 'api::newsletter-registration.newsletter-registration.unsubscribe');
        }
        if (authenticatedRole) {
          await ensure(authenticatedRole.id, 'api::newsletter-registration.newsletter-registration.unsubscribeMe');
        }
      } catch (err: any) {
        console.warn('[Bootstrap] Failed to ensure unsubscribe permissions:', err.message);
      }
    };

    // Idempotent: customers reach their bookings only through myBookings.
    // Grants the new permission and revokes the blanket find/findOne/update
    // that let any logged-in user read/edit everyone's bookings.
    const ensureOwnBookingsPermissions = async () => {
      try {
        const roles = await strapi.documents('plugin::users-permissions.role').findMany({
          filters: { type: { $in: ['authenticated', 'public'] } }
        });
        const authenticatedRole = roles.find((r: any) => r.type === 'authenticated');
        const publicRole = roles.find((r: any) => r.type === 'public');

        if (authenticatedRole) {
          const grant = 'api::booking.booking.myBookings';
          const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
            where: { action: grant, role: authenticatedRole.id }
          });
          if (!existing) {
            await strapi.db.query('plugin::users-permissions.permission').create({
              data: { action: grant, role: authenticatedRole.id }
            });
            console.log(`[Bootstrap] Granted ${grant} to authenticated role`);
          }
        }

        const revokedActions = [
          'api::booking.booking.find',
          'api::booking.booking.findOne',
          'api::booking.booking.update',
        ];
        for (const role of [authenticatedRole, publicRole]) {
          if (!role) continue;
          for (const action of revokedActions) {
            const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
              where: { action, role: role.id }
            });
            if (existing) {
              await strapi.db.query('plugin::users-permissions.permission').delete({
                where: { id: existing.id }
              });
              console.log(`[Bootstrap] Revoked ${action} from role "${role.name}"`);
            }
          }
        }
      } catch (err: any) {
        console.warn('[Bootstrap] Failed to ensure own-bookings permissions:', err.message);
      }
    };

    // Idempotent: newsletter campaigns (mass email blasts) must be manageable
    // only by the admin role, never by any logged-in user. Removes the
    // permissions from public/authenticated (also on already-seeded deploys)
    // and grants them to the users-permissions role named/typed 'admin'.
    const restrictNewsletterCampaignToAdmin = async () => {
      const campaignActions = [
        'api::newsletter-campaign.newsletter-campaign.create',
        'api::newsletter-campaign.newsletter-campaign.find',
        'api::newsletter-campaign.newsletter-campaign.findOne',
      ];

      try {
        const roles = await strapi.db.query('plugin::users-permissions.role').findMany();
        const adminRole = roles.find((r: any) =>
          r.type?.toLowerCase() === 'admin' || r.name?.toLowerCase() === 'admin');
        const restrictedRoles = roles.filter((r: any) =>
          ['authenticated', 'public'].includes(r.type) );

        for (const role of restrictedRoles) {
          for (const action of campaignActions) {
            const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
              where: { action, role: role.id }
            });
            if (existing) {
              await strapi.db.query('plugin::users-permissions.permission').delete({
                where: { id: existing.id }
              });
              console.log(`[Bootstrap] Removed permission ${action} from role "${role.name}"`);
            }
          }
        }

        if (adminRole) {
          for (const action of campaignActions) {
            const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
              where: { action, role: adminRole.id }
            });
            if (!existing) {
              await strapi.db.query('plugin::users-permissions.permission').create({
                data: { action, role: adminRole.id }
              });
              console.log(`[Bootstrap] Granted permission ${action} to role "${adminRole.name}"`);
            }
          }
        } else {
          console.warn('[Bootstrap] No users-permissions role named/typed "admin" found: newsletter-campaign API is now admin-panel only.');
        }
      } catch (err: any) {
        console.warn('[Bootstrap] Failed to restrict newsletter-campaign permissions:', err.message);
      }
    };

    // Backfill unsubscribeToken/subscribed on existing newsletter-registration rows.
    const backfillNewsletterTokens = async () => {
      try {
        const store = strapi.store({ type: 'core', name: 'seed' });
        const alreadyBackfilled = await store.get({ key: 'newsletterUnsubscribeBackfilled' });
        if (alreadyBackfilled) return;

        const regs = await strapi.db
          .query('api::newsletter-registration.newsletter-registration')
          .findMany({ where: { $or: [{ unsubscribeToken: { $null: true } }, { unsubscribeToken: '' }] } });

        for (const r of regs) {
          await strapi.db
            .query('api::newsletter-registration.newsletter-registration')
            .update({
              where: { id: r.id },
              data: {
                unsubscribeToken: randomUUID(),
                subscribed: r.subscribed ?? true,
              },
            });
        }

        await store.set({ key: 'newsletterUnsubscribeBackfilled', value: true });
        console.log(`[Backfill] Newsletter: backfilled ${regs.length} registrations.`);
      } catch (err: any) {
        console.error('[Backfill] Newsletter token backfill failed:', err.message);
      }
    };

    // Run seed only once (first deploy), after 10s delay
    setTimeout(async () => {
      try {
        const store = strapi.store({ type: 'core', name: 'seed' });
        const alreadySeeded = await store.get({ key: 'permissionsSeeded' });

        if (!alreadySeeded) {
          console.log('[Seed] First deploy detected. Seeding permissions...');
          await configurePermissions();
          await store.set({ key: 'permissionsSeeded', value: true });
          console.log('[Seed] Permissions seeded and flag saved.');
        } else {
          console.log('[Seed] Permissions already seeded. Skipping.');
        }

        await ensureUnsubscribePermissions();
        await ensureOwnBookingsPermissions();
        await restrictNewsletterCampaignToAdmin();
        await backfillNewsletterTokens();
      } catch (err: any) {
        console.error('[Seed] Error during permission seeding:', err.message);
      }
    }, 10000);
  },
};
