// Enhanced Banned Words Library for Underwear-related Content
// Handles case variations, leetspeak, special characters, and Hinglish terms

const LEET_MAP = {
  'a': ['@', '4', 'α', 'д'],
  'b': ['8', 'ß', 'в', '6'],
  'c': ['(', '<', '¢', 'с'],
  'd': ['|)', 'ð', 'д'],
  'e': ['3', '€', 'е'],
  'f': ['ƒ', 'Ғ'],
  'g': ['9', '6', 'ԍ', 'ɡ'],
  'h': ['#', 'н', 'ħ'],
  'i': ['1', '!', '|', 'í', 'і'],
  'j': ['_|', 'ј'],
  'k': ['|<', 'к'],
  'l': ['1', '|', '£', 'ⅼ'],
  'm': ['м', 'ɱ'],
  'n': ['п', 'η'],
  'o': ['0', 'ø', 'о', 'σ'],
  'p': ['р', 'ƿ'],
  'q': ['9', 'ԛ'],
  'r': ['®', 'г'],
  's': ['$', '5', 'ѕ', 'š'],
  't': ['7', '†', 'т'],
  'u': ['μ', 'ц', 'υ'],
  'v': ['ν', 'ѵ'],
  'w': ['ω', 'щ', 'ш'],
  'x': ['×', 'х', 'χ'],
  'y': ['¥', 'у', 'γ'],
  'z': ['2', 'з', 'ζ']
};

// Generate leetspeak variations of a word (limited to prevent combinatorial explosion)
function generateLeetVariations(word) {
  const variations = new Set([word.toLowerCase()]);
  const chars = word.toLowerCase().split('');
  
  // Only do single-character substitutions to avoid explosion
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const leetOptions = LEET_MAP[char] || [];
    
    for (const leet of leetOptions) {
      const variation = [...chars];
      variation[i] = leet;
      variations.add(variation.join(''));
    }
  }
  
  // Limit total variations per word
  return Array.from(variations).slice(0, 20);
}

// Normalize text by removing special chars and converting leetspeak
function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[@4αд]/g, 'a')
    .replace(/[8ßв6]/g, 'b')
    .replace(/[\(<¢с]/g, 'c')
    .replace(/[\)]ðд]/g, 'd')
    .replace(/[3€е]/g, 'e')
    .replace(/[ƒҒ]/g, 'f')
    .replace(/[96ԍɡ]/g, 'g')
    .replace(/[#нħ]/g, 'h')
    .replace(/[1!|íі]/g, 'i')
    .replace(/[_|ј]/g, 'j')
    .replace(/[|<к]/g, 'k')
    .replace(/[1|£ⅼ]/g, 'l')
    .replace(/[мɱ]/g, 'm')
    .replace(/[пη]/g, 'n')
    .replace(/[0øоσ]/g, 'o')
    .replace(/[рƿ]/g, 'p')
    .replace(/[9ԛ]/g, 'q')
    .replace(/[®г]/g, 'r')
    .replace(/[$5ѕš]/g, 's')
    .replace(/[7†т]/g, 't')
    .replace(/[μцυ]/g, 'u')
    .replace(/[νѵ]/g, 'v')
    .replace(/[ωщш]/g, 'w')
    .replace(/[×хχ]/g, 'x')
    .replace(/[¥уγ]/g, 'y')
    .replace(/[2зζ]/g, 'z')
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

// Check if text contains banned word with variations
function containsBannedWord(text, bannedWord) {
  const normalizedText = normalizeText(text);
  const normalizedBanned = normalizeText(bannedWord);
  
  // Direct match
  if (normalizedText.includes(normalizedBanned)) return true;
  
  // Check leetspeak variations
  const leetVariations = generateLeetVariations(bannedWord);
  for (const variation of leetVariations) {
    if (normalizedText.includes(normalizeText(variation))) return true;
  }
  
  return false;
}

// Banned words with Hindi/English (Hinglish) terms
const BANNED_WORDS = {
  // Direct underwear terms
  underwear: [
    'underwear', 'undies', 'panties', 'briefs', 'boxers', 'boxer-briefs', 'thong', 'g-string',
    'bikini', 'hipster', 'boyshorts', 'high-waist', 'control-top', 'shapewear', 'lingerie',
    'bra', 'brassiere', 'sports-bra', 'push-up', 'strapless', 'bralette', 'camisole', 'tank-top',
    'undershirt', 'vest', 'singlet', 'long-johns', 'thermal-underwear', 'union-suit', 'onesie',
    // Hinglish terms
    'chaddi', 'chaddhi', 'kaccha', 'kacchha', 'langot', 'langoot', 'undergarment', 'undergarments',
    'peticoat', 'petticoat', 'blouse', 'brah', 'brassier', 'choli', 'lehenga', 'ghagra'
  ],

  // Inappropriate/explicit terms
  explicit: [
    'nude', 'naked', 'bare', 'exposed', 'revealing', 'see-through', 'sheer', 'transparent',
    'lace', 'silk', 'satin', 'velvet', 'mesh', 'fishnet', 'cut-out', 'open-crotch', 'crotchless',
    'erotic', 'sexual', 'sexy', 'seductive', 'provocative', 'intimate', 'private', 'personal',
    'boudoir', 'bedroom', 'nightwear', 'sleepwear', 'pajamas', 'nightgown', 'negligee', 'peignoir',
    // Hinglish terms
    'nanga', 'nange', 'nangi', 'bezaar', 'bezaari', 'ashleel', 'ashleelta', 'ganda', 'gandi',
    'besharam', 'besharmi', 'badmash', 'badmaash', 'aashique', 'aashiq', 'rangreli', 'rangraliya'
  ],

  // Body parts (when used inappropriately)
  bodyParts: [
    'breast', 'breasts', 'boob', 'boobs', 'nipple', 'nipples', 'areola', 'cleavage',
    'butt', 'buttocks', 'bottom', 'rear', 'behind', 'cheeks', 'glutes',
    'groin', 'crotch', 'genital', 'genitals', 'pubic', 'private-parts', 'intimate-area',
    // Hinglish terms
    'stan', 'stann', 'chuch', 'chuchi', 'chuchiyan', 'nipal', 'nipple', 'gaand', 'gand',
    'bum', 'bumm', 'peechwada', 'pichwada', 'kamar', 'jaangh', 'jagh', 'private', 'privates',
    'gupt', 'guptang', 'ling', 'yoni', 'shishn', 'shishan'
  ],

  // Actions/verbs that could be misused
  actions: [
    'flash', 'expose', 'show', 'reveal', 'display', 'model', 'pose', 'strip', 'undress',
    'remove', 'take-off', 'peel-off', 'slip-off', 'adjust', 'fix', 'arrange', 'position',
    // Hinglish terms
    'dikha', 'dikhao', 'dikhana', 'utaro', 'utarna', 'nikal', 'nikalo', 'nikalna',
    'khol', 'kholo', 'kholna', 'ulaat', 'ulta', 'ultaana', 'pehen', 'pehno', 'pehanna'
  ],

  // Contexts that could indicate misuse
  contexts: [
    'fetish', 'kink', 'bdsm', 'roleplay', 'fantasy', 'desire', 'lust', 'arousal',
    'exhibitionist', 'voyeur', 'peep', 'spy', 'watch', 'stare', 'gaze', 'ogle',
    'pervert', 'creep', 'weirdo', 'freak', 'deviant', 'obsessed', 'addicted',
    // Hinglish terms
    'kaam', 'kaamuk', 'kaamini', 'vasna', 'vasana', 'ichha', 'ichcha', 'tarse', 'tarsao',
    'majboor', 'majboori', 'dabao', 'dabaao', 'zor', 'zabardasti', 'balatkar', 'balatkaar',
    'chhed', 'chhedna', 'chhuo', 'chhuna', 'maslo', 'masalna', 'dabao', 'dabana'
  ],
  profanity: [
    // English profanity
    'fuck', 'fucking', 'fucker', 'motherfucker', 'motherfucking',
    'shit', 'shitting', 'shitty', 'bullshit', 'bullshitting',
    'bitch', 'bitching', 'bitchy', 'sonofabitch', 'sonofbitch',
    'ass', 'asshole', 'asshat', 'dumbass', 'smartass', 'jackass', 'badass',
    'damn', 'dammit', 'goddamn', 'goddammit',
    'hell', 'hellno',
    'crap', 'crappy',
    'piss', 'pissing', 'pissed', 'pissedoff',
    'dick', 'dickhead', 'cock', 'cockhead', 'prick',
    'pussy', 'cunt', 'twat',
    'whore', 'ho', 'hoe', 'slut', 'slutty',
    'bastard', 'bastards',
    'wtf', 'stfu', 'gtfo', 'lmfao', 'fml',
    // Hinglish profanity
    'bhosdi', 'bhosdike', 'bhosdika', 'bhosdiwala',
    'madarchod', 'madarchod', 'madarchoot',
    'behenchod', 'behenchoot', 'behenchod',
    'gaand', 'gaandu', 'gaandfat', 'gaandmasti',
    'lund', 'lunda', 'lundebaaz', 'lundtopi',
    'chut', 'chutia', 'chutiya', 'chutyapa',
    'lavde', 'lavda', 'lavdeke',
    'suar', 'suarke', 'suarkebachche',
    'kamine', 'kamina', 'kamini',
    'harami', 'haramzada', 'haramzadi',
    'randi', 'randibaaz', 'randikaput',
    'chinal', 'chinali',
    'bhadwa', 'bhadwi',
    'gaandfaad', 'gaand maar', 'gaandmaro',
    'lundkhus', 'lundchoos',
    'chutmarani', 'chutkebaal',
    'bhenke', 'bhenke', 'bhenkelund',
    'madarke', 'madarke', 'madarkebachche',
    // Variations with spaces/special chars
    'f u c k', 'f u c k i n g',
    's h i t', 'b i t c h',
    'm f', 'mf', 'mtherfcker',
    'bhenchod', 'behenchod', 'bhen choot',
    'madar chod', 'madar choot',
    'bhosdi ke', 'bhosdi ka',
    'gaand mein', 'gaand me',
    'lund ke', 'lund ka',
    'chut ke', 'chut ka'
  ]
};

// Generate all variations including leetspeak
function generateAllVariations(words) {
  const variations = new Set();
  
  for (const word of words) {
    // Original word
    variations.add(word.toLowerCase());
    
    // Case variations
    variations.add(word.toUpperCase());
    variations.add(word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
    
    // Leetspeak variations (limited to prevent explosion)
    const leetVariations = generateLeetVariations(word);
    for (const variation of leetVariations.slice(0, 50)) { // Limit variations
      variations.add(variation.toLowerCase());
    }
  }
  
  return Array.from(variations);
}

// Generate all banned word variations
const ALL_BANNED_VARIATIONS = [];
Object.values(BANNED_WORDS).forEach(categoryWords => {
  ALL_BANNED_VARIATIONS.push(...generateAllVariations(categoryWords));
});

// Function to check if text contains banned words (with all variations)
function containsBannedWords(text) {
  if (!text || typeof text !== 'string') return false;
  
  const normalizedText = normalizeText(text);
  
  // Check direct normalized matches
  for (const bannedWord of ALL_BANNED_VARIATIONS) {
    const normalizedBanned = normalizeText(bannedWord);
    if (normalizedText.includes(normalizedBanned)) {
      return true;
    }
  }
  
  return false;
}

// Function to filter banned words from text
function filterBannedWords(text, replacement = '***') {
  if (!text || typeof text !== 'string') return text;
  
  let filteredText = text;
  const normalizedText = normalizeText(text);
  
  // Find and replace banned words (preserving original case where possible)
  for (const bannedWord of ALL_BANNED_VARIATIONS) {
    const normalizedBanned = normalizeText(bannedWord);
    if (normalizedText.includes(normalizedBanned)) {
      // Create regex to match variations in original text
      const regex = new RegExp(bannedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      filteredText = filteredText.replace(regex, replacement);
    }
  }
  
  return filteredText;
}

// Function to get banned words found in text
function getBannedWordsFound(text) {
  if (!text || typeof text !== 'string') return [];
  
  const found = [];
  const normalizedText = normalizeText(text);
  
  for (const bannedWord of ALL_BANNED_VARIATIONS) {
    const normalizedBanned = normalizeText(bannedWord);
    if (normalizedText.includes(normalizedBanned)) {
      found.push(bannedWord);
    }
  }
  
  return [...new Set(found)]; // Remove duplicates
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BANNED_WORDS,
    ALL_BANNED_VARIATIONS,
    containsBannedWords,
    filterBannedWords,
    getBannedWordsFound,
    normalizeText,
    generateLeetVariations
  };
}

// Also make available globally for browser use
if (typeof window !== 'undefined') {
  window.BannedWordsLibrary = {
    BANNED_WORDS,
    ALL_BANNED_VARIATIONS,
    containsBannedWords,
    filterBannedWords,
    getBannedWordsFound,
    normalizeText,
    generateLeetVariations
  };
}
