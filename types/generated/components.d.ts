import type { Schema, Struct } from '@strapi/strapi';

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
      'booking.traveler': BookingTraveler;
      'itinerary.day': ItineraryDay;
    }
  }
}
