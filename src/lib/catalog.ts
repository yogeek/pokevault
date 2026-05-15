import type { CatalogCard, CatalogSet } from '@/types'

export interface CatalogData {
  sets: CatalogSet[]
  cards: CatalogCard[]
}

let cache: CatalogData | null = null

export async function loadCatalog(onProgress?: (p: number) => void): Promise<CatalogData> {
  if (cache) return cache

  const url = import.meta.env.BASE_URL + 'catalog.json'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Erreur ${res.status} : impossible de charger le catalogue`)

  const contentLength = res.headers.get('content-length')
  const total = contentLength ? parseInt(contentLength, 10) : null

  let text: string
  if (total && res.body) {
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.length
      onProgress?.(loaded / total)
    }
    const merged = new Uint8Array(loaded)
    let offset = 0
    for (const c of chunks) { merged.set(c, offset); offset += c.length }
    text = new TextDecoder().decode(merged)
  } else {
    onProgress?.(0.3)
    text = await res.text()
    onProgress?.(0.8)
  }

  cache = JSON.parse(text) as CatalogData
  onProgress?.(1)
  return cache
}

// French → English Pokémon name translations (Gen 1–4 + common promos)
const FR_TO_EN: Record<string, string> = {
  // Gen 1
  'bulbizarre': 'bulbasaur', 'herbizarre': 'ivysaur', 'florizarre': 'venusaur',
  'salamèche': 'charmander', 'reptincel': 'charmeleon', 'dracaufeu': 'charizard',
  'carapuce': 'squirtle', 'carabaffe': 'wartortle', 'tortank': 'blastoise',
  'chenipan': 'caterpie', 'chrysacier': 'metapod', 'papilusion': 'butterfree',
  'aspicot': 'weedle', 'coconfort': 'kakuna', 'dardargnan': 'beedrill',
  'roucool': 'pidgey', 'roucoups': 'pidgeotto', 'roucarnage': 'pidgeot',
  'rattata': 'rattata', 'rattatac': 'raticate',
  'piafabec': 'spearow', 'rapasdepic': 'fearow',
  'abo': 'ekans', 'arbok': 'arbok',
  'pikachu': 'pikachu', 'raichu': 'raichu',
  'sabelette': 'sandshrew', 'sablaireau': 'sandslash',
  'mélofée': 'clefairy', 'mélodelfe': 'clefable',
  'goupix': 'vulpix', 'feunard': 'ninetales',
  'rondoudou': 'jigglypuff', 'grodoudou': 'wigglytuff',
  'nosferapti': 'zubat', 'nosferalto': 'golbat',
  'mystherbe': 'oddish', 'ortide': 'gloom', 'floravol': 'vileplume',
  'paras': 'paras', 'parasect': 'parasect',
  'mimitoss': 'venonat', 'aéromite': 'venomoth',
  'taupiqueur': 'diglett', 'triopikeur': 'dugtrio',
  'miaouss': 'meowth', 'persian': 'persian',
  'psykokwak': 'psyduck', 'akwakwak': 'golduck',
  'férosinge': 'mankey', 'colossinge': 'primeape',
  'caninos': 'growlithe', 'arcanin': 'arcanine',
  'ptitard': 'poliwag', 'têtarte': 'poliwhirl', 'tartard': 'poliwrath',
  'abra': 'abra', 'kadabra': 'kadabra', 'alakazam': 'alakazam',
  'machoc': 'machop', 'machopeur': 'machoke', 'mackogneur': 'machamp',
  'chétiflor': 'bellsprout', 'boustiflor': 'weepinbell', 'empiflor': 'victreebel',
  'tentacool': 'tentacool', 'tentacruel': 'tentacruel',
  'racaillou': 'geodude', 'gravalanch': 'graveler', 'grolem': 'golem',
  'ponyta': 'ponyta', 'galopa': 'rapidash',
  'ramoloss': 'slowpoke', 'flagadoss': 'slowbro',
  'magnéti': 'magnemite', 'magnéton': 'magneton',
  'canarticho': "farfetch'd",
  'doduo': 'doduo', 'dodrio': 'dodrio',
  'otaria': 'seel', 'lamantine': 'dewgong',
  'tadmorv': 'grimer', 'grotadmorv': 'muk',
  'kokiyas': 'shellder', 'crustabri': 'cloyster',
  'fantominus': 'gastly', 'spectrum': 'haunter', 'ectoplasma': 'gengar',
  'onix': 'onix',
  'soporifik': 'drowzee', 'hypno': 'hypno',
  'krabby': 'krabby', 'krabboss': 'kingler',
  'voltorbe': 'voltorb', 'électrode': 'electrode',
  'noeunoeuf': 'exeggcute', 'noadkoko': 'exeggutor',
  'osselait': 'cubone', 'ossatueur': 'marowak',
  'kicklee': 'hitmonlee', 'tygnon': 'hitmonchan',
  'excelangue': 'lickitung',
  'smogo': 'koffing', 'smogogo': 'weezing',
  'rhinocorne': 'rhyhorn', 'rhinoféros': 'rhydon',
  'leveinard': 'chansey', 'saquedeneu': 'tangela', 'kangourex': 'kangaskhan',
  'hypotrempe': 'horsea', 'hypocéan': 'seadra',
  'poissirène': 'goldeen', 'poissoroy': 'seaking',
  'étofrisson': 'staryu', 'staross': 'starmie',
  'mr. mime': 'mr. mime', 'insécateur': 'scyther', 'lippoutou': 'jynx',
  'élektek': 'electabuzz', 'magmar': 'magmar', 'scarabrute': 'pinsir',
  'tauros': 'tauros',
  'magicarpe': 'magikarp', 'léviator': 'gyarados',
  'lokhlass': 'lapras', 'métamorph': 'ditto',
  'évoli': 'eevee', 'aquali': 'vaporeon', 'voltali': 'jolteon', 'pyroli': 'flareon',
  'porygon': 'porygon',
  'amonita': 'omanyte', 'amonistar': 'omastar',
  'kabuto': 'kabuto', 'kabutops': 'kabutops',
  'ptéra': 'aerodactyl', 'ronflex': 'snorlax',
  'artikodin': 'articuno', 'électhor': 'zapdos', 'sulfura': 'moltres',
  'minidraco': 'dratini', 'draco': 'dragonair', 'dracolosse': 'dragonite',
  'mewtwo': 'mewtwo', 'mew': 'mew',
  // Gen 2
  'germignon': 'chikorita', 'macronium': 'bayleef', 'méganium': 'meganium',
  'hericendre': 'cyndaquil', 'feurisson': 'quilava', 'typhlosion': 'typhlosion',
  'kaiminus': 'totodile', 'crocrodil': 'croconaw', 'aligatueur': 'feraligatr',
  'fouinette': 'sentret', 'fouinar': 'furret',
  'hoothoot': 'hoothoot', 'noarfang': 'noctowl',
  'paris': 'ledyba', 'parafly': 'ledian',
  'feuforêve': 'spinarak', 'migalos': 'ariados',
  'nostenfer': 'crobat',
  'marill': 'marill', 'azumarill': 'azumarill',
  'togepi': 'togepi', 'togetic': 'togetic',
  'natu': 'natu', 'xatu': 'xatu',
  'lainergie': 'mareep', 'lainelame': 'flaaffy', 'pharamp': 'ampharos',
  'béléboh': 'bellossom',
  'azurill': 'azurill',
  'toudoudou': 'hoppip', 'touduflair': 'skiploom', 'joliflor': 'jumpluff',
  'granivol': 'aipom',
  'feuilles': 'sunkern', 'héliatronc': 'sunflora',
  'yanma': 'yanma',
  'axoloto': 'wooper', 'maraiste': 'quagsire',
  'espeon': 'espeon', 'umbreon': 'umbreon',
  'noctali': 'umbreon',
  'grandaroi': 'slowking',
  'munja': 'misdreavus',
  'cIgnol': 'unown',
  'girafarig': 'girafarig',
  'pomdepik': 'pineco', 'foretress': 'forretress',
  'gligar': 'gligar',
  'qwilfish': 'qwilfish',
  'cizayox': 'scizor',
  'scorplane': 'shuckle',
  'heracross': 'heracross',
  'teddiursa': 'teddiursa', 'ursaring': 'ursaring',
  'limagma': 'slugma', 'magcargo': 'magcargo',
  'swinub': 'swinub', 'piloswine': 'piloswine',
  'corsola': 'corsola',
  'rémoraid': 'remoraid', 'octillery': 'octillery',
  'cadoizo': 'delibird',
  'démanta': 'mantine',
  'caélos': 'skarmory',
  'malosse': 'houndour', 'démolosse': 'houndoom',
  'hyporoi': 'kingdra',
  'phanpy': 'phanpy', 'donphan': 'donphan',
  'porygon2': 'porygon2',
  'stantler': 'stantler',
  'queulorior': 'smeargle',
  'élekid': 'elekid', 'magby': 'magby',
  'miltank': 'miltank',
  'blissey': 'blissey',
  'raikou': 'raikou', 'entei': 'entei', 'suicune': 'suicune',
  'larvitar': 'larvitar', 'masqarade': 'pupitar', 'tyranocif': 'tyranitar',
  'lugia': 'lugia', 'ho-oh': 'ho-oh',
  'celebi': 'celebi',
}

export function searchCards(catalog: CatalogData, query: string, limit = 30): CatalogCard[] {
  const q = query.toLowerCase().trim()
  if (!q) return []
  // Translate French name to English if a mapping exists
  const qEn = FR_TO_EN[q] ?? q
  return catalog.cards
    .filter(c => {
      const name = c.name.toLowerCase()
      return (
        name.includes(qEn) ||
        (qEn !== q && name.includes(q)) ||
        c.id.toLowerCase().includes(q) ||
        c.number.includes(q) ||
        c.setName.toLowerCase().includes(q)
      )
    })
    .slice(0, limit)
}

export function getCard(catalog: CatalogData, id: string): CatalogCard | undefined {
  return catalog.cards.find(c => c.id === id)
}

export function getSet(catalog: CatalogData, setId: string): CatalogSet | undefined {
  return catalog.sets.find(s => s.id === setId)
}

export function getCardsBySet(catalog: CatalogData, setId: string): CatalogCard[] {
  return catalog.cards.filter(c => c.setId === setId)
}
