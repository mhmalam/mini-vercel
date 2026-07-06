import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Wordmark } from "./Logo";

const BG = "#0a0a0a";
const PANEL = "#111113";
const BORDER = "#26262a";
const TEXT = "#f2f2f2";
const DIM = "#a1a1aa";
const AMBER = "#ffb224";
const GREEN = "#4ade80";
const SANS = "system-ui, 'Segoe UI', sans-serif";
const MONO = "Consolas, 'Cascadia Mono', monospace";

// ---------- shared bits ----------

const Center: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      background: BG,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
    }}
  >
    {children}
  </AbsoluteFill>
);

const FadeOut: React.FC<{ from: number; children: React.ReactNode }> = ({
  from,
  children,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [from, from + 20], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

// ---------- scene 1: logo intro ----------

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 13 } });
  const wordAt = interpolate(frame, [40, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const tagAt = interpolate(frame, [65, 85], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <FadeOut from={108}>
      <Center>
        <Img
          src={staticFile("minivercel.svg")}
          style={{
            width: 260,
            height: 260,
            transform: `scale(${pop})`,
            opacity: pop,
          }}
        />
        <div style={{ height: 40 }} />
        <Wordmark size={84} opacity={wordAt} />
        <div
          style={{
            marginTop: 18,
            fontFamily: SANS,
            fontSize: 34,
            color: DIM,
            opacity: tagAt,
          }}
        >
          a deployment platform I built to host my own apps
        </div>
      </Center>
    </FadeOut>
  );
};

// ---------- scene 2: git push ----------

const Terminal: React.FC = () => {
  const frame = useCurrentFrame();
  const cmd = "git push";
  const typed = cmd.slice(
    0,
    Math.floor(
      interpolate(frame, [15, 55], [0, cmd.length], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }),
    ),
  );
  // output lines land on beats (15-frame grid)
  const lines: Array<[number, string, string]> = [
    [75, "→ GitHub: push received on main", DIM],
    [105, "→ webhook fired at api.deploy.malam.me", DIM],
    [135, "✓ HMAC signature verified — deployment queued", GREEN],
  ];
  return (
    <FadeOut from={168}>
      <Center>
        <div
          style={{
            width: 1150,
            background: PANEL,
            border: `1px solid ${BORDER}`,
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 30px 80px rgba(0,0,0,.5)",
          }}
        >
          <div
            style={{
              padding: "16px 24px",
              borderBottom: `1px solid ${BORDER}`,
              display: "flex",
              gap: 10,
              alignItems: "center",
            }}
          >
            {[AMBER, BORDER, BORDER].map((c, i) => (
              <div
                key={i}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  background: c,
                }}
              />
            ))}
            <span
              style={{
                marginLeft: 12,
                fontFamily: MONO,
                fontSize: 22,
                color: DIM,
              }}
            >
              ~/my-app
            </span>
          </div>
          <div
            style={{
              padding: "34px 40px 44px",
              fontFamily: MONO,
              fontSize: 32,
              lineHeight: 1.8,
            }}
          >
            <div style={{ color: TEXT }}>
              <span style={{ color: GREEN }}>$ </span>
              {typed}
              {frame < 70 && frame % 20 < 10 ? (
                <span style={{ color: AMBER }}>▌</span>
              ) : null}
            </div>
            {lines.map(
              ([at, text, color], i) =>
                frame >= at && (
                  <div key={i} style={{ color }}>
                    {text}
                  </div>
                ),
            )}
          </div>
        </div>
      </Center>
    </FadeOut>
  );
};

// ---------- scene 3: pipeline ----------

const STAGES = [
  "clone repo",
  "docker build",
  "run container",
  "health check",
  "route swap",
];

const Pipeline: React.FC = () => {
  const frame = useCurrentFrame();
  const per = 60; // one stage per bar — flips land on the downbeat stabs
  return (
    <FadeOut from={288}>
      <Center>
        <div
          style={{
            fontFamily: SANS,
            fontSize: 30,
            color: DIM,
            marginBottom: 60,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          the worker takes it from here
        </div>
        <div style={{ display: "flex", gap: 34, alignItems: "center" }}>
          {STAGES.map((label, i) => {
            const start = i * per;
            const active = frame >= start && frame < start + per;
            const done = frame >= start + per;
            const pulse = active ? 0.75 + 0.25 * Math.sin(frame / 3) : 1;
            return (
              <React.Fragment key={label}>
                {i > 0 && (
                  <div
                    style={{
                      width: 46,
                      height: 3,
                      background: done || active ? AMBER : BORDER,
                      opacity: done || active ? 1 : 0.6,
                    }}
                  />
                )}
                <div
                  style={{
                    padding: "26px 34px",
                    borderRadius: 14,
                    fontFamily: MONO,
                    fontSize: 28,
                    background: PANEL,
                    border: `2px solid ${
                      done ? GREEN : active ? AMBER : BORDER
                    }`,
                    color: done ? GREEN : active ? AMBER : DIM,
                    opacity: pulse,
                    display: "flex",
                    gap: 14,
                    alignItems: "center",
                  }}
                >
                  <span>{done ? "✓" : active ? "●" : "○"}</span>
                  {label}
                </div>
              </React.Fragment>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 66,
            fontFamily: SANS,
            fontSize: 28,
            color: DIM,
            opacity: interpolate(frame, [195, 220], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          the old container stops only after the new one answers — zero
          downtime
        </div>
      </Center>
    </FadeOut>
  );
};

// ---------- real-UI scenes: live screenshots of the actual platform ----------

const Browser: React.FC<{
  shot?: string;
  media?: React.ReactNode;
  url: string;
  caption: string;
  captionAt?: number;
  zoomFrom?: number;
  zoomTo?: number;
}> = ({
  shot,
  media,
  url,
  caption,
  captionAt = 30,
  zoomFrom = 1,
  zoomTo = 1.05,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const zoom = interpolate(frame, [0, durationInFrames], [zoomFrom, zoomTo]);
  const capAt = interpolate(frame, [captionAt, captionAt + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <Center>
      <div
        style={{
          width: 1560,
          background: PANEL,
          border: `1px solid ${BORDER}`,
          borderRadius: 18,
          overflow: "hidden",
          boxShadow: "0 40px 100px rgba(0,0,0,.55)",
        }}
      >
        <div
          style={{
            padding: "14px 22px",
            borderBottom: `1px solid ${BORDER}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          {[AMBER, BORDER, BORDER].map((c, i) => (
            <div
              key={i}
              style={{ width: 13, height: 13, borderRadius: 7, background: c }}
            />
          ))}
          <div
            style={{
              marginLeft: 16,
              fontFamily: MONO,
              fontSize: 21,
              color: DIM,
              background: BG,
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              padding: "5px 18px",
            }}
          >
            🔒 {url}
          </div>
        </div>
        <div style={{ height: 730, overflow: "hidden" }}>
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top center",
            }}
          >
            {media ??
              (shot ? (
                <Img src={staticFile(shot)} style={{ width: "100%" }} />
              ) : null)}
          </div>
        </div>
      </div>
      <div
        style={{
          marginTop: 34,
          fontFamily: SANS,
          fontSize: 30,
          color: DIM,
          opacity: capAt,
        }}
      >
        {caption}
      </div>
    </Center>
  );
};

// ---------- scene 4 (legacy, unused): dashboard card goes live ----------

const Card: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const live = frame >= 110;
  const pop = spring({ frame: frame - 110, fps, config: { damping: 11 } });
  const url = "https://my-app.malam.me";
  const typedUrl = live
    ? url.slice(
        0,
        Math.floor(
          interpolate(frame, [118, 155], [0, url.length], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        ),
      )
    : "";
  const badgeColor = live ? GREEN : AMBER;
  const pulse = live ? 1 : 0.6 + 0.4 * Math.abs(Math.sin(frame / 9));
  return (
    <FadeOut from={215}>
      <Center>
        <div
          style={{
            width: 860,
            background: PANEL,
            border: `1px solid ${BORDER}`,
            borderRadius: 20,
            padding: "44px 52px",
            boxShadow: "0 30px 80px rgba(0,0,0,.5)",
            transform: live ? `scale(${1 + 0.03 * pop})` : undefined,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 650,
                fontSize: 44,
                color: TEXT,
              }}
            >
              my-app
            </div>
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                fontFamily: MONO,
                fontSize: 28,
                color: badgeColor,
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  background: badgeColor,
                  boxShadow: `0 0 18px ${badgeColor}`,
                  opacity: pulse,
                }}
              />
              {live ? "live" : "building"}
            </div>
          </div>
          <div
            style={{
              marginTop: 20,
              fontFamily: MONO,
              fontSize: 26,
              color: DIM,
            }}
          >
            mhmalam/my-app · main
          </div>
          <div
            style={{
              marginTop: 26,
              fontFamily: MONO,
              fontSize: 32,
              color: AMBER,
              minHeight: 44,
            }}
          >
            {typedUrl}
            {live && typedUrl.length < url.length ? "▌" : ""}
          </div>
        </div>
        <div
          style={{
            marginTop: 44,
            fontFamily: SANS,
            fontSize: 28,
            color: DIM,
            opacity: interpolate(frame, [160, 185], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          push to live URL, hands-free — rollback, custom domains, and logs
          included
        </div>
      </Center>
    </FadeOut>
  );
};

// ---------- scene 5: outro ----------

const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const at = (f: number) =>
    interpolate(frame, [f, f + 20], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  return (
    <Center>
      <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
        <Img
          src={staticFile("minivercel.svg")}
          style={{ width: 150, height: 150 }}
        />
        <Wordmark size={72} opacity={at(0)} />
      </div>
      <div
        style={{
          marginTop: 40,
          fontFamily: SANS,
          fontSize: 40,
          color: TEXT,
          opacity: at(25),
        }}
      >
        malam.me runs on it.
      </div>
      <div
        style={{
          marginTop: 30,
          fontFamily: MONO,
          fontSize: 26,
          color: DIM,
          opacity: at(45),
        }}
      >
        TypeScript · Go · Docker · PostgreSQL · Redis · nginx · AWS
      </div>
      <div
        style={{
          marginTop: 18,
          fontFamily: MONO,
          fontSize: 26,
          color: AMBER,
          opacity: at(60),
        }}
      >
        github.com/mhmalam/mini-vercel
      </div>
    </Center>
  );
};

// ---------- composition ----------

// 120 BPM at 30fps: 1 beat = 15 frames, 1 bar = 60. Every cut sits on a bar
// line and the score puts an impact there: 120 register, 360 deploy,
// 600 domain, 780 the app answering, 900 malam.me, 1080 outro. The clips are
// real screen recordings of the live dashboard; playbackRate fits each take
// to its bar-aligned slot (register 9.63s -> 8s, deploy 10.6s -> 8s,
// domain 7.63s -> 6s).
export const Demo: React.FC = () => (
  <AbsoluteFill style={{ background: BG }}>
    <Audio src={staticFile("music.wav")} volume={0.8} />
    <Sequence durationInFrames={120}>
      <Intro />
    </Sequence>
    <Sequence from={120} durationInFrames={120}>
      <FadeOut from={112}>
        <Browser
          shot="shot-empty.png"
          url="folio-demo.malam.me"
          caption="this URL doesn't exist yet"
          captionAt={12}
          zoomFrom={1}
          zoomTo={1.04}
        />
      </FadeOut>
    </Sequence>
    <Sequence from={240} durationInFrames={240}>
      <FadeOut from={232}>
        <Browser
          url="deploy.malam.me"
          caption="register it — my real portfolio repo, straight from GitHub"
          captionAt={20}
          media={
            <OffthreadVideo
              muted
              src={staticFile("clip-register.webm")}
              playbackRate={1.19}
              style={{ width: "100%" }}
            />
          }
        />
      </FadeOut>
    </Sequence>
    <Sequence from={480} durationInFrames={240}>
      <FadeOut from={232}>
        <Browser
          url="deploy.malam.me"
          caption="one click: clone, docker build, health check — logs streaming live"
          captionAt={20}
          media={
            <OffthreadVideo
              muted
              src={staticFile("clip-build.webm")}
              playbackRate={1.35}
              style={{ width: "100%" }}
            />
          }
        />
      </FadeOut>
    </Sequence>
    <Sequence from={720} durationInFrames={120}>
      <FadeOut from={112}>
        <Browser
          url="deploy.malam.me"
          caption="live."
          captionAt={12}
          media={
            <OffthreadVideo
              muted
              src={staticFile("clip-live.webm")}
              playbackRate={1.25}
              style={{ width: "100%" }}
            />
          }
        />
      </FadeOut>
    </Sequence>
    <Sequence from={840} durationInFrames={180}>
      <FadeOut from={172}>
        <Browser
          shot="shot-deployed.png"
          url="folio-demo.malam.me"
          caption="the same URL, three minutes later"
          captionAt={18}
          zoomFrom={1}
          zoomTo={1.07}
        />
      </FadeOut>
    </Sequence>
    <Sequence from={1020} durationInFrames={300}>
      <FadeOut from={292}>
        <Browser
          url="deploy.malam.me"
          caption="$ git push — no clicks: the platform notices and rebuilds on its own"
          captionAt={20}
          media={
            <OffthreadVideo
              muted
              src={staticFile("clip-banner.webm")}
              playbackRate={1.68}
              style={{ width: "100%" }}
            />
          }
        />
      </FadeOut>
    </Sequence>
    <Sequence from={1320} durationInFrames={180}>
      <Outro />
    </Sequence>
  </AbsoluteFill>
);
