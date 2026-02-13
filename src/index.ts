export default {
  register() { },

  bootstrap({ strapi }: { strapi: any }) {
    console.log('[Global Lifecycle] Strapi v5 Seat Management - Final Fix');

    strapi.db.lifecycles.subscribe({
      models: ['api::booking.booking'],

      async beforeCreate(event) {
        try {
          const { data } = event.params;
          if (!data || !data.offer) return;

          // In v5, data.offer can be a string (documentId) or a relation object
          const offerDocId = typeof data.offer === 'string' ? data.offer : (data.offer.documentId || data.offer.id);
          if (!offerDocId) return;

          // Use findOne for specific document! findFirst was ignoring documentId.
          const offer = await strapi.documents('api::offer.offer').findOne({
            documentId: offerDocId,
            status: 'draft',
            fields: ['occupiedSeats', 'maxParticipants']
          });

          if (!offer) {
            console.warn('[Global Lifecycle] beforeCreate: Offer not found:', offerDocId);
            return;
          }

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

      async afterCreate(event) {
        try {
          const { result } = event;
          if (!result || !result.documentId) return;

          const booking = await strapi.documents('api::booking.booking').findOne({
            documentId: result.documentId,
            populate: ['offer', 'participants'],
            status: 'draft'
          });

          if (!booking || !booking.offer) return;

          const offerDocId = booking.offer.documentId;
          const participantCount = Array.isArray(booking.participants) ? booking.participants.length : 1;

          // CRITICAL: use findOne. findFirst was causing the reset to 6 because it returned the WRONG offer.
          const offer = await strapi.documents('api::offer.offer').findOne({
            documentId: offerDocId,
            status: 'draft',
            fields: ['occupiedSeats']
          });

          if (offer) {
            const currentCount = Number(offer.occupiedSeats || 0);
            const newCount = currentCount + participantCount;

            console.log(`[Global Lifecycle] Updating offer ${offerDocId}: ${currentCount} -> ${newCount}`);

            // Update Draft
            await strapi.documents('api::offer.offer').update({
              documentId: offerDocId,
              status: 'draft',
              data: {
                occupiedSeats: newCount
              }
            });

            // Update Published if it exists
            const published = await strapi.documents('api::offer.offer').findOne({
              documentId: offerDocId,
              status: 'published',
              fields: ['id']
            });

            if (published) {
              await strapi.documents('api::offer.offer').update({
                documentId: offerDocId,
                status: 'published',
                data: {
                  occupiedSeats: newCount
                }
              });
            }
          }
        } catch (err: any) {
          console.error('[Global Lifecycle] afterCreate Error:', err.message);
        }
      },

      async afterDelete(event) {
        try {
          const { result } = event;
          const deletedItems = Array.isArray(result) ? result : (result ? [result] : []);

          for (const item of deletedItems) {
            const offerDocId = item.offer?.documentId || item.offer;
            if (!offerDocId) continue;

            const participantCount = Array.isArray(item.participants) ? item.participants.length : 1;

            const offer = await strapi.documents('api::offer.offer').findOne({
              documentId: offerDocId,
              status: 'draft',
              fields: ['occupiedSeats']
            });

            if (offer) {
              const newCount = Math.max(0, (Number(offer.occupiedSeats || 0)) - participantCount);

              await strapi.documents('api::offer.offer').update({
                documentId: offerDocId,
                status: 'draft',
                data: {
                  occupiedSeats: newCount
                }
              });

              const published = await strapi.documents('api::offer.offer').findOne({
                documentId: offerDocId,
                status: 'published',
                fields: ['id']
              });

              if (published) {
                await strapi.documents('api::offer.offer').update({
                  documentId: offerDocId,
                  status: 'published',
                  data: {
                    occupiedSeats: newCount
                  }
                });
              }
            }
          }
        } catch (err: any) {
          console.error('[Global Lifecycle] afterDelete Error:', err.message);
        }
      }
    });
  },
};
