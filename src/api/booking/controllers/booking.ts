/**
 * booking controller
 */


import { factories } from '@strapi/strapi';
import Stripe from 'stripe';


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);


export default factories.createCoreController('api::booking.booking', ({ strapi }) => ({
    async create(ctx) {
        // 1. Create the booking using the core logic (status will be 'pending' by default)
        const response = await super.create(ctx);
        // Helper to get documentId whether it's in data.documentId or nested
        const bookingDocId = response.data.documentId || response.data.id; // Fallback, but prefer documentId
        const bookingId = response.data.id;

        console.log(`[Create Booking] Created Booking ID: ${bookingId}, Document ID: ${bookingDocId}`);

        // 2. Fetch the newly created booking with its relations to get the offer details
        const booking = await strapi.documents('api::booking.booking').findOne({
            documentId: bookingDocId,
            populate: ['offer', 'offer.trip', 'participants'],
        });





        if (!booking || !booking.offer) {
            return ctx.badRequest('Booking created but offer not found.');
        }

        // In Strapi v5, relations via populate are returned as objects.
        // We cast to any to avoid strict type checks for now, or we should import types.
        const offer = booking.offer as any;
        const depositPrice = offer.depositPrice;
        // Trip title retrieval
        const tripTitle = offer.trip?.title || 'Viaggio';


        const payloadData = ctx.request.body.data || {};
        const participantsCount = Array.isArray(payloadData.participants) ? payloadData.participants.length : (booking.participants?.length || 1);

        // 3. Create Stripe Checkout Session
        try {
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'eur',
                            product_data: {
                                name: `Acconto per: ${tripTitle}`,
                                description: `Prenotazione #${bookingId} - ${participantsCount} partecipanti`,
                            },
                            unit_amount: Math.round(Number(depositPrice) * 100), // Unit price from offer
                        },
                        quantity: participantsCount,
                    },
                ],
                mode: 'payment',
                success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/prenotazione/successo?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/prenotazione/annullato?offer_id=${offer.documentId}`,
                metadata: {
                    booking_id: bookingDocId, // Use documentId for consistency
                    offer_id: offer.documentId,
                },
            });

            // 4. Return the checkout URL along with the booking data
            return {
                ...response,
                meta: {
                    ...response.meta,
                    checkoutUrl: session.url,
                },
            };

        } catch (error) {
            console.error('Stripe Session Error:', error);
            // If Stripe fails, we might want to delete the pending booking or keep it?
            // For now, let's keep it but return error.
            return ctx.internalServerError('Could not create Stripe session.');
        }
    },
}));
