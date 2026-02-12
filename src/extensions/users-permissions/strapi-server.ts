
export default (plugin: any) => {
    // Rimuoviamo l'override manuale poiché ora usiamo config/plugins.ts per il whitelist
    // Questo rende il sistema più robusto e compatibile con Strapi 5 standard.
    return plugin;
};
