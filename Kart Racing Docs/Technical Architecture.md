# Kart Racing Technical Architecture (Kart-Only)

## System Overview

This architecture **directly replaces** the existing character system with kart racing mechanics. No dual-mode support needed - significant simplification.

## Core Components (Direct Replacements)

### 1. KartController (Replaces LocalController)

**Location**: `packages/3d-web-client-core/src/character/KartController.ts`

```typescript
export interface KartPhysicsConfig {
  maxSpeed: number;           // 20 m/s
  acceleration: number;       // 8 m/s²
  deceleration: number;       // 12 m/s²
  steeringSpeed: number;      // 2.5 rad/s
  driftFactor: number;        // 0.85
  groundFriction: number;     // 0.98
  airResistance: number;      // 0.02
}

export class KartController {
  // Same interface as LocalController for seamless replacement
  public networkState: CharacterState;
  
  // Kart physics state
  private velocity: Vector3 = new Vector3();
  private angularVelocity: number = 0;
  private isDrifting: boolean = false;
  
  constructor(private config: LocalControllerConfig) {
    // Same constructor signature as LocalController
    this.networkState = {
      id: this.config.id,
      position: { x: 0, y: 0, z: 0 },
      rotation: { quaternionY: 0, quaternionW: 1 },
      velocity: { x: 0, y: 0, z: 0 },
      speed: 0,
      isDrifting: false
    };
  }
  
  public update(): void {
    // Same method signature - direct replacement
    const controlInput = this.config.keyInputManager.getOutput();
    this.processKartPhysics(controlInput, this.config.timeManager.deltaTime);
    this.updateNetworkState();
  }
  
  public resetPosition(): void {
    // Same interface as LocalController
    // Reset kart to spawn position
  }
}
```

### 2. Updated Input System (Direct Replacement)

**File**: `packages/3d-web-client-core/src/input/KeyInputManager.ts`

```typescript
// Remove all character-specific code
export class KeyInputManager {
  // Simplified - no mode switching needed
  public getOutput(): { throttle: number; steering: number; drift: boolean } | null {
    const forward = this.isKeyPressed(Key.W);
    const backward = this.isKeyPressed(Key.S);
    const left = this.isKeyPressed(Key.A);
    const right = this.isKeyPressed(Key.D);
    const drift = this.isKeyPressed(Key.SPACE);
    
    const throttle = (forward ? 1 : 0) + (backward ? -1 : 0);
    const steering = (right ? 1 : 0) + (left ? -1 : 0);
    
    if (throttle === 0 && steering === 0 && !drift) {
      return null;
    }
    
    return { throttle, steering, drift };
  }
}
```

### 3. CharacterManager (Minimal Changes)

**File**: `packages/3d-web-client-core/src/character/CharacterManager.ts`

```typescript
// Simply replace import and type
import { KartController } from "./KartController";

export class CharacterManager {
  public localController: KartController; // Changed from LocalController
  
  public spawnLocalCharacter(...) {
    // Same method, just create KartController instead
    this.localController = new KartController({
      character: this.localCharacter,
      id: this.localClientId,
      collisionsManager: this.config.collisionsManager,
      keyInputManager: this.config.keyInputManager,
      cameraManager: this.config.cameraManager,
      timeManager: this.config.timeManager,
      spawnConfiguration: this.config.spawnConfiguration,
    });
  }
}
```

### 4. KartMesh (Replaces Character Model)

**File**: `packages/3d-web-client-core/src/character/KartMesh.ts`

```typescript
export class KartMesh extends Group {
  private kartBody: Mesh;
  private wheels: Mesh[] = [];
  
  constructor() {
    super();
    this.createSimpleKart();
  }
  
  private createSimpleKart(): void {
    // Main body
    const bodyGeometry = new BoxGeometry(1.8, 0.6, 1.2);
    this.kartBody = new Mesh(bodyGeometry, new MeshStandardMaterial({ 
      color: 0x3366cc 
    }));
    this.kartBody.position.y = 0.4;
    this.add(this.kartBody);
    
    // 4 wheels
    const wheelGeometry = new CylinderGeometry(0.25, 0.25, 0.15, 12);
    const wheelMaterial = new MeshStandardMaterial({ color: 0x222222 });
    
    const positions = [
      [-0.8, 0.25, 0.5], [0.8, 0.25, 0.5],   // Front
      [-0.8, 0.25, -0.5], [0.8, 0.25, -0.5]  // Rear
    ];
    
    positions.forEach(([x, y, z]) => {
      const wheel = new Mesh(wheelGeometry, wheelMaterial);
      wheel.position.set(x, y, z);
      wheel.rotation.z = Math.PI / 2;
      this.wheels.push(wheel);
      this.add(wheel);
    });
  }
  
  public updateVisuals(speed: number, steeringAngle: number, deltaTime: number): void {
    // Rotate wheels based on speed
    const wheelRotation = speed * deltaTime * 2;
    this.wheels.forEach(wheel => wheel.rotation.x += wheelRotation);
    
    // Turn front wheels for steering
    this.wheels[0].rotation.y = steeringAngle * 0.5;
    this.wheels[1].rotation.y = steeringAngle * 0.5;
  }
}
```

### 5. Character Class (Simplified)

**File**: `packages/3d-web-client-core/src/character/Character.ts`

```typescript
export class Character extends Group {
  private kartMesh: KartMesh;
  
  constructor(private config: CharacterConfig) {
    super();
    
    // Always create kart - no conditional logic
    this.kartMesh = new KartMesh();
    this.add(this.kartMesh);
    
    // Keep tooltip system
    this.tooltip = new CharacterTooltip(...);
    this.add(this.tooltip);
  }
  
  public update(time: number, deltaTime: number, kartData?: {speed: number, steering: number}) {
    if (this.tooltip) this.tooltip.update();
    
    if (kartData) {
      this.kartMesh.updateVisuals(kartData.speed, kartData.steering, deltaTime);
    }
  }
  
  // Remove all animation methods - not needed
}
```

### 6. Enhanced CameraManager

**File**: `packages/3d-web-client-core/src/camera/CameraManager.ts`

```typescript
export class CameraManager {
  // Set kart-optimized defaults directly
  public initialDistance: number = 8;
  public minDistance: number = 4;
  public maxDistance: number = 15;
  public damping: number = 0.1; // More responsive
  
  private heightOffset: number = 2.5;
  private lookAheadDistance: number = 3;
  
  // Add this method, called from CharacterManager
  public updateForKart(kartPosition: Vector3, kartVelocity: Vector3): void {
    const speed = kartVelocity.length();
    
    // Dynamic distance: 4m at rest, 15m at max speed
    const dynamicDistance = 4 + (speed / 20) * 11;
    
    // Look ahead based on velocity
    const lookAhead = kartVelocity.clone()
      .normalize()
      .multiplyScalar(this.lookAheadDistance * Math.min(speed / 10, 1));
    
    const targetPosition = kartPosition.clone()
      .add(lookAhead)
      .add(new Vector3(0, this.heightOffset, 0));
    
    this.setTarget(targetPosition);
    this.targetDistance = dynamicDistance;
  }
}
```

## Network State (Simplified)

**File**: `packages/3d-web-client-core/src/character/CharacterState.ts`

```typescript
// Remove animation states entirely
export interface CharacterState {
  id: number;
  position: { x: number; y: number; z: number };
  rotation: { quaternionY: number; quaternionW: number };
  velocity: { x: number; y: number; z: number };
  speed: number;
  isDrifting: boolean;
}
```

## Configuration (Simplified)

**File**: `example/multi-user-3d-web-experience/client/src/index.ts`

```typescript
const app = new Networked3dWebExperienceClient(holder, {
  sessionToken: (window as any).SESSION_TOKEN,
  userNetworkAddress,
  chatNetworkAddress,
  // Remove animationConfig entirely
  kartConfiguration: {
    physics: {
      maxSpeed: 20,
      acceleration: 8,
      steeringSpeed: 2.5
    }
  },
  environmentConfiguration: {
    skybox: { hdrJpgUrl: hdrJpgUrl }
  },
  loadingScreen: {
    title: "Kart Racing",
    subtitle: "3D Multiplayer Racing"
  }
});
```

## Key Simplifications

1. **Direct Replacement** - No conditional logic anywhere
2. **Single Code Path** - Remove all mode switching
3. **Simplified State** - No animation state tracking
4. **Cleaner Interfaces** - Remove unused parameters
5. **Smaller Bundle** - Remove humanoid assets
6. **Better Performance** - Optimized for single use case

This architecture is **~60% less complex** than the dual-mode approach while delivering the same kart racing functionality. 