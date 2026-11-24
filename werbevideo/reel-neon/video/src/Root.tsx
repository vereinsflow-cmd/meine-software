import { Composition, Folder, Still } from "remotion";
import { Cover } from "./Cover";
import { Pruefbogen, pruefbogenMetadata } from "./dev/Pruefbogen";
import { LEAD, S, TAIL } from "./film";
import { DURATION_IN_FRAMES, FPS, SCENE_IDS } from "./lib/timeline";
import { NeonCompositions } from "./neon/register";
import { UiCompositions } from "./ui/register";
import { SceneClip, VereinsFlowReel60Neon } from "./Video";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="VereinsFlowReel60Neon" component={VereinsFlowReel60Neon} durationInFrames={DURATION_IN_FRAMES} fps={FPS} width={1080} height={1920} />
    <Still id="Cover" component={Cover} width={1080} height={1920} />
    {/* Einzelszenen: gleiche Bilder wie im Film, mit Vorlauf LEAD und Nachlauf TAIL */}
    <Folder name="Szenen">
      {SCENE_IDS.map((id) => (
        <Composition
          key={id}
          id={`S-${id}`}
          component={SceneClip}
          defaultProps={{ id, pre: LEAD }}
          durationInFrames={S[id].to - S[id].from + LEAD + TAIL}
          fps={FPS}
          width={1080}
          height={1920}
        />
      ))}
    </Folder>
    {/* nur zur Kontrolle: mehrere Frames als Raster (absolute Frames) */}
    <Folder name="Pruefung">
      <Still
        id="Pruefbogen"
        component={Pruefbogen}
        width={1080}
        height={1920}
        calculateMetadata={pruefbogenMetadata}
        defaultProps={{ frames: [10, 150, 270, 420, 660, 870, 1060, 1270, 1400, 1490, 1600, 1740], cols: 6, scale: 0.25 }}
      />
    </Folder>
    <UiCompositions />
    <NeonCompositions />
  </>
);
