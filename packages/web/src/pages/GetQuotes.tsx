import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { diagnosticService, authService, jobService, paymentService, fetchAPI, connectJobSocket, accountService, estimateService, type DiagnosisPayload, type JobStatusResponse, type ProviderResponseItem, type HomeData, type CostEstimate } from '@/services/api';
import AvatarDropdown from '@/components/AvatarDropdown';
import EstimateCard from '@/components/EstimateCard';
import EstimateBadge from '@/components/EstimateBadge';
import HomieOutreachLive, { type OutreachStatus, type LogEntry } from '@/components/HomieOutreachLive';

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';

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
    { id: 'pressure_washing', icon: '💦', label: 'Pressure Washing' },
    { id: 'steam_cleaning', icon: '♨️', label: 'Steam Cleaning' },
  ]},
  { icon: '🌿', label: 'Outdoor & Landscaping', type: 'service', subs: [
    { id: 'landscaping', icon: '🌿', label: 'Landscaping' },
    { id: 'tree_trimming', icon: '🌳', label: 'Tree Trimming' },
    { id: 'stump_removal', icon: '🪵', label: 'Stump Removal' },
    { id: 'fencing', icon: '🏡', label: 'Fencing' },
    { id: 'deck_patio', icon: '🪵', label: 'Deck & Patio' },
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
  { id: 'standard', name: 'Standard', price: '$9.99', time: '~2 hours', detail: '5 pros via SMS + web' },
  { id: 'priority', name: 'Priority', price: '$19.99', time: '~30 min', detail: '10 pros via voice + SMS + web', popular: true },
  { id: 'emergency', name: 'Emergency', price: '$29.99', time: '~15 min', detail: '15 pros, all channels blitz' },
];

/** Strip duplicate dollar signs: "$$140" → "$140" */
function cleanPrice(price: string): string {
  return price.replace(/^\$+/, '$');
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
      <div style={{ background: W, padding: '12px 16px', borderRadius: '16px 16px 16px 4px', maxWidth: '80%', fontSize: 15, lineHeight: 1.6, color: D }}>{renderBold(text)}</div>
    </div>
  );
}

function UserMsg({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, animation: 'fadeSlide 0.2s ease' }}>
      <div style={{ background: O, color: 'white', padding: '10px 18px', borderRadius: '16px 16px 4px 16px', maxWidth: '75%', fontSize: 15, lineHeight: 1.5 }}>{text}</div>
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
  return (
    <div style={{ marginLeft: 42, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, animation: 'fadeSlide 0.3s ease' }}>
      {TIERS.map(t => (
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
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: t.popular ? O : D }}>{t.price}</div>
        </button>
      ))}
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
                <span style={{ color: '#9B9490', fontSize: 13, marginLeft: 8 }}>{'\u2605'} {p.rating} ({p.reviews}) · {p.distance}</span>
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
  const [step, setStep] = useState<'tier' | 'preferences' | 'auth_gate' | 'outreach'>(initialJobId ? 'outreach' : 'tier');
  const [tier, setTier] = useState<string | null>(null);
  const [zip, setZip] = useState('');
  const [timing, setTiming] = useState<string | null>(null);
  const [budget, setBudget] = useState<string | null>(null);
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

  useEffect(() => {
    if (initialEstimate) setCostEstimate(initialEstimate);
  }, [initialEstimate]);

  // Reset fetch counter when jobId changes
  useEffect(() => { fetchedResponses.current = 0; }, [jobId]);

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
        budget: budget === 'Under $100' ? 'under_100' : budget === '$100-250' ? '100_250' : budget === '$250-500' ? '250_500' : budget === '$500+' ? '500_plus' : 'flexible',
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
  const isPrefsValid = /^\d{5}$/.test(zip) && timing !== null && budget !== null;

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
                  {TIERS.map(t => (
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
                      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: t.popular ? O : D }}>{t.price}</div>
                    </button>
                  ))}
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
                  {/* Budget */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: D, display: 'block', marginBottom: 6 }}>Budget range</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {['Under $100', '$100-250', '$250-500', '$500+', 'Flexible'].map(b => (
                        <button key={b} onClick={() => setBudget(b)} style={{
                          padding: '10px 8px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          border: budget === b ? `1.5px solid ${O}` : '1.5px solid rgba(0,0,0,0.08)',
                          background: budget === b ? `${O}0A` : 'white',
                          color: budget === b ? O : `${D}99`,
                          fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s',
                        }}>{b}</button>
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
                  {loading ? 'Creating job...' : `\uD83D\uDE80 Launch Homie Agent \u2014 ${tier === 'emergency' ? '$29.99' : tier === 'priority' ? '$19.99' : '$9.99'}`}
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
                          <span style={{ color: '#9B9490', fontSize: 13, marginLeft: 8 }}>{'\u2605'} {p.rating} ({p.reviews}){p.distance ? ` \u00B7 ${p.distance}` : ''}</span>
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
                              id={`modal-addr-${i}`}
                              placeholder="Enter your service address"
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

/* -- MAIN COMPONENT -- */
export default function GetQuotes() {
  useDocumentTitle('Get Home Repair Quotes in Minutes');
  const navigate = useNavigate();
  const isDemo = new URLSearchParams(window.location.search).has('demo');
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [phase, setPhase] = useState('greeting');
  const [data, setData] = useState<QuoteData>({ category: null, a1: null, aiDiagnosis: null, extra: null, photo: null, zip: '', timing: null, tier: null });
  const aiConvoRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
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

    const t = setTimeout(() => {
      addAssistant("Hey! \uD83D\uDC4B I'm Homie. Let's get you some quotes. What kind of help do you need?");
      setPhase('category');
    }, 400);
    return () => clearTimeout(t);
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
    }
  }, []);

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
    // Build history from the full AI conversation plus any extra details
    const history: { role: 'user' | 'assistant'; content: string }[] = [...aiConvoRef.current];
    if (extraDetails) {
      history.push({ role: 'user', content: extraDetails });
    }
    // Fallback if no AI conversation happened
    if (history.length === 0) {
      history.push({ role: 'user', content: `I need ${cat?.label} help: ${data.a1}. ${extraDetails}` });
    }

    setStreaming(true);
    let diagText = '';
    setTimeout(() => {
      abortRef.current = diagnosticService.sendMessage(
        sessionIdRef.current,
        'TASK: Write a provider-ready dispatch summary in exactly 2-3 sentences. Describe what the homeowner needs fixed, include any relevant details they mentioned (brand, model, age, location in home, symptoms). Be specific and factual. Do NOT ask follow-up questions. Do NOT use conversational language like "Gotcha" or "great question". Start directly with what the issue is. This summary will be sent to service providers.',
        {
          onToken: (token: string) => { diagText += token; },
          onDiagnosis: () => {},
          onJobSummary: () => {},
          onDone: () => {
            setStreaming(false);
            // Strip any follow-up questions the AI might have added
            const cleaned = diagText.replace(/\n\n.*\?$/s, '').replace(/Do you.*\?/g, '').trim();
            setData(d => ({ ...d, aiDiagnosis: cleaned || diagText.trim() }));
            setTimeout(() => {
              addAssistant("Got it \u2014 I've prepared your diagnosis. Let's find you a pro!");
              setPhase('diagnosis');
              setModalOpen(true);
              scrollDown();
            }, 300);
          },
          onError: () => {
            setStreaming(false);
            setData(d => ({ ...d, aiDiagnosis: `${cat?.label}: ${data.a1}. ${extraDetails || d.extra || ''}` }));
            setTimeout(() => {
              addAssistant("Got it \u2014 I've prepared your diagnosis. Let's find you a pro!");
              setPhase('diagnosis');
              setModalOpen(true);
              scrollDown();
            }, 300);
          },
        },
        undefined,
        history,
      );
    }, 300);
  };

  const handlePhoto = (url: string) => {
    setData(d => ({ ...d, photo: url }));
    setMessages(m => [...m, { role: 'user', text: '\uD83D\uDCF8 Photo added' }]);
    scrollDown();
  };

  const repairGroups = CATEGORY_TREE.filter(g => g.type === 'repair').map(g => ({ id: g.label, icon: g.icon, label: g.label }));
  const serviceGroups = CATEGORY_TREE.filter(g => g.type === 'service').map(g => ({ id: g.label, icon: g.icon, label: g.label }));

  return (
    <div style={{ minHeight: '100vh', background: 'white', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes fadeSlide { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 4px; }
        @media (max-width: 480px) {
          .gq-cat-grid { grid-template-columns: repeat(3, 1fr) !important; margin-left: 0 !important; }
          .gq-replies { margin-left: 0 !important; }
        }
      `}</style>

      {/* Header */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)',
        padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', fontSize: 18, color: '#9B9490', display: 'flex', alignItems: 'center' }} title="Back to home">←</button>
          <span onClick={() => navigate('/')} style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: O, cursor: 'pointer' }}>homie</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {(() => {
            const hour = new Date().getHours();
            const isBusinessHours = hour >= 8 && hour < 18;
            return isBusinessHours ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1B9E77', boxShadow: '0 0 0 3px rgba(27,158,119,0.15)' }} />
                <span style={{ fontSize: 13, color: '#1B9E77', fontWeight: 600 }}>Online</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }} title="Some businesses may not be reachable outside business hours. Responses may be limited and take longer.">
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF9F27', boxShadow: '0 0 0 3px rgba(239,159,39,0.15)' }} />
                <span style={{ fontSize: 12, color: '#EF9F27', fontWeight: 600 }}>After hours</span>
              </div>
            );
          })()}
          <button onClick={() => { window.location.href = '/quote'; }} style={{
            background: 'none', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8,
            padding: '5px 12px', fontSize: 13, fontWeight: 600, color: '#6B6560',
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

      {/* After hours notice */}
      {(() => {
        const hour = new Date().getHours();
        return (hour < 8 || hour >= 18) ? (
          <div style={{
            background: '#FFF8F0', borderBottom: '1px solid rgba(239,159,39,0.15)',
            padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontSize: 13, color: '#9B7A3C', lineHeight: 1.4, textAlign: 'center',
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{'\uD83C\uDF19'}</span>
            <span>Some businesses may not be reachable outside business hours (8 AM – 6 PM). Responses may be limited and take longer.</span>
          </div>
        ) : null;
      })()}

      {/* Chat area */}
      <div className="gq-chat-area" style={{ maxWidth: 600, margin: '0 auto', padding: '16px 16px 120px' }}>
        {messages.map((m, i) => (
          m.role === 'assistant'
            ? <AssistantMsg key={i} text={m.text} animate={i === messages.length - 1 && i > 0} />
            : <UserMsg key={i} text={m.text} />
        ))}

        {phase === 'diagnosis' && data.a1 && (
          <>
            <DiagnosisSummary data={data} />
            {costEstimate && (
              <div style={{ marginLeft: 42, marginBottom: 16, animation: 'fadeSlide 0.3s ease' }}>
                <EstimateCard estimate={costEstimate} />
              </div>
            )}
          </>
        )}

        {phase === 'category' && (
          <>
            <div style={{ marginLeft: 42, fontSize: 12, fontWeight: 600, color: '#9B9490', letterSpacing: '0.05em', marginBottom: 6, animation: 'fadeSlide 0.3s ease' }}>REPAIR</div>
            <QuickReplies options={repairGroups} onSelect={(opt) => {
              const group = CATEGORY_TREE.find(g => g.label === (typeof opt === 'string' ? opt : opt.label));
              if (group) handleGroupSelect(group);
            }} columns={4} />
            <div style={{ marginLeft: 42, fontSize: 12, fontWeight: 600, color: '#9B9490', letterSpacing: '0.05em', marginBottom: 6, animation: 'fadeSlide 0.3s ease' }}>SERVICES</div>
            <QuickReplies options={serviceGroups} onSelect={(opt) => {
              const group = CATEGORY_TREE.find(g => g.label === (typeof opt === 'string' ? opt : opt.label));
              if (group) handleGroupSelect(group);
            }} columns={4} />
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
              padding: '14px 28px', borderRadius: 100, border: 'none', fontSize: 16, fontWeight: 600,
              background: O, color: 'white', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
              boxShadow: `0 4px 16px ${O}40`,
            }}>Find a Pro</button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quote Outreach Modal */}
      <QuoteOutreachModal
        isOpen={modalOpen}
        onClose={(hasJob) => {
          setModalOpen(false);
          if (hasJob) {
            navigate('/account?tab=quotes');
          } else {
            // Restart the chat
            setPhase('greeting');
            setData({ category: null, a1: null, aiDiagnosis: null, extra: null, photo: null, zip: '', timing: null, tier: null });
            setMessages([{ role: 'assistant', text: "Hey! I'm Homie. Let's get you some quotes. What kind of help do you need?" }]);
            setCostEstimate(null);
            setJobId(null);
          }
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
