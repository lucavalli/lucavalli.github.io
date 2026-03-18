'use strict';

const CONFIG = {
  MM_PER_INCH:    25.4,
  PAGE_MARGIN_MM: 10,   
  DOC_SPACING_MM:  6,  

  PAGE_FORMATS: {
    A4:     { id:'A4',     name:'A4',     width:210,   height:297   },
    A5:     { id:'A5',     name:'A5',     width:148,   height:210   },
    A3:     { id:'A3',     name:'A3',     width:297,   height:420   },
    Letter: { id:'Letter', name:'Letter', width:215.9, height:279.4 },
    Legal:  { id:'Legal',  name:'Legal',  width:215.9, height:355.6 },
  },

  EXPORT_FORMATS: {
    pdf:  { id:'pdf',  name:'PDF',  ext:'.pdf' },
    png:  { id:'png',  name:'PNG',  ext:'.png' },
    jpeg: { id:'jpeg', name:'JPEG', ext:'.jpg' },
  },

  DOCUMENT_TYPES: {
    cie:         { id:'cie',         name:"Carta d'Identità Elettronica",     shortName:'CIE',      icon:'🪪', width:85.6, height:54.0, hasBack:true, defaultSides:'both', desc:'Tessera ID-1'  },
    cf:          { id:'cf',          name:'Tessera Sanitaria / Cod. Fiscale', shortName:'TS / CF',  icon:'💳', width:85.6, height:54.0, hasBack:true, defaultSides:'both', desc:'Tessera ID-1'  },
    patente:     { id:'patente',     name:'Patente di Guida',                 shortName:'Patente',  icon:'🚗', width:85.6, height:54.0, hasBack:true, defaultSides:'both', desc:'Tessera ID-1'  },
    ci_cartacea: { id:'ci_cartacea', name:"Carta d'Identità Cartacea",        shortName:'CI Cart.', icon:'📋', width:102,  height:73,   hasBack:true, defaultSides:'both', desc:'~102 × 73 mm'  },
  },

  CAMERA: { idealWidth:1920, idealHeight:1080 },

  PROCESSING: { contrast:1.12, brightness:5, saturation:1.06, sharpenStrength:0.45, whiteBalance:true },

  STORAGE_KEY: 'docscan_v6',
};

CONFIG.mmToPx = (mm, dpi) => (mm / CONFIG.MM_PER_INCH) * dpi;
CONFIG.clamp  = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
