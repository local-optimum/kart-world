import { Networked3dWebExperienceClient } from "@mml-io/3d-web-experience-client";

import hdrJpgUrl from "../../../assets/hdr/rooftop_night_2k.jpg";
import loadingBackground from "../../../assets/images/loading-bg.jpg";
import airAnimationFileUrl from "../../../assets/models/anim_air.glb";
import doubleJumpAnimationFileUrl from "../../../assets/models/anim_double_jump.glb";
import idleAnimationFileUrl from "../../../assets/models/anim_idle.glb";
import jogAnimationFileUrl from "../../../assets/models/anim_jog.glb";
import sprintAnimationFileUrl from "../../../assets/models/anim_run.glb";

const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const host = window.location.host;
const userNetworkAddress = `${protocol}//${host}/network`;
const chatNetworkAddress = `${protocol}//${host}/chat-network`;

const holder = Networked3dWebExperienceClient.createFullscreenHolder();
const app = new Networked3dWebExperienceClient(holder, {
  sessionToken: (window as any).SESSION_TOKEN,
  userNetworkAddress,
  chatNetworkAddress,
  animationConfig: {
    airAnimationFileUrl,
    idleAnimationFileUrl,
    jogAnimationFileUrl,
    sprintAnimationFileUrl,
    doubleJumpAnimationFileUrl,
  },
  mmlDocuments: { example: { url: `${protocol}//${host}/mml-documents/example-mml.html` } },
  environmentConfiguration: {
    skybox: {
      hdrJpgUrl: hdrJpgUrl,
    },
    groundPlane: false,
    sun: {
      azimuthalAngle: 270, // West direction for evening sun
      polarAngle: -15, // Lower angle for evening/sunset
      intensity: 2.5, // Softer evening light
    },
    ambientLight: {
      intensity: 0.4, // Slightly brighter ambient for evening visibility
    },
    fog: {
      fogNear: 80,
      fogFar: 300,
      fogColor: { r: 0.6, g: 0.5, b: 0.7 }, // Lighter purple-ish evening fog
    },
  },
  avatarConfiguration: {
    availableAvatars: [
      {
        name: "bot",
        meshFileUrl: "/assets/models/bot.glb",
      },
    ],
  },
  allowOrbitalCamera: false,
  loadingScreen: {
    background: "#424242",
    color: "#ffffff",
    backgroundImageUrl: loadingBackground,
    backgroundBlurAmount: 12,
    title: "3D Web Experience",
    subtitle: "Powered by Metaverse Markup Language",
  },
  spawnConfiguration: {
    enableRespawnButton: true,
    spawnPosition: {
      x: 0,
      y: 200,
      z: 0,
    },
    spawnPositionVariance: {
      x: 10,
      y: 5,
      z: 10,
    },
  },
});

app.update();
