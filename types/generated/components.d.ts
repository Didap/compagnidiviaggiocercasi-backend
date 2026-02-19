import type { Schema, Struct } from '@strapi/strapi';

export interface BookingInstallmentConfig extends Struct.ComponentSchema {
  collectionName: 'components_booking_installment_configs';
  info: {
    description: 'Template for an installment step defined by admin';
    displayName: 'InstallmentConfig';
    icon: 'calendar';
  };
  attributes: {
    dueDate: Schema.Attribute.Date;
    dueDateType: Schema.Attribute.Enumeration<['relative', 'precise']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'relative'>;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    percentage: Schema.Attribute.Decimal & Schema.Attribute.Required;
    relativeMonths: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<2>;
  };
}

export interface BookingPaymentStep extends Struct.ComponentSchema {
  collectionName: 'components_booking_payment_steps';
  info: {
    description: 'A single payment step (deposit, installment, or balance)';
    displayName: 'PaymentStep';
    icon: 'creditCard';
  };
  attributes: {
    amount: Schema.Attribute.Decimal & Schema.Attribute.Required;
    dueDate: Schema.Attribute.Date;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    status: Schema.Attribute.Enumeration<['pending', 'paid', 'overdue']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'pending'>;
    stripeSessionId: Schema.Attribute.String;
  };
}

export interface BookingTraveler extends Struct.ComponentSchema {
  collectionName: 'components_booking_travelers';
  info: {
    description: 'Information about a traveler in a booking';
    displayName: 'Traveler';
    icon: 'user';
  };
  attributes: {
    birthDate: Schema.Attribute.Date & Schema.Attribute.Required;
    firstName: Schema.Attribute.String & Schema.Attribute.Required;
    gender: Schema.Attribute.Enumeration<['male', 'female', 'other']> &
      Schema.Attribute.Required;
    lastName: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface ItineraryDay extends Struct.ComponentSchema {
  collectionName: 'components_itinerary_days';
  info: {
    description: "Giorno dell'itinerario";
    displayName: 'Day';
    icon: 'calendar';
  };
  attributes: {
    description: Schema.Attribute.RichText & Schema.Attribute.Required;
    title: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'booking.installment-config': BookingInstallmentConfig;
      'booking.payment-step': BookingPaymentStep;
      'booking.traveler': BookingTraveler;
      'itinerary.day': ItineraryDay;
    }
  }
}
