import emailService from '../../services/email';

async function syncOfferSeatsAndParticipants(offerDocumentId: string, strapi: any) {
    if (!offerDocumentId) return;

    // 1. Fetch all pending and confirmed bookings for this offer
    const activeBookings = await strapi.documents('api::booking.booking').findMany({
        filters: {
            offer: { documentId: offerDocumentId },
            bookingStatus: { $in: ['pending', 'confirmed'] },
        },
        populate: ['participants', 'user'],
    });

    // 2. Calculate absolute occupied seats
    const totalOccupied = activeBookings.reduce((sum: number, b: any) => {
        const count = (Array.isArray(b.participants) && b.participants.length > 0)
            ? b.participants.length
            : 1;
        return sum + count;
    }, 0);

    // 3. Collect all unique user IDs from these active bookings
    const activeUserIds = activeBookings
        .map((b: any) => b.user?.documentId || b.user?.id)
        .filter((id: any) => id != null);

    // Convert to Set for uniqueness
    const uniqueUserIds = [...new Set(activeUserIds)];

    // 4. Update the Offer
    const freshOffer = await strapi.documents('api::offer.offer').findOne({
        documentId: offerDocumentId,
    });

    if (!freshOffer) return;

    console.log(`[Booking Sync] Syncing offer ${offerDocumentId}: occupiedSeats = ${totalOccupied}, unique users = ${uniqueUserIds.length}`);

    await strapi.documents('api::offer.offer').update({
        documentId: offerDocumentId,
        data: {
            occupiedSeats: Math.min(totalOccupied, freshOffer.maxParticipants),
            participants: uniqueUserIds,
        },
    });

    // 5. Publish to ensure changes are visible on frontend
    await strapi.documents('api::offer.offer').publish({
        documentId: offerDocumentId,
    });
}

export default {
    async afterCreate(event: any) {
        const { result } = event;

        // Fetch the full booking
        const booking = await strapi.documents('api::booking.booking').findOne({
            documentId: result.documentId,
            populate: ['offer'],
        });

        if (!booking || !booking.offer) return;

        // Perform idempotent sync
        await syncOfferSeatsAndParticipants(booking.offer.documentId, strapi);
    },

    async beforeUpdate(event: any) {
        const requestedStatus = event.params?.data?.bookingStatus;
        if (requestedStatus) {
            const documentId = event.params?.documentId || event.params?.where?.documentId;
            if (documentId) {
                const oldBooking = await strapi.documents('api::booking.booking').findOne({
                    documentId,
                });
                event.state = event.state || {};
                event.state.oldStatus = oldBooking?.bookingStatus;
            }
        }
    },

    async afterUpdate(event: any) {
        const { result, params, state } = event;

        const requestedStatus = params?.data?.bookingStatus;
        if (!requestedStatus) return; // status wasn't changed in this update

        const oldStatus = state?.oldStatus;

        // Fetch the full booking
        const booking = await strapi.documents('api::booking.booking').findOne({
            documentId: result.documentId,
            populate: ['offer', 'offer.trip', 'user', 'paymentSteps'],
        });

        if (!booking || !booking.offer) return;

        // If status changed to/from a state that affects capacity, sync!
        if (oldStatus && oldStatus !== requestedStatus) {
            if (
                ['pending', 'confirmed'].includes(oldStatus) ||
                ['pending', 'confirmed'].includes(requestedStatus)
            ) {
                await syncOfferSeatsAndParticipants(booking.offer.documentId, strapi);
            }
        }

        // ─── Email Notifications ─────────────────────────────────
        const user = (booking as any).user;
        if (!user?.email) return;

        // Prevent duplicate emails if state did not explicitly transition
        if (oldStatus === requestedStatus) return;

        // We need participantsCount for the email
        const fullBookingForEmail = await strapi.documents('api::booking.booking').findOne({
            documentId: result.documentId,
            populate: ['participants'],
        });
        const participantsCount = (Array.isArray((fullBookingForEmail as any).participants) && (fullBookingForEmail as any).participants.length > 0)
            ? (fullBookingForEmail as any).participants.length
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
};
