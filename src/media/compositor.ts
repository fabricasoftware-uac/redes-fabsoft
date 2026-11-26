import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import satori, { type Font } from 'satori';
import sharp from 'sharp';
import { BRAND_KIT, type PillarKey, type TemplateKey } from '../config/brandKit.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGOS_DIR = path.resolve(__dirname, '../../logos');

export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1350;
const MAX_INSTAGRAM_BYTES = 8 * 1024 * 1024; // 8 MB Meta Graph API limit

// Satori virtual DOM node shape (JSX-free)
interface SatoriNode {
  type: string;
  props: Record<string, unknown>;
}

function el(
  type: string,
  style: Record<string, unknown>,
  children?: SatoriNode | SatoriNode[] | string | null
): SatoriNode {
  const props: Record<string, unknown> = { style };
  if (children !== undefined && children !== null) {
    props.children = children;
  }
  return { type, props };
}

function imgEl(
  src: string,
  width: number,
  height: number,
  style: Record<string, unknown> = {}
): SatoriNode {
  return {
    type: 'img',
    props: {
      src,
      width,
      height,
      style: {
        width,
        height,
        ...style,
      },
    },
  };
}

let cachedFonts: Font[] | null = null;
let cachedLogos: {
  color: string;
  azul: string;
  negroProfile: string;
} | null = null;

async function loadFonts(): Promise<Font[]> {
  if (cachedFonts) return cachedFonts;

  const sgDir = path.dirname(require.resolve('@fontsource/space-grotesk/package.json'));
  const interDir = path.dirname(require.resolve('@fontsource/inter/package.json'));

  const [sg400, sg500, sg700, inter400, inter500, inter600, inter700] = await Promise.all([
    readFile(path.join(sgDir, 'files/space-grotesk-latin-400-normal.woff')),
    readFile(path.join(sgDir, 'files/space-grotesk-latin-500-normal.woff')),
    readFile(path.join(sgDir, 'files/space-grotesk-latin-700-normal.woff')),
    readFile(path.join(interDir, 'files/inter-latin-400-normal.woff')),
    readFile(path.join(interDir, 'files/inter-latin-500-normal.woff')),
    readFile(path.join(interDir, 'files/inter-latin-600-normal.woff')),
    readFile(path.join(interDir, 'files/inter-latin-700-normal.woff')),
  ]);

  cachedFonts = [
    { name: 'Space Grotesk', data: sg400, weight: 400, style: 'normal' },
    { name: 'Space Grotesk', data: sg500, weight: 500, style: 'normal' },
    { name: 'Space Grotesk', data: sg700, weight: 700, style: 'normal' },
    { name: 'Inter', data: inter400, weight: 400, style: 'normal' },
    { name: 'Inter', data: inter500, weight: 500, style: 'normal' },
    { name: 'Inter', data: inter600, weight: 600, style: 'normal' },
    { name: 'Inter', data: inter700, weight: 700, style: 'normal' },
  ];

  return cachedFonts;
}

async function loadLogos(): Promise<{
  color: string;
  azul: string;
  negroProfile: string;
}> {
  if (cachedLogos) return cachedLogos;

  const [colorBuf, azulBuf, negroBuf] = await Promise.all([
    readFile(path.join(LOGOS_DIR, 'logo_fabsoft_color.png')),
    readFile(path.join(LOGOS_DIR, 'logo_fabsoft_azul.png')),
    readFile(path.join(LOGOS_DIR, 'logo_fabsoft_negro_profile.png')),
  ]);

  cachedLogos = {
    color: `data:image/png;base64,${colorBuf.toString('base64')}`,
    azul: `data:image/png;base64,${azulBuf.toString('base64')}`,
    negroProfile: `data:image/png;base64,${negroBuf.toString('base64')}`,
  };

  return cachedLogos;
}

export interface ComposePostImageInput {
  template: TemplateKey;
  pillar: PillarKey;
  headline: string;
  subheadline: string | null;
  highlightPhrase?: string | null;
  accentLabel?: string;
  aiBackgroundBuffer?: Buffer | null;
}

function splitByHighlight(
  headline: string,
  highlightPhrase?: string | null
): { before: string; highlight: string | null; after: string } {
  if (!highlightPhrase || highlightPhrase.trim().length === 0) {
    return { before: headline, highlight: null, after: '' };
  }
  const idx = headline.indexOf(highlightPhrase);
  if (idx === -1) {
    return { before: headline, highlight: null, after: '' };
  }
  return {
    before: headline.slice(0, idx),
    highlight: highlightPhrase,
    after: headline.slice(idx + highlightPhrase.length),
  };
}

function buildDarkTechHeroTree(
  input: ComposePostImageInput,
  logoColorUri: string,
  hasAiBackground: boolean
): SatoriNode {
  const { palette } = BRAND_KIT;
  const pillarInfo = BRAND_KIT.pillars[input.pillar];
  const label = (input.accentLabel ?? pillarInfo.label).toUpperCase();
  const headlineSize = input.headline.length > 48 ? 64 : input.headline.length > 32 ? 74 : 84;

  const rootBackground = hasAiBackground
    ? {
        backgroundImage:
          'linear-gradient(100deg, rgba(4,11,26,0.94) 0%, rgba(4,11,26,0.78) 54%, rgba(4,11,26,0.30) 100%)',
      }
    : {
        backgroundColor: palette.deepSpaceBlue,
        backgroundImage:
          'radial-gradient(circle at 85% 22%, rgba(0,82,255,0.44) 0%, rgba(18,130,255,0.14) 32%, rgba(4,11,26,0) 64%), radial-gradient(circle at 18% 88%, rgba(18,130,255,0.18) 0%, rgba(4,11,26,0) 50%)',
      };

  return el(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      padding: '76px 76px 72px 76px',
      fontFamily: 'Space Grotesk',
      position: 'relative',
      ...rootBackground,
    },
    [
      // Top bar: Official Logo left + Clean editorial index marker right (no generic AI pill)
      el(
        'div',
        {
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          paddingBottom: 24,
          borderBottom: '1px solid rgba(245, 247, 250, 0.12)',
        },
        [
          imgEl(logoColorUri, 205, 52, { objectFit: 'contain' }),
          el(
            'div',
            {
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            },
            [
              el('div', {
                display: 'flex',
                width: 8,
                height: 8,
                borderRadius: 999,
                backgroundColor: palette.orbitCyan,
              }),
              el(
                'div',
                {
                  display: 'flex',
                  color: '#CBD5E1',
                  fontFamily: 'Inter',
                  fontSize: 19,
                  fontWeight: 600,
                  letterSpacing: '0.16em',
                },
                `${pillarInfo.code} / ${label}`
              ),
            ]
          ),
        ]
      ),

      // Main typography block (left-aligned, editorial studio style)
      el(
        'div',
        {
          display: 'flex',
          flexDirection: 'column',
          maxWidth: 840,
          gap: 30,
        },
        [
          // Thin editorial accent line
          el('div', {
            display: 'flex',
            width: 72,
            height: 5,
            backgroundColor: palette.propulsionBlue,
          }),
          el(
            'div',
            {
              display: 'flex',
              color: palette.stellarWhite,
              fontFamily: 'Space Grotesk',
              fontSize: headlineSize,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: '-0.025em',
            },
            input.headline
          ),
          ...(input.subheadline
            ? [
                el(
                  'div',
                  {
                    display: 'flex',
                    color: '#CBD5E1',
                    fontFamily: 'Inter',
                    fontSize: 32,
                    fontWeight: 400,
                    lineHeight: 1.42,
                    maxWidth: 740,
                  },
                  input.subheadline
                ),
              ]
            : []),
        ]
      ),

      // Footer bar (clean editorial typography, no pill)
      el(
        'div',
        {
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          paddingTop: 28,
          borderTop: '1px solid rgba(245, 247, 250, 0.14)',
        },
        [
          el(
            'div',
            {
              display: 'flex',
              color: palette.stellarWhite,
              fontFamily: 'Inter',
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '0.02em',
            },
            BRAND_KIT.website
          ),
          el(
            'div',
            {
              display: 'flex',
              color: palette.mutedSlate,
              fontFamily: 'Inter',
              fontSize: 21,
              fontWeight: 500,
              letterSpacing: '0.04em',
            },
            BRAND_KIT.handle
          ),
        ]
      ),
    ]
  );
}

function buildEditorialLightTree(
  input: ComposePostImageInput,
  logoAzulUri: string
): SatoriNode {
  const { palette } = BRAND_KIT;
  const pillarInfo = BRAND_KIT.pillars[input.pillar];
  const label = (input.accentLabel ?? pillarInfo.label).toUpperCase();
  const headlineSize = input.headline.length > 52 ? 64 : input.headline.length > 36 ? 74 : 84;
  const { before, highlight, after } = splitByHighlight(
    input.headline,
    input.highlightPhrase
  );

  // Build inline-wrapped headline segments
  const headlineChildren: SatoriNode[] = [];
  if (highlight) {
    if (before.trim().length > 0) {
      headlineChildren.push(
        el(
          'span',
          {
            display: 'flex',
            color: palette.deepSpaceBlue,
          },
          before
        )
      );
    }
    headlineChildren.push(
      el(
        'span',
        {
          display: 'flex',
          backgroundColor: palette.softCyanHighlight,
          color: palette.propulsionBlue,
          padding: '2px 18px 6px 18px',
          borderRadius: 16,
        },
        highlight
      )
    );
    if (after.trim().length > 0) {
      headlineChildren.push(
        el(
          'span',
          {
            display: 'flex',
            color: palette.deepSpaceBlue,
          },
          after
        )
      );
    }
  }

  return el(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: palette.stellarWhite,
      padding: '76px 76px 72px 76px',
      fontFamily: 'Space Grotesk',
    },
    [
      // Top header: Circle number + Pillar label
      el(
        'div',
        {
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 20,
        },
        [
          el(
            'div',
            {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 72,
              height: 72,
              borderRadius: 999,
              backgroundColor: palette.propulsionBlue,
              color: palette.pureWhite,
              fontFamily: 'Space Grotesk',
              fontSize: 30,
              fontWeight: 700,
            },
            pillarInfo.code
          ),
          el(
            'div',
            {
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            },
            [
              el(
                'div',
                {
                  display: 'flex',
                  color: palette.propulsionBlue,
                  fontFamily: 'Inter',
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                },
                label
              ),
              el(
                'div',
                {
                  display: 'flex',
                  color: palette.darkSlate,
                  fontFamily: 'Inter',
                  fontSize: 19,
                  fontWeight: 500,
                },
                BRAND_KIT.tagline
              ),
            ]
          ),
        ]
      ),

      // Main editorial headline & subheadline
      el(
        'div',
        {
          display: 'flex',
          flexDirection: 'column',
          gap: 36,
          maxWidth: 928,
        },
        [
          highlight
            ? el(
                'div',
                {
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  columnGap: 14,
                  rowGap: 12,
                  fontFamily: 'Space Grotesk',
                  fontSize: headlineSize,
                  fontWeight: 700,
                  lineHeight: 1.12,
                  letterSpacing: '-0.025em',
                },
                headlineChildren
              )
            : el(
                'div',
                {
                  display: 'flex',
                  color: palette.deepSpaceBlue,
                  fontFamily: 'Space Grotesk',
                  fontSize: headlineSize,
                  fontWeight: 700,
                  lineHeight: 1.1,
                  letterSpacing: '-0.025em',
                },
                input.headline
              ),
          el('div', {
            display: 'flex',
            width: 110,
            height: 6,
            borderRadius: 999,
            backgroundImage: `linear-gradient(90deg, ${palette.propulsionBlue}, ${palette.orbitCyan})`,
          }),
          ...(input.subheadline
            ? [
                el(
                  'div',
                  {
                    display: 'flex',
                    color: palette.darkSlate,
                    fontFamily: 'Inter',
                    fontSize: 33,
                    fontWeight: 400,
                    lineHeight: 1.45,
                    maxWidth: 840,
                  },
                  input.subheadline
                ),
              ]
            : []),
        ]
      ),

      // Bottom footer: Blue logo left, @fabsoft.tech right
      el(
        'div',
        {
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          paddingTop: 32,
          borderTop: '2px solid #E2E8F0',
        },
        [
          imgEl(logoAzulUri, 190, 48, { objectFit: 'contain' }),
          el(
            'div',
            {
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            },
            [
              el(
                'div',
                {
                  display: 'flex',
                  color: palette.deepSpaceBlue,
                  fontFamily: 'Inter',
                  fontSize: 24,
                  fontWeight: 600,
                },
                BRAND_KIT.handle
              ),
            ]
          ),
        ]
      ),
    ]
  );
}

function buildDevTipCardTree(
  input: ComposePostImageInput,
  logoNegroProfileUri: string,
  cardImageUri: string | null
): SatoriNode {
  const { palette } = BRAND_KIT;
  const label = (input.accentLabel ?? BRAND_KIT.pillars[input.pillar].label).toUpperCase();
  const headlineSize = input.headline.length > 48 ? 50 : 58;

  // Split headline into two tones: first 3 words or highlightPhrase in #0052FF, rest in #040B1A
  const { before, highlight, after } = splitByHighlight(
    input.headline,
    input.highlightPhrase
  );

  let twoToneChildren: SatoriNode[];
  if (highlight) {
    twoToneChildren = [
      ...(before.trim().length > 0
        ? [el('span', { display: 'flex', color: palette.deepSpaceBlue }, before)]
        : []),
      el('span', { display: 'flex', color: palette.propulsionBlue }, highlight),
      ...(after.trim().length > 0
        ? [el('span', { display: 'flex', color: palette.deepSpaceBlue }, after)]
        : []),
    ];
  } else {
    const words = input.headline.split(' ');
    const splitPoint = Math.max(1, Math.min(3, Math.floor(words.length / 2)));
    const firstPart = words.slice(0, splitPoint).join(' ');
    const secondPart = words.slice(splitPoint).join(' ');
    twoToneChildren = [
      el('span', { display: 'flex', color: palette.propulsionBlue }, firstPart),
      ...(secondPart.length > 0
        ? [el('span', { display: 'flex', color: palette.deepSpaceBlue }, secondPart)]
        : []),
    ];
  }

  const centralVisualCard = cardImageUri
    ? el(
        'div',
        {
          display: 'flex',
          width: 944,
          height: 540,
          borderRadius: 28,
          overflow: 'hidden',
          border: '2px solid #E2E8F0',
          backgroundColor: palette.deepSpaceBlue,
        },
        imgEl(cardImageUri, 944, 540, { objectFit: 'cover' })
      )
    : el(
        'div',
        {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: 944,
          height: 540,
          borderRadius: 28,
          padding: '38px 44px',
          backgroundColor: palette.deepSpaceBlue,
          backgroundImage:
            'radial-gradient(circle at 85% 20%, rgba(0,82,255,0.42) 0%, rgba(18,130,255,0.12) 40%, rgba(4,11,26,0) 72%)',
          border: '2px solid #1E293B',
        },
        [
          // Window controls bar
          el(
            'div',
            {
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
            },
            [
              el(
                'div',
                { display: 'flex', flexDirection: 'row', gap: 12 },
                [
                  el('div', {
                    display: 'flex',
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    backgroundColor: '#334155',
                  }),
                  el('div', {
                    display: 'flex',
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    backgroundColor: palette.propulsionBlue,
                  }),
                  el('div', {
                    display: 'flex',
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    backgroundColor: palette.orbitCyan,
                  }),
                ]
              ),
              el(
                'div',
                {
                  display: 'flex',
                  color: '#94A3B8',
                  fontFamily: 'Inter',
                  fontSize: 20,
                  fontWeight: 500,
                },
                'fabsoft-architecture.ts'
              ),
            ]
          ),
          // Clean abstract tech visual block
          el(
            'div',
            {
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
            },
            [
              el(
                'div',
                {
                  display: 'flex',
                  color: '#60A5FA',
                  fontFamily: 'Inter',
                  fontSize: 24,
                  fontWeight: 600,
                },
                '// Consola de Lanzamiento · FabSoft'
              ),
              el(
                'div',
                {
                  display: 'flex',
                  color: palette.stellarWhite,
                  fontFamily: 'Space Grotesk',
                  fontSize: 42,
                  fontWeight: 700,
                  lineHeight: 1.2,
                },
                'Código limpio, arquitectura escalable y entregas cada viernes.'
              ),
            ]
          ),
          // Status pill row
          el(
            'div',
            {
              display: 'flex',
              flexDirection: 'row',
              gap: 16,
            },
            [
              el(
                'div',
                {
                  display: 'flex',
                  padding: '10px 20px',
                  borderRadius: 12,
                  backgroundColor: 'rgba(0,82,255,0.24)',
                  border: '1px solid rgba(18,130,255,0.5)',
                  color: '#B8ECFF',
                  fontFamily: 'Inter',
                  fontSize: 20,
                  fontWeight: 600,
                },
                'TypeScript Strict'
              ),
              el(
                'div',
                {
                  display: 'flex',
                  padding: '10px 20px',
                  borderRadius: 12,
                  backgroundColor: 'rgba(245,247,250,0.08)',
                  border: '1px solid rgba(245,247,250,0.16)',
                  color: palette.stellarWhite,
                  fontFamily: 'Inter',
                  fontSize: 20,
                  fontWeight: 500,
                },
                'IA + Cloud'
              ),
            ]
          ),
        ]
      );

  return el(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: palette.pureWhite,
      padding: '68px 68px 64px 68px',
      fontFamily: 'Inter',
    },
    [
      // Profile header
      el(
        'div',
        {
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
        },
        [
          el(
            'div',
            {
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 20,
            },
            [
              el(
                'div',
                {
                  display: 'flex',
                  width: 78,
                  height: 78,
                  borderRadius: 999,
                  overflow: 'hidden',
                  border: '2px solid #E2E8F0',
                },
                imgEl(logoNegroProfileUri, 78, 78, { objectFit: 'cover' })
              ),
              el(
                'div',
                {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                },
                [
                  el(
                    'div',
                    {
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                    },
                    [
                      el(
                        'div',
                        {
                          display: 'flex',
                          color: palette.deepSpaceBlue,
                          fontFamily: 'Space Grotesk',
                          fontSize: 28,
                          fontWeight: 700,
                        },
                        BRAND_KIT.handle
                      ),
                      el('div', {
                        display: 'flex',
                        width: 14,
                        height: 14,
                        borderRadius: 999,
                        backgroundColor: palette.propulsionBlue,
                      }),
                    ]
                  ),
                  el(
                    'div',
                    {
                      display: 'flex',
                      color: palette.darkSlate,
                      fontFamily: 'Inter',
                      fontSize: 21,
                      fontWeight: 500,
                    },
                    BRAND_KIT.tagline
                  ),
                ]
              ),
            ]
          ),
          el(
            'div',
            {
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            },
            [
              el('div', {
                display: 'flex',
                width: 8,
                height: 8,
                borderRadius: 999,
                backgroundColor: palette.propulsionBlue,
              }),
              el(
                'div',
                {
                  display: 'flex',
                  color: palette.darkSlate,
                  fontFamily: 'Inter',
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: '0.14em',
                },
                `${BRAND_KIT.pillars[input.pillar].code} / ${label}`
              ),
            ]
          ),
        ]
      ),

      // Two-tone headline + subheadline
      el(
        'div',
        {
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        },
        [
          el(
            'div',
            {
              display: 'flex',
              flexWrap: 'wrap',
              columnGap: 12,
              rowGap: 6,
              fontFamily: 'Space Grotesk',
              fontSize: headlineSize,
              fontWeight: 700,
              lineHeight: 1.12,
              letterSpacing: '-0.025em',
            },
            twoToneChildren
          ),
          ...(input.subheadline
            ? [
                el(
                  'div',
                  {
                    display: 'flex',
                    color: palette.darkSlate,
                    fontFamily: 'Inter',
                    fontSize: 28,
                    fontWeight: 400,
                    lineHeight: 1.4,
                  },
                  input.subheadline
                ),
              ]
            : []),
        ]
      ),

      // Central visual card
      centralVisualCard,

      // Footer
      el(
        'div',
        {
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          paddingTop: 24,
          borderTop: '2px solid #F1F5F9',
        },
        [
          el(
            'div',
            {
              display: 'flex',
              color: palette.propulsionBlue,
              fontFamily: 'Space Grotesk',
              fontSize: 24,
              fontWeight: 700,
            },
            BRAND_KIT.website
          ),
          el(
            'div',
            {
              display: 'flex',
              color: '#64748B',
              fontFamily: 'Inter',
              fontSize: 19,
              fontWeight: 600,
              letterSpacing: '0.12em',
            },
            'SOFTWARE · IA · CLOUD · FUTURO'
          ),
        ]
      ),
    ]
  );
}

async function renderSatoriToPng(tree: SatoriNode, fonts: Font[]): Promise<Buffer> {
  // Cast required because Satori's ReactNode type expects ReactElement
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    fonts,
  });

  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: CANVAS_WIDTH,
    },
  });

  return Buffer.from(resvg.render().asPng());
}

/**
 * 2-Layer Compositor -> Strict Instagram-ready JPEG sRGB 1080x1350 (4:5), quality 90, < 8 MB.
 */
export async function composePostImage(
  input: ComposePostImageInput
): Promise<Buffer> {
  const [fonts, logos] = await Promise.all([loadFonts(), loadLogos()]);

  let compositeBuffer: Buffer;

  if (input.template === 'dark_tech_hero') {
    const hasBg = Boolean(input.aiBackgroundBuffer);
    const tree = buildDarkTechHeroTree(input, logos.color, hasBg);
    const overlayPng = await renderSatoriToPng(tree, fonts);

    if (input.aiBackgroundBuffer) {
      const normalizedBg = await sharp(input.aiBackgroundBuffer)
        .resize(CANVAS_WIDTH, CANVAS_HEIGHT, { fit: 'cover', position: 'center' })
        .toColorspace('srgb')
        .png()
        .toBuffer();

      compositeBuffer = await sharp(normalizedBg)
        .composite([{ input: overlayPng, top: 0, left: 0 }])
        .png()
        .toBuffer();
    } else {
      compositeBuffer = overlayPng;
    }
  } else if (input.template === 'editorial_light') {
    const tree = buildEditorialLightTree(input, logos.azul);
    compositeBuffer = await renderSatoriToPng(tree, fonts);
  } else {
    // dev_tip_card
    let cardImageUri: string | null = null;
    if (input.aiBackgroundBuffer) {
      const resizedCard = await sharp(input.aiBackgroundBuffer)
        .resize(944, 540, { fit: 'cover', position: 'center' })
        .toColorspace('srgb')
        .jpeg({ quality: 90 })
        .toBuffer();
      cardImageUri = `data:image/jpeg;base64,${resizedCard.toString('base64')}`;
    }

    const tree = buildDevTipCardTree(input, logos.negroProfile, cardImageUri);
    compositeBuffer = await renderSatoriToPng(tree, fonts);
  }

  // Final strict Instagram export: 1080x1350 sRGB JPEG quality 90 (< 8 MB)
  let jpegBuffer = await sharp(compositeBuffer)
    .resize(CANVAS_WIDTH, CANVAS_HEIGHT, { fit: 'cover' })
    .flatten({ background: '#040B1A' })
    .toColorspace('srgb')
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  if (jpegBuffer.byteLength >= MAX_INSTAGRAM_BYTES) {
    jpegBuffer = await sharp(compositeBuffer)
      .resize(CANVAS_WIDTH, CANVAS_HEIGHT, { fit: 'cover' })
      .flatten({ background: '#040B1A' })
      .toColorspace('srgb')
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
  }

  return jpegBuffer;
}
