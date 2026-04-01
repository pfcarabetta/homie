import { Link } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function Privacy() {
  useDocumentTitle('Privacy Policy');
  return (
    <div style={{ minHeight: '100vh', background: '#F9F5F2', fontFamily: "'DM Sans', sans-serif" }}>
      <header style={{ padding: '24px 0', textAlign: 'center' }}>
        <Link to="/" style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: '#E8632B', textDecoration: 'none' }}>homie</Link>
      </header>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 24px 80px', color: '#2D2926' }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Privacy Policy</h1>
        <p style={{ color: '#9B9490', fontSize: 14, marginBottom: 32 }}>Last updated: March 31, 2026</p>

        <div style={{ fontSize: 15, lineHeight: 1.8, color: '#6B6560' }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#2D2926', marginTop: 32, marginBottom: 12 }}>1. Information We Collect</h2>
          <p><strong>Account information:</strong> name, email address, phone number, zip code, and password when you create an account.</p>
          <p><strong>Job request information:</strong> descriptions of home maintenance issues, photos, location, timing preferences, and budget.</p>
          <p><strong>Payment information:</strong> processed securely by Stripe. We do not store your credit card details.</p>
          <p><strong>Usage data:</strong> IP address, browser type, and interaction data to improve our service.</p>

          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#2D2926', marginTop: 32, marginBottom: 12 }}>2. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul style={{ paddingLeft: 20 }}>
            <li>Connect you with local service providers by sharing relevant job details</li>
            <li>Contact providers on your behalf via phone call, text message, and email</li>
            <li>Process payments for our service</li>
            <li>Send you account notifications and service updates</li>
            <li>Improve our AI diagnostic and matching algorithms</li>
          </ul>

          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#2D2926', marginTop: 32, marginBottom: 12 }}>3. Information Shared with Providers</h2>
          <p>When you submit a quote request, we share the following with service providers:</p>
          <ul style={{ paddingLeft: 20 }}>
            <li>Your job description and AI diagnosis</li>
            <li>Your zip code and service area</li>
            <li>Your timing preference and budget range</li>
            <li>Photos you upload related to the issue</li>
          </ul>
          <p>We do not share your name, email, phone number, or payment information with providers until you choose to book a provider.</p>

          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#2D2926', marginTop: 32, marginBottom: 12 }}>4. Communications</h2>
          <p>By using Homie, you consent to receiving:</p>
          <ul style={{ paddingLeft: 20 }}>
            <li>Transactional emails (account verification, booking confirmations, quote results)</li>
            <li>Service-related notifications about your job requests</li>
          </ul>
          <p>We use Twilio for phone and SMS communications with providers, and SendGrid for email delivery. These services process data according to their own privacy policies.</p>

          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#2D2926', marginTop: 32, marginBottom: 12 }}>4a. SMS/Text Messaging</h2>
          <p>If you provide your phone number and opt in to SMS notifications during account registration, you consent to receive text messages from Homie related to your use of the platform. These messages may include:</p>
          <ul style={{ paddingLeft: 20 }}>
            <li>Booking confirmations and appointment details</li>
            <li>Maintenance status updates and provider notifications</li>
            <li>Quote results and provider responses</li>
            <li>Account security alerts (password resets, verification codes)</li>
            <li>Booking cancellation notices</li>
          </ul>
          <p><strong>Message frequency:</strong> Message frequency varies based on your activity. You may receive up to 10 messages per service request. Ongoing users may receive up to 25 messages per month depending on the number of active jobs and bookings.</p>
          <p><strong>Message and data rates:</strong> Message and data rates may apply depending on your mobile carrier and plan. Homie is not responsible for any charges incurred from your carrier for receiving SMS messages.</p>
          <p><strong>Opt-out:</strong> You may opt out of SMS notifications at any time by replying <strong>STOP</strong> to any message from Homie. You will receive a confirmation message and no further SMS messages will be sent. You may re-subscribe at any time by replying <strong>START</strong>.</p>
          <p><strong>Help:</strong> For help with SMS messaging, reply <strong>HELP</strong> to any message from Homie, or contact us at yo@homiepro.ai.</p>
          <p><strong>Supported carriers:</strong> Homie SMS messaging is supported on all major US carriers including AT&T, T-Mobile, Verizon, and Sprint. Coverage may vary by location and carrier.</p>
          <p>Your phone number and SMS opt-in status are stored securely. We do not sell, share, or use your phone number for marketing purposes unrelated to the Homie platform. Your consent is recorded with a timestamp for compliance purposes.</p>

          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#2D2926', marginTop: 32, marginBottom: 12 }}>5. Data Security</h2>
          <p>We implement industry-standard security measures including encrypted data transmission (HTTPS), secure password hashing (bcrypt), and JWT-based authentication. Payment processing is handled by Stripe, a PCI-compliant payment processor.</p>

          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#2D2926', marginTop: 32, marginBottom: 12 }}>6. Data Retention</h2>
          <p>We retain your account data for as long as your account is active. Job request data is retained for up to 2 years for service improvement purposes. You may request deletion of your data by contacting us.</p>

          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#2D2926', marginTop: 32, marginBottom: 12 }}>7. Your Rights</h2>
          <p>You have the right to access, correct, or delete your personal information. You can update your profile information through your account settings or contact us for data deletion requests.</p>

          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#2D2926', marginTop: 32, marginBottom: 12 }}>8. Provider Data</h2>
          <p>Service provider information (business name, phone number, ratings) is collected from publicly available sources including Google Maps and Yelp. Providers can opt out of receiving Homie outreach through our provider portal or by contacting us.</p>

          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#2D2926', marginTop: 32, marginBottom: 12 }}>9. Contact</h2>
          <p>For privacy-related questions or data requests, contact us at yo@homiepro.ai.</p>
        </div>
      </div>
    </div>
  );
}
