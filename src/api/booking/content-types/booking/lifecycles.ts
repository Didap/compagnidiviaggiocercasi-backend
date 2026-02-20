/**
 * Booking lifecycle hooks
 * - Handles occupiedSeats updates on the related Offer whenever a booking status changes.
 * - Sends notification emails on status transitions (confirmed, cancelled).
 */

import emailService from '../../services/email';

export default {
    async afterUpdate(event: any) {
        const { result, params } = event;

        // Only act if bookingStatus was part of the update
        const newStatus = result?.bookingStatus;
        if (!newStatus) return;

        const requestedStatus = params?.data?.bookingStatus;
        if (!requestedStatus) return; // status wasn't changed in this update

        // Fetch the full booking with offer, participants, user, and payment steps
        const booking = await strapi.documents('api::booking.booking').findOne({
            documentId: result.documentId,
            populate: ['offer', 'offer.trip', 'participants', 'user', 'paymentSteps'],
        });

        if (!booking || !booking.offer) return;

        const offer = booking.offer as any;
        const user = (booking as any).user;
        const participantsCount = (Array.isArray(booking.participants) && booking.participants.length > 0)
            ? booking.participants.length
            : 1;

        // ─── Seat Management ─────────────────────────────────────
        const freshOffer = await strapi.documents('api::offer.offer').findOne({
            documentId: offer.documentId,
        });

        if (!freshOffer) return;

        const currentOccupied = Number(freshOffer.occupiedSeats || 0);

        if (requestedStatus === 'confirmed') {
            const newOccupied = currentOccupied + participantsCount;
            console.log(`[Booking Lifecycle] Confirming booking ${result.documentId}: +${participantsCount} seats (${currentOccupied} → ${newOccupied})`);

            await strapi.documents('api::offer.offer').update({
                documentId: offer.documentId,
                data: {
                    occupiedSeats: Math.min(newOccupied, freshOffer.maxParticipants),
                },
            });
        }

        if (requestedStatus === 'cancelled') {
            const newOccupied = Math.max(0, currentOccupied - participantsCount);
            console.log(`[Booking Lifecycle] Cancelling booking ${result.documentId}: -${participantsCount} seats (${currentOccupied} → ${newOccupied})`);

            await strapi.documents('api::offer.offer').update({
                documentId: offer.documentId,
                data: {
                    occupiedSeats: newOccupied,
                },
            });
        }

        // ─── Email Notifications ─────────────────────────────────
        if (!user?.email) return;

        const emailData = {
            userName: user.firstName || user.username || 'Viaggiatore',
            tripTitle: offer.trip?.title || 'Viaggio',
            destination: offer.trip?.destination || '',
            startDate: offer.startDate,
            endDate: offer.endDate,
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
