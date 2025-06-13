import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  MeshBasicMaterial,
  BoxGeometry,
  Mesh,
  Vector3,
} from "three";

export interface SkidMarkConfig {
  maxPoints: number;
  lineWidth: number;
  color: Color;
  fadeTime: number; // Time in seconds to fully fade
}

export class SkidMarkTrail extends Group {
  private points: Vector3[] = [];
  private pointAges: number[] = []; // Age of each point in seconds
  private meshes: Mesh[] = []; // Individual dash meshes for each segment
  private isActive: boolean = false;
  private lastUpdateTime: number = 0;
  private config: SkidMarkConfig;

  constructor(config: Partial<SkidMarkConfig> = {}) {
    super();
    
    const defaultConfig: SkidMarkConfig = {
      maxPoints: 200, // More points for longer trails
      lineWidth: 0.08, // Width of tire tread marks
      color: new Color(0x000000), // Pure black, not grey
      fadeTime: 8, // Faster fade for performance
    };

    this.config = { ...defaultConfig, ...config };
    this.lastUpdateTime = Date.now() / 1000;
    this.name = "SkidMarkTrail";
  }

  public startTrail(position: Vector3): void {
    this.isActive = true;
    this.addPoint(position);
  }

  public addPoint(position: Vector3): void {
    if (!this.isActive) return;

    const currentTime = Date.now() / 1000;
    this.points.push(position.clone());
    this.pointAges.push(0); // Start at age 0

    // Create horizontal dash like tire tread marks
    const geometry = new BoxGeometry(0.15, 0.005, this.config.lineWidth); // Horizontal dash shape
    
    const material = new MeshBasicMaterial({
      color: this.config.color, // Pure black
      transparent: true,
      opacity: 0.9, // Start strong
      depthWrite: false, // Prevent z-fighting
      depthTest: true,
    });

    const mesh = new Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.renderOrder = 1; // Render after ground
    this.meshes.push(mesh);
    this.add(mesh);

    // Remove old points when we exceed max
    this.pruneOldPoints();
  }

  public stopTrail(): void {
    this.isActive = false;
  }

  public update(): void {
    const currentTime = Date.now() / 1000;
    const deltaTime = currentTime - this.lastUpdateTime;
    this.lastUpdateTime = currentTime;

    // Update ages and fade meshes
    for (let i = 0; i < this.pointAges.length; i++) {
      this.pointAges[i] += deltaTime;
      
      if (i < this.meshes.length) {
        const age = this.pointAges[i];
        // Improved fade curve - starts strong, fades gradually
        const fadeRatio = Math.max(0, 1 - Math.pow(age / this.config.fadeTime, 1.5));
        const material = this.meshes[i].material as MeshBasicMaterial;
        material.opacity = fadeRatio * 0.95;
      }
    }

    this.pruneOldPoints();
  }

  private pruneOldPoints(): void {
    let removed = false;
    
    while (this.pointAges.length > 0 && this.pointAges[0] > this.config.fadeTime) {
      this.points.shift();
      this.pointAges.shift();
      
      if (this.meshes.length > 0) {
        const mesh = this.meshes.shift()!;
        this.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as MeshBasicMaterial).dispose();
      }
      removed = true;
    }

    // Limit maximum points for performance
    while (this.points.length > this.config.maxPoints) {
      this.points.shift();
      this.pointAges.shift();
      
      if (this.meshes.length > 0) {
        const mesh = this.meshes.shift()!;
        this.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as MeshBasicMaterial).dispose();
      }
    }
  }

  public isEmpty(): boolean {
    return this.points.length === 0;
  }

  public dispose(): void {
    this.meshes.forEach(mesh => {
      this.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    });
    this.meshes = [];
    this.points = [];
    this.pointAges = [];
  }
} 