
import Stripe from 'stripe';


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export default ({ strapi }: { strapi: any }) => ({
    async webhook(ctx: any) {
        console.log('[Stripe Webhook] Received request');
        const sig = ctx.request.headers['stripe-signature'];
        const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

        let event;

        try {
            if (!endpointSecret) {
                console.error('[Stripe Webhook] Error: Missing endpoint secret');
                return ctx.badRequest('Webhook Error: Missing endpoint secret');
            }

            // @ts-ignore
            const unparsedBody = ctx.request.body?.[Symbol.for('unparsedBody')];
            const rawBody = unparsedBody || ctx.request.body;

            // console.log('[Stripe Webhook] Unparsed Body available:', !!unparsedBody);

            event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
            console.log('[Stripe Webhook] Event verified:', event.type);
        } catch (err: any) {
            console.error(`[Stripe Webhook] Signature Error: ${err.message}`);
            console.error(`Received Signature: ${sig}`);
            return ctx.badRequest(`Webhook Error: ${err.message}`);
        }


        if (event.type === 'checkout.session.completed') {
            const session = event.data.object as Stripe.Checkout.Session;
            const bookingId = session.metadata?.booking_id;
            const offerId = session.metadata?.offer_id;

            console.log(`[Stripe Webhook] Processing Session for Booking: ${bookingId}, Offer: ${offerId}`);

            if (bookingId && offerId) {
                try {
                    // 1. Fetch the Offer to check capacity
                    const offer = await strapi.documents('api::offer.offer').findOne({
                        documentId: offerId,
                        status: 'draft', // Check against draft which should have latest data
                        fields: ['occupiedSeats', 'maxParticipants']
                    });
                    console.log(`[Stripe Webhook] Offer Found: ${offer?.documentId}, Occupied: ${offer?.occupiedSeats}, Max: ${offer?.maxParticipants}`);

                    if (!offer) {
                        console.error('[Stripe Webhook] Offer not found!');
                        return ctx.badRequest('Offer not found');
                    }

                    // 2. Count currently CONFIRMED seats (re-check to be safe)
                    // Note: occupiedSeats in offer might be outdated if we don't recalc, but let's trust our recalc logic.
                    // However, for safety, let's trust the 'occupiedSeats' field which is updated by global lifecycle.
                    // But wait, the current booking is PENDING, so it is NOT included in occupiedSeats yet (per our new logic).

                    const occupied = Number(offer.occupiedSeats || 0);
                    const max = Number(offer.maxParticipants || 0);

                    // We need to know how many seats THIS booking needs.
                    // Fetch the booking first.
                    const booking = await strapi.documents('api::booking.booking').findOne({
                        documentId: bookingId,
                        populate: ['participants'],
                        status: 'draft'
                    });

                    if (!booking) {
                        console.error(`[Stripe Webhook] Booking ${bookingId} not found.`);
                        return ctx.badRequest('Booking not found');
                    }
                    console.log(`[Stripe Webhook] Booking Found. Current Status: ${booking.status}`);

                    const participantsCount = (Array.isArray(booking.participants) && booking.participants.length > 0)
                        ? booking.participants.length
                        : 1;

                    // 3. Check availability
                    if (occupied + participantsCount > max) {
                        console.error(`[Stripe Webhook] OVERBOOKING! Offer max ${max}, occupied ${occupied}, requested ${participantsCount}`);

                        // Handle Overbooking
                        await strapi.documents('api::booking.booking').update({
                            documentId: bookingId,
                            status: 'draft',
                            data: {
                                status: 'cancelled', // Or a special status like 'refund_pending'
                                notes: 'System: Cancelled due to overbooking at payment time.'
                            }
                        });

                        // TODO: Trigger Refund Logic Here potentially
                        return ctx.badRequest('Overbooking detected. Booking cancelled.');
                    }

                    // 4. Update booking status to Confirmed
                    console.log(`[Stripe Webhook] Updating Booking ${bookingId} to CONFIRMED...`);

                    const updatedBooking = await strapi.documents('api::booking.booking').update({
                        documentId: bookingId as string,
                        status: 'draft',
                        data: {
                            status: 'confirmed',
                        },
                    });

                    console.log('[Stripe Webhook] Update Result (Draft):', updatedBooking?.status);

                    // Explicitly publish the booking to make it final and visible as "Published"
                    const publishedBooking = await strapi.documents('api::booking.booking').publish({
                        documentId: bookingId as string,
                    });
                    console.log('[Stripe Webhook] Publish Result:', publishedBooking?.status);

                    // Explicitly publish the booking if your workflow requires it
                    // awaited strapi.documents('api::booking.booking').publish({ documentId: bookingId });

                    console.log('[Stripe Webhook] Update Result:', updatedBooking?.status);

                    // Recalculation is triggered automatically by afterUpdate lifecycle in src/index.ts

                } catch (error: any) {
                    console.error('[Stripe Webhook] Internal Error:', error);
                    return ctx.internalServerError(`Error processing webhook: ${error.message}`);
                }
            } else {
                console.warn('[Stripe Webhook] Missing metadata booking_id or offer_id');
            }
        } else {
            console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
        }

        return { received: true };
    },
});
