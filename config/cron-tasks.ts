/**
 * Cron Tasks
 *
 * Scheduled email reminders for:
 * - Installment payments (7 days before + same day)
 * - Trip preparation series (30, 14, 7, 1 day before departure)
 *
 * Runs every day at 09:00 Europe/Rome time.
 */

export default {
    /**
     * Daily reminder job — runs at 09:00 Italian time.
     * NOTE: with the `{ task, options }` shape the object key is only the job NAME;
     * the schedule MUST live in options.rule, otherwise node-schedule falls back
     * to an empty rule that fires every minute.
     */
    dailyEmailReminders: {
        options: {
            rule: '0 9 * * *',
            tz: 'Europe/Rome',
        },
        async task({ strapi }: { strapi: any }) {
            console.log('[Cron] Starting daily email reminder check...');

            const emailService = require('../src/api/booking/services/email').default;
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Persistent log of already-sent reminders: survives restarts and
            // protects against re-fires (schedule mistakes, date edits, multiple instances).
            const store = strapi.store({ type: 'plugin', name: 'email-reminders' });
            const sendOnce = async (key: string, send: () => Promise<void>) => {
                const already = await store.get({ key });
                if (already) return;
                await send();
                await store.set({ key, value: new Date().toISOString() });
            };

            // ─── 1. Installment Reminders ────────────────────────────
            try {
                const bookings = await strapi.documents('api::booking.booking').findMany({
                    filters: { bookingStatus: 'confirmed' },
                    populate: ['offer', 'offer.trip', 'user', 'paymentSteps'],
                    status: 'published',
                });

                for (const booking of bookings) {
                    const user = (booking as any).user;
                    const offer = (booking as any).offer;
                    if (!user?.email || !offer) continue;

                    const paymentSteps = (booking as any).paymentSteps || [];
                    const participantsCount = (Array.isArray(booking.participants) && booking.participants.length > 0)
                        ? booking.participants.length : 1;

                    const emailData = {
                        userName: user.firstName || user.username || 'Viaggiatore',
                        tripTitle: offer.trip?.title || 'Viaggio',
                        destination: offer.trip?.destination || '',
                        startDate: offer.startDate,
                        endDate: offer.endDate,
                        participantsCount,
                        totalPrice: Number(booking.totalPrice || 0),
                        depositPrice: Number(booking.depositPrice || 0),
                        paymentSteps,
                    };

                    // Check each pending payment step
                    for (const step of paymentSteps) {
                        if (step.status !== 'pending' || !step.dueDate) continue;

                        const dueDate = new Date(step.dueDate);
                        dueDate.setHours(0, 0, 0, 0);
                        const diffMs = dueDate.getTime() - today.getTime();
                        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

                        if (diffDays === 7) {
                            await sendOnce(`step:${booking.documentId}:${step.name}:${step.dueDate}:pre`, async () => {
                                console.log(`[Cron] Sending 7-day installment reminder to ${user.email} for "${step.name}"`);
                                await emailService.sendInstallmentReminder(
                                    strapi, user.email, emailData,
                                    step.name, Number(step.amount), step.dueDate, false
                                );
                            });
                        }

                        if (diffDays === 0) {
                            await sendOnce(`step:${booking.documentId}:${step.name}:${step.dueDate}:due`, async () => {
                                console.log(`[Cron] Sending same-day installment reminder to ${user.email} for "${step.name}"`);
                                await emailService.sendInstallmentReminder(
                                    strapi, user.email, emailData,
                                    step.name, Number(step.amount), step.dueDate, true
                                );
                            });
                        }
                    }

                    // ─── 2. Trip Preparation Reminders ────────────────
                    if (offer.startDate) {
                        const startDate = new Date(offer.startDate);
                        startDate.setHours(0, 0, 0, 0);
                        const diffMs = startDate.getTime() - today.getTime();
                        const daysUntilTrip = Math.round(diffMs / (1000 * 60 * 60 * 24));

                        const reminderDays = [30, 14, 7, 1];
                        if (reminderDays.includes(daysUntilTrip)) {
                            // Keyed by user+offer (not booking) so duplicate bookings
                            // on the same offer never double the trip reminders.
                            await sendOnce(`trip:${user.email}:${offer.documentId}:${daysUntilTrip}`, async () => {
                                console.log(`[Cron] Sending ${daysUntilTrip}-day trip reminder to ${user.email} for "${emailData.tripTitle}"`);
                                await emailService.sendTripReminder(
                                    strapi, user.email, emailData, daysUntilTrip
                                );
                            });
                        }
                    }
                }

                console.log('[Cron] Daily reminder check completed.');
            } catch (err: any) {
                console.error('[Cron] Error in daily reminder job:', err.message);
            }
        },
    },
};
