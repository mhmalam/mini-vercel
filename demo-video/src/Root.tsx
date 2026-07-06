import React from "react";
import { Composition } from "remotion";
import { Demo } from "./Demo";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="demo"
    component={Demo}
    durationInFrames={1740}
    fps={30}
    width={1920}
    height={1080}
  />
);
