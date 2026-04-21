import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import SEO from '@/components/SEO';
import { usePricing, centsToDisplay } from '@/hooks/usePricing';
import { diagnosticService, authService, jobService, paymentService, fetchAPI, connectJobSocket, accountService, estimateService, type DiagnosisPayload, type JobStatusResponse, type ProviderResponseItem, type HomeData, type CostEstimate } from '@/services/api';
import AvatarDropdown from '@/components/AvatarDropdown';
import EstimateCard from '@/components/EstimateCard';
import EstimateBadge from '@/components/EstimateBadge';
import HomieOutreachLive, { type OutreachStatus, type LogEntry } from '@/components/HomieOutreachLive';
import InlineVoicePanel from '@/components/InlineVoicePanel';
import VideoChatPanel from '@/components/VideoChatPanel';
import { primeAudio } from '@/components/audioUnlocker';

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';
const DIM = '#6B6560';
const BORDER = 'rgba(0,0,0,.08)';
const AMBER = '#EF9F27';

/* -- Pros-nearby count (simulated local supply by category) --
   Mirrors the design's PROS_NEARBY map — deterministic per category so
   the badge below the dispatch brief shows a concrete "X pros available
   near <zip>" reassurance without hitting the discovery API. Falls back
   to 12 for anything unmapped. Replace with a real /api/v1/providers
   count endpoint when the data pipeline is ready. */
const PROS_NEARBY_BY_GROUP: Record<string, number> = {
  Plumbing: 18,
  Electrical: 14,
  HVAC: 11,
  'Appliance Repair': 9,
  Roofing: 7,
  'Roofing & Exterior': 7,
  Handyman: 26,
  'Handyman & Structural': 26,
  'Garage Door': 13,
  Locksmith: 8,
  'Locksmith & Security': 8,
  Cleaning: 22,
  'House Cleaning': 22,
  'Outdoor & Landscaping': 15,
  Landscaping: 15,
  'Pool & Spa': 10,
  'Pest Control': 8,
  Painting: 17,
  'Painting & Flooring': 17,
  Remodeling: 12,
  'Moving & Hauling': 14,
  Photography: 9,
};
function prosNearbyForGroup(label: string | null | undefined): number {
  if (!label) return 12;
  return PROS_NEARBY_BY_GROUP[label] ?? 12;
}

/* -- Category tree: top-level groups → subcategories -- */
interface SubCat { id: string; icon: string; label: string }
interface CatGroup { icon: string; label: string; type: 'repair' | 'service'; subs: SubCat[] }

const CATEGORY_TREE: CatGroup[] = [
  // ── Repair ──
  { icon: '🔧', label: 'Plumbing', type: 'repair', subs: [
    { id: 'plumbing', icon: '🔧', label: 'General Plumbing' },
    { id: 'septic_sewer', icon: '🕳️', label: 'Septic & Sewer' },
    { id: 'water_heater', icon: '🔥', label: 'Water Heater' },
    { id: 'sprinkler_irrigation', icon: '💦', label: 'Sprinkler & Irrigation' },
  ]},
  { icon: '⚡', label: 'Electrical', type: 'repair', subs: [
    { id: 'electrical', icon: '⚡', label: 'General Electrical' },
    { id: 'generator_install', icon: '🔋', label: 'Generator Install' },
    { id: 'ev_charger_install', icon: '🔌', label: 'EV Charger Install' },
    { id: 'solar', icon: '☀️', label: 'Solar' },
  ]},
  { icon: '❄️', label: 'HVAC', type: 'repair', subs: [
    { id: 'hvac', icon: '❄️', label: 'AC & Heating' },
    { id: 'chimney', icon: '🏠', label: 'Chimney' },
    { id: 'insulation', icon: '🧱', label: 'Insulation' },
  ]},
  { icon: '🍳', label: 'Appliance', type: 'repair', subs: [
    { id: 'appliance', icon: '🍳', label: 'Appliance Repair' },
  ]},
  { icon: '🏠', label: 'Roofing & Exterior', type: 'repair', subs: [
    { id: 'roofing', icon: '🏠', label: 'Roofing' },
    { id: 'gutter', icon: '🌧️', label: 'Gutter Cleaning' },
    { id: 'siding', icon: '🪵', label: 'Siding' },
    { id: 'window_door_install', icon: '🪟', label: 'Window & Door Install' },
  ]},
  { icon: '🔨', label: 'Handyman & Structural', type: 'repair', subs: [
    { id: 'general', icon: '🔨', label: 'Handyman' },
    { id: 'drywall', icon: '🪧', label: 'Drywall' },
    { id: 'concrete', icon: '🧱', label: 'Concrete' },
    { id: 'masonry', icon: '🏗️', label: 'Masonry' },
    { id: 'foundation_waterproofing', icon: '💧', label: 'Foundation & Waterproofing' },
    { id: 'welding_metal_work', icon: '⚒️', label: 'Welding & Metal Work' },
    { id: 'furniture_assembly', icon: '🪑', label: 'Furniture Assembly' },
    { id: 'tv_mounting', icon: '📺', label: 'TV Mounting' },
  ]},
  { icon: '🚨', label: 'Garage Door', type: 'repair', subs: [
    { id: 'garage_door', icon: '🚨', label: 'Garage Door' },
  ]},
  { icon: '🔑', label: 'Locksmith & Security', type: 'repair', subs: [
    { id: 'locksmith', icon: '🔑', label: 'Locksmith' },
    { id: 'security_systems', icon: '📹', label: 'Security Systems' },
  ]},
  // ── Services ──
  { icon: '✨', label: 'Cleaning', type: 'service', subs: [
    { id: 'house_cleaning', icon: '✨', label: 'House Cleaning' },
    { id: 'carpet_cleaning', icon: '🧹', label: 'Carpet Cleaning' },
    { id: 'window_cleaning', icon: '🪟', label: 'Window Cleaning' },
    { id: 'steam_cleaning', icon: '♨️', label: 'Steam Cleaning' },
  ]},
  // Pressure washing moves here alongside deck/patio/fencing — matches
  // Google Business Profile's standalone exterior placement. Handymen and
  // landscapers both serve this, but the specialist market is outdoor.
  { icon: '🌿', label: 'Outdoor & Landscaping', type: 'service', subs: [
    { id: 'landscaping', icon: '🌿', label: 'Landscaping' },
    { id: 'tree_trimming', icon: '🌳', label: 'Tree Trimming' },
    { id: 'stump_removal', icon: '🪵', label: 'Stump Removal' },
    { id: 'fencing', icon: '🏡', label: 'Fencing' },
    { id: 'deck_patio', icon: '🪵', label: 'Deck & Patio' },
    { id: 'pressure_washing', icon: '💦', label: 'Pressure Washing' },
  ]},
  { icon: '🏊', label: 'Pool & Spa', type: 'service', subs: [
    { id: 'pool', icon: '🏊', label: 'Pool Service' },
    { id: 'hot_tub', icon: '♨️', label: 'Hot Tub' },
  ]},
  { icon: '🐛', label: 'Pest Control', type: 'service', subs: [
    { id: 'pest_control', icon: '🐛', label: 'Pest Control' },
  ]},
  { icon: '🎨', label: 'Painting & Flooring', type: 'service', subs: [
    { id: 'painting', icon: '🎨', label: 'Painting' },
    { id: 'flooring', icon: '🪵', label: 'Flooring' },
    { id: 'tile', icon: '🔲', label: 'Tile' },
  ]},
  { icon: '🏗️', label: 'Remodeling', type: 'service', subs: [
    { id: 'kitchen_remodel', icon: '🍽️', label: 'Kitchen Remodel' },
    { id: 'bathroom_remodel', icon: '🛁', label: 'Bathroom Remodel' },
    { id: 'general_contractor', icon: '🏗️', label: 'General Contractor' },
  ]},
  { icon: '🚚', label: 'Moving & Hauling', type: 'service', subs: [
    { id: 'moving', icon: '🚚', label: 'Moving' },
    { id: 'junk_removal', icon: '🗑️', label: 'Junk Removal' },
  ]},
  { icon: '📸', label: 'Photography', type: 'service', subs: [
    { id: 'photography', icon: '📸', label: 'Professional Photography' },
  ]},
];

/* -- Category-specific follow-up questions -- */
const CATEGORY_FLOWS: Record<string, {
  icon: string; label: string; group: 'repair' | 'service';
  q1: { text: string; options: string[] };
}> = {
  // ── Plumbing group ──
  plumbing: { icon: '🔧', label: 'Plumbing', group: 'repair',
    q1: { text: "What's happening?", options: ['Leaking/dripping', 'Clogged/slow drain', 'No hot water', 'Running toilet', 'Low pressure', 'Burst/flooding', 'Other'] } },
  septic_sewer: { icon: '🕳️', label: 'Septic & Sewer', group: 'repair',
    q1: { text: "What's the issue?", options: ['Backup/overflow', 'Slow drains throughout', 'Septic tank needs pumping', 'Bad smell', 'Inspection needed', 'Other'] } },
  water_heater: { icon: '🔥', label: 'Water Heater', group: 'repair',
    q1: { text: "What's going on?", options: ['No hot water', 'Not enough hot water', 'Leaking', 'Strange noises', 'Need new install', 'Pilot light out', 'Other'] } },
  sprinkler_irrigation: { icon: '💦', label: 'Sprinkler & Irrigation', group: 'repair',
    q1: { text: "What do you need?", options: ['Broken sprinkler head', 'Zone not working', 'Leak in system', 'New installation', 'Winterization', 'Timer/controller issue', 'Other'] } },
  // ── Electrical group ──
  electrical: { icon: '⚡', label: 'Electrical', group: 'repair',
    q1: { text: "What's the problem?", options: ['Outlet not working', 'Lights flickering', 'Breaker tripping', 'Sparking/burning smell', 'Need new install', 'Other'] } },
  generator_install: { icon: '🔋', label: 'Generator Install', group: 'repair',
    q1: { text: "What do you need?", options: ['New generator install', 'Generator repair', 'Transfer switch install', 'Maintenance/tune-up', 'Not sure', 'Other'] } },
  ev_charger_install: { icon: '🔌', label: 'EV Charger Install', group: 'repair',
    q1: { text: "What do you need?", options: ['Level 2 charger install', 'Panel upgrade for EV', 'Charger not working', 'Quote for new install', 'Other'] } },
  solar: { icon: '☀️', label: 'Solar', group: 'repair',
    q1: { text: "What do you need?", options: ['New solar install quote', 'Panel repair', 'Inverter issue', 'Not producing enough', 'Battery storage', 'Other'] } },
  // ── HVAC group ──
  hvac: { icon: '❄️', label: 'HVAC', group: 'repair',
    q1: { text: "What's going on?", options: ['AC not cooling', 'Heat not working', 'Strange noises', 'Thermostat issue', 'Bad smell from vents', 'Maintenance/tune-up'] } },
  chimney: { icon: '🏠', label: 'Chimney', group: 'repair',
    q1: { text: "What do you need?", options: ['Chimney sweep/cleaning', 'Inspection', 'Repair/repointing', 'Cap/damper install', 'Smoke coming inside', 'Other'] } },
  insulation: { icon: '🧱', label: 'Insulation', group: 'repair',
    q1: { text: "What do you need?", options: ['Attic insulation', 'Wall insulation', 'Crawl space', 'Garage insulation', 'Energy audit first', 'Other'] } },
  // ── Appliance ──
  appliance: { icon: '🍳', label: 'Appliance Repair', group: 'repair',
    q1: { text: 'Which appliance?', options: ['Washer', 'Dryer', 'Dishwasher', 'Refrigerator', 'Oven/stove', 'Garbage disposal', 'Other'] } },
  // ── Roofing & Exterior group ──
  roofing: { icon: '🏠', label: 'Roofing', group: 'repair',
    q1: { text: "What's the concern?", options: ['Active leak inside', 'Missing/damaged shingles', 'Storm damage', 'General inspection', 'Full replacement', 'Other'] } },
  gutter: { icon: '🌧️', label: 'Gutter Cleaning', group: 'repair',
    q1: { text: "What do you need?", options: ['Cleaning/debris removal', 'Repair/reattach', 'New gutter install', 'Gutter guards', 'Downspout issue', 'Other'] } },
  siding: { icon: '🪵', label: 'Siding', group: 'repair',
    q1: { text: "What's the issue?", options: ['Damaged/cracked section', 'Full replacement', 'New install', 'Power wash only', 'Storm damage', 'Other'] } },
  window_door_install: { icon: '🪟', label: 'Window & Door Install', group: 'repair',
    q1: { text: "What do you need?", options: ['Window replacement', 'New window install', 'Door replacement', 'Sliding door issue', 'Storm door install', 'Other'] } },
  // ── Handyman & Structural group ──
  general: { icon: '🔨', label: 'Handyman', group: 'repair',
    q1: { text: 'What kind of work?', options: ['Drywall repair', 'Door/window fix', 'Shelving/mounting', 'Furniture assembly', 'Multiple small jobs', 'Other'] } },
  drywall: { icon: '🪧', label: 'Drywall', group: 'repair',
    q1: { text: "What do you need?", options: ['Hole/crack repair', 'Water damage repair', 'New drywall install', 'Texture matching', 'Full room', 'Other'] } },
  concrete: { icon: '🧱', label: 'Concrete', group: 'repair',
    q1: { text: "What do you need?", options: ['Crack repair', 'New driveway/patio', 'Sidewalk repair', 'Stamped concrete', 'Foundation work', 'Other'] } },
  masonry: { icon: '🏗️', label: 'Masonry', group: 'repair',
    q1: { text: "What do you need?", options: ['Brick repair/repointing', 'Retaining wall', 'Stone veneer', 'Fireplace repair', 'New construction', 'Other'] } },
  foundation_waterproofing: { icon: '💧', label: 'Foundation & Waterproofing', group: 'repair',
    q1: { text: "What's the concern?", options: ['Foundation crack', 'Water in basement', 'Settling/shifting', 'Crawl space moisture', 'Drainage issue', 'Other'] } },
  welding_metal_work: { icon: '⚒️', label: 'Welding & Metal Work', group: 'repair',
    q1: { text: "What do you need?", options: ['Gate/fence repair', 'Railing fabrication', 'Structural welding', 'Custom metalwork', 'Iron repair', 'Other'] } },
  furniture_assembly: { icon: '🪑', label: 'Furniture Assembly', group: 'repair',
    q1: { text: 'How many pieces?', options: ['1 item', '2–3 items', '4+ items', 'Full room setup', 'Disassembly needed too'] } },
  tv_mounting: { icon: '📺', label: 'TV Mounting', group: 'repair',
    q1: { text: "What do you need?", options: ['TV wall mount', 'TV + hide wires', 'Projector mount', 'Soundbar install', 'Full home theater', 'Other'] } },
  // ── Garage Door ──
  garage_door: { icon: '🚨', label: 'Garage Door', group: 'repair',
    q1: { text: "What's the issue?", options: ['Won\'t open/close', 'Making noise', 'Off track', 'Opener broken', 'Spring snapped', 'Other'] } },
  // ── Locksmith & Security ──
  locksmith: { icon: '🔑', label: 'Locksmith', group: 'repair',
    q1: { text: "What do you need?", options: ['Locked out', 'Rekey locks', 'New lock install', 'Lock repair', 'Smart lock setup', 'Other'] } },
  security_systems: { icon: '📹', label: 'Security Systems', group: 'repair',
    q1: { text: "What do you need?", options: ['Camera install', 'Alarm system', 'Doorbell camera', 'System repair', 'Smart home setup', 'Other'] } },
  // ── Cleaning group ──
  house_cleaning: { icon: '✨', label: 'House Cleaning', group: 'service',
    q1: { text: 'What type of cleaning?', options: ['Regular cleaning', 'Deep clean', 'Move-in/move-out', 'Post-construction', 'One-time', 'Other'] } },
  carpet_cleaning: { icon: '🧹', label: 'Carpet Cleaning', group: 'service',
    q1: { text: "What do you need?", options: ['Whole house', 'One room', 'Stain removal', 'Pet odor treatment', 'Area rugs', 'Other'] } },
  window_cleaning: { icon: '🪟', label: 'Window Cleaning', group: 'service',
    q1: { text: "What do you need?", options: ['All windows', 'Exterior only', 'Interior + exterior', 'Hard to reach/high', 'Screen cleaning too', 'Other'] } },
  pressure_washing: { icon: '💦', label: 'Pressure Washing', group: 'service',
    q1: { text: 'What needs washing?', options: ['Driveway', 'Patio/deck', 'House siding', 'Fence', 'Roof', 'Multiple areas'] } },
  steam_cleaning: { icon: '♨️', label: 'Steam Cleaning', group: 'service',
    q1: { text: "What needs cleaning?", options: ['Upholstery', 'Tile & grout', 'Mattress', 'Car interior', 'Multiple items', 'Other'] } },
  // ── Outdoor & Landscaping group ──
  landscaping: { icon: '🌿', label: 'Landscaping', group: 'service',
    q1: { text: 'What do you need?', options: ['Lawn mowing', 'Garden design', 'Hedge trimming', 'Yard cleanup', 'Full landscape install', 'Other'] } },
  tree_trimming: { icon: '🌳', label: 'Tree Trimming', group: 'service',
    q1: { text: "What do you need?", options: ['Trimming/pruning', 'Tree removal', 'Dead tree', 'Branches on roof/wires', 'Stump grinding', 'Other'] } },
  stump_removal: { icon: '🪵', label: 'Stump Removal', group: 'service',
    q1: { text: 'How many stumps?', options: ['1 stump', '2–3 stumps', '4+ stumps', 'Not sure'] } },
  fencing: { icon: '🏡', label: 'Fencing', group: 'service',
    q1: { text: "What do you need?", options: ['New fence install', 'Fence repair', 'Gate repair/install', 'Post replacement', 'Full replacement', 'Other'] } },
  deck_patio: { icon: '🪵', label: 'Deck & Patio', group: 'service',
    q1: { text: "What do you need?", options: ['New deck build', 'Deck repair', 'Patio install', 'Staining/sealing', 'Pergola/cover', 'Other'] } },
  // ── Pool & Spa group ──
  pool: { icon: '🏊', label: 'Pool Service', group: 'service',
    q1: { text: 'What do you need?', options: ['Regular cleaning', 'Green/cloudy water', 'Equipment repair', 'Opening/closing', 'Leak detection', 'Other'] } },
  hot_tub: { icon: '♨️', label: 'Hot Tub', group: 'service',
    q1: { text: "What do you need?", options: ['Repair', 'Cleaning/maintenance', 'New install', 'Cover replacement', 'Water chemistry', 'Other'] } },
  // ── Pest Control ──
  pest_control: { icon: '🐛', label: 'Pest Control', group: 'service',
    q1: { text: 'What kind of pest?', options: ['Ants', 'Roaches', 'Mice/rats', 'Termites', 'Spiders', 'Wasps/bees', 'Bed bugs', 'Other'] } },
  // ── Painting & Flooring group ──
  painting: { icon: '🎨', label: 'Painting', group: 'service',
    q1: { text: 'Interior or exterior?', options: ['Interior', 'Exterior', 'Both', 'Cabinet painting', 'Other'] } },
  flooring: { icon: '🪵', label: 'Flooring', group: 'service',
    q1: { text: "What do you need?", options: ['New install', 'Refinishing', 'Repair', 'Removal', 'Not sure what type', 'Other'] } },
  tile: { icon: '🔲', label: 'Tile', group: 'service',
    q1: { text: "What do you need?", options: ['New tile install', 'Tile repair', 'Regrout', 'Backsplash', 'Shower/tub tile', 'Other'] } },
  // ── Remodeling group ──
  kitchen_remodel: { icon: '🍽️', label: 'Kitchen Remodel', group: 'service',
    q1: { text: 'What scope?', options: ['Full remodel', 'Cabinets only', 'Countertops only', 'Layout change', 'Cosmetic update', 'Other'] } },
  bathroom_remodel: { icon: '🛁', label: 'Bathroom Remodel', group: 'service',
    q1: { text: 'What scope?', options: ['Full remodel', 'Shower/tub only', 'Vanity/sink only', 'Tile work', 'Cosmetic update', 'Other'] } },
  general_contractor: { icon: '🏗️', label: 'General Contractor', group: 'service',
    q1: { text: 'What kind of project?', options: ['Home addition', 'Room conversion', 'Structural changes', 'Permit-required work', 'Large renovation', 'Other'] } },
  // ── Moving & Hauling group ──
  moving: { icon: '🚚', label: 'Moving', group: 'service',
    q1: { text: 'What kind of move?', options: ['Full home move', 'Apartment move', 'Few large items', 'Storage pickup/delivery', 'Other'] } },
  junk_removal: { icon: '🗑️', label: 'Junk Removal', group: 'service',
    q1: { text: "What needs removing?", options: ['Furniture', 'Appliances', 'Yard waste', 'Construction debris', 'Full cleanout', 'Other'] } },
  // ── Concierge ──
  concierge: { icon: '🎩', label: 'Concierge', group: 'service',
    q1: { text: "What do you need help with?", options: ['Home management', 'Vendor coordination', 'Property check-ins', 'Errand service', 'Other'] } },
  // ── Photography ──
  photography: { icon: '📸', label: 'Professional Photography', group: 'service',
    q1: { text: 'What type of shoot?', options: ['Property listing photos', 'Interior/design', 'Aerial/drone', 'Virtual tour/3D', 'Seasonal update', 'Event/lifestyle', 'Other'] } },
};

const TIERS = [
  { id: 'standard',  name: 'Standard',  time: '~2 hours', detail: '5 pros via SMS + web' },
  { id: 'priority',  name: 'Priority',  time: '~30 min',  detail: '10 pros via voice + SMS + web', popular: true },
  { id: 'emergency', name: 'Emergency', time: '~15 min',  detail: '15 pros, all channels blitz' },
];

/** Normalize price for display: "$$140" → "$140", "Between 100 and 200" → "$100-$200" */
function cleanPrice(price: string): string {
  // Strip duplicate dollar signs
  let p = price.replace(/^\$+/, '$');

  // "Between X and Y" → "$X-$Y"
  const betweenMatch = p.match(/between\s+\$?(\d+(?:\.\d+)?)\s*(?:and|to)\s*\$?(\d+(?:\.\d+)?)/i);
  if (betweenMatch) return `$${betweenMatch[1]}-$${betweenMatch[2]}`;

  // "X to Y" or "X-Y" without $ → "$X-$Y"
  const rangeMatch = p.match(/^(\d+(?:\.\d+)?)\s*(?:to|-|–)\s*(\d+(?:\.\d+)?)$/);
  if (rangeMatch) return `$${rangeMatch[1]}-$${rangeMatch[2]}`;

  // Plain number → "$X"
  const numMatch = p.match(/^(\d+(?:\.\d+)?)$/);
  if (numMatch) return `$${numMatch[1]}`;

  // "about/around/charge X" → "~$X"
  const approxMatch = p.match(/(?:about|around|charge|estimate)\s+\$?(\d+(?:\.\d+)?)/i);
  if (approxMatch && !/\$/.test(p)) return `~$${approxMatch[1]}`;

  // "service call is 99", "cost runs 150" → "$X"
  const em = p.match(/(?:is|are|be|charge|cost|runs?|pay)\s+(?:about|around)?\s*\$?(\d+(?:\.\d+)?)/i);
  if (em) return `$${em[1]}`;

  // "$150 service call", "$200 for the job", "$99 per visit" → "$X"
  const leadingPrice = p.match(/^\$(\d+(?:\.\d+)?)\s+\w/);
  if (leadingPrice) return `$${leadingPrice[1]}`;

  // "150 service call", "200 for" → "$X"
  const leadingNum = p.match(/^(\d+(?:\.\d+)?)\s+(?:service|for|per|flat|call|visit|fee|charge|total)/i);
  if (leadingNum) return `$${leadingNum[1]}`;

  return p;
}

const MOCK_PROVIDERS = [
  { name: 'Rodriguez Plumbing', rating: 4.9, reviews: 214, quote: '$175', availability: 'Tomorrow 9\u201311 AM', channel: 'voice', note: 'Done hundreds of Moen cartridge swaps. Will bring the part.', distance: '4.2 mi', delay: 4500 },
  { name: 'Atlas Home Services', rating: 4.7, reviews: 89, quote: '$150\u2013200', availability: 'Wednesday afternoon', channel: 'sms', note: 'Can bring the part with me, 12 years experience', distance: '6.1 mi', delay: 8000 },
  { name: 'Quick Fix Pros', rating: 4.6, reviews: 156, quote: '$195', availability: 'Thursday 8\u201310 AM', channel: 'web', note: 'Licensed & insured, 15 years with Moen fixtures', distance: '3.8 mi', delay: 11500 },
];

const OUTREACH_LOG = [
  { t: 0, msg: 'Analyzing your issue...', type: 'system' },
  { t: 800, msg: 'Diagnosis complete \u2014 generating provider briefing', type: 'system' },
  { t: 1600, msg: 'Found 14 providers near you', type: 'system' },
  { t: 2400, msg: 'Calling Rodriguez Plumbing...', type: 'voice' },
  { t: 3000, msg: 'Texting Atlas Home Services...', type: 'sms' },
  { t: 3600, msg: 'Calling SD Premier Plumbing...', type: 'voice' },
  { t: 4200, msg: 'Rodriguez Plumbing \u2014 quote received!', type: 'success' },
  { t: 5000, msg: 'Texting Mike\'s Plumbing Co...', type: 'sms' },
  { t: 5800, msg: 'Submitting form on quickfixpros.com', type: 'web' },
  { t: 6600, msg: 'SD Premier \u2014 voicemail, sending SMS fallback', type: 'fallback' },
  { t: 7400, msg: 'Atlas Home Services \u2014 quote received!', type: 'success' },
  { t: 8400, msg: 'Mike\'s Plumbing \u2014 declined (booked)', type: 'decline' },
  { t: 9400, msg: 'Texting Reliable Plumbing & Drain...', type: 'sms' },
  { t: 10200, msg: 'Calling ABC Plumbing...', type: 'voice' },
  { t: 11200, msg: 'Quick Fix Pros \u2014 quote received!', type: 'success' },
  { t: 12200, msg: '3 quotes ready!', type: 'done' },
];

interface QuoteData {
  category: string | null;
  a1: string | null;
  aiDiagnosis: string | null;
  extra: string | null;
  photo: string | null;
  /** Optional secondary video clip captured via the in-app recorder */
  video?: string | null;
  videoSeconds?: number;
  zip: string;
  timing: string | null;
  tier: string | null;
}

interface CatOption { id: string; icon: string; label: string }

function renderBold(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) => i % 2 === 1 ? <b key={i}>{part}</b> : part);
}

/* -- Chat message components -- */
function AssistantMsg({ text, animate = true }: { text: string; animate?: boolean }) {
  const [show, setShow] = useState(!animate);
  useEffect(() => { if (animate) { const t = setTimeout(() => setShow(true), 200); return () => clearTimeout(t); } }, [animate]);
  if (!show && animate) return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12, animation: 'fadeIn 0.3s ease' }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: O, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ color: 'white', fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 15 }}>h</span>
      </div>
      <div style={{ background: W, padding: '12px 16px', borderRadius: '16px 16px 16px 4px', maxWidth: '80%' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ccc', animation: 'pulse 1s infinite' }} />
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ccc', animation: 'pulse 1s infinite 0.2s' }} />
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ccc', animation: 'pulse 1s infinite 0.4s' }} />
        </div>
      </div>
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12, animation: animate ? 'fadeSlide 0.3s ease' : 'none' }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: O, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ color: 'white', fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 15 }}>h</span>
      </div>
      <div style={{ background: W, padding: '12px 16px', borderRadius: '16px 16px 16px 4px', maxWidth: '80%', fontSize: 15, lineHeight: 1.6, color: D, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{renderBold(text)}</div>
    </div>
  );
}

function UserMsg({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, animation: 'fadeSlide 0.2s ease' }}>
      <div style={{ background: O, color: 'white', padding: '10px 18px', borderRadius: '16px 16px 4px 16px', maxWidth: '75%', fontSize: 15, lineHeight: 1.5, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{text}</div>
    </div>
  );
}

function QuickReplies({ options, onSelect, columns }: { options: (string | CatOption)[]; onSelect: (opt: string | CatOption) => void; columns?: number }) {
  const isCatGrid = columns && columns >= 4;
  return (
    <div className={isCatGrid ? 'gq-cat-grid' : 'gq-replies'} style={{
      display: 'grid', gridTemplateColumns: columns ? `repeat(${columns}, 1fr)` : 'repeat(auto-fill, minmax(130px, 1fr))',
      gap: 8, marginBottom: 16, marginLeft: 42, animation: 'fadeSlide 0.3s ease',
    }}>
      {options.map(opt => (
        <button key={typeof opt === 'string' ? opt : opt.id} onClick={() => onSelect(opt)} style={{
          padding: typeof opt === 'string' ? '10px 14px' : '14px', borderRadius: 12, cursor: 'pointer',
          border: '2px solid rgba(0,0,0,0.07)', background: 'white', fontFamily: "'DM Sans', sans-serif",
          fontSize: 14, color: D, fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
        }}
          onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = O; (e.target as HTMLElement).style.background = 'rgba(232,99,43,0.03)'; }}
          onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'rgba(0,0,0,0.07)'; (e.target as HTMLElement).style.background = 'white'; }}
        >
          {typeof opt === 'string' ? opt : (
            <>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{opt.icon}</div>
              <div>{opt.label}</div>
            </>
          )}
        </button>
      ))}
    </div>
  );
}

function TextInput({ placeholder, onSubmit }: { placeholder: string; onSubmit: (val: string) => void }) {
  const [val, setVal] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div style={{ display: 'flex', gap: 8, marginLeft: 42, marginBottom: 16, animation: 'fadeSlide 0.3s ease' }}>
      <input ref={ref} value={val} onChange={e => setVal(e.target.value)} placeholder={placeholder}
        onKeyDown={e => { if (e.key === 'Enter' && val.trim()) { onSubmit(val.trim()); setVal(''); } }}
        style={{
          flex: 1, padding: '12px 16px', borderRadius: 100, fontSize: 15, border: '2px solid rgba(0,0,0,0.08)',
          fontFamily: "'DM Sans', sans-serif", outline: 'none', color: D,
        }}
        onFocus={e => e.target.style.borderColor = O}
        onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.08)'}
      />
      <button onClick={() => { if (val.trim()) { onSubmit(val.trim()); setVal(''); } }} style={{
        width: 44, height: 44, borderRadius: '50%', border: 'none', background: val.trim() ? O : 'rgba(0,0,0,0.06)',
        color: 'white', fontSize: 18, cursor: val.trim() ? 'pointer' : 'default', transition: 'all 0.2s',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{'\u2191'}</button>
    </div>
  );
}

/**
 * Big Fraunces textarea + photo/video/voice upload buttons — the Q2 design's
 * "just describe it" fast path. Appears in the category phase alongside
 * the tile grid so the user can bypass tile → sub → q1 entirely.
 *
 * Photo upload is wired to the existing file-picker handler. Video and voice
 * are placeholder buttons for now — they open the same photo picker (users
 * with video/audio files can attach them via the photo button today; we'll
 * wire dedicated handlers when backend support lands).
 */
function DirectInput({ onSubmit, onPhoto, onVideoClick, onVoiceClick, examples, disabled }: {
  onSubmit: (text: string) => void;
  onPhoto: (dataUrl: string) => void;
  onVideoClick: () => void;
  onVoiceClick: () => void;
  examples: string[];
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const [focus, setFocus] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const ready = text.trim().length >= 12;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => onPhoto(ev.target?.result as string);
    reader.readAsDataURL(f);
  }

  function submit() {
    if (ready && !disabled) onSubmit(text.trim());
  }

  return (
    <div className="gq-direct" style={{ marginLeft: 42, marginBottom: 14 }}>
      {/* "or just describe it" divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ height: 1, flex: '0 0 16px', background: BORDER }} />
        <span style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", letterSpacing: 1.5, textTransform: 'uppercase', color: DIM, fontWeight: 700 }}>or just describe it</span>
        <span style={{ height: 1, flex: 1, background: BORDER }} />
      </div>

      <div style={{
        background: '#fff', borderRadius: 20,
        border: focus ? `2px solid ${O}` : `2px solid ${BORDER}`,
        boxShadow: focus ? `0 20px 60px -24px ${O}44` : '0 12px 40px -20px rgba(0,0,0,.08)',
        padding: '20px 22px 16px', transition: 'all .2s',
      }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
          placeholder="Describe it here, or chat with Homie by video or voice below."
          disabled={disabled}
          style={{
            width: '100%', border: 'none', outline: 'none', resize: 'none',
            fontFamily: "'Fraunces',serif", fontSize: 22, lineHeight: 1.3,
            color: D, background: 'transparent',
            minHeight: 96, padding: 0, letterSpacing: '-.01em',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}`, gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
            <button onClick={() => fileRef.current?.click()} style={uploadBtnStyle} title="Add photo">
              <svg width="15" height="13" viewBox="0 0 24 20" fill="none"><path d="M3 5h4l2-2h6l2 2h4v12H3V5z" stroke={D} strokeWidth="1.8" /><circle cx="12" cy="11" r="3.5" stroke={D} strokeWidth="1.8" /></svg>
              Photo
            </button>
            <button onClick={onVideoClick} style={uploadBtnStyle} title="Live video chat with Homie — point your camera at the issue and let Homie see it">
              <svg width="15" height="13" viewBox="0 0 24 20" fill="none"><rect x="2" y="4" width="14" height="12" rx="2" stroke={D} strokeWidth="1.8" /><path d="M16 9l6-3v8l-6-3V9z" stroke={D} strokeWidth="1.8" strokeLinejoin="round" /></svg>
              Video Chat with Homie
            </button>
            <button onClick={onVoiceClick} style={uploadBtnStyle} title="Talk with Homie">
              <svg width="13" height="14" viewBox="0 0 18 20" fill="none"><rect x="6" y="1" width="6" height="11" rx="3" stroke={D} strokeWidth="1.8" /><path d="M3 10c0 3.3 2.7 6 6 6s6-2.7 6-6M9 16v3" stroke={D} strokeWidth="1.8" strokeLinecap="round" /></svg>
              Talk to Homie
            </button>
          </div>
          {text.length > 0 && (
            <span style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: DIM, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }}>
              {text.length} chars · {ready ? 'ready' : `${12 - text.length} more`}
            </span>
          )}
        </div>
      </div>

      {/* Submit CTA + ⌘↵ hint */}
      <button
        onClick={submit}
        disabled={!ready || disabled}
        style={{
          marginTop: 14, width: '100%',
          background: ready && !disabled ? O : 'rgba(0,0,0,.06)',
          color: ready && !disabled ? '#fff' : '#9B9490',
          border: 'none', borderRadius: 16, padding: '16px 24px',
          fontSize: 15, fontWeight: 700,
          cursor: ready && !disabled ? 'pointer' : 'not-allowed',
          boxShadow: ready && !disabled ? `0 12px 32px -10px ${O}8c` : 'none',
          fontFamily: "'DM Sans', sans-serif",
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          transition: 'all .2s',
        }}
      >
        {ready ? <>Continue with this description →</> : 'Type a few words, or pick a category above'}
      </button>

      {/* Examples */}
      {text.length === 0 && (
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: DIM, padding: '8px 0', fontFamily: "'DM Mono',monospace", letterSpacing: 1, textTransform: 'uppercase' }}>examples:</span>
          {examples.slice(0, 3).map((ex, i) => (
            <button key={i} onClick={() => setText(ex)} style={{
              background: 'transparent', border: 'none', fontSize: 12, color: DIM,
              cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
              textDecoration: 'underline', textDecorationColor: 'rgba(0,0,0,.15)', padding: '6px 0',
            }}>
              "{ex.slice(0, 42)}…"
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const uploadBtnStyle: React.CSSProperties = {
  background: W,
  border: `1px solid ${BORDER}`,
  color: D,
  borderRadius: 100,
  padding: '10px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  fontFamily: "'DM Sans',sans-serif",
  transition: 'all .15s',
};

// Short example prompts shown under the DirectInput when the textarea is empty
const DIRECT_EXAMPLES = [
  "Kitchen faucet is dripping from the base, worse when hot water's on",
  "AC won't cool below 78\u00B0 — it's 92 outside",
  "Bedroom outlet is warm and sometimes sparks when I unplug",
  "Garbage disposal hums but won't spin",
  "Water stain growing on bedroom ceiling after last storm",
];

function PhotoUpload({ onUpload }: { onUpload: (url: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div style={{ marginLeft: 42, marginBottom: 16, animation: 'fadeSlide 0.3s ease' }}>
      <button onClick={() => ref.current?.click()} style={{
        padding: '10px 20px', borderRadius: 100, border: '2px dashed rgba(0,0,0,0.12)',
        background: 'white', cursor: 'pointer', fontSize: 14, color: '#9B9490',
        fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 18 }}>{'\uD83D\uDCF8'}</span> Add a photo (optional, helps diagnosis)
      </button>
      <input ref={ref} type="file" accept="image/*" hidden onChange={e => {
        if (e.target.files?.[0]) onUpload(URL.createObjectURL(e.target.files[0]));
      }} />
    </div>
  );
}

/* -- Diagnosis card shown before tier selection -- */
function DiagnosisSummary({ data }: { data: QuoteData }) {
  const cat = data.category ? CATEGORY_FLOWS[data.category] : null;
  return (
    <div style={{
      marginLeft: 42, marginBottom: 16, background: 'white', border: `2px solid ${G}22`,
      borderRadius: 16, overflow: 'hidden', animation: 'fadeSlide 0.4s ease',
    }}>
      <div style={{ background: `${G}10`, padding: '12px 16px', borderBottom: `1px solid ${G}22`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: G }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: G }}>AI diagnosis ready</span>
      </div>
      <div style={{ padding: '16px' }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: D, marginBottom: 8 }}>{cat?.icon} {cat?.label} — {data.a1}</div>
        <div style={{ fontSize: 14, color: '#6B6560', lineHeight: 1.6, marginBottom: 8, whiteSpace: 'pre-wrap' }}>
          {data.aiDiagnosis || `${data.a1}. ${data.extra ? `Additional info: ${data.extra}.` : ''}`}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
            <span style={{ color: '#9B9490' }}>Category:</span> <span style={{ fontWeight: 600, color: D }}>{cat?.label}</span>
          </div>
          {data.zip && (
            <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
              <span style={{ color: '#9B9490' }}>Zip:</span> <span style={{ fontWeight: 600, color: D }}>{data.zip}</span>
            </div>
          )}
          {data.timing && (
            <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
              <span style={{ color: '#9B9490' }}>Timing:</span> <span style={{ fontWeight: 600, color: D }}>{data.timing}</span>
            </div>
          )}
        </div>
        <p style={{ fontSize: 12, color: '#9B9490', marginTop: 12, lineHeight: 1.5 }}>
          This diagnosis will be shared with providers so they can give you an accurate quote — no need to explain twice.
        </p>
      </div>
    </div>
  );
}

/* -- Tier selection as chat bubbles -- */
function TierCards({ onSelect }: { onSelect: (t: typeof TIERS[number]) => void }) {
  const { pricing } = usePricing();
  return (
    <div style={{ marginLeft: 42, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, animation: 'fadeSlide 0.3s ease' }}>
      {TIERS.map(t => {
        const tp = pricing.homeowner[t.id];
        const regularPrice = tp ? centsToDisplay(tp.priceCents) : '';
        const promoPrice = tp?.promoPriceCents != null ? centsToDisplay(tp.promoPriceCents) : null;
        return (
        <button key={t.id} onClick={() => onSelect(t)} style={{
          display: 'flex', alignItems: 'center', padding: '14px 18px', borderRadius: 14, cursor: 'pointer',
          border: t.popular ? `2px solid ${O}` : '2px solid rgba(0,0,0,0.06)',
          background: t.popular ? 'rgba(232,99,43,0.03)' : 'white',
          textAlign: 'left', position: 'relative', transition: 'all 0.15s',
        }}
          onMouseEnter={e => { if (!t.popular) e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)'; }}
          onMouseLeave={e => { if (!t.popular) e.currentTarget.style.borderColor = 'rgba(0,0,0,0.06)'; }}
        >
          {t.popular && <div style={{ position: 'absolute', top: -9, right: 14, background: O, color: 'white', fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 100 }}>RECOMMENDED</div>}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: D }}>{t.name} <span style={{ fontWeight: 400, color: '#9B9490', fontSize: 13 }}>· {t.time}</span></div>
            <div style={{ fontSize: 13, color: '#9B9490', marginTop: 2 }}>{t.detail}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: t.popular ? O : D }}>{promoPrice ?? regularPrice}</div>
            {promoPrice && <div style={{ fontSize: 12, color: '#9B9490', textDecoration: 'line-through' }}>{regularPrice}</div>}
          </div>
        </button>
        );
      })}
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        <div style={{ fontSize: 13, color: G, fontWeight: 600 }}>{'\u2705'} Only charged if you receive quotes</div>
        <div style={{ fontSize: 12, color: '#9B9490', marginTop: 2 }}>100% satisfaction guarantee — no quotes, no charge</div>
        <div style={{ fontSize: 11, color: '#bbb', marginTop: 8, lineHeight: 1.5, maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>
          By selecting a tier, you authorize Homie to contact service providers on your behalf via phone call, text message, and email to obtain quotes for your request.
        </div>
      </div>
    </div>
  );
}

/* -- Outreach live view -- */
interface RealProvider {
  id: string;
  responseId: string;
  name: string;
  rating: number;
  reviews: number;
  quote: string;
  availability: string;
  channel: string;
  note: string;
  distance: string;
  googlePlaceId?: string | null;
}

function OutreachView({ isDemo, jobId, costEstimate }: { isDemo?: boolean; jobId?: string | null; costEstimate?: CostEstimate | null }) {
  const navigate = useNavigate();
  const [log, setLog] = useState<typeof OUTREACH_LOG>([]);
  const [providers, setProviders] = useState<(typeof MOCK_PROVIDERS[number] | RealProvider)[]>([]);
  const [done, setDone] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [booked, setBooked] = useState<(typeof MOCK_PROVIDERS[number]) | null>(null);
  const [stats, setStats] = useState({ contacted: 0, responded: 0 });
  const [channels, setChannels] = useState({ voice: 0, sms: 0, web: 0 });
  const logRef = useRef<HTMLDivElement>(null);
  const fetchedResponses = useRef(0);
  const [homeAddress, setHomeAddress] = useState('');

  useEffect(() => {
    if (!isDemo) {
      accountService.getHome().then(res => {
        if (res.data?.address) {
          const parts = [res.data.address, res.data.city, res.data.state].filter(Boolean);
          setHomeAddress(parts.join(', '));
        }
      }).catch(() => {});
    }
  }, [isDemo]);

  useEffect(() => {
    // Real outreach via WebSocket
    if (jobId && !isDemo) {
      setLog([{ t: 0, msg: 'Launching AI agent...', type: 'system' }]);

      const socket = connectJobSocket(jobId, (status: JobStatusResponse) => {
        setStats({ contacted: status.providers_contacted, responded: status.providers_responded });
        setChannels({
          voice: status.outreach_channels.voice.attempted,
          sms: status.outreach_channels.sms.attempted,
          web: status.outreach_channels.web.attempted,
        });

        // Build log entries from channel stats
        const newLog: typeof OUTREACH_LOG = [{ t: 0, msg: `Contacting ${status.providers_contacted} providers...`, type: 'system' }];
        if (status.outreach_channels.voice.attempted > 0) newLog.push({ t: 1, msg: `${status.outreach_channels.voice.attempted} voice calls`, type: 'voice' });
        if (status.outreach_channels.sms.attempted > 0) newLog.push({ t: 2, msg: `${status.outreach_channels.sms.attempted} SMS messages`, type: 'sms' });
        if (status.outreach_channels.web.attempted > 0) newLog.push({ t: 3, msg: `${status.outreach_channels.web.attempted} web contacts`, type: 'web' });
        if (status.providers_responded > 0) newLog.push({ t: 4, msg: `${status.providers_responded} quote(s) received!`, type: 'success' });
        if (['completed', 'expired'].includes(status.status)) {
          newLog.push({ t: 5, msg: status.providers_responded > 0 ? `${status.providers_responded} quotes ready!` : 'Outreach complete', type: 'done' });
          setDone(true);
        }
        setLog(newLog);

        // Fetch real provider responses
        if (status.providers_responded > 0 && status.providers_responded > fetchedResponses.current) {
          fetchedResponses.current = status.providers_responded;
          void jobService.getResponses(jobId).then(res => {
            if (res.data?.responses) {
              setProviders(res.data.responses.map((r: ProviderResponseItem) => ({
                id: r.provider.id,
                responseId: r.id,
                name: r.provider.name,
                rating: parseFloat(r.provider.google_rating ?? '0'),
                reviews: r.provider.review_count,
                quote: cleanPrice(r.quoted_price ?? 'TBD'),
                availability: r.availability ?? 'To be confirmed',
                channel: r.channel,
                note: r.message ?? '',
                distance: '',
                googlePlaceId: r.provider.google_place_id,
              })));
            }
          });
        }
      });

      return () => socket.close();
    }

    // If authenticated but no jobId yet, wait for it
    if (!isDemo && authService.isAuthenticated()) {
      setLog([{ t: 0, msg: 'Setting up your search...', type: 'system' }]);
      return;
    }

    // Mock outreach for demo / unauthenticated
    const timers = OUTREACH_LOG.map((e) => setTimeout(() => {
      setLog(p => [...p, e]);
      if (['voice', 'sms', 'web'].includes(e.type)) setStats(s => ({ ...s, contacted: s.contacted + 1 }));
      if (e.type === 'success') setStats(s => ({ ...s, responded: s.responded + 1 }));
      if (e.type === 'done') setDone(true);
    }, e.t));
    const pt = MOCK_PROVIDERS.map(p => setTimeout(() => setProviders(prev => [...prev, p]), p.delay));
    return () => { timers.forEach(clearTimeout); pt.forEach(clearTimeout); };
  }, [jobId, isDemo]);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  // Build OutreachStatus and LogEntry[] for HomieOutreachLive
  const outreachStatusObj: OutreachStatus = {
    providers_contacted: stats.contacted,
    providers_responded: stats.responded,
    outreach_channels: {
      voice: { attempted: channels.voice, connected: 0 },
      sms: { attempted: channels.sms, connected: 0 },
      web: { attempted: channels.web, connected: 0 },
    },
    status: done ? 'completed' : 'dispatching',
  };
  const logEntries: LogEntry[] = log.map(e => ({ msg: e.msg, type: e.type as LogEntry['type'] }));

  return (
    <>
      {/* Outreach progress */}
      <div style={{ marginLeft: 42, marginBottom: 16, animation: 'fadeSlide 0.3s ease' }}>
        <HomieOutreachLive
          status={outreachStatusObj}
          log={logEntries}
          done={done}
          showSafeNotice={!done}
          accountLink="/account?tab=quotes"
        />
      </div>

      {/* AI Cost Estimate */}
      {costEstimate && (
        <div style={{ marginLeft: 42, marginBottom: 12, animation: 'fadeSlide 0.3s ease' }}>
          <EstimateCard estimate={costEstimate} />
        </div>
      )}

      {/* Provider cards */}
      {providers.map((p, i) => (
        <div key={i} style={{ marginLeft: 42, marginBottom: 10, animation: 'fadeSlide 0.4s ease' }}>
          <div onClick={() => setSelected(selected === i ? null : i)} style={{
            background: 'white', borderRadius: 14, padding: '16px 18px', cursor: 'pointer',
            border: selected === i ? `2px solid ${O}` : '1px solid rgba(0,0,0,0.06)',
            boxShadow: selected === i ? `0 4px 20px ${O}18` : '0 1px 4px rgba(0,0,0,0.03)',
            transition: 'all 0.2s',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 16, color: D }}>{p.name}</span>
                <span style={{ color: '#9B9490', fontSize: 13, marginLeft: 8 }}>{'\u2605'} {p.rating} ({p.reviews}){p.distance ? ` · ${p.distance}` : ''}</span>
                {'googlePlaceId' in p && (p as RealProvider).googlePlaceId && (
                  <a href={`https://www.google.com/maps/place/?q=place_id:${(p as RealProvider).googlePlaceId}`} target="_blank" rel="noopener" style={{ fontSize: 11, color: '#2563EB', textDecoration: 'none', fontWeight: 600, marginLeft: 6 }}>Reviews</a>
                )}
              </div>
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                <span style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: O }}>{p.quote}</span>
                {costEstimate ? (
                  <EstimateBadge quotedPrice={p.quote} estimateLow={costEstimate.estimateLowCents} estimateHigh={costEstimate.estimateHighCents} />
                ) : (
                  <div style={{ fontSize: 11, color: '#9B9490', fontWeight: 500 }}>quoted price</div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: D }}>{'\uD83D\uDCC5'} {p.availability}</span>
              <span style={{ background: W, padding: '2px 10px', borderRadius: 100, fontSize: 11, color: '#9B9490' }}>via {p.channel}</span>
            </div>
            {p.note && <div style={{ fontSize: 13, color: '#6B6560', fontStyle: 'italic', marginTop: 6 }}>"{p.note}"</div>}
            {selected === i && !booked && (
              <div style={{ marginTop: 14 }}>
                {!isDemo && (
                  <input
                    id={`addr-${i}`}
                    defaultValue={homeAddress}
                    placeholder="Enter your service address"
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14,
                      border: '2px solid rgba(0,0,0,0.08)', outline: 'none', color: D,
                      fontFamily: "'DM Sans', sans-serif", marginBottom: 8, boxSizing: 'border-box',
                    }}
                  />
                )}
                <button onClick={async () => {
                  if (isDemo) { setBooked(p as unknown as typeof MOCK_PROVIDERS[number]); return; }
                  const addrInput = document.getElementById(`addr-${i}`) as HTMLInputElement;
                  const address = addrInput?.value?.trim();
                  if (!address) { alert('Please enter your service address'); return; }
                  if (jobId && 'responseId' in p) {
                    try {
                      await jobService.bookProvider(jobId, (p as RealProvider).responseId, (p as RealProvider).id, address);
                      setBooked(p as unknown as typeof MOCK_PROVIDERS[number]);
                    } catch (err) {
                      console.error('[GetQuotes] Booking failed:', err);
                    }
                  }
                }} style={{
                  width: '100%', padding: '13px 0', borderRadius: 100, border: 'none',
                  background: O, color: 'white', fontSize: 16, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif", boxShadow: `0 4px 16px ${O}40`,
              }}>Book {p.name.split(' ')[0]}</button>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Demo booking confirmation */}
      {booked && (
        <div style={{ marginLeft: 42, animation: 'fadeSlide 0.4s ease' }}>
          <div style={{
            background: 'white', borderRadius: 16, padding: '28px 24px', textAlign: 'center',
            border: `2px solid ${G}22`, boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: `${G}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={G} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.75l6 6 9-13.5" /></svg>
            </div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: D, marginBottom: 6 }}>You're all set!</div>
            <div style={{ fontSize: 14, color: '#6B6560', marginBottom: 16 }}>
              <strong style={{ color: D }}>{booked.name}</strong> has been booked. They'll be in touch to confirm details.
            </div>
            <div style={{ background: W, borderRadius: 12, padding: '12px 16px', textAlign: 'left', fontSize: 14, color: '#6B6560' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span>Quote</span><span style={{ fontWeight: 600, color: D }}>{booked.quote}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span>When</span><span style={{ fontWeight: 600, color: D }}>{booked.availability}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Rating</span><span style={{ fontWeight: 600, color: D }}>{'\u2B50'} {booked.rating}</span></div>
            </div>
            {isDemo && <div style={{ fontSize: 12, color: '#9B9490', marginTop: 12 }}>This is a demo — no actual booking was made</div>}
          </div>
        </div>
      )}

      {done && providers.length > 0 && selected === null && !booked && (
        <div style={{ marginLeft: 42, textAlign: 'center', color: '#9B9490', fontSize: 14, marginTop: 8 }}>{'\u2191'} Tap a provider to book</div>
      )}
    </>
  );
}

/* -- Home context builder -- */
function buildHomeContext(home: HomeData): string {
  const parts: string[] = [];

  const basicParts: string[] = [];
  if (home.bedrooms) basicParts.push(`${home.bedrooms} bed`);
  if (home.bathrooms) basicParts.push(`${home.bathrooms} bath`);
  if (home.sqft) basicParts.push(`${home.sqft.toLocaleString()} sqft`);
  if (basicParts.length > 0) parts.push(`Home: ${basicParts.join(' / ')}.`);

  const d = home.details;
  if (!d) return parts.join(' ');

  if (d.hvac) {
    const hvacParts: string[] = [];
    if (d.hvac.acType) hvacParts.push(`${d.hvac.acType}${d.hvac.acBrand ? ` (${d.hvac.acBrand})` : ''}${d.hvac.acAge ? `, ${d.hvac.acAge} old` : ''}`);
    if (d.hvac.heatingType) hvacParts.push(`Heating: ${d.hvac.heatingType}`);
    if (hvacParts.length > 0) parts.push(`HVAC: ${hvacParts.join('. ')}.`);
  }

  if (d.waterHeater) {
    const whParts: string[] = [];
    if (d.waterHeater.type) whParts.push(d.waterHeater.type);
    if (d.waterHeater.brand) whParts.push(d.waterHeater.brand);
    if (d.waterHeater.fuel) whParts.push(d.waterHeater.fuel);
    if (d.waterHeater.location) whParts.push(`in ${d.waterHeater.location}`);
    if (whParts.length > 0) parts.push(`Water heater: ${whParts.join(', ')}.`);
  }

  if (d.appliances) {
    const appParts: string[] = [];
    for (const [name, info] of Object.entries(d.appliances)) {
      if (info && typeof info === 'object') {
        const appInfo = info as Record<string, string>;
        if (appInfo.brand) appParts.push(`${name}: ${appInfo.brand}`);
      }
    }
    if (appParts.length > 0) parts.push(`Appliances: ${appParts.join(', ')}.`);
  }

  if (d.plumbing) {
    const plParts: string[] = [];
    if (d.plumbing.kitchenFaucetBrand) plParts.push(`Kitchen faucet: ${d.plumbing.kitchenFaucetBrand}`);
    if (d.plumbing.toiletBrand) plParts.push(`Toilet: ${d.plumbing.toiletBrand}`);
    if (d.plumbing.septicOrSewer) plParts.push(d.plumbing.septicOrSewer);
    if (plParts.length > 0) parts.push(`Plumbing: ${plParts.join('. ')}.`);
  }

  if (d.electrical?.panelAmperage) parts.push(`Electrical: Panel ${d.electrical.panelAmperage}.`);
  if (d.exterior?.roofType) parts.push(`Roof: ${d.exterior.roofType}${d.exterior.roofAge ? `, ${d.exterior.roofAge} old` : ''}.`);
  if (d.general?.yearBuilt) parts.push(`Built: ${d.general.yearBuilt}.`);

  return parts.join(' ');
}

/* -- Quote Outreach Modal -- */
interface QuoteOutreachModalProps {
  isOpen: boolean;
  onClose: (hasJob: boolean) => void;
  diagnosis: string;
  category: string;
  subcategory: string;
  costEstimate: CostEstimate | null;
  isDemo: boolean;
  onBooked: (providerName: string) => void;
  initialJobId?: string | null;
}

function QuoteOutreachModal({ isOpen, onClose, diagnosis, category, subcategory, costEstimate: initialEstimate, isDemo, onBooked, initialJobId }: QuoteOutreachModalProps) {
  const navigate = useNavigate();
  const { pricing } = usePricing();
  const [step, setStep] = useState<'tier' | 'preferences' | 'auth_gate' | 'outreach'>(initialJobId ? 'outreach' : 'tier');
  const [tier, setTier] = useState<string | null>(null);
  const [zip, setZip] = useState('');
  const [timing, setTiming] = useState<string | null>(null);
  // Budget removed — we no longer collect or submit homeowner budget to
  // providers. Keeping the variable name out of the rest of the modal.
  const [jobId, setJobId] = useState<string | null>(initialJobId ?? null);
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(initialEstimate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Outreach state
  const [log, setLog] = useState<typeof OUTREACH_LOG>([]);
  const [providers, setProviders] = useState<(typeof MOCK_PROVIDERS[number] | RealProvider)[]>([]);
  const [outreachDone, setOutreachDone] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [booked, setBooked] = useState<(typeof MOCK_PROVIDERS[number]) | null>(null);
  const [stats, setStats] = useState({ contacted: 0, responded: 0 });
  const [channels, setChannels] = useState({ voice: 0, sms: 0, web: 0 });
  const logRef = useRef<HTMLDivElement>(null);
  const fetchedResponses = useRef(0);
  const [homeAddress, setHomeAddress] = useState('');

  useEffect(() => {
    if (!isDemo) {
      accountService.getHome().then(res => {
        if (res.data?.address) {
          const parts = [res.data.address, res.data.city, res.data.state].filter(Boolean);
          setHomeAddress(parts.join(', '));
        }
      }).catch(() => {});
    }
  }, [isDemo]);

  useEffect(() => {
    if (initialEstimate) setCostEstimate(initialEstimate);
  }, [initialEstimate]);

  // Reset fetch counter when jobId changes
  useEffect(() => { fetchedResponses.current = 0; }, [jobId]);

  // Fetch cost estimate when entering outreach step if we don't have one
  useEffect(() => {
    if (step === 'outreach' && !costEstimate && category && zip) {
      const urgencyMap: Record<string, string> = { 'ASAP': 'asap', 'This week': 'this_week', 'This month': 'this_month', 'Flexible': 'flexible' };
      estimateService.generate({
        category,
        subcategory: subcategory || category,
        zip_code: zip,
        urgency: urgencyMap[timing ?? ''] || 'flexible',
      }).then(res => { if (res.data) setCostEstimate(res.data); }).catch(() => {});
    }
  }, [step]);

  useEffect(() => {
    if (initialJobId) {
      setJobId(initialJobId);
      setStep('outreach');
    }
  }, [initialJobId]);

  // Outreach WebSocket / demo effect
  useEffect(() => {
    if (step !== 'outreach') return;

    // Real outreach via WebSocket
    if (jobId && !isDemo) {
      setLog([{ t: 0, msg: 'Launching AI agent...', type: 'system' }]);

      const socket = connectJobSocket(jobId, (status: JobStatusResponse) => {
        setStats({ contacted: status.providers_contacted, responded: status.providers_responded });
        setChannels({
          voice: status.outreach_channels.voice.attempted,
          sms: status.outreach_channels.sms.attempted,
          web: status.outreach_channels.web.attempted,
        });

        const newLog: typeof OUTREACH_LOG = [{ t: 0, msg: `Contacting ${status.providers_contacted} providers...`, type: 'system' }];
        if (status.outreach_channels.voice.attempted > 0) newLog.push({ t: 1, msg: `${status.outreach_channels.voice.attempted} voice calls`, type: 'voice' });
        if (status.outreach_channels.sms.attempted > 0) newLog.push({ t: 2, msg: `${status.outreach_channels.sms.attempted} SMS messages`, type: 'sms' });
        if (status.outreach_channels.web.attempted > 0) newLog.push({ t: 3, msg: `${status.outreach_channels.web.attempted} web contacts`, type: 'web' });
        if (status.providers_responded > 0) newLog.push({ t: 4, msg: `${status.providers_responded} quote(s) received!`, type: 'success' });
        if (['completed', 'expired'].includes(status.status)) {
          newLog.push({ t: 5, msg: status.providers_responded > 0 ? `${status.providers_responded} quotes ready!` : 'Outreach complete', type: 'done' });
          setOutreachDone(true);
        }
        setLog(newLog);

        // Fetch provider responses whenever count changes or on first detection
        if (status.providers_responded > 0) {
          void jobService.getResponses(jobId).then(res => {
            if (res.data?.responses) {
              setProviders(res.data.responses.map((r: ProviderResponseItem) => ({
                id: r.provider.id,
                responseId: r.id,
                name: r.provider.name,
                rating: parseFloat(r.provider.google_rating ?? '0'),
                reviews: r.provider.review_count,
                quote: cleanPrice(r.quoted_price ?? 'TBD'),
                availability: r.availability ?? 'To be confirmed',
                channel: r.channel,
                note: r.message ?? '',
                distance: '',
                googlePlaceId: r.provider.google_place_id,
              })));
            }
          });
        }
      });

      return () => socket.close();
    }

    // If authenticated but no jobId yet, wait
    if (!isDemo && authService.isAuthenticated()) {
      setLog([{ t: 0, msg: 'Setting up your search...', type: 'system' }]);
      return;
    }

    // Mock outreach for demo
    const timers = OUTREACH_LOG.map((e) => setTimeout(() => {
      setLog(p => [...p, e]);
      if (['voice', 'sms', 'web'].includes(e.type)) setStats(s => ({ ...s, contacted: s.contacted + 1 }));
      if (e.type === 'success') setStats(s => ({ ...s, responded: s.responded + 1 }));
      if (e.type === 'done') setOutreachDone(true);
    }, e.t));
    const pt = MOCK_PROVIDERS.map(p => setTimeout(() => setProviders(prev => [...prev, p]), p.delay));
    return () => { timers.forEach(clearTimeout); pt.forEach(clearTimeout); };
  }, [step, jobId, isDemo]);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  const handleTierSelect = (t: typeof TIERS[number]) => {
    setTier(t.id);
    setStep('preferences');
  };

  const handleLaunchAgent = async () => {
    if (!tier || !zip || !timing) return;
    setError(null);

    if (isDemo) {
      setStep('outreach');
      return;
    }

    if (!authService.isAuthenticated()) {
      setStep('auth_gate');
      return;
    }

    setLoading(true);

    // Generate cost estimate if we don't have one
    if (!costEstimate && category && zip) {
      const urgencyMap: Record<string, string> = { 'ASAP': 'asap', 'This week': 'this_week', 'This month': 'this_month', 'Flexible': 'flexible' };
      try {
        const estRes = await estimateService.generate({
          category,
          subcategory: subcategory || category,
          zip_code: zip,
          urgency: urgencyMap[timing] || 'flexible',
        });
        if (estRes.data) setCostEstimate(estRes.data);
      } catch { /* ignore */ }
    }

    try {
      const cat = CATEGORY_FLOWS[category];
      const diagPayload: DiagnosisPayload = {
        category,
        severity: 'medium',
        summary: diagnosis || `${cat?.label}: ${subcategory}`,
        recommendedActions: [],
      };

      const res = await jobService.createJob({
        diagnosis: diagPayload,
        timing: ({ 'ASAP': 'asap', 'This week': 'this_week', 'This month': 'this_month', 'Flexible': 'flexible' }[timing] ?? 'flexible') as 'asap' | 'this_week' | 'this_month' | 'flexible',
        tier: tier as 'standard' | 'priority' | 'emergency',
        zipCode: zip,
      });

      if (!res.data) {
        setError('Something went wrong creating your job. Please try again.');
        setLoading(false);
        return;
      }

      // Try Stripe payment
      try {
        const payRes = await paymentService.createCheckout(res.data.id, '', '', '/quote');
        if (payRes.data?.checkout_url) {
          sessionStorage.setItem('homie_paid_job', JSON.stringify({ jobId: res.data.id, tier }));
          window.location.href = payRes.data.checkout_url;
          return;
        }
      } catch { /* payment not configured — continue */ }

      // No checkout URL or payment not configured — launch outreach directly
      setJobId(res.data.id);
      setLoading(false);
      setStep('outreach');
    } catch (err) {
      setError(`Something went wrong: ${(err as Error).message || 'Unknown error'}. Please try again.`);
      setLoading(false);
    }
  };

  const handleSaveAndAuth = (path: string) => {
    sessionStorage.setItem('homie_pending_quote', JSON.stringify({
      category,
      a1: subcategory,
      aiDiagnosis: diagnosis,
      extra: null,
      photo: null,
      zip,
      timing,
      tier,
    }));
    navigate(path);
  };

  if (!isOpen) return null;

  const outreachStatusObj: OutreachStatus = {
    providers_contacted: stats.contacted,
    providers_responded: stats.responded,
    outreach_channels: {
      voice: { attempted: channels.voice, connected: 0 },
      sms: { attempted: channels.sms, connected: 0 },
      web: { attempted: channels.web, connected: 0 },
    },
    status: outreachDone ? 'completed' : 'dispatching',
  };
  const logEntries: LogEntry[] = log.map(e => ({ msg: e.msg, type: e.type as LogEntry['type'] }));
  const isPrefsValid = /^\d{5}$/.test(zip) && timing !== null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={() => onClose(!!jobId)}>
      <div style={{
        background: 'white', borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '90vh',
        overflow: 'auto', padding: '28px 24px 24px', position: 'relative',
        animation: 'fadeSlide 0.3s ease', fontFamily: "'DM Sans', sans-serif",
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 20, fontWeight: 800, color: D, fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
            {step === 'tier' ? 'Find a Pro' : step === 'preferences' ? 'Your Details' : step === 'auth_gate' ? 'Sign In to Continue' : 'Homie is on it'}
          </h3>
          <button onClick={() => onClose(!!jobId)} style={{
            width: 32, height: 32, borderRadius: '50%', background: W, border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, cursor: 'pointer', color: D,
          }}>{'\u2715'}</button>
        </div>

        {/* Diagnosis mini card */}
        {diagnosis && step !== 'outreach' && (
          <div style={{
            background: W, borderRadius: 12, padding: '12px 16px', marginBottom: 20,
            border: `1px solid ${D}0D`, fontSize: 13, color: `${D}99`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 16 }}>{CATEGORY_FLOWS[category]?.icon ?? '\uD83D\uDEE0\uFE0F'}</span>
              <strong style={{ color: D }}>{CATEGORY_FLOWS[category]?.label} — {subcategory}</strong>
            </div>
            <p style={{ fontSize: 12, color: `${D}66`, margin: 0, lineHeight: 1.5 }}>{diagnosis.slice(0, 150)}{diagnosis.length > 150 ? '...' : ''}</p>
          </div>
        )}

        {error && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10,
            padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#DC2626',
          }}>{error}</div>
        )}

        {booked ? (
          /* Booking confirmation */
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: `${G}15`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={G} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.75l6 6 9-13.5" /></svg>
            </div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: D, marginBottom: 6 }}>You're all set!</div>
            <div style={{ fontSize: 14, color: '#6B6560', marginBottom: 16 }}>
              <strong style={{ color: D }}>{booked.name}</strong> has been booked. They'll be in touch to confirm details.
            </div>
            <div style={{ background: W, borderRadius: 12, padding: '12px 16px', textAlign: 'left', fontSize: 14, color: '#6B6560' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span>Quote</span><span style={{ fontWeight: 600, color: D }}>{booked.quote}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span>When</span><span style={{ fontWeight: 600, color: D }}>{booked.availability}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Rating</span><span style={{ fontWeight: 600, color: D }}>{'\u2B50'} {booked.rating}</span></div>
            </div>
            {isDemo && <div style={{ fontSize: 12, color: '#9B9490', marginTop: 12 }}>This is a demo — no actual booking was made</div>}
          </div>
        ) : (
          <>
            {/* TIER step */}
            {step === 'tier' && (
              <div>
                <p style={{ fontSize: 14, color: `${D}99`, marginBottom: 16, lineHeight: 1.6 }}>
                  Homie's AI agent will call, text, and search the web to find available pros in your area. Choose your speed:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {TIERS.map(t => {
                    const tp = pricing.homeowner[t.id];
                    const regularPrice = tp ? centsToDisplay(tp.priceCents) : '';
                    const promoPrice = tp?.promoPriceCents != null ? centsToDisplay(tp.promoPriceCents) : null;
                    return (
                    <button key={t.id} onClick={() => handleTierSelect(t)} style={{
                      display: 'flex', alignItems: 'center', padding: '16px 18px', borderRadius: 14, cursor: 'pointer',
                      border: t.popular ? `2px solid ${O}` : '2px solid rgba(0,0,0,0.06)',
                      background: t.popular ? 'rgba(232,99,43,0.03)' : 'white',
                      textAlign: 'left', position: 'relative', transition: 'all 0.15s',
                    }}
                      onMouseEnter={e => { if (!t.popular) e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)'; }}
                      onMouseLeave={e => { if (!t.popular) e.currentTarget.style.borderColor = 'rgba(0,0,0,0.06)'; }}
                    >
                      {t.popular && <div style={{
                        position: 'absolute', top: -9, right: 14, background: O, color: 'white',
                        fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 100,
                      }}>RECOMMENDED</div>}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 16, color: D }}>
                          {t.name} <span style={{ fontWeight: 400, color: '#9B9490', fontSize: 13 }}>{'\u00B7'} {t.time}</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#9B9490', marginTop: 2 }}>{t.detail}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: t.popular ? O : D }}>{promoPrice ?? regularPrice}</div>
                        {promoPrice && <div style={{ fontSize: 12, color: '#9B9490', textDecoration: 'line-through' }}>{regularPrice}</div>}
                      </div>
                    </button>
                    );
                  })}
                </div>
                <div style={{ textAlign: 'center', marginTop: 14 }}>
                  <div style={{ fontSize: 13, color: G, fontWeight: 600 }}>{'\u2705'} Only charged if you receive quotes</div>
                  <div style={{ fontSize: 12, color: '#9B9490', marginTop: 2 }}>100% satisfaction guarantee — no quotes, no charge</div>
                  <div style={{ fontSize: 11, color: '#bbb', marginTop: 8, lineHeight: 1.5, maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>
                    By selecting a tier, you authorize Homie to contact service providers on your behalf via phone call, text message, and email to obtain quotes for your request.
                  </div>
                </div>
              </div>
            )}

            {/* PREFERENCES step */}
            {step === 'preferences' && (
              <div>
                <p style={{ fontSize: 14, color: `${D}99`, marginBottom: 16, lineHeight: 1.6 }}>
                  A few quick details so Homie can find the right pros:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Zip code */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: D, display: 'block', marginBottom: 6 }}>Zip Code</label>
                    <input
                      value={zip}
                      onChange={e => setZip(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 92103"
                      maxLength={5}
                      inputMode="numeric"
                      style={{
                        width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 15,
                        border: '1.5px solid rgba(0,0,0,0.08)', outline: 'none', color: D,
                        fontFamily: "'DM Sans', sans-serif", background: W, boxSizing: 'border-box',
                      }}
                      onFocus={e => e.target.style.borderColor = `${O}50`}
                      onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.08)'}
                    />
                  </div>
                  {/* Timing */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: D, display: 'block', marginBottom: 6 }}>When do you need this done?</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                      {['ASAP', 'This week', 'This month', 'Flexible'].map(t => (
                        <button key={t} onClick={() => setTiming(t)} style={{
                          padding: '10px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          border: timing === t ? `1.5px solid ${O}` : '1.5px solid rgba(0,0,0,0.08)',
                          background: timing === t ? `${O}0A` : 'white',
                          color: timing === t ? O : `${D}99`,
                          fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s',
                        }}>{t}</button>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Launch button */}
                <button onClick={() => { void handleLaunchAgent(); }} disabled={!isPrefsValid || loading} style={{
                  width: '100%', marginTop: 20, padding: '14px 0', borderRadius: 14, border: 'none',
                  fontSize: 15, fontWeight: 700, cursor: isPrefsValid && !loading ? 'pointer' : 'default',
                  background: isPrefsValid && !loading ? O : 'rgba(0,0,0,0.08)',
                  color: isPrefsValid && !loading ? 'white' : 'rgba(0,0,0,0.25)',
                  fontFamily: "'DM Sans', sans-serif", transition: 'all 0.2s',
                  boxShadow: isPrefsValid && !loading ? `0 4px 16px ${O}40` : 'none',
                }}>
                  {loading ? 'Creating job...' : (() => { const tp = tier ? pricing.homeowner[tier] : null; const p = tp ? (tp.promoPriceCents != null ? centsToDisplay(tp.promoPriceCents) : centsToDisplay(tp.priceCents)) : ''; return `\uD83D\uDE80 Launch Homie Agent \u2014 ${p}`; })()}
                </button>
                <button onClick={() => setStep('tier')} style={{
                  width: '100%', marginTop: 8, padding: '10px 0', border: 'none', background: 'none',
                  fontSize: 13, color: '#9B9490', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                }}>{'\u2190'} Back to pricing</button>
              </div>
            )}

            {/* AUTH GATE step */}
            {step === 'auth_gate' && (
              <div>
                <p style={{ fontSize: 14, color: `${D}99`, marginBottom: 16, lineHeight: 1.6 }}>
                  Almost there! You'll need to sign in so we can save your quotes and send you results.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button onClick={() => handleSaveAndAuth('/login?redirect=/quote')} style={{
                    padding: '14px 0', borderRadius: 100, border: 'none', fontSize: 16, fontWeight: 600,
                    background: O, color: 'white', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                  }}>Sign in</button>
                  <button onClick={() => handleSaveAndAuth('/register?redirect=/quote')} style={{
                    padding: '14px 0', borderRadius: 100, border: `2px solid ${O}`, fontSize: 16, fontWeight: 600,
                    background: 'white', color: O, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                  }}>Create account</button>
                </div>
                <button onClick={() => setStep('preferences')} style={{
                  width: '100%', marginTop: 12, padding: '10px 0', border: 'none', background: 'none',
                  fontSize: 13, color: '#9B9490', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                }}>{'\u2190'} Back</button>
              </div>
            )}

            {/* OUTREACH step */}
            {step === 'outreach' && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <HomieOutreachLive
                    status={outreachStatusObj}
                    log={logEntries}
                    done={outreachDone}
                    showSafeNotice={!outreachDone}
                    accountLink="/account?tab=quotes"
                  />
                </div>

                {costEstimate && (
                  <div style={{ marginBottom: 12 }}>
                    <EstimateCard estimate={costEstimate} />
                  </div>
                )}

                {providers.map((p, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div onClick={() => setSelected(selected === i ? null : i)} style={{
                      background: 'white', borderRadius: 14, padding: '16px 18px', cursor: 'pointer',
                      border: selected === i ? `2px solid ${O}` : '1px solid rgba(0,0,0,0.06)',
                      boxShadow: selected === i ? `0 4px 20px ${O}18` : '0 1px 4px rgba(0,0,0,0.03)',
                      transition: 'all 0.2s',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: 16, color: D }}>{p.name}</span>
                          <span style={{ color: '#9B9490', fontSize: 13, marginLeft: 8 }}>{'\u2605'} {p.rating} ({p.reviews}){p.distance ? ` · ${p.distance}` : ''}</span>
                          {'googlePlaceId' in p && (p as RealProvider).googlePlaceId && (
                            <a href={`https://www.google.com/maps/place/?q=place_id:${(p as RealProvider).googlePlaceId}`} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: '#2563EB', textDecoration: 'none', fontWeight: 600, marginLeft: 6 }}>Reviews</a>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                          <span style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: O }}>{p.quote}</span>
                          {costEstimate ? (
                            <EstimateBadge quotedPrice={p.quote} estimateLow={costEstimate.estimateLowCents} estimateHigh={costEstimate.estimateHighCents} />
                          ) : (
                            <div style={{ fontSize: 11, color: '#9B9490', fontWeight: 500 }}>quoted price</div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 14, color: D }}>{'\uD83D\uDCC5'} {p.availability}</span>
                        <span style={{ background: W, padding: '2px 10px', borderRadius: 100, fontSize: 11, color: '#9B9490' }}>via {p.channel}</span>
                      </div>
                      {p.note && <div style={{ fontSize: 13, color: '#6B6560', fontStyle: 'italic', marginTop: 6 }}>"{p.note}"</div>}
                      {selected === i && !booked && (
                        <div style={{ marginTop: 14 }} onClick={e => e.stopPropagation()}>
                          {!isDemo && (
                            <input
                              id={`modal-addr-${i}`}
                              defaultValue={homeAddress}
                              placeholder="Enter your service address"
                              onClick={e => e.stopPropagation()}
                              style={{
                                width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14,
                                border: '2px solid rgba(0,0,0,0.08)', outline: 'none', color: D,
                                fontFamily: "'DM Sans', sans-serif", marginBottom: 8, boxSizing: 'border-box',
                              }}
                            />
                          )}
                          <button onClick={async () => {
                            if (isDemo) {
                              setBooked(p as unknown as typeof MOCK_PROVIDERS[number]);
                              onBooked(p.name);
                              return;
                            }
                            const addrInput = document.getElementById(`modal-addr-${i}`) as HTMLInputElement;
                            const address = addrInput?.value?.trim();
                            if (!address) { alert('Please enter your service address'); return; }
                            if (jobId && 'responseId' in p) {
                              try {
                                await jobService.bookProvider(jobId, (p as RealProvider).responseId, (p as RealProvider).id, address);
                                setBooked(p as unknown as typeof MOCK_PROVIDERS[number]);
                                onBooked(p.name);
                              } catch (err) {
                                console.error('[QuoteModal] Booking failed:', err);
                              }
                            }
                          }} style={{
                            width: '100%', padding: '13px 0', borderRadius: 100, border: 'none',
                            background: O, color: 'white', fontSize: 16, fontWeight: 600, cursor: 'pointer',
                            fontFamily: "'DM Sans', sans-serif", boxShadow: `0 4px 16px ${O}40`,
                          }}>Book {p.name.split(' ')[0]}</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {outreachDone && providers.length > 0 && selected === null && !booked && (
                  <div style={{ textAlign: 'center', color: '#9B9490', fontSize: 14, marginTop: 8 }}>{'\u2191'} Tap a provider to book</div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* -- Local storage snapshot of the in-flight quote intake -- */
// Survives page reloads / tab close so a user can pop back into /quote
// and pick up where they left off. Keyed with a version suffix so shape
// changes invalidate the cache automatically.
const QUOTE_STATE_KEY = 'homie_quote_state_v1';
const QUOTE_STATE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface QuoteStateSnapshot {
  data: QuoteData;
  messages: { role: string; text: string }[];
  aiConvo: { role: 'user' | 'assistant'; content: string }[];
  phase: string;
  costEstimate: CostEstimate | null;
  savedAt: number;
}

function loadQuoteSnapshot(): QuoteStateSnapshot | null {
  try {
    const raw = localStorage.getItem(QUOTE_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuoteStateSnapshot;
    if (!parsed || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > QUOTE_STATE_TTL_MS) {
      localStorage.removeItem(QUOTE_STATE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/* -- MAIN COMPONENT -- */
export default function GetQuotes() {
  const navigate = useNavigate();
  const { pricing } = usePricing();
  const isDemo = new URLSearchParams(window.location.search).has('demo');

  // Try to restore the in-flight intake from localStorage so a user who
  // closed the pricing modal (or the tab entirely) can come back and find
  // the chat / diagnosis exactly as they left it.
  const snapshot = (typeof window !== 'undefined') ? loadQuoteSnapshot() : null;

  const [messages, setMessages] = useState<{ role: string; text: string }[]>(() => snapshot?.messages ?? []);
  const [phase, setPhase] = useState(() => snapshot?.phase ?? 'greeting');
  const [data, setData] = useState<QuoteData>(() => snapshot?.data ?? { category: null, a1: null, aiDiagnosis: null, extra: null, photo: null, zip: '', timing: null, tier: null });
  const aiConvoRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>(snapshot?.aiConvo ?? []);
  const [streaming, setStreaming] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(() => snapshot?.costEstimate ?? null);
  const [modalOpen, setModalOpen] = useState(false);
  const [videoChatOpen, setVideoChatOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  // Mobile: show the Service tier of categories behind an expander ("+ 8 more")
  // per design spec. Always visible on desktop via CSS.
  const [showAllCats, setShowAllCats] = useState(false);
  // Homeowner's first name — fetched once at mount for authenticated users
  // and used to personalise the voice/video-chat greeting.
  const [firstName, setFirstName] = useState<string | null>(null);
  // Best-effort IP-based zip fallback so the pros-nearby badge shows a
  // location that actually makes sense for the visitor (not a hardcoded
  // San Diego zip). Stays null if private network / upstream fails —
  // badge gracefully drops the "near <zip>" clause in that case.
  const [ipZip, setIpZip] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef(crypto.randomUUID());
  const abortRef = useRef<AbortController | null>(null);
  const homeContextRef = useRef<string>('');

  const scrollDown = () => setTimeout(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, 100);

  const addAssistant = useCallback((text: string) => {
    setMessages(m => {
      const next = [...m, { role: 'assistant', text }];
      if (next.length > 1) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      return next;
    });
  }, []);

  const addUser = useCallback((text: string) => {
    setMessages(m => [...m, { role: 'user', text }]);
    scrollDown();
  }, []);

  // Stream an AI message and call onDone with the full text when complete
  const streamAI = useCallback((userMsg: string, history: { role: 'user' | 'assistant'; content: string }[], onDone: (fullText: string) => void) => {
    setStreaming(true);
    const streamMsgId = `ai-${Date.now()}`;
    setMessages(m => [...m, { role: 'assistant', text: '', id: streamMsgId } as { role: string; text: string }]);
    scrollDown();

    let fullText = '';
    abortRef.current = diagnosticService.sendMessage(
      sessionIdRef.current,
      userMsg,
      {
        onToken: (token: string) => {
          fullText += token;
          const display = fullText.replace(/<\/?ready>/g, '').replace(/<read$/g, '').replace(/<rea$/g, '').replace(/<re$/g, '').replace(/<r$/g, '').replace(/<$/g, '').trim();
          setMessages(m => m.map(msg => ('id' in msg && (msg as { id?: string }).id === streamMsgId) ? { ...msg, text: display } : msg));
          scrollDown();
        },
        onDiagnosis: () => {},
        onJobSummary: () => {},
        onDone: () => { setStreaming(false); onDone(fullText); },
        onError: (err: Error) => {
          setStreaming(false);
          console.error('[GetQuotes AI]', err);
          setMessages(m => m.map(msg => ('id' in msg && (msg as { id?: string }).id === streamMsgId) ? { ...msg, text: 'Sorry, I had trouble analyzing that. Let me continue with what I have.' } : msg));
          onDone('');
        },
      },
      undefined,
      history,
    );
  }, []);

  // Greeting on mount — or resume after login
  useEffect(() => {
    window.scrollTo(0, 0);

    // Check if returning from Stripe payment — must have ?paid=1 in URL
    const urlParams = new URLSearchParams(window.location.search);
    const paidJob = sessionStorage.getItem('homie_paid_job');
    if (paidJob && urlParams.has('paid') && authService.isAuthenticated()) {
      sessionStorage.removeItem('homie_paid_job');
      // Clean URL
      window.history.replaceState({}, '', '/quote');
      try {
        const { jobId: paidJobId } = JSON.parse(paidJob) as { jobId: string; tier: string };
        // Verify payment with API before launching
        paymentService.getPaymentStatus(paidJobId).then(res => {
          if (res.data && (res.data.payment_status === 'authorized' || res.data.payment_status === 'paid')) {
            // Trigger dispatch in case webhook hasn't fired yet
            void fetchAPI('/api/v1/payments/dispatch/' + paidJobId, { method: 'POST' }).catch(() => {});
            setJobId(paidJobId);
            addAssistant("Payment confirmed! Launching your AI agent now \uD83D\uDE80");
            setPhase('diagnosis');
            setModalOpen(true);
            scrollDown();
          } else {
            addAssistant("Payment was not completed. Please try again.");
            setPhase('diagnosis');
            setModalOpen(true);
          }
        }).catch(() => {
          addAssistant("Could not verify payment. Please try again.");
          setPhase('diagnosis');
          setModalOpen(true);
        });
        return;
      } catch { /* ignore */ }
    } else if (paidJob && !urlParams.has('paid')) {
      // User hit back from Stripe without completing payment — full reload for clean state
      sessionStorage.removeItem('homie_paid_job');
      window.location.href = '/quote';
      return;
    }

    // Check if returning from login with pending quote — resume with modal open
    const pending = sessionStorage.getItem('homie_pending_quote');
    if (pending && authService.isAuthenticated()) {
      sessionStorage.removeItem('homie_pending_quote');
      try {
        const saved = JSON.parse(pending) as QuoteData;
        setData(saved);
        addAssistant("Welcome back! Let's finish setting up your search.");
        setPhase('diagnosis');
        setModalOpen(true);
        scrollDown();
        return;
      } catch { /* ignore bad data */ }
    }

    // If we restored a snapshot (messages already present), skip the fresh
    // greeting — the user is picking up where they left off.
    if (messages.length > 0) return;

    const t = setTimeout(() => {
      addAssistant("Hey! \uD83D\uDC4B I'm Homie. Let's get you some quotes. What kind of help do you need?");
      setPhase('category');
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addAssistant]);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // Load home details for context
  useEffect(() => {
    if (authService.isAuthenticated()) {
      accountService.getHome().then(res => {
        if (res.data) {
          homeContextRef.current = buildHomeContext(res.data);
        }
      }).catch(() => { /* ignore */ });
      // Also grab the first name so voice/video greetings can address the
      // homeowner by name ("Hi Pete, how can your Homie help…"). Silent on
      // failure — we fall back to the anonymous greeting bank.
      accountService.getProfile().then(res => {
        const fn = res.data?.first_name?.trim();
        if (fn) setFirstName(fn);
        // If the account has a zip on file, prefer it over IP lookup so we
        // respect the user's explicit location.
        const z = res.data?.zip_code?.trim();
        if (z && /^\d{5}$/.test(z)) setIpZip(z);
      }).catch(() => { /* ignore */ });
    }
  }, []);

  // Best-effort IP-based zip fallback. Fires independently of auth so
  // anonymous visitors also get a sensible "near <zip>" in the
  // pros-nearby badge instead of a hardcoded San Diego placeholder.
  useEffect(() => {
    // Skip if we already have a zip (either from account or user input).
    if (ipZip || data.zip) return;
    fetchAPI<{ zip: string | null; city: string | null; region: string | null }>('/api/v1/geo/ip-zip')
      .then(res => {
        const z = res.data?.zip;
        if (z && /^\d{5}$/.test(z)) setIpZip(z);
      })
      .catch(() => { /* best-effort — silent */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the in-flight intake to localStorage so closing the pricing
  // modal (or even the whole tab) doesn't lose the user's chat + diagnosis.
  // Only snapshots once there's something worth restoring — guards against
  // writing an empty shell over a more complete prior snapshot on first
  // render if restore didn't kick in.
  useEffect(() => {
    const meaningful = messages.length > 0 || !!data.a1 || !!data.category || !!data.aiDiagnosis;
    if (!meaningful) return;
    try {
      // Strip media data URLs (photo / video) — they can be multi-MB and
      // would blow the ~5MB localStorage quota fast. The user would have
      // to re-attach media on return, which is an acceptable tradeoff
      // for not losing the entire chat on quota-exceeded.
      const lightData: QuoteData = { ...data, photo: null, video: null, videoSeconds: undefined };
      // Also drop media-heavy chat bubbles to the same effect — the
      // "📸 Photo added" / "🎬 Video clip attached …s" bubbles stay,
      // but any raw data URLs embedded in message text get trimmed.
      const lightMessages = messages.map(m => {
        if (typeof m.text === 'string' && m.text.startsWith('data:')) {
          return { ...m, text: '(media attachment)' };
        }
        return m;
      });
      const snap: QuoteStateSnapshot = {
        data: lightData,
        messages: lightMessages,
        aiConvo: aiConvoRef.current,
        phase,
        costEstimate,
        savedAt: Date.now(),
      };
      localStorage.setItem(QUOTE_STATE_KEY, JSON.stringify(snap));
    } catch { /* quota / disabled / whatever — best-effort only */ }
  }, [messages, data, phase, costEstimate]);

  // Hard-reset helper: wipes in-flight state + the snapshot. Wired into
  // the nav "+ New" button (below) and available for future "start over"
  // affordances without needing a full page reload.
  const resetQuoteFlow = useCallback(() => {
    try { localStorage.removeItem(QUOTE_STATE_KEY); } catch { /* noop */ }
    aiConvoRef.current = [];
    setMessages([]);
    setData({ category: null, a1: null, aiDiagnosis: null, extra: null, photo: null, zip: '', timing: null, tier: null });
    setPhase('greeting');
    setCostEstimate(null);
    setJobId(null);
    setModalOpen(false);
    setVoiceOpen(false);
  }, []);

  // Live estimate fetch — fires as soon as we have a category + subcategory,
  // so the "Homie thinks" status card can show severity + $ range while the
  // user is still chatting. Re-fetches if category/subcategory/zip change.
  // Zip precedence: user-entered data.zip → IP-derived ipZip → hard fallback
  // (only as a last resort — lets the API respond with a regional default).
  useEffect(() => {
    if (!data.category || !data.a1) return;
    const zip = data.zip || ipZip || '10001';
    let cancelled = false;
    estimateService.generate({
      category: data.category,
      subcategory: data.a1,
      zip_code: zip,
      complexity: 'medium',
      urgency: data.timing || undefined,
    }).then(res => {
      if (cancelled) return;
      if (res.data) setCostEstimate(res.data);
    }).catch(() => { /* silent — status card falls back to category-only */ });
    return () => { cancelled = true; };
  }, [data.category, data.a1, data.zip, data.timing, ipZip]);

  const flow = data.category ? CATEGORY_FLOWS[data.category] : null;
  const [activeGroup, setActiveGroup] = useState<CatGroup | null>(null);

  const handleGroupSelect = (group: CatGroup) => {
    // If only one subcategory, skip drill-down
    if (group.subs.length === 1) {
      handleSubcategorySelect(group.subs[0], group.label);
      return;
    }
    setActiveGroup(group);
    setPhase('waiting');
    addUser(group.label);
    setTimeout(() => {
      addAssistant(`What type of ${group.label.toLowerCase()} do you need?`);
      setPhase('subcategory');
      scrollDown();
    }, 500);
  };

  const handleSubcategorySelect = (sub: SubCat, parentLabel?: string) => {
    const c = CATEGORY_FLOWS[sub.id];
    if (!c) return;
    setData(d => ({ ...d, category: sub.id }));
    setPhase('waiting');
    // If we skipped drill-down (single sub), show parent label
    addUser(parentLabel && sub.label.startsWith('General') ? parentLabel : sub.label);
    setTimeout(() => { addAssistant(c.q1.text); setPhase('q1'); }, 500);
  };

  const askFollowUp = (userAnswer: string, isFirst: boolean) => {
    const cat = data.category ? CATEGORY_FLOWS[data.category] : null;

    // Build conversation history for the AI
    if (isFirst) {
      const homeCtx = homeContextRef.current ? `[Home details: ${homeContextRef.current}] ` : '';
      aiConvoRef.current = [{ role: 'user', content: `${homeCtx}I need help with ${cat?.label}. Specifically: ${userAnswer}.` }];
    } else {
      aiConvoRef.current.push({ role: 'user', content: userAnswer });
    }

    const questionCount = aiConvoRef.current.filter(m => m.role === 'assistant').length;
    const detailsSoFar = aiConvoRef.current.filter(m => m.role === 'user').map(m => m.content).join('. ');

    setTimeout(() => {
      streamAI(
        `You are helping gather details from a homeowner who needs ${cat?.label} help so we can brief a service provider. Here is everything gathered so far: "${detailsSoFar}".

You have asked ${questionCount} follow-up question(s) so far. Your job:
- If you have enough specific detail for a provider to give an accurate quote (location in home, what's happening, severity/urgency, and any relevant specifics like brand, age, size), respond with ONLY the tag <ready> and nothing else.
- If critical details are still missing that a provider would need, ask ONE brief, specific follow-up question (under 2 sentences). Do not offer to fix the issue — we are finding them a provider. Do not ask about zip code, budget, or timing — the app handles that separately.
- You must include <ready> after at most 4 follow-up questions, even if some details are missing.
- For simple/straightforward issues (e.g. "toilet running", "locked out right now"), you can include <ready> after just 1 question if you already have enough context.`,
        aiConvoRef.current,
        (aiText) => {
          const cleaned = aiText.replace(/<\/?ready>/g, '').trim();
          if (aiText.includes('<ready>') || questionCount >= 4) {
            // AI says it has enough — remove the empty/ready-only streamed bubble
            if (!cleaned) {
              setMessages(m => m.filter(msg => !('id' in msg)));
            }
            const allUserDetails = aiConvoRef.current.filter(m => m.role === 'user').map(m => m.content).join('. ');
            setData(d => ({ ...d, extra: allUserDetails }));
            setTimeout(() => {
              addAssistant("Anything else you want the pro to know? You can also add a photo to help with the diagnosis.");
              setPhase('extra');
              scrollDown();
            }, 300);
          } else {
            aiConvoRef.current.push({ role: 'assistant', content: cleaned });
            setPhase('ai_followup');
            scrollDown();
          }
        },
      );
    }, 300);
  };

  const handleQ1 = (answer: string) => {
    setData(d => ({ ...d, a1: answer }));
    setPhase('waiting');
    addUser(answer);
    askFollowUp(answer, true);
  };

  const handleFollowUpAnswer = (answer: string) => {
    setPhase('waiting');
    addUser(answer);
    askFollowUp(answer, false);
  };

  const handleSkipFollowUp = () => {
    setPhase('waiting');
    addUser("No, that covers it");
    const allUserDetails = aiConvoRef.current.filter(m => m.role === 'user').map(m => m.content).join('. ');
    setData(d => ({ ...d, extra: allUserDetails }));
    setTimeout(() => {
      addAssistant("Anything else you want the pro to know? You can also add a photo to help with the diagnosis.");
      setPhase('extra');
      scrollDown();
    }, 500);
  };

  const handleExtraDetails = (text: string) => {
    const updatedExtra = (data.extra ? data.extra + '. ' : '') + text;
    setData(d => ({ ...d, extra: updatedExtra }));
    setPhase('waiting');
    addUser(text);
    generateDiagnosis(updatedExtra);
  };

  const handleSkipExtra = () => {
    setPhase('waiting');
    addUser("That's everything");
    generateDiagnosis(data.extra ?? '');
  };

  const generateDiagnosis = (extraDetails: string) => {
    const cat = data.category ? CATEGORY_FLOWS[data.category] : null;
    const catLabel = cat?.label ?? data.category ?? 'home service';

    // Build the full dialog transcript — INCLUDING Homie's side of the
    // conversation. When the user came through video chat, Homie often
    // identified brand/model ("that's a Samsung DW80K5050US") or read
    // error codes off a display. Those observations only live in the
    // assistant turns, so filtering them out (as the old code did) threw
    // away exactly the details that make a dispatch summary useful.
    const dialogLines: string[] = [];
    if (data.a1) dialogLines.push(`Homeowner (opening): ${data.a1}`);
    for (const m of aiConvoRef.current) {
      const content = (m.content || '').trim();
      if (content.length < 3) continue;
      dialogLines.push(`${m.role === 'user' ? 'Homeowner' : 'Homie (AI)'}: ${content}`);
    }
    if (extraDetails && extraDetails.trim().length > 3) {
      dialogLines.push(`Homeowner (extras): ${extraDetails.trim()}`);
    }
    const dialog = dialogLines.join('\n');

    // Use a fresh session to generate the summary (not the chat session)
    const summarySessionId = crypto.randomUUID();
    setStreaming(true);
    let diagText = '';
    setTimeout(() => {
      abortRef.current = diagnosticService.sendMessage(
        summarySessionId,
        `Write a 2-4 sentence provider-ready dispatch summary for a ${catLabel} job.

A homeowner just had a live consultation with an AI assistant (possibly over video, which means the AI may have visually identified appliances, read error codes off panels, or spotted damage directly). The full transcript is below.

CRITICAL: The summary MUST include any of these details that appear anywhere in the transcript — especially when the AI assistant identified them:
- Brand and model number (e.g. "Samsung DW80K5050US", "LG WM3900HWA")
- Error codes or fault codes (e.g. "5C", "E1")
- Specific failing component named by the AI (e.g. "drain pump", "igniter")
- Visible damage described by the AI (e.g. "water stain on cabinet base", "corrosion at valve")
- How long the problem has been happening
- Any safety concerns (water active, gas smell, sparking, etc.)

Transcript:
${dialog}

Write ONLY the summary — no questions, no conversational language, no greetings, no markdown. Start with the specific appliance/system and model if known. End with the likely cause or symptom. This text goes straight to service providers so they can decide whether to bid.`,
        {
          onToken: (token: string) => { diagText += token; },
          onDiagnosis: () => {},
          onJobSummary: () => {},
          onDone: () => {
            setStreaming(false);
            // Strip any follow-up questions the AI might have added
            const cleaned = diagText.replace(/\n\n.*\?$/s, '').replace(/Do you.*\?/g, '').replace(/Is there.*\?/g, '').trim();
            setData(d => ({ ...d, aiDiagnosis: cleaned || diagText.trim() }));
            setTimeout(() => {
              addAssistant("Got it \u2014 I've prepared your diagnosis. Tap Continue when you're ready to find a pro.");
              setPhase('diagnosis');
              // Don't auto-open the pricing modal — the Continue bar below
              // becomes the explicit user-initiated gate into zip/timing/tier.
              scrollDown();
            }, 300);
          },
          onError: () => {
            setStreaming(false);
            // Fallback summary — concatenate the user's side of the dialog
            // (we don't have `context` anymore because we now pass the full
            // dialog to Claude; reconstruct a minimal one-liner here).
            const fallbackUserParts = aiConvoRef.current
              .filter(m => m.role === 'user')
              .map(m => m.content.trim())
              .filter(c => c.length > 3);
            const fallback = (data.a1 ? `${data.a1}. ` : '') + fallbackUserParts.join('. ') +
              (extraDetails ? `. ${extraDetails}` : '');
            setData(d => ({ ...d, aiDiagnosis: `${catLabel} issue: ${fallback.trim()}` }));
            setTimeout(() => {
              addAssistant("Got it \u2014 I've prepared your diagnosis. Tap Continue when you're ready to find a pro.");
              setPhase('diagnosis');
              // Don't auto-open the pricing modal — user taps Continue.
              scrollDown();
            }, 300);
          },
        },
      );
    }, 300);
  };

  const handlePhoto = (url: string) => {
    setData(d => ({ ...d, photo: url }));
    setMessages(m => [...m, { role: 'user', text: '\uD83D\uDCF8 Photo added' }]);
    scrollDown();
  };

  // Video recorder — attaches the clip alongside any photo as an additional
  // piece of context. For now we reuse data.photo for single-attachment flow;
  // video clips drop an announcement message in the chat and keep the blob
  // as a secondary attachment on data.video (new optional field).
  const handleVideo = (dataUrl: string, durationSec: number) => {
    setData(d => ({ ...d, video: dataUrl, videoSeconds: durationSec }));
    setMessages(m => [...m, { role: 'user', text: `\uD83C\uDFAC Video clip attached · ${durationSec}s` }]);
    scrollDown();
  };

  // Voice-turn: each completed exchange from the inline voice panel. Pushes
  // both the user's spoken turn and Homie's reply into the main chat scroll
  // as normal bubbles so the checklist + status card update naturally as if
  // the user were typing. Also keeps aiConvoRef in sync in case the user
  // drops out of voice mode mid-way and the existing text-chat pipeline
  // needs to pick up. `inferredCategory` comes from Homie's <category> tag
  // on each voice reply — falls back to whatever the UI already had (and
  // only lands on 'general' if Homie genuinely couldn't classify).
  const handleVoiceTurn = useCallback((userText: string, assistantText: string, inferredCategory: string | null) => {
    const userTrimmed = userText.trim();
    const botTrimmed = assistantText.trim();
    if (!userTrimmed) return;
    setMessages(m => {
      const next = [...m];
      next.push({ role: 'user', text: `\uD83C\uDFA4 ${userTrimmed}` });
      if (botTrimmed) next.push({ role: 'assistant', text: botTrimmed });
      return next;
    });
    aiConvoRef.current = [
      ...aiConvoRef.current,
      { role: 'user', content: userTrimmed },
      ...(botTrimmed ? [{ role: 'assistant' as const, content: botTrimmed }] : []),
    ];
    // Category precedence: if Homie's classifier returned a valid ID that
    // exists in our flow map, use it (even if the UI already had a guess —
    // Homie sees the full conversation and can correct earlier misses).
    // Otherwise keep whatever the UI already had, falling back to 'general'
    // only on the first turn when nothing else is known.
    const validCategory = inferredCategory && CATEGORY_FLOWS[inferredCategory] ? inferredCategory : null;
    setData(d => {
      const nextCategory = validCategory ?? d.category ?? 'general';
      return { ...d, category: nextCategory, a1: d.a1 || userTrimmed };
    });
    scrollDown();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Voice-ready: <ready/> tag detected OR user hit "I'm done". Closes the
  // inline panel, finalises the seeded data, and jumps STRAIGHT to the
  // dispatch-brief generation — no intermediate "Want to attach a photo?"
  // prompt, since voice already captured enough context. The user sees a
  // typing indicator, then the diagnosis, then the Continue button.
  //
  // Plain const (not useCallback) so the closure always references the
  // current-render generateDiagnosis, which reads the just-committed
  // data.category / data.a1 that handleVoiceTurn set during the voice
  // conversation.
  const handleVoiceComplete = (payload: { transcript: string; history: { role: 'user' | 'assistant'; content: string }[] }) => {
    const { transcript, history } = payload;
    const trimmed = transcript.trim();
    setVoiceOpen(false);
    if (!trimmed) return;
    // Finalise the seeded data — handleVoiceTurn was updating category/a1
    // per-turn; this ensures `extra` is set so the dispatch summary has
    // the full voice transcript available.
    setData(d => ({
      ...d,
      category: d.category ?? 'general',
      a1: d.a1 || trimmed,
      extra: trimmed,
    }));
    aiConvoRef.current = history.map(h => ({ role: h.role, content: h.content }));
    // Skip the 'extra' phase entirely — go right into the AI dispatch
    // summary. aiConvoRef already holds the full voice transcript so we
    // pass an empty extraDetails string to avoid duplicating content.
    generateDiagnosis('');
    scrollDown();
  };

  // Direct-path: user types a description on the initial screen without
  // picking a category tile. We bypass the tile → sub → q1 pipeline and go
  // straight into the AI follow-up conversation. Category defaults to
  // 'general' (Handyman) — the AI clarifies as needed, and the diagnosis
  // summary step re-classifies from the full conversation context.
  const handleDirectText = useCallback((text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 12) return;
    setData(d => ({ ...d, category: 'general', a1: trimmed }));
    setPhase('waiting');
    addUser(trimmed);
    askFollowUp(trimmed, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addUser]);

  const repairGroups = CATEGORY_TREE.filter(g => g.type === 'repair').map(g => ({ id: g.label, icon: g.icon, label: g.label }));
  const serviceGroups = CATEGORY_TREE.filter(g => g.type === 'service').map(g => ({ id: g.label, icon: g.icon, label: g.label }));

  // ── Right panel derived values ─────────────────────────────────────────
  // Distill current state into the fields the live "homie is listening"
  // card needs. Falls back to soft "—" when a section isn't known yet.
  const catMeta = data.category ? CATEGORY_FLOWS[data.category] : null;
  const repairGroupMeta = catMeta ? CATEGORY_TREE.find(g => g.subs.some(s => s.id === data.category)) : null;
  const severityLabel: string | null = costEstimate
    ? (costEstimate.estimateHighCents > 50000 ? 'Medium' : 'Minor')
    : null;
  const estRange: string | null = costEstimate
    ? `$${Math.round(costEstimate.estimateLowCents / 100)}–$${Math.round(costEstimate.estimateHighCents / 100)}`
    : null;
  // Reused: the existing phase pipeline drives the checklist
  const checklist = [
    { done: !!data.category, txt: data.category ? `Category: ${catMeta?.label ?? data.category}` : 'Matching a category' },
    { done: !!data.a1, txt: data.a1 ? 'Problem area located' : 'Locating the problem' },
    { done: phase === 'extra' || phase === 'diagnosis', txt: 'Severity & specifics assessed' },
    { done: !!data.photo, txt: 'Photo / video / voice attached', opt: true },
    { done: phase === 'diagnosis', txt: 'Dispatch brief ready' },
    { done: false, txt: 'Next: confirm zip, urgency & tier', opt: true },
  ];
  const nextIdx = checklist.findIndex(x => !x.done);

  return (
    <div style={{ minHeight: '100vh', background: W, fontFamily: "'DM Sans', sans-serif", overflowX: 'hidden', maxWidth: '100vw' }}>
      <SEO
        title="Get Home Repair Quotes"
        description="Get multiple quotes from local service providers in minutes. Homie contacts pros for you via phone, text, and email — no more calling around."
        canonical="/quote"
      />
      <style>{`
        @keyframes fadeSlide { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 4px; }
        @media (max-width: 980px) {
          .gq-split { grid-template-columns: 1fr !important; gap: 12px !important; }
          /* Critical: grid items default to min-width: auto which prevents
             them from shrinking below their content's intrinsic width. A
             long voice-chat bubble (or any unbreakable string) would push
             the column — and the whole page — wider than the viewport.
             Forcing min-width:0 + max-width:100% lets the column clip to
             the viewport so word-wrap can do its job inside the bubbles. */
          .gq-split > * { min-width: 0 !important; max-width: 100% !important; }
          .gq-chat-area { min-width: 0 !important; max-width: 100% !important; }
          /* Flex rows (chat bubbles are flex containers with avatar +
             bubble) also need min-width:0 on the whole row to shrink. */
          .gq-chat-area > div { min-width: 0; }
          .gq-chat-area > div > div { min-width: 0; }
          /* Drop the full desktop right panel on mobile — replaced by the
             compact .gq-mobile-status block at the bottom of the chat.
             Keeps the page from stacking a second full-height card below
             the conversation. */
          .gq-right-panel { display: none !important; }
          .gq-mobile-status { display: flex !important; }
          /* Desktop indents the chat column by 42px to align with the
             assistant avatar. On mobile that eats a big chunk of a narrow
             viewport — collapse all 42px left-indents inside the chat to 0
             so the text input, quick replies, and action rows fill the
             available width. Targets any element whose inline style has
             "margin-left: 42px" (how React serialises marginLeft: 42). */
          .gq-split [style*="margin-left: 42px"] { margin-left: 0 !important; }
          .gq-direct { margin-left: 0 !important; }
        }
        /* Expandable categories — service tier stays hidden on BOTH
           desktop and mobile until the user taps "+ 8 more". The
           .gq-cat-expanded class is toggled via React state (showAllCats)
           when the pill is pressed. Applying globally keeps the desktop
           grid compact: only 8 Repair tiles show up front. */
        .gq-cat-service:not(.gq-cat-expanded) { display: none !important; }
        .gq-cat-more-btn { display: block !important; }
        @media (max-width: 480px) {
          .gq-cat-grid { grid-template-columns: repeat(3, 1fr) !important; }
          .gq-section { padding: 16px 16px 80px !important; }
        }
      `}</style>

      {/* Sticky nav — homie wordmark + back + avatar */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px) saturate(180%)',
        padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {(() => {
            const backTo = authService.isAuthenticated() ? '/account' : '/';
            const backTitle = backTo === '/account' ? 'Back to my account' : 'Back to home';
            return (
              <>
                <button onClick={() => navigate(backTo)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', fontSize: 18, color: DIM, display: 'flex', alignItems: 'center' }} title={backTitle}>←</button>
                {/* Mark — 48×48, rx14, orange tile, white house, orange circle in gable */}
                <svg width={30} height={30} viewBox="0 0 48 48" onClick={() => navigate(backTo)} style={{ cursor: 'pointer' }}>
                  <rect width="48" height="48" rx="14" fill={O} />
                  <path d="M24 12L10 23H14V35H21V28H27V35H34V23H38L24 12Z" fill="#fff" />
                  <circle cx="24" cy="22" r="3" fill={O} />
                </svg>
                <span onClick={() => navigate(backTo)} style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: D, cursor: 'pointer', letterSpacing: '-.01em' }}>homie</span>
              </>
            );
          })()}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => { resetQuoteFlow(); window.location.href = '/quote'; }} style={{
            background: 'none', border: `1px solid ${BORDER}`, borderRadius: 8,
            padding: '5px 12px', fontSize: 13, fontWeight: 600, color: DIM,
            cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
          }}>+ New</button>
          <AvatarDropdown />
        </div>
      </nav>

      {/* Demo banner */}
      {isDemo && (
        <div style={{
          background: '#EFF6FF', borderBottom: '1px solid rgba(37,99,235,0.15)',
          padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontSize: 13, color: '#2563EB', fontWeight: 500,
        }}>
          Demo mode — no payment required, no real outreach
        </div>
      )}

      {/* Main split layout — left intake chat, right live status */}
      <section className="gq-section" style={{ padding: '32px 24px 80px', overflowX: 'hidden' }}>
        <div className="gq-split" style={{
          maxWidth: 1280, margin: '0 auto',
          display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 28, alignItems: 'flex-start',
        }}>
          {/* LEFT — progressive chat-style intake */}
          <div>
            {/* Live status pill — business hours = Online, otherwise After hours */}
            {(() => {
              const hour = new Date().getHours();
              const bizOpen = hour >= 8 && hour < 18;
              return (
                <div title={bizOpen ? undefined : 'Some businesses may not be reachable outside 8am–6pm. Responses may be limited.'} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '5px 11px 5px 10px', borderRadius: 100,
                  background: bizOpen ? 'rgba(27,158,119,.1)' : 'rgba(239,159,39,.12)',
                  border: `1px solid ${bizOpen ? 'rgba(27,158,119,.22)' : 'rgba(239,159,39,.28)'}`,
                  fontSize: 11.5, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
                  color: bizOpen ? G : AMBER, letterSpacing: '.02em',
                }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', background: bizOpen ? G : AMBER, flexShrink: 0,
                    boxShadow: bizOpen ? `0 0 0 3px ${G}22` : 'none',
                    animation: bizOpen ? 'pulse 1.8s infinite' : 'none',
                  }} />
                  {bizOpen ? 'Online' : 'After hours · responses may take longer'}
                  {bizOpen && <span style={{ color: DIM, fontWeight: 600, fontSize: 10.5 }}>· 8am–6pm</span>}
                </div>
              );
            })()}

            {/* Hero removed — chat area sits directly under the status
                pill so users land straight on the intake. */}
            <div style={{ height: 14 }} />

            {/* Chat log — existing AssistantMsg/UserMsg bubbles */}
            <div className="gq-chat-area">
              {messages.map((m, i) => (
                m.role === 'assistant'
                  ? <AssistantMsg key={i} text={m.text} animate={i === messages.length - 1 && i > 0} />
                  : <UserMsg key={i} text={m.text} />
              ))}

              {phase === 'diagnosis' && data.a1 && (
                <>
                  <DiagnosisSummary data={data} />
                  {/* Pros-nearby badge — concrete local-supply signal under
                      the dispatch brief. Always says "near you" regardless
                      of whether we have a zip resolved (feels friendlier
                      than surfacing a raw zip back at the user). */}
                  {(repairGroupMeta || catMeta) && (() => {
                    const groupLabel = repairGroupMeta?.label || catMeta?.label || 'home service';
                    const count = prosNearbyForGroup(groupLabel);
                    return (
                      <div style={{
                        marginLeft: 42, marginBottom: 16, animation: 'fadeSlide 0.3s ease',
                        padding: '10px 14px', borderRadius: 12,
                        background: `linear-gradient(90deg, ${O}14, ${O}06)`,
                        border: `1px solid ${O}22`,
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <div style={{ position: 'relative', width: 10, height: 10, flexShrink: 0 }}>
                          <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: G }} />
                          <span style={{ position: 'absolute', inset: -4, borderRadius: '50%', background: G, opacity: .25, animation: 'pulse 2s infinite' }} />
                        </div>
                        <div style={{ fontSize: 12.5, color: D, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", flex: 1, minWidth: 0 }}>
                          <span style={{ color: O, fontWeight: 700 }}>{count} {groupLabel.toLowerCase()} pros</span>
                          <span style={{ color: DIM, fontWeight: 500 }}> available near you</span>
                        </div>
                        <div style={{ fontSize: 10, color: DIM, fontFamily: "'DM Mono',monospace", letterSpacing: 1, fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>Live</div>
                      </div>
                    );
                  })()}
                  {costEstimate && (
                    <div style={{ marginLeft: 42, marginBottom: 16, animation: 'fadeSlide 0.3s ease' }}>
                      <EstimateCard estimate={costEstimate} />
                    </div>
                  )}
                </>
              )}

              {phase === 'category' && (
                <>
                  <div style={{ marginLeft: 42, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                    <span style={{ fontSize: 9.5, fontFamily: "'DM Mono',monospace", letterSpacing: 1.4, textTransform: 'uppercase', color: DIM, fontWeight: 700 }}>Repair · most common</span>
                    <span style={{ height: 1, flex: 1, background: BORDER }} />
                  </div>
                  {/* Pill cloud — compact, flow-wrapped category tiles per
                      design spec (borderRadius 100, 8/12 padding, icon + label
                      inline). Replaces the old 4-column grid on both desktop
                      and mobile. */}
                  <div style={{ marginLeft: 42, marginBottom: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {repairGroups.map(group => (
                      <button
                        key={group.id}
                        onClick={() => {
                          const g = CATEGORY_TREE.find(x => x.label === group.label);
                          if (g) handleGroupSelect(g);
                        }}
                        style={{
                          background: '#fff', color: D,
                          border: `1px solid ${BORDER}`, borderRadius: 100,
                          padding: '8px 12px', fontSize: 13, fontWeight: 600,
                          cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          transition: 'all .15s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = O; (e.currentTarget as HTMLButtonElement).style.background = `${O}0a`; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER; (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
                      >
                        <span style={{ fontSize: 14 }}>{group.icon}</span>
                        {group.label}
                      </button>
                    ))}
                  </div>

                  {/* Service tier — collapsed by default on both desktop and
                      mobile. The class pair `gq-cat-service` + showAllCats
                      state is used by the global CSS rule above to toggle
                      visibility when the "+ 8 more" pill is pressed. */}
                  <div className={`gq-cat-service ${showAllCats ? 'gq-cat-expanded' : ''}`}>
                    <div style={{ marginLeft: 42, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                      <span style={{ fontSize: 9.5, fontFamily: "'DM Mono',monospace", letterSpacing: 1.4, textTransform: 'uppercase', color: DIM, fontWeight: 700 }}>Services · scheduled work</span>
                      <span style={{ height: 1, flex: 1, background: BORDER }} />
                    </div>
                    <div style={{ marginLeft: 42, marginBottom: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {serviceGroups.map(group => (
                        <button
                          key={group.id}
                          onClick={() => {
                            const g = CATEGORY_TREE.find(x => x.label === group.label);
                            if (g) handleGroupSelect(g);
                          }}
                          style={{
                            background: '#fff', color: D,
                            border: `1px solid ${BORDER}`, borderRadius: 100,
                            padding: '8px 12px', fontSize: 13, fontWeight: 600,
                            cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            transition: 'all .15s',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = O; (e.currentTarget as HTMLButtonElement).style.background = `${O}0a`; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER; (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
                        >
                          <span style={{ fontSize: 14 }}>{group.icon}</span>
                          {group.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* "+ 8 more …" expand pill. Rendered only when collapsed
                      (React-controlled via showAllCats) so it disappears once
                      the service tier is revealed. */}
                  {!showAllCats && (
                    <button
                      type="button"
                      className="gq-cat-more-btn"
                      onClick={() => setShowAllCats(true)}
                      style={{
                        display: 'block', // global — service tier collapsible on all breakpoints
                        width: '100%',
                        marginBottom: 14,
                        background: 'transparent',
                        border: `1px dashed ${BORDER}`,
                        borderRadius: 100,
                        padding: '10px 14px',
                        fontSize: 12,
                        fontWeight: 600,
                        color: DIM,
                        cursor: 'pointer',
                        fontFamily: "'DM Sans',sans-serif",
                      }}
                    >
                      + 8 more · cleaning, landscape, painting, moving…
                    </button>
                  )}

                  {/* Direct-path fast lane — typing input OR inline voice
                      panel depending on whether the user tapped "Talk to
                      Homie". We swap the two in place so the chat + status
                      card stay visible during voice turns. */}
                  {voiceOpen ? (
                    <div style={{ marginLeft: 42, marginBottom: 14 }} className="gq-direct">
                      <InlineVoicePanel
                        active={voiceOpen}
                        onExit={() => setVoiceOpen(false)}
                        category={data.category}
                        firstName={firstName}
                        onTurn={handleVoiceTurn}
                        onReady={handleVoiceComplete}
                      />
                    </div>
                  ) : videoChatOpen ? (
                    <div style={{ marginLeft: 42, marginBottom: 14 }} className="gq-direct">
                      <VideoChatPanel
                        active={videoChatOpen}
                        onExit={() => setVideoChatOpen(false)}
                        category={data.category}
                        firstName={firstName}
                        onTurn={handleVoiceTurn}
                        onReady={handleVoiceComplete}
                      />
                    </div>
                  ) : (
                    <DirectInput
                      examples={DIRECT_EXAMPLES}
                      onSubmit={handleDirectText}
                      onPhoto={handlePhoto}
                      onVideoClick={() => {
                        // Same iOS audio-unlock trick as voice — prime the
                        // shared <audio> element inside this gesture so
                        // Homie's TTS replies play later.
                        primeAudio();
                        setVideoChatOpen(true);
                      }}
                      onVoiceClick={() => {
                        // Unlock audio output for iOS Safari — must fire
                        // within this synchronous tap handler so the shared
                        // <audio> element becomes playable from the async
                        // Whisper/Claude/ElevenLabs chain later.
                        primeAudio();
                        setVoiceOpen(true);
                      }}
                    />
                  )}
                </>
              )}
              {phase === 'subcategory' && activeGroup && (
                <QuickReplies
                  options={activeGroup.subs.map(s => ({ id: s.id, icon: s.icon, label: s.label }))}
                  onSelect={(opt) => {
                    const sub = activeGroup.subs.find(s => s.id === (typeof opt === 'string' ? opt : opt.id));
                    if (sub) handleSubcategorySelect(sub);
                  }}
                  columns={activeGroup.subs.length <= 3 ? activeGroup.subs.length : 3}
                />
              )}
              {phase === 'q1' && flow && <QuickReplies options={flow.q1.options} onSelect={(opt) => handleQ1(opt as string)} />}
              {phase === 'ai_followup' && !streaming && (
                <>
                  <TextInput placeholder="Type your answer..." onSubmit={handleFollowUpAnswer} />
                  <div style={{ marginLeft: 42, marginBottom: 16 }}>
                    <button onClick={handleSkipFollowUp} style={{
                      padding: '8px 18px', borderRadius: 100, border: 'none', background: 'rgba(0,0,0,0.04)',
                      color: '#9B9490', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                    }}>No, that covers it →</button>
                  </div>
                </>
              )}
              {phase === 'extra' && !streaming && (
                <>
                  <TextInput placeholder="Any other details..." onSubmit={handleExtraDetails} />
                  <PhotoUpload onUpload={handlePhoto} />
                  <div style={{ marginLeft: 42, marginBottom: 16 }}>
                    <button onClick={handleSkipExtra} style={{
                      padding: '8px 18px', borderRadius: 100, border: 'none', background: 'rgba(0,0,0,0.04)',
                      color: '#9B9490', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                    }}>Skip — that's everything →</button>
                  </div>
                </>
              )}
              {phase === 'diagnosis' && !modalOpen && data.a1 && (
                <div style={{ marginLeft: 42, marginBottom: 16, animation: 'fadeSlide 0.3s ease' }}>
                  <button onClick={() => setModalOpen(true)} style={{
                    padding: '16px 28px', borderRadius: 16, border: 'none', fontSize: 15, fontWeight: 700,
                    background: O, color: 'white', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                    boxShadow: `0 12px 32px -10px ${O}8c`,
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                  }}>Continue — confirm zip &amp; urgency →</button>
                </div>
              )}

              {/* Mobile-only bottom status card — "Homie thinks" pattern from
                  the design. Shown once we have enough context to display
                  something meaningful (category inferred OR diagnosis ready).
                  Sits just above the final scroll anchor so it's the last
                  thing visible before the user acts. */}
              {(repairGroupMeta || catMeta || data.aiDiagnosis) && (
                <div
                  className="gq-mobile-status"
                  style={{
                    display: 'none', // flex on mobile via @media rule
                    alignItems: 'center', gap: 10,
                    padding: 12,
                    marginTop: 4,
                    marginBottom: 16,
                    background: '#fff',
                    borderRadius: 14,
                    border: `1px solid ${BORDER}`,
                    boxShadow: '0 6px 20px -12px rgba(0,0,0,.08)',
                    animation: 'fadeSlide 0.3s ease',
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 9,
                    background: `${O}22`, border: `1px solid ${O}33`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 15, flexShrink: 0,
                  }}>
                    {repairGroupMeta?.icon || catMeta?.icon || '✨'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9, color: DIM, fontFamily: "'DM Mono',monospace", letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700 }}>
                      Homie thinks
                    </div>
                    <div style={{ fontFamily: "'Fraunces',serif", fontSize: 13, fontWeight: 700, color: D, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {data.aiDiagnosis
                        ? (data.aiDiagnosis.length > 60 ? data.aiDiagnosis.slice(0, 57) + '…' : data.aiDiagnosis)
                        : (catMeta?.label || repairGroupMeta?.label || data.a1 || '—')}
                    </div>
                    {(severityLabel || estRange) && (
                      <div style={{ fontSize: 10.5, color: DIM, marginTop: 1, fontFamily: "'DM Sans',sans-serif" }}>
                        {severityLabel && (
                          <span style={{ color: severityLabel === 'Medium' ? AMBER : G, fontWeight: 700 }}>{severityLabel}</span>
                        )}
                        {severityLabel && estRange && <span style={{ opacity: .4, margin: '0 6px' }}>·</span>}
                        {estRange && <span style={{ color: D, fontWeight: 700 }}>{estRange}</span>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* RIGHT — live "homie is listening" panel */}
          <div className="gq-right-panel" style={{ position: 'sticky', top: 92 }}>
            <div style={{
              background: '#fff', borderRadius: 24, border: `1px solid ${BORDER}`,
              padding: '24px 24px 22px', boxShadow: '0 20px 60px -24px rgba(0,0,0,.1)',
            }}>
              {/* Panel header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: O, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                    <path d="M12 2l2 7 7 2-7 2-2 7-2-7-7-2 7-2 2-7z" fill="#fff" />
                  </svg>
                  <span style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: '50%', background: G, border: '2px solid #fff', animation: 'pulse 1.8s infinite' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'Fraunces',serif", fontWeight: 700, fontSize: 18, color: D }}>homie is listening</div>
                  <div style={{ fontSize: 12, color: DIM, fontFamily: "'DM Mono',monospace" }}>updates as you chat</div>
                </div>
              </div>

              {/* Diagnosis grid — populated progressively */}
              {(catMeta || costEstimate || data.aiDiagnosis) ? (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 14, borderRadius: 14, background: W }}>
                    <div>
                      <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Problem</div>
                      <div style={{ fontFamily: "'Fraunces',serif", fontSize: 15, fontWeight: 600, color: D, marginTop: 3, lineHeight: 1.25 }}>
                        {data.aiDiagnosis
                          ? (data.aiDiagnosis.length > 68 ? data.aiDiagnosis.slice(0, 65) + '…' : data.aiDiagnosis)
                          : (data.a1 || '—')}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Category</div>
                      <div style={{ fontFamily: "'Fraunces',serif", fontSize: 15, fontWeight: 700, color: D, marginTop: 3 }}>
                        {repairGroupMeta?.label || catMeta?.label || '—'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Severity</div>
                      <div style={{ fontFamily: "'Fraunces',serif", fontSize: 15, fontWeight: 700, color: severityLabel === 'Medium' ? AMBER : severityLabel === 'Minor' ? G : D, marginTop: 3 }}>
                        {severityLabel || '—'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Est.</div>
                      <div style={{ fontFamily: "'Fraunces',serif", fontSize: 15, fontWeight: 700, color: D, marginTop: 3 }}>
                        {estRange || '—'}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '20px 14px', borderRadius: 14, background: W, textAlign: 'center', color: DIM, fontSize: 13, marginBottom: 18, border: `1px dashed ${BORDER}` }}>
                  Start describing — I'll read along ↗
                </div>
              )}

              {/* Pros-nearby badge — same pattern as the one below the
                  dispatch brief in the chat column; shown here as soon as
                  a category is known so the user sees live-supply signal
                  while still chatting. */}
              {(repairGroupMeta || catMeta) && (() => {
                const groupLabel = repairGroupMeta?.label || catMeta?.label || 'home service';
                const count = prosNearbyForGroup(groupLabel);
                return (
                  <div style={{
                    marginBottom: 18,
                    padding: '10px 14px', borderRadius: 12,
                    background: `linear-gradient(90deg, ${O}14, ${O}06)`,
                    border: `1px solid ${O}22`,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{ position: 'relative', width: 10, height: 10, flexShrink: 0 }}>
                      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: G }} />
                      <span style={{ position: 'absolute', inset: -4, borderRadius: '50%', background: G, opacity: .25, animation: 'pulse 2s infinite' }} />
                    </div>
                    <div style={{ fontSize: 12.5, color: D, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", flex: 1, minWidth: 0 }}>
                      <span style={{ color: O, fontWeight: 700 }}>{count} {groupLabel.toLowerCase()} pros</span>
                      <span style={{ color: DIM, fontWeight: 500 }}> near you</span>
                    </div>
                    <div style={{ fontSize: 10, color: DIM, fontFamily: "'DM Mono',monospace", letterSpacing: 1, fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>Live</div>
                  </div>
                );
              })()}

              {/* Checklist */}
              <div style={{ fontSize: 11, color: DIM, textTransform: 'uppercase', letterSpacing: 1.4, fontWeight: 700, marginBottom: 10, fontFamily: "'DM Mono',monospace" }}>Checklist</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {checklist.map((p, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10,
                    background: p.done ? 'rgba(27,158,119,.07)' : 'transparent',
                    border: `1px solid ${p.done ? 'rgba(27,158,119,.2)' : 'transparent'}`,
                    transition: 'all .2s',
                  }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: p.done ? G : 'transparent', border: p.done ? 'none' : `1.5px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                      {p.done && '✓'}
                    </div>
                    <div style={{ flex: 1, fontSize: 13, color: p.done ? D : DIM, fontWeight: p.done ? 600 : 500, fontFamily: "'DM Sans',sans-serif" }}>
                      {p.txt} {p.opt && <span style={{ fontSize: 10, color: DIM, fontWeight: 500, marginLeft: 4 }}>(optional)</span>}
                    </div>
                    {i === nextIdx && (
                      <span style={{ fontSize: 10, color: O, fontFamily: "'DM Mono',monospace", letterSpacing: 1, fontWeight: 700 }}>NEXT</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Assurance card — "Speed" preset (⚡) per design spec */}
            <div style={{
              marginTop: 14, padding: '14px 18px',
              background: `linear-gradient(135deg, ${D} 0%, #3A3430 100%)`,
              color: '#fff', borderRadius: 16, fontFamily: "'DM Sans',sans-serif",
              display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: `0 10px 30px -12px ${D}66`,
            }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{'\u26A1'}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Quotes in ~2 minutes</div>
                <div style={{ fontSize: 12, opacity: .75, marginTop: 2 }}>No calling around. No endless forms.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Video chat panel is rendered INLINE inside the chat column (see
          `<VideoChatPanel>` above). The standalone VideoRecorder modal has
          been retired — the Video button now opens a live video chat with
          Homie instead of recording a detached clip. */}

      {/* Voice conversation is rendered INLINE inside the chat column now —
          see `<InlineVoicePanel>` above where DirectInput would otherwise
          sit. No page-level modal mount needed. */}

      {/* Quote Outreach Modal */}
      <QuoteOutreachModal
        isOpen={modalOpen}
        onClose={(hasJob) => {
          setModalOpen(false);
          if (hasJob) {
            // Booked — drop the snapshot so the next /quote visit starts
            // fresh instead of restoring the completed conversation.
            try { localStorage.removeItem(QUOTE_STATE_KEY); } catch { /* noop */ }
            navigate('/account?tab=quotes');
          }
          // If !hasJob: keep every piece of state (chat, diagnosis, phase,
          // estimate) intact so the user can review what they told Homie
          // and re-tap Continue without starting over.
        }}
        diagnosis={data.aiDiagnosis || ''}
        category={data.category || ''}
        subcategory={data.a1 || ''}
        costEstimate={costEstimate}
        isDemo={isDemo}
        initialJobId={jobId}
        onBooked={(providerName: string) => {
          addAssistant(`Great news! ${providerName} has been booked. They'll be in touch to confirm details.`);
        }}
      />
    </div>
  );
}
