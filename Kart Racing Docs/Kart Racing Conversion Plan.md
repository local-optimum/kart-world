# Kart Racing Conversion Plan (Kart-Only Experience)

## Executive Summary
This document outlines a streamlined plan to convert the existing 3D web-based networked world experience into a **kart racing only** game. By eliminating the need to support both character and kart modes, we significantly simplify the implementation while leveraging the existing infrastructure for networking, camera management, and collision detection.

## Current System Analysis

### Character Movement System
- **Location**: `packages/3d-web-client-core/src/character/LocalController.ts`
- **Current Behavior**: WASD humanoid movement with gravity, jumping, running, and collision detection
- **Key Features**:
  - Gravity-based physics (-9.8 m/s²)
  - Jump mechanics (single and double jump)
  - Ground/air state detection
  - Collision capsule (0.4m radius, 1.05m height)
  - Movement damping and resistance
- **Replacement Strategy**: **Direct replacement** with KartController

### Camera System
- **Location**: `packages/3d-web-client-core/src/camera/CameraManager.ts`
- **Current Behavior**: Third-person orbital camera with mouse/touch controls
- **Key Features**:
  - Distance control (5-25m range)
  - Polar angle constraints (0.25π to 0.95π)
  - Smooth damping and interpolation
  - Collision-aware positioning
- **Modification Strategy**: **Direct enhancement** for kart racing dynamics

### Input System
- **Location**: `packages/3d-web-client-core/src/input/KeyInputManager.ts`
- **Current Mapping**: WASD + Shift (run) + Space (jump)
- **Output**: Direction angle, sprint boolean, jump boolean
- **Replacement Strategy**: **Direct replacement** with kart controls

### Visual Representation
- **Location**: `packages/3d-web-client-core/src/character/Character.ts`
- **Current**: Humanoid 3D model with animations (idle, jog, sprint, air, double jump)
- **Replacement Strategy**: **Direct replacement** with cube kart mesh

## Simplified Implementation Plan

### Phase 1: Replace LocalController with KartController (High Priority)

#### 1.1 Create KartController Class
**File**: `packages/3d-web-client-core/src/character/KartController.ts`

**Direct Replacement Strategy**:
- Replace all LocalController functionality
- Use same interface patterns for seamless integration
- No conditional logic needed

```typescript
export class KartController {
  // Direct replacement for LocalController
  public networkState: CharacterState;
  
  // Kart-specific physics
  private velocity: Vector3 = new Vector3();
  private angularVelocity: number = 0;
  private maxSpeed: number = 20; // m/s
  private acceleration: number = 8; // m/s²
  private steeringSpeed: number = 2.5; // rad/s
  private driftFactor: number = 0.85;
  
  constructor(private config: LocalControllerConfig) {
    // Same constructor pattern as LocalController
    // Initialize kart physics instead of character physics
  }
  
  public update(): void {
    // Same method signature as LocalController.update()
    // Implement kart physics instead of character physics
  }
  
  public resetPosition(): void {
    // Same method as LocalController
    // Reset kart to spawn position
  }
}
```

#### 1.2 Replace Input System
**File**: `packages/3d-web-client-core/src/input/KeyInputManager.ts`

**Simplified Changes**:
```typescript
// Remove character-specific enums and methods
// Replace getOutput() entirely
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
```

#### 1.3 Update CharacterManager
**File**: `packages/3d-web-client-core/src/character/CharacterManager.ts`

**Simplified Changes**:
```typescript
// Replace all references to LocalController with KartController
import { KartController } from "./KartController";

export class CharacterManager {
  public localController: KartController; // Changed type
  
  public spawnLocalCharacter(...) {
    // Remove conditional logic
    // Always create KartController
    this.localController = new KartController({
      character: this.localCharacter,
      // ... same config as before
    });
  }
}
```

### Phase 2: Replace Character Visuals (Medium Priority)

#### 2.1 Create KartMesh Class
**File**: `packages/3d-web-client-core/src/character/KartMesh.ts`

```typescript
export class KartMesh extends Group {
  private kartBody: Mesh;
  private wheels: Mesh[] = [];
  
  constructor() {
    super();
    this.createKartGeometry();
  }
  
  private createKartGeometry(): void {
    // Main body (cube for now)
    const bodyGeometry = new BoxGeometry(1.8, 0.6, 1.2);
    const bodyMaterial = new MeshStandardMaterial({ 
      color: 0x3366cc,
      metalness: 0.3,
      roughness: 0.7
    });
    this.kartBody = new Mesh(bodyGeometry, bodyMaterial);
    this.kartBody.position.y = 0.4;
    this.add(this.kartBody);
    
    this.createWheels();
  }
  
  // ... wheel creation and animation methods
}
```

#### 2.2 Simplify Character Class
**File**: `packages/3d-web-client-core/src/character/Character.ts`

**Direct Replacement**:
```typescript
export class Character extends Group {
  private kartMesh: KartMesh; // Remove conditional logic
  
  constructor(private config: CharacterConfig) {
    super();
    // Remove all humanoid model loading
    // Always create kart mesh
    this.kartMesh = new KartMesh();
    this.add(this.kartMesh);
    
    // Keep tooltip system as is
    this.tooltip = new CharacterTooltip(...);
    this.add(this.tooltip);
  }
  
  public updateKartVisuals(speed: number, steeringAngle: number, deltaTime: number): void {
    this.kartMesh.updateWheelRotation(speed, deltaTime);
    this.kartMesh.updateSteeringWheels(steeringAngle);
  }
  
  // Remove all animation-related methods
  // Keep only position/rotation updates
}
```

### Phase 3: Optimize Camera for Kart Racing (Medium Priority)

#### 3.1 Enhance CameraManager
**File**: `packages/3d-web-client-core/src/camera/CameraManager.ts`

**Direct Enhancement**:
```typescript
export class CameraManager {
  // Remove mode switching - always kart optimized
  public initialDistance: number = 8; // Kart-optimized default
  public minDistance: number = 4;     // Closer for kart racing
  public maxDistance: number = 15;    // Farther for high speeds
  public damping: number = 0.1;       // More responsive
  
  // Add kart-specific properties
  private heightOffset: number = 2.5;
  private lookAheadDistance: number = 3;
  
  public updateKartCamera(kartPosition: Vector3, kartVelocity: Vector3): void {
    const speed = kartVelocity.length();
    
    // Dynamic distance based on speed
    const dynamicDistance = 4 + (speed / 20) * 11; // 4m to 15m
    
    // Look-ahead based on velocity
    const lookAhead = kartVelocity.clone()
      .normalize()
      .multiplyScalar(this.lookAheadDistance * Math.min(speed / 10, 1));
    
    const heightOffset = new Vector3(0, this.heightOffset, 0);
    const targetPosition = kartPosition.clone().add(lookAhead).add(heightOffset);
    
    this.setTarget(targetPosition);
    this.targetDistance = dynamicDistance;
  }
}
```

### Phase 4: Simplify Network State (Low Priority)

#### 4.1 Replace Character State
**File**: `packages/3d-web-client-core/src/character/CharacterState.ts`

**Simplified State**:
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

### Phase 5: Update Configuration (Low Priority)

#### 5.1 Simplify Client Configuration
**File**: `packages/3d-web-experience-client/src/Networked3dWebExperienceClient.ts`

**Remove Animation Config**:
```typescript
export class Networked3dWebExperienceClient {
  constructor(holder: HTMLElement, config: Config) {
    // Remove animationConfig entirely
    // Remove avatarConfiguration
    // Add kartConfiguration instead
    
    const kartConfig = {
      physics: {
        maxSpeed: 20,
        acceleration: 8,
        steeringSpeed: 2.5,
        driftFactor: 0.85
      },
      camera: {
        followDistance: { min: 4, max: 15 },
        heightOffset: 2.5,
        lookAhead: 3
      }
    };
  }
}
```

#### 5.2 Update Example
**File**: `example/multi-user-3d-web-experience/client/src/index.ts`

**Simplified Configuration**:
```typescript
const app = new Networked3dWebExperienceClient(holder, {
  sessionToken: (window as any).SESSION_TOKEN,
  userNetworkAddress,
  chatNetworkAddress,
  // Remove animationConfig entirely
  // Remove avatarConfiguration
  kartConfiguration: {
    defaultKartColor: 0x3366cc,
    physics: {
      maxSpeed: 20,
      acceleration: 8
    }
  },
  environmentConfiguration: {
    skybox: { hdrJpgUrl: hdrJpgUrl }
  },
  loadingScreen: {
    title: "Kart Racing Experience",
    subtitle: "Powered by WebGL"
  }
});
```

## Benefits of Kart-Only Approach

### Complexity Reduction
- **No conditional logic** - single code path throughout
- **No mode switching** - eliminates entire category of bugs
- **Simpler state management** - no dual state tracking
- **Reduced testing surface** - only test one mode

### Performance Benefits
- **Smaller bundle size** - remove unused humanoid assets and animations
- **Less memory usage** - no dual model loading
- **Simpler physics** - no gravity/jumping complexity
- **Faster loading** - fewer assets to download

### Development Benefits
- **Faster implementation** - ~40% fewer changes required
- **Easier maintenance** - single system to maintain
- **Clearer code** - no mode abstractions
- **Better performance** - optimized for single use case

## Implementation Timeline (Simplified)

### Week 1-2: Core Physics Replacement
- Replace LocalController with KartController
- Update input system for kart controls
- Integrate with CharacterManager

### Week 3: Visual Replacement
- Replace Character visuals with KartMesh
- Remove humanoid model loading
- Implement basic kart animations

### Week 4: Camera Optimization
- Enhance CameraManager for kart racing
- Remove character-specific camera logic
- Implement speed-responsive camera

### Week 5: Network Simplification
- Update network state structure
- Remove animation state synchronization
- Test multiplayer kart interactions

### Week 6: Configuration & Polish
- Update client configuration
- Remove unused assets
- Performance optimization and testing

## Risk Mitigation

### Lower Risk Profile
- **Simpler implementation** = fewer things that can go wrong
- **Direct replacement** = easier to reason about changes
- **No backwards compatibility** = no legacy code maintenance

### Migration Strategy
1. **Feature branch** - implement kart-only version
2. **Parallel deployment** - maintain old version during testing
3. **Gradual rollout** - deploy to subset of users first
4. **Quick rollback** - keep old version available if needed

## Conclusion

The kart-only approach reduces implementation complexity by approximately **40%** while delivering a more focused, performant experience. By removing the dual-mode complexity, we can:

- Deliver faster (6 weeks vs 8 weeks)
- Reduce bugs and edge cases
- Optimize specifically for kart racing
- Simplify long-term maintenance

This approach transforms the project from a "conversion with backwards compatibility" to a "focused reimplementation," which is much cleaner both technically and from a user experience perspective. 