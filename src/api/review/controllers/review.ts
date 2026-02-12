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

        // 1. Fetch trip with offers and their participants
        const trip: any = await strapi.entityService.findOne('api::trip.trip', tripId, {
            populate: {
                offers: {
                    populate: ['participants'],
                },
            },
        });

        if (!trip) {
            return ctx.notFound('Viaggio non trovato.');
        }

        // 2. Check if user participated in any offer of this trip
        const offers = trip.offers || [];
        const participatedOffer = offers.find((offer: any) =>
            offer.participants?.some((p: any) => p.id === user.id)
        );

        if (!participatedOffer) {
            return ctx.forbidden('Puoi recensire solo viaggi a cui hai partecipato.');
        }

        // 3. Check if that offer's trip has ended
        if (participatedOffer.endDate) {
            const endDate = new Date(participatedOffer.endDate);
            if (new Date() < endDate) {
                return ctx.forbidden('Puoi recensire solo viaggi conclusi.');
            }
        }

        // 4. Auto-assign user/author and travel period
        const travelPeriod = participatedOffer.startDate && participatedOffer.endDate
            ? `${new Date(participatedOffer.startDate).toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })} - ${new Date(participatedOffer.endDate).toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })}`
            : '';

        if (data) {
            ctx.request.body.data.user = user.id;
            ctx.request.body.data.authorName = user.username || user.email;
            ctx.request.body.data.travelPeriod = bodyData.travelPeriod || travelPeriod;
        } else {
            ctx.request.body.user = user.id;
            ctx.request.body.authorName = user.username || user.email;
            ctx.request.body.travelPeriod = bodyData.travelPeriod || travelPeriod;
        }

        // 5. Execute core create
        const response = await super.create(ctx);
        return response;
    }
}));
