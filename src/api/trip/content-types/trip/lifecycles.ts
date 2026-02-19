import type { Core } from '@strapi/strapi';

export default {
    async beforeCreate(event) {
        const { data } = event.params;

        if (data.title && !data.slug) {
            data.slug = data.title
                .toLowerCase()
                .trim()
                .replace(/[^\w\s-]/g, '')
                .replace(/[\s_-]+/g, '-')
                .replace(/^-+|-+$/g, '');
        }
    },

    async beforeUpdate(event) {
        const { data } = event.params;

        if (data.title && !data.slug) {
            data.slug = data.title
                .toLowerCase()
                .trim()
                .replace(/[^\w\s-]/g, '')
                .replace(/[\s_-]+/g, '-')
                .replace(/^-+|-+$/g, '');
        }
    },
};
