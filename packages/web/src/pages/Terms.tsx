import { Link } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function Terms() {
  useDocumentTitle('Terms of Service');
  return (
    <div style={{ minHeight: '100vh', background: '#F9F5F2', fontFamily: "'DM Sans', sans-serif" }}>
      <header style={{ padding: '24px 0', textAlign: 'center' }}>
        <Link to="/" style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: '#E8632B', textDecoration: 'none' }}>homie</Link>
      </header>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 24px 80px', color: '#2D2926' }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Terms of Service</h1>
        <p style={{ color: '#9B9490', fontSize: 14, marginBottom: 32 }}>Last updated: March 31, 2026</p>

        <div style={{ fontSize: 15, lineHeight: 1.8, color: '#6B6560' }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#2D2926', marginTop: 32, marginBottom: 12 }}>1. Service Description</h2>
          <p>Homie is an AI-powered platform that connects homeowners with local service providers. Our AI agent contacts providers on your behalf via phone call, text message, and email to obtain quotes and availability for home maintenance and repair services.</p>

          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#2D2926', marginTop: 32, marginBottom: 12 }}>2. Consent to Contact Providers</h2>
          <p>By submitting a quote request through Homie, you expressly authorize Homie to contact service providers on your behalf using automated phone calls, text messages (SMS), and email communications. This authorization is granted each time you submit a new quote request and select a service tier.</p>

          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#2D2926', marginTop: 32, marginBottom: 12 }}>2a. SMS/Text Messaging Terms</h2>
          <p>By checking the SMS opt-in checkbox during account registration and providing your phone number, you expressly consent to receive recurring automated text messages from Homie at the phone number provided. These messages include booking confirmations, maintenance status updates, provider notifications, quote results, and account security alerts.</p>
          <p><strong>Message frequency:</strong> Message frequency varies. You may receive up to 10 messages per service request and up to 25 messages per month depending on your activity level.</p>
          <p><strong>Message and data rates may apply.</strong> Your mobile carrier's standard messaging and data rates apply to all SMS messages sent and received. Homie is not responsible for any charges from your carrier.</p>
          <p><strong>Opt-out:</strong> You may revoke your consent and stop receiving SMS messages at any time by replying <strong>STOP</strong> to any message from Homie. After opting out, you will receive one final confirmation message. No further messages will be sent unless you re-subscribe by replying <strong>START</strong>.</p>
          <p><strong>Help:</strong> Reply <strong>HELP</strong> to any message for assistance, or contact us at yo@homiepro.ai.</p>
          <p>Consent to receive SMS messages is not a condition of purchasing any goods or services from Homie. You may use Homie's services without opting in to SMS notifications.</p>
          <p>Homie's SMS messaging is powered by Twilio. By opting in, you also agree to Twilio's Messaging Policy. Homie will not sell, rent, or share your phone number or opt-in status with third parties for marketing purposes.</p>

          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#2D2926', marginTop: 32, marginBottom: 12 }}>3. Payment Terms</h2>
          <p>Homie charges a service fee based on the selected tier (Standard, Priority, or Emergency). Your payment method is authorized at the time of purchase but is only charged if provider quotes are received. If no providers respond, your payment authorization is released and you are not charged.</p>

          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#2D2926', marginTop: 32, marginBottom: 12 }}>4. Provider Relationships</h2>
          <p>Homie facilitates introductions between homeowners and service providers. Homie is not a service provider and does not perform any home maintenance or repair work. All work is performed by independent service providers. Payment for services rendered is made directly between the homeowner and the provider — Homie does not handle payments between parties.</p>

          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#2D2926', marginTop: 32, marginBottom: 12 }}>5. DIY Diagnostic Tool</h2>
          <p>The free DIY diagnostic chat provides guidance and recommendations based on AI analysis. This information is for informational purposes only and should not be considered a substitute for professional assessment. Always consult a licensed professional for safety-critical issues.</p>

          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#2D2926', marginTop: 32, marginBottom: 12 }}>6. Account Terms</h2>
          <p>You are responsible for maintaining the security of your account credentials. You must provide accurate information when creating an account. Homie reserves the right to suspend or terminate accounts that violate these terms.</p>

          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#2D2926', marginTop: 32, marginBottom: 12 }}>7. Limitation of Liability</h2>
          <p>Homie is not liable for the quality, safety, or legality of services provided by third-party service providers. Homie does not guarantee that providers will respond to outreach attempts or that quotes will be received within any specific timeframe.</p>

          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#2D2926', marginTop: 32, marginBottom: 12 }}>8. Contact</h2>
          <p>For questions about these terms, contact us at yo@homiepro.ai.</p>
        </div>
      </div>
    </div>
  );
}
