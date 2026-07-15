import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::review.review', ({ strapi }) => ({
    async create(ctx) {
        const user = ctx.state.user;

        if (!user) {
            return ctx.unauthorized('Devi essere loggato per lasciare una recensione.');
        }

        const { data } = ctx.request.body;
        const bodyData = data || ctx.request.body;

        const tripId = bodyData.trip;

        if (!tripId) {
            return ctx.badRequest('Il viaggio (trip) è obbligatorio.');
        }

        // 1. Fetch trip to ensure it exists
        const trip: any = await strapi.entityService.findOne('api::trip.trip', tripId);

        if (!trip) {
            return ctx.notFound('Viaggio non trovato.');
        }

        const existingReviews = await strapi.entityService.findMany('api::review.review', {
            filters: {
                user: user.id,
                trip: trip.id
            }
        });

        if (existingReviews && existingReviews.length > 0) {
            return ctx.badRequest('Hai già recensito questo viaggio.');
        }

        // 3. Check if user has a confirmed booking for this trip
        console.log('[Review Debug] Checking booking for:', { userId: user.id, tripId });

        // Fetch ALL bookings for user to debug
        const allUserBookings: any[] = await strapi.entityService.findMany('api::booking.booking', {
            filters: {
                user: user.id
            },
            populate: {
                offer: {
                    populate: ['trip']
                }
            }
        });

        console.log(`[Review Debug] Found ${allUserBookings.length} total bookings for user.`);

        const validBooking = allUserBookings.find(b => {
            const bTripDocId = b.offer?.trip?.documentId;
            const bStatus = b.status;
            console.log(`[Review Debug] Checking booking ${b.id}: status=${bStatus}, tripDocId=${bTripDocId} (Target Trip DocId: ${trip.documentId})`);

            // Compare Document IDs for stability across Draft/Published versions
            return bStatus === 'confirmed' && bTripDocId === trip.documentId;
        });

        if (!validBooking) {
            console.log('[Review Debug] No valid booking found specifically for this trip/status.');
            return ctx.forbidden('Puoi recensire solo viaggi a cui hai partecipato (prenotazione confermata richiesta).');
        }

        const booking = validBooking;

        const offer = booking.offer;

        if (offer && offer.endDate) {
            const endDate = new Date(offer.endDate);
            if (new Date() < endDate) {
                return ctx.forbidden('Puoi recensire solo viaggi conclusi.');
            }
        }

        // 4. Auto-assign user/author and travel period
        const travelPeriod = offer?.startDate && offer?.endDate
            ? `${new Date(offer.startDate).toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })} - ${new Date(offer.endDate).toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })}`
            : '';

        // Prioritize First Name, then Full Name, then Username/Email
        let authorName = user.firstName;

        const publishDate = new Date(); // Auto-publish

        if (data) {
            ctx.request.body.data.user = user.id;
            ctx.request.body.data.authorName = authorName;
            ctx.request.body.data.travelPeriod = bodyData.travelPeriod || travelPeriod;
            // Explicitly set the trip relation using Document ID to be safe
            ctx.request.body.data.trip = trip.documentId;
            ctx.request.body.data.publishedAt = publishDate;
        } else {
            ctx.request.body.user = user.id;
            ctx.request.body.authorName = authorName;
            ctx.request.body.travelPeriod = bodyData.travelPeriod || travelPeriod;
            ctx.request.body.trip = trip.documentId;
            ctx.request.body.publishedAt = publishDate;
        }

        // 5. Execute core create
        const response = await super.create(ctx);
        return response;
    },

    async myReviews(ctx) {
        const user = ctx.state.user;
        if (!user) {
            return ctx.unauthorized();
        }

        try {
            // Use entityService to see drafts and bypass restrictive default filters
            const reviews = await strapi.entityService.findMany('api::review.review', {
                filters: {
                    user: user.id
                },
                populate: {
                    trip: {
                        fields: ['title', 'slug']
                    }
                }
            });

            // Format response to match API standard if needed, or just return array
            // Frontend expects { data: [...] } if using core structure, but we can simplify
            return { data: reviews };
        } catch (err: any) {
            ctx.internalServerError('Error fetching user reviews');
        }
    },

    // Moderazione dalla dashboard: il content API v5 non espone publish/unpublish,
    // quindi li esponiamo come route custom riservate al ruolo admin.
    async publish(ctx) {
        const { id } = ctx.params;
        try {
            const doc = await strapi.documents('api::review.review').publish({ documentId: id });
            return { data: doc };
        } catch (err: any) {
            return ctx.notFound('Recensione non trovata.');
        }
    },

    async unpublish(ctx) {
        const { id } = ctx.params;
        try {
            const doc = await strapi.documents('api::review.review').unpublish({ documentId: id });
            return { data: doc };
        } catch (err: any) {
            return ctx.notFound('Recensione non trovata.');
        }
    }
}));
