import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';

// ─── Brand tokens ───────────────────────────────────────────────────────────

const BRAND = {
  orange: '#E8632B',
  orangeLight: '#F0997B',
  orangeDark: '#C8531E',
  green: '#1B9E77',
  greenLight: '#E1F5EE',
  greenDark: '#085041',
  dark: '#2D2926',
  darkMid: '#4A4543',
  gray: '#9B9490',
  grayLight: '#D3CEC9',
  warm: '#F9F5F2',
  white: '#FFFFFF',
  red: '#D94040',
  redLight: '#FDE8E8',
  yellow: '#E6A817',
  yellowLight: '#FEF7E0',
  blue: '#2563EB',
  blueLight: '#EFF6FF',
};

// ─── i18n ───────────────────────────────────────────────────────────────────

const LANGUAGES: Array<{ code: string; label: string; flag: string }> = [
  { code: 'en', label: 'English', flag: '\u{1F1FA}\u{1F1F8}' },
  { code: 'es', label: 'Espa\u00f1ol', flag: '\u{1F1EA}\u{1F1F8}' },
  { code: 'fr', label: 'Fran\u00e7ais', flag: '\u{1F1EB}\u{1F1F7}' },
];

type LangCode = 'en' | 'es' | 'fr';

const T: Record<LangCode, Record<string, string>> = {
  en: {
    needHelp: 'need help?',
    heroDesc: "Report an issue with your stay and we'll take care of it. We'll try to help you troubleshoot first \u2014 if it needs a pro, we'll dispatch one.",
    reportIssue: 'Report an issue',
    yourStay: 'Your stay',
    property: 'Property',
    checkIn: 'Check-in',
    checkOut: 'Check-out',
    emergency: 'Emergency?',
    emergencyDesc: 'If you smell gas, see fire, or feel unsafe, call 911 first. Then report it here.',
    whatsTheIssue: "What's the issue?",
    selectCategory: 'Select a category to get started',
    quickFix: "Let's try a quick fix first",
    skipTroubleshoot: 'Skip \u2014 just report it',
    describeIssue: 'Describe the issue...',
    submitReport: 'Submit report',
    addMore: 'Add more',
    reviewReport: 'Review your report',
    willBeSent: 'will be sent for review.',
    description: 'Description',
    photos: 'Photos',
    troubleshootAttempted: 'Troubleshooting attempted',
    sendToPM: 'Send to property manager',
    editReport: 'Edit report',
    reportSent: 'Report sent!',
    notified: "has been notified. We'll keep you updated right here.",
    helpOnWay: 'Help is on the way',
    issueBeingHandled: 'issue is being handled',
    providerAssigned: 'Provider assigned',
    estArrival: 'Estimated arrival',
    lastUpdated: 'Last updated',
    autoRefresh: 'Auto-refreshes every 30s',
    poweredBy: 'Powered by',
    resolved: 'Issue resolved!',
    satisfactionQ: 'Was this resolved to your satisfaction?',
    tellUsMore: 'Tell us more (optional)...',
    submitFeedback: 'Submit feedback',
    thanksFeedback: 'Thanks for your feedback!',
    helpsFuture: 'This helps us maintain quality for future guests.',
    expectedResponse: 'Expected response time',
    slaUrgent: 'Under 30 minutes',
    slaHigh: 'Within 1 hour',
    slaMedium: 'Within 2 hours',
    slaLow: 'Within 4 hours',
    recurringAlert: 'Recurring issue detected',
    recurringDesc: 'This issue has been reported before at this property. Your PM has been alerted.',
    upTo4Photos: 'Up to 4 photos \u00b7 Helps the team assess faster',
    autoDispatchNote: 'Auto-dispatched based on PM rules',
    gotIt: 'Got it',
    addedToReport: 'Got it, added to the report. Anything else, or ready to submit?',
    proHelp: "No worries \u2014 let's get a pro to help.",
    describeMore: 'Can you describe the issue? Include anything the repair team should know.',
    issueReported: 'Issue reported',
    reportSubmitted: 'Your report has been submitted',
    sentToPM: 'Sent to property manager',
    pmNotified: 'has been notified',
    pmReviewing: 'PM reviewing',
    pmReviewingDesc: 'Your property manager is reviewing the issue',
    dispatchApproved: 'Dispatch approved',
    proBeingContacted: 'A local pro is being contacted',
    providerResponding: 'Provider responding',
    waitingAvail: 'Waiting for availability and quote',
    providerBooked: 'Provider booked',
    proAssigned: 'A pro has been assigned',
    resolvedStep: 'Resolved',
    issueFixed: 'Issue has been fixed',
    safetyUrgent: '\u26A0\uFE0F Safety concerns are always urgent. Describe what you\'re experiencing. If you smell gas or see flooding, also call 911.',
    enterName: 'Your name',
    enterConfirmation: 'Confirmation code',
    continueBtn: 'Continue',
    guestIdentify: 'Please enter your details so we can match your reservation.',
    noDescProvided: 'No description provided',
  },
  es: {
    needHelp: '\u00bfnecesitas ayuda?',
    heroDesc: 'Reporta un problema y nosotros nos encargamos. Primero intentaremos solucionarlo \u2014 si necesita un profesional, enviaremos uno.',
    reportIssue: 'Reportar un problema',
    yourStay: 'Tu estad\u00eda',
    property: 'Propiedad',
    checkIn: 'Llegada',
    checkOut: 'Salida',
    emergency: '\u00bfEmergencia?',
    emergencyDesc: 'Si hueles gas o ves fuego, llama al 911 primero.',
    whatsTheIssue: '\u00bfCu\u00e1l es el problema?',
    selectCategory: 'Selecciona una categor\u00eda',
    quickFix: 'Intentemos una soluci\u00f3n r\u00e1pida',
    skipTroubleshoot: 'Omitir \u2014 solo reportar',
    describeIssue: 'Describe el problema...',
    submitReport: 'Enviar reporte',
    addMore: 'Agregar m\u00e1s',
    reviewReport: 'Revisa tu reporte',
    willBeSent: 'ser\u00e1 enviado para revisi\u00f3n.',
    description: 'Descripci\u00f3n',
    photos: 'Fotos',
    troubleshootAttempted: 'Soluci\u00f3n intentada',
    sendToPM: 'Enviar al administrador',
    editReport: 'Editar',
    reportSent: '\u00a1Reporte enviado!',
    notified: 'ha sido notificado. Te mantendremos informado.',
    helpOnWay: 'La ayuda est\u00e1 en camino',
    issueBeingHandled: 'problema est\u00e1 siendo atendido',
    providerAssigned: 'Proveedor asignado',
    estArrival: 'Llegada estimada',
    lastUpdated: '\u00daltima actualizaci\u00f3n',
    autoRefresh: 'Se actualiza cada 30s',
    poweredBy: 'Impulsado por',
    resolved: '\u00a1Problema resuelto!',
    satisfactionQ: '\u00bfSe resolvi\u00f3 a tu satisfacci\u00f3n?',
    tellUsMore: 'Cu\u00e9ntanos m\u00e1s (opcional)...',
    submitFeedback: 'Enviar opini\u00f3n',
    thanksFeedback: '\u00a1Gracias!',
    helpsFuture: 'Nos ayuda a mantener la calidad.',
    expectedResponse: 'Tiempo de respuesta',
    slaUrgent: 'Menos de 30 minutos',
    slaHigh: 'Dentro de 1 hora',
    slaMedium: 'Dentro de 2 horas',
    slaLow: 'Dentro de 4 horas',
    recurringAlert: 'Problema recurrente',
    recurringDesc: 'Este problema se ha reportado antes en esta propiedad.',
    upTo4Photos: 'Hasta 4 fotos',
    autoDispatchNote: 'Auto-despachado seg\u00fan reglas del PM',
    gotIt: 'Entendido',
    addedToReport: 'Entendido. \u00bfAlgo m\u00e1s, o listo para enviar?',
    proHelp: 'Sin problema \u2014 consigamos un profesional.',
    describeMore: '\u00bfPuedes describir el problema?',
    issueReported: 'Problema reportado',
    reportSubmitted: 'Tu reporte ha sido enviado',
    sentToPM: 'Enviado al administrador',
    pmNotified: 'ha sido notificado',
    pmReviewing: 'PM revisando',
    pmReviewingDesc: 'Tu administrador est\u00e1 revisando',
    dispatchApproved: 'Despacho aprobado',
    proBeingContacted: 'Contactando a un profesional',
    providerResponding: 'Proveedor respondiendo',
    waitingAvail: 'Esperando disponibilidad',
    providerBooked: 'Proveedor reservado',
    proAssigned: 'Un profesional asignado',
    resolvedStep: 'Resuelto',
    issueFixed: 'Problema solucionado',
    safetyUrgent: '\u26A0\uFE0F Los problemas de seguridad son urgentes. Describe lo que pasa. Si hueles gas, llama al 911.',
    enterName: 'Tu nombre',
    enterConfirmation: 'C\u00f3digo de confirmaci\u00f3n',
    continueBtn: 'Continuar',
    guestIdentify: 'Ingresa tus datos para buscar tu reservaci\u00f3n.',
    noDescProvided: 'Sin descripci\u00f3n',
  },
  fr: {
    needHelp: "besoin d'aide ?",
    heroDesc: "Signalez un probl\u00e8me et nous nous en occupons. Nous essaierons d'abord de le r\u00e9soudre \u2014 sinon, un pro viendra.",
    reportIssue: 'Signaler un probl\u00e8me',
    yourStay: 'Votre s\u00e9jour',
    property: 'Propri\u00e9t\u00e9',
    checkIn: 'Arriv\u00e9e',
    checkOut: 'D\u00e9part',
    emergency: 'Urgence ?',
    emergencyDesc: 'Si vous sentez du gaz ou voyez un incendie, appelez le 911.',
    whatsTheIssue: 'Quel est le probl\u00e8me ?',
    selectCategory: 'Choisissez une cat\u00e9gorie',
    quickFix: 'Essayons une solution rapide',
    skipTroubleshoot: 'Passer \u2014 signaler directement',
    describeIssue: 'D\u00e9crivez le probl\u00e8me...',
    submitReport: 'Envoyer',
    addMore: 'Ajouter',
    reviewReport: 'V\u00e9rifiez votre rapport',
    willBeSent: 'sera envoy\u00e9 pour examen.',
    description: 'Description',
    photos: 'Photos',
    troubleshootAttempted: 'D\u00e9pannage tent\u00e9',
    sendToPM: 'Envoyer au gestionnaire',
    editReport: 'Modifier',
    reportSent: 'Rapport envoy\u00e9 !',
    notified: 'a \u00e9t\u00e9 notifi\u00e9.',
    helpOnWay: "L'aide arrive",
    issueBeingHandled: 'probl\u00e8me en cours',
    providerAssigned: 'Prestataire assign\u00e9',
    estArrival: 'Arriv\u00e9e estim\u00e9e',
    lastUpdated: 'Mise \u00e0 jour',
    autoRefresh: 'Actualisation auto 30s',
    poweredBy: 'Propuls\u00e9 par',
    resolved: 'Probl\u00e8me r\u00e9solu !',
    satisfactionQ: 'Satisfait de la r\u00e9solution ?',
    tellUsMore: 'Dites-nous en plus...',
    submitFeedback: 'Envoyer',
    thanksFeedback: 'Merci !',
    helpsFuture: 'Cela maintient la qualit\u00e9.',
    expectedResponse: 'Temps de r\u00e9ponse',
    slaUrgent: 'Moins de 30 min',
    slaHigh: "Dans l'heure",
    slaMedium: 'Dans les 2 heures',
    slaLow: 'Dans les 4 heures',
    recurringAlert: 'Probl\u00e8me r\u00e9current',
    recurringDesc: 'D\u00e9j\u00e0 signal\u00e9 pour cette propri\u00e9t\u00e9.',
    upTo4Photos: "Jusqu'\u00e0 4 photos",
    autoDispatchNote: 'Auto-envoy\u00e9 selon les r\u00e8gles',
    gotIt: 'Compris',
    addedToReport: 'Compris. Autre chose, ou pr\u00eat ?',
    proHelp: 'Trouvons un professionnel.',
    describeMore: 'D\u00e9crivez le probl\u00e8me.',
    issueReported: 'Signal\u00e9',
    reportSubmitted: 'Rapport soumis',
    sentToPM: 'Envoy\u00e9 au gestionnaire',
    pmNotified: 'notifi\u00e9',
    pmReviewing: 'Examen en cours',
    pmReviewingDesc: 'Votre gestionnaire examine',
    dispatchApproved: 'Intervention approuv\u00e9e',
    proBeingContacted: 'Professionnel contact\u00e9',
    providerResponding: 'En r\u00e9ponse',
    waitingAvail: 'En attente',
    providerBooked: 'R\u00e9serv\u00e9',
    proAssigned: 'Professionnel assign\u00e9',
    resolvedStep: 'R\u00e9solu',
    issueFixed: 'R\u00e9gl\u00e9',
    safetyUrgent: "\u26A0\uFE0F Probl\u00e8me de s\u00e9curit\u00e9 urgent. D\u00e9crivez la situation. Appelez le 911 si n\u00e9cessaire.",
    enterName: 'Votre nom',
    enterConfirmation: 'Code de confirmation',
    continueBtn: 'Continuer',
    guestIdentify: 'Entrez vos informations pour trouver votre r\u00e9servation.',
    noDescProvided: 'Aucune description',
  },
};

function tx(lang: string, key: string): string {
  const langKey = lang as LangCode;
  return T[langKey]?.[key] ?? T.en[key] ?? key;
}

const SLA_MAP: Record<string, string> = {
  urgent: 'slaUrgent',
  high: 'slaHigh',
  medium: 'slaMedium',
  low: 'slaLow',
};

const SEV_ORDER = ['urgent', 'high', 'medium', 'low'];

// ─── Types ──────────────────────────────────────────────────────────────────

type Screen = 'welcome' | 'identify' | 'categories' | 'subcategories' | 'troubleshoot' | 'chat' | 'summary' | 'escalated' | 'tracking';

interface Subcategory {
  label: string;
  icon: string;
  desc: string;
}

interface PropertyData {
  name: string;
  company: string;
  companyLogo: string | null;
  details: Record<string, unknown> | null;
  bedrooms: number | null;
  bathrooms: number | null;
  settings: Record<string, unknown>;
}

interface ReservationMatch {
  matched: boolean;
  guestName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  reservationId: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
}

interface Category {
  id: string;
  label: string;
  icon: string;
  desc: string;
  color: string;
  troubleshootFlow?: TroubleshootStep[];
}

interface TroubleshootStep {
  q: string;
  options: string[];
}

interface ChatMessage {
  from: 'bot' | 'user';
  text: string;
  photos?: string[];
  time: Date;
  showActions?: boolean;
}

interface TimelineStep {
  title: string;
  desc: string;
  time: string;
}

interface StatusResponse {
  status: string;
  currentStep: number;
  steps: TimelineStep[];
  provider?: {
    name: string;
    initials: string;
    rating: number;
    specialty: string;
    eta: string;
  };
  resolved: boolean;
  recurring?: {
    count: number;
    last: string;
    desc: string;
  };
  autoDispatched: boolean;
}

// ─── API helpers ────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

async function guestFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }
  return body.data as T;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 5, padding: '11px 16px', background: BRAND.warm, borderRadius: '16px 16px 16px 4px', width: 'fit-content', marginBottom: 10 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: BRAND.grayLight, animation: `typDot 1.2s ease infinite ${i * 0.2}s` }} />
      ))}
    </div>
  );
}

function LangPicker({ lang, setLang, open, setOpen }: {
  lang: string;
  setLang: (l: string) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ background: BRAND.warm, border: 'none', borderRadius: 8, padding: '4px 9px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 3, color: BRAND.darkMid, fontFamily: "'DM Sans',sans-serif", fontWeight: 500 }}
      >
        {LANGUAGES.find(l => l.code === lang)?.flag} <span style={{ fontSize: 9 }}>{'\u25BE'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50, background: BRAND.white, borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', border: `1px solid ${BRAND.warm}`, overflow: 'hidden', minWidth: 150, animation: 'fadeUp 0.2s ease' }}>
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              onClick={() => { setLang(l.code); setOpen(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 13px', border: 'none', background: lang === l.code ? BRAND.warm : 'transparent', cursor: 'pointer', fontSize: 13, color: BRAND.dark, fontFamily: "'DM Sans',sans-serif", fontWeight: lang === l.code ? 600 : 400 }}
            >
              <span>{l.flag}</span><span>{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PhotoUpload({ photos, onAdd, onRemove, lang }: {
  photos: string[];
  onAdd: (dataUrl: string) => void;
  onRemove: (idx: number) => void;
  lang: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {photos.map((p, i) => (
          <div key={i} style={{ position: 'relative', width: 64, height: 64, borderRadius: 10, overflow: 'hidden', border: `2px solid ${BRAND.grayLight}` }}>
            <img src={p} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button
              onClick={() => onRemove(i)}
              style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {'\u00d7'}
            </button>
          </div>
        ))}
        {photos.length < 4 && (
          <button
            onClick={() => ref.current?.click()}
            style={{ width: 64, height: 64, borderRadius: 10, border: `2px dashed ${BRAND.grayLight}`, background: BRAND.warm, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, transition: 'border-color 0.2s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = BRAND.orange; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = BRAND.grayLight; }}
          >
            <span style={{ fontSize: 16 }}>{'📷'}</span>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: BRAND.gray }}>Add</span>
          </button>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={e => {
          Array.from(e.target.files ?? []).slice(0, 4 - photos.length).forEach(f => {
            const r = new FileReader();
            r.onload = ev => { if (ev.target?.result) onAdd(ev.target.result as string); };
            r.readAsDataURL(f);
          });
          e.target.value = '';
        }}
      />
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: BRAND.gray }}>{tx(lang, 'upTo4Photos')}</div>
    </div>
  );
}

function VoiceBtn({ onResult, lang }: { onResult: (text: string) => void; lang: string }) {
  const [rec, setRec] = useState(false);
  const supported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  if (!supported) return null;

  const go = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SR) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SR as { new(): any })();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = lang === 'es' ? 'es-ES' : lang === 'fr' ? 'fr-FR' : 'en-US';
    recognition.onresult = (e: { results: { 0: { 0: { transcript: string } } } }) => { onResult(e.results[0][0].transcript); setRec(false); };
    recognition.onerror = () => setRec(false);
    recognition.onend = () => setRec(false);
    setRec(true);
    recognition.start();
  };

  return (
    <button
      onClick={go}
      style={{
        width: 38, height: 38, borderRadius: 10,
        border: rec ? `2px solid ${BRAND.red}` : `1.5px solid ${BRAND.grayLight}`,
        background: rec ? BRAND.redLight : BRAND.white,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, fontSize: 16, transition: 'all 0.2s',
        animation: rec ? 'pulse 1s ease infinite' : 'none',
      }}
      onMouseEnter={e => { if (!rec) (e.currentTarget as HTMLButtonElement).style.borderColor = BRAND.orange; }}
      onMouseLeave={e => { if (!rec) (e.currentTarget as HTMLButtonElement).style.borderColor = BRAND.grayLight; }}
    >
      {rec ? '\u23FA' : '🎙\uFE0F'}
    </button>
  );
}

function SevBadge({ level }: { level: string }) {
  const configs: Record<string, { l: string; bg: string; c: string }> = {
    low: { l: 'Low', bg: BRAND.greenLight, c: BRAND.greenDark },
    medium: { l: 'Medium', bg: BRAND.yellowLight, c: '#8B6914' },
    high: { l: 'High', bg: '#FEE2E2', c: BRAND.red },
    urgent: { l: 'Urgent', bg: BRAND.red, c: '#fff' },
  };
  const cfg = configs[level] ?? configs.low;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, background: cfg.bg, color: cfg.c, padding: '3px 9px', borderRadius: 100 }}>
      {cfg.l}
    </span>
  );
}

function SLABanner({ severity, lang }: { severity: string; lang: string }) {
  const colors: Record<string, { bg: string; c: string; i: string }> = {
    urgent: { bg: BRAND.redLight, c: BRAND.red, i: '\u26A1' },
    high: { bg: '#FEE2E2', c: BRAND.red, i: '🔴' },
    medium: { bg: BRAND.yellowLight, c: '#8B6914', i: '🟡' },
    low: { bg: BRAND.greenLight, c: BRAND.greenDark, i: '🟢' },
  };
  const cl = colors[severity] ?? colors.medium;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: cl.bg, borderRadius: 12, marginTop: 10, animation: 'fadeUp 0.4s ease' }}>
      <span style={{ fontSize: 16 }}>{cl.i}</span>
      <div>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: cl.c, fontWeight: 500 }}>{tx(lang, 'expectedResponse')}</div>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: cl.c, fontWeight: 700 }}>{tx(lang, SLA_MAP[severity] ?? 'slaMedium')}</div>
      </div>
    </div>
  );
}

function RecurringAlert({ recurring, lang }: { recurring?: { count: number; last: string; desc: string } | null; lang: string }) {
  if (!recurring) return null;
  return (
    <div style={{ display: 'flex', gap: 10, padding: '11px 14px', background: BRAND.blueLight, borderRadius: 12, marginTop: 10, animation: 'fadeUp 0.4s ease' }}>
      <span style={{ fontSize: 15, flexShrink: 0 }}>{'🔄'}</span>
      <div>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: BRAND.blue }}>{tx(lang, 'recurringAlert')}</div>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: BRAND.darkMid, lineHeight: 1.4, marginTop: 2 }}>{recurring.desc}</div>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: BRAND.gray, marginTop: 3 }}>Last: {recurring.last} {'\u00b7'} {recurring.count} total</div>
      </div>
    </div>
  );
}

function StatusTracker({ steps, cur }: { steps: TimelineStep[]; cur: number }) {
  return (
    <div style={{ padding: '10px 0' }}>
      {steps.map((s, i) => {
        const done = i < cur;
        const active = i === cur;
        const future = i > cur;
        return (
          <div key={i} style={{ display: 'flex', gap: 12, minHeight: i < steps.length - 1 ? 48 : 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 26, flexShrink: 0 }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? BRAND.green : active ? BRAND.orange : BRAND.warm,
                border: `2px solid ${done ? BRAND.green : active ? BRAND.orange : BRAND.grayLight}`,
                transition: 'all 0.4s',
                ...(active ? { boxShadow: `0 0 0 4px ${BRAND.orange}22`, animation: 'pulse 2s ease infinite' } : {}),
              }}>
                {done ? <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>{'\u2713'}</span> : <div style={{ width: 6, height: 6, borderRadius: '50%', background: active ? '#fff' : BRAND.grayLight }} />}
              </div>
              {i < steps.length - 1 && <div style={{ width: 2, flex: 1, background: done ? BRAND.green : BRAND.grayLight, transition: 'background 0.4s', margin: '3px 0', borderRadius: 1 }} />}
            </div>
            <div style={{ paddingBottom: 8, opacity: future ? 0.3 : 1, transition: 'opacity 0.4s' }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: BRAND.dark }}>{s.title}</div>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: BRAND.gray, marginTop: 1 }}>{s.desc}</div>
              {s.time && <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: BRAND.grayLight, marginTop: 1 }}>{s.time}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Satisfaction({ lang, onSubmit }: { lang: string; onSubmit: (data: { rating: string; comment: string }) => void }) {
  const [rating, setRating] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div style={{ background: BRAND.greenLight, borderRadius: 16, padding: '22px 18px', textAlign: 'center', animation: 'fadeUp 0.4s ease' }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>{'💚'}</div>
        <div style={{ fontFamily: 'Fraunces,serif', fontSize: 17, fontWeight: 700, color: BRAND.greenDark, marginBottom: 3 }}>{tx(lang, 'thanksFeedback')}</div>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: BRAND.gray }}>{tx(lang, 'helpsFuture')}</div>
      </div>
    );
  }

  return (
    <div style={{ background: BRAND.warm, borderRadius: 16, padding: '22px 18px', animation: 'fadeUp 0.5s ease' }}>
      <div style={{ fontFamily: 'Fraunces,serif', fontSize: 17, fontWeight: 700, color: BRAND.dark, marginBottom: 3, textAlign: 'center' }}>{tx(lang, 'resolved')}</div>
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: BRAND.darkMid, textAlign: 'center', marginBottom: 16 }}>{tx(lang, 'satisfactionQ')}</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 14 }}>
        {[{ k: 'up', e: '👍', l: 'Yes' }, { k: 'down', e: '👎', l: 'No' }].map(o => (
          <button
            key={o.k}
            onClick={() => setRating(o.k)}
            style={{
              width: 68, height: 68, borderRadius: 14,
              border: `2px solid ${rating === o.k ? (o.k === 'up' ? BRAND.green : BRAND.red) : BRAND.grayLight}`,
              background: rating === o.k ? (o.k === 'up' ? BRAND.greenLight : BRAND.redLight) : BRAND.white,
              cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 3, transition: 'all 0.2s', fontSize: 26,
            }}
          >
            {o.e}<span style={{ fontSize: 10, fontWeight: 600, color: BRAND.darkMid }}>{o.l}</span>
          </button>
        ))}
      </div>
      {rating && (
        <div style={{ animation: 'fadeUp 0.3s ease' }}>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder={tx(lang, 'tellUsMore')}
            rows={2}
            style={{ width: '100%', border: `1.5px solid ${BRAND.grayLight}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, fontFamily: "'DM Sans',sans-serif", resize: 'none', outline: 'none', background: BRAND.white, color: BRAND.dark, marginBottom: 10, boxSizing: 'border-box' }}
          />
          <button
            onClick={() => { setDone(true); onSubmit({ rating, comment }); }}
            style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: BRAND.orange, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            {tx(lang, 'submitFeedback')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

export default function GuestReporterPage() {
  const { workspaceId, propertyId } = useParams<{ workspaceId: string; propertyId: string }>();

  // ── State ──
  const [screen, setScreen] = useState<Screen>('welcome');
  const [lang, setLang] = useState('en');
  const [langOpen, setLangOpen] = useState(false);

  // Property + reservation data
  const [propertyData, setPropertyData] = useState<PropertyData | null>(null);
  const [reservation, setReservation] = useState<ReservationMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guest identification (when no reservation match)
  const [guestName, setGuestName] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');

  // Categories
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState<Category | null>(null);

  // Subcategories (AI-generated)
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [loadingSubcats, setLoadingSubcats] = useState(false);

  // Troubleshooting
  const [tStep, setTStep] = useState(0);
  const [tAnswers, setTAnswers] = useState<Array<{ q: string; a: string }>>([]);

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [typing, setTyping] = useState(false);
  const [severity, setSeverity] = useState<string | null>(null);
  const [desc, setDesc] = useState('');

  // Tracking
  const [issueId, setIssueId] = useState<string | null>(null);
  const [trackStep, setTrackStep] = useState(0);
  const [trackSteps, setTrackSteps] = useState<TimelineStep[]>([]);
  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const chatEnd = useRef<HTMLDivElement>(null);
  const inpRef = useRef<HTMLInputElement>(null);

  // ── Detect browser language ──
  useEffect(() => {
    const browserLang = navigator.language?.slice(0, 2);
    if (browserLang && T[browserLang as LangCode]) {
      setLang(browserLang);
    }
  }, []);

  // ── Fetch property data on mount ──
  useEffect(() => {
    if (!workspaceId || !propertyId) return;
    setLoading(true);
    guestFetch<{ property: PropertyData; reservation: ReservationMatch }>(`/api/v1/guest/${workspaceId}/${propertyId}`)
      .then(data => {
        setPropertyData(data.property);
        setReservation(data.reservation);
        if (data.reservation?.matched && data.reservation.guestName) {
          setGuestName(data.reservation.guestName);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [workspaceId, propertyId]);

  // ── Fetch categories ──
  const fetchCategories = useCallback(() => {
    if (!workspaceId || !propertyId) return;
    guestFetch<Category[]>(`/api/v1/guest/${workspaceId}/${propertyId}/categories`)
      .then(cats => setCategories(cats))
      .catch(() => { /* categories will be empty, UI handles gracefully */ });
  }, [workspaceId, propertyId]);

  // ── Poll tracking status every 30s ──
  useEffect(() => {
    if (screen !== 'tracking' || !issueId) return;
    let active = true;

    const poll = () => {
      guestFetch<StatusResponse>(`/api/v1/guest/issues/${issueId}/status`)
        .then(data => {
          if (!active) return;
          setStatusData(data);
          setTrackStep(data.currentStep);
          if (data.steps?.length) setTrackSteps(data.steps);
          if (data.resolved) setShowResolved(true);
        })
        .catch(() => { /* silent retry on next poll */ });
    };

    poll();
    const interval = setInterval(poll, 30000);
    return () => { active = false; clearInterval(interval); };
  }, [screen, issueId]);

  // ── Helpers ──
  const scroll = () => setTimeout(() => chatEnd.current?.scrollIntoView({ behavior: 'smooth' }), 100);

  const displayName = reservation?.matched ? (reservation.guestName ?? 'Guest') : (guestName || 'Guest');
  const companyName = propertyData?.company ?? '';
  const propertyName = propertyData?.name ?? '';

  const botMsg = (text: string, extra: Partial<ChatMessage> = {}, delay = 800) => {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages(p => [...p, { from: 'bot', text, time: new Date(), ...extra }]);
      scroll();
    }, delay);
  };

  const selCat = (cat: Category) => {
    setCategory(cat);
    setSubcategory(null);
    setSubcategories([]);
    if (cat.id === 'safety') {
      setSeverity('urgent');
      setScreen('chat');
      setMessages([{ from: 'bot', text: tx(lang, 'safetyUrgent'), time: new Date() }]);
      return;
    }

    // Fetch AI subcategories
    setLoadingSubcats(true);
    setScreen('subcategories');
    const propertyDetails: Record<string, unknown> = {};
    if (propertyData?.details) propertyDetails.details = propertyData.details;
    if (propertyData?.bedrooms) propertyDetails.bedrooms = propertyData.bedrooms;
    if (propertyData?.bathrooms) propertyDetails.bathrooms = propertyData.bathrooms;

    guestFetch<Subcategory[]>(`/api/v1/guest/${workspaceId}/${propertyId}/subcategories`, {
      method: 'POST',
      body: JSON.stringify({
        categoryId: cat.id,
        categoryLabel: cat.label,
        propertyDetails: Object.keys(propertyDetails).length > 0 ? propertyDetails : undefined,
      }),
    })
      .then(subs => {
        setSubcategories(subs);
        setLoadingSubcats(false);
      })
      .catch(() => {
        // On failure, skip subcategories and go to next step
        setLoadingSubcats(false);
        if (cat.troubleshootFlow?.length) {
          setScreen('troubleshoot');
          setTStep(0);
          setTAnswers([]);
        } else {
          setScreen('chat');
          setMessages([{ from: 'bot', text: `${tx(lang, 'gotIt')} \u2014 ${cat.label.toLowerCase()}. ${tx(lang, 'describeMore')}`, time: new Date() }]);
        }
      });
  };

  const selSubcat = (sub: Subcategory) => {
    setSubcategory(sub.label);
    if (category?.troubleshootFlow?.length) {
      setScreen('troubleshoot');
      setTStep(0);
      setTAnswers([]);
    } else {
      // Go to chat with AI-generated first message
      setScreen('chat');
      setMessages([]);
      setTyping(true);

      const propertyDetails: Record<string, unknown> = {};
      if (propertyData?.details) propertyDetails.details = propertyData.details;
      if (propertyData?.bedrooms) propertyDetails.bedrooms = propertyData.bedrooms;
      if (propertyData?.bathrooms) propertyDetails.bathrooms = propertyData.bathrooms;

      guestFetch<{ message: string }>(`/api/v1/guest/${workspaceId}/${propertyId}/chat-message`, {
        method: 'POST',
        body: JSON.stringify({
          categoryLabel: category?.label,
          subcategoryLabel: sub.label,
          propertyDetails: Object.keys(propertyDetails).length > 0 ? propertyDetails : undefined,
        }),
      })
        .then(data => {
          setTyping(false);
          setMessages([{ from: 'bot', text: data.message, time: new Date() }]);
          scroll();
        })
        .catch(() => {
          setTyping(false);
          setMessages([{ from: 'bot', text: `${tx(lang, 'gotIt')} \u2014 ${sub.label.toLowerCase()}. ${tx(lang, 'describeMore')}`, time: new Date() }]);
          scroll();
        });
    }
  };

  const tsAnswer = (answer: string) => {
    const flow = category?.troubleshootFlow;
    if (!flow) return;
    const na = [...tAnswers, { q: flow[tStep].q, a: answer }];
    setTAnswers(na);

    // Self-resolution check (options containing celebration emoji)
    if (answer.includes('\uD83C\uDF89')) {
      setScreen('chat');
      setMessages([{ from: 'bot', text: `Great, glad that's fixed! 🎉 If anything else comes up, we're here 24/7. Enjoy ${propertyName}.`, time: new Date() }]);
      return;
    }

    if (tStep + 1 < flow.length) {
      setTStep(tStep + 1);
    } else {
      setScreen('chat');
      setDesc(na.map(a => `\u2022 ${a.a}`).join('\n'));
      if (subcategory) {
        // Use AI-generated message when we have subcategory context
        setMessages([]);
        setTyping(true);
        const pd: Record<string, unknown> = {};
        if (propertyData?.details) pd.details = propertyData.details;
        if (propertyData?.bedrooms) pd.bedrooms = propertyData.bedrooms;
        if (propertyData?.bathrooms) pd.bathrooms = propertyData.bathrooms;
        guestFetch<{ message: string }>(`/api/v1/guest/${workspaceId}/${propertyId}/chat-message`, {
          method: 'POST',
          body: JSON.stringify({ categoryLabel: category?.label, subcategoryLabel: subcategory, propertyDetails: Object.keys(pd).length > 0 ? pd : undefined }),
        })
          .then(data => { setTyping(false); setMessages([{ from: 'bot', text: data.message, time: new Date() }]); scroll(); })
          .catch(() => { setTyping(false); setMessages([{ from: 'bot', text: `${tx(lang, 'proHelp')} ${tx(lang, 'describeMore')}`, time: new Date() }]); scroll(); });
      } else {
        setMessages([{ from: 'bot', text: `${tx(lang, 'proHelp')} ${tx(lang, 'describeMore')}`, time: new Date() }]);
      }
    }
  };

  const send = () => {
    if (!input.trim() && photos.length === 0) return;
    setMessages(p => [...p, { from: 'user', text: input.trim(), photos: [...photos], time: new Date() }]);
    setDesc(p => p + '\n' + input.trim());
    const currentInput = input.trim();
    setInput('');
    setPhotos([]);
    scroll();

    if (!severity) {
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        const s = category?.id === 'safety' ? 'urgent' : 'medium';
        setSeverity(s);
        setMessages(p => [...p, {
          from: 'bot',
          text: `Thanks, ${displayName}. Flagged as ${s} priority ${category?.label.toLowerCase() ?? 'issue'}. Add photos, or submit when ready.`,
          time: new Date(),
          showActions: true,
        }]);
        scroll();
      }, 1200);
    } else {
      botMsg(tx(lang, 'addedToReport'));
    }
  };

  const submitIssue = async () => {
    if (!workspaceId || !propertyId) return;

    const userDesc = messages.filter(m => m.from === 'user').map(m => m.text).join(' ');
    const userPhotos = messages.filter(m => m.photos?.length).flatMap(m => m.photos ?? []);

    // Build default steps for the escalated screen
    const defaultSteps: TimelineStep[] = [
      { title: tx(lang, 'issueReported'), desc: tx(lang, 'reportSubmitted'), time: 'Just now' },
      { title: tx(lang, 'sentToPM'), desc: `${companyName} ${tx(lang, 'pmNotified')}`, time: 'Just now' },
      { title: tx(lang, 'pmReviewing'), desc: tx(lang, 'pmReviewingDesc'), time: '' },
      { title: tx(lang, 'dispatchApproved'), desc: tx(lang, 'proBeingContacted'), time: '' },
      { title: tx(lang, 'providerResponding'), desc: tx(lang, 'waitingAvail'), time: '' },
      { title: tx(lang, 'providerBooked'), desc: tx(lang, 'proAssigned'), time: '' },
      { title: tx(lang, 'resolvedStep'), desc: tx(lang, 'issueFixed'), time: '' },
    ];
    setTrackSteps(defaultSteps);
    setTrackStep(0);
    setScreen('escalated');

    try {
      const result = await guestFetch<{ issueId: string; autoDispatched: boolean }>(`/api/v1/guest/${workspaceId}/${propertyId}/issues`, {
        method: 'POST',
        body: JSON.stringify({
          categoryId: category?.id,
          severity,
          description: userDesc || desc,
          photos: userPhotos,
          troubleshootLog: tAnswers,
          guestName: displayName,
          confirmationCode: reservation?.matched ? reservation.reservationId : confirmationCode,
          language: lang,
        }),
      });

      setIssueId(result.issueId);

      // Animate the escalated steps
      if (result.autoDispatched) {
        setTimeout(() => setTrackStep(1), 800);
        setTimeout(() => setTrackStep(2), 1500);
        setTimeout(() => setTrackStep(3), 2500);
        setTimeout(() => { setScreen('tracking'); setTrackStep(4); }, 3500);
      } else {
        setTimeout(() => setTrackStep(1), 1000);
        setTimeout(() => setTrackStep(2), 2500);
        setTimeout(() => setTrackStep(3), 5000);
        setTimeout(() => { setScreen('tracking'); setTrackStep(3); }, 6000);
      }
    } catch {
      // On error, still show escalated screen but stay there
      setTimeout(() => setTrackStep(1), 1000);
    }
  };

  const submitSatisfaction = async (data: { rating: string; comment: string }) => {
    if (!issueId) return;
    try {
      await guestFetch(`/api/v1/guest/issues/${issueId}/satisfaction`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch {
      // Feedback submission is non-critical
    }
  };

  const userDesc = messages.filter(m => m.from === 'user').map(m => m.text).join(' ');
  const userPhotos = messages.filter(m => m.photos?.length).flatMap(m => m.photos ?? []);

  // ── Render ──
  if (loading) {
    return (
      <div style={{ fontFamily: "'DM Sans',sans-serif", maxWidth: 420, margin: '0 auto', minHeight: '100vh', background: BRAND.white, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${BRAND.warm}`, borderTopColor: BRAND.orange, animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ color: BRAND.gray, fontSize: 13 }}>Loading...</div>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: "'DM Sans',sans-serif", maxWidth: 420, margin: '0 auto', minHeight: '100vh', background: BRAND.white, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ textAlign: 'center', color: BRAND.red }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>{'\u26A0\uFE0F'}</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Something went wrong</div>
          <div style={{ fontSize: 12, color: BRAND.gray }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", maxWidth: 420, margin: '0 auto', minHeight: '100vh', background: BRAND.white, display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 0 60px rgba(0,0,0,0.08)' }}>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes typDot{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-4px);opacity:1}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{box-shadow:0 0 0 4px rgba(232,99,43,.12)}50%{box-shadow:0 0 0 8px rgba(232,99,43,.06)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box}input,textarea,button{font-family:'DM Sans',sans-serif}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:${BRAND.grayLight};border-radius:2px}
      `}</style>

      {/* Header */}
      <div style={{ background: BRAND.white, borderBottom: `1px solid ${BRAND.warm}`, padding: '11px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {!['welcome', 'identify', 'escalated', 'tracking'].includes(screen) && (
            <button
              onClick={() => {
                if (screen === 'categories') setScreen('welcome');
                else if (screen === 'subcategories') setScreen('categories');
                else if (screen === 'troubleshoot' || screen === 'chat') {
                  if (subcategory) setScreen('subcategories');
                  else setScreen('categories');
                }
                else if (screen === 'summary') setScreen('chat');
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, fontSize: 17, color: BRAND.gray }}
            >
              {'\u2190'}
            </button>
          )}
          <div>
            <div style={{ fontFamily: 'Fraunces,serif', fontWeight: 700, fontSize: 16, color: BRAND.dark }}>{companyName}</div>
            <div style={{ fontSize: 11, color: BRAND.gray }}>{propertyName}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <LangPicker lang={lang} setLang={setLang} open={langOpen} setOpen={setLangOpen} />
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: BRAND.orange, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'Fraunces,serif', fontWeight: 700, fontSize: 12, color: '#fff' }}>h</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }} onClick={() => langOpen && setLangOpen(false)}>

        {/* WELCOME */}
        {screen === 'welcome' && (
          <div style={{ padding: '28px 18px', animation: 'fadeUp 0.5s ease' }}>
            <div style={{ background: `linear-gradient(135deg, ${BRAND.warm} 0%, ${BRAND.greenLight} 100%)`, borderRadius: 22, padding: '30px 22px', marginBottom: 18, textAlign: 'center' }}>
              <div style={{ fontSize: 42, marginBottom: 8 }}>{'🏠'}</div>
              <h1 style={{ fontFamily: 'Fraunces,serif', fontSize: 25, fontWeight: 700, color: BRAND.dark, margin: '0 0 6px', lineHeight: 1.15 }}>
                {reservation?.matched ? `${displayName}, ` : ''}{tx(lang, 'needHelp')}
              </h1>
              <p style={{ fontSize: 14, color: BRAND.darkMid, lineHeight: 1.5, margin: 0 }}>{tx(lang, 'heroDesc')}</p>
            </div>

            <button
              onClick={() => {
                if (!reservation?.matched) {
                  setScreen('identify');
                } else {
                  fetchCategories();
                  setScreen('categories');
                }
              }}
              style={{ width: '100%', padding: '14px 22px', borderRadius: 13, border: 'none', background: BRAND.orange, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 18px rgba(232,99,43,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = BRAND.orangeDark; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = BRAND.orange; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
            >
              {tx(lang, 'reportIssue')} <span style={{ fontSize: 16 }}>{'\u2192'}</span>
            </button>

            {reservation?.matched && (
              <div style={{ marginTop: 24, padding: '14px 0', borderTop: `1px solid ${BRAND.warm}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: BRAND.gray }}>{tx(lang, 'yourStay')}</div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 100, background: BRAND.greenLight, fontSize: 10, fontWeight: 600, color: BRAND.greenDark }}>
                    <span style={{ fontSize: 8 }}>{'\u25CF'}</span> Auto-matched
                  </div>
                </div>
                {[
                  [tx(lang, 'property'), propertyName],
                  [tx(lang, 'checkIn'), reservation.checkIn ? new Date(reservation.checkIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''],
                  [tx(lang, 'checkOut'), reservation.checkOut ? new Date(reservation.checkOut).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''],
                  ['Guest', reservation.guestName ?? ''],
                  ['Reservation', reservation.reservationId ?? ''],
                ].map(([k, v], i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, color: BRAND.darkMid }}>{k}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: BRAND.dark }}>{v}</span>
                  </div>
                ))}
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: BRAND.gray, marginTop: 6, fontStyle: 'italic' }}>
                  Your reservation was automatically identified based on the property and your stay dates.
                </div>
              </div>
            )}

            <div style={{ marginTop: 10, padding: '11px 13px', borderRadius: 11, background: BRAND.redLight, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 13, flexShrink: 0 }}>{'🚨'}</span>
              <div style={{ fontSize: 11, color: BRAND.red, lineHeight: 1.5 }}><strong>{tx(lang, 'emergency')}</strong> {tx(lang, 'emergencyDesc')}</div>
            </div>
          </div>
        )}

        {/* IDENTIFY (no reservation match) */}
        {screen === 'identify' && (
          <div style={{ padding: '28px 18px', animation: 'fadeUp 0.5s ease' }}>
            <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: 20, fontWeight: 700, color: BRAND.dark, margin: '0 0 6px' }}>{tx(lang, 'yourStay')}</h2>
            <p style={{ fontSize: 13, color: BRAND.gray, margin: '0 0 20px' }}>{tx(lang, 'guestIdentify')}</p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.darkMid, display: 'block', marginBottom: 5 }}>{tx(lang, 'enterName')}</label>
              <input
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: `1.5px solid ${BRAND.grayLight}`, fontSize: 14, outline: 'none', background: BRAND.white, color: BRAND.dark, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.darkMid, display: 'block', marginBottom: 5 }}>{tx(lang, 'enterConfirmation')}</label>
              <input
                value={confirmationCode}
                onChange={e => setConfirmationCode(e.target.value)}
                style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: `1.5px solid ${BRAND.grayLight}`, fontSize: 14, outline: 'none', background: BRAND.white, color: BRAND.dark, boxSizing: 'border-box' }}
              />
            </div>

            <button
              onClick={() => {
                if (!guestName.trim()) return;
                fetchCategories();
                setScreen('categories');
              }}
              disabled={!guestName.trim()}
              style={{
                width: '100%', padding: '14px', borderRadius: 13, border: 'none',
                background: guestName.trim() ? BRAND.orange : BRAND.grayLight,
                color: guestName.trim() ? '#fff' : BRAND.gray,
                fontSize: 15, fontWeight: 600, cursor: guestName.trim() ? 'pointer' : 'default',
                transition: 'all 0.2s',
              }}
            >
              {tx(lang, 'continueBtn')} {'\u2192'}
            </button>
          </div>
        )}

        {/* CATEGORIES */}
        {screen === 'categories' && (
          <div style={{ padding: '14px 12px', animation: 'fadeUp 0.4s ease' }}>
            <div style={{ padding: '0 6px', marginBottom: 14 }}>
              <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: 20, fontWeight: 700, color: BRAND.dark, margin: '0 0 3px' }}>{tx(lang, 'whatsTheIssue')}</h2>
              <p style={{ fontSize: 12, color: BRAND.gray, margin: 0 }}>{tx(lang, 'selectCategory')}</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              {categories.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => selCat(c)}
                  style={{ background: BRAND.white, border: `1.5px solid ${BRAND.warm}`, borderRadius: 13, padding: '13px 11px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', animation: `fadeUp 0.3s ease ${i * 0.03}s both`, display: 'flex', flexDirection: 'column', gap: 3 }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLButtonElement; el.style.borderColor = c.color; el.style.background = BRAND.warm; el.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLButtonElement; el.style.borderColor = BRAND.warm; el.style.background = BRAND.white; el.style.transform = 'translateY(0)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 17 }}>{c.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: BRAND.dark }}>{c.label}</span>
                  </div>
                  <span style={{ fontSize: 10, color: BRAND.gray, lineHeight: 1.3 }}>{c.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* SUBCATEGORIES */}
        {screen === 'subcategories' && (
          <div style={{ padding: '14px 12px', animation: 'fadeUp 0.4s ease' }}>
            <div style={{ padding: '0 6px', marginBottom: 14 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 11px', borderRadius: 100, background: (category?.color ?? BRAND.gray) + '14', marginBottom: 8 }}>
                <span style={{ fontSize: 12 }}>{category?.icon}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: category?.color ?? BRAND.gray }}>{category?.label}</span>
              </div>
              <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: 18, fontWeight: 700, color: BRAND.dark, margin: '0 0 3px' }}>What specifically?</h2>
              <p style={{ fontSize: 12, color: BRAND.gray, margin: 0 }}>Pick the closest match so we can help faster</p>
            </div>
            {loadingSubcats ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', border: `3px solid ${BRAND.warm}`, borderTopColor: BRAND.orange, animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                {subcategories.map((s, i) => (
                  <button
                    key={s.label}
                    onClick={() => selSubcat(s)}
                    style={{ background: BRAND.white, border: `1.5px solid ${BRAND.warm}`, borderRadius: 12, padding: '11px 10px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', animation: `fadeUp 0.3s ease ${i * 0.04}s both`, display: 'flex', flexDirection: 'column', gap: 2 }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLButtonElement; el.style.borderColor = category?.color ?? BRAND.orange; el.style.background = BRAND.warm; el.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLButtonElement; el.style.borderColor = BRAND.warm; el.style.background = BRAND.white; el.style.transform = 'translateY(0)'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 15 }}>{s.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: BRAND.dark, lineHeight: 1.2 }}>{s.label}</span>
                    </div>
                    <span style={{ fontSize: 10, color: BRAND.gray, lineHeight: 1.3 }}>{s.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TROUBLESHOOT */}
        {screen === 'troubleshoot' && category?.troubleshootFlow && (
          <div style={{ padding: '18px 16px', animation: 'fadeUp 0.4s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14, padding: '9px 13px', background: BRAND.yellowLight, borderRadius: 11 }}>
              <span style={{ fontSize: 14 }}>{'🔧'}</span>
              <span style={{ fontSize: 12, color: '#8B6914', fontWeight: 500 }}>{tx(lang, 'quickFix')}</span>
            </div>
            {tAnswers.map((a, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ padding: '11px 14px', background: BRAND.warm, borderRadius: '14px 14px 14px 4px', marginBottom: 5, fontSize: 13, color: BRAND.dark, lineHeight: 1.45 }}>
                  {category.troubleshootFlow![i].q}
                </div>
                <div style={{ padding: '8px 13px', background: BRAND.orange + '12', borderRadius: '14px 14px 4px 14px', marginLeft: 'auto', width: 'fit-content', fontSize: 13, color: BRAND.orangeDark, fontWeight: 500 }}>
                  {a.a}
                </div>
              </div>
            ))}
            {tStep < category.troubleshootFlow.length && (
              <div style={{ animation: 'fadeUp 0.4s ease' }}>
                <div style={{ padding: '11px 14px', background: BRAND.warm, borderRadius: '14px 14px 14px 4px', marginBottom: 10, fontSize: 13, color: BRAND.dark, lineHeight: 1.45 }}>
                  {category.troubleshootFlow[tStep].q}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {category.troubleshootFlow[tStep].options.map((o, i) => (
                    <button
                      key={i}
                      onClick={() => tsAnswer(o)}
                      style={{ padding: '10px 14px', borderRadius: 9, border: `1.5px solid ${BRAND.grayLight}`, background: BRAND.white, fontSize: 13, color: BRAND.dark, fontWeight: 500, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
                      onMouseEnter={e => { const el = e.currentTarget as HTMLButtonElement; el.style.borderColor = BRAND.orange; el.style.background = BRAND.warm; }}
                      onMouseLeave={e => { const el = e.currentTarget as HTMLButtonElement; el.style.borderColor = BRAND.grayLight; el.style.background = BRAND.white; }}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={() => {
                setScreen('chat');
                if (subcategory) {
                  setMessages([]);
                  setTyping(true);
                  const pd: Record<string, unknown> = {};
                  if (propertyData?.details) pd.details = propertyData.details;
                  if (propertyData?.bedrooms) pd.bedrooms = propertyData.bedrooms;
                  if (propertyData?.bathrooms) pd.bathrooms = propertyData.bathrooms;
                  guestFetch<{ message: string }>(`/api/v1/guest/${workspaceId}/${propertyId}/chat-message`, {
                    method: 'POST',
                    body: JSON.stringify({ categoryLabel: category?.label, subcategoryLabel: subcategory, propertyDetails: Object.keys(pd).length > 0 ? pd : undefined }),
                  })
                    .then(data => { setTyping(false); setMessages([{ from: 'bot', text: data.message, time: new Date() }]); scroll(); })
                    .catch(() => { setTyping(false); setMessages([{ from: 'bot', text: `${tx(lang, 'proHelp')} ${tx(lang, 'describeMore')}`, time: new Date() }]); scroll(); });
                } else {
                  setMessages([{ from: 'bot', text: `${tx(lang, 'proHelp')} ${tx(lang, 'describeMore')}`, time: new Date() }]);
                }
              }}
              style={{ marginTop: 18, border: 'none', background: 'none', color: BRAND.gray, fontSize: 12, cursor: 'pointer', textDecoration: 'underline', display: 'block', width: '100%', textAlign: 'center' }}
            >
              {tx(lang, 'skipTroubleshoot')}
            </button>
          </div>
        )}

        {/* CHAT */}
        {screen === 'chat' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 55px)' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 6px' }}>
              {category && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 11px', borderRadius: 100, background: category.color + '14' }}>
                    <span style={{ fontSize: 12 }}>{category.icon}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: category.color }}>{category.label}</span>
                  </div>
                  {subcategory && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 100, background: BRAND.warm }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: BRAND.darkMid }}>{subcategory}</span>
                    </div>
                  )}
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{ marginBottom: 8, animation: 'fadeUp 0.3s ease', display: 'flex', flexDirection: 'column', alignItems: m.from === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '85%', padding: '10px 15px', borderRadius: m.from === 'user' ? '15px 15px 4px 15px' : '15px 15px 15px 4px', background: m.from === 'user' ? BRAND.orange : BRAND.warm, color: m.from === 'user' ? '#fff' : BRAND.dark, fontSize: 13, lineHeight: 1.5 }}>
                    {m.text}
                  </div>
                  {m.photos && m.photos.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {m.photos.map((p, j) => (
                        <div key={j} style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', border: `2px solid ${BRAND.warm}` }}>
                          <img src={p} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      ))}
                    </div>
                  )}
                  {m.showActions && (
                    <div style={{ display: 'flex', gap: 7, marginTop: 7, animation: 'fadeUp 0.4s ease' }}>
                      <button
                        onClick={() => setScreen('summary')}
                        style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: BRAND.orange, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = BRAND.orangeDark; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = BRAND.orange; }}
                      >
                        {tx(lang, 'submitReport')} {'\u2192'}
                      </button>
                      <button
                        onClick={() => inpRef.current?.focus()}
                        style={{ padding: '9px 13px', borderRadius: 9, border: `1.5px solid ${BRAND.grayLight}`, background: BRAND.white, color: BRAND.darkMid, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
                      >
                        {tx(lang, 'addMore')}
                      </button>
                    </div>
                  )}
                  <div style={{ fontSize: 9, color: BRAND.grayLight, marginTop: 2, padding: '0 3px' }}>
                    {m.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
              {typing && <TypingDots />}
              <div ref={chatEnd} />
            </div>
            {/* Input bar */}
            <div style={{ padding: '9px 12px', borderTop: `1px solid ${BRAND.warm}`, background: BRAND.white, position: 'sticky', bottom: 0 }}>
              {photos.length > 0 && (
                <PhotoUpload
                  photos={photos}
                  onAdd={p => setPhotos(pr => [...pr, p])}
                  onRemove={i => setPhotos(pr => pr.filter((_, j) => j !== i))}
                  lang={lang}
                />
              )}
              <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end' }}>
                <button
                  onClick={() => {
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = 'image/*';
                    fileInput.multiple = true;
                    fileInput.onchange = (e) => {
                      const files = (e.target as HTMLInputElement).files;
                      if (!files) return;
                      Array.from(files).slice(0, 4 - photos.length).forEach(f => {
                        const reader = new FileReader();
                        reader.onload = ev => { if (ev.target?.result) setPhotos(pr => [...pr, ev.target!.result as string].slice(0, 4)); };
                        reader.readAsDataURL(f);
                      });
                    };
                    fileInput.click();
                  }}
                  style={{ width: 36, height: 36, borderRadius: 9, border: `1.5px solid ${BRAND.grayLight}`, background: BRAND.white, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 15 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = BRAND.orange; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = BRAND.grayLight; }}
                >
                  {'📷'}
                </button>
                <VoiceBtn onResult={t => setInput(p => p + (p ? ' ' : '') + t)} lang={lang} />
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', border: `1.5px solid ${BRAND.grayLight}`, borderRadius: 9, padding: '0 3px 0 11px', background: BRAND.white }}>
                  <input
                    ref={inpRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') send(); }}
                    placeholder={tx(lang, 'describeIssue')}
                    style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, padding: '8px 0', background: 'transparent', color: BRAND.dark }}
                  />
                  <button
                    onClick={send}
                    disabled={!input.trim() && !photos.length}
                    style={{
                      width: 28, height: 28, borderRadius: 7, border: 'none',
                      background: input.trim() || photos.length ? BRAND.orange : BRAND.warm,
                      color: input.trim() || photos.length ? '#fff' : BRAND.grayLight,
                      cursor: input.trim() || photos.length ? 'pointer' : 'default',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, transition: 'all 0.2s',
                    }}
                  >
                    {'\u2191'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUMMARY */}
        {screen === 'summary' && (
          <div style={{ padding: '18px 16px', animation: 'slideUp 0.5s ease' }}>
            <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: 20, fontWeight: 700, color: BRAND.dark, margin: '0 0 3px' }}>{tx(lang, 'reviewReport')}</h2>
            <p style={{ fontSize: 12, color: BRAND.gray, margin: '0 0 16px' }}>{companyName} {tx(lang, 'willBeSent')}</p>

            <div style={{ background: BRAND.warm, borderRadius: 16, padding: '18px 16px', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 17 }}>{category?.icon}</span>
                    <span style={{ fontFamily: 'Fraunces,serif', fontSize: 16, fontWeight: 700, color: BRAND.dark }}>{category?.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: BRAND.gray }}>{propertyName}</div>
                </div>
                {severity && <SevBadge level={severity} />}
              </div>
              <div style={{ borderTop: `1px solid ${BRAND.grayLight}20`, paddingTop: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: BRAND.gray, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>{tx(lang, 'description')}</div>
                <div style={{ fontSize: 13, color: BRAND.dark, lineHeight: 1.5 }}>{userDesc || tx(lang, 'noDescProvided')}</div>
              </div>
              {userPhotos.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: BRAND.gray, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>{tx(lang, 'photos')}</div>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {userPhotos.map((p, i) => (
                      <div key={i} style={{ width: 58, height: 58, borderRadius: 9, overflow: 'hidden', border: `2px solid ${BRAND.grayLight}` }}>
                        <img src={p} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {tAnswers.length > 0 && (
                <div style={{ borderTop: `1px solid ${BRAND.grayLight}20`, paddingTop: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: BRAND.gray, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>{tx(lang, 'troubleshootAttempted')}</div>
                  {tAnswers.map((a, i) => (
                    <div key={i} style={{ fontSize: 12, color: BRAND.darkMid, marginBottom: 2, lineHeight: 1.4 }}>
                      <span style={{ color: BRAND.gray }}>{'\u2192'} </span>{a.a}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {statusData?.recurring && <RecurringAlert recurring={statusData.recurring} lang={lang} />}

            <button
              onClick={submitIssue}
              style={{ width: '100%', padding: '14px', borderRadius: 11, border: 'none', background: BRAND.orange, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', marginTop: 14, boxShadow: '0 4px 18px rgba(232,99,43,0.25)' }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLButtonElement; el.style.background = BRAND.orangeDark; el.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLButtonElement; el.style.background = BRAND.orange; el.style.transform = 'translateY(0)'; }}
            >
              {tx(lang, 'sendToPM')} {'\u2192'}
            </button>
            <button
              onClick={() => setScreen('chat')}
              style={{ width: '100%', marginTop: 7, padding: '10px', borderRadius: 11, border: `1.5px solid ${BRAND.grayLight}`, background: BRAND.white, color: BRAND.darkMid, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            >
              {tx(lang, 'editReport')}
            </button>
          </div>
        )}

        {/* ESCALATED (submission animation) */}
        {screen === 'escalated' && (
          <div style={{ padding: '36px 18px', animation: 'fadeUp 0.5s ease' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: BRAND.greenLight, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: 22 }}>{'\u2713'}</div>
              <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: 21, fontWeight: 700, color: BRAND.dark, margin: '0 0 5px' }}>{tx(lang, 'reportSent')}</h2>
              <p style={{ fontSize: 12, color: BRAND.gray, lineHeight: 1.5, margin: 0 }}>{companyName} {tx(lang, 'notified')}</p>
            </div>
            {severity && <SLABanner severity={severity} lang={lang} />}
            <div style={{ background: BRAND.warm, borderRadius: 13, padding: '14px', marginTop: 14 }}>
              <StatusTracker steps={trackSteps} cur={trackStep} />
            </div>
          </div>
        )}

        {/* TRACKING */}
        {screen === 'tracking' && (
          <div style={{ padding: '18px 16px', animation: 'fadeUp 0.5s ease' }}>
            <div style={{ background: `linear-gradient(135deg, ${BRAND.greenLight} 0%, ${BRAND.warm} 100%)`, borderRadius: 16, padding: '20px 16px', marginBottom: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 5 }}>{'\uD83D\uDEE0\uFE0F'}</div>
              <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: 19, fontWeight: 700, color: BRAND.dark, margin: '0 0 3px' }}>{tx(lang, 'helpOnWay')}</h2>
              <p style={{ fontSize: 11, color: BRAND.gray, margin: 0 }}>{category?.label} {tx(lang, 'issueBeingHandled')}</p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', background: BRAND.warm, borderRadius: 11, marginBottom: 14 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: (category?.color ?? BRAND.gray) + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>{category?.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.dark }}>{category?.label}</div>
                <div style={{ fontSize: 10, color: BRAND.gray }}>{propertyName}</div>
              </div>
              {severity && <SevBadge level={severity} />}
            </div>

            <StatusTracker steps={trackSteps} cur={trackStep} />

            {statusData?.provider && (
              <div style={{ animation: 'fadeUp 0.5s ease', marginTop: 10, background: BRAND.white, border: `1.5px solid ${BRAND.greenLight}`, borderRadius: 13, padding: '13px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: BRAND.gray, marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.5 }}>{tx(lang, 'providerAssigned')}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: BRAND.green, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{statusData.provider.initials}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.dark }}>{statusData.provider.name}</div>
                    <div style={{ fontSize: 10, color: BRAND.gray }}>{'\u2B50'} {statusData.provider.rating} {'\u00b7'} {statusData.provider.specialty}</div>
                  </div>
                </div>
                {statusData.provider.eta && (
                  <div style={{ marginTop: 8, padding: '7px 10px', background: BRAND.greenLight, borderRadius: 7, fontSize: 11, color: BRAND.greenDark, fontWeight: 500 }}>
                    {tx(lang, 'estArrival')}: {statusData.provider.eta}
                  </div>
                )}
              </div>
            )}

            {showResolved && (
              <div style={{ marginTop: 18 }}>
                <Satisfaction lang={lang} onSubmit={submitSatisfaction} />
              </div>
            )}

            <div style={{ marginTop: 18, textAlign: 'center', padding: '10px', borderTop: `1px solid ${BRAND.warm}` }}>
              <div style={{ fontSize: 9, color: BRAND.grayLight, marginBottom: 5 }}>{tx(lang, 'lastUpdated')}: just now {'\u00b7'} {tx(lang, 'autoRefresh')}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <span style={{ fontSize: 10, color: BRAND.gray }}>{tx(lang, 'poweredBy')}</span>
                <span style={{ fontFamily: 'Fraunces,serif', fontWeight: 700, fontSize: 12, color: BRAND.orange }}>homie</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
