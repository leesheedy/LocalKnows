/**
 * Quote requests: what can be asked for, and what the form asks.
 *
 * Pure configuration with no imports from the repository, because
 * `src/lib/repo.ts` reads it for the link guard and the URL helpers, and
 * `src/lib/quotes.ts` builds everything that needs listings on top of it.
 *
 * The questions are the ones a business needs answered before it can price a
 * job over the phone. Every option is something a person can pick without
 * going to look anything up, which is what keeps the form to about a minute.
 *
 * Nothing here is a price claim. Budget bands are the customer's own answer,
 * offered as ranges so nobody has to invent a number, and `mid` only exists so
 * the CRM can sort leads by rough size.
 */

export type QuoteGroup = 'energy' | 'build' | 'outdoors' | 'property' | 'trades';

export interface QuoteQuestion {
  id: 'q1' | 'q2' | 'q3' | 'q4';
  q: string;
  options: string[];
  /** Copies the answer into a named field the CRM files separately. */
  key?: 'property_type' | 'ownership';
}

export interface QuoteBand {
  label: string;
  /** Rough midpoint in dollars, for sorting leads. 0 when the answer is "not sure". */
  mid: number;
}

export interface QuoteService {
  slug: string;
  label: string;
  group: QuoteGroup;
  /** Category slugs the recommended businesses come from, best match first. */
  categorySlugs: string[];
  /** Page h1. */
  h1: string;
  /** Title tag, before the site suffix. */
  title: string;
  /** One sentence under the h1 and in the meta description. */
  intro: string;
  /** Short hook for banners on category and listing pages. */
  hook: string;
  /** What a business in this service is called, plural, for "local ___". */
  who: string;
  questions: QuoteQuestion[];
  budget: { q: string; bands: QuoteBand[] };
  detailsHint: string;
  /** Things worth checking before signing anything. General, never a statistic. */
  tips: string[];
  /** SVG path data for a 24 by 24 line icon. */
  icon: string;
}

export const QUOTE_GROUPS: Record<QuoteGroup, string> = {
  energy: 'Energy',
  build: 'Build and renovate',
  outdoors: 'Outdoors',
  property: 'Property and finance',
  trades: 'Trades',
};

const OWN = {
  id: 'q4',
  q: 'Do you own the property?',
  options: ['I own it', 'I am buying it', 'I rent it', 'It is a business premises'],
  key: 'ownership',
} as const satisfies QuoteQuestion;

export const QUOTE_SERVICES: QuoteService[] = [
  {
    slug: 'solar',
    label: 'Solar panels',
    group: 'energy',
    categorySlugs: ['solar-installers', 'electricians'],
    h1: 'Get solar quotes from local installers',
    title: 'Solar quotes from local installers, Albury, Wodonga and the border',
    intro:
      'Answer a few quick questions about your roof and your power bill and we pass your request to up to three solar installers who cover your town.',
    hook: 'Planning solar?',
    who: 'solar installers',
    questions: [
      {
        id: 'q1',
        q: 'What are you after?',
        options: ['Solar panels', 'Solar panels and a battery', 'More panels on an existing system', 'Not sure yet, I want advice'],
      },
      {
        id: 'q2',
        q: 'Roughly how much is your power bill?',
        options: ['Under $300 a quarter', '$300 to $600 a quarter', '$600 to $1,000 a quarter', 'Over $1,000 a quarter', 'It is a business bill'],
      },
      {
        id: 'q3',
        q: 'What is the property?',
        options: ['House', 'Farm or acreage', 'Townhouse or unit', 'Business or commercial'],
        key: 'property_type',
      },
      OWN,
    ],
    budget: {
      q: 'What budget do you have in mind?',
      bands: [
        { label: 'Under $5,000', mid: 4000 },
        { label: '$5,000 to $10,000', mid: 7500 },
        { label: '$10,000 to $20,000', mid: 15000 },
        { label: '$20,000 to $40,000', mid: 30000 },
        { label: 'Over $40,000', mid: 50000 },
        { label: 'Not sure yet', mid: 0 },
      ],
    },
    detailsHint: 'Roof direction, shading, phase power, a quote you already have, anything the installer should know.',
    tips: [
      'Get the panel and inverter brands and models in writing, not just the system size in kilowatts.',
      'Ask for the installer’s accreditation number and check it on the accreditation register yourself.',
      'Ask who handles warranty claims if the installer stops trading, and get the manufacturer warranties in writing.',
      'Compare quotes on the same system size. A cheaper quote for a smaller system is not a cheaper quote.',
    ],
    icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  },
  {
    slug: 'battery',
    label: 'Home battery',
    group: 'energy',
    categorySlugs: ['solar-installers', 'electricians'],
    h1: 'Get home battery quotes from local installers',
    title: 'Home battery quotes from local installers, Albury, Wodonga and the border',
    intro:
      'Tell us whether you already have solar and what you want the battery for, and we pass your request to up to three local installers.',
    hook: 'Thinking about a battery?',
    who: 'battery installers',
    questions: [
      {
        id: 'q1',
        q: 'Do you already have solar panels?',
        options: ['Yes, installed in the last five years', 'Yes, an older system', 'No, I want panels and a battery', 'Not sure'],
      },
      {
        id: 'q2',
        q: 'What do you mostly want it for?',
        options: ['Cutting my power bill', 'Backup when the power goes out', 'Both', 'Going off grid'],
      },
      {
        id: 'q3',
        q: 'What is the property?',
        options: ['House', 'Farm or acreage', 'Townhouse or unit', 'Business or commercial'],
        key: 'property_type',
      },
      OWN,
    ],
    budget: {
      q: 'What budget do you have in mind?',
      bands: [
        { label: 'Under $8,000', mid: 6000 },
        { label: '$8,000 to $12,000', mid: 10000 },
        { label: '$12,000 to $20,000', mid: 16000 },
        { label: 'Over $20,000', mid: 25000 },
        { label: 'Not sure yet', mid: 0 },
      ],
    },
    detailsHint: 'Your current inverter, how often the power drops out, what you would want kept running.',
    tips: [
      'Ask whether the quote includes the battery, the inverter and the installation, or only the battery.',
      'Ask what keeps running during an outage. Not every battery setup provides backup power.',
      'Check whether a rebate applies and who lodges the paperwork for it.',
      'Get the warranty in writing, including how much capacity the battery is guaranteed to keep.',
    ],
    icon: 'M4 7h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm18 3v4M7 10v4m4-4v4',
  },
  {
    slug: 'builder',
    label: 'New home or extension',
    group: 'build',
    categorySlugs: ['builders', 'carpenters', 'shed-builders', 'architects'],
    h1: 'Get quotes from local builders',
    title: 'Builder quotes for new homes and extensions, Albury, Wodonga and the border',
    intro:
      'Tell us what you want built and where it is up to, and we pass your request to up to three licensed builders who work in your town.',
    hook: 'Planning a build?',
    who: 'builders',
    questions: [
      {
        id: 'q1',
        q: 'What are you building?',
        options: ['A new home', 'An extension', 'A granny flat or studio', 'Knock down and rebuild', 'A shed or garage', 'Commercial'],
      },
      {
        id: 'q2',
        q: 'Where are the plans up to?',
        options: ['Plans and approvals done', 'Plans drawn, no approval yet', 'I need a designer', 'Just an idea so far'],
      },
      {
        id: 'q3',
        q: 'Do you have the land?',
        options: ['Yes, I own the land', 'I am buying the land', 'Building on an existing home', 'Not yet'],
      },
    ],
    budget: {
      q: 'What budget are you working to?',
      bands: [
        { label: 'Under $50,000', mid: 35000 },
        { label: '$50,000 to $150,000', mid: 100000 },
        { label: '$150,000 to $400,000', mid: 275000 },
        { label: '$400,000 to $800,000', mid: 600000 },
        { label: 'Over $800,000', mid: 900000 },
        { label: 'Not sure yet', mid: 0 },
      ],
    },
    detailsHint: 'Size, number of bedrooms, the block, council, anything already decided.',
    tips: [
      'Check the builder’s licence on the state register. NSW Fair Trading and Victoria’s building regulator both have free public searches.',
      'Ask for proof of home warranty insurance before you pay a deposit.',
      'Compare fixed price contracts against cost plus contracts carefully. They move risk in opposite directions.',
      'Ask what is excluded. Site costs, driveways and landscaping are often outside the base price.',
    ],
    icon: 'M3 11 12 4l9 7M5 10v10h14V10M10 20v-6h4v6',
  },
  {
    slug: 'renovation',
    label: 'Kitchen or bathroom renovation',
    group: 'build',
    categorySlugs: ['builders', 'cabinet-makers', 'tilers', 'carpenters', 'plumbers'],
    h1: 'Get renovation quotes from local trades',
    title: 'Kitchen and bathroom renovation quotes, Albury, Wodonga and the border',
    intro:
      'Tell us which room and how far you want to go, and we pass your request to up to three local builders and renovators.',
    hook: 'Renovating?',
    who: 'renovators',
    questions: [
      {
        id: 'q1',
        q: 'Which room?',
        options: ['Kitchen', 'Bathroom', 'Laundry', 'Several rooms', 'The whole house'],
      },
      {
        id: 'q2',
        q: 'How big a job is it?',
        options: ['Full strip out and rebuild', 'New cabinets or fixtures, same layout', 'A refresh: paint, tiles, benchtops', 'Not sure, I want advice'],
      },
      {
        id: 'q3',
        q: 'What is the property?',
        options: ['House', 'Townhouse or unit', 'Rental property', 'Business premises'],
        key: 'property_type',
      },
      OWN,
    ],
    budget: {
      q: 'What budget do you have in mind?',
      bands: [
        { label: 'Under $15,000', mid: 10000 },
        { label: '$15,000 to $30,000', mid: 22500 },
        { label: '$30,000 to $60,000', mid: 45000 },
        { label: '$60,000 to $120,000', mid: 90000 },
        { label: 'Over $120,000', mid: 150000 },
        { label: 'Not sure yet', mid: 0 },
      ],
    },
    detailsHint: 'Room size, what you want to keep, any photos or plans you can send later.',
    tips: [
      'Ask who does the plumbing, electrical and waterproofing, and check those trades are licensed too.',
      'Get the waterproofing certificate when a wet area is finished.',
      'Agree the progress payment stages in writing before work starts.',
      'Ask how long the room will be out of action. It matters more for a kitchen or your only bathroom.',
    ],
    icon: 'M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-3Zm3 0V6a2 2 0 0 1 4 0M7 20l-1 2m11-2 1 2',
  },
  {
    slug: 'roofing',
    label: 'Roofing',
    group: 'build',
    categorySlugs: ['roofers', 'gutter-cleaning'],
    h1: 'Get roofing quotes from local roofers',
    title: 'Roofing quotes from local roofers, Albury, Wodonga and the border',
    intro:
      'Tell us about the roof and the job, and we pass your request to up to three local roofers who cover your town.',
    hook: 'Roof needs work?',
    who: 'roofers',
    questions: [
      {
        id: 'q1',
        q: 'What does the roof need?',
        options: ['A full replacement', 'A leak found and fixed', 'Restoration: re-bed, re-point, paint', 'New gutters or downpipes', 'Not sure, I want it inspected'],
      },
      {
        id: 'q2',
        q: 'What is the roof made of?',
        options: ['Colorbond or tin', 'Concrete tiles', 'Terracotta tiles', 'Not sure'],
      },
      {
        id: 'q3',
        q: 'How many storeys?',
        options: ['Single storey', 'Two storeys', 'More than two', 'Commercial or shed'],
      },
    ],
    budget: {
      q: 'What budget do you have in mind?',
      bands: [
        { label: 'Under $2,000', mid: 1500 },
        { label: '$2,000 to $10,000', mid: 6000 },
        { label: '$10,000 to $25,000', mid: 17500 },
        { label: '$25,000 to $50,000', mid: 37500 },
        { label: 'Over $50,000', mid: 60000 },
        { label: 'Not sure yet', mid: 0 },
      ],
    },
    detailsHint: 'Where the leak shows, age of the roof, any storm or hail damage, insurance claims.',
    tips: [
      'Ask whether the quote includes removing and disposing of the old roof.',
      'If the house was built before 1990, ask how they check for asbestos before they start.',
      'Ask for photos of the damage. A good roofer will show you what they found up there.',
      'Check how long the workmanship warranty runs, separate from the materials warranty.',
    ],
    icon: 'M2 14 12 6l10 8M5 12v8h14v-8M9 20v-4h6v4',
  },
  {
    slug: 'air-conditioning',
    label: 'Air conditioning',
    group: 'energy',
    categorySlugs: ['air-conditioning', 'electricians'],
    h1: 'Get air conditioning quotes from local installers',
    title: 'Air conditioning quotes: split and ducted systems, Albury, Wodonga and the border',
    intro:
      'Tell us what you want cooled and heated, and we pass your request to up to three local air conditioning installers.',
    hook: 'Need air conditioning?',
    who: 'air conditioning installers',
    questions: [
      {
        id: 'q1',
        q: 'What kind of system?',
        options: ['A split system for one room', 'Split systems for several rooms', 'Ducted for the whole house', 'Repair or service an existing system', 'Not sure, I want advice'],
      },
      {
        id: 'q2',
        q: 'How many rooms or living areas?',
        options: ['One', 'Two or three', 'Four to six', 'Seven or more'],
      },
      {
        id: 'q3',
        q: 'What is the property?',
        options: ['House', 'Townhouse or unit', 'Business or commercial', 'Farm or acreage'],
        key: 'property_type',
      },
      OWN,
    ],
    budget: {
      q: 'What budget do you have in mind?',
      bands: [
        { label: 'Under $3,000', mid: 2200 },
        { label: '$3,000 to $8,000', mid: 5500 },
        { label: '$8,000 to $15,000', mid: 11500 },
        { label: '$15,000 to $30,000', mid: 22500 },
        { label: 'Over $30,000', mid: 35000 },
        { label: 'Not sure yet', mid: 0 },
      ],
    },
    detailsHint: 'Room sizes, ceiling space, existing heating you want replaced.',
    tips: [
      'Ask for the unit’s brand, model and capacity in kilowatts, and how they sized it for the room.',
      'Check the installer holds a refrigerant handling licence. It is a national requirement.',
      'Ask whether the quote includes the electrical work and any switchboard upgrade.',
      'For ducted systems, ask about zoning so you are not cooling rooms nobody is in.',
    ],
    icon: 'M12 2v20M4.9 7l14.2 10M4.9 17 19.1 7M9 3l3 2 3-2M9 21l3-2 3 2',
  },
  {
    slug: 'landscaping',
    label: 'Landscaping',
    group: 'outdoors',
    categorySlugs: ['landscapers', 'concreters', 'fencing-contractors', 'earthmoving', 'tree-services'],
    h1: 'Get landscaping quotes from local landscapers',
    title: 'Landscaping quotes from local landscapers, Albury, Wodonga and the border',
    intro:
      'Tell us about the yard and what you want done, and we pass your request to up to three local landscapers.',
    hook: 'Doing the yard?',
    who: 'landscapers',
    questions: [
      {
        id: 'q1',
        q: 'What do you want done?',
        options: ['A full backyard makeover', 'Paving, decking or a patio', 'Retaining walls', 'Turf, gardens and irrigation', 'A design only'],
      },
      {
        id: 'q2',
        q: 'How big is the area?',
        options: ['A small courtyard', 'An average backyard', 'A large yard', 'Acreage'],
      },
      {
        id: 'q3',
        q: 'Is the site easy to get machinery into?',
        options: ['Yes, there is side access', 'Tight access only', 'No access, it is all by hand', 'Not sure'],
      },
      OWN,
    ],
    budget: {
      q: 'What budget do you have in mind?',
      bands: [
        { label: 'Under $5,000', mid: 3500 },
        { label: '$5,000 to $15,000', mid: 10000 },
        { label: '$15,000 to $40,000', mid: 27500 },
        { label: '$40,000 to $80,000', mid: 60000 },
        { label: 'Over $80,000', mid: 100000 },
        { label: 'Not sure yet', mid: 0 },
      ],
    },
    detailsHint: 'Slope, drainage problems, plants or trees you want kept, a plan if you have one.',
    tips: [
      'Retaining walls over a certain height often need engineering and council approval. Ask before you sign.',
      'Ask how drainage is handled. It is the part that costs most to fix later.',
      'Ask whether removing soil and green waste is included.',
      'Get a staged plan if the budget is tight. A good landscaper will design it to be built in parts.',
    ],
    icon: 'M12 22v-8m0 0c-4 0-7-3-7-7 4 0 7 3 7 7Zm0 0c4 0 7-3 7-7-4 0-7 3-7 7Z',
  },
  {
    slug: 'pool',
    label: 'Pool',
    group: 'outdoors',
    categorySlugs: ['pool-services', 'landscapers', 'concreters', 'fencing-contractors'],
    h1: 'Get pool quotes from local pool builders and services',
    title: 'Pool quotes: new pools, renovations and servicing, Albury, Wodonga and the border',
    intro:
      'Tell us about the pool you want or the one you have, and we pass your request to up to three local pool businesses.',
    hook: 'Thinking about a pool?',
    who: 'pool businesses',
    questions: [
      {
        id: 'q1',
        q: 'What do you need?',
        options: ['A new in-ground pool', 'An above-ground pool', 'Renovate or resurface a pool', 'Pool fencing or heating', 'Servicing or repairs'],
      },
      {
        id: 'q2',
        q: 'What kind of pool?',
        options: ['Fibreglass', 'Concrete', 'Plunge pool', 'Not sure yet'],
      },
      {
        id: 'q3',
        q: 'How is the backyard access?',
        options: ['Wide side access', 'Tight access', 'Crane needed', 'Not sure'],
      },
      OWN,
    ],
    budget: {
      q: 'What budget do you have in mind?',
      bands: [
        { label: 'Under $10,000', mid: 7000 },
        { label: '$10,000 to $30,000', mid: 20000 },
        { label: '$30,000 to $60,000', mid: 45000 },
        { label: '$60,000 to $100,000', mid: 80000 },
        { label: 'Over $100,000', mid: 120000 },
        { label: 'Not sure yet', mid: 0 },
      ],
    },
    detailsHint: 'Size you have in mind, slope of the yard, fencing, heating, anything already decided.',
    tips: [
      'Pool fencing has to meet the safety standard and the pool has to be registered with your council. Ask who arranges it.',
      'Ask what the quote leaves out: excavation of rock, soil removal, fencing and landscaping are common extras.',
      'Ask about running costs: pump, heating and chemicals add up every year.',
      'Get the shell warranty and the workmanship warranty in writing.',
    ],
    icon: 'M2 16c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M2 20c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M8 13V5a2 2 0 0 1 4 0m4 8V5a2 2 0 0 0-4 0',
  },
  {
    slug: 'concreting',
    label: 'Concreting',
    group: 'outdoors',
    categorySlugs: ['concreters', 'earthmoving'],
    h1: 'Get concreting quotes from local concreters',
    title: 'Concreting quotes: driveways, slabs and paths, Albury, Wodonga and the border',
    intro:
      'Tell us what you need poured and roughly how big, and we pass your request to up to three local concreters.',
    hook: 'Need concrete poured?',
    who: 'concreters',
    questions: [
      {
        id: 'q1',
        q: 'What is the job?',
        options: ['A driveway', 'A shed or garage slab', 'A house slab', 'Paths or a patio', 'Decorative or exposed aggregate'],
      },
      {
        id: 'q2',
        q: 'Roughly how big?',
        options: ['Under 30 square metres', '30 to 80 square metres', '80 to 150 square metres', 'Over 150 square metres', 'Not sure'],
      },
      {
        id: 'q3',
        q: 'Is there old concrete to remove?',
        options: ['No, it is a clear site', 'Yes, old concrete to break up', 'Needs levelling or excavation', 'Not sure'],
      },
    ],
    budget: {
      q: 'What budget do you have in mind?',
      bands: [
        { label: 'Under $3,000', mid: 2200 },
        { label: '$3,000 to $8,000', mid: 5500 },
        { label: '$8,000 to $20,000', mid: 14000 },
        { label: 'Over $20,000', mid: 25000 },
        { label: 'Not sure yet', mid: 0 },
      ],
    },
    detailsHint: 'Measurements if you have them, finish you want, access for a concrete truck.',
    tips: [
      'Ask for the slab thickness, the concrete strength and the reinforcing in writing.',
      'Ask whether site preparation and removing old concrete are in the price.',
      'Agree how cracking is handled. Control joints should be part of the plan, not an afterthought.',
      'Check whether a council permit is needed, particularly for driveway crossovers.',
    ],
    icon: 'M3 7h18v12H3zM3 12h18M3 17h18M8 7v5m8-5v5m-4 0v5',
  },
  {
    slug: 'fencing',
    label: 'Fencing',
    group: 'outdoors',
    categorySlugs: ['fencing-contractors'],
    h1: 'Get fencing quotes from local fencers',
    title: 'Fencing quotes: Colorbond, timber, pool and rural, Albury, Wodonga and the border',
    intro:
      'Tell us what kind of fence and roughly how long, and we pass your request to up to three local fencing contractors.',
    hook: 'Need a fence?',
    who: 'fencing contractors',
    questions: [
      {
        id: 'q1',
        q: 'What kind of fence?',
        options: ['Colorbond', 'Timber paling', 'Pool fence', 'Rural or farm fencing', 'Gates only'],
      },
      {
        id: 'q2',
        q: 'Roughly how long?',
        options: ['Under 20 metres', '20 to 50 metres', '50 to 100 metres', 'Over 100 metres', 'Not sure'],
      },
      {
        id: 'q3',
        q: 'Is there an old fence to remove?',
        options: ['Yes', 'No', 'Shared with a neighbour', 'Not sure'],
      },
    ],
    budget: {
      q: 'What budget do you have in mind?',
      bands: [
        { label: 'Under $3,000', mid: 2200 },
        { label: '$3,000 to $8,000', mid: 5500 },
        { label: '$8,000 to $20,000', mid: 14000 },
        { label: 'Over $20,000', mid: 25000 },
        { label: 'Not sure yet', mid: 0 },
      ],
    },
    detailsHint: 'Height, colour, slope, whether a neighbour is sharing the cost.',
    tips: [
      'If the fence is on a boundary, talk to your neighbour first. Dividing fence costs are usually shared.',
      'Ask whether removing and disposing of the old fence is included.',
      'Pool fences must meet the safety standard. Ask the fencer to confirm theirs does.',
      'Older fences can contain asbestos sheeting. Ask how it is handled if it is found.',
    ],
    icon: 'M4 21V6l2-2 2 2v15m2 0V6l2-2 2 2v15m2 0V6l2-2 2 2v15M4 10h16M4 16h16',
  },
  {
    slug: 'home-loan',
    label: 'Home loan',
    group: 'property',
    categorySlugs: ['mortgage-brokers'],
    h1: 'Talk to a local mortgage broker',
    title: 'Local mortgage brokers for home loans and refinancing, Albury, Wodonga and the border',
    intro:
      'Tell us what the loan is for and roughly how much, and we pass your request to up to three local mortgage brokers.',
    hook: 'Buying or refinancing?',
    who: 'mortgage brokers',
    questions: [
      {
        id: 'q1',
        q: 'What is the loan for?',
        options: ['My first home', 'My next home', 'An investment property', 'Refinancing', 'A construction loan'],
      },
      {
        id: 'q2',
        q: 'Where are you up to?',
        options: ['I have found a property', 'Looking now', 'Getting pre-approval first', 'Just working out what I can borrow'],
      },
      {
        id: 'q3',
        q: 'How are you earning?',
        options: ['Employed, full time', 'Employed, part time or casual', 'Self-employed', 'Other'],
      },
    ],
    budget: {
      q: 'Roughly how much do you want to borrow?',
      bands: [
        { label: 'Under $300,000', mid: 250000 },
        { label: '$300,000 to $500,000', mid: 400000 },
        { label: '$500,000 to $750,000', mid: 625000 },
        { label: '$750,000 to $1 million', mid: 875000 },
        { label: 'Over $1 million', mid: 1200000 },
        { label: 'Not sure yet', mid: 0 },
      ],
    },
    detailsHint: 'Deposit you have saved, whether you are buying with someone, anything that makes it unusual.',
    tips: [
      'Ask the broker how many lenders they compare and how they are paid.',
      'Brokers must hold an Australian Credit Licence or be an authorised credit representative. Ask for the number.',
      'Compare the comparison rate, not just the advertised rate.',
      'Ask about first home buyer schemes and stamp duty concessions in your state.',
    ],
    icon: 'M8 10a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm3.5 1.5 8-8M17 6l2 2m-4 0 2 2',
  },
  {
    slug: 'selling',
    label: 'Selling a property',
    group: 'property',
    categorySlugs: ['real-estate-agents', 'conveyancers'],
    h1: 'Find a local agent to sell your property',
    title: 'Selling a property? Compare local real estate agents, Albury, Wodonga and the border',
    intro:
      'Tell us about the property and your timing, and we pass your request to up to three local agents for an appraisal.',
    hook: 'Thinking of selling?',
    who: 'real estate agents',
    questions: [
      {
        id: 'q1',
        q: 'What are you selling?',
        options: ['A house', 'A unit or townhouse', 'Land', 'Rural or acreage', 'Commercial'],
        key: 'property_type',
      },
      {
        id: 'q2',
        q: 'When do you want to sell?',
        options: ['As soon as possible', 'In the next three months', 'In three to six months', 'I just want an appraisal'],
      },
      {
        id: 'q3',
        q: 'Is anyone living in it?',
        options: ['I live in it', 'It has tenants', 'It is empty', 'It is land'],
      },
    ],
    budget: {
      q: 'Roughly what do you think it is worth?',
      bands: [
        { label: 'Under $400,000', mid: 350000 },
        { label: '$400,000 to $600,000', mid: 500000 },
        { label: '$600,000 to $900,000', mid: 750000 },
        { label: '$900,000 to $1.5 million', mid: 1200000 },
        { label: 'Over $1.5 million', mid: 1700000 },
        { label: 'Not sure', mid: 0 },
      ],
    },
    detailsHint: 'Bedrooms, land size, recent work done, anything an agent should see.',
    tips: [
      'Ask every agent for recent comparable sales, not just a price.',
      'Compare commission and marketing costs separately. Marketing is often charged on top.',
      'Ask how long their recent listings took to sell and how far below the asking price they went.',
      'Read the agency agreement for the length of the exclusive period before you sign.',
    ],
    icon: 'M5 21V3m0 2h12l-2 4 2 4H5',
  },
  {
    slug: 'electrician',
    label: 'Electrician',
    group: 'trades',
    categorySlugs: ['electricians'],
    h1: 'Get quotes from local electricians',
    title: 'Electrician quotes from licensed local electricians, Albury, Wodonga and the border',
    intro:
      'Tell us what needs doing and we pass your request to up to three licensed electricians who cover your town.',
    hook: 'Need an electrician?',
    who: 'electricians',
    questions: [
      {
        id: 'q1',
        q: 'What is the job?',
        options: ['Switchboard upgrade', 'EV charger', 'Rewiring', 'Lights and power points', 'A fault or repair', 'New build or renovation'],
      },
      {
        id: 'q2',
        q: 'What is the property?',
        options: ['House', 'Townhouse or unit', 'Business or commercial', 'Farm or acreage'],
        key: 'property_type',
      },
      {
        id: 'q3',
        q: 'How urgent is it?',
        options: ['Something is not working now', 'This week', 'In the next month', 'Planning ahead'],
      },
    ],
    budget: {
      q: 'What budget do you have in mind?',
      bands: [
        { label: 'Under $1,000', mid: 700 },
        { label: '$1,000 to $3,000', mid: 2000 },
        { label: '$3,000 to $10,000', mid: 6500 },
        { label: 'Over $10,000', mid: 12000 },
        { label: 'Not sure yet', mid: 0 },
      ],
    },
    detailsHint: 'What is not working, the age of the house, the car if it is an EV charger.',
    tips: [
      'Ask for the electrician’s licence number and check it on the state register.',
      'You should get a certificate of compliance for electrical work when the job is done.',
      'For an EV charger, ask whether your switchboard and supply can carry it before you buy one.',
      'Ask whether the quote is fixed or by the hour.',
    ],
    icon: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  },
  {
    slug: 'plumber',
    label: 'Plumber',
    group: 'trades',
    categorySlugs: ['plumbers'],
    h1: 'Get quotes from local plumbers',
    title: 'Plumber quotes from licensed local plumbers, Albury, Wodonga and the border',
    intro:
      'Tell us what needs doing and we pass your request to up to three licensed plumbers who cover your town.',
    hook: 'Need a plumber?',
    who: 'plumbers',
    questions: [
      {
        id: 'q1',
        q: 'What is the job?',
        options: ['Hot water system', 'Blocked drain', 'Gas fitting', 'Bathroom or kitchen plumbing', 'A leak or repair', 'New build'],
      },
      {
        id: 'q2',
        q: 'What is the property?',
        options: ['House', 'Townhouse or unit', 'Business or commercial', 'Farm or acreage'],
        key: 'property_type',
      },
      {
        id: 'q3',
        q: 'How urgent is it?',
        options: ['It is an emergency', 'This week', 'In the next month', 'Planning ahead'],
      },
    ],
    budget: {
      q: 'What budget do you have in mind?',
      bands: [
        { label: 'Under $1,000', mid: 700 },
        { label: '$1,000 to $3,000', mid: 2000 },
        { label: '$3,000 to $10,000', mid: 6500 },
        { label: 'Over $10,000', mid: 12000 },
        { label: 'Not sure yet', mid: 0 },
      ],
    },
    detailsHint: 'What is happening, the type of hot water system, where the drain backs up.',
    tips: [
      'Ask for the plumber’s licence number and check it on the state register.',
      'For a new hot water system, compare running costs as well as the price of the unit.',
      'Gas work needs a gas fitting licence and a compliance certificate when it is done.',
      'Ask about call out fees before the plumber arrives.',
    ],
    icon: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z',
  },
  {
    slug: 'painter',
    label: 'Painter',
    group: 'trades',
    categorySlugs: ['painters'],
    h1: 'Get quotes from local painters',
    title: 'Painter quotes for houses and businesses, Albury, Wodonga and the border',
    intro:
      'Tell us what you want painted and we pass your request to up to three local painters.',
    hook: 'Need a painter?',
    who: 'painters',
    questions: [
      {
        id: 'q1',
        q: 'What needs painting?',
        options: ['Inside', 'Outside', 'Inside and outside', 'A roof', 'A business or commercial job'],
      },
      {
        id: 'q2',
        q: 'How big is it?',
        options: ['One or two rooms', 'Most of the house', 'The whole house', 'Not sure'],
      },
      {
        id: 'q3',
        q: 'What is the property?',
        options: ['House', 'Townhouse or unit', 'Rental property', 'Business premises'],
        key: 'property_type',
      },
    ],
    budget: {
      q: 'What budget do you have in mind?',
      bands: [
        { label: 'Under $2,000', mid: 1500 },
        { label: '$2,000 to $6,000', mid: 4000 },
        { label: '$6,000 to $15,000', mid: 10500 },
        { label: 'Over $15,000', mid: 18000 },
        { label: 'Not sure yet', mid: 0 },
      ],
    },
    detailsHint: 'Number of rooms, ceiling height, condition of the surfaces, colours if chosen.',
    tips: [
      'Ask which paint brand and range is quoted, and how many coats.',
      'Ask what preparation is included. It is most of the work in a good paint job.',
      'If the house was built before 1970, ask how they test for lead paint.',
      'Get the start date and the expected number of days in writing.',
    ],
    icon: 'M3 3h15v6H3zM18 6h3v5h-9v3m-2 0h4v7h-4z',
  },
  {
    slug: 'removalist',
    label: 'Removalist',
    group: 'trades',
    categorySlugs: ['removalists'],
    h1: 'Get quotes from local removalists',
    title: 'Removalist quotes for local and interstate moves, Albury, Wodonga and the border',
    intro:
      'Tell us where you are moving and how much there is, and we pass your request to up to three local removalists.',
    hook: 'Moving house?',
    who: 'removalists',
    questions: [
      {
        id: 'q1',
        q: 'What kind of move?',
        options: ['Local, in the same area', 'Regional, a few hours away', 'Interstate', 'An office or business'],
      },
      {
        id: 'q2',
        q: 'How much is there to move?',
        options: ['A few items', 'A one or two bedroom home', 'A three bedroom home', 'Four bedrooms or more'],
      },
      {
        id: 'q3',
        q: 'Do you want packing done?',
        options: ['Yes, pack everything', 'Fragile items only', 'No, I will pack', 'Not sure'],
      },
    ],
    budget: {
      q: 'What budget do you have in mind?',
      bands: [
        { label: 'Under $1,000', mid: 700 },
        { label: '$1,000 to $3,000', mid: 2000 },
        { label: '$3,000 to $6,000', mid: 4500 },
        { label: 'Over $6,000', mid: 7500 },
        { label: 'Not sure yet', mid: 0 },
      ],
    },
    detailsHint: 'Moving date, where to, stairs or tight access at either end.',
    tips: [
      'Ask whether the quote is fixed or by the hour, and what happens if the move runs long.',
      'Ask what insurance covers your belongings in transit.',
      'Get the moving date and arrival window confirmed in writing.',
      'Ask whether stairs, long carries or a piano cost extra.',
    ],
    icon: 'M1 6h13v10H1zm13 4h4l3 3v3h-7M5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  },
];

export const TIMEFRAMES = ['As soon as possible', 'Within a month', 'In one to three months', 'In three to six months', 'Just researching'];
export const CONTACT_PREFS = ['Phone call', 'Text message', 'Email'];
export const BEST_TIMES = ['Morning', 'Afternoon', 'Evening', 'Any time'];

const BY_SLUG = new Map(QUOTE_SERVICES.map((s) => [s.slug, s]));
export const getQuoteService = (slug: string) => BY_SLUG.get(slug);

/**
 * Which service a category page should offer. A category maps to the service
 * that lists it first, so the electricians page offers "electrician" rather
 * than solar, and the cabinet makers page offers a renovation.
 */
const FOR_CATEGORY = new Map<string, QuoteService>();
for (const s of QUOTE_SERVICES) {
  const first = s.categorySlugs[0];
  if (!FOR_CATEGORY.has(first)) FOR_CATEGORY.set(first, s);
}
for (const s of QUOTE_SERVICES) {
  for (const c of s.categorySlugs) if (!FOR_CATEGORY.has(c)) FOR_CATEGORY.set(c, s);
}
export const quoteServiceForCategorySlug = (categorySlug: string) => FOR_CATEGORY.get(categorySlug);

/**
 * The offer to businesses that buy quote leads, on /leads-for-business/.
 *
 * Pay per lead and nothing else: no monthly fee, no contract, no minimum. The
 * price per lead is agreed with each business before anything is sent, so it
 * is deliberately not printed here. Change a number below and the page, its
 * FAQ and its structured data change with it.
 */
export const LEAD_OFFER = {
  /** Leads sent free before a business pays for any. */
  freeLeads: 3,
  /** Days a business has to report a bad lead for a full credit. */
  creditDays: 7,
  /** No lead goes to more businesses than this. */
  maxBusinessesPerLead: 3,
} as const;
