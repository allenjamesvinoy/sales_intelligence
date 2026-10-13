import type { Lead, LeadsResponse } from '../types';
import type { Api } from './index';

/**
 * In-browser stand-in for the backend, used when VITE_API_URL is not set.
 * Every contractor here is fictional. Lead state is kept by the store in
 * localStorage, so the write calls have nothing to do.
 */


const LEADS: Lead[] = [
  {
    id: 'summit-ridge-roofing',
    rank: 1,
    name: 'Summit Ridge Roofing',
    location: 'Ithaca, NY',
    distanceMi: 12.4,
    priority: 'high',
    reason: 'Residential roofing contractor within the target territory, with GAF certification and complete roof-replacement services.',
    categories: ['Residential shingles', 'Underlayment', 'Ventilation'],
    nextAction: 'Call the owner about spring replacement volume',
    overview: {
      businessType: 'Residential roofing contractor',
      address: '418 Elm Street, Ithaca, NY',
      services: ['Full roof replacement', 'Repairs', 'Gutters'],
      rating: 4.7,
      reviewCount: 212,
      yearsInBusiness: 14,
      certifications: ['GAF Master Elite'],
    },
    evidence: [
      { fact: 'GAF Master Elite certified contractor', source: 'GAF contractor directory', url: 'https://example.com/gaf-directory', date: 'Oct 10, 2026' },
      { fact: '212 reviews, 4.7 average, most mention full replacements', source: 'Google Business Profile', url: 'https://example.com/reviews', date: 'Oct 10, 2026' },
      { fact: 'Website lists full roof replacement and ventilation upgrades', source: 'Company website', url: 'https://summitridgeroofing.example', date: 'Oct 9, 2026' },
    ],
    productFit: [
      { category: 'Residential shingles', level: 'high', reason: 'Full replacements are their main service and they install GAF systems.', question: 'How many replacements do you run in a typical month?' },
      { category: 'Underlayment', level: 'high', reason: 'Master Elite warranties require a full system, including underlayment.', question: 'Which underlayment do you spec today?' },
      { category: 'Ventilation', level: 'medium', reason: 'Ventilation upgrades are listed as an add-on service.', question: 'Do you quote ridge vents on every replacement?' },
    ],
    contact: {
      person: { name: 'Dana Whitfield', role: 'Owner', verified: true, source: 'State business filing' },
      phone: '(607) 555-0142',
      email: 'office@summitridgeroofing.example',
      website: 'https://summitridgeroofing.example',
    },
    opener: 'I work with GAF-certified roofers around Ithaca, and I wanted to see how your spring replacement schedule is shaping up.',
    questions: [
      'Where do you buy shingles and underlayment today?',
      'How far out are you booked for replacements?',
      'Who signs off on supplier changes?',
    ],
  },
  {
    id: 'lakeshore-roof-and-gutter',
    rank: 2,
    name: 'Lakeshore Roof & Gutter',
    location: 'Trumansburg, NY',
    distanceMi: 15.8,
    priority: 'high',
    reason: 'Growing residential roofer that added a second crew this year and advertises asphalt and metal roofing.',
    categories: ['Residential shingles', 'Metal roofing', 'Gutters'],
    nextAction: 'Ask the main line for the person who orders materials',
    overview: {
      businessType: 'Residential roofing and gutters',
      address: '22 Main Street, Trumansburg, NY',
      services: ['Asphalt roofing', 'Metal roofing', 'Seamless gutters'],
      rating: 4.8,
      reviewCount: 96,
      yearsInBusiness: 6,
      certifications: ['Owens Corning Preferred'],
    },
    evidence: [
      { fact: 'Job posting for a second roofing crew lead', source: 'Indeed', url: 'https://example.com/jobs', date: 'Sep 28, 2026' },
      { fact: 'Website advertises asphalt and standing-seam metal roofs', source: 'Company website', url: 'https://lakeshoreroof.example', date: 'Oct 9, 2026' },
    ],
    productFit: [
      { category: 'Residential shingles', level: 'high', reason: 'Asphalt replacements are the first service listed.', question: 'What share of your jobs are asphalt?' },
      { category: 'Metal roofing', level: 'medium', reason: 'Metal roofs are advertised, but no completed projects are shown.', question: 'How many metal jobs did you do this year?' },
      { category: 'Gutters', level: 'medium', reason: 'Seamless gutters are a listed service.', question: 'Do you form gutters on site or buy them made?' },
    ],
    contact: {
      askFor: 'owner or the person who orders materials',
      phone: '(607) 555-0187',
      website: 'https://lakeshoreroof.example',
    },
    opener: 'I saw you are adding a second crew, and I wanted to see whether your supply is keeping up with the extra volume.',
    questions: [
      'Who handles material orders for both crews?',
      'Are you seeing any delays from your current supplier?',
    ],
  },
  {
    id: 'cayuga-exteriors',
    rank: 3,
    name: 'Cayuga Exteriors',
    location: 'Auburn, NY',
    distanceMi: 38.2,
    priority: 'medium',
    reason: 'Exterior remodeler with roofing listed among siding and windows; roofing share is unclear from public data.',
    categories: ['Residential shingles', 'Leak barriers'],
    nextAction: 'Confirm how much of their work is roofing',
    overview: {
      businessType: 'Exterior remodeling',
      services: ['Siding', 'Windows', 'Roofing'],
      rating: 4.3,
      reviewCount: 41,
    },
    evidence: [
      { fact: 'Roofing is the third of three services on their website', source: 'Company website', url: 'https://cayugaexteriors.example', date: 'Oct 8, 2026' },
    ],
    productFit: [
      { category: 'Residential shingles', level: 'medium', reason: 'Roofing is offered, but photos show mostly siding work.', question: 'How many roofs did you replace last year?' },
      { category: 'Leak barriers', level: 'unknown', reason: 'No public evidence either way.', question: 'Do you install ice and water shield on every roof?' },
    ],
    contact: {
      person: { name: 'Marcus Bell', role: 'Operations manager', verified: false, source: 'LinkedIn' },
      phone: '(315) 555-0119',
      website: 'https://cayugaexteriors.example',
    },
    opener: 'I work with exterior contractors around Auburn and wanted to learn how roofing fits into your mix.',
    questions: [
      'Is roofing growing as a share of your work?',
      'Who decides which roofing brands you install?',
    ],
  },
  {
    id: 'finger-lakes-exteriors',
    rank: 4,
    name: 'Finger Lakes Exteriors',
    location: 'Cortland, NY',
    distanceMi: 21.0,
    priority: 'medium',
    reason: 'Mixed residential and siding work; roofing share unclear from public data.',
    categories: ['Residential shingles', 'Leak barriers'],
    nextAction: 'Call the main line and ask who orders materials',
    overview: {
      businessType: 'Residential exteriors',
      address: '9 Clinton Avenue, Cortland, NY',
      services: ['Roofing', 'Siding'],
      rating: 4.5,
      reviewCount: 58,
      yearsInBusiness: 9,
    },
    evidence: [
      { fact: 'Lists roofing and siding as core services', source: 'Company website', url: 'https://flexteriors.example', date: 'Oct 7, 2026' },
      { fact: 'Recent reviews mention two roof replacements', source: 'Google Business Profile', url: 'https://example.com/reviews', date: 'Oct 7, 2026' },
    ],
    productFit: [
      { category: 'Residential shingles', level: 'medium', reason: 'Some replacements in recent reviews.', question: 'How many roofs do you do in a month?' },
      { category: 'Leak barriers', level: 'unknown', reason: 'No public evidence either way.', question: 'Which leak barrier do you use today?' },
    ],
    contact: {
      askFor: 'owner or the person who orders materials',
      phone: '(607) 555-0163',
      website: 'https://flexteriors.example',
    },
    questions: [
      'Who orders roofing materials?',
      'Are you happy with your current supplier’s delivery times?',
    ],
  },
  {
    id: 'tioga-roof-co',
    rank: 5,
    name: 'Tioga Roof Co.',
    location: 'Owego, NY',
    distanceMi: 34.8,
    priority: 'low',
    reason: 'Small repair-focused roofer at the edge of the territory.',
    categories: ['Repair materials'],
    nextAction: 'Ask whether they take on full replacements',
    overview: {
      businessType: 'Roofing repairs',
      address: '140 Front Street, Owego, NY',
      services: ['Roof repairs', 'Inspections'],
      rating: 4.6,
      reviewCount: 23,
      yearsInBusiness: 3,
    },
    evidence: [
      { fact: 'Website lists repairs and inspections only', source: 'Company website', url: 'https://tiogaroof.example', date: 'Oct 6, 2026' },
    ],
    productFit: [],
    contact: {
      phone: '(607) 555-0104',
      website: 'https://tiogaroof.example',
    },
    questions: [
      'Do you ever take on full replacements?',
      'Where do you buy repair materials today?',
    ],
  },
  {
    id: 'hilltop-roofing-services',
    rank: 6,
    name: 'Hilltop Roofing Services',
    location: 'Dryden, NY',
    distanceMi: 9.6,
    priority: 'low',
    reason: 'New listing with little public history; worth a short call to qualify.',
    categories: [],
    nextAction: 'Qualify: residential, commercial, or both',
    overview: {
      businessType: 'Roofing contractor',
    },
    evidence: [
      { fact: 'Registered as a business in August 2026', source: 'NY Department of State', url: 'https://example.com/dos', date: 'Oct 5, 2026' },
    ],
    productFit: [],
    contact: {},
    questions: [
      'What kind of roofing work do you focus on?',
      'Who supplies you today?',
    ],
  },
];

export const mockApi: Api = {
  // The delay keeps the loading state visible, as a real request would.
  getLeads: () =>
    new Promise<LeadsResponse>((resolve) => setTimeout(() => resolve({ updatedAt: new Date().toISOString(), leads: LEADS }), 400)),
  updateStage: async () => {},
  recordActivity: async () => {},
};
