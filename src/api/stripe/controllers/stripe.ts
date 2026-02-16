
import Stripe from 'stripe';


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export default ({ strapi }: { strapi: any }) => ({
    async webhook(ctx: any) {
        const sig = ctx.request.headers['stripe-signature'];
        const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

        let event;

        try {
            if (!endpointSecret) {
                console.error('Webhook Error: Missing endpoint secret');
                return ctx.badRequest('Webhook Error: Missing endpoint secret');
            }

            // @ts-ignore
            const rawBody = ctx.request.body[Symbol.for('unparsedBody')] || ctx.request.body;

            event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
        } catch (err: any) {
            console.error(`Webhook Signature/Construction Error: ${err.message}`);
            console.error(`Received Signature: ${sig}`);
            return ctx.badRequest(`Webhook Error: ${err.message}`);
        }


        if (event.type === 'checkout.session.completed') {
            const session = event.data.object as Stripe.Checkout.Session;
            const bookingId = session.metadata?.booking_id;
            const offerId = session.metadata?.offer_id;

            if (bookingId && offerId) {
                try {
                    // Update booking status
                    // Update booking status using Document Service (v5)
                    console.log(`[Webhook] Attempting to update Booking ${bookingId} to confirmed...`);

                    const updatedBooking = await strapi.documents('api::booking.booking').update({
                        documentId: bookingId as string,
                        status: 'draft',
                        data: {
                            status: 'confirmed',
                        },
                    });

                    console.log('[Webhook] Booking updated result:', updatedBooking ? 'Success' : 'Null');

                    console.log(`Booking ${bookingId} confirmed. Status updated to confirmed via Webhook.`);

                    // Occupied seats are handled by the global lifecycle hook (afterCreate)

                } catch (error) {
                    console.error('Error updating booking/offer:', error);
                    return ctx.internalServerError('Error processing webhook');
                }
            }
        }

        return { received: true };
    },
});
