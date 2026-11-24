/**
 * Leitsatz: Tunnel aus App-Seiten dreht sich langsam um die Mitte, die Kamera fährt ruhig hinein; in der dunklen
 * Mündung „Vereinsarbeit ist Ehrenamt.“ → „Die Verwaltung sollte es nicht schwerer machen.“ Danach dreht die Wand
 * schneller und zieht sich in die Tiefe zusammen (Sog) – dort zündet der Punkt (LogoBild).
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { S } from "../../film";
import { GlowText, NEON, easeOut, invLerp, lerp, rgba, smooth } from "../../neon";
import { easeIn } from "../../neon/util";
import { L, T } from "./zeit";
import { Tunnel, tunnelMouth } from "./Tunnel";

const SATZ1 = "Vereinsarbeit ist Ehrenamt.";
const SATZ2 = "Die Verwaltung sollte es nicht schwerer machen.";

/** Kamera und Wand zum Frame (auch für Bewegungsunschärfe am Vorframe) */
export const wandAt = (f: number) => {
  const from = S.leitsatz.from;
  // Fahrt: kommt mit Schwung aus dem Zoom-Übergang, wird dann ganz ruhig
  const fahrt = easeOut(invLerp(from - 10, T.sog + 6, f), 2.4);
  const sog = invLerp(T.sog, T.sog + T.sogDauer, f);
  const dolly = lerp(-120, 290, fahrt) - 9000 * Math.pow(sog, 2.7);
  const rotation = 4 + (f - from) * 0.17 + 170 * Math.pow(sog, 2.2);
  // leichtes Schwenken für Parallaxe, beim Sog zurück auf die Achse
  const ruhe = 1 - smooth(sog * 2);
  const orbitY = lerp(3.2, -2.2, smooth(invLerp(from - 10, T.sog, f))) * ruhe;
  const orbitX = lerp(-2.4, 1.6, smooth(invLerp(from - 10, T.sog, f))) * ruhe;
  return { dolly, rotation, orbitX, orbitY, sog };
};

export const LeitsatzBild: React.FC<{ f: number }> = ({ f }) => {
  const w = wandAt(f);
  const prev = wandAt(f - 1);
  const speed = Math.abs(w.rotation - prev.rotation);
  // Wand wird beim Sog zum Lichtring: Kanten glühen auf, Mündung wird hell, zum Schluss weg
  const sog = w.sog;
  const edgeGlow = lerp(0.42, 1.5, smooth(sog * 1.6));
  const mouthDark = 0.9 * (1 - smooth(invLerp(0.1, 0.55, sog)));
  // Ring ist bei sog ≈ 0,85 weg – dann tragen Punkt und Lichtbänder das Bild
  const opacity = 1 - smooth(invLerp(0.62, 0.85, sog));
  const s1Exit = easeIn(invLerp(T.satz1Weg, T.satz1Weg + 6, f), 2);
  // Satz 2 steht in der Mündung und fährt beim Sog mit ihr in die Tiefe (gleicher Maßstab), wird weich und geht
  const m = tunnelMouth(w.dolly, w.orbitX, w.orbitY);
  const w0 = wandAt(T.sog);
  const m0 = tunnelMouth(w0.dolly, w0.orbitX, w0.orbitY);
  const tief = f < T.sog ? 1 : Math.min(1, m.scale / m0.scale);
  const sug = invLerp(T.satz2Weg, T.satz2Weg + 7, f);
  const sugE = easeIn(sug, 2);
  // Licht in der Mitte saugt sich zusammen, kurz bevor der Punkt zündet
  const kern = Math.sin(Math.PI * invLerp(T.sog + 4, T.zuend + 6, f));
  return (
    <AbsoluteFill>
      <Tunnel
        f={f}
        rotation={w.rotation}
        dolly={w.dolly}
        orbitX={w.orbitX}
        orbitY={w.orbitY}
        opacity={opacity}
        edgeGlow={edgeGlow}
        blurSpan={sog > 0.05 ? Math.min(26, speed * 2.4) : 0}
        mouthDark={mouthDark}
        mouthRim={0.9 * (1 - smooth(invLerp(0.3, 0.8, sog)))}
        nearBlur={9 * (1 - smooth(invLerp(0.05, 0.25, sog)))}
      />
      {kern > 0.01 ? (
        <div
          style={{
            position: "absolute",
            left: L.mitte.x - 420,
            top: L.mitte.y - 420,
            width: 840,
            height: 840,
            borderRadius: "50%",
            mixBlendMode: "screen",
            background: `radial-gradient(circle, ${rgba(NEON.sky, 0.32 * kern)} 0%, ${rgba(NEON.blue, 0.16 * kern)} 30%, ${rgba(NEON.blue, 0)} 68%)`,
          }}
        />
      ) : null}
      {/* Schrift in der Mündung */}
      {s1Exit < 0.999 ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingLeft: 100, paddingRight: 100 }}>
          <div style={{ transform: "translateY(-14px)" }}>
            <GlowText text={SATZ1} frame={f} wordStarts={T.satz1} reveal={11} fontSize={84} weight={800} maxWidth={600} lineHeight={1.1} mode="rise" echo={2} glow={0.95} flare={1.1} exit={s1Exit} />
          </div>
        </AbsoluteFill>
      ) : null}
      {f >= T.satz2[0] - 2 && sug < 0.999 ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingLeft: 100, paddingRight: 100 }}>
          <div
            style={{
              transform: `translate(${(m.x - L.mitte.x) * (1 - tief)}px, ${(-10 * tief + (m.y - L.mitte.y) * (1 - tief)).toFixed(2)}px) scale(${tief.toFixed(4)})`,
              opacity: 1 - easeIn(sug, 1.4),
              filter: sug > 0.01 ? `blur(${(6 * sugE).toFixed(2)}px) brightness(${(1 + 0.5 * sug).toFixed(3)})` : undefined,
            }}
          >
            <GlowText
              text={SATZ2}
              frame={f}
              wordStarts={T.satz2}
              reveal={11}
              fontSize={70}
              weight={800}
              maxWidth={660}
              lineHeight={1.12}
              mode="rise"
              echo={2}
              glow={0.9}
              flare={1}
              wordColors={[undefined, undefined, undefined, undefined, NEON.sky, NEON.sky, undefined]}
            />
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
