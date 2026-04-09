import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  businessService, businessChatService, jobService, connectJobSocket, trackingService, estimateService,
  type Property, type PropertyDetails, type Workspace, type DiagnosticStreamCallbacks,
  type JobStatusResponse, type ProviderResponseItem, type CostEstimate,
} from '@/services/api';
import AvatarDropdown from '@/components/AvatarDropdown';
import EstimateCard from '@/components/EstimateCard';
import HomieOutreachLive, { type OutreachStatus, type LogEntry } from '@/components/HomieOutreachLive';

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';

/* ── Categories ─────────────────────────────────────────────────────────── */

interface CatDef {
  id: string; icon: string; label: string; group: 'repair' | 'service';
  q1: { text: string; options: string[] };
}

interface CatGroup {
  icon: string; label: string; type: 'repair' | 'service';
  subs: Array<{ id: string; icon: string; label: string }>;
}

const B2B_CATEGORY_TREE: CatGroup[] = [
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
    { id: 'security_systems', icon: '📹', label: 'Security Systems' },
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
    { id: 'garage_door', icon: '🚨', label: 'Garage Door' },
  ]},
  { icon: '🔨', label: 'Handyman & Structural', type: 'repair', subs: [
    { id: 'general', icon: '🔨', label: 'Handyman' },
    { id: 'drywall', icon: '🪧', label: 'Drywall' },
    { id: 'concrete', icon: '🧱', label: 'Concrete' },
    { id: 'masonry', icon: '🏗️', label: 'Masonry' },
    { id: 'foundation_waterproofing', icon: '💧', label: 'Foundation & Waterproofing' },
    { id: 'welding_metal_work', icon: '⚒️', label: 'Welding & Metal Work' },
    { id: 'tv_mounting', icon: '📺', label: 'TV Mounting' },
    { id: 'furniture_assembly', icon: '🪑', label: 'Furniture Assembly' },
  ]},
  // ── Service ──
  { icon: '✨', label: 'Cleaning', type: 'service', subs: [
    { id: 'cleaning', icon: '✨', label: 'Turnover Clean' },
    { id: 'carpet_cleaning', icon: '🧹', label: 'Carpet Cleaning' },
    { id: 'window_cleaning', icon: '🪟', label: 'Window Cleaning' },
    { id: 'pressure_washing', icon: '💦', label: 'Pressure Wash' },
    { id: 'steam_cleaning', icon: '♨️', label: 'Steam Cleaning' },
  ]},
  { icon: '🏊', label: 'Pool & Spa', type: 'service', subs: [
    { id: 'pool', icon: '🏊', label: 'Pool Service' },
    { id: 'hot_tub', icon: '♨️', label: 'Hot Tub' },
  ]},
  { icon: '🌿', label: 'Outdoor & Landscaping', type: 'service', subs: [
    { id: 'landscaping', icon: '🌿', label: 'Landscaping' },
    { id: 'tree_trimming', icon: '🌳', label: 'Tree Trimming' },
    { id: 'fencing', icon: '🏡', label: 'Fencing' },
    { id: 'deck_patio', icon: '🪵', label: 'Deck & Patio' },
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
  ]},
  { icon: '📦', label: 'Property Ops', type: 'service', subs: [
    { id: 'restocking', icon: '📦', label: 'Supplies Restock' },
    { id: 'inspection', icon: '🔍', label: 'Inspection' },
    { id: 'trash', icon: '🗑️', label: 'Trash Valet' },
    { id: 'locksmith', icon: '🔑', label: 'Locksmith' },
    { id: 'concierge', icon: '🎩', label: 'Concierge' },
  ]},
  { icon: '🚚', label: 'Moving & Hauling', type: 'service', subs: [
    { id: 'junk_removal', icon: '🚛', label: 'Junk Removal' },
    { id: 'moving', icon: '🚚', label: 'Moving' },
  ]},
  { icon: '📸', label: 'Photography', type: 'service', subs: [
    { id: 'photography', icon: '📸', label: 'Professional Photography' },
  ]},
];

const B2B_CATEGORIES: CatDef[] = [
  // ── Repair ──
  { id: 'plumbing', icon: '🔧', label: 'Plumbing', group: 'repair',
    q1: { text: "What's happening?", options: ['Leaking/dripping', 'Clogged drain', 'No hot water', 'Running toilet', 'Burst/flooding', 'Other'] } },
  { id: 'septic_sewer', icon: '🕳️', label: 'Septic & Sewer', group: 'repair',
    q1: { text: "What's the issue?", options: ['Backup/overflow', 'Slow drains throughout', 'Septic pumping', 'Bad smell', 'Inspection needed', 'Other'] } },
  { id: 'water_heater', icon: '🔥', label: 'Water Heater', group: 'repair',
    q1: { text: "What's going on?", options: ['No hot water', 'Not enough hot water', 'Leaking', 'Strange noises', 'Need new install', 'Other'] } },
  { id: 'sprinkler_irrigation', icon: '💦', label: 'Sprinkler & Irrigation', group: 'repair',
    q1: { text: 'What do you need?', options: ['Broken head', 'Zone not working', 'Leak in system', 'New installation', 'Winterization', 'Timer issue', 'Other'] } },
  { id: 'electrical', icon: '⚡', label: 'Electrical', group: 'repair',
    q1: { text: "What's the problem?", options: ['Outlet not working', 'Lights flickering', 'Breaker tripping', 'Sparking/smell', 'New install', 'Other'] } },
  { id: 'generator_install', icon: '🔋', label: 'Generator Install', group: 'repair',
    q1: { text: 'What do you need?', options: ['New generator install', 'Generator repair', 'Transfer switch', 'Maintenance', 'Other'] } },
  { id: 'ev_charger_install', icon: '🔌', label: 'EV Charger Install', group: 'repair',
    q1: { text: 'What do you need?', options: ['Level 2 charger install', 'Panel upgrade for EV', 'Charger not working', 'Quote for install', 'Other'] } },
  { id: 'solar', icon: '☀️', label: 'Solar', group: 'repair',
    q1: { text: 'What do you need?', options: ['New solar install', 'Panel repair', 'Inverter issue', 'Not producing enough', 'Battery storage', 'Other'] } },
  { id: 'hvac', icon: '❄️', label: 'HVAC', group: 'repair',
    q1: { text: "What's going on?", options: ['AC not cooling', 'Heat not working', 'Strange noises', 'Thermostat issue', 'Bad smell', 'Maintenance', 'Other'] } },
  { id: 'chimney', icon: '🏠', label: 'Chimney', group: 'repair',
    q1: { text: 'What do you need?', options: ['Chimney sweep', 'Inspection', 'Repair/repointing', 'Cap/damper install', 'Smoke inside', 'Other'] } },
  { id: 'insulation', icon: '🧱', label: 'Insulation', group: 'repair',
    q1: { text: 'What do you need?', options: ['Attic insulation', 'Wall insulation', 'Crawl space', 'Garage', 'Energy audit', 'Other'] } },
  { id: 'appliance', icon: '🍳', label: 'Appliance', group: 'repair',
    q1: { text: 'Which appliance?', options: ['Washer', 'Dryer', 'Dishwasher', 'Refrigerator', 'Oven/stove', 'Disposal', 'Other'] } },
  { id: 'roofing', icon: '🏠', label: 'Roofing', group: 'repair',
    q1: { text: "What's the concern?", options: ['Active leak', 'Missing shingles', 'Storm damage', 'Full replacement', 'Inspection', 'Other'] } },
  { id: 'gutter', icon: '🌧️', label: 'Gutter Cleaning', group: 'repair',
    q1: { text: 'What do you need?', options: ['Cleaning/debris removal', 'Repair/reattach', 'New gutter install', 'Gutter guards', 'Downspout issue', 'Other'] } },
  { id: 'siding', icon: '🪵', label: 'Siding', group: 'repair',
    q1: { text: "What's the issue?", options: ['Damaged/cracked', 'Full replacement', 'New install', 'Power wash only', 'Storm damage', 'Other'] } },
  { id: 'window_door_install', icon: '🪟', label: 'Window & Door Install', group: 'repair',
    q1: { text: 'What do you need?', options: ['Window replacement', 'New window', 'Door replacement', 'Sliding door', 'Storm door', 'Other'] } },
  { id: 'general', icon: '🔨', label: 'Handyman', group: 'repair',
    q1: { text: 'What kind of work?', options: ['Drywall repair', 'Door/window fix', 'Shelving/mounting', 'Multiple small jobs', 'Other'] } },
  { id: 'drywall', icon: '🪧', label: 'Drywall', group: 'repair',
    q1: { text: 'What do you need?', options: ['Hole/crack repair', 'Water damage repair', 'New drywall', 'Texture matching', 'Full room', 'Other'] } },
  { id: 'concrete', icon: '🧱', label: 'Concrete', group: 'repair',
    q1: { text: 'What do you need?', options: ['Crack repair', 'New driveway/patio', 'Sidewalk repair', 'Stamped concrete', 'Foundation work', 'Other'] } },
  { id: 'masonry', icon: '🏗️', label: 'Masonry', group: 'repair',
    q1: { text: 'What do you need?', options: ['Brick repair', 'Retaining wall', 'Stone veneer', 'Fireplace repair', 'New construction', 'Other'] } },
  { id: 'foundation_waterproofing', icon: '💧', label: 'Foundation & Waterproofing', group: 'repair',
    q1: { text: "What's the concern?", options: ['Foundation crack', 'Water in basement', 'Settling/shifting', 'Crawl space moisture', 'Drainage issue', 'Other'] } },
  { id: 'welding_metal_work', icon: '⚒️', label: 'Welding & Metal Work', group: 'repair',
    q1: { text: 'What do you need?', options: ['Gate/fence repair', 'Railing fabrication', 'Structural welding', 'Custom metalwork', 'Other'] } },
  { id: 'garage_door', icon: '🚨', label: 'Garage Door', group: 'repair',
    q1: { text: "What's the issue?", options: ["Won't open/close", 'Making noise', 'Off track', 'Opener broken', 'Spring snapped', 'Other'] } },
  { id: 'tv_mounting', icon: '📺', label: 'TV Mounting', group: 'repair',
    q1: { text: 'What do you need?', options: ['TV wall mount', 'TV + hide wires', 'Projector mount', 'Soundbar install', 'Full home theater', 'Other'] } },
  { id: 'security_systems', icon: '📹', label: 'Security Systems', group: 'repair',
    q1: { text: 'What do you need?', options: ['Camera install', 'Alarm system', 'Doorbell camera', 'System repair', 'Smart home setup', 'Other'] } },
  // ── Service ──
  { id: 'cleaning', icon: '✨', label: 'Turnover Clean', group: 'service',
    q1: { text: 'What type of clean?', options: ['Standard turnover', 'Deep clean', 'Post-construction', 'Laundry/linens', 'Other'] } },
  { id: 'carpet_cleaning', icon: '🧹', label: 'Carpet Cleaning', group: 'service',
    q1: { text: 'What do you need?', options: ['Whole house', 'One room', 'Stain removal', 'Pet odor treatment', 'Area rugs', 'Other'] } },
  { id: 'pool', icon: '🏊', label: 'Pool', group: 'service',
    q1: { text: 'What do you need?', options: ['Chemical balance', 'Filter cleaning', 'Green/cloudy water', 'Equipment repair', 'Leak detection', 'Opening/closing'] } },
  { id: 'hot_tub', icon: '♨️', label: 'Hot Tub', group: 'service',
    q1: { text: 'What do you need?', options: ['Chemical balance', 'Filter cleaning', 'Drain & refill', 'Jets not working', 'Heater issue', 'Cover replacement'] } },
  { id: 'restocking', icon: '📦', label: 'Supplies Restock', group: 'service',
    q1: { text: 'What needs restocking?', options: ['Toiletries', 'Kitchen supplies', 'Linens', 'Welcome items', 'Full restock', 'Other'] } },
  { id: 'inspection', icon: '🔍', label: 'Inspection', group: 'service',
    q1: { text: 'What kind of inspection?', options: ['Pre-guest walkthrough', 'Post-guest damage check', 'Quarterly review', 'Other'] } },
  { id: 'landscaping', icon: '🌿', label: 'Landscaping', group: 'service',
    q1: { text: 'What do you need?', options: ['Lawn mowing', 'Garden design', 'Hedge trimming', 'Yard cleanup', 'Full landscape', 'Other'] } },
  { id: 'tree_trimming', icon: '🌳', label: 'Tree Trimming', group: 'service',
    q1: { text: 'What do you need?', options: ['Trimming/pruning', 'Tree removal', 'Dead tree', 'Branches on roof', 'Stump grinding', 'Other'] } },
  { id: 'fencing', icon: '🏡', label: 'Fencing', group: 'service',
    q1: { text: 'What do you need?', options: ['New fence install', 'Fence repair', 'Gate repair/install', 'Post replacement', 'Full replacement', 'Other'] } },
  { id: 'deck_patio', icon: '🪵', label: 'Deck & Patio', group: 'service',
    q1: { text: 'What do you need?', options: ['New deck build', 'Deck repair', 'Patio install', 'Staining/sealing', 'Pergola/cover', 'Other'] } },
  { id: 'pest_control', icon: '🐛', label: 'Pest Control', group: 'service',
    q1: { text: 'What kind of pest?', options: ['Ants', 'Roaches', 'Mice/rats', 'Termites', 'Bed bugs', 'Other'] } },
  { id: 'painting', icon: '🎨', label: 'Painting', group: 'service',
    q1: { text: 'Interior or exterior?', options: ['Interior', 'Exterior', 'Both', 'Cabinet painting', 'Touch-ups only', 'Other'] } },
  { id: 'flooring', icon: '🪵', label: 'Flooring', group: 'service',
    q1: { text: 'What do you need?', options: ['New install', 'Refinishing', 'Repair', 'Removal', 'Other'] } },
  { id: 'tile', icon: '🔲', label: 'Tile', group: 'service',
    q1: { text: 'What do you need?', options: ['New tile install', 'Tile repair', 'Regrout', 'Backsplash', 'Shower/tub tile', 'Other'] } },
  { id: 'kitchen_remodel', icon: '🍽️', label: 'Kitchen Remodel', group: 'service',
    q1: { text: 'What scope?', options: ['Full remodel', 'Cabinets only', 'Countertops only', 'Layout change', 'Cosmetic update', 'Other'] } },
  { id: 'bathroom_remodel', icon: '🛁', label: 'Bathroom Remodel', group: 'service',
    q1: { text: 'What scope?', options: ['Full remodel', 'Shower/tub only', 'Vanity/sink only', 'Tile work', 'Cosmetic update', 'Other'] } },
  { id: 'trash', icon: '🗑️', label: 'Trash Valet', group: 'service',
    q1: { text: 'What do you need?', options: ['Scheduled pickup', 'Bulk removal', 'Post-guest cleanout', 'Other'] } },
  { id: 'junk_removal', icon: '🚛', label: 'Junk Removal', group: 'service',
    q1: { text: 'What needs removing?', options: ['Furniture', 'Appliances', 'Yard waste', 'Construction debris', 'Full cleanout', 'Other'] } },
  { id: 'moving', icon: '🚚', label: 'Moving', group: 'service',
    q1: { text: 'What kind of move?', options: ['Full home move', 'Apartment move', 'Few large items', 'Storage pickup', 'Other'] } },
  { id: 'locksmith', icon: '🔑', label: 'Locksmith', group: 'service',
    q1: { text: 'What do you need?', options: ['Locked out', 'Rekey locks', 'New lock install', 'Smart lock setup', 'Lockbox replacement'] } },
  { id: 'pressure_washing', icon: '💦', label: 'Pressure Wash', group: 'service',
    q1: { text: 'What needs washing?', options: ['Driveway', 'Patio/deck', 'House siding', 'Fence', 'Pool area', 'Full exterior'] } },
  { id: 'window_cleaning', icon: '🪟', label: 'Window Cleaning', group: 'service',
    q1: { text: 'What do you need?', options: ['Interior only', 'Exterior only', 'Interior + exterior', 'Screens & tracks', 'Skylights'] } },
  { id: 'steam_cleaning', icon: '♨️', label: 'Steam Cleaning', group: 'service',
    q1: { text: 'What needs steam cleaning?', options: ['Carpets', 'Upholstery/couches', 'Mattresses', 'Tile & grout', 'Full property'] } },
  { id: 'furniture_assembly', icon: '🪑', label: 'Furniture Assembly', group: 'service',
    q1: { text: 'What needs assembling?', options: ['Bed frame', 'Desk/table', 'Shelving/bookcase', 'Outdoor furniture', 'Multiple pieces'] } },
  { id: 'concierge', icon: '🎩', label: 'Concierge', group: 'service',
    q1: { text: 'What service?', options: ['Private chef', 'Transport', 'Grocery delivery', 'Equipment rental', 'Activities', 'Other'] } },
  { id: 'photography', icon: '📸', label: 'Photography', group: 'service',
    q1: { text: 'What type of shoot?', options: ['Property listing photos', 'Interior/design', 'Aerial/drone', 'Virtual tour/3D', 'Seasonal update', 'Event/lifestyle', 'Other'] } },
];

/* ── Diagnosis Summary Card ──────────────────────────────────────────────── */

function TrackingShareCard({ jobId, propertyName, trackingUrl, setTrackingUrl }: {
  jobId: string | null; propertyName?: string; trackingUrl: string | null; setTrackingUrl: (url: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notifySaved, setNotifySaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const createdRef = useRef(false);

  // Auto-create tracking link as soon as jobId is available
  useEffect(() => {
    if (!jobId || trackingUrl || createdRef.current) return;
    createdRef.current = true;
    setCreating(true);
    trackingService.createLink(jobId, { property_name: propertyName })
      .then(res => { if (res.data) setTrackingUrl(res.data.tracking_url); })
      .catch(() => {})
      .finally(() => setCreating(false));
  }, [jobId, trackingUrl, propertyName, setTrackingUrl]);

  // Save notification contacts (creates a new link with contacts, or could update — for simplicity, create another)
  async function saveNotify() {
    if (!jobId || (!phone.trim() && !email.trim())) return;
    setSaving(true);
    try {
      await trackingService.createLink(jobId, {
        notify_phone: phone.trim() || undefined,
        notify_email: email.trim() || undefined,
        property_name: propertyName,
      });
      setNotifySaved(true);
    } catch { /* ignore */ }
    setSaving(false);
  }

  return (
    <div style={{ marginLeft: 42, marginBottom: 16, background: W, borderRadius: 12, padding: 16, border: '1px solid rgba(0,0,0,0.06)', animation: 'fadeSlide 0.3s ease' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: D, marginBottom: 4 }}>Share maintenance status</div>
      <div style={{ fontSize: 13, color: '#6B6560', marginBottom: 12, lineHeight: 1.5 }}>
        Copy the tracking link or add a phone/email to send automatic updates.
      </div>

      {/* Tracking URL */}
      {creating && (
        <div style={{ fontSize: 13, color: '#9B9490', marginBottom: 8 }}>Creating tracking link...</div>
      )}
      {trackingUrl && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center', background: '#fff', borderRadius: 8,
          padding: '8px 10px', border: '1px solid rgba(0,0,0,0.06)', marginBottom: 12,
        }}>
          <input readOnly value={trackingUrl} style={{
            flex: 1, border: 'none', outline: 'none', fontSize: 12, color: D,
            fontFamily: "'DM Mono', monospace", background: 'transparent',
          }} />
          <button onClick={() => {
            navigator.clipboard.writeText(trackingUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }} style={{
            padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600,
            background: copied ? G : O, color: '#fff', cursor: 'pointer', flexShrink: 0,
          }}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}

      {/* Optional notifications */}
      {trackingUrl && !notifySaved && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#9B9490', marginBottom: 6 }}>Also send updates via (optional)</div>
          <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone for SMS updates"
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)', fontSize: 13, outline: 'none', fontFamily: "'DM Sans', sans-serif" }} />
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email for updates"
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)', fontSize: 13, outline: 'none', fontFamily: "'DM Sans', sans-serif" }} />
          </div>
          {(phone.trim() || email.trim()) && (
            <button disabled={saving} onClick={saveNotify} style={{
              width: '100%', padding: '8px 0', borderRadius: 100, border: '1px solid rgba(0,0,0,0.08)',
              background: '#fff', color: D, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", opacity: saving ? 0.7 : 1,
            }}>
              {saving ? 'Saving...' : 'Send updates'}
            </button>
          )}
        </>
      )}

      {/* Notifications saved */}
      {notifySaved && (
        <div style={{ fontSize: 12, color: G, fontWeight: 600 }}>
          ✓ Updates will be sent{phone ? ` to ${phone}` : ''}{phone && email ? ' and' : ''}{email ? ` to ${email}` : ''}
        </div>
      )}

      {/* Preview link */}
      {trackingUrl && (
        <div style={{ marginTop: 8, fontSize: 11 }}>
          <a href={trackingUrl} target="_blank" rel="noopener" style={{ color: '#2563EB', textDecoration: 'none', fontWeight: 600 }}>Preview tracking page →</a>
        </div>
      )}
    </div>
  );
}

function DiagnosisSummaryCard({ category, property, summary, isService, onDispatch, dispatching, estimate }: {
  category: CatDef; property: Property; summary: string; isService: boolean;
  onDispatch: () => void; dispatching: boolean; estimate?: CostEstimate;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = summary.length > 300;

  return (
    <div style={{ marginLeft: 42, marginBottom: 16, background: '#fff', border: `2px solid ${G}22`, borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ background: `${G}10`, padding: '12px 16px', borderBottom: `1px solid ${G}22`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: G }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: G }}>{isService ? 'Scope confirmed' : 'AI diagnosis ready'}</span>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: D, marginBottom: 8 }}>{category.icon} {category.label}</div>
        <div style={{ fontSize: 14, color: '#6B6560', lineHeight: 1.6, marginBottom: isLong && !expanded ? 4 : 12, whiteSpace: 'pre-wrap' }}>
          {expanded || !isLong ? renderBold(summary) : <>{renderBold(summary.slice(0, 300))}...</>}
        </div>
        {isLong && (
          <button onClick={() => setExpanded(!expanded)} style={{
            background: 'none', border: 'none', padding: 0, fontSize: 13, fontWeight: 600,
            color: G, cursor: 'pointer', marginBottom: 12, display: 'block',
          }}>{expanded ? 'Show less' : 'Show full scope'}</button>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
            <span style={{ color: '#9B9490' }}>Property:</span> <span style={{ fontWeight: 600, color: D }}>{property.name}</span>
          </div>
          {property.zipCode && (
            <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
              <span style={{ color: '#9B9490' }}>Zip:</span> <span style={{ fontWeight: 600, color: D }}>{property.zipCode}</span>
            </div>
          )}
          <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
            <span style={{ color: '#9B9490' }}>Type:</span> <span style={{ fontWeight: 600, color: D }}>{isService ? 'Service' : 'Repair'}</span>
          </div>
        </div>
        {estimate && (
          <div style={{ marginBottom: 16 }}>
            <EstimateCard estimate={estimate} />
          </div>
        )}
        <p style={{ fontSize: 12, color: '#9B9490', lineHeight: 1.5, marginBottom: 16 }}>
          This {isService ? 'scope' : 'diagnosis'} will be shared with providers so they can respond quickly — no need to explain twice.
        </p>
        <button onClick={onDispatch} disabled={dispatching} style={{
          padding: '14px 28px', borderRadius: 10, border: 'none', background: O, color: '#fff',
          fontSize: 15, fontWeight: 700, cursor: dispatching ? 'default' : 'pointer', width: '100%',
          opacity: dispatching ? 0.7 : 1,
        }}>
          {dispatching ? 'Dispatching...' : `Dispatch ${category.label} Pro`}
        </button>
      </div>
    </div>
  );
}

/* ── Markdown bold helper ───────────────────────────────────────────────── */

function renderBold(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}

/* ── Property Selector with search ─────────────────────────────────────── */

function PropertySelector({ properties, workspaces, selectedWorkspace, onSelectWorkspace, onSelect, onAddClick }: {
  properties: Property[];
  workspaces: Workspace[];
  selectedWorkspace: string | null;
  onSelectWorkspace: (id: string) => void;
  onSelect: (p: Property) => void;
  onAddClick: () => void;
}) {
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? properties.filter(p => {
        const q = search.toLowerCase();
        return p.name.toLowerCase().includes(q)
          || (p.address && p.address.toLowerCase().includes(q))
          || (p.city && p.city.toLowerCase().includes(q))
          || (p.zipCode && p.zipCode.includes(q));
      })
    : properties;

  return (
    <div>
      <AssistantMsg text="Which property is this for?" animate />
      {selectedWorkspace && (
        <div style={{ marginLeft: 42, display: 'grid', gap: 8, marginBottom: 16, animation: 'fadeSlide 0.3s ease' }}>
          {properties.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>
              No properties found. <span onClick={onAddClick} style={{ color: O, cursor: 'pointer', fontWeight: 600 }}>Add properties first.</span>
            </div>
          ) : (
            <>
              {properties.length > 5 && (
                <div style={{ position: 'relative' }}>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search properties by name, address, or city..."
                    style={{
                      width: '100%', padding: '12px 16px 12px 38px', borderRadius: 12, fontSize: 14,
                      border: '2px solid rgba(0,0,0,0.08)', outline: 'none', fontFamily: "'DM Sans', sans-serif",
                      color: D, boxSizing: 'border-box',
                    }}
                    onFocus={e => e.target.style.borderColor = O}
                    onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.08)'}
                  />
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: '#9B9490', pointerEvents: 'none' }}>🔍</span>
                </div>
              )}
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {filtered.map(p => (
                  <button key={p.id} onClick={() => onSelect(p)} style={{
                    display: 'flex', alignItems: 'center', padding: '14px 18px', borderRadius: 14, cursor: 'pointer',
                    border: '2px solid rgba(0,0,0,0.07)', background: 'white', textAlign: 'left', transition: 'all 0.15s',
                    fontFamily: "'DM Sans', sans-serif", width: '100%', marginBottom: 8,
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.background = 'rgba(232,99,43,0.03)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)'; e.currentTarget.style.background = 'white'; }}
                  >
                    {p.photoUrls && p.photoUrls.length > 0 && (
                      <img src={p.photoUrls[0]} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', marginRight: 12, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: D }}>{p.name}</div>
                      {(p.address || p.city) && (
                        <div style={{ fontSize: 13, color: '#9B9490', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.address}{p.city ? `, ${p.city}` : ''}{p.state ? `, ${p.state}` : ''}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#9B9490', background: W, padding: '4px 10px', borderRadius: 8, flexShrink: 0 }}>
                      {p.unitCount} {p.unitCount === 1 ? 'unit' : 'units'}
                    </div>
                  </button>
                ))}
                {search && filtered.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 24, color: '#9B9490', fontSize: 14 }}>
                    No properties match "{search}"
                  </div>
                )}
              </div>
            </>
          )}
          {workspaces.length > 1 && (
            <select value={selectedWorkspace} onChange={e => onSelectWorkspace(e.target.value)}
              style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)', fontSize: 13, color: '#6B6560', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
              {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Chat message components ────────────────────────────────────────────── */

function AssistantMsg({ text, animate = false }: { text: string; animate?: boolean }) {
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

function StreamingMsg({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: O, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ color: 'white', fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 15 }}>h</span>
      </div>
      <div style={{ background: W, padding: '12px 16px', borderRadius: '16px 16px 16px 4px', maxWidth: '80%', fontSize: 15, lineHeight: 1.6, color: D }}>
        {renderBold(text)}<span style={{ display: 'inline-block', width: 6, height: 16, background: O, marginLeft: 2, animation: 'blink 1s infinite' }} />
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */

type Step = 'property' | 'category' | 'subcategory' | 'q1' | 'chat' | 'extra' | 'anything_else' | 'budget' | 'timing' | 'generating' | 'summary' | 'outreach' | 'results';

interface Message { role: 'user' | 'assistant'; content: string }

export default function BusinessChat() {
  useDocumentTitle('Business Dispatch');
  const { homeowner } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workspaceId = searchParams.get('workspace') || '';
  const prefillPropertyId = searchParams.get('property') || '';
  const prefillCategory = searchParams.get('category') || '';
  const prefillTitle = searchParams.get('prefill') || '';
  const prefillDescription = searchParams.get('description') || '';

  // Workspace & properties
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState(workspaceId);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  // Chat state
  const [step, setStep] = useState<Step>('property');
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamText, setStreamText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [category, setCategory] = useState<CatDef | null>(null);
  const [q1Answer, setQ1Answer] = useState('');
  const [aiDiagnosis, setAiDiagnosis] = useState('');
  const [inputVal, setInputVal] = useState('');
  const [readyToDispatch, setReadyToDispatch] = useState(false);
  const [exchangeCount, setExchangeCount] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showFreeInput, setShowFreeInput] = useState(false);
  const [showQ1Input, setShowQ1Input] = useState(false);
  const [q1InputVal, setQ1InputVal] = useState('');
  const [budget, setBudget] = useState('flexible');
  const [anythingElseText, setAnythingElseText] = useState('');
  const [anythingElseImage, setAnythingElseImage] = useState<string | null>(null);
  const anythingElseFileRef = useRef<HTMLInputElement>(null);

  const [timing, setTiming] = useState('asap');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');

  // Outreach state
  const [jobId, setJobId] = useState<string | null>(null);
  const [outreachStatus, setOutreachStatus] = useState<JobStatusResponse | null>(null);
  const [responses, setResponses] = useState<ProviderResponseItem[]>([]);
  const [dispatching, setDispatching] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState<number | null>(null);
  const [bookedName, setBookedName] = useState<string | null>(null);
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null);

  // Occupancy check state
  const [occupancyCheck, setOccupancyCheck] = useState<{
    occupied: boolean;
    reservation: { guestName: string | null; guestEmail: string | null; guestPhone: string | null; checkIn: string; checkOut: string } | null;
  } | null>(null);
  const [entryPermission, setEntryPermission] = useState<string | null>(null);
  const [notifyGuest, setNotifyGuest] = useState(false);

  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef(`b2b-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  // Load workspaces
  useEffect(() => {
    if (!homeowner) { navigate('/login?redirect=/business/chat'); return; }
    businessService.listWorkspaces().then(res => {
      if (res.data) {
        setWorkspaces(res.data);
        if (!selectedWorkspace && res.data.length > 0) setSelectedWorkspace(res.data[0].id);
      }
    });
  }, [homeowner]);

  // Load properties when workspace changes
  const prefillHandledRef = useRef(false);
  useEffect(() => {
    if (!selectedWorkspace) return;
    businessService.listProperties(selectedWorkspace).then(res => {
      if (res.data) {
        const activeProps = res.data.filter(p => p.active);
        setProperties(activeProps);

        // Auto-select property and category from seasonal suggestion prefill
        if (prefillPropertyId && prefillCategory && !prefillHandledRef.current) {
          prefillHandledRef.current = true;
          const prop = activeProps.find(p => p.id === prefillPropertyId);
          if (prop) {
            setSelectedProperty(prop);
            // Find matching category
            const cat = B2B_CATEGORIES.find(c => c.id === prefillCategory);
            if (cat) {
              setCategory(cat);
              const propName = prop.name;
              const title = prefillTitle || cat.label;
              const desc = prefillDescription || '';
              setMessages([
                { role: 'assistant', content: `${cat.icon} **${title}** at ${propName}${desc ? ` — ${desc}` : ''}. ${cat.q1.text}` },
              ]);
              setStep('q1');
            } else {
              setStep('category');
            }
          }
        }
      }
    });
  }, [selectedWorkspace]);

  // Auto-scroll
  useEffect(() => {
    if (messages.length > 0) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText, step]);

  // Build property context string with relevant equipment details
  function getPropertyContext(): string {
    if (!selectedProperty) return '';
    const p = selectedProperty;
    // Strip access codes, door codes, gate codes from notes before sending to AI
    const safeNotes = p.notes
      ? p.notes.replace(/\b(door|gate|lock|access|entry|wifi|password|code|pin)\s*(code|number|#|:)?\s*[:\-]?\s*\S+/gi, '[access info redacted]').trim()
      : null;
    const parts: string[] = [
      `Property: ${p.name}`,
      p.address ? `Address: ${p.address}${p.city ? `, ${p.city}` : ''}${p.state ? `, ${p.state}` : ''} ${p.zipCode || ''}` : '',
      `Type: ${p.propertyType}`,
      `Units: ${p.unitCount}`,
      p.bedrooms != null && p.bedrooms > 0 ? `Bedrooms: ${p.bedrooms}` : '',
      p.bathrooms != null && +p.bathrooms > 0 ? `Bathrooms: ${p.bathrooms}` : '',
      p.sqft != null && p.sqft > 0 ? `Square footage: ${p.sqft.toLocaleString()} sqft` : '',
      p.beds && p.beds.length > 0 ? `Beds: ${p.beds.map(b => `${b.count}\u00D7 ${b.type}`).join(', ')}` : '',
      safeNotes ? `Notes: ${safeNotes}` : '',
    ].filter(Boolean);

    // Inject relevant property details based on selected category
    const d = p.details as PropertyDetails | null;
    if (d) {
      const catId = category?.id || '';

      // Helper to format an object's non-empty values
      function fmt(obj: Record<string, unknown> | undefined, prefix: string): string {
        if (!obj) return '';
        const entries = Object.entries(obj)
          .filter(([, v]) => v !== undefined && v !== '' && v !== null && v !== false)
          .map(([k, v]) => {
            const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
            return `${label}: ${String(v)}`;
          });
        return entries.length > 0 ? `${prefix}: ${entries.join(', ')}` : '';
      }

      // Always include access info (redacted codes for AI — just brands)
      if (d.access) {
        const accessParts = [
          d.access.alarmBrand && `Alarm: ${d.access.alarmBrand}`,
        ].filter(Boolean);
        if (accessParts.length > 0) parts.push(`Security: ${accessParts.join(', ')}`);
      }

      // Category-specific details
      if (['hvac', 'chimney', 'insulation'].includes(catId)) {
        const h = d.hvac;
        if (h) {
          const hvacParts = [
            h.acType && `${h.acType} AC`,
            h.acBrand && `(${h.acBrand}${h.acModel ? ` ${h.acModel}` : ''})`,
            h.acAge && `${h.acAge} old`,
            h.heatingType && `Heating: ${h.heatingType}`,
            h.heatingBrand && `(${h.heatingBrand}${h.heatingModel ? ` ${h.heatingModel}` : ''})`,
            h.thermostatBrand && `Thermostat: ${h.thermostatBrand}${h.thermostatModel ? ` ${h.thermostatModel}` : ''}`,
            h.filterSize && `Filter: ${h.filterSize}`,
          ].filter(Boolean);
          if (hvacParts.length > 0) parts.push(`HVAC: ${hvacParts.join(', ')}`);
        }
      }

      if (['water_heater', 'plumbing'].includes(catId)) {
        const wh = d.waterHeater;
        if (wh) {
          const whParts = [
            wh.type && `${wh.type}`,
            wh.brand && `${wh.brand}`,
            wh.model && `${wh.model}`,
            wh.fuel && `${wh.fuel}`,
            wh.capacity && `${wh.capacity}`,
            wh.age && `${wh.age} old`,
            wh.location && `in ${wh.location}`,
          ].filter(Boolean);
          if (whParts.length > 0) parts.push(`Water heater: ${whParts.join(', ')}`);
        }
      }

      if (['plumbing', 'septic_sewer'].includes(catId)) {
        const pl = d.plumbing;
        if (pl) {
          const plParts = [
            pl.kitchenFaucetBrand && `Kitchen faucet: ${pl.kitchenFaucetBrand}`,
            pl.bathroomFaucetBrand && `Bathroom faucet: ${pl.bathroomFaucetBrand}`,
            pl.toiletBrand && `Toilet: ${pl.toiletBrand}`,
            pl.waterSoftener && `Water softener: ${pl.waterSoftener}`,
            pl.septicOrSewer && `${pl.septicOrSewer}`,
            pl.mainShutoffLocation && `Main shutoff: ${pl.mainShutoffLocation}`,
          ].filter(Boolean);
          if (plParts.length > 0) parts.push(`Plumbing: ${plParts.join(', ')}`);
        }
      }

      if (['appliance', 'cleaning'].includes(catId)) {
        const ap = d.appliances;
        if (ap) {
          const appParts: string[] = [];
          for (const [name, info] of Object.entries(ap)) {
            if (!info) continue;
            const appInfo = info as Record<string, string>;
            const desc = [appInfo.brand, appInfo.model, appInfo.fuel].filter(Boolean).join(' ');
            if (desc) appParts.push(`${name.charAt(0).toUpperCase() + name.slice(1)}: ${desc}`);
          }
          if (appParts.length > 0) parts.push(`Appliances: ${appParts.join(', ')}`);
        }
      }

      if (['electrical', 'generator_install', 'ev_charger_install', 'solar', 'security_systems'].includes(catId)) {
        const el = d.electrical;
        if (el) {
          const elParts = [
            el.breakerBoxLocation && `Breaker: ${el.breakerBoxLocation}`,
            el.panelAmperage && `Panel: ${el.panelAmperage}`,
            el.hasGenerator && el.generatorType && `Generator: ${el.generatorType}`,
            el.hasSolar && el.solarSystem && `Solar: ${el.solarSystem}`,
            el.hasEvCharger && el.evChargerBrand && `EV charger: ${el.evChargerBrand}`,
          ].filter(Boolean);
          if (elParts.length > 0) parts.push(`Electrical: ${elParts.join(', ')}`);
        }
      }

      if (['pool', 'hot_tub'].includes(catId)) {
        const ps = d.poolSpa;
        if (ps) {
          const psParts = [
            ps.poolType && `Pool: ${ps.poolType}`,
            ps.poolHeaterBrand && `Heater: ${ps.poolHeaterBrand}`,
            ps.poolPumpBrand && `Pump: ${ps.poolPumpBrand}`,
            ps.hotTubBrand && `Hot tub: ${ps.hotTubBrand}${ps.hotTubModel ? ` ${ps.hotTubModel}` : ''}`,
          ].filter(Boolean);
          if (psParts.length > 0) parts.push(`Pool/Spa: ${psParts.join(', ')}`);
        }
      }

      if (['roofing', 'siding', 'gutter', 'garage_door', 'fencing', 'sprinkler_irrigation', 'landscaping', 'painting', 'pressure_washing'].includes(catId)) {
        const ex = d.exterior;
        if (ex) {
          const exParts = [
            ex.roofType && `Roof: ${ex.roofType}`,
            ex.roofAge && `(${ex.roofAge} old)`,
            ex.sidingMaterial && `Siding: ${ex.sidingMaterial}`,
            ex.fenceMaterial && `Fence: ${ex.fenceMaterial}`,
            ex.garageDoorBrand && `Garage door: ${ex.garageDoorBrand}`,
            ex.irrigationBrand && `Irrigation: ${ex.irrigationBrand}`,
          ].filter(Boolean);
          if (exParts.length > 0) parts.push(`Exterior: ${exParts.join(', ')}`);
        }
      }

      if (d.general) {
        const gParts = [
          d.general.yearBuilt && `Built: ${d.general.yearBuilt}`,
          d.general.hasHoa && `HOA${d.general.hoaContact ? `: ${d.general.hoaContact}` : ''}`,
        ].filter(Boolean);
        if (gParts.length > 0) parts.push(gParts.join(', '));
      }
    }

    return parts.join('\n');
  }

  // Stream AI response
  function streamAI(userMsg: string, history: Message[], onDone?: (fullText: string, rawText: string) => void, images?: string[]) {
    setStreaming(true);
    setStreamText('');
    let full = '';
    let raw = '';

    // Filter out XML tags from visible text
    let insideTag = false;
    let tagBuf = '';

    const callbacks: DiagnosticStreamCallbacks = {
      onToken: (token: string) => {
        raw += token;
        for (const ch of token) {
          if (insideTag) {
            tagBuf += ch;
            if (/<\/(diagnosis|job_summary|suggestions)>/.test(tagBuf)) {
              // Parse suggestions
              const sugMatch = tagBuf.match(/<suggestions>([\s\S]*?)<\/suggestions>/);
              if (sugMatch) {
                try {
                  const parsed = JSON.parse(sugMatch[1]) as string[];
                  if (Array.isArray(parsed)) setSuggestions(parsed);
                } catch { /* ignore */ }
              }
              insideTag = false; tagBuf = '';
            }
            continue;
          }
          if (ch === '<') { tagBuf = '<'; continue; }
          if (tagBuf.length > 0) {
            tagBuf += ch;
            if (ch === '>') {
              if (/^<(diagnosis|job_summary|suggestions)>/.test(tagBuf)) { insideTag = true; }
              else { full += tagBuf; setStreamText(full); tagBuf = ''; }
            }
            if (tagBuf.length > 15 && !tagBuf.includes('>')) { full += tagBuf; setStreamText(full); tagBuf = ''; }
            continue;
          }
          full += ch;
          setStreamText(full);
        }
      },
      onDiagnosis: () => {},
      onJobSummary: () => {},
      onDone: () => {
        if (tagBuf && !insideTag) { full += tagBuf; }
        setStreaming(false);
        setStreamText('');
        setMessages(prev => [...prev, { role: 'assistant', content: full.trim() }]);
        onDone?.(full.trim(), raw);
      },
      onError: (err: Error) => {
        setStreaming(false);
        setStreamText('');
        setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I had trouble processing that. Please try again.' }]);
      },
    };

    const mode = category?.group === 'service' ? 'service' : 'repair';

    abortRef.current = businessChatService.sendMessage(
      userMsg,
      mode as 'repair' | 'service',
      callbacks,
      {
        history: history.map(m => ({ role: m.role, content: m.content })),
        images,
        propertyContext: getPropertyContext(),
      },
    );
  }

  // Handle property selection
  function selectProperty(p: Property) {
    setSelectedProperty(p);
    setStep('category');
    setMessages([]);
  }

  // Handle category selection
  const [activeGroup, setActiveGroup] = useState<CatGroup | null>(null);

  function handleGroupSelect(group: CatGroup) {
    if (group.subs.length === 1) {
      // Single sub — skip drill-down
      const cat = B2B_CATEGORIES.find(c => c.id === group.subs[0].id);
      if (cat) selectCategory(cat);
      return;
    }
    setActiveGroup(group);
    setMessages([{ role: 'assistant', content: `What type of **${group.label.toLowerCase()}** do you need?` }]);
    setStep('subcategory');
  }

  function handleSubSelect(subId: string) {
    const cat = B2B_CATEGORIES.find(c => c.id === subId);
    if (cat) selectCategory(cat);
  }

  function selectCategory(cat: CatDef) {
    setCategory(cat);
    setActiveGroup(null);
    const propName = selectedProperty?.name || 'this property';
    if (cat.group === 'service') {
      setMessages([{ role: 'assistant', content: `${cat.icon} **${cat.label}** for ${propName} — got it. ${cat.q1.text}` }]);
    } else {
      setMessages([{ role: 'assistant', content: `${cat.icon} **${cat.label}** issue at ${propName} — let's figure this out. ${cat.q1.text}` }]);
    }
    setStep('q1');
  }

  // Handle Q1 answer
  function handleQ1(answer: string) {
    setQ1Answer(answer);
    setSuggestions([]);
    setShowFreeInput(false);
    const newMsgs: Message[] = [...messages, { role: 'user', content: answer }];
    setMessages(newMsgs);
    setStep('chat');

    // Stream AI follow-up
    const userContext = category?.group === 'service'
      ? `I need ${category.label} service. Specifically: ${answer}`
      : `I have a ${category?.label} issue. ${answer}`;

    streamAI(userContext, [], () => {
      setExchangeCount(1);
      setStep('extra');
    });
  }

  // Handle extra details or free-form chat
  function handleUserInput(text: string) {
    setSuggestions([]);
    setShowFreeInput(false);
    const currentImage = imgPreview;
    const newMsgs: Message[] = [...messages, { role: 'user', content: currentImage ? `📷 ${text}` : text }];
    setMessages(newMsgs);
    setInputVal('');
    setImgPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    // If we've had enough exchanges, ask if there's anything else before budget
    if (exchangeCount >= 2) {
      setTimeout(() => {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Got it. Is there anything else you\'d like to add before we dispatch? You can also upload a photo if it helps.' }]);
        setStep('anything_else');
      }, 300);
      return;
    }

    streamAI(text, newMsgs.slice(0, -1), () => {
      setExchangeCount(exchangeCount + 1);
      setStep('extra');
    }, currentImage ? [currentImage] : undefined);
  }

  // Handle budget selection
  function handleBudget(selected: string) {
    setBudget(selected);
    setMessages(prev => [...prev, { role: 'user', content: selected === 'flexible' ? 'No budget preference' : selected }]);
    setMessages(prev => [...prev, { role: 'assistant', content: 'When do you need this done?' }]);
    setStep('timing');
  }

  function handleTiming(selected: string) {
    setTiming(selected);
    setMessages(prev => [...prev, { role: 'user', content: selected }]);

    // Generate the scope after timing is selected (same logic as original handleBudget)
    const promptText = category?.group === 'service'
      ? 'Please generate a final scope summary so I can dispatch a provider.'
      : 'Please generate your diagnosis so I can dispatch a pro.';

    setStep('generating');
    setStreaming(true);
    setStreamText('');
    let visible = '';
    let insideXml = false;
    let xmlBuf = '';
    const mode = category?.group === 'service' ? 'service' : 'repair';

    abortRef.current = businessChatService.sendMessage(
      promptText,
      mode as 'repair' | 'service',
      {
        onToken: (token: string) => {
          for (const ch of token) {
            if (insideXml) {
              xmlBuf += ch;
              if (/<\/(diagnosis|job_summary|suggestions)>/.test(xmlBuf)) { insideXml = false; xmlBuf = ''; }
              continue;
            }
            if (ch === '<') { xmlBuf = '<'; continue; }
            if (xmlBuf.length > 0) {
              xmlBuf += ch;
              if (ch === '>') {
                if (/^<(diagnosis|job_summary|suggestions)>/.test(xmlBuf)) { insideXml = true; }
                else { visible += xmlBuf; }
                xmlBuf = '';
              }
              if (xmlBuf.length > 15 && !xmlBuf.includes('>')) { visible += xmlBuf; xmlBuf = ''; }
              continue;
            }
            visible += ch;
          }
        },
        onDiagnosis: () => {},
        onJobSummary: () => {},
        onDone: () => {
          if (xmlBuf && !insideXml) visible += xmlBuf;
          setStreaming(false);
          setStreamText('');
          setAiDiagnosis(visible.trim());
          setStep('summary');

          // Fetch cost estimate
          const zip = selectedProperty?.zipCode;
          if (zip && category) {
            const details = selectedProperty?.details as PropertyDetails | null;
            const catId = category.id;
            // Extract brand info from property details based on category
            let brand: string | undefined;
            let systemAgeYears: number | undefined;
            if (details?.hvac && ['hvac', 'chimney', 'insulation'].includes(catId)) {
              brand = details.hvac.acBrand || details.hvac.heatingBrand;
              if (details.hvac.acAge) {
                const parsed = parseInt(details.hvac.acAge, 10);
                if (!isNaN(parsed)) systemAgeYears = parsed;
              }
            } else if (details?.waterHeater && ['water_heater', 'plumbing'].includes(catId)) {
              brand = details.waterHeater.brand;
              if (details.waterHeater.age) {
                const parsed = parseInt(details.waterHeater.age, 10);
                if (!isNaN(parsed)) systemAgeYears = parsed;
              }
            }
            estimateService.generate({
              category: catId,
              subcategory: q1Answer || catId,
              zip_code: zip,
              workspace_id: selectedWorkspace || undefined,
              property_type: selectedProperty?.propertyType,
              brand,
              system_age_years: systemAgeYears,
            }).then(res => {
              if (res.data) setCostEstimate(res.data);
            }).catch(() => { /* non-critical */ });
          }
        },
        onError: () => {
          setStreaming(false);
          setStreamText('');
          setAiDiagnosis(`${category?.label}: ${q1Answer}`);
          setStep('summary');
        },
      },
      {
        history: messages.map(m => ({ role: m.role, content: m.content })),
        propertyContext: getPropertyContext(),
      },
    );
  }

  // Handle dispatch (no tier selection — B2B subscription covers it)
  async function handleDispatch() {
    // Check occupancy before dispatching
    if (!occupancyCheck && selectedWorkspace && selectedProperty?.id) {
      setDispatching(true);
      try {
        const occRes = await businessService.getCurrentReservation(selectedWorkspace, selectedProperty.id);
        if (occRes.data?.occupied && occRes.data.reservation) {
          setOccupancyCheck({
            occupied: true,
            reservation: {
              guestName: occRes.data.reservation.guestName,
              guestEmail: occRes.data.reservation.guestEmail ?? null,
              guestPhone: occRes.data.reservation.guestPhone ?? null,
              checkIn: occRes.data.reservation.checkIn,
              checkOut: occRes.data.reservation.checkOut,
            },
          });
          setDispatching(false);
          return; // Show occupancy card, wait for user to choose entry permission
        }
        // Not occupied — proceed directly
        setOccupancyCheck({ occupied: false, reservation: null });
      } catch {
        // If the check fails, proceed without occupancy info
        setOccupancyCheck({ occupied: false, reservation: null });
      }
      setDispatching(false);
    }

    // Proceed with dispatch (either not occupied, or entry permission already chosen)
    await executeDispatch();
  }

  async function executeDispatch(permissionNote?: string) {
    setDispatching(true);
    setStep('outreach');

    try {
      let summaryText = aiDiagnosis || `${category?.label}: ${q1Answer}`;
      const noteToAppend = permissionNote ?? entryPermission;
      if (noteToAppend) {
        summaryText = `${summaryText}\n\n${noteToAppend}`;
      }

      const diagnosis = {
        category: category?.id || 'general',
        subcategory: q1Answer || category?.id || 'general',
        severity: 'medium' as const,
        summary: summaryText,
        recommendedActions: ['Dispatch professional'],
      };

      const zipCode = selectedProperty?.zipCode || '92101';

      const res = await jobService.createJob({
        diagnosis,
        timing: 'asap',
        budget: budget,
        tier: 'priority',
        zipCode,
        workspaceId: selectedWorkspace || undefined,
        propertyId: selectedProperty?.id || undefined,
        notifyGuest: notifyGuest || undefined,
      });

      if (res.data) {
        setJobId(res.data.id);

        // Connect WebSocket for live updates
        connectJobSocket(res.data.id, (status) => {
          setOutreachStatus(status);
          if (status.status === 'completed' || status.status === 'expired') {
            jobService.getResponses(res.data!.id).then(r => {
              if (r.data) {
                setResponses(r.data.responses);
                setStep('results');
              }
            });
          }
        });

        setMessages(prev => [...prev, { role: 'assistant', content: `Dispatching now. Contacting providers in the ${zipCode} area...` }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to create job. Please try again.' }]);
      setStep('extra');
    } finally {
      setDispatching(false);
    }
  }

  if (!homeowner) return null;


  return (
    <div style={{ minHeight: '100vh', background: 'white', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes fadeSlide { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 4px; }
        @media (max-width: 480px) {
          .b2b-cat-grid { grid-template-columns: repeat(3, 1fr) !important; }
          .b2b-chat-badge { display: none !important; }
          .b2b-chat-status span { display: none !important; }
        }
        @media (max-width: 640px) {
          .b2b-chat-status span { font-size: 0 !important; }
        }
      `}</style>

      {/* Header */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)',
        padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          <button onClick={() => navigate('/business')} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
            fontSize: 18, color: '#9B9490', display: 'flex', alignItems: 'center', flexShrink: 0,
          }} title="Back to portal">←</button>
          <span onClick={() => navigate('/business')} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'baseline', flexShrink: 0 }}>
            <span style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: O }}>homie</span>
            <span className="b2b-chat-badge" style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 800,
              color: '#fff', background: G, padding: '2px 6px',
              borderRadius: 4, marginLeft: 7, letterSpacing: '0.08em',
              textTransform: 'uppercase', position: 'relative', top: -1,
            }}>Business</span>
          </span>
          {selectedProperty && (
            <span style={{ fontSize: 13, color: '#9B9490', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {selectedProperty.name}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {(() => {
            const hour = new Date().getHours();
            const isBusinessHours = hour >= 8 && hour < 18;
            return isBusinessHours ? (
              <div className="b2b-chat-status" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: G, boxShadow: `0 0 0 3px ${G}25` }} />
                <span style={{ fontSize: 13, color: G, fontWeight: 600 }}>Online</span>
              </div>
            ) : (
              <div className="b2b-chat-status" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }} title="Some providers may not be reachable outside business hours. Responses may be limited and take longer.">
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF9F27', boxShadow: '0 0 0 3px rgba(239,159,39,0.15)' }} />
                <span style={{ fontSize: 12, color: '#EF9F27', fontWeight: 600 }}>After hours</span>
              </div>
            );
          })()}
          <button onClick={() => {
            setStep('property');
            setSelectedProperty(null);
            setCategory(null);
            setMessages([]);
            setStreamText('');
            setStreaming(false);
            setQ1Answer('');
            setAiDiagnosis('');
            setInputVal('');
            setReadyToDispatch(false);
            setExchangeCount(0);
            setSuggestions([]);
            setShowFreeInput(false);
            setShowQ1Input(false);
            setQ1InputVal('');
            setBudget('flexible');
            setTiming('asap');
            setShowDatePicker(false);
            setSelectedDate('');
            setJobId(null);
            setOutreachStatus(null);
            setResponses([]);
            setDispatching(false);
            setSelectedResponse(null);
            setBookedName(null);
            sessionIdRef.current = `b2b-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          }} style={{
            background: 'none', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8,
            padding: '5px 12px', fontSize: 13, fontWeight: 600, color: '#6B6560',
            cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
          }}>+ New</button>
          <AvatarDropdown />
        </div>
      </nav>

      {/* After hours notice */}
      {(() => {
        const hour = new Date().getHours();
        return (hour < 8 || hour >= 18) ? (
          <div style={{
            background: '#FFF8F0', borderBottom: '1px solid rgba(239,159,39,0.15)',
            padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontSize: 13, color: '#9B7A3C', lineHeight: 1.4, textAlign: 'center',
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>🌙</span>
            <span>Some providers may not be reachable outside business hours (8 AM – 6 PM). Responses may be limited and take longer.</span>
          </div>
        ) : null;
      })()}

      {/* Chat area */}
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 16px 120px' }}>

          {/* Step: Property selection */}
          {step === 'property' && (
            <PropertySelector
              properties={properties}
              workspaces={workspaces}
              selectedWorkspace={selectedWorkspace}
              onSelectWorkspace={(id) => { setSelectedWorkspace(id); setSelectedProperty(null); }}
              onSelect={selectProperty}
              onAddClick={() => navigate('/business')}
            />
          )}

          {/* Step: Category selection */}
          {step === 'category' && (
            <div>
              <AssistantMsg text={`How can Homie help at ${selectedProperty?.name}?`} animate />

              <div style={{ marginLeft: 42, marginBottom: 12, animation: 'fadeSlide 0.3s ease' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#9B9490', letterSpacing: '0.05em', marginBottom: 6 }}>REPAIR</div>
                <div className="b2b-cat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                  {B2B_CATEGORY_TREE.filter(g => g.type === 'repair').map(g => (
                    <button key={g.label} onClick={() => handleGroupSelect(g)} style={{
                      padding: '14px', borderRadius: 12, cursor: 'pointer', border: '2px solid rgba(0,0,0,0.07)',
                      background: 'white', fontSize: 14, color: D, fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.background = 'rgba(232,99,43,0.03)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)'; e.currentTarget.style.background = 'white'; }}
                    >
                      <div style={{ fontSize: 22, marginBottom: 4 }}>{g.icon}</div>
                      <div>{g.label}</div>
                    </button>
                  ))}
                </div>

                <div style={{ fontSize: 12, fontWeight: 600, color: '#9B9490', letterSpacing: '0.05em', marginBottom: 6 }}>SERVICE</div>
                <div className="b2b-cat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {B2B_CATEGORY_TREE.filter(g => g.type === 'service').map(g => (
                    <button key={g.label} onClick={() => handleGroupSelect(g)} style={{
                      padding: '14px', borderRadius: 12, cursor: 'pointer', border: '2px solid rgba(0,0,0,0.07)',
                      background: 'white', fontSize: 14, color: D, fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.background = 'rgba(232,99,43,0.03)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)'; e.currentTarget.style.background = 'white'; }}
                    >
                      <div style={{ fontSize: 22, marginBottom: 4 }}>{g.icon}</div>
                      <div>{g.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Chat messages */}
          {step !== 'property' && step !== 'category' && (
            <>
              {messages.map((m, i) => (
                m.role === 'user' ? <UserMsg key={i} text={m.content} /> : <AssistantMsg key={i} text={m.content} />
              ))}
              {streaming && <StreamingMsg text={streamText} />}
            </>
          )}

          {/* Subcategory selection */}
          {step === 'subcategory' && activeGroup && (
            <div style={{ marginLeft: 42, animation: 'fadeSlide 0.3s ease' }}>
              <div className="b2b-cat-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(activeGroup.subs.length, 3)}, 1fr)`, gap: 8, marginBottom: 12 }}>
                {activeGroup.subs.map(s => (
                  <button key={s.id} onClick={() => handleSubSelect(s.id)} style={{
                    padding: '14px', borderRadius: 12, cursor: 'pointer', border: '2px solid rgba(0,0,0,0.07)',
                    background: 'white', fontSize: 14, color: D, fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.background = 'rgba(232,99,43,0.03)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)'; e.currentTarget.style.background = 'white'; }}
                  >
                    <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
                    <div>{s.label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Q1 options */}
          {step === 'q1' && category && !streaming && (
            <div style={{ marginLeft: 42, animation: 'fadeSlide 0.3s ease' }}>
              {!showQ1Input ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: 16 }}>
                  {category.q1.options.filter(o => o !== 'Other').map(opt => (
                    <button key={opt} onClick={() => handleQ1(opt)} style={{
                      padding: '10px 14px', borderRadius: 12, cursor: 'pointer', border: '2px solid rgba(0,0,0,0.07)',
                      background: 'white', fontSize: 14, color: D, fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.background = 'rgba(232,99,43,0.03)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)'; e.currentTarget.style.background = 'white'; }}
                    >{opt}</button>
                  ))}
                  <button onClick={() => setShowQ1Input(true)} style={{
                    padding: '10px 14px', borderRadius: 12, cursor: 'pointer', border: '2px dashed rgba(0,0,0,0.12)',
                    background: 'white', fontSize: 14, color: '#9B9490', fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.color = D; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'; e.currentTarget.style.color = '#9B9490'; }}
                  >Something else</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <input value={q1InputVal} onChange={e => setQ1InputVal(e.target.value)} placeholder="Describe the issue..."
                    onKeyDown={e => { if (e.key === 'Enter' && q1InputVal.trim()) { handleQ1(q1InputVal.trim()); setShowQ1Input(false); setQ1InputVal(''); } }}
                    autoFocus
                    style={{
                      flex: 1, padding: '12px 16px', borderRadius: 100, fontSize: 15, border: '2px solid rgba(0,0,0,0.08)',
                      fontFamily: "'DM Sans', sans-serif", outline: 'none', color: D,
                    }}
                    onFocus={e => e.target.style.borderColor = O}
                    onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.08)'}
                  />
                  <button onClick={() => { if (q1InputVal.trim()) { handleQ1(q1InputVal.trim()); setShowQ1Input(false); setQ1InputVal(''); } }}
                    style={{
                      width: 44, height: 44, borderRadius: '50%', border: 'none',
                      background: q1InputVal.trim() ? O : 'rgba(0,0,0,0.06)',
                      color: 'white', fontSize: 18, cursor: q1InputVal.trim() ? 'pointer' : 'default',
                      transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>↑</button>
                </div>
              )}
            </div>
          )}

          {/* Suggestion buttons + free input */}
          {step === 'extra' && !streaming && (
            <div style={{ marginLeft: 42, animation: 'fadeSlide 0.3s ease' }}>
              {/* Quick reply suggestions */}
              {suggestions.length > 0 && !showFreeInput && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: 12 }}>
                  {suggestions.map(s => (
                    <button key={s} onClick={() => handleUserInput(s)} style={{
                      padding: '10px 14px', borderRadius: 12, cursor: 'pointer', border: '2px solid rgba(0,0,0,0.07)',
                      background: 'white', fontSize: 14, color: D, fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.background = 'rgba(232,99,43,0.03)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)'; e.currentTarget.style.background = 'white'; }}
                    >{s}</button>
                  ))}
                  <button onClick={() => setShowFreeInput(true)} style={{
                    padding: '10px 14px', borderRadius: 12, cursor: 'pointer', border: '2px dashed rgba(0,0,0,0.12)',
                    background: 'white', fontSize: 14, color: '#9B9490', fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.color = D; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'; e.currentTarget.style.color = '#9B9490'; }}
                  >Something else</button>
                </div>
              )}

              {/* Free text input — shown when no suggestions or user tapped "Something else" */}
              {(suggestions.length === 0 || showFreeInput) && (
                <>
                  {/* Image preview */}
                  {imgPreview && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, marginLeft: 0 }}>
                      <div style={{ position: 'relative' }}>
                        <img src={imgPreview} alt="Preview" style={{ height: 56, borderRadius: 10, border: '1px solid rgba(0,0,0,0.08)' }} />
                        <button onClick={() => { setImgPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                          style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: D, color: '#fff', border: '2px solid white', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                      </div>
                      <span style={{ fontSize: 12, color: '#9B9490' }}>Photo attached</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input type="file" ref={fileInputRef} accept="image/*" hidden onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = ev => setImgPreview(ev.target?.result as string);
                      reader.readAsDataURL(file);
                    }} />
                    <button onClick={() => fileInputRef.current?.click()}
                      style={{
                        width: 44, height: 44, borderRadius: '50%', border: '2px solid rgba(0,0,0,0.08)',
                        background: 'white', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = O}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'}
                    >📷</button>
                    <input value={inputVal} onChange={e => setInputVal(e.target.value)} placeholder={imgPreview ? "Describe what you see..." : "Type your answer..."}
                      onKeyDown={e => { if (e.key === 'Enter' && (inputVal.trim() || imgPreview)) handleUserInput(inputVal.trim() || 'What do you see in this photo?'); }}
                      autoFocus
                      style={{
                        flex: 1, padding: '12px 16px', borderRadius: 100, fontSize: 15, border: '2px solid rgba(0,0,0,0.08)',
                        fontFamily: "'DM Sans', sans-serif", outline: 'none', color: D,
                      }}
                      onFocus={e => e.target.style.borderColor = O}
                      onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.08)'}
                    />
                    <button onClick={() => { if (inputVal.trim() || imgPreview) handleUserInput(inputVal.trim() || 'What do you see in this photo?'); }}
                      style={{
                        width: 44, height: 44, borderRadius: '50%', border: 'none',
                        background: (inputVal.trim() || imgPreview) ? O : 'rgba(0,0,0,0.06)',
                        color: 'white', fontSize: 18, cursor: (inputVal.trim() || imgPreview) ? 'pointer' : 'default',
                        transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>↑</button>
                  </div>
                </>
              )}

            </div>
          )}

          {/* Anything else before dispatch */}
          {step === 'anything_else' && !streaming && (
            <div style={{ marginLeft: 42, animation: 'fadeSlide 0.3s ease', marginBottom: 16 }}>
              <div style={{ background: '#fff', borderRadius: 14, border: '2px solid rgba(0,0,0,0.06)', padding: 16, marginBottom: 10 }}>
                <textarea
                  value={anythingElseText}
                  onChange={e => setAnythingElseText(e.target.value)}
                  placeholder="Add any extra notes, access instructions, or details for the provider..."
                  rows={3}
                  style={{
                    width: '100%', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 10,
                    padding: '10px 12px', fontSize: 14, fontFamily: "'DM Sans', sans-serif",
                    resize: 'none', outline: 'none', color: D, boxSizing: 'border-box',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = O; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <button onClick={() => anythingElseFileRef.current?.click()} style={{
                    padding: '6px 12px', borderRadius: 8, border: '1.5px solid rgba(0,0,0,0.08)', background: '#fff',
                    fontSize: 13, color: '#9B9490', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    {'\uD83D\uDCF7'} {anythingElseImage ? 'Change photo' : 'Add photo'}
                  </button>
                  {anythingElseImage && (
                    <div style={{ position: 'relative', width: 40, height: 40, borderRadius: 8, overflow: 'hidden', border: '2px solid rgba(0,0,0,0.08)' }}>
                      <img src={anythingElseImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button onClick={() => setAnythingElseImage(null)} style={{
                        position: 'absolute', top: 1, right: 1, width: 16, height: 16, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', fontSize: 9, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{'\u00D7'}</button>
                    </div>
                  )}
                  <input ref={anythingElseFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) { const r = new FileReader(); r.onload = ev => setAnythingElseImage(ev.target?.result as string); r.readAsDataURL(f); }
                    e.target.value = '';
                  }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => {
                  if (anythingElseText.trim() || anythingElseImage) {
                    const content = anythingElseImage ? `\uD83D\uDCF7 ${anythingElseText.trim() || 'Photo attached'}` : anythingElseText.trim();
                    setMessages(prev => [...prev, { role: 'user', content }]);
                  }
                  setMessages(prev => [...prev, { role: 'assistant', content: 'Great. Would you like to set a budget for this dispatch?' }]);
                  setStep('budget');
                }} style={{
                  flex: 1, padding: '12px 20px', borderRadius: 12, border: 'none', background: O, color: '#fff',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                }}>
                  {anythingElseText.trim() || anythingElseImage ? 'Continue' : 'Nothing else — continue'}
                </button>
              </div>
            </div>
          )}

          {/* Budget selection */}
          {step === 'budget' && !streaming && (
            <div style={{ marginLeft: 42, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: 16, animation: 'fadeSlide 0.3s ease' }}>
              {['Under $100', '$100–$250', '$250–$500', '$500–$1,000', '$1,000+'].map(b => (
                <button key={b} onClick={() => handleBudget(b)} style={{
                  padding: '10px 14px', borderRadius: 12, cursor: 'pointer', border: '2px solid rgba(0,0,0,0.07)',
                  background: 'white', fontSize: 14, color: D, fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                  fontFamily: "'DM Sans', sans-serif",
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.background = 'rgba(232,99,43,0.03)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)'; e.currentTarget.style.background = 'white'; }}
                >{b}</button>
              ))}
              <button onClick={() => handleBudget('flexible')} style={{
                padding: '10px 14px', borderRadius: 12, cursor: 'pointer', border: '2px dashed rgba(0,0,0,0.12)',
                background: 'white', fontSize: 14, color: '#9B9490', fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                fontFamily: "'DM Sans', sans-serif",
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.color = D; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'; e.currentTarget.style.color = '#9B9490'; }}
              >Skip</button>
            </div>
          )}

          {/* Timing selection */}
          {step === 'timing' && !streaming && (
            <div style={{ marginLeft: 42, animation: 'fadeSlide 0.3s ease', marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginBottom: showDatePicker ? 10 : 0 }}>
                {['Today', 'Tomorrow', 'This week', 'Flexible'].map(t => (
                  <button key={t} onClick={() => handleTiming(t)} style={{
                    padding: '10px 14px', borderRadius: 12, cursor: 'pointer', border: '2px solid rgba(0,0,0,0.07)',
                    background: 'white', fontSize: 14, color: D, fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.background = 'rgba(232,99,43,0.03)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)'; e.currentTarget.style.background = 'white'; }}
                  >{t}</button>
                ))}
                <button onClick={() => setShowDatePicker(!showDatePicker)} style={{
                  padding: '10px 14px', borderRadius: 12, cursor: 'pointer', border: `2px ${showDatePicker ? 'solid' : 'dashed'} ${showDatePicker ? O : 'rgba(0,0,0,0.12)'}`,
                  background: showDatePicker ? 'rgba(232,99,43,0.03)' : 'white', fontSize: 14,
                  color: showDatePicker ? O : '#9B9490', fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                  fontFamily: "'DM Sans', sans-serif",
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.color = D; }}
                  onMouseLeave={e => { if (!showDatePicker) { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'; e.currentTarget.style.color = '#9B9490'; } }}
                >{'\uD83D\uDCC5'} Pick a date</button>
              </div>
              {showDatePicker && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', animation: 'fadeSlide 0.2s ease' }}>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: 10, border: '2px solid rgba(0,0,0,0.08)',
                      fontSize: 14, color: D, fontFamily: "'DM Sans', sans-serif", outline: 'none',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = O; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; }}
                  />
                  <button
                    onClick={() => {
                      if (selectedDate) {
                        const formatted = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                        handleTiming(formatted);
                      }
                    }}
                    disabled={!selectedDate}
                    style={{
                      padding: '10px 20px', borderRadius: 10, border: 'none',
                      background: selectedDate ? O : '#E0DAD4', color: selectedDate ? '#fff' : '#9B9490',
                      fontSize: 14, fontWeight: 600, cursor: selectedDate ? 'pointer' : 'default',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >Confirm</button>
                </div>
              )}
            </div>
          )}

          {/* Generating dispatch indicator */}
          {step === 'generating' && (
            <div style={{ marginLeft: 42, marginBottom: 16, animation: 'fadeSlide 0.3s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: W, borderRadius: 12, padding: '14px 18px' }}>
                <div style={{ width: 20, height: 20, border: `2.5px solid ${O}30`, borderTopColor: O, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: D }}>Generating dispatch scope...</span>
              </div>
            </div>
          )}

          {/* Diagnosis summary card */}
          {step === 'summary' && !streaming && category && selectedProperty && !occupancyCheck?.occupied && (
            <DiagnosisSummaryCard
              category={category}
              property={selectedProperty}
              summary={aiDiagnosis}
              isService={category.group === 'service'}
              onDispatch={handleDispatch}
              dispatching={dispatching}
              estimate={costEstimate ?? undefined}
            />
          )}

          {/* Occupancy check card — shown when property is occupied */}
          {step === 'summary' && occupancyCheck?.occupied && occupancyCheck.reservation && category && (
            <div style={{
              marginLeft: 42, marginBottom: 16, background: '#fff', borderRadius: 16,
              border: `2px solid ${O}22`, overflow: 'hidden', animation: 'fadeSlide 0.3s ease',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}>
              <div style={{
                background: `${O}10`, padding: '12px 16px', borderBottom: `1px solid ${O}22`,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 16 }}>{'\u{1F3E0}'}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: D }}>This property is currently occupied</span>
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                  <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
                    <span style={{ color: '#9B9490' }}>Guest:</span>{' '}
                    <span style={{ fontWeight: 600, color: D }}>{occupancyCheck.reservation.guestName || 'Unknown guest'}</span>
                  </div>
                  <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
                    <span style={{ color: '#9B9490' }}>Check-in:</span>{' '}
                    <span style={{ fontWeight: 600, color: D }}>{new Date(occupancyCheck.reservation.checkIn).toLocaleDateString()}</span>
                  </div>
                  <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
                    <span style={{ color: '#9B9490' }}>Check-out:</span>{' '}
                    <span style={{ fontWeight: 600, color: D }}>{new Date(occupancyCheck.reservation.checkOut).toLocaleDateString()}</span>
                  </div>
                </div>

                <p style={{ fontSize: 14, fontWeight: 600, color: D, marginBottom: 12 }}>
                  Does the provider have permission to enter?
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  <button
                    disabled={dispatching}
                    onClick={() => {
                      const note = 'Note: Property is occupied. Provider has permission to enter.';
                      setEntryPermission(note);
                      setOccupancyCheck(null);
                      void executeDispatch(note);
                    }}
                    style={{
                      padding: '12px 20px', borderRadius: 10, border: 'none', background: G, color: '#fff',
                      fontSize: 14, fontWeight: 600, cursor: dispatching ? 'default' : 'pointer',
                      opacity: dispatching ? 0.7 : 1, fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Yes, provider can enter
                  </button>
                  <button
                    disabled={dispatching}
                    onClick={() => {
                      const note = 'Note: Property is occupied. Someone needs to be present for the provider.';
                      setEntryPermission(note);
                      setOccupancyCheck(null);
                      void executeDispatch(note);
                    }}
                    style={{
                      padding: '12px 20px', borderRadius: 10, border: `1.5px solid ${O}`,
                      background: '#fff', color: O, fontSize: 14, fontWeight: 600,
                      cursor: dispatching ? 'default' : 'pointer', opacity: dispatching ? 0.7 : 1,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Someone needs to be present
                  </button>
                </div>

                {(occupancyCheck.reservation.guestEmail || occupancyCheck.reservation.guestPhone) && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: D }}>
                    <div onClick={() => setNotifyGuest(!notifyGuest)} style={{
                      width: 40, height: 22, borderRadius: 11, background: notifyGuest ? G : '#E0DAD4',
                      position: 'relative', transition: 'background 0.2s', flexShrink: 0, cursor: 'pointer',
                    }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute',
                        top: 2, left: notifyGuest ? 20 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }} />
                    </div>
                    <span>Notify guest of dispatch status{occupancyCheck.reservation.guestEmail ? ` (${occupancyCheck.reservation.guestEmail})` : ''}</span>
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Outreach live view */}
          {(step === 'outreach' || step === 'results') && (
            <>
              {/* Outreach progress */}
              {outreachStatus && (() => {
                const outreachStatusObj: OutreachStatus = {
                  providers_contacted: outreachStatus.providers_contacted,
                  providers_responded: outreachStatus.providers_responded,
                  outreach_channels: {
                    voice: { attempted: outreachStatus.outreach_channels.voice.attempted, connected: outreachStatus.outreach_channels.voice.connected },
                    sms: { attempted: outreachStatus.outreach_channels.sms.attempted, connected: outreachStatus.outreach_channels.sms.connected },
                    web: { attempted: outreachStatus.outreach_channels.web.attempted, connected: outreachStatus.outreach_channels.web.connected },
                  },
                  status: step === 'results' ? 'completed' : outreachStatus.status,
                };
                const logEntries: LogEntry[] = [];
                if (outreachStatus.providers_contacted > 0) logEntries.push({ msg: `Contacting ${outreachStatus.providers_contacted} providers...`, type: 'system' });
                if (outreachStatus.outreach_channels.voice.attempted > 0) logEntries.push({ msg: `${outreachStatus.outreach_channels.voice.attempted} voice calls`, type: 'voice' });
                if (outreachStatus.outreach_channels.sms.attempted > 0) logEntries.push({ msg: `${outreachStatus.outreach_channels.sms.attempted} SMS messages`, type: 'sms' });
                if (outreachStatus.outreach_channels.web.attempted > 0) logEntries.push({ msg: `${outreachStatus.outreach_channels.web.attempted} email contacts`, type: 'web' });
                if (outreachStatus.providers_responded > 0) logEntries.push({ msg: `${outreachStatus.providers_responded} quote(s) received!`, type: 'success' });
                if (step === 'results') logEntries.push({ msg: `${responses.length} quotes ready!`, type: 'done' });
                const isDone = step === 'results';
                return (
                  <div style={{ marginLeft: 42, marginBottom: 16, animation: 'fadeSlide 0.3s ease' }}>
                    <HomieOutreachLive
                      status={outreachStatusObj}
                      log={logEntries}
                      done={isDone}
                      showSafeNotice={!isDone}
                      accountLink="/business"
                    />
                  </div>
                );
              })()}

              {/* Share status tracker */}
              <TrackingShareCard
                jobId={jobId}
                propertyName={selectedProperty?.name}
                trackingUrl={trackingUrl}
                setTrackingUrl={setTrackingUrl}
              />

              {/* Provider cards */}
              {responses.map((r, i) => (
                <div key={r.id} style={{ marginLeft: 42, marginBottom: 10, animation: 'fadeSlide 0.4s ease' }}>
                  <div onClick={() => setSelectedResponse(selectedResponse === i ? null : i)} style={{
                    background: 'white', borderRadius: 14, padding: '16px 18px', cursor: 'pointer',
                    border: selectedResponse === i ? `2px solid ${O}` : '1px solid rgba(0,0,0,0.06)',
                    boxShadow: selectedResponse === i ? `0 4px 20px ${O}18` : '0 1px 4px rgba(0,0,0,0.03)',
                    transition: 'all 0.2s',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 16, color: D }}>{r.provider.name}</span>
                        {r.provider.google_rating && (
                          <span style={{ color: '#9B9490', fontSize: 13, marginLeft: 8 }}>{'★'} {r.provider.google_rating} ({r.provider.review_count})</span>
                        )}
                      </div>
                      {r.quoted_price && (
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: O }}>{r.quoted_price}</span>
                          <div style={{ fontSize: 11, color: '#9B9490', fontWeight: 500 }}>estimate</div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      {r.availability && <span style={{ fontSize: 14, color: D }}>{'📅'} {r.availability}</span>}
                      <span style={{ background: W, padding: '2px 10px', borderRadius: 100, fontSize: 11, color: '#9B9490' }}>via {r.channel}</span>
                    </div>
                    {r.message && <div style={{ fontSize: 13, color: '#6B6560', fontStyle: 'italic', marginTop: 6 }}>"{r.message}"</div>}
                    {selectedResponse === i && (
                      <div style={{ marginTop: 14 }}>
                        <button onClick={async (e) => {
                          e.stopPropagation();
                          await jobService.bookProvider(jobId!, r.id, r.provider.id, selectedProperty?.address || undefined);
                          setBookedName(r.provider.name);
                        }} style={{
                          width: '100%', padding: '13px 0', borderRadius: 100, border: 'none',
                          background: O, color: 'white', fontSize: 16, fontWeight: 600, cursor: 'pointer',
                          fontFamily: "'DM Sans', sans-serif", boxShadow: `0 4px 16px ${O}40`,
                        }}>Book {r.provider.name.split(' ')[0]}</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Booking confirmation */}
              {bookedName && (
                <div style={{ marginLeft: 42, animation: 'fadeSlide 0.4s ease' }}>
                  <div style={{
                    background: 'white', borderRadius: 16, padding: '28px 24px', textAlign: 'center',
                    border: `2px solid ${G}22`, boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
                  }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: `${G}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={G} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.75l6 6 9-13.5" /></svg>
                    </div>
                    <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: D, marginBottom: 6 }}>You're all set!</div>
                    <div style={{ fontSize: 14, color: '#6B6560' }}>
                      <strong style={{ color: D }}>{bookedName}</strong> has been booked. They'll be in touch to confirm details.
                    </div>
                  </div>

                </div>
              )}

              {step === 'results' && responses.length > 0 && selectedResponse === null && !bookedName && (
                <div style={{ marginLeft: 42, textAlign: 'center', color: '#9B9490', fontSize: 14, marginTop: 8 }}>{'↑'} Tap a provider to book</div>
              )}
            </>
          )}

          <div ref={chatEndRef} />
        </div>
    </div>
  );
}
