/**
 * booking controller
 */


import { factories } from '@strapi/strapi';
import Stripe from 'stripe';


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);


export default factories.createCoreController('api::booking.booking', ({ strapi }) => ({
    // Seat management is handled by lifecycles.ts (afterUpdate hook)
    // No custom update override needed

    async create(ctx) {
        // 0. Enforce 'pending' status BEFORE validation/creation
        if (!ctx.request.body.data) {
            ctx.request.body.data = {};
        }

        ctx.request.body.data.bookingStatus = 'pending';

        // Preserve flags from request
        const requestInvoice = ctx.request.body.data.requestInvoice === true;
        ctx.request.body.data.requestInvoice = requestInvoice;

        const paymentOption = ctx.request.body.data.paymentOption || 'deposit';
        ctx.request.body.data.paymentOption = paymentOption;

        console.log(`[Create Booking] paymentOption: ${paymentOption}, requestInvoice: ${requestInvoice}`);

        // Participants count
        const participantsPayload = ctx.request.body.data.participants;
        const participantsCount = (Array.isArray(participantsPayload) && participantsPayload.length > 0)
            ? participantsPayload.length
            : 1;

        // 1. Create the booking (status = 'pending')
        const response = await super.create(ctx);

        const bookingDocId = response.data.documentId || response.data.id;
        const bookingId = response.data.id;
        console.log(`[Create Booking] Created Booking ID: ${bookingId}, DocID: ${bookingDocId}`);

        // 2. Fetch booking with relations (include installmentConfigs)
        const booking = await strapi.documents('api::booking.booking').findOne({
            documentId: bookingDocId,
            populate: ['offer', 'offer.trip', 'offer.installmentConfigs', 'participants', 'user'],
        });

        if (!booking || !booking.offer) {
            return ctx.badRequest('Booking created but offer not found.');
        }

        const offer = booking.offer as any;
        const totalPricePerPerson = Number(offer.price);
        const depositPerPerson = Number(offer.depositPrice);
        const tripTitle = offer.trip?.title || 'Viaggio';
        const totalPrice = (totalPricePerPerson + depositPerPerson) * participantsCount;
        const totalDeposit = depositPerPerson * participantsCount;

        // 3a. Check Booking Deadline (30 days)
        if (offer.startDate) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const start = new Date(offer.startDate);
            start.setHours(0, 0, 0, 0);
            const diffTime = start.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays < 30) {
                // Determine if we should delete the pending booking since it's invalid
                // Ideally, yes, to keep DB clean.
                await strapi.documents('api::booking.booking').delete({ documentId: bookingDocId });
                return ctx.badRequest('Le prenotazioni per questo viaggio sono chiuse (meno di 30 giorni alla partenza).');
            }
        }

        // 3. Generate payment steps based on paymentOption
        let paymentSteps: any[] = [];
        let firstStepAmount = 0;
        let firstStepName = '';

        if (paymentOption === 'full') {
            // Single step: full price
            firstStepAmount = totalPrice;
            firstStepName = 'Pagamento totale';
            paymentSteps = [
                { name: 'Pagamento totale', amount: totalPrice, status: 'pending' },
            ];
        } else if (paymentOption === 'installments' && offer.allowInstallments) {
            const configs = offer.installmentConfigs;
            // Installments apply only to the price (excluding deposit)
            const totalPriceOnly = totalPricePerPerson * participantsCount;

            // Step 0: Acconto (deposit) — always paid immediately
            paymentSteps.push({
                name: 'Acconto',
                amount: totalDeposit,
                status: 'pending',
            });

            if (Array.isArray(configs) && configs.length > 0) {
                // --- Admin-defined percentage-based installment schedule ---
                const startDate = offer.startDate ? new Date(offer.startDate) : null;

                // Resolve due dates and validate first one
                const resolvedConfigs = configs.map((cfg: any) => {
                    let resolvedDueDate: Date | null = null;
                    if (cfg.dueDateType === 'relative' && startDate && cfg.relativeMonths) {
                        resolvedDueDate = new Date(startDate);
                        resolvedDueDate.setMonth(resolvedDueDate.getMonth() - cfg.relativeMonths);
                    } else if (cfg.dueDate) {
                        resolvedDueDate = new Date(cfg.dueDate);
                    }
                    return { ...cfg, resolvedDueDate };
                });

                // Validate: first due date must not be in the past
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const firstResolved = resolvedConfigs[0]?.resolvedDueDate;
                if (firstResolved) {
                    firstResolved.setHours(0, 0, 0, 0);
                    if (firstResolved.getTime() < today.getTime()) {
                        await strapi.documents('api::booking.booking').delete({ documentId: bookingDocId });
                        return ctx.badRequest('Il pagamento a rate non è più disponibile per questa offerta (scadenza prima rata superata).');
                    }
                }

                // Map configs to installment steps using percentage on PRICE ONLY
                // If evenly divisible, use clean division; otherwise percentage-based
                const numInstallments = resolvedConfigs.length;
                const isEvenlyDivisible = totalPriceOnly % numInstallments === 0;

                if (isEvenlyDivisible) {
                    const evenAmount = totalPriceOnly / numInstallments;
                    for (let i = 0; i < resolvedConfigs.length; i++) {
                        const cfg = resolvedConfigs[i];
                        const dueDateStr = cfg.resolvedDueDate ? cfg.resolvedDueDate.toISOString().split('T')[0] : null;
                        paymentSteps.push({
                            name: cfg.name || `Rata ${i + 1} di ${numInstallments}`,
                            amount: evenAmount,
                            dueDate: dueDateStr,
                            status: 'pending',
                        });
                    }
                } else {
                    let usedSum = 0;
                    for (let i = 0; i < resolvedConfigs.length; i++) {
                        const cfg = resolvedConfigs[i];
                        const percentage = Number(cfg.percentage) || 0;
                        const isLast = i === resolvedConfigs.length - 1;
                        const stepAmount = isLast
                            ? Math.round((totalPriceOnly - usedSum) * 100) / 100
                            : Math.round((totalPriceOnly * percentage / 100) * 100) / 100;
                        if (!isLast) usedSum += stepAmount;
                        const dueDateStr = cfg.resolvedDueDate ? cfg.resolvedDueDate.toISOString().split('T')[0] : null;
                        paymentSteps.push({
                            name: cfg.name || `Rata ${i + 1} di ${numInstallments}`,
                            amount: stepAmount,
                            dueDate: dueDateStr,
                            status: 'pending',
                        });
                    }
                }
            } else {
                // --- Fallback: equal-split installments on price only ---
                const count = offer.installmentsCount || 3;
                const isEvenlyDivisible = totalPriceOnly % count === 0;
                const evenAmount = totalPriceOnly / count;

                if (isEvenlyDivisible) {
                    for (let i = 0; i < count; i++) {
                        paymentSteps.push({
                            name: `Rata ${i + 1} di ${count}`,
                            amount: evenAmount,
                            status: 'pending',
                        });
                    }
                } else {
                    const installmentAmount = Math.floor(evenAmount * 100) / 100;
                    let fallbackSum = 0;
                    for (let i = 0; i < count; i++) {
                        const isLast = i === count - 1;
                        const stepAmount = isLast
                            ? Math.round((totalPriceOnly - fallbackSum) * 100) / 100
                            : installmentAmount;
                        if (!isLast) fallbackSum += stepAmount;
                        paymentSteps.push({
                            name: `Rata ${i + 1} di ${count}`,
                            amount: stepAmount,
                            status: 'pending',
                        });
                    }
                }
            }
            // First step is always the Acconto (deposit)
            firstStepAmount = paymentSteps[0].amount;
            firstStepName = paymentSteps[0].name;
        } else {
            // Default: deposit now, balance later
            const balance = totalPrice - totalDeposit;
            firstStepAmount = totalDeposit;
            firstStepName = 'Acconto';
            paymentSteps = [
                { name: 'Acconto', amount: totalDeposit, status: 'pending' },
                { name: 'Saldo', amount: balance, status: 'pending' },
            ];
        }

        console.log(`[Create Booking] Generated ${paymentSteps.length} payment steps. First: "${firstStepName}" = €${firstStepAmount}`);

        // 4. Save payment steps to the booking
        await strapi.documents('api::booking.booking').update({
            documentId: bookingDocId,
            data: {
                paymentSteps,
            } as any,
        });

        // 5. Create Stripe Checkout Session for the FIRST step only
        try {
            const hasRequestedInvoice = requestInvoice;
            console.log(`[Create Booking] Invoice requested: ${hasRequestedInvoice}`);

            const sessionOptions: Stripe.Checkout.SessionCreateParams = {
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'eur',
                            product_data: {
                                name: `${firstStepName} per: ${tripTitle}`,
                                description: `Prenotazione #${bookingId} - ${participantsCount} partecipanti`,
                            },
                            unit_amount: Math.round(firstStepAmount * 100),
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/prenotazione/successo?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/prenotazione/annullato?offer_id=${offer.documentId}`,
                metadata: {
                    booking_id: bookingDocId,
                    offer_id: offer.documentId,
                    payment_step_index: '0',
                    request_invoice: hasRequestedInvoice ? 'true' : 'false',
                },
            };

            // Invoice + tax options
            if (hasRequestedInvoice) {
                console.log('[Create Booking] Configuring Stripe session for Invoice, Tax ID and Billing Address');
                sessionOptions.tax_id_collection = { enabled: true };
                sessionOptions.billing_address_collection = 'required';
                sessionOptions.invoice_creation = { enabled: true };
                if ((booking as any).user?.email) {
                    sessionOptions.customer_email = (booking as any).user.email;
                }
            }

            const session = await stripe.checkout.sessions.create(sessionOptions);
            console.log(`[Create Booking] Stripe Session Created: ${session.id}`);

            // Save Stripe session ID to the first payment step
            const updatedSteps = [...paymentSteps];
            updatedSteps[0].stripeSessionId = session.id;
            await strapi.documents('api::booking.booking').update({
                documentId: bookingDocId,
                data: {
                    paymentSteps: updatedSteps,
                } as any,
            });

            return {
                ...response,
                meta: {
                    ...response.meta,
                    checkoutUrl: session.url,
                },
            };
        } catch (error) {
            console.error('Stripe Session Error:', error);
            return ctx.internalServerError('Could not create Stripe session.');
        }
    },

    /**
     * POST /api/bookings/:id/payment-session
     * Creates a Stripe Checkout Session for a specific pending payment step.
     */
    async createPaymentSession(ctx) {
        const { id: bookingDocId } = ctx.params;
        const { stepIndex } = ctx.request.body;

        if (stepIndex === undefined || stepIndex === null) {
            return ctx.badRequest('stepIndex is required');
        }

        // 1. Fetch booking with relations
        const booking = await strapi.documents('api::booking.booking').findOne({
            documentId: bookingDocId,
            populate: ['offer', 'offer.trip', 'paymentSteps', 'user'],
        });

        if (!booking) {
            return ctx.notFound('Booking not found');
        }

        // 2. Verify ownership
        const currentUser = ctx.state.user;
        const bookingUser = (booking as any).user;
        if (!currentUser || (bookingUser?.id !== currentUser.id && currentUser.role?.type !== 'admin')) {
            return ctx.forbidden('You can only pay for your own bookings');
        }

        // 3. Validate the payment step
        const paymentSteps = (booking as any).paymentSteps || [];
        const step = paymentSteps[stepIndex];

        if (!step) {
            return ctx.badRequest(`Payment step ${stepIndex} not found`);
        }

        if (step.status === 'paid') {
            return ctx.badRequest('This payment step is already paid');
        }

        const offer = booking.offer as any;
        const tripTitle = offer?.trip?.title || 'Viaggio';
        const bookingId = (booking as any).id;

        // 4. Create Stripe session
        try {
            const sessionOptions: Stripe.Checkout.SessionCreateParams = {
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'eur',
                            product_data: {
                                name: `${step.name} per: ${tripTitle}`,
                                description: `Prenotazione #${bookingId}`,
                            },
                            unit_amount: Math.round(step.amount * 100),
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/profilo?success=true`,
                cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/profilo`,
                metadata: {
                    booking_id: bookingDocId,
                    offer_id: offer.documentId,
                    payment_step_index: String(stepIndex),
                },
            };

            // Invoice options if booking was created with invoice request
            if ((booking as any).requestInvoice) {
                sessionOptions.tax_id_collection = { enabled: true };
                sessionOptions.billing_address_collection = 'required';
                sessionOptions.invoice_creation = { enabled: true };
                if (bookingUser?.email) {
                    sessionOptions.customer_email = bookingUser.email;
                }
            }

            const session = await stripe.checkout.sessions.create(sessionOptions);
            console.log(`[PaymentSession] Created Stripe session ${session.id} for step ${stepIndex} of booking ${bookingDocId}`);

            // Save Stripe session ID to the step
            paymentSteps[stepIndex].stripeSessionId = session.id;
            await strapi.documents('api::booking.booking').update({
                documentId: bookingDocId,
                data: { paymentSteps } as any,
            });

            return { checkoutUrl: session.url };
        } catch (error) {
            console.error('[PaymentSession] Stripe Error:', error);
            return ctx.internalServerError('Could not create payment session');
        }
    },

    /**
     * GET /api/bookings/preview-email/:template
     * Previews the HTML email templates.
     */
    async previewEmail(ctx) {
        const { template } = ctx.params;
        const emailService = require('../services/email').default;

        const mockData = {
            userName: 'Alessandro',
            tripTitle: 'Avventura in Islanda',
            destination: 'Islanda e Aurore Boreali',
            startDate: '2026-06-15',
            endDate: '2026-06-25',
            participantsCount: 2,
            totalPrice: 2450,
            depositPrice: 500,
            paymentSteps: [
                { name: 'Acconto', amount: 500, status: 'paid', dueDate: '2026-02-20' },
                { name: 'Rata 1', amount: 975, status: 'pending', dueDate: '2026-04-15' },
                { name: 'Rata 2', amount: 975, status: 'pending', dueDate: '2026-05-15' },
            ],
        };

        const templates: any = {
            welcome: () => require('../services/email').default.sendWelcomeEmailHtml(mockData.userName),
            confirmation: () => require('../services/email').default.sendBookingConfirmedHtml(mockData),
            receipt: () => require('../services/email').default.sendPaymentReceiptHtml(mockData, 'Rata 1', 975),
            cancelled: () => require('../services/email').default.sendBookingCancelledHtml(mockData),
            reminder: () => require('../services/email').default.sendInstallmentReminderHtml(mockData, 'Rata 1', 975, '2026-04-15', false),
            reminder_urgent: () => require('../services/email').default.sendInstallmentReminderHtml(mockData, 'Rata 1', 975, '2026-04-15', true),
            trip_30: () => require('../services/email').default.sendTripReminderHtml(mockData, 30),
            trip_14: () => require('../services/email').default.sendTripReminderHtml(mockData, 14),
            trip_7: () => require('../services/email').default.sendTripReminderHtml(mockData, 7),
            trip_1: () => require('../services/email').default.sendTripReminderHtml(mockData, 1),
        };

        // Note: I need to export the HTML-generating functions in email.ts or adapt here.
        // Actually, let's adapt email.ts to export the HTML functions or just call them here.
        // I'll update email.ts to export the HTML generators.

        ctx.type = 'text/html';

        if (templates[template]) {
            // Wait, email.ts exports sendX functions that send. I need the HTML.
            // Let's modify email.ts to export the HTML-only versions.
            return ctx.body = templates[template]();
        }

        return ctx.notFound('Template not found. Available: ' + Object.keys(templates).join(', '));
    },
}));
