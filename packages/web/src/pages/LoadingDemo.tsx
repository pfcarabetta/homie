import HomieLoadingAnimation from '@/components/HomieLoadingAnimation';

export default function LoadingDemo() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#F9F5F2',
        padding: '2rem',
      }}
    >
      <h1
        style={{
          fontFamily: 'Fraunces, serif',
          fontSize: 28,
          fontWeight: 700,
          color: '#2D2926',
          textAlign: 'center',
          marginBottom: '2rem',
        }}
      >
        HomieLoadingAnimation Demo
      </h1>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          gap: '2rem',
          flexWrap: 'wrap',
        }}
      >
        {/* Small */}
        <div
          style={{
            background: 'white',
            borderRadius: 16,
            border: '1px solid #E8E2DD',
            minWidth: 200,
          }}
        >
          <div
            style={{
              padding: '0.75rem 1rem',
              borderBottom: '1px solid #E8E2DD',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: '#9B9490',
              textAlign: 'center',
            }}
          >
            size=&quot;sm&quot;
          </div>
          <HomieLoadingAnimation size="sm" />
        </div>

        {/* Medium (default) */}
        <div
          style={{
            background: 'white',
            borderRadius: 16,
            border: '1px solid #E8E2DD',
            minWidth: 280,
          }}
        >
          <div
            style={{
              padding: '0.75rem 1rem',
              borderBottom: '1px solid #E8E2DD',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: '#9B9490',
              textAlign: 'center',
            }}
          >
            size=&quot;md&quot; (default)
          </div>
          <HomieLoadingAnimation />
        </div>

        {/* Large */}
        <div
          style={{
            background: 'white',
            borderRadius: 16,
            border: '1px solid #E8E2DD',
            minWidth: 320,
          }}
        >
          <div
            style={{
              padding: '0.75rem 1rem',
              borderBottom: '1px solid #E8E2DD',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: '#9B9490',
              textAlign: 'center',
            }}
          >
            size=&quot;lg&quot;
          </div>
          <HomieLoadingAnimation size="lg" />
        </div>
      </div>

      {/* Custom props version */}
      <div
        style={{
          marginTop: '2rem',
          maxWidth: 400,
          marginLeft: 'auto',
          marginRight: 'auto',
          background: 'white',
          borderRadius: 16,
          border: '1px solid #E8E2DD',
        }}
      >
        <div
          style={{
            padding: '0.75rem 1rem',
            borderBottom: '1px solid #E8E2DD',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color: '#9B9490',
            textAlign: 'center',
          }}
        >
          Custom Props
        </div>
        <HomieLoadingAnimation
          headline="Finding your plumber"
          subtext="Checking availability in Brooklyn"
          messages={[
            'Verifying licenses & insurance',
            'Comparing ratings & reviews',
            'Almost there!',
          ]}
          showChannels={false}
          size="md"
        />
      </div>
    </div>
  );
}
