import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from "three";

export interface KartMeshConfig {
  kartColor?: number;
  wheelColor?: number;
  showWheels?: boolean;
}

export class KartMesh extends Group {
  private kartBody: Mesh;
  private wheels: Mesh[] = [];
  private wheelPositions: Vector3[] = [
    new Vector3(-0.6, -0.3, 0.7), // Front left
    new Vector3(0.6, -0.3, 0.7), // Front right
    new Vector3(-0.6, -0.3, -0.7), // Rear left
    new Vector3(0.6, -0.3, -0.7), // Rear right
  ];

  constructor(config: KartMeshConfig = {}) {
    super();

    // Create main kart body (cube)
    const kartGeometry = new BoxGeometry(1.2, 0.8, 1.8);
    const kartMaterial = new MeshBasicMaterial({
      color: config.kartColor || 0x4287f5,
      transparent: true,
      opacity: 0.9,
    });
    this.kartBody = new Mesh(kartGeometry, kartMaterial);
    this.kartBody.position.set(0, 0, 0);
    this.add(this.kartBody);

    // Create wheels if enabled
    if (config.showWheels !== false) {
      this.createWheels(config.wheelColor || 0x333333);
    }

    // Set up initial transform
    this.position.set(0, 0, 0);
    this.rotation.set(0, 0, 0);
  }

  private createWheels(wheelColor: number): void {
    const wheelGeometry = new BoxGeometry(0.2, 0.4, 0.4);
    const wheelMaterial = new MeshBasicMaterial({ color: wheelColor });

    this.wheelPositions.forEach((position, index) => {
      const wheel = new Mesh(wheelGeometry, wheelMaterial);
      wheel.position.copy(position);
      this.wheels.push(wheel);
      this.add(wheel);
    });
  }

  public updateWheelRotation(forwardSpeed: number, steeringAngle: number, deltaTime: number): void {
    if (this.wheels.length === 0) return;

    // Rotate all wheels based on forward movement
    const wheelRotation = (forwardSpeed * deltaTime) / 0.2; // wheel radius = 0.2
    this.wheels.forEach((wheel) => {
      wheel.rotation.x += wheelRotation;
    });

    // Apply steering to front wheels
    const frontWheels = this.wheels.slice(0, 2); // First 2 wheels are front
    frontWheels.forEach((wheel) => {
      wheel.rotation.y = steeringAngle * 0.5; // Max 30 degrees steering
    });
  }

  public setKartColor(color: number): void {
    if (this.kartBody.material instanceof MeshBasicMaterial) {
      this.kartBody.material.color.setHex(color);
    }
  }

  public setWheelColor(color: number): void {
    this.wheels.forEach((wheel) => {
      if (wheel.material instanceof MeshBasicMaterial) {
        wheel.material.color.setHex(color);
      }
    });
  }

  public dispose(): void {
    // Clean up geometries and materials
    this.kartBody.geometry.dispose();
    if (this.kartBody.material instanceof MeshBasicMaterial) {
      this.kartBody.material.dispose();
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