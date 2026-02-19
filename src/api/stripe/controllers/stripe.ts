
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
                        populate: ['participants', 'paymentSteps'],
                        status: 'draft'
                    });

                    if (!booking) {
                        console.error(`[Stripe Webhook] Booking ${bookingId} not found.`);
                        return ctx.badRequest('Booking not found');
                    }
                    console.log(`[Stripe Webhook] Booking Found. Current Status: ${(booking as any).bookingStatus}`);

                    const participantsCount = (Array.isArray(booking.participants) && booking.participants.length > 0)
                        ? booking.participants.length
                        : 1;

                    // 3. Mark the payment step as paid
                    const paymentStepIndex = parseInt(session.metadata?.payment_step_index || '0', 10);
                    const paymentSteps = (booking as any).paymentSteps || [];

                    if (paymentSteps[paymentStepIndex]) {
                        paymentSteps[paymentStepIndex].status = 'paid';
                        paymentSteps[paymentStepIndex].stripeSessionId = session.id;
                        console.log(`[Stripe Webhook] Marked paymentStep[${paymentStepIndex}] "${paymentSteps[paymentStepIndex].name}" as PAID`);
                    }

                    // Check if ALL steps are now paid
                    const allPaid = paymentSteps.length > 0 && paymentSteps.every((s: any) => s.status === 'paid');
                    // Check if at least the first step (deposit/first installment) is paid
                    const firstPaid = paymentSteps.length > 0 && paymentSteps[0]?.status === 'paid';

                    console.log(`[Stripe Webhook] All steps paid: ${allPaid}, First step paid: ${firstPaid}`);

                    // 4. Check availability (only on first payment / confirmation)
                    if ((booking as any).bookingStatus !== 'confirmed') {
                        if (occupied + participantsCount > max) {
                            console.error(`[Stripe Webhook] OVERBOOKING! Offer max ${max}, occupied ${occupied}, requested ${participantsCount}`);
                            await strapi.documents('api::booking.booking').update({
                                documentId: bookingId,
                                status: 'draft',
                                data: {
                                    bookingStatus: 'cancelled',
                                    notes: 'System: Cancelled due to overbooking at payment time.',
                                    paymentSteps,
                                }
                            });
                            return ctx.badRequest('Overbooking detected. Booking cancelled.');
                        }

                        // 5. Update booking status to Confirmed + save payment steps
                        console.log(`[Stripe Webhook] Updating Booking ${bookingId} to CONFIRMED...`);
                        const updatedBooking = await strapi.documents('api::booking.booking').update({
                            documentId: bookingId as string,
                            status: 'draft',
                            data: {
                                bookingStatus: 'confirmed',
                                paymentSteps,
                            },
                        });
                        console.log('[Stripe Webhook] Update Result (Draft):', updatedBooking?.status);

                        const publishedBooking = await strapi.documents('api::booking.booking').publish({
                            documentId: bookingId as string,
                        });
                        console.log('[Stripe Webhook] Publish Result:', publishedBooking?.status);
                    } else {
                        // Booking already confirmed (subsequent installment/balance payment)
                        console.log(`[Stripe Webhook] Booking already confirmed. Updating payment steps only.`);
                        await strapi.documents('api::booking.booking').update({
                            documentId: bookingId as string,
                            status: 'draft',
                            data: {
                                paymentSteps,
                            },
                        });
                        await strapi.documents('api::booking.booking').publish({
                            documentId: bookingId as string,
                        });
                    }

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
