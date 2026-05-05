/**
 * newsletter-registration controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController(
  'api::newsletter-registration.newsletter-registration' as any,
  ({ strapi }) => ({
    async unsubscribeMe(ctx) {
      const email = ctx.state.user?.email;
      if (!email) return ctx.unauthorized();

      const reg = await strapi.db
        .query('api::newsletter-registration.newsletter-registration')
        .findOne({ where: { email } });

      if (reg) {
        await strapi.db
          .query('api::newsletter-registration.newsletter-registration')
          .update({ where: { id: reg.id }, data: { subscribed: false } });
      }

      ctx.body = { ok: true };
    },

    async unsubscribe(ctx) {
      const { token } = ctx.query;
      if (!token || typeof token !== 'string') {
        return ctx.badRequest('Missing token');
      }

      const reg = await strapi.db
        .query('api::newsletter-registration.newsletter-registration')
        .findOne({ where: { unsubscribeToken: token } });

      if (!reg) return ctx.notFound('Token non valido');

      await strapi.db
        .query('api::newsletter-registration.newsletter-registration')
        .update({ where: { id: reg.id }, data: { subscribed: false } });

      ctx.body = { ok: true, email: reg.email };
    },
  })
);
