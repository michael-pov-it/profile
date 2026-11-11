import fs from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { getProfile } from '@/lib/content/collections';

// The link preview image (LinkedIn, Slack, chat apps): the home page's terminal, at 1200x630.
// Rendered once at build time. Colors are the dark `crt` theme from globals.css.
export const alt = 'Terminal login screen for Mike G., SRE and DevOps architect, listing his certifications';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BG = '#0c1410';
const FG = '#8af5a0';
const DIM = '#56966a';
const RULE = '#2a4535';

// Static cuts of Martian Mono: the image renderer cannot use the variable web font.
const font = (file: string) => fs.readFileSync(path.join(process.cwd(), 'src/assets/og', file));

export default function OpengraphImage() {
  const profile = getProfile();
  const domain = profile.siteUrl ? new URL(profile.siteUrl).host : `${profile.handle}@${profile.host}`;

  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', padding: 28, background: BG, color: FG, fontFamily: 'Martian Mono' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, border: `2px solid ${RULE}` }}>
          <div style={{ display: 'flex', padding: '14px 32px', borderBottom: `2px solid ${RULE}`, color: DIM, fontSize: 24 }}>
            {profile.handle}@{profile.host}: ~
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '34px 48px 0' }}>
            <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, lineHeight: 1.15 }}>
              <span style={{ color: DIM, marginRight: 28 }}>$</span>
              <span>
                ssh {profile.handle}@{profile.host}
              </span>
            </div>

            <div style={{ display: 'flex', marginTop: 30, fontSize: 40, fontWeight: 700 }}>{profile.name}</div>
            <div style={{ display: 'flex', marginTop: 6, fontSize: 34 }}>{profile.role}</div>

            {profile.certifications.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 34, fontSize: 26, lineHeight: 1.5 }}>
                <div style={{ display: 'flex', color: DIM }}>$ ls ~/certs</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 40 }}>
                  {profile.certifications.map((cert) => (
                    <span key={cert}>{cert}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '14px 32px',
              borderTop: `2px solid ${RULE}`,
              fontSize: 24,
            }}
          >
            <span>{domain}</span>
            {profile.uptime && <span style={{ color: DIM }}>up {profile.uptime}</span>}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Martian Mono', data: font('MartianMono-Regular.ttf'), weight: 400, style: 'normal' },
        { name: 'Martian Mono', data: font('MartianMono-Bold.ttf'), weight: 700, style: 'normal' },
      ],
    },
  );
}
