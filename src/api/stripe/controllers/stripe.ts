
import Stripe from 'stripe';
import emailService from '../../booking/services/email';


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
                        fields: ['occupiedSeats', 'maxParticipants']
                    });
                    console.log(`[Stripe Webhook] Offer Found: ${offer?.documentId}, Occupied: ${offer?.occupiedSeats}, Max: ${offer?.maxParticipants}`);

                    if (!offer) {
                        console.error('[Stripe Webhook] Offer not found!');
                        return ctx.badRequest('Offer not found');
                    }

                    const occupied = Number(offer.occupiedSeats || 0);
                    const max = Number(offer.maxParticipants || 0);

                    // Fetch the booking
                    const booking = await strapi.documents('api::booking.booking').findOne({
                        documentId: bookingId,
                        populate: ['participants', 'paymentSteps', 'user', 'offer', 'offer.trip'],
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


                    let paidStep: any = null;
                    if (paymentSteps[paymentStepIndex]) {
                        // Idempotency: skip if already paid (Stripe may send duplicate webhooks)
                        if (paymentSteps[paymentStepIndex].status === 'paid') {
                            console.log(`[Stripe Webhook] paymentStep[${paymentStepIndex}] already paid, skipping.`);
                            return { received: true };
                        }

                        paymentSteps[paymentStepIndex].status = 'paid';
                        paymentSteps[paymentStepIndex].stripeSessionId = session.id;
                        paidStep = paymentSteps[paymentStepIndex];
                        console.log(`[Stripe Webhook] Marked paymentStep[${paymentStepIndex}] "${paymentSteps[paymentStepIndex].name}" as PAID`);
                    }

                    // Receipt is sent only AFTER the paid status is persisted below:
                    // sending first would re-send it on every Stripe retry if the update fails.
                    const sendReceipt = async () => {
                        const bookingUser = (booking as any).user;
                        if (!paidStep || !bookingUser?.email) return;
                        const bookingOffer = (booking as any).offer;
                        const emailData = {
                            userName: bookingUser.firstName || bookingUser.username || 'Viaggiatore',
                            tripTitle: bookingOffer?.trip?.title || 'Viaggio',
                            destination: bookingOffer?.trip?.destination || '',
                            startDate: bookingOffer?.startDate,
                            endDate: bookingOffer?.endDate,
                            participantsCount,
                            totalPrice: Number((booking as any).totalPrice || 0),
                            depositPrice: Number((booking as any).depositPrice || 0),
                            paymentSteps,
                        };
                        try {
                            await emailService.sendPaymentReceipt(
                                strapi, bookingUser.email, emailData,
                                paidStep.name, Number(paidStep.amount)
                            );
                        } catch (emailErr: any) {
                            console.error('[Stripe Webhook] Payment receipt email failed:', emailErr.message);
                        }
                    };

                    // 4. Check availability and update booking
                    if ((booking as any).bookingStatus !== 'confirmed') {
                        if (occupied + participantsCount > max) {
                            console.error(`[Stripe Webhook] OVERBOOKING! Offer max ${max}, occupied ${occupied}, requested ${participantsCount}`);
                            await strapi.documents('api::booking.booking').update({
                                documentId: bookingId,
                                data: {
                                    bookingStatus: 'cancelled',
                                    notes: 'System: Cancelled due to overbooking at payment time.',
                                    paymentSteps,
                                }
                            });
                            // The customer was charged: receipt is still due (refund handled separately)
                            await sendReceipt();
                            return ctx.badRequest('Overbooking detected. Booking cancelled.');
                        }

                        // 5. Update booking status to Confirmed + save payment steps
                        console.log(`[Stripe Webhook] Updating Booking ${bookingId} to CONFIRMED...`);
                        await strapi.documents('api::booking.booking').update({
                            documentId: bookingId as string,
                            data: {
                                bookingStatus: 'confirmed',
                                paymentSteps,
                            },
                        });
                        console.log('[Stripe Webhook] Booking confirmed and published');
                    } else {
                        // Booking already confirmed (subsequent installment/balance payment)
                        console.log(`[Stripe Webhook] Booking already confirmed. Updating payment steps only.`);
                        await strapi.documents('api::booking.booking').update({
                            documentId: bookingId as string,
                            data: {
                                paymentSteps,
                            },
                        });
                    }

                    await sendReceipt();

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
