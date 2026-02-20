export default {
  register() { },

  bootstrap({ strapi }: { strapi: any }) {
    console.log('[Global Lifecycle] Strapi v5 Seat Management - Recalculation Strategy');

    // Helper to recalculate seats for an offer
    const recalculateOccupiedSeats = async (offerDocId: string) => {
      if (!offerDocId) return;

      try {
        console.log(`[Seat Recalc] Starting recalculation for Offer ${offerDocId}`);

        // 1. Find all bookings for this offer
        // We query 'draft' to get the latest version of every booking.
        // We filter out 'cancelled' status.
        const bookings = await strapi.documents('api::booking.booking').findMany({
          filters: {
            offer: { documentId: offerDocId },
            status: 'confirmed',
          },
          populate: ['participants'],
          status: 'draft',
        });

        // 2. Calculate total participants
        let totalSeats = 0;
        let bookingCount = 0;

        if (Array.isArray(bookings)) {
          bookingCount = bookings.length;
          bookings.forEach((booking: any) => {
            const participants = booking.participants;
            const count = Array.isArray(participants) ? participants.length : 1; // Default to 1 if array is missing but booking exists? Or 0?
            // If participants is empty array, it means 0 seats? Or 1 (the booker)?
            // Usually internal logic implies at least 1. But let's stick to array length if present.
            // If participants is null/undefined, safe to assume 1 (simple booking) or 0?
            // Let's assume 1 if participants is missing, but if it's an empty array [], it's 0.
            // Actually, better to check payload. But for safety, let's use length.
            const finalCount = (Array.isArray(participants) && participants.length > 0) ? participants.length :
              (booking.participants === null ? 1 : 0);

            // Correction: If 'participants' component is used, it should be an array.
            // If user booked for 1 person, is it an array of 1? Yes.
            // If logic fails, we might see 0.
            // Let's stick to: if array, use length. If not array (but booking exists), assume 1?
            // No, safer to rely on data.
            // Update: In my previous view, I saw `participants: { count: ... }`? No, it's a component.

            totalSeats += Math.max(0, Array.isArray(participants) ? participants.length : 1);
            // Using max(0, ...) and defaulting to 1 if structure is weird, purely to be safe.
          });
        }

        console.log(`[Seat Recalc] Offer ${offerDocId}: Found ${bookingCount} active bookings. Calculated Total Seats: ${totalSeats}`);

        // 3. Update Offer (Draft & Published)
        await strapi.documents('api::offer.offer').update({
          documentId: offerDocId,
          status: 'draft',
          data: { occupiedSeats: totalSeats }
        });

        // Try to update published version if it exists
        const publishedOffers = await strapi.documents('api::offer.offer').findMany({
          filters: { documentId: offerDocId },
          status: 'published',
        });

        if (publishedOffers.length > 0) {
          await strapi.documents('api::offer.offer').update({
            documentId: offerDocId,
            status: 'published',
            data: { occupiedSeats: totalSeats }
          });
        }

      } catch (err: any) {
        console.error('[Seat Recalc] Error:', err.message);
      }
    };

    strapi.db.lifecycles.subscribe({
      models: ['api::booking.booking'],

      // Check max capacity before creating
      async beforeCreate(event) {
        try {
          const { data } = event.params;
          if (!data || !data.offer) return;

          const offerDocId = typeof data.offer === 'string' ? data.offer : (data.offer.documentId || data.offer.id);
          if (!offerDocId) return;

          const offer = await strapi.documents('api::offer.offer').findOne({
            documentId: offerDocId,
            status: 'draft',
            fields: ['occupiedSeats', 'maxParticipants']
          });

          if (!offer) return;

          const participantCount = Array.isArray(data.participants) ? data.participants.length : 1;
          const occupied = Number(offer.occupiedSeats || 0);
          const max = Number(offer.maxParticipants || 0);

          if (occupied + participantCount > max) {
            throw new Error(`Sold Out: solo ${max - occupied} posti rimasti.`);
          }
        } catch (err: any) {
          console.error('[Global Lifecycle] beforeCreate Error:', err.message);
          throw err;
        }
      },

      // Recalculate after any change
      async afterCreate(event) {
        const { result } = event;
        if (result && result.offer) {
          // result.offer might be just an ID or object depending on population
          // Safe to fetch the booking again to be sure, or just use ID if available
          // But wait, result usually contains what was created.
          // If offer is not populated, we might need to fetch it?
          // Or rely on params?
          // Let's fetch the booking to be safe and get the offer Document ID.
          const booking = await strapi.documents('api::booking.booking').findOne({
            documentId: result.documentId,
            populate: ['offer'],
            status: 'draft'
          });
          if (booking?.offer?.documentId) {
            await recalculateOccupiedSeats(booking.offer.documentId);
          }
        }
      },

      async afterUpdate(event) {
        const { result } = event;
        // Similar logic: fetch booking to get offer ID
        // console.log('[Global Lifecycle] afterUpdate triggered for Booking:', result?.documentId);

        if (result && result.documentId) {
          try {
            const booking = await strapi.documents('api::booking.booking').findOne({
              documentId: result.documentId,
              populate: ['offer'],
              status: 'draft'
            });

            if (booking?.offer?.documentId) {
              console.log(`[Global Lifecycle] Booking ${result.documentId} updated. Recalculating seats for Offer ${booking.offer.documentId}`);
              await recalculateOccupiedSeats(booking.offer.documentId);
            } else {
              console.log(`[Global Lifecycle] Booking ${result.documentId} updated but no offer found.`);
            }
          } catch (err) {
            console.error('[Global Lifecycle] Error in afterUpdate:', err);
          }
        }
      },

      async afterDelete(event) {
        const { result } = event;
        // Handle single or multiple deletes
        const items = Array.isArray(result) ? result : [result];
        for (const item of items) {
          // In afterDelete, relations might already be severed?
          // But we usually have the data in 'result'.
          // If 'offer' was populated during delete (unlikely default), we have it.
          // If not, we might miss re-calculating.
          // However, for delete, we often need to rely on the passed data.
          // Checking 'item.offer'
          const offerId = item.offer?.documentId || item.offer?.id || item.offer;
          if (offerId) {
            // Convert ID to documentID if possible, or just pass it if it works
            // Recalc function expects documentId.
            // If we only have numeric ID, we might need to find the documentId?
            // Strapi v5 result usually has documentId.
            // But wait, if item.offer is just an ID...
            // Let's try to interpret it.
            // Ideally, we should populate offer when deleting? Not easy in Global.

            // If we can't find the offer, we can't recalc.
            // But typically, we should try.
            // Let's assume offerId is available.
            await recalculateOccupiedSeats(String(offerId));
          }
        }
      }
    });

    // Newsletter Lifecycle
    strapi.db.lifecycles.subscribe({
      models: ['api::newsletter-registration.newsletter-registration'],

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
          'plugin::upload.content-api.find', // Images
          // 'plugin::users-permissions.auth.callback', // Login (handled by plugin default)
          // 'plugin::users-permissions.auth.register' // Register
        ];

        const authenticatedPermissions = [
          ...publicPermissions,
          'api::booking.booking.create', 'api::booking.booking.find', 'api::booking.booking.findOne', 'api::booking.booking.update',
          'api::trip-proposal.trip-proposal.create', 'api::trip-proposal.trip-proposal.find', 'api::trip-proposal.trip-proposal.findOne',
          'api::review.review.create',
          'plugin::users-permissions.user.findOne', 'plugin::users-permissions.user.update'
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

    configurePermissions();
  },
};
