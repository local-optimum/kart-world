import { Color, Group, Vector3, Quaternion } from "three";

import { CameraManager } from "../camera/CameraManager";
import { Composer } from "../rendering/composer";

import { CharacterModel } from "./CharacterModel";
import { CharacterModelLoader } from "./CharacterModelLoader";
import { CharacterSpeakingIndicator } from "./CharacterSpeakingIndicator";
import { AnimationState } from "./CharacterState";
import { CharacterTooltip } from "./CharacterTooltip";
import { KartMesh, KartMeshConfig } from "./KartMesh";
import { PathTrail } from "./PathTrail";

export type AnimationConfig = {
  idleAnimationFileUrl: string;
  jogAnimationFileUrl: string;
  sprintAnimationFileUrl: string;
  airAnimationFileUrl: string;
  doubleJumpAnimationFileUrl: string;
};

export type CharacterDescription =
  | {
      meshFileUrl: string;
      mmlCharacterString?: null;
      mmlCharacterUrl?: null;
    }
  | {
      meshFileUrl?: null;
      mmlCharacterString: string;
      mmlCharacterUrl?: null;
    }
  | {
      meshFileUrl?: null;
      mmlCharacterString?: null;
      mmlCharacterUrl: string;
    };

export type CharacterConfig = {
  username: string;
  characterDescription: CharacterDescription;
  animationConfig: AnimationConfig;
  characterModelLoader: CharacterModelLoader;
  characterId: number;
  modelLoadedCallback: () => void;
  cameraManager: CameraManager;
  composer: Composer;
  isLocal: boolean;
  kartMode?: boolean;
  kartConfig?: KartMeshConfig;
};

function characterHeightToTooltipHeightOffset(characterHeight: number): number {
  return characterHeight - 0.4 + 0.1;
}

function characterDescriptionMatches(a: CharacterDescription, b: CharacterDescription): boolean {
  return (
    a.meshFileUrl === b.meshFileUrl &&
    a.mmlCharacterString === b.mmlCharacterString &&
    a.mmlCharacterUrl === b.mmlCharacterUrl
  );
}

export class Character extends Group {
  private model: CharacterModel | null = null;
  private kartMesh: KartMesh | null = null;
  private lastSpeed: number = 0;
  private lastSteeringAngle: number = 0;
  private skidParticleSystems: PathTrail[] = []; // Path trails for each wheel
  private wasSkidding: boolean = false;

  public color: Color = new Color();
  public tooltip: CharacterTooltip;
  public speakingIndicator: CharacterSpeakingIndicator | null = null;

  public chatTooltips: CharacterTooltip[] = [];

  constructor(private config: CharacterConfig) {
    super();
    this.tooltip = new CharacterTooltip(
      this.config.isLocal
        ? {
            secondsToFadeOut: 10,
          }
        : {},
    );
    this.tooltip.setText(this.config.username);
    this.add(this.tooltip);
    this.load().then(() => {
      this.config.modelLoadedCallback();
      this.setTooltipHeights();
    });
  }

  updateCharacter(username: string, characterDescription: CharacterDescription) {
    if (!characterDescriptionMatches(this.config.characterDescription, characterDescription)) {
      this.config.characterDescription = characterDescription;
      this.load().then(() => {
        this.setTooltipHeights();
      });
    }
    if (this.config.username !== username) {
      this.config.username = username;
      this.tooltip.setText(username);
      // Force the tooltip to show if the character's name changes
      this.tooltip.show();
    }
  }

  private setTooltipHeights() {
    let height: number;

    if (this.config.kartMode) {
      // For karts, set tooltip height above the kart body
      height = 1.5; // Fixed height above kar
    } else if (this.model && this.model.characterHeight) {
      height = characterHeightToTooltipHeightOffset(this.model.characterHeight);
    } else {
      height = 1.5; // Default heigh
    }

    this.tooltip.setHeightOffset(height);
    height += this.tooltip.scale.y;

    for (const chatTooltip of this.chatTooltips) {
      chatTooltip.setHeightOffset(height);
      height += chatTooltip.scale.y;
    }
  }

  private async load(): Promise<void> {
    if (this.config.kartMode) {
      // Load kart mesh instead of character model
      await this.loadKart();
    } else {
      // Load traditional character model
      await this.loadCharacterModel();
    }
  }

  private async loadKart(): Promise<void> {
    // Remove previous kart if it exists
    if (this.kartMesh) {
      this.remove(this.kartMesh);
      this.kartMesh.dispose();
    }

    // Create new kart mesh - using GLB asset
    const kartConfig: KartMeshConfig = {
      kartColor: this.generateKartColor(),
      wheelColor: 0x333333,
      showWheels: false, // Don't create programmatic wheels since we're using GLB
      modelUrl:
        "https://mmlstorage.com/e8e6cfb13c2ac73aa221f1b4d2983bbe801b51ac05ae16f60eceb496eacceaf1",
      characterModelLoader: this.config.characterModelLoader,
      ...this.config.kartConfig,
    };

    this.kartMesh = new KartMesh(kartConfig);
    this.add(this.kartMesh);

    // Initialize speaking indicator
    if (this.speakingIndicator === null) {
      this.speakingIndicator = new CharacterSpeakingIndicator(this.config.composer.postPostScene);
    }
  }

  private async loadCharacterModel(): Promise<void> {
    const previousModel = this.model;
    if (previousModel && previousModel.mesh) {
      this.remove(previousModel.mesh);
    }
    this.model = new CharacterModel({
      characterDescription: this.config.characterDescription,
      animationConfig: this.config.animationConfig,
      characterModelLoader: this.config.characterModelLoader,
      cameraManager: this.config.cameraManager,
      characterId: this.config.characterId,
      isLocal: this.config.isLocal,
    });
    await this.model.init();
    if (this.model.mesh) {
      this.add(this.model.mesh);
    }
    if (this.speakingIndicator === null) {
      this.speakingIndicator = new CharacterSpeakingIndicator(this.config.composer.postPostScene);
    }
  }

  private generateKartColor(): number {
    // Generate a color based on character ID for uniqueness
    const colors = [
      0x4287f5, // Blue
      0xff6b6b, // Red
      0x4ecdc4, // Teal
      0x45b7d1, // Light blue
      0xf9ca24, // Yellow
      0xf0932b, // Orange
      0xeb4d4b, // Red
      0x6c5ce7, // Purple
      0x00b894, // Green
      0xe17055, // Pink
    ];
    return colors[this.config.characterId % colors.length];
  }

  public updateAnimation(targetAnimation: AnimationState) {
    if (this.config.kartMode) {
      // Karts don't have traditional animations, but we can use states for other things
      // For now, we'll ignore animation updates in kart mode
      return;
    }
    this.model?.updateAnimation(targetAnimation);
  }

  public updateKartMovement(speed: number, steeringAngle: number, deltaTime: number) {
    if (this.kartMesh && this.config.kartMode) {
      this.kartMesh.updateWheelRotation(speed, steeringAngle, deltaTime);
      this.lastSpeed = speed;
      this.lastSteeringAngle = steeringAngle;
    }
  }

  public updateSkidMarks(isSkidding: boolean, wheelPositions: Vector3[], velocity?: Vector3) {
    if (!this.config.kartMode) return;

    // Update existing trails
    this.updatePathTrails();

    if (isSkidding) {
      if (!this.wasSkidding) {
        // Start new trails when we begin skidding
        this.initializePathTrails(wheelPositions, velocity);
      }

      // Add points to existing trails
      this.addTrailPoints(wheelPositions, velocity);
    } else if (!isSkidding && this.wasSkidding) {
      // Stop trail creation when skidding ends
      this.stopTrails();
    }

    this.wasSkidding = isSkidding;
  }

  private addTrailPoints(wheelPositions: Vector3[], velocity?: Vector3) {
    // Use velocity vector magnitude for more accurate speed (includes slides)
    const currentSpeed = velocity ? velocity.length() : Math.abs(this.lastSpeed);
    wheelPositions.forEach((position, index) => {
      if (index < this.skidParticleSystems.length) {
        this.skidParticleSystems[index].addPoint(position, currentSpeed);
      }
    });
  }

  private initializePathTrails(wheelPositions: Vector3[], velocity?: Vector3) {
    // Clean up existing trails first
    this.cleanupPathTrails();

    // Create one trail per wheel with enhanced settings
    wheelPositions.forEach((position, index) => {
      const trail = new PathTrail({
        maxPoints: 60, // Good length for performance
        baseWidth: 0.4, // Nice thick base width
        maxWidth: 1.0, // Very thick at high speed
        color: new Color(0xeeeeee), // Bright white/light grey smoke core
        glowColor: new Color(0x888888), // Medium grey smoke outer edge
        fadeTime: 3.5, // Trail fades over 3.5 seconds
        minDistance: 0.3, // Add point every 0.3 units
        speedThreshold: 25, // Max intensity at 25 units/second
      });

      // Set camera reference for billboarding
      trail.setCamera(this.config.cameraManager.camera);
      trail.startTrail();
      const initialSpeed = velocity ? velocity.length() : Math.abs(this.lastSpeed);
      trail.addPoint(position, initialSpeed);
      this.skidParticleSystems.push(trail);
      this.config.composer.postPostScene.add(trail);
    });
  }

  private stopTrails() {
    // Stop adding new points but let existing trails fade out
    this.skidParticleSystems.forEach((trail) => {
      trail.stopTrail();
    });
  }

  private updatePathTrails() {
    // Update all trails and remove empty ones
    this.skidParticleSystems = this.skidParticleSystems.filter((trail) => {
      trail.update(1 / 60); // Assume 60fps for deltaTime

      if (trail.isEmpty()) {
        // Remove from scene and dispose
        this.config.composer.postPostScene.remove(trail);
        trail.dispose();
        return false;
      }

      return true;
    });
  }

  private cleanupPathTrails() {
    // Clean up all existing trails
    this.skidParticleSystems.forEach((trail) => {
      this.config.composer.postPostScene.remove(trail);
      trail.dispose();
    });
    this.skidParticleSystems = [];
  }

  public update(time: number, deltaTime: number) {
    if (this.tooltip) {
      this.tooltip.update();
    }

    if (this.speakingIndicator) {
      this.speakingIndicator.setTime(time);

      // Position speaking indicator above character/kar
      let indicatorPosition: Vector3;
      if (this.config.kartMode && this.kartMesh) {
        // Position above kart center
        indicatorPosition = this.kartMesh.getWorldPosition(new Vector3());
        indicatorPosition.y += 1.2; // Above kart body
      } else if (this.model?.mesh && this.model.headBone) {
        indicatorPosition = this.model.headBone.getWorldPosition(new Vector3());
      } else {
        indicatorPosition = this.getWorldPosition(new Vector3());
        indicatorPosition.y += 1.5; // Default heigh
      }

      this.speakingIndicator.setBillboarding(indicatorPosition, this.config.cameraManager.camera);
    }

    // Update model or kar
    if (this.config.kartMode) {
      // Kart-specific updates are handled by KartController
      // Visual updates like wheel rotation are handled in updateKartMovemen
    } else if (this.model) {
      this.model.update(deltaTime);
    }
  }

  getCurrentAnimation(): AnimationState {
    if (this.config.kartMode) {
      return AnimationState.idle; // Karts are always "idle" in terms of animation
    }
    return this.model?.currentAnimation || AnimationState.idle;
  }

  addChatBubble(message: string) {
    const tooltip = new CharacterTooltip({
      maxWidth: 1000,
      secondsToFadeOut: 10,
      color: new Color(0.125, 0.125, 0.125),
    });
    this.add(tooltip);
    this.chatTooltips.unshift(tooltip);
    tooltip.setText(message, () => {
      this.chatTooltips = this.chatTooltips.filter((t) => t !== tooltip);
      this.remove(tooltip);
      this.setTooltipHeights();
    });
    if (this.config.isLocal) {
      // Show the character's name if they're local and they emit a chat bubble
      this.tooltip.show();
    }
    this.setTooltipHeights();
  }

  // Helper method to get world direction for kart movemen
  getWorldDirection(target: Vector3): Vector3 {
    const quaternion = this.getWorldQuaternion(new Quaternion());
    return target.set(0, 0, 1).applyQuaternion(quaternion);
  }
}
