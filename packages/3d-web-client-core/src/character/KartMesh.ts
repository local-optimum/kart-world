import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  CylinderGeometry,
  Object3D,
} from "three";

import { CharacterModelLoader } from "./CharacterModelLoader";

export interface KartMeshConfig {
  kartColor?: number;
  wheelColor?: number;
  showWheels?: boolean;
  modelUrl?: string; // Optional GLB file URL
  characterModelLoader?: CharacterModelLoader; // For loading GLB assets
}

export class KartMesh extends Group {
  private kartBody: Mesh;
  private kartSeat: Mesh;
  private kartBumper: Mesh;
  private wheels: Mesh[] = [];
  private wheelRadius: number = 0.25; // Realistic wheel radius
  private wheelWidth: number = 0.15; // Wheel thickness
  private loadedModel: Object3D | null = null; // For GLB model
  
  // Wheel positions - adjusted for realistic kart proportions
  // Y position set so bottom of wheel touches ground (y = 0)
  private wheelPositions: Vector3[] = [
    new Vector3(-0.7, this.wheelRadius, 0.8), // Front left - positioned so bottom touches ground
    new Vector3(0.7, this.wheelRadius, 0.8), // Front right
    new Vector3(-0.7, this.wheelRadius, -0.8), // Rear left
    new Vector3(0.7, this.wheelRadius, -0.8), // Rear right
  ];

  constructor(config: KartMeshConfig = {}) {
    super();

    // Load GLB model if provided, otherwise create programmatic mesh
    if (config.modelUrl && config.characterModelLoader) {
      this.loadGLBModel(config.modelUrl, config.characterModelLoader);
    } else {
      // Create realistic kart body with multiple parts
      this.createKartBody(config.kartColor || 0x4287f5);

      // Create wheels if enabled
      if (config.showWheels !== false) {
        this.createWheels(config.wheelColor || 0x333333);
      }
    }

    // Set up initial transform
    this.position.set(0, 0, 0);
    this.rotation.set(0, 0, 0);
  }

  private async loadGLBModel(modelUrl: string, modelLoader: CharacterModelLoader): Promise<void> {
    try {
      console.log("Loading kart model from:", modelUrl);
      const model = await modelLoader.load(modelUrl, "model");
      
      if (model) {
        this.loadedModel = model;
        this.add(model);
        
        // Scale and position the loaded model if needed
        model.scale.setScalar(0.01); // Scale down 100x - GLB was too large
        model.position.set(0, 0.3, 0); // Lift up the kart slightly
        
        console.log("Kart GLB model loaded successfully");
      } else {
        console.warn("Failed to load kart model, falling back to programmatic mesh");
        this.createFallbackKart();
      }
    } catch (error) {
      console.error("Error loading kart GLB:", error);
      console.log("Falling back to programmatic mesh");
      this.createFallbackKart();
    }
  }

  private createFallbackKart(): void {
    // Fallback to programmatic mesh if GLB loading fails
    this.createKartBody(0x4287f5);
    this.createWheels(0x333333);
  }

  private createKartBody(kartColor: number): void {
    const kartMaterial = new MeshBasicMaterial({
      color: kartColor,
      transparent: true,
      opacity: 0.9,
    });

    // Main chassis - lower and longer like a real kart
    const chassisGeometry = new BoxGeometry(1.4, 0.2, 1.8);
    this.kartBody = new Mesh(chassisGeometry, kartMaterial);
    this.kartBody.position.set(0, this.wheelRadius + 0.1, 0); // Position above wheels
    this.add(this.kartBody);

    // Driver seat area - positioned behind center
    const seatGeometry = new BoxGeometry(0.8, 0.6, 0.8);
    const seatMaterial = new MeshBasicMaterial({
      color: kartColor * 0.8, // Slightly darker for seat
      transparent: true,
      opacity: 0.9,
    });
    this.kartSeat = new Mesh(seatGeometry, seatMaterial);
    this.kartSeat.position.set(0, this.wheelRadius + 0.4, -0.3); // Behind center, higher
    this.add(this.kartSeat);

    // Front bumper/nose cone
    const bumperGeometry = new BoxGeometry(1.0, 0.15, 0.3);
    const bumperMaterial = new MeshBasicMaterial({
      color: kartColor * 1.2, // Slightly brighter for contrast
      transparent: true,
      opacity: 0.9,
    });
    this.kartBumper = new Mesh(bumperGeometry, bumperMaterial);
    this.kartBumper.position.set(0, this.wheelRadius + 0.2, 0.95); // At front
    this.add(this.kartBumper);
  }

  private createWheels(wheelColor: number): void {
    // Create circular wheels using CylinderGeometry
    const wheelGeometry = new CylinderGeometry(
      this.wheelRadius, // top radius
      this.wheelRadius, // bottom radius
      this.wheelWidth, // height (thickness)
      16, // segments for smooth circle
    );
    const wheelMaterial = new MeshBasicMaterial({ color: wheelColor });

    this.wheelPositions.forEach((position, index) => {
      const wheel = new Mesh(wheelGeometry, wheelMaterial);
      wheel.position.copy(position);

      // Rotate wheel to be perpendicular to ground (lying flat like car wheels)
      wheel.rotation.z = Math.PI / 2;

      this.wheels.push(wheel);
      this.add(wheel);
    });
  }

  public updateWheelRotation(forwardSpeed: number, steeringAngle: number, deltaTime: number): void {
    // Only animate programmatic wheels, not GLB model wheels
    if (this.loadedModel || this.wheels.length === 0) return;

    // Rotate all wheels based on forward movement
    // Use wheel circumference for realistic rotation speed
    const wheelCircumference = 2 * Math.PI * this.wheelRadius;
    const wheelRotation = ((forwardSpeed * deltaTime) / wheelCircumference) * 2 * Math.PI;

    this.wheels.forEach((wheel) => {
      wheel.rotation.x += wheelRotation; // X-axis rotation for wheels lying flat
    });

    // Apply steering to front wheels only
    const frontWheels = this.wheels.slice(0, 2); // First 2 wheels are front
    const maxSteerAngle = Math.PI / 6; // 30 degrees max steering
    frontWheels.forEach((wheel) => {
      wheel.rotation.y = steeringAngle * maxSteerAngle; // Steering around Y-axis (vertical turning)
    });
  }

  public setKartColor(color: number): void {
    if (this.loadedModel) {
      // For GLB models, you might want to traverse and update materials
      // This is more complex and depends on your GLB structure
      return;
    }

    // Update all kart body parts for programmatic mesh
    if (this.kartBody?.material instanceof MeshBasicMaterial) {
      this.kartBody.material.color.setHex(color);
    }
    if (this.kartSeat?.material instanceof MeshBasicMaterial) {
      this.kartSeat.material.color.setHex(color * 0.8);
    }
    if (this.kartBumper?.material instanceof MeshBasicMaterial) {
      this.kartBumper.material.color.setHex(color * 1.2);
    }
  }

  public setWheelColor(color: number): void {
    if (this.loadedModel) {
      // For GLB models, wheel color changes would need custom implementation
      return;
    }

    this.wheels.forEach((wheel) => {
      if (wheel.material instanceof MeshBasicMaterial) {
        wheel.material.color.setHex(color);
      }
    });
  }

  public dispose(): void {
    // Clean up loaded GLB model
    if (this.loadedModel) {
      this.loadedModel.traverse((child) => {
        if (child instanceof Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((material) => material.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });
    }

    // Clean up programmatic mesh parts
    if (this.kartBody) {
      this.kartBody.geometry.dispose();
      if (this.kartBody.material instanceof MeshBasicMaterial) {
        this.kartBody.material.dispose();
      }
    }

    if (this.kartSeat) {
      this.kartSeat.geometry.dispose();
      if (this.kartSeat.material instanceof MeshBasicMaterial) {
        this.kartSeat.material.dispose();
      }
    }

    if (this.kartBumper) {
      this.kartBumper.geometry.dispose();
      if (this.kartBumper.material instanceof MeshBasicMaterial) {
        this.kartBumper.material.dispose();
      }
    }

    this.wheels.forEach((wheel) => {
      wheel.geometry.dispose();
      if (wheel.material instanceof MeshBasicMaterial) {
        wheel.material.dispose();
      }
    });

    // Remove from parent
    this.removeFromParent();
  }
}