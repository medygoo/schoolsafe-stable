// SchoolSafe Card Studio — données de design et patrimoines
// Adapté du moteur historique. Le nom d'origine ne doit pas apparaître.

export const CARD_FAMILIES = [
  { id: 'A', name: 'Arc-en-ciel', gradient: 'linear-gradient(90deg,#0d2b7a,#e8a91d)' },
  { id: 'B', name: 'Océan ludique', gradient: 'linear-gradient(90deg,#075e63,#ff8552)' },
  { id: 'C', name: 'Pop Bento', gradient: 'linear-gradient(90deg,#312e81,#facc15)' },
  { id: 'D', name: 'Prestige Or', gradient: 'linear-gradient(90deg,#0a0f2e,#c9a030)' },
  { id: 'E', name: 'Ciel rêveur', gradient: 'linear-gradient(90deg,#4f8ff7,#fbbf24)' },
  { id: 'F', name: "Cahier d'écolier", gradient: 'linear-gradient(90deg,#c2410c,#60a5fa)' },
  { id: 'G', name: 'Jungle Safari', gradient: 'linear-gradient(90deg,#0f3d24,#f6a71d)' },
  { id: 'H', name: 'Espace Galaxie', gradient: 'linear-gradient(90deg,#141238,#818cf8)' },
  { id: 'I', name: 'Bonbons Pastel', gradient: 'linear-gradient(90deg,#db2777,#f9a8d4)' },
  { id: 'J', name: 'Tableau & Craie', gradient: 'linear-gradient(90deg,#1f3a2d,#facc15)' },
];

export const CARD_FAMILY_VARIANTS = {
  A: [
    { cc: '#1446aa', soft: '#dbe7fb', dark: '#0d2f77', label: 'Saphir' },
    { cc: '#7b2d8b', soft: '#f3e4f9', dark: '#4f1a5e', label: 'Mauve' },
    { cc: '#0f7f8f', soft: '#d5f2f5', dark: '#0a545f', label: 'Lagon' },
    { cc: '#1a6b3a', soft: '#d4f5e2', dark: '#0f4024', label: 'Forêt' },
  ],
  B: [
    { cc: '#0d9488', soft: '#ccfbf1', dark: '#0a6b5e', label: 'Turquoise' },
    { cc: '#2563c4', soft: '#dbe9ff', dark: '#1845a0', label: 'Azur' },
    { cc: '#1a6b3a', soft: '#d4f5e2', dark: '#0f4024', label: 'Forêt' },
    { cc: '#7b2d8b', soft: '#f3e4f9', dark: '#4f1a5e', label: 'Violet' },
  ],
  C: [
    { cc: '#4338ca', soft: '#ede9ff', dark: '#2c258f', label: 'Iris' },
    { cc: '#7c3aed', soft: '#ede9fe', dark: '#5b21b6', label: 'Améthyste' },
    { cc: '#db2777', soft: '#fde7f2', dark: '#9d1b55', label: 'Cerise' },
    { cc: '#0f7f8f', soft: '#d5f2f5', dark: '#0a545f', label: 'Lagon' },
  ],
  D: [
    { cc: '#c9a030', soft: '#fef3d0', dark: '#8a6b15', label: 'Or' },
    { cc: '#b8860b', soft: '#fdf3d1', dark: '#7a5a05', label: 'Ambre' },
    { cc: '#d97706', soft: '#fef3c7', dark: '#92500a', label: 'Bronze' },
    { cc: '#c2410c', soft: '#ffe8d9', dark: '#8a2f0a', label: 'Cuivre' },
  ],
  E: [
    { cc: '#2563c4', soft: '#dbe9ff', dark: '#1845a0', label: 'Azur' },
    { cc: '#4f8ff7', soft: '#e0ecff', dark: '#2c5cc4', label: 'Ciel' },
    { cc: '#7c3aed', soft: '#ede9fe', dark: '#5b21b6', label: 'Iris' },
    { cc: '#0f7f8f', soft: '#d5f2f5', dark: '#0a545f', label: 'Lagon' },
  ],
  F: [
    { cc: '#c2410c', soft: '#ffe8d9', dark: '#8a2f0a', label: 'Brique' },
    { cc: '#b8860b', soft: '#fdf3d1', dark: '#7a5a05', label: 'Ocre' },
    { cc: '#1446aa', soft: '#dbe7fb', dark: '#0d2f77', label: 'Encre' },
    { cc: '#0f7f8f', soft: '#d5f2f5', dark: '#0a545f', label: 'Ardoise' },
  ],
  G: [
    { cc: '#1a6b3a', soft: '#d4f5e2', dark: '#0f4024', label: 'Forêt' },
    { cc: '#0f7f8f', soft: '#d5f2f5', dark: '#0a545f', label: 'Savane' },
    { cc: '#b8860b', soft: '#fdf3d1', dark: '#7a5a05', label: 'Sahara' },
    { cc: '#d97706', soft: '#fef3c7', dark: '#92500a', label: 'Soleil' },
  ],
  H: [
    { cc: '#818cf8', soft: '#eef2ff', dark: '#4f46e5', label: 'Nébuleuse' },
    { cc: '#7c3aed', soft: '#ede9fe', dark: '#5b21b6', label: 'Cosmos' },
    { cc: '#0d9488', soft: '#ccfbf1', dark: '#0a6b5e', label: 'Aurore' },
    { cc: '#f59e0b', soft: '#fef3c7', dark: '#92500a', label: 'Étoile' },
  ],
  I: [
    { cc: '#db2777', soft: '#fde7f2', dark: '#9d1b55', label: 'Framboise' },
    { cc: '#c026d3', soft: '#fdf4ff', dark: '#86198f', label: 'Bonbon' },
    { cc: '#f59e0b', soft: '#fef3c7', dark: '#92500a', label: 'Pêche' },
    { cc: '#7c3aed', soft: '#ede9fe', dark: '#5b21b6', label: 'Lavande' },
  ],
  J: [
    { cc: '#2c5642', soft: '#d4f0e5', dark: '#1a3828', label: 'Mousse' },
    { cc: '#b8860b', soft: '#fdf3d1', dark: '#7a5a05', label: 'Craie' },
    { cc: '#1446aa', soft: '#dbe7fb', dark: '#0d2f77', label: 'Encre' },
    { cc: '#c22f2f', soft: '#fde2e2', dark: '#7e1d1d', label: 'Brique' },
  ],
};

export const CARD_PALETTE = [
  { cc: '#c09018', soft: '#f4ecd4', dark: '#7a5a0d', label: 'Or (école)' },
  { cc: '#1446aa', soft: '#dbe7fb', dark: '#0d2f77', label: 'Saphir' },
  { cc: '#7b2d8b', soft: '#f3e4f9', dark: '#4f1a5e', label: 'Mauve' },
  { cc: '#0f7f8f', soft: '#d5f2f5', dark: '#0a545f', label: 'Lagon' },
  { cc: '#b8860b', soft: '#fdf3d1', dark: '#7a5a05', label: 'Ambre' },
  { cc: '#c22f2f', soft: '#fde2e2', dark: '#7e1d1d', label: 'Rubis' },
  { cc: '#d63384', soft: '#fce4f1', dark: '#8f1f57', label: 'Rose' },
  { cc: '#e8590c', soft: '#ffe8d9', dark: '#9c3a06', label: 'Corail' },
  { cc: '#3d3f9e', soft: '#e3e4fa', dark: '#26276b', label: 'Indigo' },
  { cc: '#0d2b7a', soft: '#dde5f8', dark: '#081b4e', label: 'Marine' },
  { cc: '#1a6b3a', soft: '#d4f5e2', dark: '#0f4024', label: 'Forêt' },
  { cc: '#7b5cd6', soft: '#ece5fb', dark: '#4f3592', label: 'Lavande' },
];

export const PATRIMOINE_GROUPS = {
  'Animaux de la RDC 🇨🇩': [
    { value: 'rdc-okapi', name: 'Okapi' },
    { value: 'rdc-bonobo', name: 'Bonobo' },
    { value: 'rdc-gorille', name: 'Gorille de montagne' },
    { value: 'rdc-paon-congo', name: 'Paon du Congo' },
    { value: 'rdc-elephant', name: 'Éléphant de forêt' },
    { value: 'rdc-hippopotame', name: 'Hippopotame' },
    { value: 'rdc-crocodile', name: 'Crocodile du Nil' },
    { value: 'rdc-leopard', name: 'Léopard' },
    { value: 'rdc-lion', name: 'Lion' },
    { value: 'rdc-perroquet-gris', name: 'Perroquet gris' },
    { value: 'rdc-chimpanze', name: 'Chimpanzé' },
    { value: 'rdc-bongo', name: 'Bongo' },
  ],
  'Pierres & minerais 💎': [
    { value: 'min-diamant', name: 'Diamant' },
    { value: 'min-or', name: 'Or' },
    { value: 'min-cuivre', name: 'Cuivre' },
    { value: 'min-cobalt', name: 'Cobalt' },
    { value: 'min-coltan', name: 'Coltan' },
    { value: 'min-cassiterite', name: 'Cassitérite' },
    { value: 'min-malachite', name: 'Malachite' },
    { value: 'min-tourmaline', name: 'Tourmaline' },
    { value: 'min-amethyste', name: 'Améthyste' },
    { value: 'min-wolframite', name: 'Wolframite' },
    { value: 'min-heterogenite', name: 'Hétérogénite' },
    { value: 'min-quartz', name: 'Quartz' },
  ],
  'Animaux aquatiques 🌊': [
    { value: 'aqua-orque', name: 'Orque' },
    { value: 'aqua-narval', name: 'Narval' },
    { value: 'aqua-beluga', name: 'Béluga' },
    { value: 'aqua-morse', name: 'Morse' },
    { value: 'aqua-loutre', name: 'Loutre de mer' },
    { value: 'aqua-saumon', name: 'Saumon' },
    { value: 'aqua-pieuvre', name: 'Pieuvre géante' },
    { value: 'aqua-crabe-royal', name: 'Crabe royal' },
    { value: 'aqua-homard', name: 'Homard' },
    { value: 'aqua-baleine-grise', name: 'Baleine grise' },
    { value: 'aqua-otarie', name: 'Otarie' },
    { value: 'aqua-phoque', name: 'Phoque' },
  ],
  'Animaux terrestres 🐾': [
    { value: 'terre-kangourou', name: 'Kangourou' },
    { value: 'terre-koala', name: 'Koala' },
    { value: 'terre-panda', name: 'Panda' },
    { value: 'terre-ours-polaire', name: 'Ours polaire' },
    { value: 'terre-jaguar', name: 'Jaguar' },
    { value: 'terre-puma', name: 'Puma' },
    { value: 'terre-bison', name: 'Bison' },
    { value: 'terre-grizzly', name: 'Grizzly' },
    { value: 'terre-lama', name: 'Lama' },
    { value: 'terre-alpaga', name: 'Alpaga' },
    { value: 'terre-paresseux', name: 'Paresseux' },
    { value: 'terre-capybara', name: 'Capybara' },
  ],
  'Oiseaux 🦜': [
    { value: 'ois-toucan', name: 'Toucan' },
    { value: 'ois-ara-rouge', name: 'Ara rouge' },
    { value: 'ois-kiwi', name: 'Kiwi' },
    { value: 'ois-cacatoes', name: 'Cacatoès' },
    { value: 'ois-manchot', name: 'Manchot' },
    { value: 'ois-aigle', name: 'Aigle' },
    { value: 'ois-colibri', name: 'Colibri' },
    { value: 'ois-harfang', name: 'Harfang' },
    { value: 'ois-macareux', name: 'Macareux' },
    { value: 'ois-condor', name: 'Condor' },
    { value: 'ois-oiseau-paradis', name: 'Oiseau de paradis' },
    { value: 'ois-cardinal', name: 'Cardinal rouge' },
  ],
};

export const ALL_PATRIMOINS = Object.values(PATRIMOINE_GROUPS).flat();

export const DEFAULT_CYCLE_COLORS = [
  { cc: '#d63384', soft: '#fce4f1', dark: '#8f1f57' },
  { cc: '#e8590c', soft: '#ffe8d9', dark: '#9c3a06' },
  { cc: '#7b5cd6', soft: '#ece5fb', dark: '#4f3592' },
  { cc: '#1446aa', soft: '#dbe7fb', dark: '#0d2f77' },
  { cc: '#08825a', soft: '#d7f3e7', dark: '#05543a' },
  { cc: '#b8860b', soft: '#fdf3d1', dark: '#7a5a05' },
  { cc: '#0f7f8f', soft: '#d5f2f5', dark: '#0a545f' },
  { cc: '#c22f2f', soft: '#fde2e2', dark: '#7e1d1d' },
  { cc: '#3d3f9e', soft: '#e3e4fa', dark: '#26276b' },
  { cc: '#0d2b7a', soft: '#dde5f8', dark: '#081b4e' },
];

export const PATRIMOINE_STYLES = [
  { value: 'vignette', label: 'Vignette' },
  { value: 'fond', label: 'Fond' },
  { value: 'both', label: 'Vignette + Fond' },
];
