import type { Schema, Struct } from '@strapi/strapi';

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
      'itinerary.day': ItineraryDay;
    }
  }
}
