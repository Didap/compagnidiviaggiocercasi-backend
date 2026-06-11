import emailService from '../../services/email';

async function adjustOfferOccupiedSeats(offerDocumentId: string, delta: number, strapi: any) {
    if (!offerDocumentId || delta === 0) return;

    const offer = await strapi.documents('api::offer.offer').findOne({
        documentId: offerDocumentId,
        fields: ['occupiedSeats', 'maxParticipants']
    });

    if (!offer) return;

    const current = Number(offer.occupiedSeats || 0);
    const newTotal = Math.max(0, current + delta); // Allow values above max if admin wants it, but at least 0

    console.log(`[Booking Delta] Adjusting offer ${offerDocumentId}: ${current} -> ${newTotal} (delta: ${delta})`);

    try {
        await strapi.documents('api::offer.offer').update({
            documentId: offerDocumentId,
            data: {
                occupiedSeats: newTotal,
            },
        });
    } catch (err: any) {
        console.error(`[Booking Delta] Update failed: ${err.message}`);
    }
}

export default {
    async afterCreate(event: any) {
        const { result } = event;

        // Fetch the full booking to get the offer and participants
        const booking = await strapi.documents('api::booking.booking').findOne({
            documentId: result.documentId,
            populate: ['offer', 'participants'],
        });

        if (!booking || !booking.offer) return;

        // Only count if confirmed (manual admin create)
        if (booking.bookingStatus === 'confirmed') {
            const count = (Array.isArray(booking.participants) && booking.participants.length > 0)
                ? booking.participants.length
                : 1;
            await adjustOfferOccupiedSeats(booking.offer.documentId, count, strapi);
        }
    },

    async beforeUpdate(event: any) {
        const { params } = event;

        // DB-level lifecycles address rows as { where: { id } } — documentId is
        // never present here, so resolve the previous state from the row itself.
        const oldBooking = params?.where
            ? await strapi.db.query('api::booking.booking').findOne({
                where: params.where,
                populate: { participants: true },
            })
            : null;

        if (oldBooking) {
            event.state = event.state || {};
            event.state.oldStatus = oldBooking.bookingStatus;
            event.state.oldCount = (Array.isArray(oldBooking.participants) && oldBooking.participants.length > 0)
                ? oldBooking.participants.length
                : 1;
        }
    },

    async afterUpdate(event: any) {
        const { result, params, state } = event;

        // 1. Handle Seat Delta
        const requestedStatus = result.bookingStatus;
        const oldStatus = state?.oldStatus;
        const oldCount = state?.oldCount || 0;

        const booking = await strapi.documents('api::booking.booking').findOne({
            documentId: result.documentId,
            populate: ['offer', 'offer.trip', 'user', 'paymentSteps', 'participants'],
        });

        // If the previous state could not be resolved, do nothing: adjusting
        // seats or emailing on an unknown transition causes duplicates.
        if (booking && booking.offer && oldStatus !== undefined) {
            const newCount = (Array.isArray((booking as any).participants) && (booking as any).participants.length > 0)
                ? (booking as any).participants.length
                : 1;

            const wasActive = oldStatus === 'confirmed';
            const isActive = requestedStatus === 'confirmed';

            let delta = 0;
            if (!wasActive && isActive) {
                delta = newCount;
            } else if (wasActive && !isActive) {
                delta = -oldCount;
            } else if (wasActive && isActive && newCount !== oldCount) {
                delta = newCount - oldCount;
            }

            if (delta !== 0) {
                await adjustOfferOccupiedSeats(booking.offer.documentId, delta, strapi);
            }
        }

        // ─── Email Notifications ─────────────────────────────────
        if (!booking || !booking.offer) return;
        const user = (booking as any).user;
        if (!user?.email) return;

        // Send only on a known status transition; with unknown previous state,
        // sending would duplicate the email on every save (fail closed).
        if (!oldStatus || oldStatus === requestedStatus) return;

        const participantsCount = (Array.isArray((booking as any).participants) && (booking as any).participants.length > 0)
            ? (booking as any).participants.length
            : 1;

        const emailData = {
            userName: user.firstName || user.username || 'Viaggiatore',
            tripTitle: booking.offer?.trip?.title || 'Viaggio',
            destination: booking.offer?.trip?.destination || '',
            startDate: booking.offer.startDate as unknown as string,
            endDate: booking.offer.endDate as unknown as string,
            participantsCount,
            totalPrice: Number(booking.totalPrice || 0),
            depositPrice: Number(booking.depositPrice || 0),
            paymentSteps: (booking as any).paymentSteps || [],
        };

        try {
            if (requestedStatus === 'confirmed') {
                await emailService.sendBookingConfirmed(strapi, user.email, emailData);
            }

            if (requestedStatus === 'cancelled') {
                await emailService.sendBookingCancelled(strapi, user.email, emailData);
            }
        } catch (err: any) {
            console.error(`[Booking Lifecycle] Email error: ${err.message}`);
        }
    },

    async beforeDelete(event: any) {
        const { params } = event;

        // Same as beforeUpdate: db lifecycles receive { where: { id } }, never documentId.
        if (params?.where) {
            const booking = await strapi.db.query('api::booking.booking').findOne({
                where: params.where,
                populate: { offer: true, participants: true },
            });

            if (booking && booking.offer && booking.bookingStatus === 'confirmed') {
                const count = (Array.isArray(booking.participants) && booking.participants.length > 0)
                    ? booking.participants.length
                    : 1;

                // Subtract seats before deletion
                await adjustOfferOccupiedSeats(booking.offer.documentId, -count, strapi);
            }
        }
    },
};
