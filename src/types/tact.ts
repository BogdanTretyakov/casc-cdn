export enum TactProduct {
  BattleNetAgent = 'agent',
  BattleNetApp = 'bna',
  Catalog = 'catalogs',

  BlizzardArcadeCollectionRetail = 'rtro',

  DiabloImmortalRetail = 'anbs',
  DiabloImmortalDev = 'anbsdev',

  DiabloIIResurrectedRetail = 'osi',
  DiabloIIResurrectedBeta = 'osib',

  Diablo3Retail = 'd3',
  Diablo3China = 'd3cn',
  Diablo3Test = 'd3t',

  DiabloIVRetail = 'fenris',
  DiabloIVBeta = 'fenrisb',

  HeroesOfTheStormRetail = 'hero',
  HeroesOfTheStormTournament = 'heroc',
  HeroesOfTheStormTest = 'herot',

  HearthstoneRetail = 'hsb',
  HearthstoneChournament = 'hsc',

  OverwatchRetail = 'pro',
  OverwatchTournamentUS = 'proc',
  OverwatchTournamentCN = 'proc_cn',
  OverwatchTournamentEU = 'proc_eu',
  OverwatchTournamentKR = 'proc_kr',
  OverwatchProfessional2 = 'proc2',
  OverwatchProfessional2CN = 'proc2_cn',
  OverwatchProfessional2EU = 'proc2_eu',
  OverwatchProfessional2KR = 'proc2_kr',

  StarCraft1 = 's1',
  StarCraft1Test = 's1t',

  StarCraftIIRetail = 's2',

  WarcraftIII = 'w3',
  WarcraftIIIPublicTest = 'w3t',

  WorldOfWarcraftRetail = 'wow',
  WorldOfWarcraftAlphaBeta = 'wow_beta',
  WorldOfWarcraftClassic = 'wow_classic',
  WorldOfWarcraftClassicBeta = 'wow_classic_beta',
  WorldOfWarcraftClassicTest = 'wow_classic_ptr',
  WorldOfWarcraftClassicEra = 'wow_classic_era',
  WorldOfWarcraftClassicEraBeta = 'wow_classic_era_beta',
  WorldOfWarcraftClassicEraTest = 'wow_classic_era_ptr',

  WorldOfWarcraftTest = 'wowt',
  WorldOfWarcraftTest2 = 'wowxptr',
  WorldOfWarcraftVendor = 'wowv',
}

export enum LocaleFlags {
  enUS = 0x2,
  koKR = 0x4,
  frFR = 0x10,
  deDE = 0x20,
  zhCN = 0x40,
  esES = 0x80,
  zhTW = 0x100,
  enGB = 0x200,
  enCN = 0x400,
  enTW = 0x800,
  esMX = 0x1000,
  ruRU = 0x2000,
  ptBR = 0x4000,
  itIT = 0x8000,
  ptPT = 0x10000,
}

export enum ContentFlags {
  HighResTexture = 0x1, // is high-res texture (cataclysm 4.4.0 beta)
  Install = 0x4, // file is in install manifest
  LoadOnWindows = 0x8, // macOS clients do not read block if flags & 0x108 != 0
  LoadOnMacOS = 0x10, // windows clients do not read block if flags & 0x110 != 0
  x86_32 = 0x20, // install manifest file only - load on 32 bit systems
  x86_64 = 0x40, // install manifest file only - load on 64 bit systems
  LowViolence = 0x80,
  DoNotLoad = 0x100, // neither macOS nor windows clients read blocks with this flag set. LoadOnMysteryPlatformᵘ?
  UpdatePlugin = 0x800, // only ever set for UpdatePlugin.dll and UpdatePlugin.dylib
  ARM64 = 0x8000, // install manifest file only - load on ARM64 systems
  Encrypted = 0x8000000,
  NoNameHash = 0x10000000,
  UncommonResolution = 0x20000000, // denotes non-1280px wide cinematics
  Bundle = 0x40000000,
  NoCompression = 0x80000000,
}

export enum ContentTag {
  platform = 1,
  architecture = 2,
  locale = 3,
  region = 4,
  category = 5,
  alternate = 0x4000,
}
