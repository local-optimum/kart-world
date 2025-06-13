# Kart Racing Implementation Checklist (Kart-Only)

## Phase 1: Direct Controller Replacement ⭐ HIGH PRIORITY

### 1.1 Create KartController (Replace LocalController)
**File**: `packages/3d-web-client-core/src/character/KartController.ts`

- [ ] **Direct Replacement Setup**
  - [ ] Create KartController with same interface as LocalController
  - [ ] Use same constructor signature (LocalControllerConfig)
  - [ ] Implement same public methods (update, resetPosition)
  - [ ] Maintain same networkState structure initially

- [ ] **Kart Physics Implementation**
  - [ ] Replace gravity-based physics with forward/backward acceleration
  - [ ] Implement angular velocity for steering (speed-dependent)
  - [ ] Add drift mechanics (reduce lateral friction on Space)
  - [ ] Replace capsule collision with box collision
  - [ ] Maintain ground detection for track adherence

- [ ] **Core Methods**
  - [ ] `update()` - main physics loop
  - [ ] `processKartPhysics()` - handle input and physics
  - [ ] `updateNetworkState()` - sync with network
  - [ ] `resetPosition()` - respawn functionality

### 1.2 Replace Input System
**File**: `packages/3d-web-client-core/src/input/KeyInputManager.ts`

- [ ] **Simplify getOutput()**
  - [ ] Remove all character-specific methods
  - [ ] Replace return type with `{throttle, steering, drift}` 
  - [ ] Map W/S to throttle (-1 to 1)
  - [ ] Map A/D to steering (-1 to 1)
  - [ ] Map Space to drift boolean

- [ ] **Remove Unused Code**
  - [ ] Remove character movement methods
  - [ ] Remove jump/sprint detection
  - [ ] Keep basic key handling infrastructure

### 1.3 Update CharacterManager
**File**: `packages/3d-web-client-core/src/character/CharacterManager.ts`

- [ ] **Simple Type Change**
  - [ ] Change import from LocalController to KartController
  - [ ] Change type: `public localController: KartController`
  - [ ] No other changes needed (same interface)

## Phase 2: Replace Visual System 🎨 MEDIUM PRIORITY

### 2.1 Create KartMesh
**File**: `packages/3d-web-client-core/src/character/KartMesh.ts`

- [ ] **Basic Kart Geometry**
  - [ ] Main body: BoxGeometry (1.8×0.6×1.2m)
  - [ ] 4 wheels: CylinderGeometry (0.25 radius)
  - [ ] Simple materials (blue body, black wheels)
  - [ ] Proper positioning and orientation

- [ ] **Animation Methods**
  - [ ] `updateVisuals(speed, steering, deltaTime)`
  - [ ] Wheel rotation based on speed
  - [ ] Front wheel steering rotation
  - [ ] Optional: subtle body lean during turns

### 2.2 Simplify Character Class
**File**: `packages/3d-web-client-core/src/character/Character.ts`

- [ ] **Remove Humanoid Code**
  - [ ] Remove model loading system
  - [ ] Remove animation system
  - [ ] Remove CharacterModel references

- [ ] **Always Use Kart**
  - [ ] Always create KartMesh in constructor
  - [ ] Update `update()` method for kart visuals
  - [ ] Keep tooltip system unchanged
  - [ ] Remove animation state management

## Phase 3: Optimize Camera 📷 MEDIUM PRIORITY

### 3.1 Enhance CameraManager
**File**: `packages/3d-web-client-core/src/camera/CameraManager.ts`

- [ ] **Set Kart-Optimized Defaults**
  - [ ] initialDistance: 8m (was 5m)
  - [ ] minDistance: 4m 
  - [ ] maxDistance: 15m
  - [ ] damping: 0.1 (more responsive)

- [ ] **Add Kart Camera Method**
  - [ ] `updateForKart(position, velocity)` method
  - [ ] Speed-responsive distance (4-15m range)
  - [ ] Look-ahead prediction based on velocity
  - [ ] Height offset (2.5m above kart)

- [ ] **Integration**
  - [ ] Call from CharacterManager update loop
  - [ ] Pass kart position and velocity data

## Phase 4: Simplify Network State 🌐 LOW PRIORITY

### 4.1 Update CharacterState
**File**: `packages/3d-web-client-core/src/character/CharacterState.ts`

- [ ] **Remove Animation State**
  - [ ] Remove AnimationState enum and references
  - [ ] Add velocity vector to state
  - [ ] Add speed and isDrifting properties
  - [ ] Maintain id, position, rotation

### 4.2 Update Network Integration
**Files**: `packages/3d-web-user-networking/src/*`

- [ ] **State Synchronization**
  - [ ] Update state encoding/decoding for new structure
  - [ ] Remove animation state sync
  - [ ] Add kart physics state sync
  - [ ] Test multiplayer kart interactions

## Phase 5: Update Configuration ⚙️ LOW PRIORITY

### 5.1 Update Client Config
**File**: `packages/3d-web-experience-client/src/Networked3dWebExperienceClient.ts`

- [ ] **Remove Unused Config**
  - [ ] Remove animationConfig option
  - [ ] Remove avatarConfiguration
  - [ ] Add optional kartConfiguration

### 5.2 Update Example
**File**: `example/multi-user-3d-web-experience/client/src/index.ts`

- [ ] **Simplify Configuration**
  - [ ] Remove animation asset imports
  - [ ] Remove animationConfig from client init
  - [ ] Update loading screen title
  - [ ] Add optional kart physics config

## Testing Checklist ✅

### Unit Tests
- [ ] **KartController Tests**
  - [ ] Physics calculations (acceleration, steering)
  - [ ] Speed limits and constraints
  - [ ] Drift mechanics
  - [ ] Collision response

- [ ] **Integration Tests**
  - [ ] KartController replaces LocalController seamlessly
  - [ ] Input processing works correctly
  - [ ] Camera updates smoothly
  - [ ] Network state synchronizes

### Manual Testing
- [ ] **Basic Functionality**
  - [ ] Spawn as kart
  - [ ] WASD controls work
  - [ ] Space drift works
  - [ ] Camera follows correctly

- [ ] **Multiplayer Testing**
  - [ ] Multiple karts spawn
  - [ ] Network sync works
  - [ ] Collisions work
  - [ ] Performance is acceptable

## Deployment Steps 🚀

### Pre-Deployment
- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Code review completed
- [ ] Remove unused assets

### Deployment
- [ ] Feature branch tested
- [ ] Deploy to staging environment
- [ ] Verify kart-only functionality
- [ ] Monitor performance

### Post-Deployment
- [ ] User feedback collection
- [ ] Performance monitoring
- [ ] Bug fixes as needed

## File Change Summary

### Modified Files (Direct Replacements)
- `KartController.ts` - NEW (replaces LocalController logic)
- `KeyInputManager.ts` - Simplified getOutput()
- `CharacterManager.ts` - Change import/type only
- `Character.ts` - Remove humanoid, always use kart
- `CameraManager.ts` - Add kart camera method
- `CharacterState.ts` - Remove animation state

### New Files
- `KartMesh.ts` - Simple cube kart with wheels

### Removed/Unused (Optional Cleanup)
- Animation assets (idle, jog, sprint, etc.)
- CharacterModel system (optional - can leave for future)
- Animation state enums

## Benefits of Simplified Approach

### Development Benefits
- **60% fewer changes** compared to dual-mode approach
- **Single code path** - easier to debug and maintain
- **Direct replacements** - cleaner diff, easier review
- **No conditional logic** - reduced complexity

### Performance Benefits
- **Smaller bundle** - remove unused humanoid assets
- **Better performance** - optimized for single use case
- **Faster loading** - fewer assets to download

### Risk Reduction
- **Simpler implementation** - fewer edge cases
- **Direct replacement pattern** - well-understood changes
- **No mode switching bugs** - eliminated entire category

This simplified approach transforms a complex "dual-mode system" into a straightforward "direct replacement" - much cleaner and faster to implement! 