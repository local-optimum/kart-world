import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
  AdditiveBlending,
  Camera,
} from "three";

export interface PathTrailConfig {
  maxPoints: number;
  baseWidth: number; // Base thickness
  maxWidth: number; // Maximum thickness at high speed
  color: Color;
  glowColor: Color; // Color for the glow layer
  fadeTime: number; // Time in seconds to fully fade
  minDistance: number; // Minimum distance between points to add a new one
  speedThreshold: number; // Speed at which max intensity is reached
}

interface TrailPoint {
  position: Vector3;
  age: number; // Age in seconds
  intensity: number; // Intensity based on speed when created
  coreMesh: Mesh;
  glowMesh: Mesh;
}

export class PathTrail extends Group {
  private points: TrailPoint[] = [];
  private config: PathTrailConfig;
  private isActive: boolean = false;
  private currentSpeed: number = 0;
  private camera: Camera | null = null;

  constructor(config: Partial<PathTrailConfig> = {}) {
    super();
    
    const defaultConfig: PathTrailConfig = {
      maxPoints: 80, // Reasonable number for performance
      baseWidth: 0.3, // Thick base width
      maxWidth: 0.8, // Much thicker at high speed
      color: new Color(0xff3311), // Bright red-orange core
      glowColor: new Color(0xff6633), // Orange glow
      fadeTime: 4, // Trail fades over 4 seconds
      minDistance: 0.4, // Add new point every 0.4 units of movement
      speedThreshold: 25, // Max intensity at 25 units/second
    };

    this.config = { ...defaultConfig, ...config };
    this.name = "PathTrail";
  }

  public setCamera(camera: Camera): void {
    this.camera = camera;
  }

  public startTrail(): void {
    this.isActive = true;
  }

  public stopTrail(): void {
    this.isActive = false;
  }

  public addPoint(position: Vector3, speed: number = 0): void {
    if (!this.isActive) return;

    this.currentSpeed = speed;

    // Check if we should add this point (based on distance from last point)
    if (this.points.length > 0) {
      const lastPoint = this.points[this.points.length - 1];
      const distance = position.distanceTo(lastPoint.position);
      if (distance < this.config.minDistance) {
        return; // Too close to last point, skip
      }
    }

    // Calculate intensity based on speed
    const speedRatio = Math.min(1, speed / this.config.speedThreshold);
    const intensity = 0.3 + (speedRatio * 0.7); // Range from 0.3 to 1.0

    // Calculate width based on speed
    const width = this.config.baseWidth + (speedRatio * (this.config.maxWidth - this.config.baseWidth));

    // Create trail segment meshes with speed information
    this.createTrailSegment(position, width, intensity, speed);

    // Remove old points if we exceed max
    if (this.points.length > this.config.maxPoints) {
      this.removeOldestPoint();
    }
  }

  private createTrailSegment(position: Vector3, width: number, intensity: number, speed: number = 0): void {
    // Calculate speed ratio for height scaling
    const speedRatio = Math.min(1, speed / this.config.speedThreshold);
    
    // Create core segment - height varies from 20% to 70% of width based on speed
    const baseHeightRatio = 0.2; // 20% at low speed
    const maxHeightRatio = 0.7;  // 70% at high speed
    const heightRatio = baseHeightRatio + (speedRatio * (maxHeightRatio - baseHeightRatio));
    const height = width * heightRatio;
    
    const coreGeometry = new PlaneGeometry(width, height);
    const coreMaterial = new MeshBasicMaterial({
      color: this.config.color,
      transparent: true,
      opacity: intensity * 0.9,
      depthWrite: false,
      depthTest: true,
    });

    // Create glow segment (larger but also speed-responsive height)
    const glowWidth = width * 1.8;
    const glowHeight = height * 1.8; // Keep proportional to the speed-responsive height
    const glowGeometry = new PlaneGeometry(glowWidth, glowHeight);
    const glowMaterial = new MeshBasicMaterial({
      color: this.config.glowColor,
      transparent: true,
      opacity: intensity * 0.3,
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });

    const coreMesh = new Mesh(coreGeometry, coreMaterial);
    const glowMesh = new Mesh(glowGeometry, glowMaterial);

    // Position the meshes
    coreMesh.position.copy(position);
    glowMesh.position.copy(position);

    // Slightly offset glow behind core
    glowMesh.position.y -= 0.01;

    // Add to scene (glow first for correct rendering order)
    this.add(glowMesh);
    this.add(coreMesh);

    // Store point info
    const point: TrailPoint = {
      position: position.clone(),
      age: 0,
      intensity: intensity,
      coreMesh: coreMesh,
      glowMesh: glowMesh,
    };

    this.points.push(point);
  }

  private removeOldestPoint(): void {
    if (this.points.length === 0) return;

    const oldPoint = this.points.shift()!;
    this.remove(oldPoint.coreMesh);
    this.remove(oldPoint.glowMesh);
    
    // Dispose of resources
    oldPoint.coreMesh.geometry.dispose();
    oldPoint.glowMesh.geometry.dispose();
    (oldPoint.coreMesh.material as MeshBasicMaterial).dispose();
    (oldPoint.glowMesh.material as MeshBasicMaterial).dispose();
  }

  public update(deltaTime: number): void {
    // Update billboard orientations if camera is available
    if (this.camera) {
      this.updateBillboarding();
    }

    let needsCleanup = false;

    // Update ages and remove expired points
    for (let i = this.points.length - 1; i >= 0; i--) {
      const point = this.points[i];
      point.age += deltaTime;
      
      // Calculate fade factor with smooth curve
      const ageRatio = point.age / this.config.fadeTime;
      let fadeFactor: number;
      
      if (ageRatio < 0.7) {
        // First 70% of lifetime: maintain full visibility
        fadeFactor = 1.0;
      } else if (ageRatio < 1.2) {
        // From 70% to 120% of lifetime: smooth fade out
        const fadeProgress = (ageRatio - 0.7) / 0.5; // 0 to 1 over the fade period
        fadeFactor = Math.max(0, 1 - Math.pow(fadeProgress, 2)); // Quadratic fade
      } else {
        // After 120% of lifetime: completely invisible
        fadeFactor = 0;
      }
      
      // Only remove when completely faded and beyond extended lifetime
      if (point.age > this.config.fadeTime * 1.3 || fadeFactor <= 0.01) {
        this.remove(point.coreMesh);
        this.remove(point.glowMesh);
        
        // Dispose of resources
        point.coreMesh.geometry.dispose();
        point.glowMesh.geometry.dispose();
        (point.coreMesh.material as MeshBasicMaterial).dispose();
        (point.glowMesh.material as MeshBasicMaterial).dispose();
        
        this.points.splice(i, 1);
        needsCleanup = true;
        continue;
      }
      
      // Update materials with smooth fade
      const coreMaterial = point.coreMesh.material as MeshBasicMaterial;
      const glowMaterial = point.glowMesh.material as MeshBasicMaterial;
      
      coreMaterial.opacity = point.intensity * fadeFactor * 0.9;
      glowMaterial.opacity = point.intensity * fadeFactor * 0.3;
      
      // Intensify colors based on current speed
      const speedRatio = Math.min(1, this.currentSpeed / this.config.speedThreshold);
      const colorIntensity = 0.8 + (speedRatio * 0.2);
      
      coreMaterial.color.copy(this.config.color).multiplyScalar(colorIntensity);
      glowMaterial.color.copy(this.config.glowColor).multiplyScalar(colorIntensity);
    }
  }

  private updateBillboarding(): void {
    if (!this.camera) return;

    // Make all trail segments face the camera
    for (const point of this.points) {
      point.coreMesh.lookAt(this.camera.position);
      point.glowMesh.lookAt(this.camera.position);
    }
  }

  public isEmpty(): boolean {
    return this.points.length === 0;
  }

  public getPointCount(): number {
    return this.points.length;
  }

  public dispose(): void {
    // Clean up all points
    this.points.forEach(point => {
      this.remove(point.coreMesh);
      this.remove(point.glowMesh);
      
      point.coreMesh.geometry.dispose();
      point.glowMesh.geometry.dispose();
      (point.coreMesh.material as MeshBasicMaterial).dispose();
      (point.glowMesh.material as MeshBasicMaterial).dispose();
    });
    
    this.points = [];
  }
} 